#!/bin/bash

# Haven LLM Studio - First Run Script
# This is the moment. It turns the key.

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                                                          ║"
echo "║          Haven LLM Studio — First Run                    ║"
echo "║                                                          ║"
echo "║          Where intelligence finds shelter.               ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN++)); }
step() { echo -e "\n${BLUE}▶${NC} ${CYAN}$1${NC}"; }

# ── Phase 1: Prerequisites ─────────────────────────────────────
step "Phase 1: Checking prerequisites"

check_cmd() {
    if command -v "$1" &>/dev/null; then
        pass "$1 ($(command -v "$1" | head -1))"
        return 0
    else
        fail "$1 not found"
        return 1
    fi
}

check_cmd node
check_cmd npm
check_cmd cmake
check_cmd git
check_cmd g++ || check_cmd c++

# Node version check
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -n "$NODE_VERSION" ] && [ "$NODE_VERSION" -ge 20 ]; then
    pass "Node.js $NODE_VERSION (≥ 20 required)"
else
    fail "Node.js 20+ required (found $(node -v 2>/dev/null || echo 'none'))"
fi

# ── Phase 2: Dependencies ──────────────────────────────────────
step "Phase 2: Installing dependencies"

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    pass "node_modules exists"
else
    warn "node_modules missing — running npm install"
    npm install --prefer-offline 2>&1 | tail -3
    if [ -d "node_modules" ]; then
        pass "Dependencies installed"
    else
        fail "npm install failed"
    fi
fi

# ── Phase 3: llama.cpp Submodule ───────────────────────────────
step "Phase 3: Initializing llama.cpp"

if [ -f "native/third_party/llama.cpp/CMakeLists.txt" ]; then
    pass "llama.cpp submodule present"
else
    warn "llama.cpp not found — initializing submodule"
    git submodule update --init --recursive --depth 1 2>&1 | tail -3
    if [ -f "native/third_party/llama.cpp/CMakeLists.txt" ]; then
        pass "llama.cpp initialized"
    else
        fail "Failed to initialize llama.cpp submodule"
        echo ""
        echo -e "  ${YELLOW}Manual fix:${NC}"
        echo "    cd native/third_party"
        echo "    git clone --depth 1 https://github.com/ggml-org/llama.cpp.git"
        echo ""
        exit 1
    fi
fi

# ── Phase 4: Native Build ──────────────────────────────────────
step "Phase 4: Building native core"

# Detect platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)
echo -e "  Platform: ${CYAN}${PLATFORM}${NC} (${ARCH})"

# Auto-detect CPU features
CPU_FLAGS=""
if [ "$ARCH" = "x86_64" ]; then
    if grep -q "avx512f" /proc/cpuinfo 2>/dev/null; then
        CPU_FLAGS="--avx512"
        pass "CPU: AVX512 detected"
    elif grep -q "avx2" /proc/cpuinfo 2>/dev/null; then
        CPU_FLAGS="--avx2"
        pass "CPU: AVX2 detected"
    else
        warn "CPU: No AVX2/AVX512 — CPU-only inference will be slow"
    fi
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    CPU_FLAGS="--arm"
    pass "CPU: ARM/NEON detected"
fi

# Check for GPU
if command -v nvidia-smi &>/dev/null; then
    GPU_TYPE="cuda"
    pass "GPU: NVIDIA detected (CUDA)"
elif [ "$PLATFORM" = "Darwin" ]; then
    GPU_TYPE="metal"
    pass "GPU: Apple Silicon (Metal)"
else
    GPU_TYPE="cpu"
    warn "GPU: No dedicated GPU detected"
fi

# Build
if [ -f "native/build/Release/haven_core.node" ] || [ -f "native/build/haven_core.node" ]; then
    pass "Native addon already built"
else
    echo -e "  Building: ${CYAN}./build.sh --core ${CPU_FLAGS}${NC}"
    ./build.sh --core ${CPU_FLAGS} 2>&1 | tail -10

    if [ -f "native/build/Release/haven_core.node" ] || [ -f "native/build/haven_core.node" ]; then
        pass "Native core built successfully"
    else
        warn "Native core build completed but addon not found (may need node-gyp)"
    fi
fi

# ── Phase 5: TypeScript Compilation ────────────────────────────
step "Phase 5: Compiling TypeScript"

if node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json 2>&1 | grep -q "error"; then
    warn "TypeScript has type errors (non-fatal)"
    node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json 2>&1 | head -5
else
    pass "TypeScript compiles cleanly"
fi

# ── Phase 6: Directory Structure ───────────────────────────────
step "Phase 6: Checking directories"

mkdir -p ~/.haven/models 2>/dev/null
if [ -d "$HOME/.haven/models" ]; then
    pass "~/.haven/models exists"
else
    fail "Cannot create ~/.haven/models"
fi

# Check for models
MODEL_COUNT=$(find ~/.haven/models -name "*.gguf" 2>/dev/null | wc -l)
if [ "$MODEL_COUNT" -gt 0 ]; then
    pass "Found $MODEL_COUNT GGUF model(s)"
    find ~/.haven/models -name "*.gguf" -exec echo -e "    ${CYAN}▶{}${NC}" \;
else
    warn "No GGUF models found in ~/.haven/models/"
    echo ""
    echo -e "  ${YELLOW}Download a model:${NC}"
    echo "    # Example: Llama 3.2 3B Instruct (Q4_K_M, ~2GB)"
    echo "    mkdir -p ~/.haven/models"
    echo "    cd ~/.haven/models"
    echo "    # Download from HuggingFace or use the mobile app's Model Browser"
    echo ""
fi

# ── Phase 7: Configuration ─────────────────────────────────────
step "Phase 7: Configuration"

if [ -f ".env" ]; then
    pass ".env file exists"
else
    warn "No .env file — using defaults"
    echo -e "  ${YELLOW}Copy .env.example to .env to customize:${NC}"
    echo "    cp .env.example .env"
fi

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              First Run Summary                           ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo -e "║  ${GREEN}Passed:   $PASS${NC}                                              ║"
echo -e "║  ${YELLOW}Warnings: $WARN${NC}                                              ║"
echo -e "║  ${RED}Failed:   $FAIL${NC}                                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Some checks failed. Fix the issues above before starting the server.${NC}"
    echo ""
    exit 1
fi

if [ "$MODEL_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No models found. The server will start but inference will fail until you add a model.${NC}"
    echo ""
fi

# ── Start Server ───────────────────────────────────────────────
echo -e "${GREEN}Everything looks good. Starting Haven LLM Studio...${NC}"
echo ""

# Export defaults if not set
export HAVEN_PORT=${HAVEN_PORT:-1234}
export HAVEN_HOST=${HAVEN_HOST:-127.0.0.1}

echo -e "  ${CYAN}Server:${NC} http://${HAVEN_HOST}:${HAVEN_PORT}"
echo -e "  ${CYAN}API Docs:${NC} http://${HAVEN_HOST}:${HAVEN_PORT}/health"
echo -e "  ${CYAN}WebSocket:${NC} ws://${HAVEN_HOST}:${HAVEN_PORT}/ws"
echo ""

# Start the server
exec npm run server
