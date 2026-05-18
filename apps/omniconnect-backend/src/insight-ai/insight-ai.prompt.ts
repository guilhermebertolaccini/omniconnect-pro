import { NormalizedMessage } from '@omniconnect/ai-contracts';

export const PROMPT_VERSION = 'insight-ai-conversation-analysis-v1';

export function buildConversationAnalysisPrompt(messages: NormalizedMessage[]) {
  const transcript = messages
    .map((m) => `[${new Date(m.datetime).toISOString()}] ${m.sender === 'contact' ? 'LEAD' : 'CORRETOR/ATENDENTE'}: ${m.text}`)
    .join('\n');

  return `Você é uma camada de Text Analytics Comercial para operações imobiliárias.
Analise a conversa abaixo e retorne APENAS JSON válido, sem markdown, sem comentários e sem texto fora do JSON.

Objetivo da análise:
- Identificar intenção do lead.
- Identificar objeções.
- Avaliar condução do corretor/atendente.
- Detectar abandono, oportunidade perdida e próximo melhor passo.
- Gerar métricas mesmo quando o CRM não foi corretamente tabulado.

Regras:
- sellerQualityScore, responseQualityScore, qualificationScore e followUpScore devem ser números de 0 a 100.
- firstResponseMinutes deve ser número ou null.
- leadIntent deve ser um destes: curioso, frio, pesquisa, qualificado, quente, pronto_para_visita, pronto_para_proposta, indefinido.
- opportunityStatus deve ser um destes: ativa, em_risco, perdida, pronta_para_retomada, sem_oportunidade_clara.
- risk deve ser um destes: baixo, medio, alto, critico.
- evidence deve trazer no máximo 5 evidências curtas, sem copiar dados sensíveis desnecessários.

JSON esperado:
{
  "summary": "resumo executivo da conversa",
  "leadIntent": "qualificado",
  "opportunityStatus": "em_risco",
  "risk": "alto",
  "mainObjection": "financiamento",
  "objections": ["financiamento", "preço"],
  "sellerQualityScore": 0,
  "responseQualityScore": 0,
  "qualificationScore": 0,
  "followUpScore": 0,
  "firstResponseMinutes": null,
  "hasSellerAbandonment": false,
  "hasLeadAbandonment": false,
  "hasQualification": false,
  "hasSchedulingAttempt": false,
  "hasProposalOrSimulationAttempt": false,
  "lostOpportunity": false,
  "nextBestAction": "ação recomendada",
  "evidence": ["evidência 1"],
  "metrics": {"observations": []}
}

Conversa:
${transcript}`;
}
