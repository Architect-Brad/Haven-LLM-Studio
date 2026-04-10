#!/usr/bin/env node

/**
 * Haven CLI
 * Ollama-like command line interface for Haven LLM Studio
 * 
 * Usage:
 *   haven serve [options]
 *   haven run <model> [options]
 *   haven pull <model>
 *   haven list
 *   haven ps
 *   haven rm <model>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const program = new Command();
const MODELS_DIR = path.join(os.homedir(), '.haven', 'models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// ── Commands ───────────────────────────────────────────────────

program
  .name('haven')
  .description('Haven LLM Studio CLI')
  .version('0.1.0');

// haven serve
program
  .command('serve')
  .description('Start the Haven inference server')
  .option('-p, --port <port>', 'Port to listen on', '1234')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--cluster', 'Enable cluster mode')
  .action((options) => {
    console.log(`🚀 Starting Haven server on http://${options.host}:${options.port}`);
    if (options.cluster) console.log('🔗 Cluster mode enabled');
    
    // In a real implementation, this would spawn the server process
    // For now, we simulate the output
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           Haven LLM Studio — Server Ready                ║
╠══════════════════════════════════════════════════════════╣
║  Local:      http://${options.host}:${options.port}                          ║
║  API:        http://${options.host}:${options.port}/v1                       ║
║  WebSocket:  ws://${options.host}:${options.port}/ws                         ║
║                                                          ║
║  Press Ctrl+C to stop                                    ║
╚══════════════════════════════════════════════════════════╝
    `);
  });

// haven run
program
  .command('run <model>')
  .description('Run a model and start an interactive chat')
  .option('-t, --temperature <temp>', 'Sampling temperature', '0.8')
  .option('-m, --max-tokens <tokens>', 'Max tokens to generate', '256')
  .action((model, options) => {
    const modelPath = path.join(MODELS_DIR, model.replace(/:/g, '_') + '.gguf');
    
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model '${model}' not found. Run 'haven pull ${model}' first.`);
      process.exit(1);
    }

    console.log(`🤖 Running ${model}...`);
    console.log(`📦 Model: ${modelPath}`);
    console.log(`🌡️  Temperature: ${options.temperature}`);
    console.log(`📝 Max Tokens: ${options.maxTokens}`);
    console.log('\n💬 Type your message (Ctrl+C to exit):\n');

    // In a real implementation, this would start the TUI chat
    // For now, we simulate the prompt
    console.log('> ');
  });

// haven pull
program
  .command('pull <model>')
  .description('Download a model from HuggingFace')
  .action(async (model) => {
    const modelName = model.replace(/:/g, '_');
    const modelPath = path.join(MODELS_DIR, modelName + '.gguf');

    if (fs.existsSync(modelPath)) {
      console.log(`✅ Model '${model}' already exists.`);
      return;
    }

    console.log(`⬇️  Pulling ${model}...`);
    
    // Simulate download progress
    const steps = ['Resolving model...', 'Downloading manifest...', 'Downloading layers...', 'Verifying checksum...'];
    for (const step of steps) {
      process.stdout.write(`  ${step}\r`);
      await new Promise(r => setTimeout(r, 800));
    }

    // Create a dummy file for demonstration
    fs.writeFileSync(modelPath, 'dummy-gguf-content');
    console.log(`\n✅ Pulled ${model} to ${modelPath}`);
  });

// haven list
program
  .command('list')
  .alias('ls')
  .description('List downloaded models')
  .action(() => {
    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf'));
    
    if (files.length === 0) {
      console.log('No models found. Use "haven pull <model>" to download one.');
      return;
    }

    console.log('NAME\t\t\tSIZE\t\tMODIFIED');
    console.log('─'.repeat(60));
    
    files.forEach(file => {
      const stat = fs.statSync(path.join(MODELS_DIR, file));
      const size = (stat.size / 1024 / 1024 / 1024).toFixed(1) + ' GB';
      const modified = stat.mtime.toLocaleDateString();
      console.log(`${file.padEnd(24)}\t${size.padEnd(8)}\t${modified}`);
    });
  });

// haven ps
program
  .command('ps')
  .description('List running models')
  .action(() => {
    console.log('NAME\t\t\tPID\t\tSIZE\t\tUNTIL');
    console.log('─'.repeat(60));
    console.log('No models currently running.');
  });

// haven rm
program
  .command('rm <model>')
  .description('Remove a model')
  .action((model) => {
    const modelName = model.replace(/:/g, '_');
    const modelPath = path.join(MODELS_DIR, modelName + '.gguf');

    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model '${model}' not found.`);
      process.exit(1);
    }

    fs.unlinkSync(modelPath);
    console.log(`🗑️  Removed ${model}`);
  });

program.parse(process.argv);
