#!/data/data/com.termux/files/usr/bin/bash

# Haven LLM Studio — Termux Boot Service
# Starts Haven automatically when Termux boots

# Wait for filesystem to be ready
sleep 2

# Check if Haven is installed
if command -v haven &>/dev/null; then
    # Check if user wants auto-start
    if grep -q "^haven start" "$PREFIX/etc/profile.d/haven.sh" 2>/dev/null; then
        haven start
    fi
fi
