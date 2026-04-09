#ifndef HAVEN_CORE_H
#define HAVEN_CORE_H

#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <unordered_map>

namespace haven {

// Inference configuration
struct InferenceConfig {
    int32_t n_ctx = 512;           // Context size
    int32_t n_batch = 512;         // Batch size
    int32_t n_threads = -1;        // CPU threads (-1 = auto)
    int32_t n_gpu_layers = 0;      // GPU offload layers
    float temperature = 0.8f;
    int32_t top_k = 40;
    float top_p = 0.9f;
    float repeat_penalty = 1.1f;
    int32_t max_tokens = 256;

    // Multi-GPU
    bool multi_gpu = false;
    std::vector<int32_t> tensor_split;  // VRAM split ratios per GPU
    int32_t main_gpu = 0;
};

// Model metadata
struct ModelInfo {
    std::string path;
    std::string name;
    std::string type;  // GGUF, GPTQ, etc.
    size_t size_bytes;
    int32_t n_params;
    std::string architecture;
    std::vector<std::string> supported_features;
};

// Token callback for streaming
using TokenCallback = std::function<void(const std::string& token, bool is_end)>;

// Inference statistics
struct InferenceStats {
    double load_time_ms;
    double inference_time_ms;
    int32_t tokens_generated;
    double tokens_per_second;
    size_t memory_used_bytes;
};

// Embedding result
struct EmbeddingResult {
    std::vector<float> embedding;
    int32_t tokens_processed;
    double compute_time_ms;
};

// Main inference engine interface
class InferenceEngine {
public:
    virtual ~InferenceEngine() = default;
    
    // Load model from path
    virtual bool loadModel(const std::string& model_path, const InferenceConfig& config) = 0;
    
    // Unload current model
    virtual void unloadModel() = 0;
    
    // Check if model is loaded
    virtual bool isModelLoaded() const = 0;
    
    // Get model info
    virtual ModelInfo getModelInfo() const = 0;
    
    // Run inference (blocking)
    virtual std::string infer(const std::string& prompt, const InferenceConfig& config) = 0;
    
    // Run inference (streaming)
    virtual void inferStreaming(
        const std::string& prompt,
        const InferenceConfig& config,
        TokenCallback callback
    ) = 0;

    // Generate embeddings
    virtual EmbeddingResult embed(const std::string& text) = 0;

    // Get current stats
    virtual InferenceStats getStats() const = 0;
    
    // Reset stats
    virtual void resetStats() = 0;

    // Get last error message
    virtual const std::string& getLastError() const = 0;
};

// Factory function to create llama.cpp backend
std::unique_ptr<InferenceEngine> createLlamaCppEngine();

} // namespace haven

#endif // HAVEN_CORE_H
