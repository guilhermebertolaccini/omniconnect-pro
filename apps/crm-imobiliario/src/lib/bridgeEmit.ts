/**
 * Emissor seguro do bridge: chama `POST /integrations/bridge/events` com JWT.
 * O segredo HMAC do webhook não vai para o browser — o backend valida a
 * `IntegrationConnection` do tenant e enfileira o `IntegrationEvent`.
 *
 * Configure `VITE_OMNICONNECT_BRIDGE_CONNECTION_ID` com o id da conexão
 * `IntegrationConnection` do provider `crm` (criada no backend/seed).
 */
import type { Client } from "@/types/property";
import type { Lead } from "@/types/crm";
import { request } from "@/lib/omniconnectClient";
import { postBridgeEvent } from "@omniconnect/api-client";

const CONNECTION_ID = import.meta.env.VITE_OMNICONNECT_BRIDGE_CONNECTION_ID?.trim();

function bridgeExternalId(leadId: string): string {
  return `crm-imobiliario:lead:${leadId}`;
}

function leadToBridgeData(lead: Lead, client?: Client): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: lead.clientName || client?.name || "Lead",
    source: typeof lead.source === "string" ? lead.source : String(lead.source ?? "other"),
    stage: lead.stage,
  };
  if (client?.email) data.email = client.email;
  if (client?.phone) data.phone = client.phone;
  if (lead.propertyInterest) data.propertyInterest = lead.propertyInterest;
  if (lead.estimatedValue != null) data.estimatedValue = lead.estimatedValue;
  return data;
}

export async function tryEmitCrmBridgeLeadCreated(
  lead: Lead,
  client?: Client,
): Promise<void> {
  if (!CONNECTION_ID) return;
  const externalId = bridgeExternalId(lead.id);
  await postBridgeEvent(request, {
    connectionId: CONNECTION_ID,
    provider: "crm",
    eventType: "crm.lead.created",
    externalId,
    source: "crm-imobiliario",
    data: leadToBridgeData(lead, client),
    idempotencyKey: `emit:crm:${lead.id}:created`,
  });
}

export async function tryEmitCrmBridgeLeadUpdated(lead: Lead): Promise<void> {
  if (!CONNECTION_ID) return;
  const externalId = bridgeExternalId(lead.id);
  await postBridgeEvent(request, {
    connectionId: CONNECTION_ID,
    provider: "crm",
    eventType: "crm.lead.updated",
    externalId,
    source: "crm-imobiliario",
    data: {
      source: typeof lead.source === "string" ? lead.source : String(lead.source ?? "other"),
      stage: lead.stage,
      ...(lead.propertyInterest != null && lead.propertyInterest !== ""
        ? { propertyInterest: lead.propertyInterest }
        : {}),
      ...(lead.estimatedValue != null ? { estimatedValue: lead.estimatedValue } : {}),
    },
    idempotencyKey: `emit:crm:${lead.id}:updated:${lead.updatedAt}`,
  });
}
