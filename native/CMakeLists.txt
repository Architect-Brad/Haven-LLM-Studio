cmake_minimum_required(VERSION 3.20)
project(haven-llm-core VERSION 0.2.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ── Options ──────────────────────────────────────────────────────
option(HAVEN_BUILD_TESTS "Build tests" OFF)
option(HAVEN_CUDA_SUPPORT "Enable CUDA support (NVIDIA)" OFF)
option(HAVEN_ROCM_SUPPORT "Enable ROCm support (AMD)" OFF)
option(HAVEN_METAL_SUPPORT "Enable Metal support (macOS)" OFF)
option(HAVEN_VULKAN_SUPPORT "Enable Vulkan support (Cross-platform)" OFF)
option(HAVEN_AVX512_SUPPORT "Enable AVX512 CPU instructions" OFF)
option(HAVEN_AVX2_SUPPORT "Enable AVX2 CPU instructions" OFF)
option(HAVEN_ARM_NEON_SUPPORT "Enable ARM NEON instructions" OFF)
option(HAVEN_IGPU_SUPPORT "Optimize for integrated GPUs" OFF)
option(HAVEN_MULTI_GPU "Enable multi-GPU layer splitting" OFF)

# ── llama.cpp submodule ──────────────────────────────────────────
if(NOT EXISTS "${CMAKE_SOURCE_DIR}/third_party/llama.cpp")
    message(FATAL_ERROR "llama.cpp submodule not found. Run: git submodule update --init --recursive")
endif()

# ── Build llama.cpp with backend flags ───────────────────────────
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_CUDA ${HAVEN_CUDA_SUPPORT} CACHE BOOL "" FORCE)
set(GGML_HIPBLAS ${HAVEN_ROCM_SUPPORT} CACHE BOOL "" FORCE)
set(GGML_METAL ${HAVEN_METAL_SUPPORT} CACHE BOOL "" FORCE)
set(GGML_VULKAN ${HAVEN_VULKAN_SUPPORT} CACHE BOOL "" FORCE)

if(HAVEN_AVX512_SUPPORT)
    set(GGML_AVX512 ON CACHE BOOL "" FORCE)
endif()

add_subdirectory(third_party/llama.cpp)

# ── Haven Core Library ───────────────────────────────────────────
add_library(haven_core STATIC
    src/inference_engine.cpp
    src/model_manager.cpp
    src/optimization_layer.cpp
    src/haven_core.h
)

target_include_directories(haven_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/llama.cpp/ggml/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/llama.cpp/src
)

target_link_libraries(haven_core PUBLIC
    ggml
    llama
)

# ── Platform-specific optimizations ──────────────────────────────
if(APPLE)
    target_link_libraries(haven_core PRIVATE
        "-framework Accelerate"
        "-framework Foundation"
    )
    if(HAVEN_METAL_SUPPORT)
        target_link_libraries(haven_core PRIVATE
            "-framework Metal"
            "-framework MetalKit"
        )
    endif()
endif()

# NVIDIA CUDA
if(HAVEN_CUDA_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_CUDA_ENABLED)
    if(HAVEN_MULTI_GPU)
        target_compile_definitions(haven_core PUBLIC HAVEN_MULTI_GPU_ENABLED)
    endif()
endif()

# AMD ROCm
if(HAVEN_ROCM_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_ROCM_ENABLED)
    if(HAVEN_MULTI_GPU)
        target_compile_definitions(haven_core PUBLIC HAVEN_MULTI_GPU_ENABLED)
    endif()
endif()

# Metal
if(HAVEN_METAL_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_METAL_ENABLED)
endif()

# Vulkan
if(HAVEN_VULKAN_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_VULKAN_ENABLED)
    if(HAVEN_MULTI_GPU)
        target_compile_definitions(haven_core PUBLIC HAVEN_MULTI_GPU_ENABLED)
    endif()
endif()

# AVX512
if(HAVEN_AVX512_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_AVX512_ENABLED)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        target_compile_options(haven_core PRIVATE -mavx512f -mavx512bw -mavx512dq -mavx512vl)
    elseif(MSVC)
        target_compile_options(haven_core PRIVATE /arch:AVX512)
    endif()
endif()

# AVX2
if(HAVEN_AVX2_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_AVX2_ENABLED)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        target_compile_options(haven_core PRIVATE -mavx2 -mfma -mf16c)
    elseif(MSVC)
        target_compile_options(haven_core PRIVATE /arch:AVX2)
    endif()
endif()

# ARM NEON
if(HAVEN_ARM_NEON_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_ARM_NEON_ENABLED)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        # ARMv8-A has NEON enabled by default, but add explicit flags
        target_compile_options(haven_core PRIVATE
            -march=armv8-a+simd
            -mtune=cortex-a76
        )
    endif()
    # Link ARM math libraries
    if(EXISTS "/usr/lib/aarch64-linux-gnu/libopenblas.so")
        target_link_libraries(haven_core PRIVATE openblas)
    endif()
endif()

# iGPU optimizations
if(HAVEN_IGPU_SUPPORT)
    target_compile_definitions(haven_core PUBLIC HAVEN_IGPU_ENABLED)
    # iGPU-specific: reduce batch size to avoid OOM on shared memory
    # This is handled at runtime in the optimization layer
endif()

# ── CLI Tool ─────────────────────────────────────────────────────
add_executable(haven-cli src/cli/main.cpp)
target_link_libraries(haven-cli PRIVATE haven_core)

# ── Tests ────────────────────────────────────────────────────────
if(HAVEN_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

# ── Install ──────────────────────────────────────────────────────
install(TARGETS haven_core haven-cli
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)

# ── Build Summary ────────────────────────────────────────────────
message(STATUS "")
message(STATUS "╔══════════════════════════════════════════════════════════╗")
message(STATUS "║         Haven LLM Core — Build Configuration         ║")
message(STATUS "╠══════════════════════════════════════════════════════════╣")
message(STATUS "║  CUDA:    ${HAVEN_CUDA_SUPPORT}                                        ║")
message(STATUS "║  ROCm:    ${HAVEN_ROCM_SUPPORT}                                        ║")
message(STATUS "║  Metal:   ${HAVEN_METAL_SUPPORT}                                        ║")
message(STATUS "║  Vulkan:  ${HAVEN_VULKAN_SUPPORT}                                        ║")
message(STATUS "║  AVX512:  ${HAVEN_AVX512_SUPPORT}                                        ║")
message(STATUS "║  AVX2:    ${HAVEN_AVX2_SUPPORT}                                        ║")
message(STATUS "║  ARM/NEON:${HAVEN_ARM_NEON_SUPPORT}                                        ║")
message(STATUS "║  iGPU:    ${HAVEN_IGPU_SUPPORT}                                        ║")
message(STATUS "║  Multi-GPU: ${HAVEN_MULTI_GPU}                                      ║")
message(STATUS "╚══════════════════════════════════════════════════════════╝")
message(STATUS "")
