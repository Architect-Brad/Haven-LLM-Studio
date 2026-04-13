#include "optimization_layer.h"
#include "doctest.h"

using namespace haven;

TEST_CASE("OptimizationLayer singleton") {
    auto& opt1 = OptimizationLayer::getInstance();
    auto& opt2 = OptimizationLayer::getInstance();
    REQUIRE_EQ(&opt1, &opt2);
}

TEST_CASE("detectHardware returns CPU info") {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();

    REQUIRE(caps.cpu_cores > 0);
    REQUIRE_FALSE(caps.cpu_name.empty());
    REQUIRE_FALSE(caps.cpu_arch.empty());
}

TEST_CASE("detectHardware reports memory") {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();

    REQUIRE(caps.total_ram_bytes > 0);
    REQUIRE(caps.available_ram_bytes > 0);
    REQUIRE(caps.total_ram_bytes >= caps.available_ram_bytes);
}

TEST_CASE("detectHardware sets active backend") {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();

    REQUIRE_FALSE(caps.active_backend.empty());
    bool valid = caps.active_backend == "cpu" ||
                 caps.active_backend == "avx2" ||
                 caps.active_backend == "avx512" ||
                 caps.active_backend == "neon" ||
                 caps.active_backend == "cuda" ||
                 caps.active_backend == "rocm" ||
                 caps.active_backend == "metal" ||
                 caps.active_backend == "vulkan";
    REQUIRE(valid);
}

TEST_CASE("getAvailableBackends returns at least cpu") {
    auto& opt = OptimizationLayer::getInstance();
    opt.detectHardware();
    auto backends = opt.getAvailableBackends();

    REQUIRE_FALSE(backends.empty());
    bool hasCpu = false;
    for (auto& b : backends) {
        if (b == "cpu") hasCpu = true;
    }
    REQUIRE(hasCpu);
}

TEST_CASE("getRecommendations returns sane defaults") {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();

    ModelInfo model;
    model.name = "test.gguf";
    model.architecture = "llama";
    model.n_params = 7000000000;
    model.size_bytes = 4294967296ULL; // 4GB

    auto rec = opt.getRecommendations(caps, model);

    REQUIRE(rec.recommended_n_threads > 0);
    REQUIRE(rec.recommended_n_threads <= caps.cpu_cores);
    REQUIRE(rec.recommended_n_batch > 0);
    REQUIRE(rec.recommended_n_ctx > 0);
    REQUIRE_FALSE(rec.recommended_backend.empty());
}

TEST_CASE("applyOptimizations respects user overrides") {
    auto& opt = OptimizationLayer::getInstance();
    auto caps = opt.detectHardware();

    ModelInfo model;
    model.name = "test.gguf";
    model.size_bytes = 1073741824ULL;

    InferenceConfig config;
    config.n_threads = 4;      // user override
    config.n_gpu_layers = 12;  // user override

    auto optimized = opt.applyOptimizations(config, caps, model);

    REQUIRE_EQ(optimized.n_threads, 4);
    REQUIRE_EQ(optimized.n_gpu_layers, 12);
}
