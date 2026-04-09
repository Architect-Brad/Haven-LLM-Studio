/**
 * Model Service
 * Handles model management operations with native integration
 */

import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { getNativeAddon, isNativeAvailable } from './native-loader.js';

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
  type: 'gguf' | 'gptq' | 'awq' | 'other';
  loaded: boolean;
  metadata?: {
    architecture?: string;
    parameters?: number;
    quantization?: string;
  };
}

export class ModelService extends EventEmitter {
  private modelsDir: string;
  private loadedModel: string | null = null;
  private loadedModelMetadata: ModelInfo['metadata'] | null = null;

  constructor(modelsDir?: string) {
    super();
    this.modelsDir = modelsDir || this.getDefaultModelsDir();

    // Ensure models directory exists
    this.ensureModelsDir();
  }

  private getDefaultModelsDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return join(home, '.haven', 'models');
  }

  private async ensureModelsDir(): Promise<void> {
    const { mkdir } = await import('fs/promises');
    if (!existsSync(this.modelsDir)) {
      await mkdir(this.modelsDir, { recursive: true });
      console.log(`[Model] Created models directory: ${this.modelsDir}`);
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];

    try {
      const files = await readdir(this.modelsDir);

      for (const file of files) {
        const filePath = join(this.modelsDir, file);
        const fileStat = await stat(filePath);

        if (fileStat.isFile() && this.isModelFile(file)) {
          const modelInfo: ModelInfo = {
            name: file,
            path: filePath,
            size: fileStat.size,
            type: this.detectModelType(file),
            loaded: this.loadedModel === filePath,
          };

          // If this is the loaded model, try to get native metadata
          if (this.loadedModel === filePath && this.loadedModelMetadata) {
            modelInfo.metadata = this.loadedModelMetadata;
          } else {
            modelInfo.metadata = await this.readModelMetadata(filePath);
          }

          models.push(modelInfo);
        }
      }
    } catch (error: any) {
      console.error('[Model] Error listing models:', error.message);
    }

    return models;
  }

  /**
   * Load a model into memory
   */
  async loadModel(modelPath: string, config?: any): Promise<void> {
    if (!existsSync(modelPath)) {
      throw new Error(`Model not found: ${modelPath}`);
    }

    if (this.loadedModel) {
      await this.unloadModel();
    }

    console.log(`[Model] Loading: ${modelPath}`);

    const addon = getNativeAddon();

    if (addon) {
      const nativeConfig = {
        n_ctx: config?.n_ctx || 512,
        n_batch: config?.n_batch || 512,
        n_threads: config?.n_threads || -1,
        n_gpu_layers: config?.n_gpu_layers || 0,
        temperature: config?.temperature || 0.8,
        top_k: config?.top_k || 40,
        top_p: config?.top_p || 0.9,
        repeat_penalty: config?.repeat_penalty || 1.1,
        max_tokens: config?.max_tokens || 256,
      };

      const success = addon.loadModel(modelPath, nativeConfig);
      if (!success) {
        throw new Error(`Native layer failed to load model: ${modelPath}`);
      }

      // Get native metadata
      try {
        const nativeInfo = addon.getModelInfo();
        this.loadedModelMetadata = {
          architecture: nativeInfo.architecture,
          parameters: nativeInfo.nParams,
          quantization: nativeInfo.type,
        };
      } catch {
        this.loadedModelMetadata = null;
      }
    }

    this.loadedModel = modelPath;
    this.emit('model:load', { path: modelPath, mode: addon ? 'native' : 'mock' });
  }

  /**
   * Unload current model
   */
  async unloadModel(): Promise<void> {
    if (!this.loadedModel) {
      return;
    }

    console.log(`[Model] Unloading: ${this.loadedModel}`);

    const addon = getNativeAddon();
    if (addon) {
      addon.unloadModel();
    }

    this.loadedModel = null;
    this.loadedModelMetadata = null;
    this.emit('model:unload');
  }

  /**
   * Delete a model file
   */
  async deleteModel(modelName: string): Promise<void> {
    const modelPath = join(this.modelsDir, modelName);

    if (!existsSync(modelPath)) {
      throw new Error(`Model not found: ${modelName}`);
    }

    if (this.loadedModel === modelPath) {
      await this.unloadModel();
    }

    await unlink(modelPath);
    console.log(`[Model] Deleted: ${modelName}`);
    this.emit('model:delete', { name: modelName });
  }

  /**
   * Download model from HuggingFace
   */
  async downloadFromHuggingFace(
    repoId: string,
    filename: string,
    onProgress?: (progress: number, speed: number) => void
  ): Promise<string> {
    const { downloadFile } = await import('../utils/huggingface.js');

    const destination = join(this.modelsDir, filename);

    console.log(`[Model] Downloading ${repoId}/${filename}`);

    await downloadFile(repoId, filename, destination, onProgress);

    this.emit('model:download', { repoId, filename, destination });

    return destination;
  }

  /**
   * Get currently loaded model
   */
  getLoadedModel(): string | null {
    return this.loadedModel;
  }

  /**
   * Get loaded model metadata
   */
  getLoadedModelMetadata(): ModelInfo['metadata'] | null {
    return this.loadedModelMetadata;
  }

  private isModelFile(filename: string): boolean {
    const modelExtensions = ['.gguf', '.ggml', '.bin', '.safetensors'];
    return modelExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private detectModelType(filename: string): ModelInfo['type'] {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.gguf')) return 'gguf';
    if (lower.endsWith('.bin')) return 'gptq';
    if (lower.includes('awq')) return 'awq';
    return 'other';
  }

  private async readModelMetadata(modelPath: string): Promise<any> {
    // Try to parse basic info from filename as fallback
    const filename = modelPath.split(/[/\\]/).pop() || '';

    // Attempt to extract architecture from filename patterns
    let architecture = 'unknown';
    if (filename.toLowerCase().includes('llama')) architecture = 'llama';
    else if (filename.toLowerCase().includes('mistral')) architecture = 'mistral';
    else if (filename.toLowerCase().includes('qwen')) architecture = 'qwen';
    else if (filename.toLowerCase().includes('phi')) architecture = 'phi';

    // Extract quantization from filename
    let quantization = 'unknown';
    const quantMatch = filename.match(/(Q[0-9]+_[A-Z0-9]+)/i);
    if (quantMatch) quantization = quantMatch[1];

    return {
      architecture,
      quantization,
    };
  }
}
