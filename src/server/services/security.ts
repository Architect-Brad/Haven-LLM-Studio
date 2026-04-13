/**
 * Haven LLM Studio - Security Middleware
 * Localhost hardening, rate limiting, API keys, and prompt injection prevention
 */

import { Request, Response, NextFunction } from 'express';

// ── Configuration ──────────────────────────────────────────────

export interface SecurityConfig {
  // Rate limiting
  rateLimit: {
    enabled: boolean;
    maxRequests: number;      // Max requests per window
    windowMs: number;         // Window in milliseconds
  };

  // API Key authentication
  apiKey: {
    enabled: boolean;
    keys: string[];           // Valid API keys
    header: string;           // Header name for API key
  };

  // CORS
  cors: {
    allowedOrigins: string[]; // Allowed origins
    allowLocalhost: boolean;  // Allow localhost origins
  };

  // Request limits
  limits: {
    maxBodySize: string;      // Max request body size
    maxPromptLength: number;  // Max prompt length in characters
    maxMessages: number;      // Max messages in chat array
  };

  // Prompt injection prevention
  promptInjection: {
    enabled: boolean;
    blockedPatterns: string[];  // Regex patterns to block
    systemPromptProtection: boolean;
    outputFiltering: boolean;
  };
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  rateLimit: {
    enabled: true,
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  apiKey: {
    enabled: false,
    keys: [],
    header: 'X-Haven-API-Key',
  },
  cors: {
    allowedOrigins: [],
    allowLocalhost: true,
  },
  limits: {
    maxBodySize: '10mb',
    maxPromptLength: 32768,
    maxMessages: 50,
  },
  promptInjection: {
    enabled: true,
    blockedPatterns: [
      /ignore\s+(previous|all|above)\s+(instructions|rules|prompts)/i,
      /developer\s*mode/i,
      /system\s*override/i,
      /bypass\s*(security|restrictions|filters)/i,
      /DAN\s*mode/i,
      /jailbreak/i,
      /<\s*script/i,
      /javascript\s*:/i,
      /data\s*:\s*text\/html/i,
    ],
    systemPromptProtection: true,
    outputFiltering: true,
  },
};

// ── Rate Limiter ───────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function rateLimiter(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.rateLimit.enabled) return next();

    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = rateLimitMap.get(clientIp);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.rateLimit.windowMs,
      };
      rateLimitMap.set(clientIp, entry);
    } else {
      entry.count++;
    }

    // Set rate limit headers
    res.set('X-RateLimit-Limit', config.rateLimit.maxRequests.toString());
    res.set('X-RateLimit-Remaining', Math.max(0, config.rateLimit.maxRequests - entry.count).toString());
    res.set('X-RateLimit-Reset', new Date(entry.resetTime).toUTCString());

    if (entry.count > config.rateLimit.maxRequests) {
      res.set('Retry-After', Math.ceil((entry.resetTime - now) / 1000).toString());
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    next();
  };
}

// ── API Key Authentication ─────────────────────────────────────

function apiKeyAuth(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.apiKey.enabled) return next();

    const providedKey = req.headers[config.apiKey.header.toLowerCase()] as string;

    if (!providedKey) {
      return res.status(401).json({
        error: 'API key required',
        header: config.apiKey.header,
      });
    }

    if (!config.apiKey.keys.includes(providedKey)) {
      return res.status(403).json({
        error: 'Invalid API key',
      });
    }

    next();
  };
}

// ── CORS Middleware ────────────────────────────────────────────

function corsMiddleware(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (!origin) return next();

    // Allow localhost origins
    if (config.cors.allowLocalhost) {
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;
      if (localhostPattern.test(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Haven-API-Key');
        res.set('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
          return res.sendStatus(204);
        }
      }
    }

    // Check allowed origins
    if (config.cors.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Haven-API-Key');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
    }

    next();
  };
}

// ── Request Size Limits ────────────────────────────────────────

function requestLimits(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check prompt length for completion requests
    if (req.path === '/v1/completions' && req.body?.prompt) {
      if (req.body.prompt.length > config.limits.maxPromptLength) {
        return res.status(413).json({
          error: `Prompt exceeds maximum length of ${config.limits.maxPromptLength} characters`,
        });
      }
    }

    // Check message count for chat requests
    if (req.path === '/v1/chat/completions' && req.body?.messages) {
      if (req.body.messages.length > config.limits.maxMessages) {
        return res.status(413).json({
          error: `Too many messages. Maximum is ${config.limits.maxMessages}`,
        });
      }

      // Check individual message lengths
      for (const msg of req.body.messages) {
        if (msg.content && msg.content.length > config.limits.maxPromptLength) {
          return res.status(413).json({
            error: `Message content exceeds maximum length of ${config.limits.maxPromptLength} characters`,
          });
        }
      }
    }

    next();
  };
}

// ── Prompt Injection Prevention ────────────────────────────────

function promptInjectionPrevention(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.promptInjection.enabled) return next();

    const inputs: string[] = [];

    // Collect all text inputs from the request
    if (req.body?.prompt) {
      inputs.push(req.body.prompt);
    }

    if (req.body?.messages) {
      for (const msg of req.body.messages) {
        if (msg.content) {
          inputs.push(msg.content);
        }
      }
    }

    if (req.body?.input) {
      inputs.push(req.body.input);
    }

    // Check for injection patterns
    for (const input of inputs) {
      const normalized = normalizeInput(input);

      for (const pattern of config.promptInjection.blockedPatterns) {
        if (pattern.test(normalized)) {
          console.warn(`[Security] Blocked prompt injection attempt: ${pattern.source}`);
          return res.status(400).json({
            error: 'Request blocked: potentially malicious input detected',
            code: 'PROMPT_INJECTION_DETECTED',
          });
        }
      }
    }

    // Store original response send for output filtering
    if (config.promptInjection.outputFiltering) {
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const filtered = filterOutput(body);
        return originalJson(filtered);
      };
    }

    next();
  };
}

// ── Helper Functions ───────────────────────────────────────────

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/(.)\1{2,}/g, '$1')    // Remove character repetition
    .replace(/[^\w\s]/g, '')        // Remove special characters
    .trim();
}

function filterOutput(body: any): any {
  if (!body) return body;

  // Filter text completions
  if (body.choices) {
    for (const choice of body.choices) {
      if (choice.text) {
        choice.text = sanitizeOutput(choice.text);
      }
      if (choice.message?.content) {
        choice.message.content = sanitizeOutput(choice.message.content);
      }
      if (choice.delta?.content) {
        choice.delta.content = sanitizeOutput(choice.delta.content);
      }
    }
  }

  return body;
}

function sanitizeOutput(text: string): string {
  if (!text) return text;

  // Remove potential system prompt leakage patterns
  const leakagePatterns = [
    /you are a helpful assistant/gi,
    /system prompt/gi,
    /developer instructions/gi,
    /ignore previous/gi,
  ];

  let sanitized = text;
  for (const pattern of leakagePatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

// ── Security Headers ───────────────────────────────────────────

function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  };
}

// ── Export Middleware Factory ──────────────────────────────────

export function createSecurityMiddleware(config: Partial<SecurityConfig> = {}) {
  const mergedConfig: SecurityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
    ...config,
    rateLimit: { ...DEFAULT_SECURITY_CONFIG.rateLimit, ...config.rateLimit },
    apiKey: { ...DEFAULT_SECURITY_CONFIG.apiKey, ...config.apiKey },
    cors: { ...DEFAULT_SECURITY_CONFIG.cors, ...config.cors },
    limits: { ...DEFAULT_SECURITY_CONFIG.limits, ...config.limits },
    promptInjection: { ...DEFAULT_SECURITY_CONFIG.promptInjection, ...config.promptInjection },
  };

  return {
    rateLimiter: rateLimiter(mergedConfig),
    apiKeyAuth: apiKeyAuth(mergedConfig),
    cors: corsMiddleware(mergedConfig),
    requestLimits: requestLimits(mergedConfig),
    promptInjection: promptInjectionPrevention(mergedConfig),
    securityHeaders: securityHeaders(),
  };
}
