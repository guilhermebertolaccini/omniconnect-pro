# Sprint 5 — InsightAI v2

Status: **concluída** — Blocos 1–4 entregues.

## Objetivo

Evoluir o módulo `insight-ai` de **OpenAI único + heurística** para arquitetura
**multi-provedor** (Anthropic, Gemini como plugins), melhorar **observabilidade
de custo por tenant** e enriquecer o **dashboard** com filtros operacionais —
sem relaxar PII redaction, tenant isolation nem governança human-in-the-loop.

## Estado atual (baseline)

- `InsightAiService` + fila Bull `insight-ai`, job id determinístico, `ModelPricing` +
  `AIUsageLog`.
- Prompt versionado (`insight-ai.prompt.ts`), output `ConversationAIResult` em
  `@omniconnect/ai-contracts`.
- `redactPII` obrigatório antes do LLM.

## Bloco 1 — Contrato de provider ✅

Entrega:

- Tipos `InsightAiCompletionRequest` / `InsightAiCompletionResult` /
  `InsightAiLlmProvider` em `providers/insight-ai-llm.types.ts`.
- `OpenAiInsightProvider` (`providers/openai-insight.provider.ts`) — chamada HTTP
  a Chat Completions + JSON mode; **sem** `AIUsageLog` / pricing (permanecem no
  serviço).
- `InsightAiService` delega a OpenAI via provider; env
  **`INSIGHT_AI_DEFAULT_PROVIDER`** (default `openai`); valor não implementado →
  heurística + `warn`.
- Testes: `openai-insight.provider.spec.ts` (mock `fetch`); specs existentes de
  fila/E2E atualizados com stub do provider.

**Critério de pronto:** comportamento OpenAI + fallback heurístico equivalente ao
pré-refactor; suíte `insight-ai` verde.

## Bloco 2 — Provedores adicionais ✅

Entrega:

- **`AnthropicInsightProvider`** — Messages API (`claude-3-5-haiku-20241022` default
  via `ANTHROPIC_MODEL`), tokens `input_tokens` / `output_tokens`.
- **`GeminiInsightProvider`** — `generateContent` com `responseMimeType:
  application/json`; chave `GEMINI_API_KEY` ou `GOOGLE_AI_API_KEY`; default
  `gemini-2.0-flash` (`GEMINI_MODEL`). `modelProvider` em DB/logs: **`google`**.
- **`InsightAiLlmResolver`** — `INSIGHT_AI_DEFAULT_PROVIDER`: `openai` | `anthropic` |
  `gemini` | `google` (alias). Flags: `INSIGHT_AI_ANTHROPIC_DISABLED`,
  `INSIGHT_AI_GEMINI_DISABLED` (`1` / `true` / `yes`).
- **ModelPricing**: fallback em código + migration
  `20260521000000_sprint_5_model_pricing_multiprovider` (linhas anthropic + google).
- **`InsightAiService.runLlmAnalysis`**: único caminho LLM; `AIUsageLog.modelProvider`
  = `provider.id`.

**Critério de pronto (código):** adapters testáveis com `fetch` mock; `tsc` + Jest
`insight-ai` + `model-pricing` verdes. **Staging:** validar com chave real antes
de produção.

## Bloco 3 — Dashboard + custo agregado ✅

Entrega:

- **`GET /insight-ai/dashboard/summary`** — query DTO: `days` (1–365, janela móvel quando `from`/`to`
  omitidos), `from` + `to` (ISO 8601, obrigatórios em par), `segment` opcional. Agregação sobre até
  **2000** análises mais recentes no intervalo (`sampleCap`). Resposta inclui `period` + `periodDays`.
- **`GET /insight-ai/analyses`** — paginação `limit` (≤200) + `offset`, filtros opcionais `from`/`to`,
  `segment`, `contactPhone`.
- **`GET /insight-ai/dashboard/usage`** — agregados `AIUsageLog` com `groupBy` em `modelProvider`;
  query `status`: `success` (default) | `failed` | `all`; mesma janela `days` ou `from`/`to` que o summary.
- **`omniconnect-frontend`**: rota `/inteligencia`, item de menu (admin / supervisor / digital),
  `insightAiService` em `services/api.ts`.

**Critério de pronto:** E2E tenant isolation estendido para `dashboard/usage`; listagem de análises
retorna `{ items, meta }` apenas com `tenantId` do JWT.

## Bloco 4 — Documentação e operação ✅

- `docs/05-ai-governance.md`, `docs/06-api-standards.md` (contratos InsightAI dashboard).
- `docs/migration/06-next-actions.md` — estado Sprint 5.
- Runbook: `apps/omniconnect-backend/DEPLOYMENT.md` — variáveis InsightAI / provedores.

## Dependências / riscos

- **Custos:** multi-provider multiplica superfície de billing — testar com
  `ModelPricing` antes de liberar em produção.
- **LGPD:** novos adapters devem receber apenas texto já redigido; não logar
  prompts com PII.

## Ver também

- `docs/migration/06-next-actions.md` — estado macro do monorepo.
- Skill `.cursor/skills/insight-ai/SKILL.md` — detalhes do módulo atual.
