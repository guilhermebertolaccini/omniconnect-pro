/**
 * Resolve bot/flow for inbound webhooks via omniconnect-backend internal API.
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface WebhookBotRouting {
  botId: string;
  flowId: string | null;
}

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

function internalHeaders(): Record<string, string> | null {
  const secret = config.BOTIFY_INTERNAL_SYNC_SECRET?.trim();
  const tenantId = config.OMNICONNECT_BOTIFY_TENANT_ID?.trim();
  if (!secret || !tenantId) return null;
  return {
    Authorization: `Bearer ${secret}`,
    'X-Omni-Tenant-Id': tenantId,
  };
}

function baseUrl(): string | null {
  const base = config.OMNICONNECT_BACKEND_URL?.trim();
  return base ? trimSlash(base) : null;
}

function defaultRouting(): WebhookBotRouting | null {
  const botId = config.BOTIFY_DEFAULT_BOT_ID?.trim();
  const flowId = config.BOTIFY_DEFAULT_FLOW_ID?.trim();
  if (!botId) return null;
  return { botId, flowId: flowId || null };
}

async function internalGet(path: string): Promise<WebhookBotRouting | null> {
  const base = baseUrl();
  const headers = internalHeaders();
  if (!base || !headers) return null;

  try {
    const res = await fetch(`${base}${path}`, { headers });
    if (!res.ok) {
      logger.debug(`[omniconnect] routing ${path} HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { botId?: string; flowId?: string | null };
    if (typeof json.botId !== 'string' || !json.botId.trim()) return null;
    return {
      botId: json.botId,
      flowId: typeof json.flowId === 'string' && json.flowId.trim() ? json.flowId : null,
    };
  } catch (e) {
    logger.error('[omniconnect] routing fetch failed:', e);
    return null;
  }
}

export async function omniResolveMetaAccount(
  accountId: string,
): Promise<WebhookBotRouting | null> {
  const routed = await internalGet(
    `/botify/internal/routing/meta/${encodeURIComponent(accountId)}`,
  );
  return routed ?? defaultRouting();
}

export async function omniResolveEvolutionInstance(
  instance: string,
  apiKey?: string,
): Promise<WebhookBotRouting | null> {
  const q = apiKey?.trim() ? `?apiKey=${encodeURIComponent(apiKey.trim())}` : '';
  const routed = await internalGet(
    `/botify/internal/routing/evolution/${encodeURIComponent(instance)}${q}`,
  );
  return routed ?? defaultRouting();
}
