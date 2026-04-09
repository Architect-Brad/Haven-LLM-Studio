/**
 * Haven SDK — Type Definitions
 */

export interface HavenConfig {
  n_ctx: number;
  n_batch: number;
  n_threads: number;
  n_gpu_layers: number;
  temperature: number;
  top_k: number;
  top_p: number;
  repeat_penalty: number;
  max_tokens: number;
  multi_gpu: boolean;
  main_gpu: number;
  tensor_split?: number[];
}

export interface InferenceResult {
  text: string;
  tokensGenerated: number;
  inferenceTimeMs: number;
  tokensPerSecond: number;
}

export interface EmbeddingResult {
  embedding: number[];
  tokensProcessed: number;
  computeTimeMs: number;
}

export interface ModelInfo {
  path: string;
  name: string;
  type: string;
  sizeBytes: number;
  nParams: number;
  architecture: string;
}

export interface InferenceStats {
  loadTimeMs: number;
  inferenceTimeMs: number;
  tokensGenerated: number;
  tokensPerSecond: number;
  memoryUsedBytes: number;
}

export type TokenCallback = (token: string) => void;
