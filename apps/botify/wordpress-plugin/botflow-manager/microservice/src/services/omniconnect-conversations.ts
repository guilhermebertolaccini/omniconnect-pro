/**
 * Cliente HTTP para conversas/mensagens Botify no omniconnect-backend (internal API).
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

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
    'Content-Type': 'application/json',
  };
}

function baseUrl(): string | null {
  const base = config.OMNICONNECT_BACKEND_URL?.trim();
  return base ? trimSlash(base) : null;
}

async function internalFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const base = baseUrl();
  const headers = internalHeaders();
  if (!base || !headers) {
    logger.warn('[omniconnect] Conversations: missing internal API configuration');
    return null;
  }
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
    });
  } catch (e) {
    logger.error('[omniconnect] Conversations fetch failed:', e);
    return null;
  }
}

export async function omniResolveConversation(
  botId: string,
  contactPhone: string,
  contactName?: string,
): Promise<string | null> {
  const res = await internalFetch('/botify/internal/conversations/resolve', {
    method: 'POST',
    body: JSON.stringify({
      botId,
      contactPhone,
      ...(contactName ? { contactName } : {}),
    }),
  });
  if (!res) return null;
  if (!res.ok) {
    logger.error(`[omniconnect] resolve conversation HTTP ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { id?: string };
  return typeof json.id === 'string' ? json.id : null;
}

export async function omniSaveMessage(data: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const res = await internalFetch(
    `/botify/internal/conversations/${encodeURIComponent(data.conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        role: data.role,
        content: data.content,
        ...(data.metadata ? { metadata: data.metadata } : {}),
      }),
    },
  );
  if (!res?.ok) {
    logger.error(`[omniconnect] save message HTTP ${res?.status ?? 'no-response'}`);
  }
}

export async function omniListConversationMessages(
  conversationId: string,
  limit = 40,
): Promise<
  Array<{
    direction: string;
    content: string;
    mediaUrl?: string | null;
  }>
> {
  const res = await internalFetch(
    `/botify/internal/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
    { method: 'GET' },
  );
  if (!res?.ok) {
    logger.error(`[omniconnect] list messages HTTP ${res?.status ?? 'no-response'}`);
    return [];
  }
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) return [];
  return rows.map((m: Record<string, unknown>) => ({
    direction: typeof m.direction === 'string' ? m.direction : '',
    content: typeof m.content === 'string' ? m.content : '',
    mediaUrl: null,
  }));
}

export async function omniSendWhatsAppMessage(data: {
  conversationId: string;
  message: string;
}): Promise<boolean> {
  const res = await internalFetch(
    `/botify/internal/conversations/${encodeURIComponent(data.conversationId)}/send`,
    {
      method: 'POST',
      body: JSON.stringify({ content: data.message }),
    },
  );
  if (!res) return false;
  const json = (await res.json()) as { success?: boolean };
  return json.success === true;
}
