#!/data/data/com.termux/files/usr/bin/bash

# Haven LLM Studio — Termux Installation Script
# Installs Haven as a Termux service with auto-start on boot

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Haven LLM Studio — Termux Installer                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# ── Check Termux ───────────────────────────────────────────────
if [ -z "$PREFIX" ]; then
    fail "This script must be run inside Termux"
    exit 1
fi

pass "Termux detected ($PREFIX)"

# ── Check prerequisites ────────────────────────────────────────
echo ""
echo "▶ Checking prerequisites..."

for cmd in node npm cmake make g++ git; do
    if command -v $cmd &>/dev/null; then
        pass "$cmd installed"
    else
        fail "$cmd not found"
        echo -e "  ${YELLOW}Install with: pkg install $cmd${NC}"
    fi
done

# Node version check
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -n "$NODE_VERSION" ] && [ "$NODE_VERSION" -ge 20 ]; then
    pass "Node.js $NODE_VERSION"
else
    fail "Node.js 20+ required"
fi

# ── Install dependencies ───────────────────────────────────────
echo ""
echo "▶ Installing dependencies..."

# Install Termux packages if missing
for pkg in cmake make clang git; do
    if ! command -v $pkg &>/dev/null; then
        warn "Installing $pkg..."
        pkg install $pkg -y 2>&1 | tail -1
    fi
done

# npm install
if [ -d "node_modules" ]; then
    pass "node_modules exists"
else
    echo "  Running npm install..."
    npm install --prefer-offline 2>&1 | tail -3
    pass "Dependencies installed"
fi

# ── Build native core ──────────────────────────────────────────
echo ""
echo "▶ Building native core for Termux..."

# Termux runs on ARM — use NEON optimization
BUILD_FLAGS="--arm"

# Check for Vulkan (Android GPU)
if [ -d "/system/lib64" ] && ls /system/lib64/libvulkan.so* &>/dev/null; then
    BUILD_FLAGS="$BUILD_FLAGS --igpu"
    pass "Vulkan detected (Android GPU)"
fi

echo "  Building with: ./build.sh $BUILD_FLAGS"
./build.sh --core $BUILD_FLAGS 2>&1 | tail -5

if [ -f "native/build/Release/haven_core.node" ] || [ -f "native/build/haven_core.node" ]; then
    pass "Native core built"
else
    warn "Native build may have failed — server will run in mock mode"
fi

# ── Install as Termux service ──────────────────────────────────
echo ""
echo "▶ Installing as Termux service..."

HAVEN_DIR="$PREFIX/opt/haven-llm-studio"
mkdir -p "$HAVEN_DIR"

# Copy files
cp -r . "$HAVEN_DIR/" 2>/dev/null || {
    warn "Could not copy to $HAVEN_DIR — using current directory"
    HAVEN_DIR="$(pwd)"
}

# Create startup script
cat > "$PREFIX/bin/haven" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Haven LLM Studio — Quick launcher

HAVEN_DIR="${PREFIX}/opt/haven-llm-studio"

if [ ! -d "$HAVEN_DIR" ]; then
    echo "Haven not installed. Run: ./integrations/termux/install.sh"
    exit 1
fi

cd "$HAVEN_DIR"
export HAVEN_PORT=${HAVEN_PORT:-1234}
export HAVEN_HOST=${HAVEN_HOST:-127.0.0.1}

case "$1" in
    start)
        echo "Starting Haven LLM Studio on http://$HAVEN_HOST:$HAVEN_PORT"
        nohup node dist/server/index.js > /dev/null 2>&1 &
        echo $! > /tmp/haven.pid
        echo "PID: $(cat /tmp/haven.pid)"
        ;;
    stop)
        if [ -f /tmp/haven.pid ]; then
            kill $(cat /tmp/haven.pid) 2>/dev/null
            rm /tmp/haven.pid
            echo "Haven stopped"
        else
            echo "Haven not running"
        fi
        ;;
    status)
        if [ -f /tmp/haven.pid ] && kill -0 $(cat /tmp/haven.pid) 2>/dev/null; then
            echo "Haven is running (PID: $(cat /tmp/haven.pid))"
            curl -s http://$HAVEN_HOST:$HAVEN_PORT/health 2>/dev/null || echo "Health check failed"
        else
            echo "Haven is not running"
        fi
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    *)
        echo "Usage: haven {start|stop|status|restart}"
        echo ""
        echo "Options:"
        echo "  start   - Start Haven server"
        echo "  stop    - Stop Haven server"
        echo "  status  - Check if Haven is running"
        echo "  restart - Restart Haven server"
        ;;
esac
EOF

chmod +x "$PREFIX/bin/haven"
pass "haven command installed"

# ── Termux:Widget shortcuts ────────────────────────────────────
echo ""
echo "▶ Setting up Termux:Widget shortcuts..."

WIDGET_DIR="$HOME/.termux/tasker"
mkdir -p "$WIDGET_DIR"

# Start widget
cat > "$WIDGET_DIR/Haven Start.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
haven start
EOF
chmod +x "$WIDGET_DIR/Haven Start.sh"

# Stop widget
cat > "$WIDGET_DIR/Haven Stop.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
haven stop
EOF
chmod +x "$WIDGET_DIR/Haven Stop.sh"

# Status widget
cat > "$WIDGET_DIR/Haven Status.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
haven status
EOF
chmod +x "$WIDGET_DIR/Haven Status.sh"

pass "Termux:Widget shortcuts installed"

# ── Auto-start on Termux boot ──────────────────────────────────
echo ""
echo "▶ Setting up auto-start..."

BOOT_SCRIPT="$PREFIX/etc/profile.d/haven.sh"
mkdir -p "$(dirname "$BOOT_SCRIPT")"

cat > "$BOOT_SCRIPT" << 'EOF'
# Auto-start Haven LLM Studio on Termux boot (optional)
# Uncomment the line below to enable:
# haven start
EOF

warn "Auto-start disabled by default — edit $BOOT_SCRIPT to enable"

# ── Create models directory ────────────────────────────────────
echo ""
echo "▶ Setting up models directory..."

mkdir -p "$HOME/.haven/models"
pass "~/.haven/models created"

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete!                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Usage:"
echo "  haven start     - Start Haven server"
echo "  haven stop      - Stop Haven server"
echo "  haven status    - Check status"
echo ""
echo "Termux:Widget:"
echo "  Add widgets to your home screen for quick start/stop"
echo ""
echo "Access:"
echo "  http://127.0.0.1:1234"
echo ""
