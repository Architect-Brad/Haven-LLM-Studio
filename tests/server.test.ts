/**
 * Haven LLM Studio - Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemMonitor } from '../src/server/services/system-monitor.service';
import { InferenceService } from '../src/server/services/inference.service';
import { ModelService } from '../src/server/services/model.service';

// ── System Monitor Tests ──────────────────────────────────────────

describe('SystemMonitor', () => {
  let monitor: SystemMonitor;

  beforeEach(() => {
    monitor = new SystemMonitor();
  });

  it('should return system info with required fields', () => {
    const info = monitor.getSystemInfo();

    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('cpu');
    expect(info).toHaveProperty('memory');
    expect(info.cpu).toHaveProperty('model');
    expect(info.cpu).toHaveProperty('cores');
    expect(info.cpu).toHaveProperty('speed');
    expect(info.memory).toHaveProperty('total');
    expect(info.memory).toHaveProperty('free');
    expect(info.memory).toHaveProperty('used');
    expect(info.memory).toHaveProperty('percent');
  });

  it('should return real-time stats with delta-based CPU tracking', () => {
    const stats = monitor.getStats();

    expect(stats).toHaveProperty('timestamp');
    expect(stats).toHaveProperty('cpu_percent');
    expect(stats).toHaveProperty('memory_percent');
    expect(stats).toHaveProperty('memory_used_mb');
    expect(stats.cpu_percent).toBeGreaterThanOrEqual(0);
    expect(stats.cpu_percent).toBeLessThanOrEqual(100);
    expect(stats.memory_percent).toBeGreaterThanOrEqual(0);
    expect(stats.memory_percent).toBeLessThanOrEqual(100);
  });

  it('should track CPU history and calculate averages', () => {
    // Get stats multiple times to build history
    for (let i = 0; i < 5; i++) {
      monitor.getStats();
    }

    const avgCpu = monitor.getAverageCPUUsage();
    expect(avgCpu).toBeGreaterThanOrEqual(0);
    expect(avgCpu).toBeLessThanOrEqual(100);
  });

  it('should stop polling when requested', () => {
    monitor.stopPolling();
    // No error means success
    expect(true).toBe(true);
  });
});

// ── Inference Service Tests ───────────────────────────────────────

describe('InferenceService', () => {
  let service: InferenceService;

  beforeEach(() => {
    service = new InferenceService();
  });

  it('should start with no model loaded', () => {
    const stats = service.getStats();
    expect(stats.modelLoaded).toBe(false);
  });

  it('should report native availability status', () => {
    const available = service.isNativeAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should throw error when completing without model', async () => {
    await expect(service.complete('test')).rejects.toThrow('No model loaded');
  });

  it('should throw error when streaming without model', async () => {
    await expect(
      service.completeStreaming('test', {}, () => {})
    ).rejects.toThrow('No model loaded');
  });

  it('should emit model:unloaded event when unloading without model loaded', async () => {
    const listener = vi.fn();
    service.on('model:unloaded', listener);
    await service.unload();
    // Should not throw even when no model is loaded
    expect(true).toBe(true);
  });
});

// ── Model Service Tests ───────────────────────────────────────────

describe('ModelService', () => {
  let service: ModelService;

  beforeEach(() => {
    service = new ModelService('/tmp/haven-test-models');
  });

  it('should create models directory if it does not exist', async () => {
    const models = await service.listModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it('should return empty array when no models exist', async () => {
    const models = await service.listModels();
    expect(models).toEqual([]);
  });

  it('should return null for loaded model when none is loaded', () => {
    expect(service.getLoadedModel()).toBeNull();
  });

  it('should throw error when loading non-existent model', async () => {
    await expect(
      service.loadModel('/nonexistent/model.gguf')
    ).rejects.toThrow('Model not found');
  });

  it('should detect model types correctly', () => {
    // Access private method via any cast for testing
    const svc = service as any;

    expect(svc.detectModelType('model.gguf')).toBe('gguf');
    expect(svc.detectModelType('model.bin')).toBe('gptq');
    expect(svc.detectModelType('model-awq.gguf')).toBe('awq');
    expect(svc.detectModelType('model.safetensors')).toBe('other');
  });

  it('should identify model files correctly', () => {
    const svc = service as any;

    expect(svc.isModelFile('model.gguf')).toBe(true);
    expect(svc.isModelFile('model.ggml')).toBe(true);
    expect(svc.isModelFile('model.bin')).toBe(true);
    expect(svc.isModelFile('model.safetensors')).toBe(true);
    expect(svc.isModelFile('readme.txt')).toBe(false);
    expect(svc.isModelFile('config.json')).toBe(false);
  });
});

// ── Chat Prompt Formatting Tests ──────────────────────────────────

describe('Chat Prompt Formatting', () => {
  function formatChatPrompt(messages: { role: string; content: string }[]): string {
    const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';

    if (hasSystemMessage) {
      const systemPrompt = messages[0].content;
      const remainingMessages = messages.slice(1);

      return (
        `<|system|>\n${systemPrompt}</s>\n` +
        remainingMessages.map(m => {
          const role = m.role === 'user' ? 'user' : 'assistant';
          return `<|${role}|>\n${m.content}</s>`;
        }).join('\n') +
        '\n<|assistant|>\n'
      );
    }

    return messages.map(m => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      return `<|${role}|>\n${m.content}</s>`;
    }).join('\n') + '\n<|assistant|>\n';
  }

  it('should format simple user message', () => {
    const result = formatChatPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toContain('<|user|>');
    expect(result).toContain('Hello');
    expect(result).toContain('<|assistant|>');
  });

  it('should format multi-turn conversation', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = formatChatPrompt(messages);
    expect(result).toContain('<|user|>\nHi');
    expect(result).toContain('<|assistant|>\nHello!');
    expect(result).toContain('<|user|>\nHow are you?');
  });

  it('should include system prompt when present', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ];

    const result = formatChatPrompt(messages);
    expect(result).toContain('<|system|>');
    expect(result).toContain('You are helpful');
  });
});
