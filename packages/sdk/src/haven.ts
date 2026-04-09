/**
 * Haven SDK — Core Inference Engine
 * Wraps the native N-API addon with a clean, event-driven API
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import type {
  HavenConfig,
  InferenceResult,
  EmbeddingResult,
  ModelInfo,
  InferenceStats,
  TokenCallback,
} from './types.js';
import { HavenError, HavenErrorCode } from './errors.js';
import type { HavenEvents } from './events.js';

// Native addon interface (loaded dynamically)
interface HavenAddon {
  loadModel(modelPath: string, config: Record<string, any>): boolean;
  unloadModel(): void;
  isModelLoaded(): boolean;
  getModelInfo(): Record<string, any>;
  infer(prompt: string, config: Record<string, any>): Record<string, any>;
  inferStreaming(
    prompt: string,
    config: Record<string, any>,
    callback: (token: string, isEnd: boolean) => void
  ): Promise<boolean>;
  embed(text: string): Record<string, any>;
  getStats(): Record<string, any>;
  resetStats(): void;
  getLastError(): string;
}

export class Haven extends EventEmitter<HavenEvents> {
  private addon: HavenAddon | null = null;
  private config: HavenConfig;
  private loadedModelPath: string | null = null;
  private isStreaming = false;

  constructor(config: Partial<HavenConfig> = {}) {
    super();
    this.config = {
      n_ctx: config.n_ctx ?? 512,
      n_batch: config.n_batch ?? 512,
      n_threads: config.n_threads ?? -1,
      n_gpu_layers: config.n_gpu_layers ?? 0,
      temperature: config.temperature ?? 0.8,
      top_k: config.top_k ?? 40,
      top_p: config.top_p ?? 0.9,
      repeat_penalty: config.repeat_penalty ?? 1.1,
      max_tokens: config.max_tokens ?? 256,
      multi_gpu: config.multi_gpu ?? false,
      main_gpu: config.main_gpu ?? 0,
      tensor_split: config.tensor_split,
    };

    this.loadNativeAddon();
  }

  // ── Native Loading ───────────────────────────────────────────

  private loadNativeAddon(): void {
    try {
      const addonPath = this.findAddonPath();

      if (!addonPath) {
        this.emit('error', new HavenError(
          HavenErrorCode.NATIVE_NOT_FOUND,
          'Native addon not found. Run: npm run build:native-addon'
        ));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const addonModule = require(addonPath);
      this.addon = new addonModule.HavenAddon();
      this.emit('native:loaded', { path: addonPath });
    } catch (error: any) {
      this.emit('error', new HavenError(
        HavenErrorCode.NATIVE_LOAD_FAILED,
        `Failed to load native addon: ${error.message}`,
        { cause: error }
      ));
    }
  }

  private findAddonPath(): string | null {
    const searchPaths = [
      // Local development
      path.join(__dirname, '../../native/build/Release/haven_core.node'),
      path.join(__dirname, '../../native/build/haven_core.node'),
      // Installed package
      path.join(__dirname, '../native/haven_core.node'),
      // Prebuilds
      path.join(__dirname, `../prebuilds/node-napi-${process.platform}-${process.arch}/haven_core.node`),
    ];

    for (const p of searchPaths) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        // Ignore
      }
    }

    return null;
  }

  // ── Model Management ─────────────────────────────────────────

  async loadModel(modelPath: string, config?: Partial<HavenConfig>): Promise<ModelInfo> {
    if (!this.addon) {
      throw new HavenError(
        HavenErrorCode.NATIVE_NOT_AVAILABLE,
        'Native layer not available. Check error events.'
      );
    }

    // Resolve ~ in path
    if (modelPath.startsWith('~')) {
      modelPath = path.join(process.env.HOME || process.env.USERPROFILE || '', modelPath.slice(1));
    }

    if (!fs.existsSync(modelPath)) {
      throw new HavenError(
        HavenErrorCode.MODEL_NOT_FOUND,
        `Model file not found: ${modelPath}`
      );
    }

    const mergedConfig = { ...this.config, ...config };
    const nativeConfig = this.toNativeConfig(mergedConfig);

    const success = this.addon.loadModel(modelPath, nativeConfig);

    if (!success) {
      const error = this.addon.getLastError();
      throw new HavenError(
        HavenErrorCode.MODEL_LOAD_FAILED,
        `Failed to load model: ${error || 'unknown error'}`
      );
    }

    this.loadedModelPath = modelPath;
    const modelInfo = this.addon.getModelInfo();

    const info: ModelInfo = {
      path: modelInfo.path,
      name: modelInfo.name,
      type: modelInfo.type,
      sizeBytes: modelInfo.sizeBytes,
      nParams: modelInfo.nParams,
      architecture: modelInfo.architecture,
    };

    this.emit('model:loaded', info);
    return info;
  }

  async unloadModel(): Promise<void> {
    if (!this.addon) return;

    this.addon.unloadModel();
    const wasLoaded = this.loadedModelPath;
    this.loadedModelPath = null;

    if (wasLoaded) {
      this.emit('model:unloaded', { path: wasLoaded });
    }
  }

  isModelLoaded(): boolean {
    return this.addon?.isModelLoaded() ?? false;
  }

  getModelInfo(): ModelInfo | null {
    if (!this.addon || !this.addon.isModelLoaded()) return null;

    const modelInfo = this.addon.getModelInfo();
    return {
      path: modelInfo.path,
      name: modelInfo.name,
      type: modelInfo.type,
      sizeBytes: modelInfo.sizeBytes,
      nParams: modelInfo.nParams,
      architecture: modelInfo.architecture,
    };
  }

  // ── Inference ────────────────────────────────────────────────

  async infer(prompt: string, config?: Partial<HavenConfig>): Promise<InferenceResult> {
    if (!this.addon) {
      throw new HavenError(HavenErrorCode.NATIVE_NOT_AVAILABLE, 'Native layer not available');
    }

    if (!this.addon.isModelLoaded()) {
      throw new HavenError(HavenErrorCode.NO_MODEL_LOADED, 'No model loaded');
    }

    const mergedConfig = { ...this.config, ...config };
    const nativeConfig = this.toNativeConfig(mergedConfig);

    const result = this.addon.infer(prompt, nativeConfig);

    const lastError = this.addon.getLastError();
    if (lastError) {
      this.emit('warning', new HavenError(
        HavenErrorCode.NATIVE_WARNING,
        `Native layer warning: ${lastError}`
      ));
    }

    const inferenceResult: InferenceResult = {
      text: result.text,
      tokensGenerated: result.tokensGenerated,
      inferenceTimeMs: result.inferenceTimeMs,
      tokensPerSecond: result.tokensPerSecond,
    };

    this.emit('inference:complete', inferenceResult);
    return inferenceResult;
  }

  async *stream(
    prompt: string,
    config?: Partial<HavenConfig>
  ): AsyncGenerator<string, void, unknown> {
    if (!this.addon) {
      throw new HavenError(HavenErrorCode.NATIVE_NOT_AVAILABLE, 'Native layer not available');
    }

    if (!this.addon.isModelLoaded()) {
      throw new HavenError(HavenErrorCode.NO_MODEL_LOADED, 'No model loaded');
    }

    if (this.isStreaming) {
      throw new HavenError(HavenErrorCode.STREAMING_BUSY, 'Inference already in progress');
    }

    this.isStreaming = true;

    try {
      const mergedConfig = { ...this.config, ...config };
      const nativeConfig = this.toNativeConfig(mergedConfig);

      await new Promise<void>((resolve, reject) => {
        this.addon!.inferStreaming(prompt, nativeConfig, (token: string, isEnd: boolean) => {
          if (isEnd) {
            resolve();
          } else {
            this.emit('token', token);
          }
        }).catch(reject);
      });

      this.emit('stream:end');
    } catch (error: any) {
      this.emit('error', new HavenError(
        HavenErrorCode.STREAM_FAILED,
        `Streaming failed: ${error.message}`,
        { cause: error }
      ));
      throw error;
    } finally {
      this.isStreaming = false;
    }
  }

  // ── Embeddings ───────────────────────────────────────────────

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.addon) {
      throw new HavenError(HavenErrorCode.NATIVE_NOT_AVAILABLE, 'Native layer not available');
    }

    if (!this.addon.isModelLoaded()) {
      throw new HavenError(HavenErrorCode.NO_MODEL_LOADED, 'No model loaded');
    }

    const result = this.addon.embed(text);

    return {
      embedding: result.embedding,
      tokensProcessed: result.tokensProcessed,
      computeTimeMs: result.computeTimeMs,
    };
  }

  // ── Stats ────────────────────────────────────────────────────

  getStats(): InferenceStats {
    if (!this.addon) {
      return {
        loadTimeMs: 0,
        inferenceTimeMs: 0,
        tokensGenerated: 0,
        tokensPerSecond: 0,
        memoryUsedBytes: 0,
      };
    }

    const stats = this.addon.getStats();
    return {
      loadTimeMs: stats.loadTimeMs,
      inferenceTimeMs: stats.inferenceTimeMs,
      tokensGenerated: stats.tokensGenerated,
      tokensPerSecond: stats.tokensPerSecond,
      memoryUsedBytes: stats.memoryUsedBytes,
    };
  }

  resetStats(): void {
    this.addon?.resetStats();
    this.emit('stats:reset');
  }

  // ── Utility ──────────────────────────────────────────────────

  isNativeAvailable(): boolean {
    return this.addon !== null;
  }

  getConfig(): HavenConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<HavenConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  // ── Helpers ──────────────────────────────────────────────────

  private toNativeConfig(config: HavenConfig): Record<string, any> {
    const native: Record<string, any> = {
      n_ctx: config.n_ctx,
      n_batch: config.n_batch,
      n_threads: config.n_threads,
      n_gpu_layers: config.n_gpu_layers,
      temperature: config.temperature,
      top_k: config.top_k,
      top_p: config.top_p,
      repeat_penalty: config.repeat_penalty,
      max_tokens: config.max_tokens,
    };

    if (config.multi_gpu) {
      native.multi_gpu = true;
      native.main_gpu = config.main_gpu;
      if (config.tensor_split) {
        native.tensor_split = config.tensor_split;
      }
    }

    return native;
  }
}
