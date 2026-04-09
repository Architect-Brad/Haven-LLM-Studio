/**
 * Haven API Client for Mobile
 * Communicates with Haven LLM Studio server
 */

import axios, { AxiosInstance } from 'axios';

export interface ServerStats {
  timestamp: number;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  inference: {
    tokens_per_second: number;
    active: boolean;
  };
}

export interface ServerModel {
  name: string;
  path: string;
  size: number;
  type: string;
  loaded: boolean;
  metadata?: {
    architecture?: string;
    parameters?: number;
    quantization?: string;
  };
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpu: {
    model: string;
    cores: number;
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
}

export interface HealthCheck {
  status: string;
  uptime: number;
  native: boolean;
}

export class HavenClient {
  private axios: AxiosInstance;
  public baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async health(): Promise<HealthCheck> {
    const { data } = await this.axios.get('/health');
    return data;
  }

  async getStats(): Promise<ServerStats> {
    const { data } = await this.axios.get('/api/stats');
    return data;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const { data } = await this.axios.get('/api/system');
    return data;
  }

  async getModels(): Promise<ServerModel[]> {
    const { data } = await this.axios.get('/api/models');
    return data.data || [];
  }

  async loadModel(modelPath: string, config?: Record<string, any>): Promise<{ success: boolean; mode: string }> {
    const { data } = await this.axios.post('/api/models/load', {
      model_path: modelPath,
      config,
    });
    return data;
  }

  async unloadModel(): Promise<void> {
    await this.axios.post('/api/models/unload');
  }

  async chatCompletion(
    messages: { role: string; content: string }[],
    options?: { max_tokens?: number; temperature?: number; stream?: boolean },
  ): Promise<any> {
    const { data } = await this.axios.post('/v1/chat/completions', {
      messages,
      ...options,
    });
    return data;
  }

  async completion(
    prompt: string,
    options?: { max_tokens?: number; temperature?: number; stream?: boolean },
  ): Promise<any> {
    const { data } = await this.axios.post('/v1/completions', {
      prompt,
      ...options,
    });
    return data;
  }

  async getClusterStatus(): Promise<{
    enabled: boolean;
    role: string;
    size: number;
    nodes: ClusterNode[];
  }> {
    const { data } = await this.axios.get('/api/cluster/status');
    return data;
  }

  async clusterInference(
    prompt: string,
    config?: Record<string, any>,
  ): Promise<any> {
    const { data } = await this.axios.post('/api/cluster/infer', {
      prompt,
      config,
    });
    return data;
  }
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
  };
  loadedModel?: string;
}
