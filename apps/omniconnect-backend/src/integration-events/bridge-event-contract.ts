import { BadRequestException } from '@nestjs/common';
import type { IntegrationProvider } from './integration-events.service';

export interface BridgeEventPayload {
  eventType: string;
  externalId: string;
  occurredAt: string;
  source?: string;
  data: Record<string, unknown>;
}

export interface LoadedIntegrationEvent {
  id: string;
  tenantId: string;
  provider: IntegrationProvider;
  status: string;
  payload: unknown;
}

const SUPPORTED_EVENT_TYPES: Record<IntegrationProvider, Set<string>> = {
  crm: new Set(['crm.lead.created', 'crm.lead.updated']),
  ads: new Set(['ads.lead.created']),
  bot: new Set(['botify.handoff.created']),
};

export function parseBridgeEventPayload(
  provider: IntegrationProvider,
  payload: unknown,
): BridgeEventPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('Bridge payload must be a JSON object');
  }
  const raw = payload as Record<string, unknown>;
  const eventType = stringField(raw, 'eventType', 120);
  if (!SUPPORTED_EVENT_TYPES[provider].has(eventType)) {
    throw new BadRequestException(
      `Unsupported ${provider} bridge eventType "${eventType}"`,
    );
  }
  const externalId = stringField(raw, 'externalId', 255);
  const occurredAt = stringField(raw, 'occurredAt', 64);
  const occurredAtDate = new Date(occurredAt);
  if (Number.isNaN(occurredAtDate.getTime())) {
    throw new BadRequestException('occurredAt must be an ISO date string');
  }
  const data = raw.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BadRequestException('data must be a JSON object');
  }
  const source =
    raw.source === undefined || raw.source === null
      ? undefined
      : stringField(raw, 'source', 120);
  return {
    eventType,
    externalId,
    occurredAt: occurredAtDate.toISOString(),
    source,
    data: data as Record<string, unknown>,
  };
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${key} must be a non-empty string`);
  }
  return value.trim().slice(0, maxLength);
}
