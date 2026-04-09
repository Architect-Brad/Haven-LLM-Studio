import React from 'react';
import type { InferenceConfig } from '../types';

interface RightPanelProps {
  config: InferenceConfig;
  onChange: (config: InferenceConfig) => void;
  onApply: () => void;
}

export default function RightPanel({ config, onChange, onApply }: RightPanelProps) {
  const update = (key: keyof InferenceConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <aside className="right-panel">
      <div className="section-title">Inference Settings</div>

      <ConfigSlider
        label="Temperature"
        value={config.temperature}
        min={0}
        max={2}
        step={0.1}
        onChange={v => update('temperature', v)}
      />

      <ConfigInput
        label="Top K"
        value={config.top_k}
        type="number"
        onChange={v => update('top_k', v)}
      />

      <ConfigInput
        label="Top P"
        value={config.top_p}
        type="number"
        step={0.1}
        max={1}
        onChange={v => update('top_p', v)}
      />

      <ConfigInput
        label="Max Tokens"
        value={config.max_tokens}
        type="number"
        onChange={v => update('max_tokens', v)}
      />

      <ConfigInput
        label="Repeat Penalty"
        value={config.repeat_penalty}
        type="number"
        step={0.1}
        onChange={v => update('repeat_penalty', v)}
      />

      <ConfigInput
        label="GPU Layers"
        value={config.n_gpu_layers}
        type="number"
        placeholder="Auto-detect recommended"
        onChange={v => update('n_gpu_layers', v)}
      />

      <div className="config-group">
        <label className="config-label">Multi-GPU</label>
        <select
          className="config-input"
          value={config.multi_gpu ? 'true' : 'false'}
          onChange={e => update('multi_gpu', e.target.value === 'true' ? 1 : 0)}
        >
          <option value="false">Disabled</option>
          <option value="true">Enabled (Layer Split)</option>
        </select>
      </div>

      <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onApply}>
        Apply Settings
      </button>
    </aside>
  );
}

function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="config-group">
      <label className="config-label">
        {label}
        <span className="config-value">{value}</span>
      </label>
      <input
        type="range"
        className="config-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function ConfigInput({
  label,
  value,
  type = 'number',
  step,
  max,
  placeholder,
  onChange,
}: {
  label: string;
  value: number;
  type?: string;
  step?: number;
  max?: number;
  placeholder?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="config-group">
      <label className="config-label">
        {label}
        <span className="config-value">{value}</span>
      </label>
      <input
        type={type}
        className="config-input"
        value={value}
        step={step}
        max={max}
        placeholder={placeholder}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}
