import React from 'react';

interface HeaderProps {
  serverOnline: boolean;
  serverMode: 'native' | 'mock';
  onRefresh: () => void;
  selectedModel: string | null;
  onUnloadModel: () => void;
}

export default function Header({
  serverOnline,
  serverMode,
  onRefresh,
  selectedModel,
  onUnloadModel,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">🏠</div>
        <span>Haven LLM Studio</span>
      </div>
      <div className="status-indicator">
        <div className={`status-dot ${serverOnline ? 'online' : 'error'}`} />
        <span>{serverOnline ? `Server Running (${serverMode})` : 'Server Offline'}</span>
      </div>
      <div className="header-actions">
        <button className="btn" onClick={onRefresh}>↻ Refresh</button>
        {selectedModel ? (
          <button className="btn btn-danger" onClick={onUnloadModel}>Unload Model</button>
        ) : (
          <span className="btn" style={{ opacity: 0.5, cursor: 'default' }}>No Model Loaded</span>
        )}
      </div>
    </header>
  );
}
