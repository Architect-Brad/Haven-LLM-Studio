# Haven LLM Studio - Setup Guide

## Prerequisites

### Required
- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **CMake** 3.20+ ([Download](https://cmake.org/))

### Optional (for GPU acceleration)
- **CUDA Toolkit** 11.8+ (NVIDIA GPU)
- **Xcode Command Line Tools** (macOS for Metal support)
- **Vulkan SDK** (Linux/Windows for Vulkan support)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git
cd haven-llm-studio
```

### 2. Initialize Submodules (llama.cpp)

```bash
git submodule update --init --recursive
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build Native Core

```bash
# Standard build (CPU only)
npm run build:core

# With CUDA support
cmake -B native/build -DHAVEN_CUDA_SUPPORT=ON
cmake --build native/build

# With Metal support (macOS)
cmake -B native/build -DHAVEN_METAL_SUPPORT=ON
cmake --build native/build

# With Vulkan support
cmake -B native/build -DHAVEN_VULKAN_SUPPORT=ON
cmake --build native/build
```

### 5. Start Development Server

```bash
# Start both server and desktop app
npm run dev

# Or start separately:
npm run dev:server   # API server only
npm run dev:app      # Desktop app only
```

### 6. Access the Application

- **Desktop App**: Opens automatically
- **API Server**: http://localhost:1234
- **API Docs**: http://localhost:1234/docs (if enabled)

## API Usage

### List Models
```bash
curl http://localhost:1234/api/models
```

### Load Model
```bash
curl -X POST http://localhost:1234/api/models/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "/path/to/model.gguf"}'
```

### OpenAI-Compatible Completion
```bash
curl http://localhost:1234/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Once upon a time",
    "max_tokens": 100,
    "temperature": 0.8
  }'
```

### Chat Completions
```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 100
  }'
```

## Project Structure

```
haven-llm-studio/
├── native/                 # C++ core (llama.cpp wrapper)
│   ├── src/
│   │   ├── haven_core.h
│   │   ├── model_manager.h
│   │   └── optimization_layer.h
│   ├── CMakeLists.txt
│   └── third_party/       # llama.cpp submodule
├── src/
│   ├── server/            # Node.js API server
│   │   ├── index.ts
│   │   ├── services/
│   │   └── utils/
│   └── app/               # Electron desktop app
│       ├── main.ts
│       ├── preload.ts
│       └── index.html
├── mobile/                # React Native mobile app
├── package.json
└── tsconfig.json
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HAVEN_PORT` | 1234 | Server port |
| `HAVEN_HOST` | 127.0.0.1 | Server host |
| `HAVEN_MODELS_DIR` | ~/.haven/models | Models directory |

### Config File

Create `~/.haven/config.json`:

```json
{
  "server": {
    "port": 1234,
    "host": "127.0.0.1"
  },
  "models": {
    "directory": "~/.haven/models"
  },
  "inference": {
    "default_threads": -1,
    "default_gpu_layers": 0,
    "default_batch_size": 512
  }
}
```

## Building for Production

### Desktop App

```bash
npm run build
npm run app:desktop
```

This creates distributable packages in `release/`:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` 
- **Linux**: `.AppImage`

### Mobile App (Coming Soon)

```bash
cd mobile
npm install

# iOS
npm run ios

# Android
npm run android
```

## Troubleshooting

### Build Errors

**CMake not found:**
```bash
# Install CMake
brew install cmake  # macOS
sudo apt install cmake  # Linux
choco install cmake  # Windows
```

**llama.cpp submodule missing:**
```bash
git submodule update --init --recursive
```

### Runtime Errors

**Port already in use:**
```bash
# Change port
export HAVEN_PORT=1235
npm run dev:server
```

**Model not loading:**
- Ensure model is in GGUF format
- Check file permissions
- Verify sufficient RAM/VRAM

### Performance Issues

**Slow inference:**
- Enable GPU offload (set `n_gpu_layers` > 0)
- Use quantized models (Q4_K_M recommended)
- Reduce context size if memory-constrained

**Out of memory:**
- Use smaller models (3B, 7B vs 70B)
- Use higher quantization (Q2_K, Q3_K)
- Reduce batch size and context

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE)

## Support

- **Issues**: [GitHub Issues](https://github.com/Architect-Brad/Haven-LLM-Studio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Architect-Brad/Haven-LLM-Studio/discussions)
- **Discord**: [Join Server](https://discord.gg/haven-llm)
