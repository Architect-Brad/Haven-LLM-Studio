# Changelog

All notable changes to Haven LLM Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- N-API bridge for native C++ ↔ Node.js inference engine integration
- Native embedding support (`/v1/embeddings` endpoint with llama.cpp)
- React-based desktop UI with Vite build pipeline
- Mobile app with Zustand state management and Haven API client
- HuggingFace model browser with search and download (mobile)
- Delta-based real-time CPU monitoring
- Streaming SSE with proper error handling and client disconnect cleanup
- Chat template formatting with system prompt support
- Unit test suite for server services
- Benchmark suite for performance measurement
- `setup.sh` script for automated project initialization
- `.env.example` for configuration management
- Model metadata extraction from native layer

### Fixed
- HuggingFace downloader redirect handling
- SystemMonitor CPU calculation (was cumulative, now delta-based)
- Electron security navigation rules
- Desktop app dev mode loading

### Changed
- Server services wired to native layer with graceful mock fallback
- Mobile app connected to real Haven server via axios client
- Desktop UI fully functional with fetch + WebSocket integration
- Build system updated with Vite for React UI

## [0.1.0] - 2026-01-01

### Added
- Initial project structure
- Core inference engine (llama.cpp wrapper)
- Express.js API server with OpenAI-compatible endpoints
- Electron desktop app skeleton
- React Native mobile app skeleton
- HuggingFace downloader utility
- System monitoring service
- CMake build configuration
- Documentation (README, SETUP, CONTRIBUTING)
