import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

export interface AuthRateLimits {
  login: RateLimitConfig;
  register: RateLimitConfig;
  refresh: RateLimitConfig;
}

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  login: { windowMs: 15 * 60 * 1000, limit: 10 },
  register: { windowMs: 60 * 60 * 1000, limit: 5 },
  refresh: { windowMs: 15 * 60 * 1000, limit: 30 },
};

const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      code: 'rate_limited',
      message: 'Too many requests, please slow down',
    });
  },
};

export function buildAuthLimiter(cfg: RateLimitConfig): RequestHandler {
  return rateLimit({
    ...baseOptions,
    windowMs: cfg.windowMs,
    limit: cfg.limit,
  });
}
