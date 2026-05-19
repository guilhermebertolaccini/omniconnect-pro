/**
 * Contrato do webhook HMAC `POST /webhooks/botify` (omniconnect-backend).
 * Usar apenas `import type` em bundles de browser — não inclui runtime.
 *
 * @see docs/operations/botify-omniconnect-bridge.md
 */

export type BotifyHandoffEventType = 'botify.handoff.created';

/** Alinhado ao objeto sanitizado em `BridgeEventDispatcherService.botifyLeadSummaryFromData`. */
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

export interface BotifyHandoffWebhookData {
  phone: string;
  name?: string;
  message?: string;
  segment?: number;
  leadSummary?: BotifyLeadSummary;
}

/** Corpo JSON após verificação HMAC (espelho do envelope bridge). */
export interface BotifyHandoffWebhookPayload {
  eventType: BotifyHandoffEventType;
  externalId: string;
  occurredAt: string;
  source?: string;
  data: BotifyHandoffWebhookData;
}
