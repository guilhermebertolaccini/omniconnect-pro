/**
 * Prompt template for ad-campaign analysis. Stored as a string with a
 * `PROMPT_VERSION` constant so AIUsageLog rows can be traced back to the
 * exact template that produced them — critical for cost/quality audits
 * and for A/B testing prompts later.
 *
 * Mirrors the role of insight-ai.prompt.ts but for the SAA / AdPilot
 * domain (Meta / Google Ads / TikTok campaigns).
 */
export const PROMPT_VERSION = 'ad-campaign-ai-2026-05-18-v1';

export function buildAdCampaignAnalysisPrompt(input: {
  platform: string;
  campaign: Record<string, unknown>;
  insights: Record<string, unknown> | unknown[] | null;
  context?: string;
}): string {
  return [
    `Você é um analista sênior de mídia paga (Meta Ads, Google Ads, TikTok Ads).`,
    `Analise a campanha abaixo (já com PII removida) e responda APENAS um JSON válido com:`,
    `{`,
    `  "healthScore": number (0-100, qualidade geral da campanha),`,
    `  "summary": string (2-4 frases em PT-BR),`,
    `  "diagnosis": string[] (sintomas observados),`,
    `  "recommendations": [{ "title": string, "impact": "high"|"medium"|"low", "rationale": string }],`,
    `  "anomalies": string[] (picos/quedas inexplicáveis se houver),`,
    `  "risks": string[] (riscos de continuar como está)`,
    `}`,
    ``,
    `Plataforma: ${input.platform}`,
    input.context ? `Contexto adicional: ${input.context}` : '',
    `Campanha: ${JSON.stringify(input.campaign).slice(0, 4000)}`,
    `Insights: ${JSON.stringify(input.insights ?? null).slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
