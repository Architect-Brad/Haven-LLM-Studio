#!/bin/bash

# Haven LLM Studio - KDE Integration Installer
# Installs desktop integration files for KDE Plasma

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Haven LLM Studio — KDE Integration Installer         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# Check if running on Linux
if [ "$(uname -s)" != "Linux" ]; then
    fail "This script is for Linux only"
    exit 1
fi

# Check for KDE/Plasma
if command -v plasmashell &>/dev/null; then
    pass "KDE Plasma detected"
else
    warn "KDE Plasma not found — some features may not work"
fi

INSTALL_DIR="${1:-$HOME/.local/share}"

echo ""
echo "Installing to: $INSTALL_DIR"
echo ""

# ── Desktop Entry ──────────────────────────────────────────────
echo "▶ Installing desktop entry..."
mkdir -p "$INSTALL_DIR/applications"
cp integrations/kde/haven-llm-studio.desktop "$INSTALL_DIR/applications/"
pass "Desktop entry installed"

# ── D-Bus Service ──────────────────────────────────────────────
echo ""
echo "▶ Installing D-Bus service..."
mkdir -p "$INSTALL_DIR/dbus-1/services"
cp integrations/kde/com.havenllm.Studio.service "$INSTALL_DIR/dbus-1/services/"
pass "D-Bus service installed"

# ── D-Bus Interface ────────────────────────────────────────────
echo ""
echo "▶ Installing D-Bus interface..."
mkdir -p "$INSTALL_DIR/dbus-1/interfaces"
cp integrations/kde/com.havenllm.Studio.xml "$INSTALL_DIR/dbus-1/interfaces/"
pass "D-Bus interface installed"

# ── KRunner Plugin ─────────────────────────────────────────────
echo ""
echo "▶ Installing KRunner plugin..."
mkdir -p "$HOME/.local/share/krunner/dbusplugins"
cp integrations/kde/haven-krunner.py "$HOME/.local/share/krunner/dbusplugins/"
pass "KRunner plugin installed"

# ── Plasma Widget ──────────────────────────────────────────────
echo ""
echo "▶ Installing Plasma widget..."
mkdir -p "$INSTALL_DIR/plasma/plasmoids/com.havenllm.studio"
cp -r integrations/kde/plasmoid/* "$INSTALL_DIR/plasma/plasmoids/com.havenllm.studio/"
pass "Plasma widget installed"

# ── Icons ──────────────────────────────────────────────────────
echo ""
echo "▶ Installing icons..."
mkdir -p "$INSTALL_DIR/icons/hicolor/16x16/apps"
mkdir -p "$INSTALL_DIR/icons/hicolor/32x32/apps"
mkdir -p "$INSTALL_DIR/icons/hicolor/64x64/apps"
mkdir -p "$INSTALL_DIR/icons/hicolor/128x128/apps"
mkdir -p "$INSTALL_DIR/icons/hicolor/scalable/apps"

if [ -f "icons/icon-16.png" ]; then
    cp icons/icon-16.png "$INSTALL_DIR/icons/hicolor/16x16/apps/haven-llm-studio.png"
    pass "16x16 icon installed"
fi

if [ -f "icons/icon-32.png" ]; then
    cp icons/icon-32.png "$INSTALL_DIR/icons/hicolor/32x32/apps/haven-llm-studio.png"
    pass "32x32 icon installed"
fi

if [ -f "icons/icon.svg" ]; then
    cp icons/icon.svg "$INSTALL_DIR/icons/hicolor/scalable/apps/haven-llm-studio.svg"
    pass "SVG icon installed"
fi

# ── Update caches ──────────────────────────────────────────────
echo ""
echo "▶ Updating desktop caches..."
update-desktop-database "$INSTALL_DIR/applications" 2>/dev/null || true
gtk-update-icon-cache "$INSTALL_DIR/icons/hicolor" 2>/dev/null || true
pass "Desktop caches updated"

# ── Restart KRunner ────────────────────────────────────────────
echo ""
echo "▶ Restarting KRunner..."
qdbus org.kde.KRunner /KRunner loadPlugins 2>/dev/null || {
    warn "Could not reload KRunner — restart it manually or log out/in"
}

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Installation Complete!                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "What's been installed:"
echo "  • Desktop entry (application launcher)"
echo "  • D-Bus service (com.havenllm.Studio)"
echo "  • KRunner plugin (Alt+F2 → 'ask haven <question>')"
echo "  • Plasma widget (right-click desktop → Add Widgets)"
echo ""
echo "To use:"
echo "  1. Start Haven LLM Studio"
echo "  2. Right-click desktop → Add Widgets → Haven LLM Studio"
echo "  3. Press Alt+F2 and type 'ask haven <your question>'"
echo ""
