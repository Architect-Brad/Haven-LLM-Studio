/**
 * Haven SDK — Local AI Inference
 * 
 * Run LLMs directly in Node.js with native performance.
 * 
 * @example
 * ```typescript
 * import { Haven } from '@haven/sdk';
 * 
 * const haven = new Haven();
 * 
 * await haven.loadModel('~/.haven/models/llama-3.2-3b.Q4_K_M.gguf');
 * 
 * const result = await haven.infer('What is quantum computing?');
 * console.log(result.text);
 * 
 * for await (const token of haven.stream('Write a haiku')) {
 *   process.stdout.write(token);
 * }
 * ```
 */

export { Haven } from './haven.js';
export { HavenError, HavenErrorCode } from './errors.js';
export type {
  HavenConfig,
  InferenceResult,
  EmbeddingResult,
  ModelInfo,
  InferenceStats,
  TokenCallback,
} from './types.js';
export type { HavenEvents } from './events.js';
