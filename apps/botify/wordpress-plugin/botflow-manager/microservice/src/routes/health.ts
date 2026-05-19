import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { WordPressClient } from '../services/wordpress-client.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  /** True when Omni bridge env vars are all set (no secret values exposed). */
  omniconnectBridge: {
    configured: boolean;
  };
  checks: {
    wordpress: boolean;
    redis: boolean;
    ai_providers: {
      lovable: boolean;
      openai: boolean;
      gemini: boolean;
    };
  };
}

const startTime = Date.now();

router.get('/', async (_req: Request, res: Response) => {
  const wpClient = new WordPressClient();
  
  const checks = {
    wordpress: false,
    redis: false,
    ai_providers: {
      lovable: !!config.LOVABLE_API_KEY,
      openai: !!config.OPENAI_API_KEY,
      gemini: !!config.GEMINI_API_KEY,
    },
  };

  // Check WordPress connection
  try {
    await wpClient.healthCheck();
    checks.wordpress = true;
  } catch {
    checks.wordpress = false;
  }

  // Check Redis (if configured)
  if (config.REDIS_URL) {
    try {
      // Simple ping check would go here
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
  } else {
    checks.redis = true; // Not required if not configured
  }

  const allHealthy = checks.wordpress && checks.redis;
  const hasAnyProvider = checks.ai_providers.lovable || checks.ai_providers.openai || checks.ai_providers.gemini;

  const omniconnectBridgeConfigured = Boolean(
    process.env.OMNICONNECT_API_URL?.trim() &&
      process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID?.trim() &&
      process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET?.trim(),
  );

  const status: HealthStatus = {
    status: allHealthy && hasAnyProvider ? 'healthy' : allHealthy ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    omniconnectBridge: {
      configured: omniconnectBridgeConfigured,
    },
    checks,
  };

  res.status(status.status === 'unhealthy' ? 503 : 200).json(status);
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const wpClient = new WordPressClient();
  
  try {
    await wpClient.healthCheck();
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', error: 'WordPress connection failed' });
  }
});

export { router as healthRoutes };
