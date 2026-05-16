# AI Governance — InsightAI

## Purpose

InsightAI analisa conversas comerciais e gera inteligência operacional. **Não substitui** decisão humana.

Outputs são sempre tratados como **recomendação inferida**, nunca verdade absoluta.

## AI outputs

InsightAI pode produzir:

- `leadIntent` — intenção do lead (frio, qualificado, quente, pronto_para_visita, …)
- `leadStage` — estágio inferido no funil
- `mainObjection` — objeção principal detectada
- `objections` — lista de objeções (preço, financiamento, localização, etc.)
- `sellerQualityScore` — score 0..100 da condução do atendente
- `responseQualityScore` — score 0..100 da qualidade das respostas
- `qualificationScore` — quanto o lead foi qualificado
- `followUpScore` — quanto há de follow-up adequado
- `firstResponseMinutes` — tempo até primeira resposta humana
- `hasSellerAbandonment` / `hasLeadAbandonment` — sinais de abandono
- `lostOpportunityDetected` — flag composto
- `nextBestAction` — recomendação de próximo passo
- `conversationSummary` — resumo executivo
- `confidence` — confiança do modelo (0..1)

## Required metadata

Toda análise persistida **deve** incluir:

```typescript
{
  tenantId: string;
  conversationId: string;
  leadId?: string;
  modelProvider: 'openai' | 'anthropic' | 'heuristic';
  modelName: string;             // 'gpt-4o-mini'
  promptVersion: string;         // 'insight-ai-conversation-analysis-v3'
  outputSchemaVersion: string;   // 'v1'
  inputMessageCount: number;
  inputDateRange: { from: Date; to: Date };
  output: ConversationAIResult;
  confidence?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;        // BRL
  createdAt: Date;
}
```

## Prompt versioning

Prompts são **versionados** em arquivos separados:

```
apps/omniconnect-backend/src/insight-ai/prompts/
├── conversation-analysis-v1.ts
├── conversation-analysis-v2.ts
└── conversation-analysis-v3.ts   ← current
```

Mudou prompt? **Cria nova versão**. Não sobrescreve a antiga. Mantém ambas disponíveis para A/B e replay histórico.

Versão é persistida em cada análise → permite saber qual prompt gerou qual resultado.

## Output validation

LLM **deve** retornar JSON. Antes de persistir:

1. Parse JSON (`JSON.parse`)
2. Valida schema (`Zod`)
3. Checa campos obrigatórios
4. Normaliza enums (lower case, fallback para `'indefinido'`)
5. Clamp de números (0..100)
6. Se inválido → fallback heurístico + log

```typescript
const validated = ConversationAIResultSchema.parse(JSON.parse(rawOutput));
```

**Nunca** salvar output não validado.

## Human in the loop

❌ IA muda CRM stage automaticamente.
✅ IA **sugere** mudança via campo `aiSuggestedStage`.
✅ Humano aprova (ou rejeita).
✅ Workflow explícito com auto-apply + auditoria + reversibilidade pode ser habilitado por config.

## Privacy / LGPD

Antes de enviar transcript ao LLM:

1. **Redação** de PII (CPF, RG, telefone, e-mail, valores financeiros sensíveis)
2. **Consentimento** do tenant (`tenant.aiConsent === true`)
3. **DPA** com provedor (OpenAI: configurar flag `no-training`)
4. Documentar em política de privacidade

```typescript
const safe = redactPII(rawMessages);
const result = await provider.analyze(buildPrompt(safe));
```

Mandar apenas o **mínimo necessário**:
- ✅ Texto da conversa (com PII redigida)
- ✅ Timestamps (para inferir abandono, tempo de resposta)
- ✅ Sender (operator/contact) — sem nome real
- ❌ Documentos pessoais não relacionados
- ❌ Histórico de outras conversas do contato sem necessidade

## Cost control

Tracking **por análise**:
- `promptTokens`, `completionTokens`
- `estimatedCost` (calculado pela tabela do modelo)

Tabela de preços em config:
```typescript
export const AI_PRICING = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },  // USD per 1k tokens
  'gpt-4o':      { input: 0.005,   output: 0.015 },
};
```

Endpoint `/billing-usage/ai?tenantId&from&to` agrega por tenant.

**Estratégias de redução de custo:**
- Cache: se conversa não mudou em 24h, retorna análise anterior
- Modelo barato (`gpt-4o-mini`) para triagem; modelo bom (`gpt-4o`) sob demanda explícita
- Throttle por tenant (10 análises/min default)
- Análises em lote (`analyzeManyPending`) com limite de N/dia

## Fallback

Provider falhou (timeout, 429, 500) →

1. Retry com backoff (Bull, 3 tentativas, delay exponencial)
2. Após N falhas: análise **heurística** local (regex + heurísticas conhecidas)
3. Job marcado como `degraded`
4. Análise persistida com `modelProvider: 'heuristic'` (rastreável)
5. Exposto no admin (badge "análise degradada")

**Nunca** quebrar a UX por falha de IA.

## Output JSON example

```json
{
  "summary": "Lead interessado em apartamento de 2 dormitórios, preocupado com valor da parcela.",
  "leadIntent": "qualificado",
  "opportunityStatus": "ativa",
  "risk": "baixo",
  "mainObjection": "financiamento",
  "objections": ["financiamento", "preco"],
  "sellerQualityScore": 78,
  "responseQualityScore": 82,
  "qualificationScore": 70,
  "followUpScore": 65,
  "firstResponseMinutes": 8,
  "hasSellerAbandonment": false,
  "hasLeadAbandonment": false,
  "hasQualification": true,
  "hasSchedulingAttempt": false,
  "hasProposalOrSimulationAttempt": true,
  "lostOpportunity": false,
  "nextBestAction": "Oferecer simulação de financiamento + agendar visita ao decorado.",
  "evidence": [
    "Lead pediu detalhe de financiamento em 3 mensagens.",
    "Corretor respondeu em 8 min e ofereceu simulação."
  ],
  "metrics": {
    "contactMessages": 12,
    "operatorMessages": 9,
    "intentScore": 75
  }
}
```

## Operational dashboard

Métricas agregadas que vão pro dashboard CEO/CFO:

- Total de conversas analisadas (período)
- Distribuição de `leadIntent`
- Distribuição de `opportunityStatus`
- Top 10 objeções
- Score médio de vendedor (por equipe / individual)
- Oportunidades perdidas (count + lista para recovery)
- Custo IA total (R$, USD, tokens)
- Análises degradadas (provider falhou)

## See also

- `.cursor/rules/30-ai-governance.mdc`
- `migration/04-insight-ai-patch-analysis.md`
- skill `insight-ai`
