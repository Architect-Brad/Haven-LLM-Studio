/**
 * Haven LLM Studio - Benchmark Suite
 * Measures inference performance across different configurations
 * Supports single-node and cluster benchmarks
 */

interface BenchmarkResult {
  name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_time_ms: number;
  tokens_per_second: number;
  config: Record<string, any>;
  node?: string;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
}

// Test prompts for different scenarios
const BENCHMARK_PROMPTS = {
  short: 'Explain quantum computing in one sentence.',
  medium: 'Write a short Python function that calculates the Fibonacci sequence up to n terms, with proper error handling and type hints.',
  long: 'Write a detailed technical comparison between REST and GraphQL APIs, covering: 1) Architecture patterns, 2) Performance characteristics, 3) Developer experience, 4) Caching strategies, 5) Real-time capabilities. Provide concrete examples for each point.',
  code: 'Implement a binary search tree in TypeScript with insert, delete, and search methods. Include proper generics and error handling.',
  creative: 'Write a haiku about artificial intelligence and the future of technology.',
};

/**
 * Run a single benchmark
 */
async function runBenchmark(
  name: string,
  prompt: string,
  config: Record<string, any>,
  serverUrl: string = 'http://127.0.0.1:1234',
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  const response = await fetch(`${serverUrl}/v1/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...config,
    }),
  });

  if (!response.ok) {
    throw new Error(`Benchmark failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const totalTime = Date.now() - startTime;

  const completionTokens = data.usage?.completion_tokens || 0;
  const promptTokens = data.usage?.prompt_tokens || prompt.split(/\s+/).length;

  return {
    name,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_time_ms: totalTime,
    tokens_per_second: completionTokens > 0 ? (completionTokens / totalTime) * 1000 : 0,
    config,
  };
}

/**
 * Run cluster benchmark (routes through master)
 */
async function runClusterBenchmark(
  name: string,
  prompt: string,
  config: Record<string, any>,
  clusterUrl: string = 'http://127.0.0.1:1234',
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  const response = await fetch(`${clusterUrl}/api/cluster/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      config,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Cluster benchmark failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const totalTime = Date.now() - startTime;

  return {
    name,
    prompt_tokens: prompt.split(/\s+/).length,
    completion_tokens: data.result?.split(/\s+/).length || 0,
    total_time_ms: totalTime,
    tokens_per_second: 0,
    config,
    node: data.assignedNode || 'unknown',
  };
}

/**
 * Run full benchmark suite
 */
export async function runBenchmarks(
  serverUrl: string = 'http://127.0.0.1:1234',
  configs: Record<string, any>[] = [
    { temperature: 0.7, max_tokens: 128 },
    { temperature: 0.8, max_tokens: 256 },
    { temperature: 1.0, max_tokens: 512 },
  ],
): Promise<BenchmarkSuite[]> {
  const suites: BenchmarkSuite[] = [];

  for (const config of configs) {
    const suite: BenchmarkSuite = {
      name: `Config: ${JSON.stringify(config)}`,
      results: [],
    };

    console.log(`\n┌─ Running: ${suite.name}`);

    for (const [name, prompt] of Object.entries(BENCHMARK_PROMPTS)) {
      process.stdout.write(`  ├─ ${name}... `);

      try {
        const result = await runBenchmark(name, prompt, config, serverUrl);
        suite.results.push(result);
        console.log(`${result.tokens_per_second.toFixed(1)} t/s (${result.completion_tokens} tokens in ${result.total_time_ms}ms)`);
      } catch (error: any) {
        console.log(`FAILED: ${error.message}`);
      }
    }

    suites.push(suite);
  }

  return suites;
}

/**
 * Run cluster benchmark suite
 */
export async function runClusterBenchmarks(
  clusterUrl: string = 'http://127.0.0.1:1234',
  configs: Record<string, any>[] = [
    { temperature: 0.7, max_tokens: 128 },
  ],
): Promise<BenchmarkSuite[]> {
  const suites: BenchmarkSuite[] = [];

  // First check cluster status
  const statusRes = await fetch(`${clusterUrl}/api/cluster/status`);
  const status = await statusRes.json();

  console.log(`\n┌─ Cluster: ${status.size} nodes (${status.role})`);

  for (const config of configs) {
    const suite: BenchmarkSuite = {
      name: `Cluster Config: ${JSON.stringify(config)}`,
      results: [],
    };

    for (const [name, prompt] of Object.entries(BENCHMARK_PROMPTS)) {
      process.stdout.write(`  ├─ ${name}... `);

      try {
        const result = await runClusterBenchmark(name, prompt, config, clusterUrl);
        suite.results.push(result);
        console.log(`${result.total_time_ms}ms (node: ${result.node})`);
      } catch (error: any) {
        console.log(`FAILED: ${error.message}`);
      }
    }

    suites.push(suite);
  }

  return suites;
}

/**
 * Print benchmark summary
 */
export function printSummary(suites: BenchmarkSuite[]): void {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              Benchmark Summary                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    console.log('─'.repeat(60));

    const totalTokens = suite.results.reduce((sum, r) => sum + r.completion_tokens, 0);
    const totalTime = suite.results.reduce((sum, r) => sum + r.total_time_ms, 0);
    const avgTps = totalTokens > 0 ? (totalTokens / totalTime) * 1000 : 0;

    console.log(`  Prompt                          Tokens    Time      t/s`);
    console.log(`  ${'─'.repeat(56)}`);

    for (const result of suite.results) {
      const name = result.name.padEnd(31);
      const tokens = result.completion_tokens.toString().padStart(6);
      const time = `${result.total_time_ms}ms`.padStart(8);
      const tps = result.tokens_per_second.toFixed(1).padStart(6);
      const nodeInfo = result.node ? ` [${result.node}]` : '';
      console.log(`  ${name}${tokens}   ${time}  ${tps}${nodeInfo}`);
    }

    console.log(`  ${'─'.repeat(56)}`);
    console.log(`  ${'Average'.padEnd(31)}${totalTokens.toString().padStart(6)}   ${totalTime}ms  ${avgTps.toFixed(1).padStart(6)}`);
  }
}

// Run if executed directly
if (process.argv[1]?.endsWith('benchmarks/run.ts')) {
  const serverUrl = process.argv[2] || 'http://127.0.0.1:1234';
  const clusterMode = process.argv.includes('--cluster');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Haven LLM Studio - Benchmark Suite               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nServer: ${serverUrl}`);
  console.log(`Mode: ${clusterMode ? 'Cluster' : 'Single-node'}`);

  if (clusterMode) {
    runClusterBenchmarks(serverUrl)
      .then(results => {
        printSummary(results);
      })
      .catch(console.error);
  } else {
    runBenchmarks(serverUrl)
      .then(results => {
        printSummary(results);
      })
      .catch(console.error);
  }
}
