/**
 * Inference Service
 * Handles LLM inference operations with native layer integration
 */

import { EventEmitter } from 'events';
import { getNativeAddon, isNativeAvailable, NativeInferenceConfig } from './native-loader.js';

export interface InferenceOptions {
  temperature?: number;
  top_k?: number;
  top_p?: number;
  repeat_penalty?: number;
  max_tokens?: number;
  stop?: string[];
  stream?: boolean;
  n_ctx?: number;
  n_gpu_layers?: number;
  n_threads?: number;
  n_batch?: number;
}

export interface InferenceResult {
  text: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  stats: {
    load_time_ms: number;
    inference_time_ms: number;
    tokens_per_second: number;
  };
}

export class InferenceService extends EventEmitter {
  private modelLoaded: boolean = false;
  private currentModel: string | null = null;
  private isStreaming = false;

  /**
   * Initialize inference engine with model
   */
  async initialize(modelPath: string, config: InferenceOptions = {}): Promise<void> {
    const addon = getNativeAddon();

    if (addon) {
      console.log(`[Inference] Loading model via native: ${modelPath}`);
      const nativeConfig = this.toNativeConfig(config);
      const success = addon.loadModel(modelPath, nativeConfig);

      if (!success) {
        throw new Error(`Failed to load model: ${modelPath}`);
      }

      this.modelLoaded = true;
      this.currentModel = modelPath;
      this.emit('model:loaded', { model: modelPath, mode: 'native' });
    } else {
      // Fallback: mock mode
      console.warn(`[Inference] Native unavailable, using mock mode: ${modelPath}`);
      this.modelLoaded = true;
      this.currentModel = modelPath;
      this.emit('model:loaded', { model: modelPath, mode: 'mock' });
    }
  }

  /**
   * Run completion (blocking)
   */
  async complete(prompt: string, options: InferenceOptions = {}): Promise<InferenceResult> {
    if (!this.modelLoaded) {
      throw new Error('No model loaded. Call initialize() first.');
    }

    const addon = getNativeAddon();

    if (addon) {
      const nativeConfig = this.toNativeConfig(options);
      const result = addon.infer(prompt, nativeConfig);

      // Check for native errors
      const lastError = addon.getLastError();
      if (lastError) {
        console.warn(`[Inference] Native warning: ${lastError}`);
      }

      return {
        text: result.text,
        usage: {
          prompt_tokens: prompt.split(/\s+/).length,
          completion_tokens: result.tokensGenerated,
          total_tokens: prompt.split(/\s+/).length + result.tokensGenerated,
        },
        stats: {
          load_time_ms: 0,
          inference_time_ms: result.inferenceTimeMs,
          tokens_per_second: result.tokensPerSecond,
        },
      };
    }

    // Mock fallback
    const startTime = Date.now();
    const text = '[Mock response - native layer not available]';

    return {
      text,
      usage: {
        prompt_tokens: prompt.split(/\s+/).length,
        completion_tokens: text.split(/\s+/).length,
        total_tokens: prompt.split(/\s+/).length + text.split(/\s+/).length,
      },
      stats: {
        load_time_ms: 0,
        inference_time_ms: Date.now() - startTime,
        tokens_per_second: 0,
      },
    };
  }

  /**
   * Run completion with streaming
   */
  async completeStreaming(
    prompt: string,
    options: InferenceOptions = {},
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.modelLoaded) {
      throw new Error('No model loaded. Call initialize() first.');
    }

    if (this.isStreaming) {
      throw new Error('Streaming inference already in progress');
    }

    this.isStreaming = true;

    try {
      const addon = getNativeAddon();

      if (addon) {
        const nativeConfig = this.toNativeConfig(options);
        let fullText = '';

        await addon.inferStreaming(prompt, nativeConfig, (token: string, isEnd: boolean) => {
          if (!isEnd) {
            fullText += token;
            onChunk(token);
          }
        });

        this.emit('inference:complete', { text: fullText });
      } else {
        // Mock streaming fallback
        const chunks = ['This', ' is', ' a', ' mock', ' response', '.'];
        for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, 100));
          onChunk(chunk);
        }
      }
    } catch (error) {
      this.isStreaming = false;
      throw error;
    }

    this.isStreaming = false;
  }

  /**
   * Unload current model
   */
  async unload(): Promise<void> {
    if (!this.modelLoaded) {
      return;
    }

    const addon = getNativeAddon();
    if (addon) {
      addon.unloadModel();
    }

    console.log('[Inference] Model unloaded');
    this.modelLoaded = false;
    this.currentModel = null;
    this.emit('model:unloaded');
  }

  /**
   * Get current inference stats
   */
  getStats(): any {
    const addon = getNativeAddon();

    if (addon) {
      return {
        modelLoaded: this.modelLoaded,
        currentModel: this.currentModel,
        mode: 'native',
        ...addon.getStats(),
      };
    }

    return {
      modelLoaded: this.modelLoaded,
      currentModel: this.currentModel,
      mode: 'mock',
    };
  }

  /**
   * Check if native layer is available
   */
  isNativeAvailable(): boolean {
    return isNativeAvailable();
  }

  private toNativeConfig(options: InferenceOptions): NativeInferenceConfig {
    const config: NativeInferenceConfig = {};

    if (options.temperature !== undefined) config.temperature = options.temperature;
    if (options.top_k !== undefined) config.top_k = options.top_k;
    if (options.top_p !== undefined) config.top_p = options.top_p;
    if (options.repeat_penalty !== undefined) config.repeat_penalty = options.repeat_penalty;
    if (options.max_tokens !== undefined) config.max_tokens = options.max_tokens;
    if (options.n_ctx !== undefined) config.n_ctx = options.n_ctx;
    if (options.n_gpu_layers !== undefined) config.n_gpu_layers = options.n_gpu_layers;
    if (options.n_threads !== undefined) config.n_threads = options.n_threads;
    if (options.n_batch !== undefined) config.n_batch = options.n_batch;

    return config;
  }
}
