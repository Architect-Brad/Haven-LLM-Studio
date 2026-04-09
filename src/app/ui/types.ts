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

export interface InferenceConfig {
  temperature: number;
  top_k: number;
  top_p: number;
  max_tokens: number;
  repeat_penalty: number;
  n_gpu_layers: number;
  multi_gpu: boolean;
}

export interface SystemStats {
  tokens_per_second: number;
  memory_used_mb: number;
  cpu_percent: number;
  memory_percent: number;
  inference_active: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface HealthResponse {
  status: string;
  uptime: number;
  native: boolean;
  nativeError?: string;
}

export interface LoadModelResponse {
  success: boolean;
  model: string;
  mode: 'native' | 'mock';
}

export interface ClusterNode {
  id: string;
  name: string;
  url: string;
  role: 'master' | 'worker';
  status: 'online' | 'offline' | 'degraded';
  capabilities: {
    gpus: any[];
    totalVramBytes: number;
    availableVramBytes: number;
    cpuCores: number;
    totalRamBytes: number;
  };
  loadedModel?: string;
}
