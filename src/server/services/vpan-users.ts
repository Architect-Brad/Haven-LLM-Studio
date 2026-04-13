/**
 * Haven VPAN - User Management Service
 * Manages family member accounts, API keys, and permissions
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export interface VPANUser {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'child';
  apiKey: string;
  createdAt: number;
  lastActive: number;
  limits: {
    maxTokensPerRequest: number;
    maxRequestsPerHour: number;
    allowedModels: string[];
    contentFilter: boolean;
  };
  stats: {
    totalRequests: number;
    totalTokens: number;
    lastRequestTime: number;
  };
}

export interface VPANConfig {
  networkName: string;
  adminApiKey: string;
  users: VPANUser[];
  defaultLimits: {
    maxTokensPerRequest: number;
    maxRequestsPerHour: number;
    contentFilter: boolean;
  };
}

// ── User Management Service ────────────────────────────────────

export class VPANUserService extends EventEmitter {
  private configPath: string;
  private config: VPANConfig;

  constructor(configPath: string = path.join(process.env.HOME || '.', '.haven', 'vpan.json')) {
    super();
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): VPANConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('[VPAN] Failed to load config, creating new:', err);
    }

    // Default config
    const defaultConfig: VPANConfig = {
      networkName: 'My Haven Network',
      adminApiKey: this.generateApiKey(),
      users: [],
      defaultLimits: {
        maxTokensPerRequest: 2048,
        maxRequestsPerHour: 100,
        contentFilter: true,
      },
    };

    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  private saveConfig(config: VPANConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private generateApiKey(): string {
    return `vpan_${crypto.randomBytes(24).toString('hex')}`;
  }

  // ── User CRUD ────────────────────────────────────────────────

  createUser(
    name: string,
    role: 'admin' | 'member' | 'child' = 'member',
    limits?: Partial<VPANUser['limits']>
  ): VPANUser {
    const user: VPANUser = {
      id: crypto.randomUUID(),
      name,
      role,
      apiKey: this.generateApiKey(),
      createdAt: Date.now(),
      lastActive: Date.now(),
      limits: {
        maxTokensPerRequest: limits?.maxTokensPerRequest ?? this.config.defaultLimits.maxTokensPerRequest,
        maxRequestsPerHour: limits?.maxRequestsPerHour ?? this.config.defaultLimits.maxRequestsPerHour,
        allowedModels: limits?.allowedModels ?? ['*'],
        contentFilter: limits?.contentFilter ?? this.config.defaultLimits.contentFilter,
      },
      stats: {
        totalRequests: 0,
        totalTokens: 0,
        lastRequestTime: 0,
      },
    };

    this.config.users.push(user);
    this.saveConfig(this.config);

    this.emit('user:created', user);
    return user;
  }

  getUserById(id: string): VPANUser | null {
    return this.config.users.find(u => u.id === id) || null;
  }

  getUserByApiKey(apiKey: string): VPANUser | null {
    return this.config.users.find(u => u.apiKey === apiKey) || null;
  }

  updateUser(id: string, updates: Partial<VPANUser>): VPANUser | null {
    const index = this.config.users.findIndex(u => u.id === id);
    if (index === -1) return null;

    this.config.users[index] = { ...this.config.users[index], ...updates };
    this.saveConfig(this.config);

    this.emit('user:updated', this.config.users[index]);
    return this.config.users[index];
  }

  deleteUser(id: string): boolean {
    const index = this.config.users.findIndex(u => u.id === id);
    if (index === -1) return false;

    const user = this.config.users[index];
    this.config.users.splice(index, 1);
    this.saveConfig(this.config);

    this.emit('user:deleted', user);
    return true;
  }

  listUsers(): VPANUser[] {
    return this.config.users.map(u => ({
      ...u,
      apiKey: '***', // Hide API keys in list
    }));
  }

  // ── API Key Management ───────────────────────────────────────

  regenerateApiKey(userId: string): string | null {
    const user = this.getUserById(userId);
    if (!user) return null;

    const newKey = this.generateApiKey();
    user.apiKey = newKey;
    this.saveConfig(this.config);

    return newKey;
  }

  // ── Rate Limiting ────────────────────────────────────────────

  checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetTime: number } {
    const user = this.getUserById(userId);
    if (!user) return { allowed: false, remaining: 0, resetTime: 0 };

    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const windowStart = now - windowMs;

    // Count requests in current window
    const requestsInWindow = user.stats.totalRequests; // Simplified - would need request log

    const remaining = Math.max(0, user.limits.maxRequestsPerHour - requestsInWindow);
    const resetTime = windowStart + windowMs;

    return {
      allowed: remaining > 0,
      remaining,
      resetTime,
    };
  }

  recordUsage(userId: string, tokensUsed: number): void {
    const user = this.getUserById(userId);
    if (!user) return;

    user.stats.totalRequests++;
    user.stats.totalTokens += tokensUsed;
    user.stats.lastRequestTime = Date.now();
    user.lastActive = Date.now();

    this.saveConfig(this.config);
    this.emit('user:usage', { userId, tokensUsed });
  }

  // ── Content Filtering ────────────────────────────────────────

  filterContent(userId: string, text: string): string {
    const user = this.getUserById(userId);
    if (!user || !user.limits.contentFilter) return text;

    // Basic content filtering for child accounts
    const blockedPatterns = [
      /explicit\s+content/i,
      /nsfw/i,
      /adult\s+content/i,
    ];

    let filtered = text;
    for (const pattern of blockedPatterns) {
      filtered = filtered.replace(pattern, '[FILTERED]');
    }

    return filtered;
  }

  // ── Network Info ─────────────────────────────────────────────

  getNetworkInfo(): {
    name: string;
    userCount: number;
    totalRequests: number;
    totalTokens: number;
  } {
    return {
      name: this.config.networkName,
      userCount: this.config.users.length,
      totalRequests: this.config.users.reduce((sum, u) => sum + u.stats.totalRequests, 0),
      totalTokens: this.config.users.reduce((sum, u) => sum + u.stats.totalTokens, 0),
    };
  }
}
