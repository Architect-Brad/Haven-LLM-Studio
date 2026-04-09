/**
 * Haven Cluster Service
 * Manages cluster communication, node discovery, and load balancing
 */

import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { getNativeAddon } from './native-loader.js';
import type { SystemMonitor } from './system-monitor.service.js';
import type {
  ClusterNode,
  ClusterConfig,
  ClusterMessage,
  JoinRequest,
  JoinResponse,
  Heartbeat,
  HeartbeatAck,
  InferenceRequest,
  InferenceResponse,
  InferenceStreamChunk,
  NodeStats,
  NodeStatusUpdate,
} from './cluster-protocol.js';

export interface ClusterState {
  nodes: Map<string, ClusterNode>;
  masterNode: ClusterNode | null;
  thisNode: ClusterNode | null;
}

export interface InferenceTask {
  requestId: string;
  prompt: string;
  config: Record<string, any>;
  stream: boolean;
  assignedNode: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  callbacks: Array<(chunk: string) => void>;
}

export class ClusterService extends EventEmitter {
  private config: ClusterConfig;
  private state: ClusterState = {
    nodes: new Map(),
    masterNode: null,
    thisNode: null,
  };
  private wss: WebSocketServer | null = null;
  private masterWs: WebSocket | null = null;
  private workerConnections: Map<string, WebSocket> = new Map();
  private inferenceTasks: Map<string, InferenceTask> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private systemMonitor_: SystemMonitor | null = null;

  constructor(config: ClusterConfig, systemMonitor?: SystemMonitor) {
    super();
    this.config = config;
    this.systemMonitor_ = systemMonitor || null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async start(): Promise<void> {
    this.state.thisNode = this.createThisNode();

    if (this.config.role === 'master') {
      await this.startMaster();
    } else {
      await this.startWorker();
    }

    this.startHeartbeat();
    this.emit('cluster:started', { node: this.state.thisNode });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.masterWs) {
      this.masterWs.close();
    }

    for (const [, ws] of this.workerConnections) {
      ws.close();
    }

    if (this.wss) {
      this.wss.close();
    }

    this.emit('cluster:stopped');
  }

  // ── Master Mode ───────────────────────────────────────────────

  private async startMaster(): Promise<void> {
    this.state.masterNode = this.state.thisNode;

    this.wss = new WebSocketServer({
      port: this.config.listenPort,
      host: this.config.listenHost,
    });

    this.wss.on('connection', (ws, req) => {
      const nodeId = req.headers['x-node-id'] as string;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as ClusterMessage;
          this.handleMasterMessage(nodeId, ws, message);
        } catch {
          // Invalid message
        }
      });

      ws.on('close', () => {
        if (nodeId && this.state.nodes.has(nodeId)) {
          const node = this.state.nodes.get(nodeId)!;
          node.status = 'offline';
          this.emit('node:offline', node);
        }
      });
    });

    console.log(`[Cluster] Master listening on ws://${this.config.listenHost}:${this.config.listenPort}`);
  }

  private handleMasterMessage(
    nodeId: string,
    ws: WebSocket,
    message: ClusterMessage,
  ): void {
    switch (message.type) {
      case 'join_request':
        this.handleJoinRequest(nodeId, ws, message as JoinRequest);
        break;

      case 'heartbeat':
        this.handleHeartbeat(nodeId, message as Heartbeat);
        break;

      case 'inference_response':
        this.handleInferenceResponse(message as InferenceResponse);
        break;

      case 'inference_stream_chunk':
        this.handleStreamChunk(message as InferenceStreamChunk);
        break;

      case 'node_status_update':
        this.handleStatusUpdate(nodeId, message as NodeStatusUpdate);
        break;
    }
  }

  private handleJoinRequest(
    nodeId: string,
    ws: WebSocket,
    message: JoinRequest,
  ): void {
    if (this.state.nodes.size >= this.config.maxWorkers) {
      this.sendTo(ws, {
        type: 'join_response',
        timestamp: Date.now(),
        sourceId: this.config.nodeId,
        accepted: false,
        nodeId: '',
        clusterSize: this.state.nodes.size,
        error: 'Cluster full',
      } as JoinResponse);
      return;
    }

    const node: ClusterNode = {
      id: nodeId,
      name: message.node.name,
      url: message.node.url,
      role: 'worker',
      status: 'online',
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
      capabilities: message.node.capabilities,
    };

    this.state.nodes.set(nodeId, node);
    this.workerConnections.set(nodeId, ws);

    this.sendTo(ws, {
      type: 'join_response',
      timestamp: Date.now(),
      sourceId: this.config.nodeId,
      accepted: true,
      nodeId: nodeId,
      clusterSize: this.state.nodes.size,
    } as JoinResponse);

    console.log(`[Cluster] Worker joined: ${node.name} (${nodeId})`);
    this.emit('node:joined', node);
  }

  private handleHeartbeat(nodeId: string, message: Heartbeat): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    node.lastHeartbeat = Date.now();
    node.stats = message.stats as any;

    // Forward stats to listeners
    this.emit('node:stats', { nodeId, stats: message.stats });
  }

  private handleStatusUpdate(
    nodeId: string,
    message: NodeStatusUpdate,
  ): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    node.status = message.status;
    this.emit('node:status', { nodeId, status: message.status });
  }

  // ── Worker Mode ───────────────────────────────────────────────

  private async startWorker(): Promise<void> {
    if (!this.config.masterUrl) {
      throw new Error('Worker requires masterUrl');
    }

    this.connectToMaster();
  }

  private connectToMaster(): void {
    const ws = new WebSocket(this.config.masterUrl!, {
      headers: {
        'X-Node-Id': this.config.nodeId,
        'X-Node-Name': this.config.nodeName,
        'X-Node-Role': this.config.role,
      },
    });

    ws.on('open', () => {
      console.log(`[Cluster] Connected to master: ${this.config.masterUrl}`);

      // Send join request
      this.sendTo(ws, {
        type: 'join_request',
        timestamp: Date.now(),
        sourceId: this.config.nodeId,
        node: {
          id: this.config.nodeId,
          name: this.config.nodeName,
          url: `${this.config.listenHost}:${this.config.listenPort}`,
          role: 'worker',
          capabilities: this.getNodeCapabilities(),
        },
      } as JoinRequest);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClusterMessage;
        this.handleWorkerMessage(ws, message);
      } catch {
        // Invalid
      }
    });

    ws.on('close', () => {
      console.log('[Cluster] Disconnected from master');
      if (this.config.autoReconnect) {
        setTimeout(() => this.connectToMaster(), 5000);
      }
    });

    ws.on('error', (err) => {
      console.error('[Cluster] Master connection error:', err.message);
    });

    this.masterWs = ws;
  }

  private handleWorkerMessage(ws: WebSocket, message: ClusterMessage): void {
    switch (message.type) {
      case 'join_response':
        this.handleJoinResponse(message as JoinResponse);
        break;

      case 'heartbeat_ack':
        // Heartbeat acknowledged
        break;

      case 'inference_request':
        this.handleInferenceRequest(ws, message as InferenceRequest);
        break;
    }
  }

  private handleJoinResponse(message: JoinResponse): void {
    if (message.accepted) {
      console.log(`[Cluster] Joined cluster (${message.clusterSize} nodes)`);
      this.emit('cluster:joined', { clusterSize: message.clusterSize });
    } else {
      console.error(`[Cluster] Join rejected: ${message.error}`);
      this.emit('cluster:join_failed', { error: message.error });
    }
  }

  private async handleInferenceRequest(
    ws: WebSocket,
    message: InferenceRequest,
  ): Promise<void> {
    // This would call the local inference service
    // For now, acknowledge receipt
    this.sendTo(ws, {
      type: 'inference_response',
      timestamp: Date.now(),
      sourceId: this.config.nodeId,
      targetId: message.sourceId,
      requestId: message.requestId,
      text: '[Worker inference not yet connected to local engine]',
      stats: {
        tokensPerSecond: 0,
        tokensGenerated: 0,
        inferenceTimeMs: 0,
        active: false,
      },
    } as InferenceResponse);
  }

  // ── Heartbeat ─────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
      this.checkHeartbeatTimeouts();
    }, this.config.heartbeatIntervalMs);
  }

  private sendHeartbeat(): void {
    const stats = this.getNodeStats();

    if (this.config.role === 'worker' && this.masterWs) {
      this.sendTo(this.masterWs, {
        type: 'heartbeat',
        timestamp: Date.now(),
        sourceId: this.config.nodeId,
        stats,
      } as Heartbeat);
    }
  }

  private checkHeartbeatTimeouts(): void {
    const now = Date.now();
    const timeout = this.config.heartbeatTimeoutMs;

    for (const [nodeId, node] of this.state.nodes) {
      if (now - node.lastHeartbeat > timeout) {
        node.status = 'offline';
        this.emit('node:timeout', node);
        console.warn(`[Cluster] Node timeout: ${node.name} (${nodeId})`);
      }
    }
  }

  // ── Inference Routing ─────────────────────────────────────────

  async routeInference(
    prompt: string,
    config: Record<string, any>,
    stream: boolean,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const task: InferenceTask = {
      requestId: uuidv4(),
      prompt,
      config,
      stream,
      assignedNode: null,
      status: 'pending',
      callbacks: onChunk ? [onChunk] : [],
    };

    this.inferenceTasks.set(task.requestId, task);

    if (this.config.role === 'master') {
      return this.routeFromMaster(task);
    } else {
      return this.routeFromWorker(task);
    }
  }

  private async routeFromMaster(task: InferenceTask): Promise<string> {
    // Find best node for this task
    const targetNode = this.selectBestNode();

    if (!targetNode || targetNode.id === this.config.nodeId) {
      // Run locally
      task.assignedNode = this.config.nodeId;
      task.status = 'running';
      // Would call local inference here
      task.status = 'completed';
      return '[Local inference placeholder]';
    }

    // Route to worker
    const ws = this.workerConnections.get(targetNode.id);
    if (!ws) {
      task.status = 'failed';
      task.error = 'Node unavailable';
      throw new Error('Node unavailable');
    }

    task.assignedNode = targetNode.id;
    task.status = 'running';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        task.status = 'failed';
        reject(new Error('Inference timeout'));
      }, 60000);

      this.sendTo(ws, {
        type: 'inference_request',
        timestamp: Date.now(),
        sourceId: this.config.nodeId,
        requestId: task.requestId,
        prompt: task.prompt,
        config: task.config,
        stream: task.stream,
      } as InferenceRequest);

      // Resolve when response comes back (handled in handleInferenceResponse)
      const checkComplete = setInterval(() => {
        if (task.status === 'completed') {
          clearTimeout(timeout);
          clearInterval(checkComplete);
          resolve(task.result || '');
        } else if (task.status === 'failed') {
          clearTimeout(timeout);
          clearInterval(checkComplete);
          reject(new Error(task.error || 'Inference failed'));
        }
      }, 100);
    });
  }

  private async routeFromWorker(task: InferenceTask): Promise<string> {
    // Worker runs locally
    task.assignedNode = this.config.nodeId;
    task.status = 'running';
    // Would call local inference here
    task.status = 'completed';
    return '[Local inference placeholder]';
  }

  private handleInferenceResponse(message: InferenceResponse): void {
    const task = this.inferenceTasks.get(message.requestId);
    if (!task) return;

    task.status = message.error ? 'failed' : 'completed';
    task.result = message.text;
    task.error = message.error;
  }

  private handleStreamChunk(message: InferenceStreamChunk): void {
    const task = this.inferenceTasks.get(message.requestId);
    if (!task) return;

    for (const cb of task.callbacks) {
      cb(message.token);
    }

    if (message.isEnd) {
      task.status = 'completed';
    }
  }

  // ── Node Selection ────────────────────────────────────────────

  private selectBestNode(): ClusterNode | null {
    let bestNode: ClusterNode | null = null;
    let bestScore = -1;

    for (const [, node] of this.state.nodes) {
      if (node.status !== 'online') continue;

      // Score based on available VRAM and current load
      const vramScore = node.capabilities.availableVramBytes / node.capabilities.totalVramBytes;
      const loadScore = 1 - (node.stats?.inferenceStats?.active ? 0.5 : 0);
      const score = vramScore * 0.7 + loadScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    return bestNode;
  }

  // ── Helpers ───────────────────────────────────────────────────

  private sendTo(ws: WebSocket, message: ClusterMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private createThisNode(): ClusterNode {
    return {
      id: this.config.nodeId,
      name: this.config.nodeName,
      url: `${this.config.listenHost}:${this.config.listenPort}`,
      role: this.config.role,
      status: 'online',
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
      capabilities: this.getNodeCapabilities(),
    };
  }

  private getNodeCapabilities(): any {
    // Call the native optimization layer if available
    const addon = getNativeAddon();

    if (addon) {
      try {
        // Get hardware info from system monitor
        const sysInfo = this.systemMonitor_?.getSystemInfo();

        return {
          gpus: [], // Would query native GPU detection
          totalVramBytes: 0,
          availableVramBytes: 0,
          cpuCores: sysInfo?.cpu.cores || 0,
          totalRamBytes: sysInfo?.memory.total || 0,
          backends: ['cpu'],
          maxContextSize: 4096,
        };
      } catch {
        // Fallback
      }
    }

    // Fallback: use Node.js os module
    const os = require('os');
    return {
      gpus: [],
      totalVramBytes: 0,
      availableVramBytes: 0,
      cpuCores: os.cpus().length,
      totalRamBytes: os.totalmem(),
      backends: ['cpu'],
      maxContextSize: 4096,
    };
  }

  private getNodeStats(): any {
    return {
      cpuPercent: 0,
      memoryPercent: 0,
      memoryUsedMB: 0,
      gpuStats: [],
      inferenceStats: {
        tokensPerSecond: 0,
        tokensGenerated: 0,
        inferenceTimeMs: 0,
        active: false,
      },
      uptime: process.uptime(),
    };
  }

  // ── Public API ────────────────────────────────────────────────

  getNodes(): ClusterNode[] {
    return Array.from(this.state.nodes.values());
  }

  getThisNode(): ClusterNode | null {
    return this.state.thisNode;
  }

  getMasterNode(): ClusterNode | null {
    return this.state.masterNode;
  }

  getClusterSize(): number {
    return this.state.nodes.size + (this.config.role === 'master' ? 1 : 0);
  }
}
