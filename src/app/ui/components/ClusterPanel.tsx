import React from 'react';
import type { ClusterNode } from '../../server/services/cluster-protocol.js';

interface ClusterPanelProps {
  nodes: ClusterNode[];
  clusterSize: number;
  role: 'master' | 'worker' | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function ClusterPanel({ nodes, clusterSize, role, loading, onRefresh }: ClusterPanelProps) {
  if (!role) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Cluster</h2>
        </div>
        <div className="empty-state" style={{ height: 'auto', padding: 24 }}>
          <div className="empty-state-icon">🔗</div>
          <div className="empty-state-title">Cluster Disabled</div>
          <p>Set HAVEN_CLUSTER=true to enable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          Cluster ({clusterSize} node{clusterSize !== 1 ? 's' : ''})
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`role-badge ${role}`}>{role.toUpperCase()}</span>
          <button className="btn" onClick={onRefresh}>↻</button>
        </div>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="cluster-nodes">
          {nodes.map(node => (
            <div key={node.id} className={`cluster-node ${node.status}`}>
              <div className="node-header">
                <span className="node-name">{node.name}</span>
                <span className={`node-status ${node.status}`}>
                  {node.status}
                </span>
              </div>
              <div className="node-details">
                <span>GPU: {node.capabilities.gpus.length}</span>
                <span>VRAM: {(node.capabilities.availableVramBytes / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                <span>Cores: {node.capabilities.cpuCores}</span>
              </div>
              {node.loadedModel && (
                <div className="node-model" title={node.loadedModel}>
                  {node.loadedModel.split('/').pop()}
                </div>
              )}
            </div>
          ))}

          {nodes.length === 0 && (
            <div className="empty-state" style={{ padding: 16 }}>
              <p>No worker nodes connected</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
