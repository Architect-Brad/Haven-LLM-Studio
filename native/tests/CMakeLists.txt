# ── C++ Unit Tests ────────────────────────────────────────────────
enable_testing()

add_executable(haven-tests
    main.cpp
    test_inference_engine.cpp
    test_optimization_layer.cpp
    test_model_manager.cpp
)

target_link_libraries(haven-tests PRIVATE haven_core)

target_include_directories(haven-tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/llama.cpp/ggml/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/llama.cpp/src
)

add_test(NAME haven-tests COMMAND haven-tests)
