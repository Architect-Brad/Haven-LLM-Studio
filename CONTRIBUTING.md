# Contributing to Haven LLM Studio

Thank you for your interest in contributing! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `npm install`
5. Initialize submodules: `git submodule update --init --recursive`

## Development

### Setup
```bash
# Install dependencies
npm install

# Build native core
npm run build:core

# Start development
npm run dev
```

### Code Style

- **TypeScript**: Strict mode enabled
- **C++**: C++17 standard
- **Formatting**: Prettier (auto-formatted on commit)
- **Linting**: ESLint for TypeScript, clang-tidy for C++

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add GPU layer auto-detection
fix: resolve memory leak in model unloading
docs: update API documentation
refactor: improve inference pipeline
test: add benchmarks for Q4_K_M models
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass: `npm test`
4. Update CHANGELOG.md
5. Request review from maintainers

## Architecture Overview

### Core Components

1. **Native Core** (`native/`)
   - C++ inference engine wrapper
   - llama.cpp integration
   - Model management
   - Optimization layer

2. **Server** (`src/server/`)
   - Express.js API server
   - OpenAI-compatible endpoints
   - WebSocket real-time stats
   - Model service

3. **Desktop App** (`src/app/`)
   - Electron main process
   - React UI (coming soon)
   - IPC communication

4. **Mobile App** (`mobile/`)
   - React Native
   - Remote server management
   - Real-time monitoring

## Testing

### Unit Tests
```bash
npm test
```

### Benchmarks
```bash
npm run test:bench
```

### Manual Testing

1. Load a model
2. Test inference with various parameters
3. Monitor memory usage
4. Test concurrent requests

## Feature Ideas

Looking to contribute but not sure where? Here are some ideas:

- [ ] **Batch Processing**: Support for processing multiple prompts in parallel
- [ ] **Model Quantization**: Built-in quantization tools
- [ ] **Preset Configurations**: One-click optimization presets
- [ ] **Plugin System**: Extensible architecture for custom backends
- [ ] **Cloud Sync**: Sync models and configs across devices
- [ ] **Benchmark Suite**: Comprehensive performance testing
- [ ] **Model Merging**: Merge multiple LoRA adapters
- [ ] **Vision Support**: LLaVA and other vision-language models

## Questions?

- **General**: [GitHub Discussions](https://github.com/Architect-Brad/Haven-LLM-Studio/discussions)
- **Bugs**: [GitHub Issues](https://github.com/Architect-Brad/Haven-LLM-Studio/issues)
- **Chat**: [Discord](https://discord.gg/haven-llm)

## Code of Conduct

Be respectful and inclusive. We welcome contributors of all backgrounds.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
