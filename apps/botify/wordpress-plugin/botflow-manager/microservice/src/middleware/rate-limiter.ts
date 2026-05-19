import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Skip rate limiting for health checks
  if (req.path === '/health' || req.path === '/health/live') {
    return next();
  }

  const clientId = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const key = `${clientId}:${req.path}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    entry = {
      count: 1,
      resetTime: now + config.RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(key, entry);
  } else {
    entry.count++;
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.RATE_LIMIT_MAX_REQUESTS - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

  if (entry.count > config.RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    });
  }

  next();
};
