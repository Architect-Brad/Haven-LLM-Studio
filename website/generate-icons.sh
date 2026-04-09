#!/bin/bash

# Haven LLM Studio — Generate PNG favicons from SVG
# Requires: imagemagick (convert)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG="$SCRIPT_DIR/favicon.svg"

if ! command -v convert &>/dev/null; then
    echo "ImageMagick not found. Install with: brew install imagemagick / apt install imagemagick"
    exit 1
fi

echo "Generating PNG favicons from $SVG..."

# 32x32
convert -background none -resize 32x32 "$SVG" "$SCRIPT_DIR/favicon-32.png"
echo "  ✓ favicon-32.png"

# 16x16
convert -background none -resize 16x16 "$SVG" "$SCRIPT_DIR/favicon-16.png"
echo "  ✓ favicon-16.png"

# Apple Touch Icon (180x180)
convert -background none -resize 180x180 "$SVG" "$SCRIPT_DIR/apple-touch-icon.png"
echo "  ✓ apple-touch-icon.png"

# Open Graph (1200x630)
convert -background "#0d1117" -resize 400x400 "$SVG" "$SCRIPT_DIR/og-image.png"
echo "  ✓ og-image.png"

echo ""
echo "All favicons generated in $SCRIPT_DIR/"
