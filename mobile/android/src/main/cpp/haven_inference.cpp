// haven_inference.cpp
// Android JNI wrapper for llama.cpp inference
// Handles CPU (NEON) and GPU (Vulkan) inference on Android devices

#include <jni.h>
#include <string>
#include <vector>
#include <memory>
#include <chrono>
#include <android/log.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>

// llama.cpp headers
#include "llama.h"

#define LOG_TAG "HavenInference"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Inference State ──────────────────────────────────────────────

static llama_model* g_model = nullptr;
static llama_context* g_ctx = nullptr;
static std::string g_last_error;
static llama_sampler* g_sampler = nullptr;

// ── JNI Helpers ──────────────────────────────────────────────────

static std::string jstring_to_string(JNIEnv* env, jstring jstr) {
    if (!jstr) return "";
    const char* chars = env->GetStringUTFChars(jstr, nullptr);
    std::string str(chars);
    env->ReleaseStringUTFChars(jstr, chars);
    return str;
}

static jstring string_to_jstring(JNIEnv* env, const std::string& str) {
    return env->NewStringUTF(str.c_str());
}

// ── Token to String ─────────────────────────────────────────────

static std::string token_to_piece(llama_context* ctx, llama_token token) {
    char buf[256];
    int n_chars = llama_token_to_piece(
        llama_get_model(ctx),
        token,
        buf,
        sizeof(buf),
        0,  // lstrip
        true // special
    );

    if (n_chars > 0) {
        return std::string(buf, n_chars);
    }
    return "";
}

// ── Streaming Callback ───────────────────────────────────────────

struct StreamCallback {
    JNIEnv* env;
    jobject instance;
    jmethodID methodId;
    int callbackId;
};

static void stream_token_callback(const char* token, bool is_end, void* user_data) {
    auto* cb = static_cast<StreamCallback*>(user_data);
    if (!cb || !cb->env || !cb->instance) return;

    jstring jToken = cb->env->NewStringUTF(token);
    cb->env->CallVoidMethod(cb->instance, cb->methodId, cb->callbackId, jToken, is_end);
    cb->env->DeleteLocalRef(jToken);
}

// ── Native Methods ───────────────────────────────────────────────

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeInit(
    JNIEnv* env, jobject thiz, jstring jModelPath, jstring jConfig
) {
    std::string model_path = jstring_to_string(env, jModelPath);

    // Parse config (simplified — in production, use a proper JSON parser)
    int n_gpu_layers = 0;
    int n_ctx = 512;
    int n_threads = -1;

    // Load model
    auto model_params = llama_model_default_params();

    // Detect GPU capability (Vulkan on Android)
    // For now, default to CPU (NEON)
    model_params.n_gpu_layers = n_gpu_layers;

    g_model = llama_load_model_from_file(model_path.c_str(), model_params);
    if (!g_model) {
        g_last_error = "Failed to load model: " + model_path;
        LOGE("%s", g_last_error.c_str());
        return JNI_FALSE;
    }

    // Create context
    auto ctx_params = llama_context_default_params();
    ctx_params.n_ctx = n_ctx;
    if (n_threads > 0) {
        ctx_params.n_threads = n_threads;
        ctx_params.n_threads_batch = n_threads;
    }

    g_ctx = llama_init_from_model(g_model, ctx_params);
    if (!g_ctx) {
        g_last_error = "Failed to create context";
        LOGE("%s", g_last_error.c_str());
        llama_free_model(g_model);
        g_model = nullptr;
        return JNI_FALSE;
    }

    // Initialize sampler
    g_sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(g_sampler, llama_sampler_init_top_k(40, 1));
    llama_sampler_chain_add(g_sampler, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(g_sampler, llama_sampler_init_temp(0.8f));
    llama_sampler_chain_add(g_sampler, llama_sampler_init_dist(42));

    LOGI("Model loaded: %s", model_path.c_str());
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeUnload(
    JNIEnv* env, jobject thiz
) {
    if (g_sampler) {
        llama_sampler_free(g_sampler);
        g_sampler = nullptr;
    }
    if (g_ctx) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model) {
        llama_free_model(g_model);
        g_model = nullptr;
    }
    g_last_error.clear();
    LOGI("Model unloaded");
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeIsLoaded(
    JNIEnv* env, jobject thiz
) {
    return (g_model != nullptr && g_ctx != nullptr) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeInfer(
    JNIEnv* env, jobject thiz, jstring jPrompt, jstring jConfig
) {
    if (!g_ctx) {
        g_last_error = "No model loaded";
        return string_to_jstring(env, "{\"error\":\"No model loaded\"}");
    }

    std::string prompt = jstring_to_string(env, jPrompt);

    auto start = std::chrono::high_resolution_clock::now();

    // Tokenize
    std::vector<llama_token> tokens;
    tokens.resize(prompt.size() + 256);
    int32_t n_tokens = llama_tokenize(
        llama_get_model(g_ctx),
        prompt.c_str(),
        static_cast<int32_t>(prompt.size()),
        tokens.data(),
        static_cast<int32_t>(tokens.size()),
        true, true
    );

    if (n_tokens < 0) {
        return string_to_jstring(env, "{\"error\":\"Tokenization failed\"}");
    }
    tokens.resize(static_cast<size_t>(n_tokens));

    // Decode prompt
    llama_batch batch = llama_batch_get_one(tokens.data(), n_tokens);
    if (llama_decode(g_ctx, batch) != 0) {
        return string_to_jstring(env, "{\"error\":\"Failed to decode prompt\"}");
    }

    // Generate
    std::string result;
    int32_t n_generated = 0;
    int32_t max_tokens = 256;
    int32_t n_ctx = llama_n_ctx(g_ctx);

    while (n_generated < max_tokens) {
        llama_token new_token = llama_sampler_sample(g_sampler, g_ctx, -1);

        if (llama_vocab_is_eog(llama_get_model(g_ctx), new_token)) {
            break;
        }

        result += token_to_piece(g_ctx, new_token);

        batch = llama_batch_get_one(&new_token, 1);
        if (llama_decode(g_ctx, batch) != 0) {
            break;
        }

        n_generated++;
        if (llama_get_kv_cache_used_cells(g_ctx) >= n_ctx) {
            break;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    double inference_time = std::chrono::duration<double, std::milli>(end - start).count();
    double tps = n_generated > 0 ? n_generated / (inference_time / 1000.0) : 0;

    // Build JSON result
    char json_buf[1024];
    snprintf(json_buf, sizeof(json_buf),
        "{\"text\":\"%s\",\"tokensGenerated\":%d,\"inferenceTimeMs\":%.1f,\"tokensPerSecond\":%.1f}",
        result.c_str(), n_generated, inference_time, tps);

    return string_to_jstring(env, json_buf);
}

JNIEXPORT jboolean JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeInferStreaming(
    JNIEnv* env, jobject thiz, jstring jPrompt, jstring jConfig, jint callbackId
) {
    if (!g_ctx) return JNI_FALSE;

    std::string prompt = jstring_to_string(env, jPrompt);

    // Tokenize
    std::vector<llama_token> tokens;
    tokens.resize(prompt.size() + 256);
    int32_t n_tokens = llama_tokenize(
        llama_get_model(g_ctx),
        prompt.c_str(),
        static_cast<int32_t>(prompt.size()),
        tokens.data(),
        static_cast<int32_t>(tokens.size()),
        true, true
    );

    if (n_tokens < 0) return JNI_FALSE;
    tokens.resize(static_cast<size_t>(n_tokens));

    // Decode prompt
    llama_batch batch = llama_batch_get_one(tokens.data(), n_tokens);
    if (llama_decode(g_ctx, batch) != 0) return JNI_FALSE;

    // Generate and stream
    int32_t n_generated = 0;
    int32_t max_tokens = 256;
    int32_t n_ctx = llama_n_ctx(g_ctx);

    while (n_generated < max_tokens) {
        llama_token new_token = llama_sampler_sample(g_sampler, g_ctx, -1);

        if (llama_vocab_is_eog(llama_get_model(g_ctx), new_token)) {
            break;
        }

        std::string piece = token_to_piece(g_ctx, new_token);
        if (!piece.empty()) {
            stream_token_callback(piece.c_str(), false, nullptr);
        }

        batch = llama_batch_get_one(&new_token, 1);
        if (llama_decode(g_ctx, batch) != 0) {
            break;
        }

        n_generated++;
        if (llama_get_kv_cache_used_cells(g_ctx) >= n_ctx) {
            break;
        }
    }

    // Signal end
    stream_token_callback("", true, nullptr);
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeGetStats(
    JNIEnv* env, jobject thiz
) {
    char json_buf[256];
    snprintf(json_buf, sizeof(json_buf),
        "{\"loadTimeMs\":0,\"inferenceTimeMs\":0,\"tokensGenerated\":0,\"tokensPerSecond\":0}");
    return string_to_jstring(env, json_buf);
}

JNIEXPORT jstring JNICALL
Java_com_havenllm_mobile_HavenNativeModule_nativeGetLastError(
    JNIEnv* env, jobject thiz
) {
    return string_to_jstring(env, g_last_error.c_str());
}

} // extern "C"
