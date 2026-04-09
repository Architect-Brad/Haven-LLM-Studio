#!/bin/bash

# Haven LLM Studio - Build Script
# Automates the build process for all platforms

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Haven LLM Studio - Build Script                  ║"
echo "╚══════════════════════════════════════════════════════════╝"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependency() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Check dependencies
log_info "Checking dependencies..."
check_dependency node
check_dependency npm
check_dependency cmake

# Check for submodule
if [ ! -d "native/third_party/llama.cpp" ]; then
    log_warn "llama.cpp submodule not found. Initializing..."
    git submodule update --init --recursive
fi

# Parse arguments
BUILD_TYPE="all"
GPU_SUPPORT="cpu"

while [[ $# -gt 0 ]]; do
    case $1 in
        --core)
            BUILD_TYPE="core"
            shift
            ;;
        --server)
            BUILD_TYPE="server"
            shift
            ;;
        --app)
            BUILD_TYPE="app"
            shift
            ;;
        --mobile)
            BUILD_TYPE="mobile"
            shift
            ;;
        --cuda)
            GPU_SUPPORT="cuda"
            shift
            ;;
        --metal)
            GPU_SUPPORT="metal"
            shift
            ;;
        --vulkan)
            GPU_SUPPORT="vulkan"
            shift
            ;;
        --rocm)
            GPU_SUPPORT="rocm"
            shift
            ;;
        --avx512)
            GPU_SUPPORT="avx512"
            shift
            ;;
        --avx2)
            GPU_SUPPORT="avx2"
            shift
            ;;
        --arm)
            GPU_SUPPORT="arm"
            shift
            ;;
        --igpu)
            GPU_SUPPORT="igpu"
            shift
            ;;
        --multi-gpu)
            MULTI_GPU=true
            shift
            ;;
        --clean)
            log_info "Cleaning build directories..."
            rm -rf dist native/build release
            log_info "Clean complete"
            exit 0
            ;;
        --help)
            echo "Usage: ./build.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --core      Build native core only"
            echo "  --server    Build server only"
            echo "  --app       Build desktop app only"
            echo "  --mobile    Build mobile app only"
            echo "  --cuda      Enable CUDA support"
            echo "  --metal     Enable Metal support (macOS)"
            echo "  --vulkan    Enable Vulkan support"
            echo "  --rocm      Enable ROCm support (AMD)"
            echo "  --avx512    Enable AVX512 CPU instructions"
            echo "  --avx2      Enable AVX2 CPU instructions"
            echo "  --arm       Enable ARM NEON (Raspberry Pi, SBCs)"
            echo "  --igpu      Optimize for integrated GPUs"
            echo "  --multi-gpu Enable multi-GPU layer splitting"
            echo "  --clean     Clean build directories"
            echo "  --help      Show this help"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build native core
build_core() {
    log_info "Building native core..."
    
    CMAKE_ARGS=""
    case $GPU_SUPPORT in
        cuda)
            CMAKE_ARGS="-DHAVEN_CUDA_SUPPORT=ON"
            log_info "Building with CUDA support"
            ;;
        metal)
            CMAKE_ARGS="-DHAVEN_METAL_SUPPORT=ON"
            log_info "Building with Metal support"
            ;;
        vulkan)
            CMAKE_ARGS="-DHAVEN_VULKAN_SUPPORT=ON"
            log_info "Building with Vulkan support"
            ;;
        rocm)
            CMAKE_ARGS="-DHAVEN_ROCM_SUPPORT=ON"
            log_info "Building with ROCm support"
            ;;
        avx512)
            CMAKE_ARGS="-DHAVEN_AVX512_SUPPORT=ON"
            log_info "Building with AVX512 support"
            ;;
        avx2)
            CMAKE_ARGS="-DHAVEN_AVX2_SUPPORT=ON"
            log_info "Building with AVX2 support"
            ;;
        arm)
            CMAKE_ARGS="-DHAVEN_ARM_NEON_SUPPORT=ON"
            log_info "Building with ARM NEON support"
            ;;
        igpu)
            CMAKE_ARGS="-DHAVEN_IGPU_SUPPORT=ON"
            log_info "Building with iGPU optimizations"
            ;;
    esac

    if [ "$MULTI_GPU" = true ]; then
        CMAKE_ARGS="$CMAKE_ARGS -DHAVEN_MULTI_GPU=ON"
        log_info "Building with multi-GPU support"
    fi
    
    cd native
    cmake -B build $CMAKE_ARGS
    cmake --build build --config Release
    cd ..
    
    log_info "Native core built successfully"
}

# Build server
build_server() {
    log_info "Building server..."
    npm run build:server
    log_info "Server built successfully"
}

# Build desktop app
build_app() {
    log_info "Building desktop app..."
    npm run build:app
    log_info "Desktop app built successfully"
    
    log_info "Packages available in release/"
    ls -la release/
}

# Build mobile app
build_mobile() {
    log_info "Building mobile app..."
    cd mobile
    
    if ! command -v expo &> /dev/null; then
        log_warn "Expo CLI not found. Installing..."
        npm install -g expo-cli
    fi
    
    npm install
    log_info "Mobile app ready. Run 'cd mobile && npm run start' to start development server"
    
    cd ..
}

# Main build process
case $BUILD_TYPE in
    core)
        build_core
        ;;
    server)
        build_server
        ;;
    app)
        build_app
        ;;
    mobile)
        build_mobile
        ;;
    all)
        build_core
        build_server
        build_app
        log_info ""
        log_info "════════════════════════════════════════"
        log_info "  Build Complete! 🎉"
        log_info "════════════════════════════════════════"
        log_info ""
        log_info "Next steps:"
        log_info "  1. Add models to ~/.haven/models/"
        log_info "  2. Run: npm run dev"
        log_info "  3. Or start server: npm run server"
        log_info ""
        ;;
esac

exit 0
