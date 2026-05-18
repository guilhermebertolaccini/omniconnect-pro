/**
 * Emissor bridge autenticado para o Smart Ad Automator (`provider: ads`).
 * Usa JWT via `request()` — sem segredo HMAC no browser.
 *
 * `VITE_OMNICONNECT_ADS_BRIDGE_CONNECTION_ID`: UUID da `IntegrationConnection`
 * com `provider = ads` no tenant do usuário.
 */
import { request } from "@/lib/omniconnectClient";
import type { AIAnalysis, Campaign } from "@/types/campaign";
import { postBridgeEvent } from "@omniconnect/api-client";

const CONNECTION_ID = import.meta.env.VITE_OMNICONNECT_ADS_BRIDGE_CONNECTION_ID?.trim();

export async function tryEmitAdsBridgeLeadFromCampaignAnalysis(params: {
  companyId: string;
  campaign: Campaign;
  analysis: AIAnalysis;
}): Promise<void> {
  if (!CONNECTION_ID) return;

  const externalId = `saa:campaign:${params.companyId}:${params.campaign.id}`;
  const name =
    params.analysis.diagnosis?.slice(0, 200) ||
    `Campanha ${params.campaign.name} — sinal de lead (IA)`;

  await postBridgeEvent(request, {
    connectionId: CONNECTION_ID,
    provider: "ads",
    eventType: "ads.lead.created",
    externalId,
    source: "smart-ad-automator",
    data: {
      name,
      source: `${params.campaign.objective} · ${params.campaign.name}`,
      propertyInterest: params.campaign.accountName,
      notes: [
        `score:${params.analysis.overallScore}`,
        params.analysis.predictedImpact,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1800),
    },
    idempotencyKey: `emit:saa:${params.companyId}:${params.campaign.id}:analysis:${params.analysis.generatedAt}`,
  });
}
