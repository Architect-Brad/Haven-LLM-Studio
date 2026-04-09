/**
 * System Monitor Service
 * Real-time system resource monitoring with delta-based CPU tracking
 */

import { EventEmitter } from 'events';
import os from 'os';

export interface SystemInfo {
  platform: string;
  arch: string;
  cpu: {
    model: string;
    cores: number;
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
  gpu?: {
    model: string;
    vram_total?: number;
    vram_used?: number;
    vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  };
}

export interface RealTimeStats {
  timestamp: number;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  gpu_percent?: number;
  gpu_memory_percent?: number;
  inference?: {
    tokens_per_second: number;
    active: boolean;
  };
}

interface CpuTimes {
  idle: number;
  total: number;
}

export class SystemMonitor extends EventEmitter {
  private cpuHistory: number[] = [];
  private memoryHistory: number[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private previousCpuTimes: CpuTimes | null = null;

  constructor() {
    super();
    this.startPolling();
  }

  private startPolling(): void {
    // Initialize baseline
    this.previousCpuTimes = this.getCpuTimes();

    this.pollingInterval = setInterval(() => {
      const stats = this.getStats();
      this.emit('stats:update', stats);
    }, 1000);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Get system information
   */
  getSystemInfo(): SystemInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const cpus = os.cpus();
    const cpu = cpus[0];

    const info: SystemInfo = {
      platform: process.platform,
      arch: process.arch,
      cpu: {
        model: cpu.model,
        cores: cpus.length,
        speed: cpu.speed,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percent: Math.round((usedMem / totalMem) * 100),
      },
      gpu: this.detectGPU(),
    };

    return info;
  }

  /**
   * Get real-time statistics with delta-based CPU tracking
   */
  getStats(): RealTimeStats {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = Math.round((usedMem / totalMem) * 100);

    // Delta-based CPU usage calculation
    const cpuPercent = this.calculateCPUUsageDelta();

    const stats: RealTimeStats = {
      timestamp: Date.now(),
      cpu_percent: cpuPercent,
      memory_percent: memoryPercent,
      memory_used_mb: Math.round(usedMem / 1024 / 1024),
      inference: {
        tokens_per_second: 0,
        active: false,
      },
    };

    // Track history for averaging
    this.cpuHistory.push(cpuPercent);
    this.memoryHistory.push(memoryPercent);

    if (this.cpuHistory.length > 10) this.cpuHistory.shift();
    if (this.memoryHistory.length > 10) this.memoryHistory.shift();

    return stats;
  }

  /**
   * Detect GPU information
   */
  private detectGPU(): SystemInfo['gpu'] {
    const platform = process.platform;

    if (platform === 'darwin') {
      const arch = os.arch();
      if (arch === 'arm64') {
        return {
          model: 'Apple Silicon',
          vendor: 'apple',
        };
      }
      return {
        model: 'AMD GPU',
        vendor: 'amd',
      };
    }

    if (platform === 'win32') {
      return {
        model: 'Unknown',
        vendor: 'unknown',
      };
    }

    if (platform === 'linux') {
      // Try to detect NVIDIA GPU from /proc/driver/nvidia
      try {
        const { readFileSync } = require('fs');
        const nvidiaInfo = readFileSync('/proc/driver/nvidia/version', 'utf-8');
        if (nvidiaInfo) {
          return {
            model: 'NVIDIA GPU',
            vendor: 'nvidia',
          };
        }
      } catch {
        // Not available
      }

      // Try lspci for AMD/Intel
      try {
        const { execSync } = require('child_process');
        const lspciOutput = execSync('lspci 2>/dev/null | grep -i vga', { encoding: 'utf-8' });
        if (lspciOutput.toLowerCase().includes('amd')) {
          return { model: 'AMD GPU', vendor: 'amd' };
        }
        if (lspciOutput.toLowerCase().includes('intel')) {
          return { model: 'Intel GPU', vendor: 'intel' };
        }
      } catch {
        // Not available
      }

      return {
        model: 'Unknown',
        vendor: 'unknown',
      };
    }

    return undefined;
  }

  /**
   * Get current CPU times (idle + total)
   */
  private getCpuTimes(): CpuTimes {
    const cpus = os.cpus();
    let total = 0;
    let idle = 0;

    for (const cpu of cpus) {
      const times = cpu.times;
      total += times.user + times.nice + times.sys + times.irq + times.idle;
      idle += times.idle;
    }

    return { idle, total };
  }

  /**
   * Calculate CPU usage percentage using delta between two samples
   * This gives actual real-time CPU usage instead of cumulative average
   */
  private calculateCPUUsageDelta(): number {
    const currentTimes = this.getCpuTimes();

    if (!this.previousCpuTimes) {
      this.previousCpuTimes = currentTimes;
      return 0;
    }

    const totalDelta = currentTimes.total - this.previousCpuTimes.total;
    const idleDelta = currentTimes.idle - this.previousCpuTimes.idle;

    // Update previous times for next calculation
    this.previousCpuTimes = currentTimes;

    if (totalDelta === 0) return 0;

    // CPU usage = 1 - (idle_delta / total_delta)
    const usage = Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Get average CPU usage over last 10 seconds
   */
  getAverageCPUUsage(): number {
    if (this.cpuHistory.length === 0) return 0;
    const sum = this.cpuHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.cpuHistory.length);
  }

  /**
   * Get average memory usage over last 10 seconds
   */
  getAverageMemoryUsage(): number {
    if (this.memoryHistory.length === 0) return 0;
    const sum = this.memoryHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.memoryHistory.length);
  }
}
