import { supabase } from '@/integrations/supabase/client';
import type { Campaign, AIAnalysis } from '@/types/campaign';

export interface BusinessContext {
  segment: string;
  goal: string;
  sales_process: string;
  average_ticket?: number;
  target_cpl?: number;
  target_mql_rate?: number;
  target_sql_rate?: number;
  target_close_rate?: number;
}

export function inferBusinessContext(campaign: Campaign): BusinessContext {
  const haystack = `${campaign.accountName ?? ''} ${campaign.name ?? ''}`.toLowerCase();

  if (/imobili|im[oó]vei|apartament|lan[cç]amento|zona sul/.test(haystack)) {
    return {
      segment: 'imobiliario',
      goal: 'gerar leads qualificados para venda de imóveis',
      sales_process:
        'Meta Ads -> WhatsApp -> qualificação -> visita -> proposta -> venda',
      target_cpl: 80,
      target_mql_rate: 0.35,
      target_sql_rate: 0.3,
      target_close_rate: 0.08,
    };
  }

  if (/cl[ií]nica|est[eé]tica|botox|harmoniza/.test(haystack)) {
    return {
      segment: 'clinica_estetica',
      goal: 'gerar agendamentos de avaliação para procedimentos estéticos',
      sales_process:
        'Meta Ads -> WhatsApp -> agendamento -> avaliação -> proposta -> procedimento',
      target_cpl: 60,
      target_mql_rate: 0.4,
      target_sql_rate: 0.35,
      target_close_rate: 0.25,
    };
  }

  return {
    segment: 'ecommerce_performance',
    goal: 'maximizar conversões e ROAS em performance',
    sales_process: 'Meta Ads -> Site -> Checkout -> Compra',
    target_close_rate: 0.02,
  };
}

export interface AnalyzeCampaignParams {
  companyId: string;
  campaign: Campaign;
  businessContext?: BusinessContext;
  historicalMetrics?: unknown[];
  platform?: 'meta' | 'google_ads' | 'tiktok_ads';
}

export async function analyzeCampaignWithAI(
  params: AnalyzeCampaignParams,
): Promise<AIAnalysis> {
  const { companyId, campaign, businessContext, historicalMetrics, platform } = params;

  const { data, error } = await supabase.functions.invoke('ai-campaign-analysis', {
    body: {
      company_id: companyId,
      platform: platform ?? 'meta',
      campaign,
      business_context: businessContext ?? inferBusinessContext(campaign),
      historical_metrics: historicalMetrics ?? [],
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao chamar a análise de IA');
  }
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || 'Resposta inválida da IA');
  }

  return data as AIAnalysis;
}
