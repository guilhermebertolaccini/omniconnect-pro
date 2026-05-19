import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Structured triage for Omni (`data.leadSummary`). Strings are truncated server-side by omniconnect-backend.
 * Optional `intent` can later align with `LeadIntent` in `@omniconnect-pro/ai-contracts`.
 */
export interface BotifyLeadSummary {
  intent?: string;
  urgency?: string;
  budget?: string;
  region?: string;
  propertyInterest?: string;
  notes?: string;
  flowId?: string;
  flowName?: string;
  lastUserMessage?: string;
  lastAssistantReply?: string;
  collectedFields?: Record<string, string>;
}

export interface OmniconnectHandoffPayload {
  /** Jid or digits-only phone — normalized for `data.phone` */
  phone: string;
  name?: string;
  message?: string;
  segment?: number;
  /** Optional; merged into `data.leadSummary` when non-empty */
  leadSummary?: BotifyLeadSummary;
  /**
   * Stable id for dedupe (`IntegrationEntityLink` + idempotency-key).
   * Format: `botify:flow:{flowId}:conv:{conversationId}:transfer`
   */
  externalId: string;
}

function pruneLeadSummary(
  s: BotifyLeadSummary | undefined,
): Record<string, unknown> | undefined {
  if (!s) return undefined;
  const out: Record<string, unknown> = {};
  const copy = (k: keyof BotifyLeadSummary, max: number) => {
    const v = s[k];
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t) return;
    out[k] = t.slice(0, max);
  };
  copy('intent', 80);
  copy('urgency', 32);
  copy('budget', 120);
  copy('region', 120);
  copy('propertyInterest', 255);
  copy('notes', 500);
  copy('flowId', 120);
  copy('flowName', 120);
  copy('lastUserMessage', 600);
  copy('lastAssistantReply', 600);
  if (s.collectedFields && typeof s.collectedFields === 'object') {
    const collected: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of Object.entries(s.collectedFields)) {
      if (n >= 15) break;
      if (typeof v !== 'string') continue;
      const t = v.trim().slice(0, 200);
      if (t) collected[k.slice(0, 60)] = t;
      n++;
    }
    if (Object.keys(collected).length) out.collectedFields = collected;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Posts a signed `botify.handoff.created` to omniconnect-backend `/webhooks/botify`.
 * Runs server-side only; configure plaintext webhook secret (same value stored
 * encrypted in `IntegrationConnection` on Omni side).
 */
export async function emitBotifyHandoffToOmniconnect(
  params: OmniconnectHandoffPayload,
): Promise<void> {
  const baseUrl = process.env.OMNICONNECT_API_URL?.replace(/\/$/, '');
  const connectionId = process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID?.trim();
  const secret = process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET;

  if (!baseUrl || !connectionId || !secret) {
    logger.warn(
      '[omniconnect] Bridge not configured (OMNICONNECT_API_URL / OMNICONNECT_BOT_BRIDGE_*); skip handoff',
    );
    return;
  }

  const digits = params.phone.replace(/\D/g, '');
  const phone = digits.length >= 10 ? `+${digits}` : params.phone;

  const occurredAt = new Date().toISOString();
  const leadSummary = pruneLeadSummary(params.leadSummary);
  const payload = {
    eventType: 'botify.handoff.created' as const,
    externalId: params.externalId,
    occurredAt,
    source: 'botify-microservice',
    data: {
      phone,
      ...(params.name ? { name: params.name } : {}),
      ...(params.message ? { message: params.message } : {}),
      ...(params.segment != null ? { segment: params.segment } : {}),
      ...(leadSummary ? { leadSummary } : {}),
    },
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const idempotencyKey = `botify:handoff:${params.externalId}`;

  const res = await fetch(`${baseUrl}/webhooks/botify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signature,
      'x-integration-id': connectionId,
      'idempotency-key': idempotencyKey,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(
      `[omniconnect] Handoff webhook failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
}
