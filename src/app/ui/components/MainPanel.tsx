import React from 'react';
import type { SystemStats, InferenceConfig } from '../types';

interface MainPanelProps {
  stats: SystemStats;
  serverMode: 'native' | 'mock';
  clusterRole: 'master' | 'worker' | null;
  clusterSize: number;
  config?: InferenceConfig;
}

export default function MainPanel({ stats, serverMode, clusterRole, clusterSize, config }: MainPanelProps) {
  // Detect likely backend from environment
  const cpuBackend = (() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/ARM|aarch64|Apple Silicon/.test(ua)) return 'NEON';
      if (/AVX512/.test(ua)) return 'AVX512';
      if (/AVX2/.test(ua)) return 'AVX2';
    }
    return 'Auto-detect';
  })();

  return (
    <main className="main">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Server Status</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {clusterRole && (
              <span className="mode-badge cluster">
                🔗 Cluster ({clusterSize})
              </span>
            )}
            <span className="mode-badge">{serverMode === 'native' ? '🟢 Native' : '🟡 Mock'}</span>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.tokens_per_second.toFixed(1)}</div>
            <div className="stat-label">Tokens/sec</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.memory_used_mb} MB</div>
            <div className="stat-label">Memory Used</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.cpu_percent}%</div>
            <div className="stat-label">CPU Usage</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Hardware</h2>
        </div>
        <div className="hardware-grid">
          <div className="hardware-item">
            <div className="hardware-label">CPU Backend</div>
            <div className="hardware-value">{cpuBackend}</div>
          </div>
          <div className="hardware-item">
            <div className="hardware-label">GPU Type</div>
            <div className="hardware-value">—</div>
          </div>
          <div className="hardware-item">
            <div className="hardware-label">Multi-GPU</div>
            <div className="hardware-value">{config?.multi_gpu ? 'On' : 'Off'}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Active Endpoints</h2>
        </div>
        <div className="endpoints-list">
          <div className="endpoint-item">
            <div className="endpoint-name">Chat Completions</div>
            <code>POST /v1/chat/completions</code>
          </div>
          <div className="endpoint-item">
            <div className="endpoint-name">Completions</div>
            <code>POST /v1/completions</code>
          </div>
          <div className="endpoint-item">
            <div className="endpoint-name">Models</div>
            <code>GET /v1/models</code>
          </div>
          <div className="endpoint-item">
            <div className="endpoint-name">Embeddings</div>
            <code>POST /v1/embeddings</code>
          </div>
          <div className="endpoint-item">
            <div className="endpoint-name">System Info</div>
            <code>GET /api/system</code>
          </div>
          <div className="endpoint-item">
            <div className="endpoint-name">Real-time Stats</div>
            <code>WS /ws</code>
          </div>
        </div>
      </div>
    </main>
  );
}
