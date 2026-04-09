#include "haven_core.h"
#include "llama.h"
#include <chrono>
#include <cstring>
#include <iostream>
#include <sstream>

namespace haven {

// ── Internal implementation ────────────────────────────────────

struct LlamaCppEngineImpl {
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
    ModelInfo model_info;
    InferenceStats stats;
    bool loaded = false;
    std::string last_error;
};

// ── Helper: build context params from config ───────────────────
static llama_context_params buildContextParams(const InferenceConfig& config) {
    auto params = llama_context_default_params();

    params.n_ctx = config.n_ctx;
    params.n_batch = config.n_batch;

    // Thread count: -1 = auto (use llama.cpp default)
    if (config.n_threads > 0) {
        params.n_threads = config.n_threads;
        params.n_threads_batch = config.n_threads;
    }

    // GPU layers
    params.n_gpu_layers = config.n_gpu_layers;

    return params;
}

// ── Helper: safe string conversion ─────────────────────────────
static std::string safeTokenToString(llama_context* ctx, llama_token token) {
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

// ── InferenceEngine implementation ─────────────────────────────

class LlamaCppEngine : public InferenceEngine {
public:
    LlamaCppEngine() : impl_(new LlamaCppEngineImpl()) {}

    ~LlamaCppEngine() override {
        unloadModel();
    }

    bool loadModel(const std::string& model_path, const InferenceConfig& config) override {
        if (impl_->loaded) {
            unloadModel();
        }

        auto start = std::chrono::high_resolution_clock::now();

        // Initialize llama.cpp backend
        llama_backend_init();

        // Load model
        auto model_params = llama_model_default_params();
        model_params.n_gpu_layers = config.n_gpu_layers;

        // Multi-GPU tensor split
        if (config.multi_gpu && !config.tensor_split.empty()) {
            model_params.tensor_split = config.tensor_split.data();
            model_params.main_gpu = config.main_gpu;
        }

        impl_->model = llama_load_model_from_file(model_path.c_str(), model_params);
        if (!impl_->model) {
            impl_->last_error = "Failed to load model: " + model_path;
            std::cerr << "[Haven] " << impl_->last_error << std::endl;
            return false;
        }

        // Create context
        auto ctx_params = buildContextParams(config);
        impl_->ctx = llama_init_from_model(impl_->model, ctx_params);
        if (!impl_->ctx) {
            impl_->last_error = "Failed to create context";
            std::cerr << "[Haven] " << impl_->last_error << std::endl;
            llama_free_model(impl_->model);
            impl_->model = nullptr;
            return false;
        }

        // Populate model info
        impl_->model_info.path = model_path;

        // Extract filename
        size_t pos = model_path.find_last_of("/\\");
        impl_->model_info.name = (pos != std::string::npos) ? model_path.substr(pos + 1) : model_path;

        impl_->model_info.type = "GGUF";
        impl_->model_info.size_bytes = 0; // Would need filesystem query
        impl_->model_info.n_params = llama_model_n_params(impl_->model);

        // Get architecture string
        char arch_buf[256];
        llama_model_desc(impl_->model, arch_buf, sizeof(arch_buf));
        impl_->model_info.architecture = arch_buf;

        auto end = std::chrono::high_resolution_clock::now();
        impl_->stats.load_time_ms = std::chrono::duration<double, std::milli>(end - start).count();
        impl_->loaded = true;

        std::cout << "[Haven] Model loaded: " << impl_->model_info.name
                  << " (" << impl_->model_info.architecture
                  << ", " << impl_->model_info.n_params << " params)"
                  << " in " << impl_->stats.load_time_ms << "ms" << std::endl;

        return true;
    }

    void unloadModel() override {
        if (impl_->ctx) {
            llama_free(impl_->ctx);
            impl_->ctx = nullptr;
        }
        if (impl_->model) {
            llama_free_model(impl_->model);
            impl_->model = nullptr;
        }
        impl_->loaded = false;
        impl_->last_error.clear();
    }

    bool isModelLoaded() const override {
        return impl_->loaded && impl_->ctx != nullptr && impl_->model != nullptr;
    }

    ModelInfo getModelInfo() const override {
        return impl_->model_info;
    }

    std::string infer(const std::string& prompt, const InferenceConfig& config) override {
        if (!impl_->ctx) {
            impl_->last_error = "No model loaded";
            return "";
        }

        auto start = std::chrono::high_resolution_clock::now();

        // Tokenize prompt
        std::vector<llama_token> tokens;
        tokens.resize(prompt.size() + 256); // Over-allocate
        int32_t n_tokens = llama_tokenize(
            llama_get_model(impl_->ctx),
            prompt.c_str(),
            static_cast<int32_t>(prompt.size()),
            tokens.data(),
            static_cast<int32_t>(tokens.size()),
            true,  // add_special
            true   // parse_special
        );

        if (n_tokens < 0) {
            impl_->last_error = "Tokenization failed";
            std::cerr << "[Haven] " << impl_->last_error << std::endl;
            return "";
        }
        tokens.resize(static_cast<size_t>(n_tokens));

        // Initialize sampler chain
        struct llama_sampler* smpl = llama_sampler_chain_init(
            llama_sampler_chain_default_params()
        );

        // Add samplers in order: top_k → top_p → temperature → distribution
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(config.top_k, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(config.top_p, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(config.temperature));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(42)); // RNG seed

        // Decode prompt (prefill)
        llama_batch batch = llama_batch_get_one(tokens.data(), n_tokens);
        if (llama_decode(impl_->ctx, batch) != 0) {
            impl_->last_error = "Failed to decode prompt";
            std::cerr << "[Haven] " << impl_->last_error << std::endl;
            llama_sampler_free(smpl);
            return "";
        }

        // Generate tokens
        std::string result;
        int32_t n_generated = 0;
        int32_t n_ctx = llama_n_ctx(impl_->ctx);

        while (n_generated < config.max_tokens) {
            // Sample next token
            llama_token new_token = llama_sampler_sample(smpl, impl_->ctx, -1);

            // Check for end of generation
            if (llama_vocab_is_eog(llama_get_model(impl_->ctx), new_token)) {
                break;
            }

            // Convert token to string
            std::string piece = safeTokenToString(impl_->ctx, new_token);
            result += piece;

            // Decode generated token
            batch = llama_batch_get_one(&new_token, 1);
            if (llama_decode(impl_->ctx, batch) != 0) {
                break;
            }

            n_generated++;

            // Check context limit
            if (llama_get_kv_cache_used_cells(impl_->ctx) >= n_ctx) {
                break;
            }
        }

        llama_sampler_free(smpl);

        auto end = std::chrono::high_resolution_clock::now();
        double inference_time = std::chrono::duration<double, std::milli>(end - start).count();

        impl_->stats.inference_time_ms = inference_time;
        impl_->stats.tokens_generated = n_generated;
        impl_->stats.tokens_per_second = n_generated > 0 ?
            n_generated / (inference_time / 1000.0) : 0;

        return result;
    }

    void inferStreaming(
        const std::string& prompt,
        const InferenceConfig& config,
        TokenCallback callback
    ) override {
        if (!impl_->ctx) {
            callback("", true);
            return;
        }

        auto start = std::chrono::high_resolution_clock::now();

        // Tokenize prompt
        std::vector<llama_token> tokens;
        tokens.resize(prompt.size() + 256);
        int32_t n_tokens = llama_tokenize(
            llama_get_model(impl_->ctx),
            prompt.c_str(),
            static_cast<int32_t>(prompt.size()),
            tokens.data(),
            static_cast<int32_t>(tokens.size()),
            true,
            true
        );

        if (n_tokens < 0) {
            callback("", true);
            return;
        }
        tokens.resize(static_cast<size_t>(n_tokens));

        // Sampler setup
        struct llama_sampler* smpl = llama_sampler_chain_init(
            llama_sampler_chain_default_params()
        );
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(config.top_k, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(config.top_p, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(config.temperature));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(42));

        // Decode prompt
        llama_batch batch = llama_batch_get_one(tokens.data(), n_tokens);
        if (llama_decode(impl_->ctx, batch) != 0) {
            llama_sampler_free(smpl);
            callback("", true);
            return;
        }

        // Generate and stream tokens
        int32_t n_generated = 0;
        int32_t n_ctx = llama_n_ctx(impl_->ctx);

        while (n_generated < config.max_tokens) {
            llama_token new_token = llama_sampler_sample(smpl, impl_->ctx, -1);

            if (llama_vocab_is_eog(llama_get_model(impl_->ctx), new_token)) {
                break;
            }

            std::string piece = safeTokenToString(impl_->ctx, new_token);
            if (!piece.empty()) {
                callback(piece, false);
            }

            batch = llama_batch_get_one(&new_token, 1);
            if (llama_decode(impl_->ctx, batch) != 0) {
                break;
            }

            n_generated++;

            if (llama_get_kv_cache_used_cells(impl_->ctx) >= n_ctx) {
                break;
            }
        }

        llama_sampler_free(smpl);

        auto end = std::chrono::high_resolution_clock::now();
        impl_->stats.inference_time_ms = std::chrono::duration<double, std::milli>(end - start).count();
        impl_->stats.tokens_generated = n_generated;

        callback("", true);
    }

    EmbeddingResult embed(const std::string& text) override {
        EmbeddingResult result;

        if (!impl_->ctx) {
            return result;
        }

        auto start = std::chrono::high_resolution_clock::now();

        // Tokenize input
        std::vector<llama_token> tokens;
        tokens.resize(text.size() + 256);
        int32_t n_tokens = llama_tokenize(
            llama_get_model(impl_->ctx),
            text.c_str(),
            static_cast<int32_t>(text.size()),
            tokens.data(),
            static_cast<int32_t>(tokens.size()),
            true,
            true
        );

        if (n_tokens < 0) {
            return result;
        }
        tokens.resize(static_cast<size_t>(n_tokens));

        // Decode
        llama_batch batch = llama_batch_get_one(tokens.data(), n_tokens);
        if (llama_decode(impl_->ctx, batch) != 0) {
            return result;
        }

        // Get embedding dimension
        const int32_t n_embd = llama_model_n_embd(llama_get_model(impl_->ctx));
        std::vector<float> embedding(static_cast<size_t>(n_embd), 0.0f);

        // Get embeddings from the sequence
        const float* embd = llama_get_embeddings_seq(impl_->ctx);
        if (embd) {
            std::copy(embd, embd + n_embd, embedding.begin());
        }

        // Normalize the embedding
        float norm = 0.0f;
        for (float v : embedding) norm += v * v;
        norm = std::sqrt(norm);
        if (norm > 0) {
            for (float& v : embedding) v /= norm;
        }

        auto end = std::chrono::high_resolution_clock::now();

        result.embedding = embedding;
        result.tokens_processed = n_tokens;
        result.compute_time_ms = std::chrono::duration<double, std::milli>(end - start).count();

        return result;
    }

    InferenceStats getStats() const override {
        return impl_->stats;
    }

    void resetStats() override {
        impl_->stats = InferenceStats{};
    }

    const std::string& getLastError() const {
        return impl_->last_error;
    }

private:
    std::unique_ptr<LlamaCppEngineImpl> impl_;
};

// ── Factory function ───────────────────────────────────────────
std::unique_ptr<InferenceEngine> createLlamaCppEngine() {
    return std::make_unique<LlamaCppEngine>();
}

} // namespace haven
