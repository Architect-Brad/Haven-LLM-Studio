/**
 * Native Layer Loader
 * Loads the N-API addon and provides a typed interface
 * Supports: prebuilt binary → node-gyp build → graceful mock fallback
 */

import * as path from 'path';
import * as fs from 'fs';

export interface NativeInferenceConfig {
  n_ctx?: number;
  n_batch?: number;
  n_threads?: number;
  n_gpu_layers?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  repeat_penalty?: number;
  max_tokens?: number;
}

export interface NativeModelInfo {
  path: string;
  name: string;
  type: string;
  sizeBytes: number;
  nParams: number;
  architecture: string;
}

export interface NativeInferenceStats {
  loadTimeMs: number;
  inferenceTimeMs: number;
  tokensGenerated: number;
  tokensPerSecond: number;
  memoryUsedBytes: number;
}

export interface NativeInferenceResult {
  text: string;
  tokensGenerated: number;
  inferenceTimeMs: number;
  tokensPerSecond: number;
}

export interface NativeEmbeddingResult {
  embedding: number[];
  tokensProcessed: number;
  computeTimeMs: number;
}

// N-API addon interface
interface HavenAddonInterface {
  loadModel(modelPath: string, config: NativeInferenceConfig): boolean;
  unloadModel(): void;
  isModelLoaded(): boolean;
  getModelInfo(): NativeModelInfo;
  infer(prompt: string, config: NativeInferenceConfig): NativeInferenceResult;
  inferStreaming(
    prompt: string,
    config: NativeInferenceConfig,
    callback: (token: string, isEnd: boolean) => void
  ): Promise<boolean>;
  embed(text: string): NativeEmbeddingResult;
  getStats(): NativeInferenceStats;
  resetStats(): void;
  getLastError(): string;
}

let addon: HavenAddonInterface | null = null;
let loadError: string | null = null;
let loadAttempted = false;

/**
 * Find the native addon binary across platforms
 */
function findAddonPath(): string | null {
  const nativeRoot = path.join(__dirname, '../../../native');

  const searchPaths = [
    // node-gyp build output
    path.join(nativeRoot, 'build', 'Release', 'haven_core.node'),
    path.join(nativeRoot, 'build', 'haven_core.node'),
    // Prebuilt binaries
    path.join(nativeRoot, 'prebuilds', `node-napi-${process.platform}-${process.arch}`, 'haven_core.node'),
    path.join(nativeRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'haven_core.node'),
    // CMake build output (less common for node addons)
    path.join(nativeRoot, 'build', 'Release', 'libhaven_core.node'),
  ];

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Ignore filesystem errors
    }
  }

  return null;
}

/**
 * Attempt to load the native addon
 * Returns true if successful, false if native layer is unavailable
 */
export function loadNativeAddon(): boolean {
  if (addon) return true;
  if (loadAttempted) return false;
  loadAttempted = true;

  try {
    const addonPath = findAddonPath();

    if (!addonPath) {
      loadError = [
        'Native addon binary not found. Searched:',
        '  - native/build/Release/haven_core.node',
        '  - native/prebuilds/<platform>-<arch>/haven_core.node',
        '',
        'To build:',
        '  1. Ensure llama.cpp submodule: git submodule update --init --recursive',
        '  2. Install cmake: brew install cmake / apt install cmake',
        '  3. Build: npm run build:core && npm run build:native-addon',
        '',
        'Server will run in mock mode — inference returns placeholders.',
      ].join('\n');
      console.warn(`[Native] ${loadError}`);
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addonModule = require(addonPath);
    addon = new addonModule.HavenAddon();
    console.log(`[Native] Native addon loaded: ${path.basename(addonPath)}`);
    return true;
  } catch (error: any) {
    loadError = error.message;
    console.warn(`[Native] Failed to load native addon: ${error.message}`);
    console.warn('[Native] Server will run in mock mode');
    return false;
  }
}

/**
 * Get the native addon instance (or null if unavailable)
 */
export function getNativeAddon(): HavenAddonInterface | null {
  if (!addon) {
    loadNativeAddon();
  }
  return addon;
}

/**
 * Check if native layer is available
 */
export function isNativeAvailable(): boolean {
  if (addon) return true;
  return loadNativeAddon();
}

/**
 * Get the load error message if any
 */
export function getLoadError(): string | null {
  return loadError;
}

/**
 * Get native availability status for health checks
 */
export function getNativeStatus(): { available: boolean; mode: string; error?: string } {
  if (addon) {
    return { available: true, mode: 'native' };
  }

  const available = loadNativeAddon();
  if (available) {
    return { available: true, mode: 'native' };
  }

  return {
    available: false,
    mode: 'mock',
    error: loadError || 'Native addon not built',
  };
}
