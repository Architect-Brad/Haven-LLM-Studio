import React from 'react';
import type { ModelInfo } from '../types';

interface SidebarProps {
  models: ModelInfo[];
  selectedModel: string | null;
  loading: boolean;
  onSelect: (path: string) => void;
  onLoad: (path: string) => void;
}

export default function Sidebar({ models, selectedModel, loading, onSelect, onLoad }: SidebarProps) {
  if (loading) {
    return (
      <aside className="sidebar">
        <div className="section-title">Models</div>
        <div className="model-list">
          <div className="empty-state" style={{ height: 'auto', padding: 24 }}>
            <div className="spinner" />
            <p style={{ marginTop: 8 }}>Loading models...</p>
          </div>
        </div>
      </aside>
    );
  }

  if (models.length === 0) {
    return (
      <aside className="sidebar">
        <div className="section-title">Models</div>
        <div className="model-list">
          <div className="empty-state" style={{ height: 'auto', padding: 24 }}>
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No Models Found</div>
            <p>Add GGUF models to ~/.haven/models/</p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="section-title">
        Models
        <span style={{ color: 'var(--accent)' }}>({models.length})</span>
      </div>
      <div className="model-list">
        {models.map(m => (
          <div
            key={m.path}
            className={`model-item ${selectedModel === m.path ? 'active' : ''}`}
            onClick={() => onSelect(m.path)}
          >
            <div className="model-name">{m.name}</div>
            <div className="model-info">
              <span>{(m.size / 1024 / 1024 / 1024).toFixed(1)} GB</span>
              <span>•</span>
              <span>{m.type.toUpperCase()}</span>
              {m.loaded && (
                <>
                  <span>•</span>
                  <span style={{ color: 'var(--success)' }}>Loaded</span>
                </>
              )}
            </div>
            <div className="model-actions">
              <button
                className="btn btn-primary"
                onClick={(e) => { e.stopPropagation(); onLoad(m.path); }}
              >
                {m.loaded ? 'Reload' : 'Load'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
