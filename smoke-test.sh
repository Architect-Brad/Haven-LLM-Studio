#!/bin/bash

# Haven LLM Studio - Smoke Test
# Validates the entire pipeline: server → native → inference → response

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Haven LLM Studio — Smoke Test                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

SERVER_URL="${HAVEN_SERVER_URL:-http://127.0.0.1:1234}"
PASS=0
FAIL=0

pass() { echo -e "  \033[0;32m✓\033[0m $1"; ((PASS++)); }
fail() { echo -e "  \033[0;31m✗\033[0m $1"; ((FAIL++)); }

# ── Test 1: Health Check ───────────────────────────────────────
echo "▶ Health Check"
HEALTH=$(curl -s "$SERVER_URL/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    pass "Server is healthy"
else
    fail "Health check failed"
    echo "  Response: $HEALTH"
fi

# ── Test 2: System Info ────────────────────────────────────────
echo ""
echo "▶ System Info"
SYSINFO=$(curl -s "$SERVER_URL/api/system" 2>/dev/null)
if echo "$SYSINFO" | grep -q '"platform"'; then
    PLATFORM=$(echo "$SYSINFO" | grep -o '"platform":"[^"]*"' | cut -d'"' -f4)
    ARCH=$(echo "$SYSINFO" | grep -o '"arch":"[^"]*"' | cut -d'"' -f4)
    pass "Platform: $PLATFORM ($ARCH)"
else
    fail "System info unavailable"
fi

# ── Test 3: Stats Endpoint ─────────────────────────────────────
echo ""
echo "▶ Stats"
STATS=$(curl -s "$SERVER_URL/api/stats" 2>/dev/null)
if echo "$STATS" | grep -q '"timestamp"'; then
    pass "Stats endpoint working"
else
    fail "Stats endpoint failed"
fi

# ── Test 4: Models List ────────────────────────────────────────
echo ""
echo "▶ Models"
MODELS=$(curl -s "$SERVER_URL/api/models" 2>/dev/null)
MODEL_COUNT=$(echo "$MODELS" | grep -o '"name"' | wc -l)
pass "Found $MODEL_COUNT model(s)"

# ── Test 5: OpenAI Models Endpoint ─────────────────────────────
echo ""
echo "▶ OpenAI Compatibility"
OA_MODELS=$(curl -s "$SERVER_URL/v1/models" 2>/dev/null)
if echo "$OA_MODELS" | grep -q '"object":"list"'; then
    pass "OpenAI /v1/models endpoint working"
else
    fail "OpenAI models endpoint failed"
fi

# ── Test 6: Inference (if model loaded) ────────────────────────
echo ""
echo "▶ Inference"
LOADED_MODEL=$(echo "$MODELS" | grep -o '"loaded":true' | head -1)
if [ -n "$LOADED_MODEL" ]; then
    echo "  Model is loaded — testing inference..."

    # Test completion
    RESULT=$(curl -s -X POST "$SERVER_URL/v1/completions" \
        -H "Content-Type: application/json" \
        -d '{"prompt": "Hello", "max_tokens": 10, "temperature": 0}' 2>/dev/null)

    if echo "$RESULT" | grep -q '"text"'; then
        TEXT=$(echo "$RESULT" | grep -o '"text":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass "Inference working: '$TEXT...'"
    else
        fail "Inference failed"
        echo "  Response: $RESULT"
    fi

    # Test chat completion
    CHAT=$(curl -s -X POST "$SERVER_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10}' 2>/dev/null)

    if echo "$CHAT" | grep -q '"content"'; then
        pass "Chat completion working"
    else
        fail "Chat completion failed"
    fi
else
    echo "  ⚠ No model loaded — skipping inference tests"
    echo "  Load a model with:"
    echo "    curl -X POST $SERVER_URL/api/models/load \\"
    echo "      -H 'Content-Type: application/json' \\"
    echo "      -d '{\"model_path\": \"/path/to/model.gguf\"}'"
fi

# ── Test 7: Embeddings ─────────────────────────────────────────
echo ""
echo "▶ Embeddings"
EMBED=$(curl -s -X POST "$SERVER_URL/v1/embeddings" \
    -H "Content-Type: application/json" \
    -d '{"input": "test"}' 2>/dev/null)

if echo "$EMBED" | grep -q '"object":"list"'; then
    pass "Embeddings endpoint working"
else
    fail "Embeddings endpoint failed"
fi

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Smoke Test Summary                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo -e "║  \033[0;32mPassed:   $PASS\033[0m                                              ║"
echo -e "║  \033[0;31mFailed:   $FAIL\033[0m                                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi

echo -e "\033[0;32mAll tests passed. Haven LLM Studio is operational.\033[0m"
