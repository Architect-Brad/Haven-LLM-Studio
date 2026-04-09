/**
 * Haven SDK — Event Definitions
 */

import type { InferenceResult, ModelInfo, InferenceStats, HavenConfig } from './types.js';
import type { HavenError } from './errors.js';

export interface HavenEvents {
  'native:loaded': (data: { path: string }) => void;
  'model:loaded': (info: ModelInfo) => void;
  'model:unloaded': (data: { path: string }) => void;
  'inference:complete': (result: InferenceResult) => void;
  'token': (token: string) => void;
  'stream:end': () => void;
  'config:updated': (config: HavenConfig) => void;
  'stats:reset': () => void;
  'warning': (error: HavenError) => void;
  'error': (error: HavenError) => void;
}
