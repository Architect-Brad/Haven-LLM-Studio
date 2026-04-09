/**
 * Haven SDK — Error Types
 */

export enum HavenErrorCode {
  // Native layer errors
  NATIVE_NOT_FOUND = 'NATIVE_NOT_FOUND',
  NATIVE_LOAD_FAILED = 'NATIVE_LOAD_FAILED',
  NATIVE_NOT_AVAILABLE = 'NATIVE_NOT_AVAILABLE',
  NATIVE_WARNING = 'NATIVE_WARNING',

  // Model errors
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  NO_MODEL_LOADED = 'NO_MODEL_LOADED',

  // Inference errors
  STREAMING_BUSY = 'STREAMING_BUSY',
  STREAM_FAILED = 'STREAM_FAILED',
  INFERENCE_FAILED = 'INFERENCE_FAILED',

  // Config errors
  INVALID_CONFIG = 'INVALID_CONFIG',
}

export class HavenError extends Error {
  public readonly code: HavenErrorCode;
  public readonly details?: Record<string, any>;

  constructor(code: HavenErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'HavenError';
    this.code = code;
    this.details = details;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, HavenError.prototype);
  }

  static isHavenError(error: unknown): error is HavenError {
    return error instanceof HavenError;
  }
}
