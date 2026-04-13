#include "haven_core.h"
#include "optimization_layer.h"
#include "model_manager.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cstring>
#include <thread>
#include <chrono>

using namespace haven;

static void printBanner() {
    std::cout << R"(
╔══════════════════════════════════════════════════════════╗
║              Haven LLM Core — CLI                        ║
╚══════════════════════════════════════════════════════════╝
)" << std::endl;
}

static void printUsage(const char* name) {
    std::cout << "Usage: " << name << " <command> [options]\n\n"
              << "Commands:\n"
              << "  infer <model> <prompt>      Run inference on a model\n"
              << "  stream <model> <prompt>      Stream inference output\n"
              << "  info <model>                 Show model metadata\n"
              << "  hardware                     Detect and list hardware capabilities\n"
              << "  embed <model> <text>         Generate embeddings\n"
              << "  list <dir>                   List models in a directory\n"
              << "  help                         Show this help\n"
              << std::endl;
}

static InferenceConfig parseConfig(int argc, char** argv, int& i) {
    InferenceConfig config;
    for (; i < argc; i++) {
        if (strcmp(argv[i], "--ctx") == 0 && i + 1 < argc)
            config.n_ctx = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--batch") == 0 && i + 1 < argc)
            config.n_batch = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--threads") == 0 && i + 1 < argc)
            config.n_threads = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--gpu-layers") == 0 && i + 1 < argc)
            config.n_gpu_layers = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--temp") == 0 && i + 1 < argc)
            config.temperature = std::stof(argv[++i]);
        else if (strcmp(argv[i], "--top-k") == 0 && i + 1 < argc)
            config.top_k = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--top-p") == 0 && i + 1 < argc)
            config.top_p = std::stof(argv[++i]);
        else if (strcmp(argv[i], "--repeat-penalty") == 0 && i + 1 < argc)
            config.repeat_penalty = std::stof(argv[++i]);
        else if (strcmp(argv[i], "--max-tokens") == 0 && i + 1 < argc)
            config.max_tokens = std::stoi(argv[++i]);
        else if (strcmp(argv[i], "--multi-gpu") == 0)
            config.multi_gpu = true;
        else if (strcmp(argv[i], "--main-gpu") == 0 && i + 1 < argc)
            config.main_gpu = std::stoi(argv[++i]);
        else break;
    }
    return config;
}

static int cmdHardware() {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();
    auto backends = opt.getAvailableBackends();

    std::cout << "\n  Hardware Detection\n"
              << "  ──────────────────────────────────────────────\n";
    std::cout << "  CPU:        " << caps.cpu_name << " (" << caps.cpu_cores << " cores, " << caps.cpu_arch << ")\n";
    std::cout << "  RAM:        " << (caps.total_ram_bytes / 1024 / 1024 / 1024) << " GB total, "
              << (caps.available_ram_bytes / 1024 / 1024 / 1024) << " GB available\n";
    std::cout << "  Features:   "
              << (caps.has_avx512 ? "AVX512 " : "")
              << (caps.has_avx2 ? "AVX2 " : "")
              << (caps.has_neon ? "NEON " : "")
              << (caps.is_arm ? "ARM " : "")
              << "\n";
    std::cout << "  Backends:   ";
    for (auto& b : backends) std::cout << b << " ";
    std::cout << "\n";
    std::cout << "  Active:     " << caps.active_backend << "\n";

    if (!caps.gpus.empty()) {
        std::cout << "\n  GPUs:\n";
        for (auto& gpu : caps.gpus) {
            std::cout << "    " << gpu.name
                      << " (" << gpu.vendor << ")"
                      << (gpu.is_integrated ? " [iGPU]" : "")
                      << " — " << (gpu.vram_bytes / 1024 / 1024) << " MB"
                      << (gpu.is_active ? " [active]" : "")
                      << "\n";
        }
    }
    std::cout << std::endl;
    return 0;
}

static int cmdList(int argc, char** argv) {
    std::string dir = argc > 0 ? argv[0] : ".";
    ModelManager mgr(dir);
    auto models = mgr.listModels();

    std::cout << "\n  Models in " << dir << "\n"
              << "  ──────────────────────────────────────────────\n";
    if (models.empty()) {
        std::cout << "  No model files found\n";
    } else {
        for (auto& m : models) {
            std::cout << "  " << m.name
                      << " (" << (m.size_bytes / 1024 / 1024) << " MB, " << m.type << ")\n";
        }
    }
    std::cout << std::endl;
    return 0;
}

static int cmdInfo(const std::string& modelPath) {
    auto engine = createLlamaCppEngine();
    InferenceConfig config;
    config.n_gpu_layers = 0;
    config.n_ctx = 512;

    std::cout << "\n  Loading model to read metadata..." << std::endl;
    if (!engine->loadModel(modelPath, config)) {
        std::cerr << "  Failed: " << engine->getLastError() << std::endl;
        return 1;
    }

    auto info = engine->getModelInfo();
    auto stats = engine->getStats();

    std::cout << "\n  Model Info\n"
              << "  ──────────────────────────────────────────────\n";
    std::cout << "  Name:         " << info.name << "\n";
    std::cout << "  Path:         " << info.path << "\n";
    std::cout << "  Type:         " << info.type << "\n";
    std::cout << "  Architecture: " << info.architecture << "\n";
    std::cout << "  Parameters:   " << info.n_params << "\n";
    std::cout << "  Size:         " << (info.size_bytes / 1024 / 1024) << " MB\n";
    std::cout << "  Load time:    " << stats.load_time_ms << " ms\n";
    std::cout << std::endl;

    engine->unloadModel();
    return 0;
}

static int cmdInfer(const std::string& modelPath, const std::string& prompt, InferenceConfig config) {
    auto engine = createLlamaCppEngine();

    std::cout << "  Loading model..." << std::endl;
    if (!engine->loadModel(modelPath, config)) {
        std::cerr << "  Failed: " << engine->getLastError() << std::endl;
        return 1;
    }

    std::cout << "  Running inference..." << std::endl;
    auto start = std::chrono::high_resolution_clock::now();
    std::string result = engine->infer(prompt, config);
    auto end = std::chrono::high_resolution_clock::now();
    auto stats = engine->getStats();

    double wallTime = std::chrono::duration<double, std::milli>(end - start).count();
    double tps = stats.tokens_generated > 0 ? (stats.tokens_generated / (wallTime / 1000.0)) : 0;

    std::cout << "\n  ── Output ────────────────────────────────────\n";
    std::cout << result << "\n";
    std::cout << "  ──────────────────────────────────────────────\n";
    std::cout << "  Tokens: " << stats.tokens_generated
              << " | Time: " << wallTime << " ms"
              << " | Speed: " << tps << " t/s"
              << std::endl;

    engine->unloadModel();
    return 0;
}

static int cmdStream(const std::string& modelPath, const std::string& prompt, InferenceConfig config) {
    auto engine = createLlamaCppEngine();

    std::cout << "  Loading model..." << std::endl;
    if (!engine->loadModel(modelPath, config)) {
        std::cerr << "  Failed: " << engine->getLastError() << std::endl;
        return 1;
    }

    std::cout << "\n  ── Streaming ────────────────────────────────\n";
    auto start = std::chrono::high_resolution_clock::now();

    engine->inferStreaming(prompt, config, [&](const std::string& token, bool isEnd) {
        if (!isEnd) {
            std::cout << token << std::flush;
        }
    });

    auto end = std::chrono::high_resolution_clock::now();
    auto stats = engine->getStats();

    double wallTime = std::chrono::duration<double, std::milli>(end - start).count();
    double tps = stats.tokens_generated > 0 ? (stats.tokens_generated / (wallTime / 1000.0)) : 0;

    std::cout << "\n  ──────────────────────────────────────────────\n";
    std::cout << "  Tokens: " << stats.tokens_generated
              << " | Time: " << wallTime << " ms"
              << " | Speed: " << tps << " t/s"
              << std::endl;

    engine->unloadModel();
    return 0;
}

static int cmdEmbed(const std::string& modelPath, const std::string& text, InferenceConfig config) {
    auto engine = createLlamaCppEngine();

    std::cout << "  Loading model for embeddings..." << std::endl;
    if (!engine->loadModel(modelPath, config)) {
        std::cerr << "  Failed: " << engine->getLastError() << std::endl;
        return 1;
    }

    auto result = engine->embed(text);

    std::cout << "\n  Embedding (" << result.embedding.size() << " dimensions)\n";
    std::cout << "  Tokens processed: " << result.tokens_processed << "\n";
    std::cout << "  Compute time: " << result.compute_time_ms << " ms\n";

    if (result.embedding.size() <= 10) {
        std::cout << "  Vector: [";
        for (size_t i = 0; i < result.embedding.size(); i++) {
            if (i > 0) std::cout << ", ";
            std::cout << result.embedding[i];
        }
        std::cout << "]\n";
    } else {
        std::cout << "  First 5: [";
        for (int i = 0; i < 5; i++) {
            if (i > 0) std::cout << ", ";
            std::cout << result.embedding[i];
        }
        std::cout << ", ...]\n";
    }
    std::cout << std::endl;

    engine->unloadModel();
    return 0;
}

int main(int argc, char** argv) {
    printBanner();

    if (argc < 2) {
        printUsage(argv[0]);
        return 1;
    }

    std::string command = argv[1];

    if (command == "help" || command == "--help" || command == "-h") {
        printUsage(argv[0]);
        return 0;
    }

    if (command == "hardware") {
        return cmdHardware();
    }

    if (command == "list") {
        return cmdList(argc - 2, argv + 2);
    }

    if (command == "info") {
        if (argc < 3) {
            std::cerr << "Error: missing model path" << std::endl;
            return 1;
        }
        return cmdInfo(argv[2]);
    }

    if (command == "infer" || command == "stream" || command == "embed") {
        if (argc < 4) {
            std::cerr << "Error: missing model path or prompt" << std::endl;
            return 1;
        }

        std::string modelPath = argv[2];
        std::string prompt = argv[3];

        int optIdx = 4;
        auto config = parseConfig(argc, argv, optIdx);

        // If there are more positional args, append them to the prompt
        for (int i = optIdx; i < argc; i++) {
            if (argv[i][0] != '-') {
                prompt += " " + std::string(argv[i]);
            }
        }

        if (command == "infer")
            return cmdInfer(modelPath, prompt, config);
        else if (command == "stream")
            return cmdStream(modelPath, prompt, config);
        else
            return cmdEmbed(modelPath, prompt, config);
    }

    std::cerr << "Unknown command: " << command << std::endl;
    printUsage(argv[0]);
    return 1;
}
