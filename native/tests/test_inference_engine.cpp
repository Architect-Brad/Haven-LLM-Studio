#include "haven_core.h"
#include "doctest.h"
#include <memory>

using namespace haven;

TEST_CASE("create and destroy engine") {
    auto engine = createLlamaCppEngine();
    REQUIRE(engine != nullptr);
}

TEST_CASE("engine not loaded by default") {
    auto engine = createLlamaCppEngine();
    REQUIRE_FALSE(engine->isModelLoaded());
}

TEST_CASE("inference fails without model") {
    auto engine = createLlamaCppEngine();
    InferenceConfig cfg;
    auto result = engine->infer("hello", cfg);
    REQUIRE_EQ(result, "");
}

TEST_CASE("streaming fails without model") {
    auto engine = createLlamaCppEngine();
    InferenceConfig cfg;
    bool called = false;
    engine->inferStreaming("hello", cfg, [&](const std::string& token, bool isEnd) {
        called = true;
        REQUIRE(isEnd);
    });
    REQUIRE(called);
}

TEST_CASE("embedding fails without model") {
    auto engine = createLlamaCppEngine();
    auto result = engine->embed("hello");
    REQUIRE(result.embedding.empty());
    REQUIRE_EQ(result.tokens_processed, 0);
}

TEST_CASE("stats are zeroed initially") {
    auto engine = createLlamaCppEngine();
    auto stats = engine->getStats();
    REQUIRE_EQ(stats.load_time_ms, 0.0);
    REQUIRE_EQ(stats.inference_time_ms, 0.0);
    REQUIRE_EQ(stats.tokens_generated, 0);
    REQUIRE_EQ(stats.tokens_per_second, 0.0);
    REQUIRE_EQ(stats.memory_used_bytes, 0ULL);
}

TEST_CASE("resetStats does not crash") {
    auto engine = createLlamaCppEngine();
    engine->resetStats();
    auto stats = engine->getStats();
    REQUIRE_EQ(stats.load_time_ms, 0.0);
}

TEST_CASE("getLastError returns empty initially") {
    auto engine = createLlamaCppEngine();
    REQUIRE_EQ(engine->getLastError(), "");
}

TEST_CASE("getModelInfo returns empty for unloaded model") {
    auto engine = createLlamaCppEngine();
    auto info = engine->getModelInfo();
    REQUIRE_EQ(info.path, "");
}

TEST_CASE("unloadModel on unloaded engine does not crash") {
    auto engine = createLlamaCppEngine();
    engine->unloadModel();
    REQUIRE_FALSE(engine->isModelLoaded());
}

TEST_CASE("double unload does not crash") {
    auto engine = createLlamaCppEngine();
    engine->unloadModel();
    engine->unloadModel();
    REQUIRE_FALSE(engine->isModelLoaded());
}
