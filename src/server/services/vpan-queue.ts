/**
 * Haven VPAN - Request Queue with Fair Scheduling
 * Manages inference requests from multiple users with priority and fairness
 */

import { EventEmitter } from 'events';

// ── Types ──────────────────────────────────────────────────────

export interface QueuedRequest {
  id: string;
  userId: string;
  prompt: string;
  config: Record<string, any>;
  priority: number;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export interface QueueStats {
  totalRequests: number;
  averageWaitTimeMs: number;
  averageProcessingTimeMs: number;
  requestsPerUser: Record<string, number>;
}

// ── Fair Request Queue ─────────────────────────────────────────

export class VPANRequestQueue extends EventEmitter {
  private queue: QueuedRequest[] = [];
  private processing: Map<string, QueuedRequest> = new Map();
  private completed: QueuedRequest[] = [];
  private maxQueueSize: number;
  private maxConcurrent: number;
  private userRequestCounts: Map<string, number> = new Map();
  private isProcessing = false;

  constructor(options: { maxQueueSize?: number; maxConcurrent?: number } = {}) {
    super();
    this.maxQueueSize = options.maxQueueSize ?? 100;
    this.maxConcurrent = options.maxConcurrent ?? 3;
  }

  // ── Queue Management ─────────────────────────────────────────

  enqueue(request: Omit<QueuedRequest, 'id' | 'priority' | 'enqueuedAt' | 'status'>): QueuedRequest {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Queue is full');
    }

    // Calculate priority based on user fairness
    const userCount = this.userRequestCounts.get(request.userId) || 0;
    const priority = this.calculatePriority(request.userId, userCount);

    const queuedRequest: QueuedRequest = {
      ...request,
      id: `${request.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      priority,
      enqueuedAt: Date.now(),
      status: 'queued',
    };

    this.queue.push(queuedRequest);
    this.userRequestCounts.set(request.userId, userCount + 1);

    // Sort by priority (higher first), then by enqueue time
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    this.emit('request:queued', queuedRequest);
    this.processQueue();

    return queuedRequest;
  }

  private calculatePriority(userId: string, userCount: number): number {
    // Base priority: 100
    // Decrease priority for users with many recent requests (fairness)
    // Increase priority for waiting requests (aging)
    const basePriority = 100;
    const fairnessPenalty = userCount * 5;
    return Math.max(1, basePriority - fairnessPenalty);
  }

  // ── Processing ───────────────────────────────────────────────

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;
    if (this.processing.size >= this.maxConcurrent) return;

    this.isProcessing = true;

    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const request = this.queue.shift()!;
      await this.processRequest(request);
    }

    this.isProcessing = false;

    // Check if more can be processed
    if (this.queue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  private async processRequest(request: QueuedRequest): Promise<void> {
    request.status = 'processing';
    request.startedAt = Date.now();
    this.processing.set(request.id, request);

    this.emit('request:started', request);

    try {
      // This would call the actual inference pipeline
      // For now, we emit an event for the pipeline to handle
      const result = await new Promise<string>((resolve, reject) => {
        this.emit('request:process', request, (err: Error | null, result: string) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      request.status = 'completed';
      request.result = result;
      request.completedAt = Date.now();

      this.processing.delete(request.id);
      this.completed.push(request);

      // Keep only last 1000 completed requests
      if (this.completed.length > 1000) {
        this.completed = this.completed.slice(-1000);
      }

      this.emit('request:completed', request);
    } catch (err: any) {
      request.status = 'failed';
      request.error = err.message;
      request.completedAt = Date.now();

      this.processing.delete(request.id);
      this.emit('request:failed', request);
    }

    // Process next in queue
    this.processQueue();
  }

  // ── Status & Monitoring ──────────────────────────────────────

  getQueueStatus(): {
    queued: number;
    processing: number;
    completed: number;
    estimatedWaitTimeMs: number;
  } {
    const avgProcessingTime = this.getAverageProcessingTime();
    const estimatedWaitTime = this.queue.length > 0
      ? (this.queue.length / this.maxConcurrent) * avgProcessingTime
      : 0;

    return {
      queued: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.length,
      estimatedWaitTimeMs: Math.round(estimatedWaitTime),
    };
  }

  getStats(): QueueStats {
    const completedRequests = this.completed.filter(r => r.status === 'completed');
    const totalRequests = completedRequests.length + this.processing.size;

    const averageWaitTimeMs = completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => sum + (r.startedAt! - r.enqueuedAt), 0) / completedRequests.length
      : 0;

    const averageProcessingTimeMs = completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => sum + (r.completedAt! - r.startedAt!), 0) / completedRequests.length
      : 0;

    const requestsPerUser: Record<string, number> = {};
    for (const request of [...this.completed, ...Array.from(this.processing.values())]) {
      requestsPerUser[request.userId] = (requestsPerUser[request.userId] || 0) + 1;
    }

    return {
      totalRequests,
      averageWaitTimeMs: Math.round(averageWaitTimeMs),
      averageProcessingTimeMs: Math.round(averageProcessingTimeMs),
      requestsPerUser,
    };
  }

  private getAverageProcessingTime(): number {
    const completedRequests = this.completed.filter(r => r.status === 'completed');
    if (completedRequests.length === 0) return 5000; // Default 5s estimate

    return completedRequests.reduce(
      (sum, r) => sum + (r.completedAt! - r.startedAt!),
      0
    ) / completedRequests.length;
  }

  // ── Request Management ───────────────────────────────────────

  cancelRequest(requestId: string): boolean {
    const index = this.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      request.status = 'failed';
      request.error = 'Cancelled by user';
      this.emit('request:cancelled', request);
      return true;
    }

    const processing = this.processing.get(requestId);
    if (processing) {
      processing.status = 'failed';
      processing.error = 'Cancelled by user';
      this.processing.delete(requestId);
      this.emit('request:cancelled', processing);
      return true;
    }

    return false;
  }

  getRequest(requestId: string): QueuedRequest | null {
    // Check queue
    const queued = this.queue.find(r => r.id === requestId);
    if (queued) return queued;

    // Check processing
    const processing = this.processing.get(requestId);
    if (processing) return processing;

    // Check completed
    const completed = this.completed.find(r => r.id === requestId);
    if (completed) return completed;

    return null;
  }

  getUserRequests(userId: string): QueuedRequest[] {
    return [
      ...this.queue.filter(r => r.userId === userId),
      ...Array.from(this.processing.values()).filter(r => r.userId === userId),
      ...this.completed.filter(r => r.userId === userId),
    ];
  }

  clearQueue(): void {
    for (const request of this.queue) {
      request.status = 'failed';
      request.error = 'Queue cleared';
      this.emit('request:cancelled', request);
    }
    this.queue = [];
  }
}
