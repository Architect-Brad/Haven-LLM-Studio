import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainPanel from './components/MainPanel';
import RightPanel from './components/RightPanel';
import Header from './components/Header';
import ClusterPanel from './components/ClusterPanel';
import ToastContainer from './components/ToastContainer';
import { useHavenAPI } from './hooks/useHavenAPI';
import type { ModelInfo, InferenceConfig, SystemStats, Toast } from './types';
import type { ClusterNode } from './types';

export default function App() {
  const api = useHavenAPI();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats>({
    tokens_per_second: 0,
    memory_used_mb: 0,
    cpu_percent: 0,
    memory_percent: 0,
    inference_active: false,
  });
  const [serverOnline, setServerOnline] = useState(false);
  const [serverMode, setServerMode] = useState<'native' | 'mock'>('mock');
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Cluster state
  const [clusterNodes, setClusterNodes] = useState<ClusterNode[]>([]);
  const [clusterRole, setClusterRole] = useState<'master' | 'worker' | null>(null);
  const [clusterSize, setClusterSize] = useState(0);
  const [clusterLoading, setClusterLoading] = useState(true);

  const [config, setConfig] = useState<InferenceConfig>({
    temperature: 0.8,
    top_k: 40,
    top_p: 0.9,
    max_tokens: 256,
    repeat_penalty: 1.1,
    n_gpu_layers: 0,
    multi_gpu: false,
  });

  const wsRef = useRef<WebSocket | null>(null);

  // Toast helper
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Check server health
  useEffect(() => {
    api.health().then(data => {
      setServerOnline(true);
      setServerMode(data.native ? 'native' : 'mock');
    }).catch(() => {
      setServerOnline(false);
      addToast('Cannot connect to Haven server', 'error');
    }).finally(() => setLoading(false));
  }, [api, addToast]);

  // Load models
  const loadModels = useCallback(async () => {
    try {
      const data = await api.getModels();
      setModels(data);
    } catch {
      addToast('Failed to load models', 'error');
    }
  }, [api, addToast]);

  useEffect(() => {
    if (serverOnline) loadModels();
  }, [serverOnline, loadModels]);

  // Load cluster info
  useEffect(() => {
    if (!serverOnline) return;
    api.getClusterInfo().then(data => {
      if (data.enabled) {
        setClusterRole(data.role);
        setClusterSize(data.size);
        setClusterNodes(data.nodes || []);
      }
    }).catch(() => {
      // Cluster not enabled
    }).finally(() => setClusterLoading(false));
  }, [serverOnline, api]);

  // WebSocket for real-time stats
  useEffect(() => {
    if (!serverOnline) return;

    const wsUrl = `ws://${window.location.hostname}:${window.location.port || 1234}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStats({
          tokens_per_second: data.inference?.tokens_per_second || 0,
          memory_used_mb: data.memory_used_mb || 0,
          cpu_percent: data.cpu_percent || 0,
          memory_percent: data.memory_percent || 0,
          inference_active: data.inference?.active || false,
        });
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          // Reconnect attempt handled by browser
        }
      }, 5000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [serverOnline]);

  // Poll stats as fallback
  useEffect(() => {
    if (!serverOnline) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.getStats();
        setStats({
          tokens_per_second: data.inference?.tokens_per_second || 0,
          memory_used_mb: data.memory_used_mb || 0,
          cpu_percent: data.cpu_percent || 0,
          memory_percent: data.memory_percent || 0,
          inference_active: data.inference?.active || false,
        });
      } catch {
        // silent
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [serverOnline, api]);

  // Model actions
  const handleLoadModel = useCallback(async (modelPath: string) => {
    addToast(`Loading ${modelPath.split('/').pop()}...`, 'info');
    try {
      const result = await api.loadModel(modelPath, config);
      setSelectedModel(modelPath);
      addToast(`Model loaded (${result.mode})`, 'success');
      loadModels();
    } catch (error: any) {
      addToast(`Failed: ${error.message}`, 'error');
    }
  }, [api, config, addToast, loadModels]);

  const handleUnloadModel = useCallback(async () => {
    try {
      await api.unloadModel();
      setSelectedModel(null);
      addToast('Model unloaded', 'success');
      loadModels();
    } catch (error: any) {
      addToast(`Failed: ${error.message}`, 'error');
    }
  }, [api, addToast, loadModels]);

  const handleApplyConfig = useCallback(() => {
    addToast('Settings saved (applied on next model load)', 'success');
  }, [addToast]);

  return (
    <div className="app">
      <Header
        serverOnline={serverOnline}
        serverMode={serverMode}
        onRefresh={() => { loadModels(); addToast('Refreshed', 'success'); }}
        selectedModel={selectedModel}
        onUnloadModel={handleUnloadModel}
      />
      <Sidebar
        models={models}
        selectedModel={selectedModel}
        loading={loading}
        onSelect={setSelectedModel}
        onLoad={handleLoadModel}
      />
      <MainPanel
        stats={stats}
        serverMode={serverMode}
        clusterRole={clusterRole}
        clusterSize={clusterSize}
      />
      <RightPanel
        config={config}
        onChange={setConfig}
        onApply={handleApplyConfig}
      />
      {clusterRole && (
        <ClusterPanel
          nodes={clusterNodes}
          clusterSize={clusterSize}
          role={clusterRole}
          loading={clusterLoading}
          onRefresh={() => api.getClusterInfo().then(d => {
            setClusterRole(d.role);
            setClusterSize(d.size);
            setClusterNodes(d.nodes || []);
          })}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
