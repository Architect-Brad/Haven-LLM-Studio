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

### Security

Haven includes built-in security features to protect your local inference:

- **Rate Limiting** — Prevents abuse (100 req/min default, configurable)
- **API Key Authentication** — Optional key-based auth for network exposure
- **CORS Protection** — Restricted to localhost origins by default
- **Prompt Injection Prevention** — Detects and blocks common injection patterns
- **Output Filtering** — Monitors responses for system prompt leakage
- **Request Size Limits** — Prevents memory exhaustion attacks

Configure via environment variables (see `.env.example`):
```bash
HAVEN_API_KEY=your-secret-key
HAVEN_RATE_LIMIT=true
HAVEN_RATE_LIMIT_MAX=100
```

## Virtual Private AI Network (VPAN)

VPAN lets you share one powerful Haven instance across your entire household:

### How It Works
```
┌─────────────────────────────────────────────────────────┐
│                    Home Network                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                        │
│  │ Dad's PC    │  ← Haven Server (RTX 4070)            │
│  │ (Host)      │     • Runs the model                   │
│  │             │     • Manages users                    │
│  │             │     • Queues requests                  │
│  └──────┬──────┘                                        │
│         │ WiFi/Ethernet                                 │
│  ┌──────┴──────┬──────────────┬──────────────┐         │
│  │             │              │              │         │
│  ▼             ▼              ▼              ▼         │
│ Mom's      Teen's        Kid's        Smart TV         │
│ MacBook    iPhone        iPad         (future)         │
│             │              │                           │
│  Browser    Haven App     Web Chat                     │
└─────────────────────────────────────────────────────────┘
```

### Features
- **User Management** — Create family member accounts with individual API keys
- **Request Queue** — Fair scheduling when multiple people ask at once
- **Content Filtering** — Parental controls for child accounts
- **Usage Tracking** — See who's using what and how much
- **Pipeline Parallelism** — Distribute model layers across multiple devices

### Setup
1. Start Haven with `HAVEN_HOST=0.0.0.0` to expose to your LAN
2. Create family member accounts via the VPAN admin dashboard (`/vpan`)
3. Share API keys with family members
4. Family members access via:
   - Web chat: `http://<server-ip>/chat`
   - Mobile app: Add server URL in settings
   - API: Use their personal API key with `X-Haven-API-Key` header

### VPAN API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vpan/me` | Get current user info |
| GET | `/api/vpan/users` | List all users (admin) |
| POST | `/api/vpan/users` | Create user (admin) |
| DELETE | `/api/vpan/users/:id` | Delete user (admin) |
| POST | `/api/vpan/users/:id/key` | Regenerate API key (admin) |
| GET | `/api/vpan/nodes` | Pipeline node status |
| GET | `/api/vpan/queue` | Request queue status |
| GET | `/api/vpan/stats` | Network-wide statistics |
| POST | `/api/vpan/infer` | Submit inference request |
| GET | `/api/vpan/requests/:id` | Check request status |
| DELETE | `/api/vpan/requests/:id` | Cancel request |

## iOS / iPadOS Support

Haven supports iOS/iPadOS through two approaches:

### Option 1: Remote Server (Recommended)
Run Haven on a remote machine (Linux/macOS/Windows) and connect from iOS via Safari:
```bash
# On your remote server:
HAVEN_HOST=0.0.0.0 npm run server

# On iOS: Open Safari and navigate to http://<server-ip>:1234
```

### Option 2: MLX Swift (Native On-Device)
Apple's MLX framework enables native on-device inference on iOS:
- **Performance**: 22-37 t/s on iPhone 16 Pro (Qwen 1.5B Q4)
- **Framework**: MLX Swift with Metal GPU acceleration
- **Model Format**: MLX safetensors (conversion from GGUF required)
- **Battery**: ~10% drain per 200 inferences

Native MLX Swift support for Haven is in development. Follow our [GitHub](https://github.com/Architect-Brad/Haven-LLM-Studio) for updates.

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
