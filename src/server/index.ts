/**
 * Haven LLM Studio - Server Entry Point
 * OpenAI-compatible API server for local LLM inference
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { InferenceService } from './services/inference.service.js';
import { ModelService } from './services/model.service.js';
import { SystemMonitor } from './services/system-monitor.service.js';
import { ClusterService } from './services/cluster.service.js';
import { isNativeAvailable, getLoadError, getNativeAddon } from './services/native-loader.js';

const PORT = process.env.HAVEN_PORT ? parseInt(process.env.HAVEN_PORT) : 1234;
const HOST = process.env.HAVEN_HOST || '127.0.0.1';

class HavenServer {
  private app: Express;
  private inferenceService: InferenceService;
  private modelService: ModelService;
  private systemMonitor: SystemMonitor;
  private clusterService: ClusterService | null = null;
  private httpServer: any;
  private wss: WebSocketServer;

  constructor() {
    this.app = express();
    this.inferenceService = new InferenceService();
    this.modelService = new ModelService();
    this.systemMonitor = new SystemMonitor();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupClusterRoutes();
    this.setupWebSocket();
    this.setupCluster();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        native: isNativeAvailable(),
        nativeError: getLoadError(),
      });
    });

    // Server info
    this.app.get('/api/info', (req: Request, res: Response) => {
      res.json({
        name: 'Haven LLM Studio',
        version: '0.1.0',
        native: isNativeAvailable(),
        modelLoaded: this.modelService.getLoadedModel() !== null,
      });
    });

    // System info
    this.app.get('/api/system', (req: Request, res: Response) => {
      const info = this.systemMonitor.getSystemInfo();
      res.json(info);
    });

    // Real-time stats
    this.app.get('/api/stats', (req: Request, res: Response) => {
      const stats = this.systemMonitor.getStats();
      // Enrich with inference stats
      const inferStats = this.inferenceService.getStats();
      stats.inference = {
        tokens_per_second: inferStats.tokensPerSecond || 0,
        active: inferStats.modelLoaded || false,
      };
      res.json(stats);
    });

    // Models endpoints
    this.app.get('/api/models', async (req: Request, res: Response) => {
      try {
        const models = await this.modelService.listModels();
        res.json({ data: models });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/models/load', async (req: Request, res: Response) => {
      try {
        const { model_path, config } = req.body;

        if (!model_path) {
          return res.status(400).json({ error: 'model_path is required' });
        }

        await this.modelService.loadModel(model_path, config);
        await this.inferenceService.initialize(model_path, config);

        res.json({
          success: true,
          model: model_path,
          mode: this.inferenceService.isNativeAvailable() ? 'native' : 'mock',
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/models/unload', async (req: Request, res: Response) => {
      try {
        await this.inferenceService.unload();
        await this.modelService.unloadModel();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // OpenAI-compatible endpoints
    this.app.get('/v1/models', async (req: Request, res: Response) => {
      try {
        const models = await this.modelService.listModels();
        res.json({
          object: 'list',
          data: models.map(m => ({
            id: m.name,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'haven',
          }))
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/v1/completions', async (req: Request, res: Response) => {
      try {
        const { prompt, model, stream, ...options } = req.body;

        if (!prompt) {
          return res.status(400).json({ error: 'prompt is required' });
        }

        if (stream) {
          await this.handleStreamingCompletion(req, res, prompt, options);
        } else {
          const result = await this.inferenceService.complete(prompt, options);
          res.json({
            id: `haven-${Date.now()}`,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model: model || 'default',
            choices: [{
              text: result.text,
              index: 0,
              finish_reason: 'stop',
            }],
            usage: result.usage,
          });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/v1/chat/completions', async (req: Request, res: Response) => {
      try {
        const { messages, model, stream, ...options } = req.body;

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ error: 'messages array is required' });
        }

        // Convert chat messages to prompt
        const prompt = this.formatChatPrompt(messages);

        if (stream) {
          await this.handleStreamingCompletion(req, res, prompt, options);
        } else {
          const result = await this.inferenceService.complete(prompt, options);
          res.json({
            id: `haven-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model || 'default',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: result.text,
              },
              finish_reason: 'stop',
            }],
            usage: result.usage,
          });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Embeddings endpoint
    this.app.post('/v1/embeddings', async (req: Request, res: Response) => {
      try {
        const { input, model, encoding_format } = req.body;

        if (!input) {
          return res.status(400).json({ error: 'input is required (string or array of strings)' });
        }

        const addon = getNativeAddon();
        const inputs = Array.isArray(input) ? input : [input];

        if (addon) {
          // Use native embeddings
          const embeddings = inputs.map((text: string) => {
            const result = addon.embed(text);
            return {
              object: 'embedding',
              index: inputs.indexOf(text),
              embedding: encoding_format === 'base64'
                ? Buffer.from(new Float32Array(result.embedding).buffer).toString('base64')
                : Array.from(result.embedding),
            };
          });

          res.json({
            object: 'list',
            data: embeddings,
            model: model || 'embedding-model',
            usage: {
              prompt_tokens: inputs.reduce((sum: number, t: string) => sum + t.split(/\s+/).length, 0),
              total_tokens: inputs.reduce((sum: number, t: string) => sum + t.split(/\s+/).length, 0),
            },
          });
        } else {
          // Mock fallback
          const embeddingDimension = 768;
          res.json({
            object: 'list',
            data: inputs.map((text: string, i: number) => ({
              object: 'embedding',
              index: i,
              embedding: new Array(embeddingDimension).fill(0),
          })),
          model: model || 'embedding-model',
          usage: {
            prompt_tokens: inputs.reduce((sum: number, t: string) => sum + t.split(/\s+/).length, 0),
            total_tokens: inputs.reduce((sum: number, t: string) => sum + t.split(/\s+/).length, 0),
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Handle streaming completion with proper error handling and cleanup
   */
  private async handleStreamingCompletion(
    req: Request,
    res: Response,
    prompt: string,
    options: any
  ): Promise<void> {
    let streamEnded = false;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Handle client disconnect
    const onClientClose = () => {
      if (!streamEnded) {
        console.log('[Stream] Client disconnected, cleaning up');
        streamEnded = true;
      }
    };
    req.on('close', onClientClose);

    try {
      await this.inferenceService.completeStreaming(prompt, options, (chunk: string) => {
        if (streamEnded) return;

        const data = JSON.stringify({
          id: `haven-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'default',
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null,
          }],
        });

        const writeSuccess = res.write(`data: ${data}\n\n`);

        // Handle backpressure
        if (!writeSuccess) {
          console.warn('[Stream] Backpressure detected, pausing');
          // In production, would pause the inference here
        }
      });

      if (!streamEnded) {
        // Send final chunk
        const finalData = JSON.stringify({
          id: `haven-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'default',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        });

        res.write(`data: ${finalData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        streamEnded = true;
      }
    } catch (error: any) {
      if (!streamEnded) {
        console.error('[Stream] Error during streaming:', error.message);

        // Send error event
        const errorData = JSON.stringify({
          error: {
            message: error.message,
            type: 'inference_error',
            code: 'stream_error',
          },
        });

        res.write(`data: ${errorData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        streamEnded = true;
      }
    } finally {
      req.removeListener('close', onClientClose);
    }
  }

  private formatChatPrompt(messages: any[]): string {
    // Detect if messages follow chat template format
    const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';

    if (hasSystemMessage) {
      // Include system prompt
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

    // Default chat format
    return messages.map(m => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      return `<|${role}|>\n${m.content}</s>`;
    }).join('\n') + '\n<|assistant|>\n';
  }

  private setupWebSocket(): void {
    // WebSocket server will be attached after HTTP server creation
  }

  private setupCluster(): void {
    const clusterEnabled = process.env.HAVEN_CLUSTER === 'true';
    if (!clusterEnabled) return;

    const role = (process.env.HAVEN_CLUSTER_ROLE || 'master') as 'master' | 'worker';
    const clusterPort = parseInt(process.env.HAVEN_CLUSTER_PORT || '1235');

    this.clusterService = new ClusterService({
      nodeId: process.env.HAVEN_NODE_ID || `node-${Date.now()}`,
      nodeName: process.env.HAVEN_NODE_NAME || 'Haven Node',
      role,
      masterUrl: process.env.HAVEN_MASTER_URL,
      listenPort: clusterPort,
      listenHost: process.env.HAVEN_CLUSTER_HOST || '0.0.0.0',
      heartbeatIntervalMs: 5000,
      heartbeatTimeoutMs: 15000,
      maxWorkers: parseInt(process.env.HAVEN_MAX_WORKERS || '10'),
      authToken: process.env.HAVEN_CLUSTER_TOKEN,
      autoReconnect: true,
    }, this.systemMonitor);

    this.clusterService.on('node:joined', (node) => {
      console.log(`[Cluster] Node joined: ${node.name}`);
    });

    this.clusterService.on('node:offline', (node) => {
      console.warn(`[Cluster] Node offline: ${node.name}`);
    });

    this.clusterService.start().catch(err => {
      console.error('[Cluster] Failed to start:', err.message);
    });
  }

  private setupClusterRoutes(): void {
    if (!this.clusterService) return;

    // Cluster status
    this.app.get('/api/cluster/status', (req: Request, res: Response) => {
      res.json({
        enabled: true,
        role: this.clusterService!.getThisNode()?.role,
        size: this.clusterService!.getClusterSize(),
        nodes: this.clusterService!.getNodes(),
        thisNode: this.clusterService!.getThisNode(),
      });
    });

    // List nodes
    this.app.get('/api/cluster/nodes', (req: Request, res: Response) => {
      res.json({ data: this.clusterService!.getNodes() });
    });

    // Route inference to best node
    this.app.post('/api/cluster/infer', async (req: Request, res: Response) => {
      try {
        const { prompt, config, stream } = req.body;
        const result = await this.clusterService!.routeInference(prompt, config, stream || false);
        res.json({ result });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  public async start(): Promise<void> {
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] Client connected');

      // Send real-time stats
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const stats = this.systemMonitor.getStats();
          ws.send(JSON.stringify(stats));
        }
      }, 1000);

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        clearInterval(interval);
      });

      ws.on('error', (error) => {
        console.error('[WS] Error:', error.message);
        clearInterval(interval);
      });
    });

    return new Promise((resolve, reject) => {
      this.httpServer.listen(PORT, HOST, () => {
        const nativeStatus = isNativeAvailable() ? 'native' : 'mock';
        const nativeError = getLoadError();

        // Startup diagnostics
        const os = require('os');
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const totalMemGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);

        console.log(`
╔══════════════════════════════════════════════════════════╗
║           Haven LLM Studio — Server Ready                ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Local:      http://${HOST}:${PORT}                          ║
║  API:        http://${HOST}:${PORT}/v1                       ║
║  WebSocket:  ws://${HOST}:${PORT}/ws                         ║
║                                                          ║
║  Platform:   ${os.platform()} ${os.arch()}                         ║
║  CPU:        ${cpus.length} cores                                  ║
║  Memory:     ${totalMemGB} GB                                      ║
║  Inference:  ${nativeStatus}${nativeError ? ' (' + nativeError.substring(0, 30) + '...)' : ''}
║                                                          ║
║  Press Ctrl+C to stop                                    ║
╚══════════════════════════════════════════════════════════╝
        `);
        resolve();
      });

      this.httpServer.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use`);
          reject(error);
        }
      });
    });
  }
}

// Start server
const server = new HavenServer();
server.start().catch(console.error);
