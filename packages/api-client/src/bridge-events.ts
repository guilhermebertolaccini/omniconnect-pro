/**
 * Authenticated bridge emitter used by browser apps (CRM Imobiliário, SAA).
 * Backend: POST /integrations/bridge/events (JWT + tenant-scoped IntegrationConnection).
 */

export const INTEGRATIONS_BRIDGE_EVENTS_PATH = '/integrations/bridge/events';

/** Matches backend `IntegrationProvider` / webhook bridge providers. */
export type BridgeIntegrationProvider = 'crm' | 'ads' | 'bot';

/** Body shape aligned with `EmitBridgeEventDto` (omniconnect-backend). */
export interface EmitBridgeEventBody {
  connectionId: string;
  provider: BridgeIntegrationProvider;
  eventType: string;
  externalId: string;
  occurredAt?: string;
  source?: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface EmitBridgeEventResponse {
  eventId: string;
  alreadyProcessed: boolean;
  tenantId: string;
}

export type BridgeJsonPoster<T = EmitBridgeEventResponse> = (
  path: string,
  init: RequestInit,
) => Promise<T>;

/**
 * POST a bridge event using the app's authenticated `fetch` wrapper
 * (e.g. `omniconnectClient.request`).
 */
export function postBridgeEvent<T = EmitBridgeEventResponse>(
  postJson: BridgeJsonPoster<T>,
  body: EmitBridgeEventBody,
): Promise<T> {
  return postJson(INTEGRATIONS_BRIDGE_EVENTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
