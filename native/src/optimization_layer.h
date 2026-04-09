#ifndef HAVEN_OPTIMIZATION_LAYER_H
#define HAVEN_OPTIMIZATION_LAYER_H

#include "haven_core.h"
#include <memory>
#include <vector>
#include <string>

namespace haven {

// GPU device information
struct GPUDevice {
    int32_t device_id;
    std::string name;
    std::string vendor;  // "nvidia", "amd", "intel", "apple", "qualcomm"
    size_t vram_bytes;
    size_t vram_used_bytes;
    float temperature_c;
    float utilization_percent;
    bool is_active;
    bool is_integrated;  // iGPU shares system RAM
    size_t shared_ram_reserved;  // For iGPUs: max RAM they can use
};

// Hardware capabilities
struct HardwareCaps {
    // CPU
    bool has_avx2 = false;
    bool has_avx512 = false;
    bool has_neon = false;
    bool is_arm = false;
    int32_t cpu_cores = 0;
    std::string cpu_name;
    std::string cpu_arch;  // "x86_64", "aarch64", "armv7l"

    // GPU backends
    bool has_cuda = false;
    bool has_rocm = false;
    bool has_metal = false;
    bool has_vulkan = false;

    // GPU devices
    std::vector<GPUDevice> gpus;
    bool has_igpu = false;
    GPUDevice* active_igpu = nullptr;

    // Memory
    size_t total_ram_bytes = 0;
    size_t available_ram_bytes = 0;

    // Active backend
    std::string active_backend;  // "cuda", "rocm", "metal", "vulkan", "neon", "avx2", "cpu"
};

// Multi-GPU configuration
struct MultiGPUConfig {
    enum Strategy {
        LAYER_SPLIT,    // Split model layers across GPUs
        TENSOR_PARALLEL, // Split tensors across GPUs (requires NCCL/RCCL)
        PIPELINE,        // Pipeline parallelism
    };

    Strategy strategy = LAYER_SPLIT;
    std::vector<int32_t> gpu_ids;
    std::vector<int32_t> layers_per_gpu;
    int32_t main_gpu = 0;
    bool enabled = false;
};

// Optimization recommendations
struct OptimizationRecommendations {
    int32_t recommended_n_gpu_layers;
    int32_t recommended_n_threads;
    int32_t recommended_n_batch;
    int32_t recommended_n_ctx;
    std::string recommended_quantization;
    std::string recommended_backend;
    MultiGPUConfig multi_gpu;
    std::string notes;
};

class OptimizationLayer {
public:
    static OptimizationLayer& getInstance();

    // Detect hardware capabilities
    HardwareCaps detectHardware();

    // Get recommendations for optimal settings
    OptimizationRecommendations getRecommendations(
        const HardwareCaps& caps,
        const ModelInfo& model
    );

    // Apply optimizations to config
    InferenceConfig applyOptimizations(
        InferenceConfig config,
        const HardwareCaps& caps,
        const ModelInfo& model
    );

    // Get multi-GPU recommendations
    MultiGPUConfig getMultiGPUConfig(
        const HardwareCaps& caps,
        const ModelInfo& model
    );

    // Get iGPU-specific layer offloading strategy
    struct IGPURecommendation {
        int32_t n_gpu_layers;
        size_t reserved_ram_bytes;
        int32_t recommended_batch;
        int32_t recommended_ctx;
        std::string notes;
    };
    IGPURecommendation getIGPURecommendation(
        const HardwareCaps& caps,
        const ModelInfo& model
    );

    // Get current hardware caps (cached)
    const HardwareCaps& getCurrentCaps() const { return current_caps_; }

    // Get available GPU backends
    std::vector<std::string> getAvailableBackends() const;

private:
    OptimizationLayer() = default;
    HardwareCaps current_caps_;

    void detectCPU(HardwareCaps& caps);
    void detectGPU(HardwareCaps& caps);
    void detectMemory(HardwareCaps& caps);
    void detectAVX512(HardwareCaps& caps);
    void detectAVX2(HardwareCaps& caps);
    void detectARM(HardwareCaps& caps);
    void detectIGPU(HardwareCaps& caps);
    void detectCUDA(HardwareCaps& caps);
    void detectROCm(HardwareCaps& caps);
    void detectMetal(HardwareCaps& caps);
    void detectVulkan(HardwareCaps& caps);
};

} // namespace haven

#endif // HAVEN_OPTIMIZATION_LAYER_H
