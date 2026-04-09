cmake_minimum_required(VERSION 3.20)
project(haven_inference)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# llama.cpp submodule
if(NOT EXISTS "${CMAKE_SOURCE_DIR}/../../../../../native/third_party/llama.cpp")
    message(FATAL_ERROR "llama.cpp submodule not found. Run: git submodule update --init --recursive")
endif()

# Build llama.cpp for Android
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN ON CACHE BOOL "" FORCE)  # GPU acceleration on Android
set(GGML_AVX OFF CACHE BOOL "" FORCE)
set(GGML_AVX2 OFF CACHE BOOL "" FORCE)
set(GGML_AVX512 OFF CACHE BOOL "" FORCE)
set(GGML_FMA OFF CACHE BOOL "" FORCE)
set(GGML_F16C OFF CACHE BOOL "" FORCE)

add_subdirectory(${CMAKE_SOURCE_DIR}/../../../../../native/third_party/llama.cpp ${CMAKE_BINARY_DIR}/llama.cpp)

# Haven Inference Library
add_library(haven_inference SHARED
    haven_inference.cpp
)

target_include_directories(haven_inference PRIVATE
    ${CMAKE_SOURCE_DIR}/../../../../../native/third_party/llama.cpp/include
    ${CMAKE_SOURCE_DIR}/../../../../../native/third_party/llama.cpp/ggml/include
)

target_link_libraries(haven_inference PRIVATE
    llama
    ggml
    android
    log
)
