/**
 * Haven Cluster Protocol
 * Message types and interfaces for cluster communication
 */

export interface ClusterNode {
  id: string;
  name: string;
  url: string;
  role: 'master' | 'worker';
  status: 'online' | 'offline' | 'degraded';
  joinedAt: number;
  lastHeartbeat: number;
  capabilities: NodeCapabilities;
  loadedModel?: string;
  stats?: NodeStats;
}

export interface NodeCapabilities {
  gpus: GPUInfo[];
  totalVramBytes: number;
  availableVramBytes: number;
  cpuCores: number;
  totalRamBytes: number;
  backends: string[];
  maxContextSize: number;
}

export interface GPUInfo {
  id: number;
  name: string;
  vendor: string;
  vramBytes: number;
  vramUsedBytes: number;
  temperature: number;
  utilization: number;
}

// ── Cluster Messages ────────────────────────────────────────────

export type ClusterMessage =
  | JoinRequest
  | JoinResponse
  | Heartbeat
  | HeartbeatAck
  | ModelLoadRequest
  | ModelLoadResponse
  | InferenceRequest
  | InferenceResponse
  | InferenceStreamChunk
  | NodeStatusUpdate
  | LeaveRequest;

export interface ClusterMessageBase {
  type: string;
  timestamp: number;
  sourceId: string;
  targetId?: string;
}

export interface JoinRequest extends ClusterMessageBase {
  type: 'join_request';
  node: Omit<ClusterNode, 'status' | 'joinedAt' | 'lastHeartbeat'>;
}

export interface JoinResponse extends ClusterMessageBase {
  type: 'join_response';
  accepted: boolean;
  nodeId: string;
  clusterSize: number;
  error?: string;
}

export interface Heartbeat extends ClusterMessageBase {
  type: 'heartbeat';
  stats: NodeStats;
}

export interface HeartbeatAck extends ClusterMessageBase {
  type: 'heartbeat_ack';
}

export interface ModelLoadRequest extends ClusterMessageBase {
  type: 'model_load_request';
  modelPath: string;
  config: Record<string, any>;
}

export interface ModelLoadResponse extends ClusterMessageBase {
  type: 'model_load_response';
  success: boolean;
  modelInfo?: any;
  error?: string;
}

export interface InferenceRequest extends ClusterMessageBase {
  type: 'inference_request';
  requestId: string;
  prompt: string;
  config: Record<string, any>;
  stream: boolean;
}

export interface InferenceResponse extends ClusterMessageBase {
  type: 'inference_response';
  requestId: string;
  text: string;
  stats: InferenceStats;
  error?: string;
}

export interface InferenceStreamChunk extends ClusterMessageBase {
  type: 'inference_stream_chunk';
  requestId: string;
  token: string;
  isEnd: boolean;
}

export interface NodeStatusUpdate extends ClusterMessageBase {
  type: 'node_status_update';
  status: 'online' | 'offline' | 'degraded';
  stats: NodeStats;
}

export interface LeaveRequest extends ClusterMessageBase {
  type: 'leave_request';
  reason?: string;
}

// ── Stats ───────────────────────────────────────────────────────

export interface NodeStats {
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMB: number;
  gpuStats: GPUStats[];
  inferenceStats: InferenceStats;
  uptime: number;
}

export interface GPUStats {
  gpuId: number;
  name: string;
  utilization: number;
  vramUsedMB: number;
  vramTotalMB: number;
  temperature: number;
  powerWatts?: number;
}

export interface InferenceStats {
  tokensPerSecond: number;
  tokensGenerated: number;
  inferenceTimeMs: number;
  active: boolean;
}

// ── Cluster Config ──────────────────────────────────────────────

export interface ClusterConfig {
  nodeId: string;
  nodeName: string;
  role: 'master' | 'worker';
  masterUrl?: string;
  listenPort: number;
  listenHost: string;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxWorkers: number;
  authToken?: string;
  autoReconnect: boolean;
}
