/**
 * Haven VPAN - Pipeline Parallelism Service
 * Distributes model layers across multiple devices in a home network
 * 
 * Architecture:
 * - Pipeline Coordinator: Manages layer distribution and activation passing
 * - Pipeline Nodes: Each node runs a subset of model layers
 * - Activation Transfer: Hidden states passed between nodes via WebSocket
 * 
 * Example: 32-layer model across 3 devices
 * - Dad's PC (RTX 4070): Layers 0-15
 * - Mom's MacBook (M1): Layers 16-28
 * - Teen's Laptop (RTX 3060): Layers 29-32
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────

export interface PipelineNode {
  id: string;
  name: string;
  url: string;
  ws: WebSocket | null;
  status: 'online' | 'offline' | 'loading';
  assignedLayers: { start: number; end: number };
  capabilities: {
    vramBytes: number;
    computeScore: number;
    bandwidthMbps: number;
  };
  stats: {
    tokensProcessed: number;
    averageLatencyMs: number;
    uptime: number;
  };
}

export interface PipelineConfig {
  totalLayers: number;
  nodes: PipelineNode[];
  activationCompression: 'none' | 'fp16' | 'int8';
  timeoutMs: number;
  retryAttempts: number;
}

export interface ActivationBuffer {
  hiddenStates: number[];  // Compressed activation data
  sequenceLength: number;
  hiddenSize: number;
  layerIndex: number;
}

export interface InferenceRequest {
  id: string;
  inputTokens: number[];
  config: Record<string, any>;
  startTime: number;
  currentNodeIndex: number;
  currentActivation: ActivationBuffer | null;
}

// ── Pipeline Coordinator ───────────────────────────────────────

export class PipelineCoordinator extends EventEmitter {
  private config: PipelineConfig;
  private activeRequests: Map<string, InferenceRequest> = new Map();
  private requestQueue: InferenceRequest[] = [];
  private isProcessing = false;

  constructor(config: PipelineConfig) {
    super();
    this.config = config;
    this.initializeNodes();
  }

  // ── Node Management ──────────────────────────────────────────

  private initializeNodes(): void {
    for (const node of this.config.nodes) {
      node.status = 'offline';
      node.stats = {
        tokensProcessed: 0,
        averageLatencyMs: 0,
        uptime: 0,
      };
      this.connectToNode(node);
    }
  }

  private connectToNode(node: PipelineNode): void {
    try {
      node.ws = new WebSocket(node.url);

      node.ws.on('open', () => {
        console.log(`[VPAN] Node ${node.name} connected`);
        node.status = 'online';
        this.emit('node:connected', node);
        this.checkPipelineReady();
      });

      node.ws.on('message', (data) => {
        this.handleNodeMessage(node, data.toString());
      });

      node.ws.on('close', () => {
        console.warn(`[VPAN] Node ${node.name} disconnected`);
        node.status = 'offline';
        node.ws = null;
        this.emit('node:disconnected', node);
      });

      node.ws.on('error', (err) => {
        console.error(`[VPAN] Node ${node.name} error:`, err.message);
        node.status = 'offline';
      });
    } catch (err: any) {
      console.error(`[VPAN] Failed to connect to ${node.name}:`, err.message);
    }
  }

  private handleNodeMessage(node: PipelineNode, message: string): void {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'activation_ready':
          this.forwardActivation(node, data);
          break;
        case 'inference_complete':
          this.completeInference(data.requestId, data.output);
          break;
        case 'node_stats':
          node.stats = { ...node.stats, ...data.stats };
          this.emit('node:stats', { nodeId: node.id, stats: node.stats });
          break;
        case 'error':
          console.error(`[VPAN] Node ${node.name} error:`, data.error);
          this.failRequest(data.requestId, data.error);
          break;
      }
    } catch (err) {
      console.error(`[VPAN] Failed to parse message from ${node.name}:`, err);
    }
  }

  // ── Layer Distribution ───────────────────────────────────────

  static calculateLayerDistribution(
    totalLayers: number,
    nodes: Array<{ vramBytes: number; computeScore: number }>
  ): Array<{ start: number; end: number }> {
    const totalCapacity = nodes.reduce(
      (sum, n) => sum + (n.vramBytes * n.computeScore),
      0
    );

    const distribution: Array<{ start: number; end: number }> = [];
    let currentLayer = 0;

    for (let i = 0; i < nodes.length; i++) {
      const capacity = nodes[i].vramBytes * nodes[i].computeScore;
      const layerShare = Math.round((capacity / totalCapacity) * totalLayers);

      // Ensure each node gets at least 1 layer
      const layers = Math.max(1, i === nodes.length - 1
        ? totalLayers - currentLayer
        : layerShare
      );

      distribution.push({
        start: currentLayer,
        end: currentLayer + layers - 1,
      });

      currentLayer += layers;
    }

    return distribution;
  }

  // ── Inference Pipeline ───────────────────────────────────────

  async runInference(
    inputTokens: number[],
    config: Record<string, any> = {}
  ): Promise<string> {
    const requestId = uuidv4();
    const request: InferenceRequest = {
      id: requestId,
      inputTokens,
      config,
      startTime: Date.now(),
      currentNodeIndex: 0,
      currentActivation: null,
    };

    return new Promise((resolve, reject) => {
      // Add timeout
      const timeout = setTimeout(() => {
        this.activeRequests.delete(requestId);
        reject(new Error('Pipeline inference timeout'));
      }, this.config.timeoutMs);

      // Store request handlers
      const onComplete = (output: string) => {
        clearTimeout(timeout);
        this.activeRequests.delete(requestId);
        resolve(output);
      };

      const onError = (error: string) => {
        clearTimeout(timeout);
        this.activeRequests.delete(requestId);
        reject(new Error(error));
      };

      this.activeRequests.set(requestId, {
        ...request,
        _resolve: onComplete,
        _reject: onError,
      } as any);

      // Start pipeline
      this.processRequest(request);
    });
  }

  private async processRequest(request: InferenceRequest): Promise<void> {
    if (this.isProcessing) {
      this.requestQueue.push(request);
      return;
    }

    this.isProcessing = true;
    this.activeRequests.set(request.id, request);

    try {
      // Send to first node
      await this.sendToNode(request, 0);
    } catch (err: any) {
      this.failRequest(request.id, err.message);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  private async sendToNode(
    request: InferenceRequest,
    nodeIndex: number
  ): Promise<void> {
    const node = this.config.nodes[nodeIndex];

    if (!node || node.status !== 'online' || !node.ws) {
      throw new Error(`Node ${nodeIndex} (${node?.name || 'unknown'}) is offline`);
    }

    const message = {
      type: 'process_layers',
      requestId: request.id,
      layers: node.assignedLayers,
      inputTokens: request.currentActivation ? undefined : request.inputTokens,
      activation: request.currentActivation,
      config: request.config,
    };

    node.ws.send(JSON.stringify(message));
    request.currentNodeIndex = nodeIndex;
  }

  private forwardActivation(
    sourceNode: PipelineNode,
    data: any
  ): void {
    const request = this.activeRequests.get(data.requestId);
    if (!request) return;

    request.currentActivation = data.activation;
    const nextNodeIndex = request.currentNodeIndex + 1;

    if (nextNodeIndex >= this.config.nodes.length) {
      // Pipeline complete - decode final output
      this.decodeOutput(request, data.activation);
    } else {
      // Forward to next node
      this.sendToNode(request, nextNodeIndex);
    }
  }

  private decodeOutput(
    request: InferenceRequest,
    finalActivation: ActivationBuffer
  ): void {
    // Send to last node for token decoding
    const lastNode = this.config.nodes[this.config.nodes.length - 1];
    if (lastNode.ws) {
      lastNode.ws.send(JSON.stringify({
        type: 'decode_tokens',
        requestId: request.id,
        activation: finalActivation,
        config: request.config,
      }));
    }
  }

  private completeInference(requestId: string, output: string): void {
    const request = this.activeRequests.get(requestId);
    if (!request) return;

    const latency = Date.now() - request.startTime;
    console.log(`[VPAN] Request ${requestId} completed in ${latency}ms`);

    // Update node stats
    for (const node of this.config.nodes) {
      node.stats.tokensProcessed += (output.split(/\s+/).length / this.config.nodes.length);
      node.stats.averageLatencyMs = (
        (node.stats.averageLatencyMs + latency) / 2
      );
    }

    const typedRequest = request as any;
    if (typedRequest._resolve) {
      typedRequest._resolve(output);
    }
  }

  private failRequest(requestId: string, error: string): void {
    const request = this.activeRequests.get(requestId);
    if (!request) return;

    console.error(`[VPAN] Request ${requestId} failed:`, error);

    const typedRequest = request as any;
    if (typedRequest._reject) {
      typedRequest._reject(error);
    }
  }

  private processQueue(): void {
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift()!;
      this.processRequest(next);
    }
  }

  // ── Pipeline Status ──────────────────────────────────────────

  isReady(): boolean {
    return this.config.nodes.every(n => n.status === 'online');
  }

  getStatus(): {
    ready: boolean;
    nodes: Array<{
      name: string;
      status: string;
      layers: string;
      latency: number;
    }>;
    queueLength: number;
  } {
    return {
      ready: this.isReady(),
      nodes: this.config.nodes.map(n => ({
        name: n.name,
        status: n.status,
        layers: `${n.assignedLayers.start}-${n.assignedLayers.end}`,
        latency: n.stats.averageLatencyMs,
      })),
      queueLength: this.requestQueue.length,
    };
  }

  private checkPipelineReady(): void {
    if (this.isReady()) {
      console.log('[VPAN] Pipeline ready - all nodes online');
      this.emit('pipeline:ready');
    }
  }
}

// ── Pipeline Node Server ───────────────────────────────────────

export class PipelineNodeServer extends EventEmitter {
  private wss: WebSocket.Server;
  private nodeId: string;
  private assignedLayers: { start: number; end: number };
  private modelEngine: any;  // Native inference engine

  constructor(
    port: number,
    nodeId: string,
    assignedLayers: { start: number; end: number },
    modelEngine: any
  ) {
    super();
    this.wss = new WebSocket.Server({ port });
    this.nodeId = nodeId;
    this.assignedLayers = assignedLayers;
    this.modelEngine = modelEngine;

    this.wss.on('connection', (ws) => {
      console.log(`[VPAN Node ${nodeId}] Coordinator connected`);
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'process_layers':
            await this.processLayers(ws, message);
            break;
          case 'decode_tokens':
            await this.decodeTokens(ws, message);
            break;
        }
      } catch (err: any) {
        ws.send(JSON.stringify({
          type: 'error',
          requestId: message.requestId,
          error: err.message,
        }));
      }
    });
  }

  private async processLayers(ws: WebSocket, message: any): Promise<void> {
    const startTime = Date.now();

    // Process assigned layers
    const output = await this.modelEngine.processLayers(
      message.inputTokens || message.activation,
      message.layers.start,
      message.layers.end,
      message.config
    );

    const latency = Date.now() - startTime;

    // Send activation to coordinator
    ws.send(JSON.stringify({
      type: 'activation_ready',
      requestId: message.requestId,
      activation: output,
      latency,
    }));
  }

  private async decodeTokens(ws: WebSocket, message: any): Promise<void> {
    const output = await this.modelEngine.decodeTokens(
      message.activation,
      message.config
    );

    ws.send(JSON.stringify({
      type: 'inference_complete',
      requestId: message.requestId,
      output,
    }));
  }
}
