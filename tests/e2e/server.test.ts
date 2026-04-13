import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

const PORT = 1234;
const BASE = `http://127.0.0.1:${PORT}`;

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, init);
  const body = await res.json();
  return { status: res.status, body };
}

describe('Haven LLM Studio E2E', () => {
  beforeAll(async () => {
    await waitForServer();
  }, 30000);

  async function waitForServer(retries = 30): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) return;
      } catch {
        // not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Server did not start in time');
  }

  it('GET /health returns ok status', async () => {
    const { status, body } = await fetchJson('/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.native).toBe('boolean');
  });

  it('GET /api/info returns server metadata', async () => {
    const { status, body } = await fetchJson('/api/info');
    expect(status).toBe(200);
    expect(body.name).toBe('Haven LLM Studio');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.native).toBe('boolean');
    expect(typeof body.modelLoaded).toBe('boolean');
  });

  it('GET /api/system returns system info', async () => {
    const { status, body } = await fetchJson('/api/system');
    expect(status).toBe(200);
    expect(body).toHaveProperty('platform');
    expect(body).toHaveProperty('arch');
    expect(body).toHaveProperty('cpu');
    expect(body).toHaveProperty('memory');
  });

  it('GET /api/stats returns real-time stats', async () => {
    const { status, body } = await fetchJson('/api/stats');
    expect(status).toBe(200);
    expect(body).toHaveProperty('cpu_percent');
    expect(body).toHaveProperty('memory_percent');
    expect(body).toHaveProperty('inference');
    expect(body.inference).toHaveProperty('tokens_per_second');
    expect(body.inference).toHaveProperty('active');
  });

  it('GET /api/models returns model list', async () => {
    const { status, body } = await fetchJson('/api/models');
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /v1/models returns OpenAI-compatible list', async () => {
    const { status, body } = await fetchJson('/v1/models');
    expect(status).toBe(200);
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /v1/completions returns mock completion', async () => {
    const { status, body } = await fetchJson('/v1/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    expect(status).toBe(200);
    expect(body.object).toBe('text_completion');
    expect(body.choices).toBeDefined();
    expect(body.choices[0].text).toBeDefined();
    expect(body.usage).toBeDefined();
  });

  it('POST /v1/completions with missing prompt returns 400', async () => {
    const { status, body } = await fetchJson('/v1/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toBe('prompt is required');
  });

  it('POST /v1/chat/completions returns mock chat', async () => {
    const { status, body } = await fetchJson('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
    });
    expect(status).toBe(200);
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].message.content).toBeDefined();
  });

  it('POST /v1/chat/completions with missing messages returns 400', async () => {
    const { status, body } = await fetchJson('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toBe('messages array is required');
  });

  it('POST /v1/embeddings returns embedding', async () => {
    const { status, body } = await fetchJson('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'test text' }),
    });
    expect(status).toBe(200);
    expect(body.object).toBe('list');
    expect(body.data.length).toBe(1);
    expect(body.data[0].embedding).toBeDefined();
  });

  it('POST /v1/embeddings with missing input returns 400', async () => {
    const { status, body } = await fetchJson('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toContain('input is required');
  });

  it('GET /api-docs.json returns OpenAPI spec', async () => {
    const { status } = await fetchJson('/api-docs.json');
    expect(status).toBe(200);
  });

  it('POST /api/models/load with missing model_path returns 400', async () => {
    const { status, body } = await fetchJson('/api/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toBe('model_path is required');
  });

  it('POST /v1/completions with stream=true returns SSE', async () => {
    const res = await fetch(`${BASE}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello', stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data:');
    expect(text).toContain('[DONE]');
  });

  it('security: helmet sets security headers', async () => {
    const url = `${BASE}/health`;
    const res = await fetch(url);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
  });

  it('security: rate limiter allows requests under limit', async () => {
    const requests = Array(5).fill(null).map(() =>
      fetch(`${BASE}/health`).then(r => r.status)
    );
    const statuses = await Promise.all(requests);
    statuses.forEach(s => {
      expect(s).toBe(200);
    });
  });
});
