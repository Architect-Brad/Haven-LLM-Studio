#include "optimization_layer.h"
#include <thread>
#include <algorithm>
#include <cmath>

#ifdef _WIN32
    #include <windows.h>
    #include <intrin.h>
#elif defined(__linux__)
    #include <fstream>
    #include <sstream>
#elif defined(__APPLE__)
    #include <sys/sysctl.h>
#endif

namespace haven {

OptimizationLayer& OptimizationLayer::getInstance() {
    static OptimizationLayer instance;
    return instance;
}

HardwareCaps OptimizationLayer::detectHardware() {
    HardwareCaps caps;

    detectCPU(caps);
    detectARM(caps);
    if (!caps.is_arm) {
        detectAVX2(caps);
        detectAVX512(caps);
    }
    detectGPU(caps);
    detectIGPU(caps);
    detectMemory(caps);

    // Determine active backend
    if (caps.has_cuda && !caps.gpus.empty()) {
        caps.active_backend = "cuda";
    } else if (caps.has_rocm && !caps.gpus.empty()) {
        caps.active_backend = "rocm";
    } else if (caps.has_metal && !caps.gpus.empty()) {
        caps.active_backend = "metal";
    } else if (caps.has_vulkan && !caps.gpus.empty()) {
        caps.active_backend = "vulkan";
    } else if (caps.has_neon) {
        caps.active_backend = "neon";
    } else if (caps.has_avx512) {
        caps.active_backend = "avx512";
    } else if (caps.has_avx2) {
        caps.active_backend = "avx2";
    } else {
        caps.active_backend = "cpu";
    }

    current_caps_ = caps;
    return caps;
}

OptimizationRecommendations OptimizationLayer::getRecommendations(
    const HardwareCaps& caps,
    const ModelInfo& model
) {
    OptimizationRecommendations rec;

    // ── Thread recommendation ──────────────────────────────────
    // Use physical cores, leave 1 for OS
    rec.recommended_n_threads = std::max(1, caps.cpu_cores - 1);

    // ── Backend recommendation ─────────────────────────────────
    rec.recommended_backend = caps.active_backend;

    // ── GPU layer recommendation ───────────────────────────────
    // Check if we're on an iGPU
    if (caps.has_igpu && caps.active_igpu) {
        auto igpu_rec = getIGPURecommendation(caps, model);
        rec.recommended_n_gpu_layers = igpu_rec.n_gpu_layers;
        rec.recommended_n_batch = igpu_rec.recommended_batch;
        rec.recommended_n_ctx = igpu_rec.recommended_ctx;
        rec.notes += igpu_rec.notes;
    } else {
        size_t total_vram = 0;
        for (const auto& gpu : caps.gpus) {
            if (gpu.is_active) {
                total_vram += gpu.vram_bytes;
            }
        }

        size_t model_size = model.size_bytes;
        size_t overhead = model_size / 10; // 10% overhead for KV cache

        if (total_vram > model_size + overhead) {
            rec.recommended_n_gpu_layers = -1; // All layers
        } else if (total_vram > model_size / 2) {
            rec.recommended_n_gpu_layers = static_cast<int32_t>(
                (total_vram * 0.7) / (model_size / 32.0)
            );
        } else {
            rec.recommended_n_gpu_layers = 5;
        }

        // ── Batch size ─────────────────────────────────────────
        if (caps.available_ram_bytes > 8ULL * 1024 * 1024 * 1024) {
            rec.recommended_n_batch = 512;
        } else if (caps.available_ram_bytes > 4ULL * 1024 * 1024 * 1024) {
            rec.recommended_n_batch = 256;
        } else {
            rec.recommended_n_batch = 128;
        }

        // ── Context size ───────────────────────────────────────
        rec.recommended_n_ctx = 512;
    }

    // ── Quantization recommendation ────────────────────────────
    if (model.size_bytes > 10ULL * 1024 * 1024 * 1024) {
        rec.recommended_quantization = "Q4_K_M";
        rec.notes += "Large model: Q4_K_M for balance of quality and speed.";
    } else if (model.size_bytes > 5ULL * 1024 * 1024 * 1024) {
        rec.recommended_quantization = "Q5_K_M";
        rec.notes += "Medium model: Q5_K_M for good quality with reasonable speed.";
    } else {
        rec.recommended_quantization = "Q6_K or Q8_0";
        rec.notes += "Small model: Higher quantization maintains quality.";
    }

    // ── Multi-GPU recommendation ───────────────────────────────
    if (!caps.has_igpu && caps.gpus.size() > 1) {
        rec.multi_gpu = getMultiGPUConfig(caps, model);
        if (rec.multi_gpu.enabled) {
            rec.notes += "Multi-GPU enabled. ";
        }
    }

    // ── ARM/NEON note ──────────────────────────────────────────
    if (caps.has_neon) {
        rec.notes += " ARM NEON detected — optimized for Apple Silicon / ARM SBCs.";
    }

    // ── AVX512 note ────────────────────────────────────────────
    if (caps.has_avx512) {
        rec.notes += " AVX512 detected — CPU inference will be fastest.";
    } else if (caps.has_avx2) {
        rec.notes += " AVX2 detected — CPU inference optimized.";
    } else {
        rec.notes += " No AVX2/AVX512 — consider GPU offload for best performance.";
    }

    return rec;
}

InferenceConfig OptimizationLayer::applyOptimizations(
    InferenceConfig config,
    const HardwareCaps& caps,
    const ModelInfo& model
) {
    auto rec = getRecommendations(caps, model);

    // Only apply if defaults (user hasn't overridden)
    if (config.n_threads <= 0) config.n_threads = rec.recommended_n_threads;
    if (config.n_gpu_layers == 0 && rec.recommended_n_gpu_layers > 0) {
        config.n_gpu_layers = rec.recommended_n_gpu_layers;
    }
    if (config.n_batch == 512 && rec.recommended_n_batch != 512) {
        config.n_batch = rec.recommended_n_batch;
    }

    return config;
}

MultiGPUConfig OptimizationLayer::getMultiGPUConfig(
    const HardwareCaps& caps,
    const ModelInfo& model
) {
    MultiGPUConfig config;
    config.enabled = false;

    if (caps.gpus.size() < 2) return config;

    // Filter active GPUs
    std::vector<GPUDevice> active_gpus;
    for (const auto& gpu : caps.gpus) {
        if (gpu.is_active) {
            active_gpus.push_back(gpu);
        }
    }

    if (active_gpus.size() < 2) return config;

    // Calculate total VRAM
    size_t total_vram = 0;
    for (const auto& gpu : active_gpus) {
        total_vram += gpu.vram_bytes;
    }

    size_t model_size = model.size_bytes;
    size_t overhead = model_size / 10;

    // Only enable multi-GPU if model doesn't fit on single GPU
    size_t largest_gpu_vram = 0;
    for (const auto& gpu : active_gpus) {
        largest_gpu_vram = std::max(largest_gpu_vram, gpu.vram_bytes);
    }

    if (model_size + overhead > largest_gpu_vram) {
        config.enabled = true;
        config.strategy = MultiGPUConfig::LAYER_SPLIT;
        config.main_gpu = 0;

        // Collect GPU IDs
        for (const auto& gpu : active_gpus) {
            config.gpu_ids.push_back(gpu.device_id);
        }

        // Distribute layers proportionally to VRAM
        // Estimate ~32 layers for a 7B model
        int32_t estimated_layers = 32;
        size_t total_weight = 0;
        std::vector<size_t> vram_weights;

        for (const auto& gpu : active_gpus) {
            vram_weights.push_back(gpu.vram_bytes);
            total_weight += gpu.vram_bytes;
        }

        int32_t layers_assigned = 0;
        for (size_t i = 0; i < active_gpus.size(); i++) {
            if (i == active_gpus.size() - 1) {
                // Last GPU gets remaining layers
                config.layers_per_gpu.push_back(estimated_layers - layers_assigned);
            } else {
                int32_t layers = static_cast<int32_t>(
                    (static_cast<float>(vram_weights[i]) / total_weight) * estimated_layers
                );
                config.layers_per_gpu.push_back(layers);
                layers_assigned += layers;
            }
        }
    }

    return config;
}

std::vector<std::string> OptimizationLayer::getAvailableBackends() const {
    std::vector<std::string> backends;

    if (current_caps_.has_cuda) backends.push_back("cuda");
    if (current_caps_.has_rocm) backends.push_back("rocm");
    if (current_caps_.has_metal) backends.push_back("metal");
    if (current_caps_.has_vulkan) backends.push_back("vulkan");
    if (current_caps_.has_igpu && current_caps_.active_igpu) {
        backends.push_back("igpu(" + current_caps_.active_igpu->name + ")");
    }
    if (current_caps_.has_neon) backends.push_back("neon");
    else if (current_caps_.has_avx512) backends.push_back("avx512");
    else if (current_caps_.has_avx2) backends.push_back("avx2");
    backends.push_back("cpu");

    return backends;
}

// ── CPU Detection ──────────────────────────────────────────────
void OptimizationLayer::detectCPU(HardwareCaps& caps) {
    caps.cpu_cores = std::thread::hardware_concurrency();

#ifdef __linux__
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line)) {
        if (line.find("model name") != std::string::npos) {
            caps.cpu_name = line.substr(line.find(":") + 2);
            break;
        }
    }
#elif defined(__APPLE__)
    char buffer[256];
    size_t size = sizeof(buffer);
    if (sysctlbyname("machdep.cpu.brand_string", buffer, &size, nullptr, 0) == 0) {
        caps.cpu_name = buffer;
    }
#elif defined(_WIN32)
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE,
        "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
        0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        char buffer[256];
        DWORD size = sizeof(buffer);
        if (RegQueryValueExA(hKey, "ProcessorNameString", nullptr, nullptr,
            (LPBYTE)buffer, &size) == ERROR_SUCCESS) {
            caps.cpu_name = buffer;
        }
        RegCloseKey(hKey);
    }
#endif

    if (caps.cpu_name.empty()) caps.cpu_name = "Unknown CPU";
}

// ── ARM Detection ──────────────────────────────────────────────
void OptimizationLayer::detectARM(HardwareCaps& caps) {
#if defined(__aarch64__) || defined(_M_ARM64)
    caps.is_arm = true;
    caps.has_neon = true;  // NEON is mandatory on AArch64
    caps.cpu_arch = "aarch64";
#elif defined(__arm__) || defined(_M_ARM)
    caps.is_arm = true;
    caps.cpu_arch = "armv7l";
    // NEON is optional on ARMv7, check /proc/cpuinfo
#ifdef __linux__
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line)) {
        if (line.find("Features") != std::string::npos) {
            caps.has_neon = line.find("neon") != std::string::npos;
            break;
        }
    }
#endif
#else
    caps.is_arm = false;
    caps.cpu_arch = "x86_64";
#endif

    // ARM-specific CPU name detection
    if (caps.is_arm) {
#ifdef __linux__
        std::ifstream cpuinfo("/proc/cpuinfo");
        std::string line;
        while (std::getline(cpuinfo, line)) {
            if (line.find("Hardware") != std::string::npos) {
                caps.cpu_name = line.substr(line.find(":") + 2);
                break;
            }
        }
#elif defined(__APPLE__)
        char buffer[256];
        size_t size = sizeof(buffer);
        if (sysctlbyname("machdep.cpu.brand_string", buffer, &size, nullptr, 0) == 0) {
            caps.cpu_name = buffer;
        }
#endif
    }
}

// ── AVX2 Detection ─────────────────────────────────────────────
void OptimizationLayer::detectAVX2(HardwareCaps& caps) {
#ifdef __linux__
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line)) {
        if (line.find("flags") != std::string::npos) {
            caps.has_avx2 = line.find("avx2") != std::string::npos;
            break;
        }
    }
#elif defined(_WIN32)
    int cpuInfo[4] = {0};
    __cpuid(cpuInfo, 7);
    caps.has_avx2 = (cpuInfo[1] & (1 << 5)) != 0;  // EBX bit 5
#endif
}

// ── AVX512 Detection ───────────────────────────────────────────
void OptimizationLayer::detectAVX512(HardwareCaps& caps) {
#ifdef __linux__
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line)) {
        if (line.find("flags") != std::string::npos) {
            caps.has_avx512 = line.find("avx512f") != std::string::npos;
            break;
        }
    }
#elif defined(_WIN32)
    int cpuInfo[4] = {0};
    __cpuid(cpuInfo, 7);
    caps.has_avx512 = (cpuInfo[1] & (1 << 16)) != 0; // EBX bit 16
#endif
}

// ── GPU Detection ──────────────────────────────────────────────
void OptimizationLayer::detectGPU(HardwareCaps& caps) {
    detectCUDA(caps);
    detectROCm(caps);
    detectMetal(caps);
    detectVulkan(caps);
}

void OptimizationLayer::detectCUDA(HardwareCaps& caps) {
#ifdef HAVEN_CUDA_ENABLED
    caps.has_cuda = true;

    // Detect NVIDIA GPUs via /proc/driver/nvidia or nvidia-smi
#ifdef __linux__
    std::ifstream nvidia("/proc/driver/nvidia/gpus/0000:01:00.0/information");
    if (nvidia.is_open()) {
        std::string line;
        while (std::getline(nvidia, line)) {
            if (line.find("Model:") != std::string::npos) {
                GPUDevice gpu;
                gpu.device_id = 0;
                gpu.vendor = "nvidia";
                gpu.name = line.substr(line.find(":") + 2);
                gpu.is_active = true;
                caps.gpus.push_back(gpu);
                break;
            }
        }
    }
#endif
#endif
}

void OptimizationLayer::detectROCm(HardwareCaps& caps) {
#ifdef HAVEN_ROCM_ENABLED
    caps.has_rocm = true;

    // Detect AMD GPUs via /sys/class/drm or rocm-smi
#ifdef __linux__
    // Check for AMD GPUs in sysfs
    std::ifstream vendor("/sys/class/drm/card0/device/vendor");
    if (vendor.is_open()) {
        std::string vendor_id;
        std::getline(vendor, vendor_id);
        if (vendor_id.find("0x1002") != std::string::npos) { // AMD vendor ID
            GPUDevice gpu;
            gpu.device_id = 0;
            gpu.vendor = "amd";

            // Get GPU name
            std::ifstream name_file("/sys/class/drm/card0/device/name");
            if (name_file.is_open()) {
                std::getline(name_file, gpu.name);
            } else {
                gpu.name = "AMD GPU (ROCm)";
            }

            // Get VRAM from mem_info_vram_total
            std::ifstream vram("/sys/class/drm/card0/device/mem_info_vram_total");
            if (vram.is_open()) {
                std::string vram_str;
                std::getline(vram, vram_str);
                gpu.vram_bytes = std::stoull(vram_str);
            }

            gpu.is_active = true;
            caps.gpus.push_back(gpu);
        }
    }
#endif
#endif
}

void OptimizationLayer::detectMetal(HardwareCaps& caps) {
#ifdef HAVEN_METAL_ENABLED
    caps.has_metal = true;

    GPUDevice gpu;
    gpu.device_id = 0;
    gpu.vendor = "apple";

#ifdef __APPLE__
    char buffer[256];
    size_t size = sizeof(buffer);
    if (sysctlbyname("hw.model", buffer, &size, nullptr, 0) == 0) {
        std::string model(buffer);
        if (model.find("MacBookPro") != std::string::npos ||
            model.find("MacBookAir") != std::string::npos) {
            gpu.name = "Apple Silicon (Laptop)";
        } else if (model.find("Macmini") != std::string::npos) {
            gpu.name = "Apple Silicon (Mac mini)";
        } else if (model.find("MacStudio") != std::string::npos) {
            gpu.name = "Apple Silicon (Mac Studio)";
        } else if (model.find("MacPro") != std::string::npos) {
            gpu.name = "Apple Silicon (Mac Pro)";
        } else if (model.find("iMac") != std::string::npos) {
            gpu.name = "Apple Silicon (iMac)";
        } else {
            gpu.name = "Apple Silicon";
        }
    }
#endif

    // Unified memory = RAM
    gpu.vram_bytes = caps.total_ram_bytes; // Unified memory architecture
    gpu.is_active = true;
    caps.gpus.push_back(gpu);
#endif
}

void OptimizationLayer::detectVulkan(HardwareCaps& caps) {
#ifdef HAVEN_VULKAN_ENABLED
    caps.has_vulkan = true;
    // Vulkan detection requires vulkaninfo or vkEnumeratePhysicalDevices
    // This is a placeholder — full implementation needs Vulkan SDK
#endif
}

// ── iGPU Detection ─────────────────────────────────────────────
void OptimizationLayer::detectIGPU(HardwareCaps& caps) {
#ifdef __linux__
    // Check for Intel integrated GPUs
    std::ifstream vendor("/sys/class/drm/card0/device/vendor");
    if (vendor.is_open()) {
        std::string vendor_id;
        std::getline(vendor, vendor_id);

        // Intel vendor ID: 0x8086
        if (vendor_id.find("0x8086") != std::string::npos) {
            caps.has_igpu = true;

            GPUDevice igpu;
            igpu.device_id = 0;
            igpu.vendor = "intel";
            igpu.is_integrated = true;

            // Get GPU name
            std::ifstream name_file("/sys/class/drm/card0/device/name");
            if (name_file.is_open()) {
                std::getline(name_file, igpu.name);
            } else {
                // Try to identify from device ID
                std::ifstream device("/sys/class/drm/card0/device/device");
                if (device.is_open()) {
                    std::string dev_id;
                    std::getline(device, dev_id);
                    if (dev_id.find("0x46") != std::string::npos ||
                        dev_id.find("0x49") != std::string::npos ||
                        dev_id.find("0xa7") != std::string::npos) {
                        igpu.name = "Intel Iris Xe / UHD Graphics";
                    } else if (dev_id.find("0x56") != std::string::npos ||
                               dev_id.find("0x7d") != std::string::npos) {
                        igpu.name = "Intel Arc (discrete)";
                        igpu.is_integrated = false;
                    } else {
                        igpu.name = "Intel Integrated GPU";
                    }
                }
            }

            // iGPUs share system RAM — estimate usable portion
            // Conservative: 50% of available RAM minus OS overhead
            size_t ram_for_igpu = caps.available_ram_bytes > 0 ?
                static_cast<size_t>(caps.available_ram_bytes * 0.4) :
                static_cast<size_t>(caps.total_ram_bytes * 0.3);

            igpu.vram_bytes = ram_for_igpu;
            igpu.shared_ram_reserved = ram_for_igpu;
            igpu.is_active = true;

            caps.gpus.push_back(igpu);
            caps.active_igpu = &caps.gpus.back();
        }

        // AMD APUs (vendor 0x1002 with integrated graphics)
        if (vendor_id.find("0x1002") != std::string::npos) {
            // Check if this is an APU (no dedicated VRAM)
            std::ifstream vram("/sys/class/drm/card0/device/mem_info_vram_total");
            if (vram.is_open()) {
                std::string vram_str;
                std::getline(vram, vram_str);
                size_t vram_bytes = std::stoull(vram_str);

                // If VRAM < 1GB, likely an APU
                if (vram_bytes < 1073741824ULL) {
                    caps.has_igpu = true;

                    GPUDevice igpu;
                    igpu.device_id = 0;
                    igpu.vendor = "amd";
                    igpu.is_integrated = true;

                    std::ifstream name_file("/sys/class/drm/card0/device/name");
                    if (name_file.is_open()) {
                        std::getline(name_file, igpu.name);
                    } else {
                        igpu.name = "AMD Radeon Graphics (APU)";
                    }

                    size_t ram_for_igpu = caps.available_ram_bytes > 0 ?
                        static_cast<size_t>(caps.available_ram_bytes * 0.4) :
                        static_cast<size_t>(caps.total_ram_bytes * 0.3);

                    igpu.vram_bytes = ram_for_igpu;
                    igpu.shared_ram_reserved = ram_for_igpu;
                    igpu.is_active = true;

                    caps.gpus.push_back(igpu);
                    caps.active_igpu = &caps.gpus.back();
                }
            }
        }
    }
#elif defined(__APPLE__)
    // Apple Silicon is technically an SoC with integrated GPU
    // But Metal handles this differently — unified memory is already accounted for
    caps.has_igpu = false; // Metal path handles this
#endif
}

// ── iGPU Recommendation ────────────────────────────────────────
OptimizationLayer::IGPURecommendation OptimizationLayer::getIGPURecommendation(
    const HardwareCaps& caps,
    const ModelInfo& model
) {
    IGPURecommendation rec;

    if (!caps.active_igpu) {
        rec.notes = "No iGPU detected.";
        return rec;
    }

    size_t igpu_ram = caps.active_igpu->shared_ram_reserved;
    size_t model_size = model.size_bytes;
    size_t kv_cache_overhead = model_size / 8; // ~12.5% for KV cache at context 512

    // iGPU strategy: conservative layer offloading to avoid OOM
    if (igpu_ram > model_size + kv_cache_overhead) {
        // Can fit full model in shared RAM
        rec.n_gpu_layers = -1; // All layers
        rec.notes += " iGPU has enough shared RAM for full offload.";
    } else if (igpu_ram > model_size * 0.6) {
        // Can fit most of the model
        rec.n_gpu_layers = static_cast<int32_t>(
            (igpu_ram * 0.7) / (model_size / 32.0)
        );
        rec.notes += " iGPU partial offload — balance speed and memory.";
    } else {
        // Minimal offload — just enough to get some speedup
        rec.n_gpu_layers = 5;
        rec.notes += " Limited iGPU RAM — minimal offload recommended.";
    }

    // iGPU batch size: smaller than dGPU to avoid memory spikes
    if (igpu_ram > 8ULL * 1024 * 1024 * 1024) {
        rec.recommended_batch = 256;
    } else if (igpu_ram > 4ULL * 1024 * 1024 * 1024) {
        rec.recommended_batch = 128;
    } else {
        rec.recommended_batch = 64;
    }

    // iGPU context size: reduce to save KV cache memory
    rec.recommended_ctx = 512;
    if (igpu_ram < 4ULL * 1024 * 1024 * 1024) {
        rec.recommended_ctx = 256;
        rec.notes += " Reduced context to 256 for memory constraints.";
    }

    rec.reserved_ram_bytes = caps.active_igpu->shared_ram_reserved;

    return rec;
}

// ── Memory Detection ───────────────────────────────────────────
void OptimizationLayer::detectMemory(HardwareCaps& caps) {
#ifdef __linux__
    std::ifstream meminfo("/proc/meminfo");
    std::string line;
    while (std::getline(meminfo, line)) {
        if (line.find("MemTotal:") != std::string::npos) {
            size_t kb;
            sscanf(line.c_str(), "MemTotal: %zu kB", &kb);
            caps.total_ram_bytes = kb * 1024;
        } else if (line.find("MemAvailable:") != std::string::npos) {
            size_t kb;
            sscanf(line.c_str(), "MemAvailable: %zu kB", &kb);
            caps.available_ram_bytes = kb * 1024;
        }
    }
#elif defined(__APPLE__)
    size_t size = sizeof(caps.total_ram_bytes);
    sysctlbyname("hw.memsize", &caps.total_ram_bytes, &size, nullptr, 0);
    // Available memory estimation
    caps.available_ram_bytes = caps.total_ram_bytes / 2;
#elif defined(_WIN32)
    MEMORYSTATUSEX status;
    status.dwLength = sizeof(status);
    GlobalMemoryStatusEx(&status);
    caps.total_ram_bytes = status.ullTotalPhys;
    caps.available_ram_bytes = status.ullAvailPhys;
#endif
}

} // namespace haven
