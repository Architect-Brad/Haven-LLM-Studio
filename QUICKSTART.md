# Haven LLM Studio — Quick Start Guide

## 5-Minute Setup

### 1. Install & Build
```bash
./setup.sh          # Automated setup (recommended)
# OR manually:
npm install
git submodule update --init --recursive
npm run build:core
```

### 2. Add a Model
```bash
# Download a GGUF model to ~/.haven/models/
# Example: Get Llama 3.2 3B from HuggingFace
mkdir -p ~/.haven/models
# (Use the mobile app's Model Browser or download manually)
```

### 3. Start the Server
```bash
npm run server      # Server only (port 1234)
# OR
npm run dev         # Server + desktop UI
```

### 4. Test It
```bash
# Health check
curl http://localhost:1234/health

# Load a model
curl -X POST http://localhost:1234/api/models/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "~/.haven/models/your-model.gguf"}'

# Chat
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```

## Using the Desktop App

1. Open Haven LLM Studio
2. Models from `~/.haven/models/` appear in the sidebar
3. Click **Load** on any model
4. Adjust inference settings in the right panel
5. Monitor real-time stats in the main panel

## Using the Mobile App

```bash
cd mobile
npm install
npm start
```

1. Add your server URL (e.g., `http://192.168.1.100:1234`)
2. View real-time stats, manage models, browse HuggingFace

## GPU Acceleration

### NVIDIA (CUDA)
```bash
cmake -B native/build -DHAVEN_CUDA_SUPPORT=ON
cmake --build native/build
```

### Apple Silicon (Metal)
```bash
cmake -B native/build -DHAVEN_METAL_SUPPORT=ON
cmake --build native/build
```

### Vulkan (Linux/Windows)
```bash
cmake -B native/build -DHAVEN_VULKAN_SUPPORT=ON
cmake --build native/build
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 1234 in use | Set `HAVEN_PORT=1235` |
| Native addon not found | Run `npm run build:native-addon` |
| Model won't load | Check GGUF format, file permissions, RAM |
| Slow inference | Enable GPU offload, use Q4_K_M quantization |
| Out of memory | Use smaller models, reduce context size |

## Next Steps

- Read the full [README](./README.md)
- Check [SETUP.md](./SETUP.md) for detailed instructions
- Contribute: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Run benchmarks: `npm run test:bench`
- Run tests: `npm test`
