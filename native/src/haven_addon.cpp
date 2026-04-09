/**
 * Haven N-API Bridge
 * Node.js native addon binding C++ inference engine to TypeScript
 */

#include <napi.h>
#include "haven_core.h"
#include <memory>
#include <mutex>
#include <atomic>
#include <thread>
#include <functional>

namespace haven {

class HavenAddon : public Napi::ObjectWrap<HavenAddon> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    HavenAddon(const Napi::CallbackInfo& info);

private:
    Napi::Value LoadModel(const Napi::CallbackInfo& info);
    Napi::Value UnloadModel(const Napi::CallbackInfo& info);
    Napi::Value IsModelLoaded(const Napi::CallbackInfo& info);
    Napi::Value GetModelInfo(const Napi::CallbackInfo& info);
    Napi::Value Infer(const Napi::CallbackInfo& info);
    Napi::Value InferStreaming(const Napi::CallbackInfo& info);
    Napi::Value Embed(const Napi::CallbackInfo& info);
    Napi::Value GetStats(const Napi::CallbackInfo& info);
    Napi::Value ResetStats(const Napi::CallbackInfo& info);
    Napi::Value GetLastError(const Napi::CallbackInfo& info);

    InferenceConfig parseConfig(const Napi::Object& obj);

    std::unique_ptr<InferenceEngine> engine_;
    std::mutex infer_mutex_;
    std::atomic<bool> infer_running_{false};
};

Napi::Object HavenAddon::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "HavenAddon", {
        InstanceMethod("loadModel", &HavenAddon::LoadModel),
        InstanceMethod("unloadModel", &HavenAddon::UnloadModel),
        InstanceMethod("isModelLoaded", &HavenAddon::IsModelLoaded),
        InstanceMethod("getModelInfo", &HavenAddon::GetModelInfo),
        InstanceMethod("infer", &HavenAddon::Infer),
        InstanceMethod("inferStreaming", &HavenAddon::InferStreaming),
        InstanceMethod("embed", &HavenAddon::Embed),
        InstanceMethod("getStats", &HavenAddon::GetStats),
        InstanceMethod("resetStats", &HavenAddon::ResetStats),
        InstanceMethod("getLastError", &HavenAddon::GetLastError),
    });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("HavenAddon", func);
    return exports;
}

HavenAddon::HavenAddon(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<HavenAddon>(info) {
    engine_ = createLlamaCppEngine();
}

InferenceConfig HavenAddon::parseConfig(const Napi::Object& obj) {
    InferenceConfig config;

    if (obj.Has("n_ctx"))
        config.n_ctx = obj.Get("n_ctx").As<Napi::Number>().Int32Value();
    if (obj.Has("n_batch"))
        config.n_batch = obj.Get("n_batch").As<Napi::Number>().Int32Value();
    if (obj.Has("n_threads"))
        config.n_threads = obj.Get("n_threads").As<Napi::Number>().Int32Value();
    if (obj.Has("n_gpu_layers"))
        config.n_gpu_layers = obj.Get("n_gpu_layers").As<Napi::Number>().Int32Value();
    if (obj.Has("temperature"))
        config.temperature = obj.Get("temperature").As<Napi::Number>().FloatValue();
    if (obj.Has("top_k"))
        config.top_k = obj.Get("top_k").As<Napi::Number>().Int32Value();
    if (obj.Has("top_p"))
        config.top_p = obj.Get("top_p").As<Napi::Number>().FloatValue();
    if (obj.Has("repeat_penalty"))
        config.repeat_penalty = obj.Get("repeat_penalty").As<Napi::Number>().FloatValue();
    if (obj.Has("max_tokens"))
        config.max_tokens = obj.Get("max_tokens").As<Napi::Number>().Int32Value();

    // Multi-GPU
    if (obj.Has("multi_gpu"))
        config.multi_gpu = obj.Get("multi_gpu").As<Napi::Boolean>().Value();
    if (obj.Has("main_gpu"))
        config.main_gpu = obj.Get("main_gpu").As<Napi::Number>().Int32Value();
    if (obj.Has("tensor_split")) {
        Napi::Array tsArray = obj.Get("tensor_split").As<Napi::Array>();
        uint32_t len = tsArray.Length();
        config.tensor_split.reserve(len);
        for (uint32_t i = 0; i < len; i++) {
            config.tensor_split.push_back(
                tsArray.Get(i).As<Napi::Number>().FloatValue()
            );
        }
    }

    return config;
}

Napi::Value HavenAddon::LoadModel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected model_path and config").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string model_path = info[0].As<Napi::String>().Utf8Value();
    Napi::Object config_obj = info[1].As<Napi::Object>();
    InferenceConfig config = parseConfig(config_obj);

    bool success = engine_->loadModel(model_path, config);
    return Napi::Boolean::New(env, success);
}

Napi::Value HavenAddon::UnloadModel(const Napi::CallbackInfo& info) {
    engine_->unloadModel();
    return info.Env().Undefined();
}

Napi::Value HavenAddon::IsModelLoaded(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), engine_->isModelLoaded());
}

Napi::Value HavenAddon::GetModelInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!engine_->isModelLoaded()) {
        Napi::Error::New(env, "No model loaded").ThrowAsJavaScriptException();
        return env.Null();
    }

    ModelInfo model_info = engine_->getModelInfo();

    Napi::Object result = Napi::Object::New(env);
    result.Set("path", model_info.path);
    result.Set("name", model_info.name);
    result.Set("type", model_info.type);
    result.Set("sizeBytes", (double)model_info.size_bytes);
    result.Set("nParams", model_info.n_params);
    result.Set("architecture", model_info.architecture);

    return result;
}

Napi::Value HavenAddon::Infer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected prompt and options").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!engine_->isModelLoaded()) {
        Napi::Error::New(env, "No model loaded").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string prompt = info[0].As<Napi::String>().Utf8Value();
    Napi::Object options_obj = info[1].As<Napi::Object>();
    InferenceConfig config = parseConfig(options_obj);

    std::string result_text = engine_->infer(prompt, config);
    InferenceStats stats = engine_->getStats();

    Napi::Object result = Napi::Object::New(env);
    result.Set("text", result_text);
    result.Set("tokensGenerated", stats.tokens_generated);
    result.Set("inferenceTimeMs", stats.inference_time_ms);
    result.Set("tokensPerSecond", stats.tokens_per_second);

    return result;
}

Napi::Value HavenAddon::InferStreaming(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected prompt, options, and callback").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!engine_->isModelLoaded()) {
        Napi::Error::New(env, "No model loaded").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool expected = false;
    if (!infer_running_.compare_exchange_strong(expected, true)) {
        Napi::Error::New(env, "Inference already running").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string prompt = info[0].As<Napi::String>().Utf8Value();
    Napi::Object options_obj = info[1].As<Napi::Object>();
    Napi::Function callback = info[2].As<Napi::Function>();
    InferenceConfig config = parseConfig(options_obj);

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // Run in background thread to not block event loop
    std::thread([this, prompt, config, callback, deferred]() mutable {
        std::lock_guard<std::mutex> lock(infer_mutex_);

        try {
            engine_->inferStreaming(prompt, config, [&](const std::string& token, bool is_end) {
                // Call JS callback - use TSFN for thread safety in production
                callback.Call({
                    Napi::String::New(callback.Env(), token),
                    Napi::Boolean::New(callback.Env(), is_end)
                });
            });
        } catch (const std::exception& e) {
            deferred.Reject(Napi::Error::New(callback.Env(), e.what()).Value());
            infer_running_ = false;
            return;
        }

        infer_running_ = false;
        deferred.Resolve(Napi::Boolean::New(callback.Env(), true));
    }).detach();

    return deferred.Promise();
}

Napi::Value HavenAddon::Embed(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected text input").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!engine_->isModelLoaded()) {
        Napi::Error::New(env, "No model loaded").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string text = info[0].As<Napi::String>().Utf8Value();

    EmbeddingResult result = engine_->embed(text);

    Napi::Array embedding = Napi::Array::New(env, result.embedding.size());
    for (size_t i = 0; i < result.embedding.size(); i++) {
        embedding.Set(i, Napi::Number::New(env, result.embedding[i]));
    }

    Napi::Object output = Napi::Object::New(env);
    output.Set("embedding", embedding);
    output.Set("tokensProcessed", result.tokens_processed);
    output.Set("computeTimeMs", result.compute_time_ms);

    return output;
}

Napi::Value HavenAddon::GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    InferenceStats stats = engine_->getStats();

    Napi::Object result = Napi::Object::New(env);
    result.Set("loadTimeMs", stats.load_time_ms);
    result.Set("inferenceTimeMs", stats.inference_time_ms);
    result.Set("tokensGenerated", stats.tokens_generated);
    result.Set("tokensPerSecond", stats.tokens_per_second);
    result.Set("memoryUsedBytes", (double)stats.memory_used_bytes);

    return result;
}

Napi::Value HavenAddon::ResetStats(const Napi::CallbackInfo& info) {
    engine_->resetStats();
    return info.Env().Undefined();
}

Napi::Value HavenAddon::GetLastError(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), engine_->getLastError());
}

// Module initialization
NAPI_MODULE_INIT() {
    return HavenAddon::Init(env, exports);
}

} // namespace haven
