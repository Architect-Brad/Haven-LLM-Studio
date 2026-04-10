# Haven LLM Studio

> **Your local AI inference powerhouse.** Run, host, and serve LLMs with state-of-the-art performance.

## Vision

Haven LLM Studio is a **focused inference and server hosting platform** — not a chat app. It's built for:

- 🚀 **High-performance inference** with cutting-edge optimizations
- 🌐 **OpenAI-compatible API endpoints** for seamless integration
- 📱 **Desktop + Mobile** management and monitoring
- 🔒 **100% local, private, offline** — your models, your data

## ⚠️ Platform Requirements

### Android Users — Termux Required
**Haven LLM Studio requires [Termux](https://termux.dev/) on Android.** The standard Android environment does not support the native compilation and symlink operations required by Haven. Termux provides a proper Linux-like environment with full package management.

**Why Termux?**
- Android's shared storage (`/storage/emulated/0/`) does not support symlinks, which `npm` requires
- Termux provides a proper home directory (`~`) with full filesystem permissions
- Native C++ compilation (CMake, clang) requires a proper build environment
- Haven's build scripts are designed for Unix-like environments

**Installation Steps:**
1. Install [Termux from F-Droid](https://f-droid.org/packages/com.termux/) (recommended) or [GitHub Releases](https://github.com/termux/termux-app/releases)
2. Open Termux and run:
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs cmake make clang git
   ```
3. Clone Haven into Termux home (NOT shared storage):
   ```bash
   cd ~
   git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git
   cd Haven-LLM-Studio
   npm install
   ./build.sh --arm
   npm run server
   ```

### iOS Users — Coming Soon
Haven's mobile app is currently Android-only. iOS support is planned but requires:
- Apple's restrictive native module compilation process
- TestFlight or App Store distribution for the React Native app
- On-device inference requires building llama.cpp as an XCFramework

**Workaround for iOS users:** Run Haven on a remote server (Linux/macOS/Windows) and connect via the mobile app's remote management feature.

### Desktop (Linux/macOS/Windows)
No special requirements beyond the standard prerequisites listed below.

## Features

- **Multi-backend support** (llama.cpp primary, extensible)
- **GPU acceleration** (CUDA, Metal, Vulkan, ROCm)
- **AVX512 CPU acceleration** for modern x86 processors
- **ARM NEON optimization** for Raspberry Pi, Apple Silicon, Android
- **iGPU-aware layer offloading** (Intel UHD/Iris Xe, AMD APU)
- **Multi-GPU layer splitting** — run models larger than single GPU VRAM
- **Cluster mode** — master/worker architecture for distributed inference
- **Model hub integration** (HuggingFace GGUF downloader)
- **Real-time monitoring** (VRAM, tokens/sec, load)
- **Remote management** (mobile app control)
- **On-device phone inference** — sub-1B models run directly on Android
- **KDE Plasma integration** — system tray, KRunner, desktop widget
- **N-API bridge** — Native C++ inference engine bound to Node.js
- **Streaming SSE** with proper error handling and backpressure
- **Delta-based CPU monitoring** for accurate real-time stats

## Tech Stack

| Component | Technology |
|-----------|------------|
| Core Engine | C++17 (llama.cpp wrapper) |
| Native Bridge | N-API (node-addon-api) |
| Server | Node.js + Express + WebSocket |
| Desktop UI | Electron + React + Vite |
| Mobile | React Native (Expo) |
| Model Format | GGUF (primary), GPTQ, AWQ |

## Quick Start

### The One-Command Start
```bash
./first-run.sh    # Checks everything, builds, starts server
```

### Manual Setup
```bash
# Clone the repository
git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git
cd Haven-LLM-Studio

# Install dependencies
npm install

# Build native core (CPU only)
npm run build:core

# With GPU support
./build.sh --cuda     # NVIDIA
./build.sh --rocm     # AMD
./build.sh --metal    # macOS
./build.sh --vulkan   # Cross-platform
./build.sh --avx2     # x86 CPUs (2013+)
./build.sh --avx512   # Modern x86 (Zen 4+, Skylake-X+)
./build.sh --arm      # Raspberry Pi, ARM SBCs, Android (Termux)
./build.sh --igpu     # Intel UHD/Iris Xe, AMD APU

# With multi-GPU
./build.sh --cuda --multi-gpu

# Start server
npm run server

# Or start both server and desktop app
npm run dev
```

### Validate Everything
```bash
./smoke-test.sh     # Tests all endpoints end-to-end
```

## Cluster Mode

Haven supports a master/worker cluster for distributed inference:

```bash
# Master node (coordinates workers)
HAVEN_CLUSTER=true HAVEN_CLUSTER_ROLE=master npm run server

# Worker node (runs inference)
HAVEN_CLUSTER=true HAVEN_CLUSTER_ROLE=worker \
  HAVEN_MASTER_URL=ws://192.168.1.100:1235 \
  npm run server
```

The master routes inference requests to the best available worker based on
VRAM availability and current load. Configure via `.env` (copy from `.env.example`).

## KDE Plasma Integration

On Linux with KDE Plasma, Haven integrates with the desktop:

```bash
# Install KDE integration
./integrations/kde/install.sh
```

This installs:
- **Desktop entry** — Launch from application menu
- **System tray** — Right-click for quick actions (start/stop server, load model)
- **D-Bus service** — Control Haven from other apps (`com.havenllm.Studio`)
- **KRunner plugin** — Press `Alt+F2`, type `ask haven <question>`
- **Plasma widget** — Right-click desktop → Add Widgets → Haven LLM Studio

## On-Device Phone Inference

Haven runs sub-1B models directly on Android devices:

1. Open the app → tap the **💬** button (bottom-left)
2. Download a sub-1B model from Model Browser (e.g., SmolLM-360M)
3. Load the model → start chatting — entirely offline

**Supported sub-1B models:**
| Model | Size | RAM Needed |
|-------|------|-----------|
| SmolLM-360M | ~220MB (Q4) | ~800MB |
| Qwen2.5-0.5B | ~350MB (Q4) | ~1GB |
| TinyLlama-1.1B | ~670MB (Q4) | ~1.5GB |

The app includes:
- **Foreground service** — prevents Android phantom process killing
- **Wake lock** — keeps CPU awake during inference
- **Thermal monitoring** — throttles when device overheats
- **Battery optimization exemption** — request via Settings

## Haven SDK

Embed Haven's inference engine directly in your Node.js applications:

```bash
npm install @haven/sdk
```

```typescript
import { Haven } from '@haven/sdk';

const haven = new Haven();
await haven.loadModel('~/.haven/models/llama-3.2-3b.Q4_K_M.gguf');

const result = await haven.infer('What is quantum computing?');
console.log(result.text);

for await (const token of haven.stream('Write a haiku')) {
  process.stdout.write(token);
}
```

See [packages/sdk/README.md](packages/sdk/README.md) for full documentation.

## Termux (Android)

Run Haven directly on your Android device via Termux:

```bash
# Inside Termux (NOT in /storage/emulated/0/)
pkg install nodejs cmake make clang git
cd ~
git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git
cd Haven-LLM-Studio
./integrations/termux/install.sh

# Start Haven
haven start

# Access from browser
# http://127.0.0.1:1234
```

Termux:Widget shortcuts are installed automatically for quick start/stop from your home screen.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Haven LLM Studio                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Desktop UI  │  │ Mobile App  │  │   CLI       │     │
│  │  (Electron) │  │  (React Native)│  │           │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┴────────────────┘             │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │   API Server Layer    │                  │
│              │  (OpenAI Compatible)  │                  │
│              └───────────┬───────────┘                  │
│                          │                              │
│         ┌────────────────┴────────────────┐             │
│         │                                 │             │
│  ┌──────▼──────┐                   ┌──────▼──────┐     │
│  │ Inference   │◄────N-API────────│   Native    │     │
│  │  Service    │                  │   Core      │     │
│  │             │                  │  (llama.cpp)│     │
│  └─────────────┘                   └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## API Usage

### Health Check
```bash
curl http://localhost:1234/health
```

### List Models
```bash
curl http://localhost:1234/api/models
```

### Load Model
```bash
curl -X POST http://localhost:1234/api/models/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "/path/to/model.gguf", "config": {"n_gpu_layers": 35}}'
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

### Chat Completions (with streaming)
```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 100,
    "stream": true
  }'
```

## Project Structure

```
haven-llm-studio/
├── native/                     # C++ core + N-API bridge
│   ├── src/
│   │   ├── haven_core.h        # Core interfaces
│   │   ├── haven_addon.cpp     # N-API bindings
│   │   ├── inference_engine.cpp # llama.cpp inference
│   │   ├── model_manager.cpp   # Model file management
│   │   └── optimization_layer.cpp # Hardware detection
│   ├── binding.gyp             # Node.js native build config
│   └── CMakeLists.txt          # CMake build config
├── src/
│   ├── server/                 # Node.js API server
│   │   ├── index.ts            # Server entry point
│   │   ├── services/
│   │   │   ├── inference.service.ts
│   │   │   ├── model.service.ts
│   │   │   ├── system-monitor.service.ts
│   │   │   └── native-loader.ts
│   │   └── utils/
│   │       └── huggingface.ts  # HF downloader
│   └── app/                    # Electron desktop app
│       ├── main.ts
│       ├── preload.ts
│       └── index.html          # Functional UI
├── mobile/                     # React Native mobile app
│   ├── src/screens/
│   │   ├── HomeScreen.tsx
│   │   ├── ServerDetailScreen.tsx
│   │   ├── SettingsScreen.tsx
│   └── └── ModelBrowserScreen.tsx
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

## Roadmap

- [x] Project initialization
- [x] Core inference engine (llama.cpp wrapper)
- [x] N-API bridge (Node.js ↔ C++)
- [x] API server with OpenAI compatibility
- [x] Model management system
- [x] Desktop application (functional UI)
- [x] Mobile companion app (all screens)
- [x] Streaming SSE with error handling
- [x] HuggingFace model downloader
- [x] Real-time system monitoring
- [ ] Model quantization tools
- [ ] Batch processing / parallel inference
- [ ] LoRA adapter support
- [ ] Vision model support (LLaVA)
- [ ] Plugin system for custom backends

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

---

**Haven LLM Studio** — Where intelligence finds shelter.
