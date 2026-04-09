/**
 * Haven Native Inference Bridge (React Native ↔ Android Native)
 * Provides local on-device inference with Android-specific features
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { HavenNative } = NativeModules;

export interface LocalInferenceConfig {
  temperature?: number;
  top_k?: number;
  top_p?: number;
  max_tokens?: number;
  repeat_penalty?: number;
  n_ctx?: number;
  n_gpu_layers?: number;
  n_threads?: number;
}

export interface LocalInferenceResult {
  text: string;
  tokensGenerated: number;
  inferenceTimeMs: number;
  tokensPerSecond: number;
}

export interface DeviceThermalStatus {
  thermalStatus: 'normal' | 'light' | 'moderate' | 'severe' | 'critical';
  powerSaveMode: boolean;
  batteryOptimizationExempt: boolean;
}

export interface LocalModelInfo {
  name: string;
  path: string;
  size: number;
  type: 'gguf';
  loaded: boolean;
}

class HavenLocalInference {
  private eventEmitter: any;
  private isNativeAvailable = false;

  constructor() {
    if (HavenNative) {
      this.isNativeAvailable = true;
      this.eventEmitter = new NativeEventEmitter(HavenNative);
    }
  }

  // ── Model Management ─────────────────────────────────────────

  async loadModel(modelPath: string, config: LocalInferenceConfig = {}): Promise<boolean> {
    if (!this.isNativeAvailable) {
      throw new Error('Native inference not available on this platform');
    }
    return HavenNative.loadModel(modelPath, config);
  }

  async unloadModel(): Promise<boolean> {
    if (!this.isNativeAvailable) return false;
    return HavenNative.unloadModel();
  }

  async isModelLoaded(): Promise<boolean> {
    if (!this.isNativeAvailable) return false;
    return HavenNative.isModelLoaded();
  }

  // ── Inference ────────────────────────────────────────────────

  async infer(prompt: string, config: LocalInferenceConfig = {}): Promise<LocalInferenceResult> {
    if (!this.isNativeAvailable) {
      return {
        text: '[Mock - native not available]',
        tokensGenerated: 0,
        inferenceTimeMs: 0,
        tokensPerSecond: 0,
      };
    }
    return HavenNative.infer(prompt, config);
  }

  async inferStreaming(
    prompt: string,
    config: LocalInferenceConfig = {},
    onToken: (token: string, isEnd: boolean) => void,
  ): Promise<void> {
    if (!this.isNativeAvailable) {
      onToken('[Mock]', true);
      return;
    }

    const callbackId = Date.now();

    // Register callback
    const subscription = this.eventEmitter.addListener(
      'token_stream',
      (data: { callbackId: number; token: string; isEnd: boolean }) => {
        if (data.callbackId === callbackId) {
          onToken(data.token, data.isEnd);
          if (data.isEnd) {
            subscription.remove();
          }
        }
      },
    );

    await HavenNative.inferStreaming(prompt, config, callbackId);
  }

  async stopStreaming(): Promise<void> {
    if (!this.isNativeAvailable) return;
    return HavenNative.stopStreaming();
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(): Promise<LocalInferenceResult> {
    if (!this.isNativeAvailable) {
      return { text: '', tokensGenerated: 0, inferenceTimeMs: 0, tokensPerSecond: 0 };
    }
    return HavenNative.getStats();
  }

  // ── Android-specific: Battery & Thermal ──────────────────────

  async getDeviceThermalStatus(): Promise<DeviceThermalStatus> {
    if (!this.isNativeAvailable || Platform.OS !== 'android') {
      return {
        thermalStatus: 'normal',
        powerSaveMode: false,
        batteryOptimizationExempt: false,
      };
    }
    return HavenNative.getDeviceThermalStatus();
  }

  async requestBatteryOptimizationExemption(): Promise<boolean> {
    if (!this.isNativeAvailable || Platform.OS !== 'android') return false;
    return HavenNative.requestBatteryOptimizationExemption();
  }

  // ── Utility ──────────────────────────────────────────────────

  isAvailable(): boolean {
    return this.isNativeAvailable;
  }

  onModelLoaded(callback: (data: { model: string; mode: string }) => void) {
    if (!this.isNativeAvailable) return () => {};
    return this.eventEmitter.addListener('model:loaded', callback);
  }

  onModelUnloaded(callback: () => void) {
    if (!this.isNativeAvailable) return () => {};
    return this.eventEmitter.addListener('model:unloaded', callback);
  }
}

export const localInference = new HavenLocalInference();
