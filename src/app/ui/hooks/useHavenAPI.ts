import { useCallback } from 'react';
import type {
  HealthResponse,
  ModelInfo,
  InferenceConfig,
  LoadModelResponse,
  SystemStats,
} from '../types';

const API_BASE = window.location.origin;

export function useHavenAPI() {
  const health = useCallback(async (): Promise<HealthResponse> => {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }, []);

  const getModels = useCallback(async (): Promise<ModelInfo[]> => {
    const res = await fetch(`${API_BASE}/api/models`);
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const data = await res.json();
    return data.data || [];
  }, []);

  const loadModel = useCallback(async (
    modelPath: string,
    config: InferenceConfig,
  ): Promise<LoadModelResponse> => {
    const res = await fetch(`${API_BASE}/api/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: modelPath, config }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to load model');
    }
    return res.json();
  }, []);

  const unloadModel = useCallback(async (): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/models/unload`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to unload model');
  }, []);

  const getStats = useCallback(async (): Promise<SystemStats & { inference?: any }> => {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  }, []);

  const getClusterInfo = useCallback(async (): Promise<{
    enabled: boolean;
    role: string | null;
    size: number;
    nodes: any[];
  }> => {
    const res = await fetch(`${API_BASE}/api/cluster/status`);
    if (!res.ok) throw new Error('Cluster not available');
    return res.json();
  }, []);

  return {
    health,
    getModels,
    loadModel,
    unloadModel,
    getStats,
    getClusterInfo,
  };
}
