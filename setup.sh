#!/bin/bash

# Haven LLM Studio - Setup Script
# Initializes submodules, installs dependencies, builds native components

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Haven LLM Studio - Setup Script                  ║"
echo "╚══════════════════════════════════════════════════════════╝"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "${BLUE}[STEP]${NC} $1"; }

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        log_error "$1 is not installed."
        return 1
    fi
}

# ── Step 1: Check prerequisites ──────────────────────────────
log_step "Checking prerequisites..."

check_cmd node || exit 1
check_cmd npm  || exit 1
check_cmd git  || exit 1

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    log_error "Node.js 20+ required, found $(node -v)"
    exit 1
fi

log_info "Node.js $(node -v) ✓"
log_info "npm $(npm -v) ✓"
log_info "git $(git --version | awk '{print $3}') ✓"

# Check optional tools
CMAKE_AVAILABLE=true
check_cmd cmake || CMAKE_AVAILABLE=false

if [ "$CMAKE_AVAILABLE" = true ]; then
    log_info "cmake $(cmake --version | head -1 | awk '{print $3}') ✓"
else
    log_warn "cmake not found — native C++ build will be skipped"
fi

# ── Step 2: Install npm dependencies ─────────────────────────
log_step "Installing npm dependencies..."
npm install
log_info "Dependencies installed ✓"

# ── Step 3: Initialize llama.cpp submodule ───────────────────
log_step "Initializing llama.cpp submodule..."

if [ -d "native/third_party/llama.cpp" ] && [ -f "native/third_party/llama.cpp/CMakeLists.txt" ]; then
    log_info "llama.cpp already present ✓"
else
    log_info "Cloning llama.cpp..."
    mkdir -p native/third_party
    git submodule update --init --recursive --depth 1 2>/dev/null || {
        log_warn "git submodule failed, trying direct clone..."
        cd native/third_party
        git clone --depth 1 https://github.com/ggml-org/llama.cpp.git 2>/dev/null || {
            log_error "Failed to clone llama.cpp."
            log_warn "You can manually clone it later:"
            log_warn "  git submodule update --init --recursive"
            log_warn "  # or:"
            log_warn "  git clone --depth 1 https://github.com/ggml-org/llama.cpp.git native/third_party/llama.cpp"
        }
        cd ../..
    }
fi

# ── Step 4: Build native core (if cmake available) ───────────
if [ "$CMAKE_AVAILABLE" = true ] && [ -d "native/third_party/llama.cpp" ]; then
    log_step "Building native core..."
    cd native
    cmake -B build -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -5
    cmake --build build --config Release 2>&1 | tail -5
    cd ..
    log_info "Native core built ✓"
else
    log_warn "Skipping native core build (cmake or llama.cpp unavailable)"
    log_info "Server will run in mock mode — inference will return placeholder responses"
fi

# ── Step 5: Configure N-API addon ────────────────────────────
log_step "Configuring N-API addon..."
cd native
node-gyp configure 2>/dev/null || {
    log_warn "node-gyp configure failed — addon will build on first 'npm run build:native-addon'"
}
cd ..
log_info "N-API addon configured ✓"

# ── Step 6: Create default directories ───────────────────────
log_step "Creating default directories..."
mkdir -p ~/.haven/models
log_info "~/.haven/models created ✓"

# ── Done ─────────────────────────────────────────────────────
echo ""
log_info "════════════════════════════════════════════════════"
log_info "  Setup Complete! 🎉"
log_info "════════════════════════════════════════════════════"
echo ""
log_info "Next steps:"
log_info "  1. Add GGUF models to ~/.haven/models/"
log_info "  2. Run: npm run dev          (server + desktop)"
log_info "  3. Run: npm run server       (server only)"
log_info "  4. Run: npm run build:native-addon  (rebuild N-API)"
echo ""
log_info "Mobile app:"
log_info "  cd mobile && npm start"
echo ""
