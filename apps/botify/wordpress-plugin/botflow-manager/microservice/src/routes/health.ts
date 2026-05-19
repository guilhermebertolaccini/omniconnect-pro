import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { WordPressClient } from '../services/wordpress-client.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  omniconnectBridge: {
    configured: boolean;
  };
  botifyFlow: {
    flowSource: 'wordpress' | 'omniconnect' | 'dual';
    omniconnectRuntimeConfigured: boolean;
  };
  checks: {
    wordpress: boolean | 'skipped';
    redis: boolean;
    meta_webhook: boolean;
    ai_providers: {
      lovable: boolean;
      openai: boolean;
      gemini: boolean;
    };
  };
}

const startTime = Date.now();

function wordpressRequired(): boolean {
  return config.BOTIFY_FLOW_SOURCE === 'wordpress' || config.BOTIFY_FLOW_SOURCE === 'dual';
}

async function checkWordpress(): Promise<boolean | 'skipped'> {
  if (!wordpressRequired()) {
    return 'skipped';
  }
  const wpClient = new WordPressClient();
  if (!wpClient.isConfigured()) {
    return false;
  }
  try {
    return await wpClient.healthCheck();
  } catch {
    return false;
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = {
    wordpress: await checkWordpress(),
    redis: false,
    meta_webhook: Boolean(
      config.META_APP_SECRET?.trim() && config.META_WEBHOOK_VERIFY_TOKEN?.trim(),
    ),
    ai_providers: {
      lovable: !!config.LOVABLE_API_KEY,
      openai: !!config.OPENAI_API_KEY,
      gemini: !!config.GEMINI_API_KEY,
    },
  };

  if (config.REDIS_URL) {
    checks.redis = true;
  } else {
    checks.redis = true;
  }

  const omniconnectRuntimeConfigured = Boolean(
    config.OMNICONNECT_BACKEND_URL?.trim() &&
      config.BOTIFY_INTERNAL_SYNC_SECRET?.trim() &&
      config.OMNICONNECT_BOTIFY_TENANT_ID?.trim(),
  );

  const wpOk = checks.wordpress === true || checks.wordpress === 'skipped';
  const hasAnyProvider =
    checks.ai_providers.lovable ||
    checks.ai_providers.openai ||
    checks.ai_providers.gemini;

  const omniconnectBridgeConfigured = Boolean(
    process.env.OMNICONNECT_API_URL?.trim() &&
      process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID?.trim() &&
      process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET?.trim(),
  );

  let status: HealthStatus['status'] = 'healthy';
  if (!wpOk) {
    status = 'unhealthy';
  } else if (!hasAnyProvider) {
    status = 'degraded';
  }

  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    omniconnectBridge: { configured: omniconnectBridgeConfigured },
    botifyFlow: {
      flowSource: config.BOTIFY_FLOW_SOURCE,
      omniconnectRuntimeConfigured,
    },
    checks,
  };

  res.status(status === 'unhealthy' ? 503 : 200).json(health);
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/ready', async (_req: Request, res: Response) => {
  if (config.BOTIFY_FLOW_SOURCE === 'omniconnect') {
    const ok = Boolean(
      config.OMNICONNECT_BACKEND_URL?.trim() &&
        config.BOTIFY_INTERNAL_SYNC_SECRET?.trim() &&
        config.OMNICONNECT_BOTIFY_TENANT_ID?.trim(),
    );
    if (ok) {
      return res.status(200).json({ status: 'ready' });
    }
    return res.status(503).json({ status: 'not ready', error: 'Omni internal API not configured' });
  }

  const wpClient = new WordPressClient();
  if (!wpClient.isConfigured()) {
    return res.status(503).json({ status: 'not ready', error: 'WordPress not configured' });
  }

  try {
    const ok = await wpClient.healthCheck();
    if (ok) {
      return res.status(200).json({ status: 'ready' });
    }
    return res.status(503).json({ status: 'not ready', error: 'WordPress connection failed' });
  } catch {
    return res.status(503).json({ status: 'not ready', error: 'WordPress connection failed' });
  }
});

export { router as healthRoutes };
