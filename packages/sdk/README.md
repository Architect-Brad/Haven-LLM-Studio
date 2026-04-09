# Haven SDK

Local AI inference for Node.js. Run LLMs directly in your application — no server, no HTTP calls, no cloud.

## Installation

```bash
npm install @haven/sdk
```

## Quick Start

```typescript
import { Haven } from '@haven/sdk';

const haven = new Haven();

// Load a model
await haven.loadModel('~/.haven/models/llama-3.2-3b.Q4_K_M.gguf', {
  n_gpu_layers: 35,  // Offload to GPU
  temperature: 0.8,
});

// Blocking inference
const result = await haven.infer('What is quantum computing?');
console.log(result.text);
console.log(`${result.tokensPerSecond.toFixed(1)} tokens/sec`);

// Streaming
for await (const token of haven.stream('Write a haiku about AI')) {
  process.stdout.write(token);
}

// Embeddings
const embedding = await haven.embed('Hello world');
console.log(embedding.embedding.length); // 4096
```

## API Reference

### `new Haven(config?)`

Create a new Haven instance.

```typescript
const haven = new Haven({
  n_ctx: 512,          // Context window
  n_gpu_layers: 35,    // GPU offload layers
  temperature: 0.8,    // Sampling temperature
  max_tokens: 256,     // Max generation length
});
```

### `haven.loadModel(path, config?)`

Load a GGUF model from disk.

```typescript
const info = await haven.loadModel('/path/to/model.gguf', {
  n_gpu_layers: -1,  // Full GPU offload
});

console.log(info.name);         // "llama-3.2-3b.Q4_K_M.gguf"
console.log(info.architecture); // "LlamaForCausalLM"
console.log(info.nParams);      // 3212748800
```

### `haven.infer(prompt, config?)`

Run blocking inference.

```typescript
const result = await haven.infer('Explain Rust ownership', {
  max_tokens: 512,
  temperature: 0.7,
});

console.log(result.text);
console.log(result.tokensPerSecond);
```

### `haven.stream(prompt, config?)`

Stream tokens as an async generator.

```typescript
for await (const token of haven.stream('Write a story')) {
  process.stdout.write(token);
}
```

### `haven.embed(text)`

Generate a normalized embedding vector.

```typescript
const result = await haven.embed('Search query');
// result.embedding is a number[] (length = model's n_embd)
```

### Events

```typescript
haven.on('native:loaded', ({ path }) => {
  console.log('Native addon loaded from:', path);
});

haven.on('model:loaded', (info) => {
  console.log('Model loaded:', info.name);
});

haven.on('token', (token) => {
  process.stdout.write(token);
});

haven.on('inference:complete', (result) => {
  console.log(`Generated ${result.tokensGenerated} tokens`);
});

haven.on('error', (error) => {
  console.error('Haven error:', error.code, error.message);
});
```

## Supported Platforms

| OS | Architectures |
|----|--------------|
| Linux | x64, arm64 |
| macOS | x64, arm64 |
| Windows | x64 |
| Termux (Android) | arm64 |

## Building from Source

```bash
git clone https://github.com/Architect-Brad/Haven-LLM-Studio.git
cd haven-llm-studio/packages/sdk

npm install
npm run build
```

## License

MIT
