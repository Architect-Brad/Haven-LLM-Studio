# ── Stage 1: Build llama.cpp + native core ──
FROM node:22-bookworm AS native-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake build-essential git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY native/ native/
COPY package.json package.workspaces.json ./

RUN git submodule update --init --recursive --depth 1 2>/dev/null || true

RUN cmake -B native/build \
    -DCMAKE_BUILD_TYPE=Release \
    -DHAVEN_CUDA_SUPPORT=OFF \
    -DHAVEN_METAL_SUPPORT=OFF \
    native \
    && cmake --build native/build --config Release -j$(nproc)

# ── Stage 2: Build TypeScript server ──
FROM node:22-bookworm AS ts-builder

WORKDIR /build
COPY --from=native-builder /build/native/build native/build
COPY package.json tsconfig.json tsconfig.server.json ./
COPY src/server/ src/server/

RUN npm install --omit=dev 2>/dev/null; \
    npx tsc -p tsconfig.server.json 2>/dev/null || true

# ── Stage 3: Production image ──
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r haven && useradd -r -g haven -m -d /home/haven haven

WORKDIR /app

COPY --from=native-builder /build/native/build native/build/
COPY --from=ts-builder /build/dist dist/
COPY --from=ts-builder /build/node_modules node_modules/
COPY package.json ./

ENV NODE_ENV=production
ENV HAVEN_PORT=1234
ENV HAVEN_HOST=0.0.0.0
ENV HAVEN_MODELS_DIR=/home/haven/.haven/models

RUN mkdir -p /home/haven/.haven/models && chown -R haven:haven /home/haven/.haven

USER haven

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:1234/health || exit 1

CMD ["node", "dist/server/index.js"]
