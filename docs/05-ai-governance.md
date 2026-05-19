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

## Provider selection (InsightAI)

- **`INSIGHT_AI_DEFAULT_PROVIDER`** — `openai` (default) | `anthropic` | `gemini` | `google`
  (mesmo que Gemini). Valor **desconhecido** → heurística + `warn`.
- **Desligar adapters sem remover env:**
  - `INSIGHT_AI_ANTHROPIC_DISABLED=1`
  - `INSIGHT_AI_GEMINI_DISABLED=1`
- **Chaves e modelos**
  - OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`).
  - Anthropic: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-3-5-haiku-20241022`).
  - Google Gemini: `GEMINI_API_KEY` **ou** `GOOGLE_AI_API_KEY`, `GEMINI_MODEL`
    (default `gemini-2.0-flash`). Em `AIUsageLog` / `ModelPricing`, provider =
    **`google`**.
- Se o provider escolhido estiver desativado, sem chave ou com erro HTTP → **heurística**
  (com `AIUsageLog` `failure` quando a tentativa LLM falha após chamada).

Implementação: `apps/omniconnect-backend/src/insight-ai/providers/`.

## Dashboard API (métricas e custo)

Endpoints somente leitura, escopo estrito ao `tenantId` do JWT:

- `GET /insight-ai/dashboard/summary` — agregados sobre `ConversationAIAnalysis` (amostra máx. 2000 no período).
- `GET /insight-ai/dashboard/usage` — agregados e linhas paginadas em `AIUsageLog` (por `modelProvider`).
- `GET /insight-ai/analyses` — lista paginada de análises do tenant.

UI operações: `omniconnect-frontend` → `/inteligencia`. Contrato detalhado: `docs/06-api-standards.md`.

**Operação:** troca de provedor default via `INSIGHT_AI_DEFAULT_PROVIDER`; envs por provedor em `apps/omniconnect-backend/DEPLOYMENT.md`. Rate limiting dedicado nos endpoints InsightAI é **melhoria futura** (hoje aplicar limite de uso via fila + política de produto).

## Required metadata

Toda análise persistida **deve** incluir:

```typescript
{
  tenantId: string;
  conversationId: string;
  leadId?: string;
  modelProvider: 'openai' | 'anthropic' | 'google' | 'heuristic';
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

1. **Redação** de PII via `redactPII` (Sprint 1.3 expandido)
2. **Consentimento** do tenant (`tenant.aiConsent === true`)
3. **DPA** com provedor (OpenAI: configurar flag `no-training`)
4. Documentar em política de privacidade

```typescript
const safe = redactPII(rawMessages);
const result = await provider.analyze(buildPrompt(safe));
```

`redactPII` substitui, em ordem de prioridade (mais específico primeiro), os padrões:

| Token | Padrão |
|---|---|
| `[EMAIL]` | RFC simplificado |
| `[CNPJ]` | 14 dígitos ou `00.000.000/0000-00` |
| `[CPF]` | 11 dígitos ou `000.000.000-00` |
| `[RG]` | 8 dígitos + dígito ou X |
| `[CEP]` | 8 dígitos ou `00000-000` |
| `[DATE]` | `dd/mm/yy(yy)`, `dd-mm-yy(yy)`, `dd.mm.yy(yy)` |
| `[INCOME]` | `renda \| salário \| ganho mensal \| rendimento` + figura R$ (label preservado, valor mascarado) |
| `[CONTRACT]` | `contrato \| matrícula \| processo \| protocolo \| reserva` + id alfanumérico |
| `[ADDR_NUM]` | `rua/av/avenida/alameda/travessa/praça/estrada <nome>, <num>` (nome da rua preservado, número mascarado) |
| `[PHONE]` | formatos brasileiros (`+55 (11) 99999-8888`, `(11) 99999-1234`, `11 9999-8888`) e fallback bare 10 dígitos |

Trade-off LGPD: sequência de 11 dígitos sem separadores é tratada como `[CPF]`, não `[PHONE]`. O risco LGPD do CPF é maior, então o redactor de CPF roda antes.

Mandar apenas o **mínimo necessário**:
- ✅ Texto da conversa (com PII redigida)
- ✅ Timestamps (para inferir abandono, tempo de resposta)
- ✅ Sender (operator/contact) — sem nome real
- ❌ Documentos pessoais não relacionados
- ❌ Histórico de outras conversas do contato sem necessidade

## Cost control

Tracking **por análise** em `AIUsageLog` (Sprint 1.1):

```prisma
model AIUsageLog {
  id              Int      @id @default(autoincrement())
  tenantId        String   // sempre — scope obrigatório
  conversationId  Int?     // qual conversa originou
  analysisId      Int?     // FK opcional para ConversationAIAnalysis
  operationType   String   // 'conversation_analysis', 'ad_campaign_analysis', 'executive_summary', ...
  modelProvider   String   // 'openai', 'anthropic', 'heuristic'
  modelName       String   // 'gpt-4o-mini'
  promptVersion   String   // 'insight-ai-conversation-analysis-v3'
  promptTokens    Int
  completionTokens Int
  estimatedCost   Decimal
  currency        String   @default("USD")
  status          String   // 'success', 'degraded', 'failed'
  errorCode       String?
  errorMessage    String?
  createdAt       DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([tenantId, operationType])
  @@index([tenantId, status])
}
```

Cada chamada bem-sucedida grava status `success` com tokens e custo; falhas (rate limit, parse error, schema invalid) gravam `failed` ou `degraded` com `errorCode` para análise de qualidade do provedor.

Tabela de preços versionada em `ModelPricing` (Sprint 1.2.4):

```prisma
model ModelPricing {
  id              Int       @id @default(autoincrement())
  modelProvider   String
  modelName       String
  inputPer1k      Float
  outputPer1k     Float
  currency        String    @default("USD")
  effectiveFrom   DateTime  @default(now())
  effectiveUntil  DateTime?
  notes           String?

  @@index([modelProvider, modelName, effectiveFrom])
}
```

`ModelPricingService.estimateCost(provider, model, promptTokens, completionTokens)` consulta a tabela com janela `effectiveFrom <= now AND (effectiveUntil IS NULL OR effectiveUntil > now)`, cache TTL 5min em memória, fallback resiliente para a baseline antiga (`gpt-4o`, `gpt-4o-mini`) caso a tabela esteja vazia / queue de DB falhe. Resultado anotado com `source: 'database' | 'fallback'` para auditoria.

Endpoint `/billing-usage/ai?tenantId&from&to` agrega por tenant.

### Ad campaign analysis (Sprint 2.3)

O módulo `ad-campaigns-ai` reutiliza esta governance integralmente:

- `operationType = 'ad_campaign_analysis'`
- `promptVersion = 'ad-campaign-analysis-v1'`
- `redactPII` recursivo (`redactDeep`) é aplicado ao `campaign`+`insights` antes do `JSON.stringify` que vai para o LLM. CPF, e-mail, telefone, RG, CNPJ nunca chegam ao provedor mesmo se a API da Meta/Google/TikTok devolver no payload.
- Cost via `ModelPricingService.estimateCost` na mesma janela versionada.
- Mode async usa Bull com `jobId` determinístico `aca:sha256(tenantId|advertiserCompanyId|platform|campaignId|campaignName|hourBucket)` para dedup sem vazar PII no id.
- Job processor valida `tenantId` do payload contra o do request original via `ensureJobTenant` (Sprint 1.2.6).

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

## Async via Bull (Sprint 1.1, refinada na Sprint 1.3)

O `InsightAiModule` registra a fila `insight-ai` no Bull v4 e o processor `AnalyzeConversationProcessor` consome jobs `analyze-conversation`.

```
POST /insight-ai/analyze/:phone           → enqueue job  (default async)
POST /insight-ai/analyze/:phone?sync=true → run inline   (debugging / smoke test)
GET  /insight-ai/jobs/:jobId              → status do job + resultado quando pronto
```

Job payload **obrigatoriamente** carrega `tenantId`:

```typescript
const jobId = service.buildAnalyzeJobId(tenantId, contactPhone, dto);
await queue.add('analyze-conversation', { tenantId, contactPhone, dto }, { jobId });
```

### `jobId` determinístico (Sprint 1.3)

```ts
jobId = `iai:${sha256(tenantId|phone|days|limit|segment|userId|hourBucket)}`
```

Por que hash + hour bucket:
- **Dedup real**: Bull respeita `jobId` único. Retries dentro da mesma janela horária colapsam em um único job, em vez de empilhar duplicatas.
- **Privacidade**: o número de telefone nunca é escrito em texto claro no Redis, BullBoard ou logs de fila.
- **Recovery**: a janela rola a cada hora — uma reanálise legítima na próxima hora gera id novo e roda normalmente.

### `getJobStatus` estrito (Sprint 1.3)

Worker e endpoint chamam `ensureJobTenant(job.data)` antes de qualquer write — o sentinel `default-tenant` é rejeitado em produção. O `GET /insight-ai/jobs/:id` retorna **404** (não 403) em três situações:

1. Job não existe.
2. Job existe mas o payload **não contém** `tenantId` (legacy / malformado — defesa em profundidade).
3. Job existe mas pertence a outro tenant — não vazamos sequer a existência cross-tenant.

A escolha por jobs (em vez de chamada síncrona dentro da request HTTP) protege contra:

- Timeouts longos do LLM (gpt-4o pode demorar 10–60s).
- Rate limits do provedor (retry transparente pelo Bull).
- DoS acidental: agendamentos em massa não derrubam a API.

## Tenant isolation no InsightAI

- Toda chamada de `InsightAiService` exige `tenantId` explícito (vem de `ensureTenant(user)` no controller).
- Listagens (`/insight-ai/results`, `/insight-ai/summary`) filtram `ConversationAIAnalysis.tenantId`.
- `AIUsageLog` é escopado por tenant para billing/relatório de consumo por cliente.
- PII redaction é aplicada **antes** de montar o prompt; CPF, RG, telefone e e-mail nunca chegam ao provedor.

## Botify handoff ↔ InsightAI (Sprint 6 Fase F)

**Fonte de verdade para o prompt:** mensagens **persistidas no Omniconnect** (modelo `Message` / conversa operacional) para o **mesmo telefone** (`E.164`) e **mesmo `tenantId`** resolvido na ponte (connection / HMAC), nunca o transcript bruto armazenado no WordPress/Botify.

- **F1 — Momento da análise:** o produto assume que a análise comercial útil acompanha a conversa **humana** no Omni após o handoff. O evento `botify.handoff.created` materializa fila/triagem; o InsightAI correlaciona pelo telefone já unificado no core.  
  **Opcional:** `INSIGHT_AI_ON_BOTIFY_HANDOFF=true` enfileira `analyze-conversation` logo após criar um `MessageQueue` **novo** (idempotência do handoff inalterada). A primeira execução pode ver poucas mensagens até o atendente atuar; o `jobId` com bucket horário permite nova fila depois.

- **F2 — PII e domínio cruzado:** não concatenar ao prompt um export completo do histórico Botify “só para enriquecer”. O objeto `leadSummary` no bridge é **resumo sanitizado** para operação (intent, último turno, campos coletados com teto de tamanho) — não substitui o transcript no LLM. Qualquer outro texto de sistemas externos que venha a entrar em prompts (ex.: notas sync de CRM) deve passar pelo mesmo **`redactPII`** que as mensagens de canal.

Implementação de referência: `BridgeEventDispatcherService.createBotifyHandoff` + `InsightAiService.enqueueAnalyzeByPhone`.

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
