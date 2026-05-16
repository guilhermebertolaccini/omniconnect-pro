---
name: insight-ai
description: >-
  Work on the InsightAI module — adding prompts, output schemas, model
  providers, fallback logic, cost tracking, or dashboard aggregations. Use
  when the user asks to improve, extend, debug, or add features to the
  conversation analytics module, change prompts, swap LLM models, or work on
  the AI dashboard.
---

# InsightAI Engineering

The InsightAI module analyzes commercial conversations and produces structured insights (intent, objections, scores, next best action). Outputs are **inferred recommendations**, not ground truth.

## Module location

`apps/omniconnect-backend/src/insight-ai/`

Recommended sub-structure:
```
insight-ai/
├── insight-ai.module.ts
├── insight-ai.controller.ts
├── insight-ai.service.ts                 # orchestration
├── dto/
├── prompts/
│   ├── conversation-analysis-v1.ts
│   ├── conversation-analysis-v2.ts
│   └── index.ts                          # exports current
├── providers/
│   ├── openai.provider.ts
│   ├── anthropic.provider.ts             # future
│   └── heuristic.provider.ts             # fallback
├── schemas/
│   └── conversation-ai-result.schema.ts  # Zod
├── jobs/
│   └── analyze-conversation.processor.ts # BullMQ
└── insight-ai.types.ts
```

## Output schema (canonical)

Defined in `packages/ai-contracts/src/conversation-ai-result.ts`:

```typescript
import { z } from 'zod';

export const LeadIntentSchema = z.enum([
  'curioso', 'frio', 'pesquisa', 'qualificado',
  'quente', 'pronto_para_visita', 'pronto_para_proposta', 'indefinido',
]);

export const ConversationAIResultSchema = z.object({
  summary: z.string(),
  leadIntent: LeadIntentSchema,
  opportunityStatus: z.enum(['ativa', 'em_risco', 'perdida', 'pronta_para_retomada', 'sem_oportunidade_clara']),
  risk: z.enum(['baixo', 'medio', 'alto', 'critico']),
  mainObjection: z.string().nullable(),
  objections: z.array(z.string()),
  sellerQualityScore: z.number().int().min(0).max(100),
  // ...
});

export type ConversationAIResult = z.infer<typeof ConversationAIResultSchema>;
```

## Prompt versioning

```typescript
// prompts/conversation-analysis-v3.ts
export const PROMPT_VERSION = 'insight-ai-conversation-analysis-v3';
export function buildPrompt(messages: NormalizedMessage[]): string {
  return `...`;
}

// prompts/index.ts
export { PROMPT_VERSION, buildPrompt } from './conversation-analysis-v3';
```

Changing the prompt? Create a new versioned file. Don't edit the old one. Keep both available for A/B and replay.

## Provider abstraction

```typescript
export interface AIProvider {
  readonly name: string;        // 'openai', 'anthropic', 'heuristic'
  readonly modelName: string;
  analyze(prompt: string): Promise<{ raw: unknown; tokensIn: number; tokensOut: number }>;
}
```

Service tries primary provider → on failure, falls back. Heuristic provider always succeeds (no external dependency).

## Validation before save

```typescript
async analyze(input) {
  const prompt = buildPrompt(input.messages);
  const result = await this.provider.analyze(prompt);

  let parsed;
  try {
    parsed = ConversationAIResultSchema.parse(JSON.parse(result.raw));
  } catch (err) {
    this.logger.warn('Invalid AI output, falling back to heuristic', err);
    parsed = await this.heuristicProvider.analyze(prompt);
    parsed = ConversationAIResultSchema.parse(parsed);  // double-check
  }

  return this.persist({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    modelProvider: this.provider.name,
    modelName: this.provider.modelName,
    promptVersion: PROMPT_VERSION,
    output: parsed,
    promptTokens: result.tokensIn,
    completionTokens: result.tokensOut,
    estimatedCost: this.calculateCost(result.tokensIn, result.tokensOut),
  });
}
```

## Cost tracking

Persistir `promptTokens`, `completionTokens`, `estimatedCost` em **cada análise**. Endpoint `/billing-usage/ai?tenantId=X&from=...&to=...` agrega.

Tabela de preços (modelo → custo por 1k tokens) em config:

```typescript
export const AI_PRICING = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },   // USD per 1k tokens
  'gpt-4o':      { input: 0.005,   output: 0.015 },
} as const;
```

## PII redaction (ALWAYS before sending to LLM)

```typescript
function redactPII(text: string): string {
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g, '[RG]')
    .replace(/\b\d{10,11}\b/g, '[PHONE]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
}
```

Tune the regex with team / DPO review. Test with real conversation samples.

## Queue, not sync (BullMQ)

```typescript
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Controller
@Post('analyze/:conversationId')
async analyze(@Param('conversationId') id: string, @CurrentUser() user) {
  const jobId = `${user.tenantId}:${id}`;
  await this.queue.add('analyze', { tenantId: user.tenantId, conversationId: id }, { jobId });
  return { jobId, status: 'queued' };
}

@Get('jobs/:jobId')
async jobStatus(@Param('jobId') jobId: string) {
  return this.queue.getJob(jobId).then(j => ({ status: j.status, result: j.returnvalue }));
}
```

Never call OpenAI in the HTTP request thread. Para isolar falhas de provider externo, envolver o provider em **circuit breaker** (módulo `circuit-breaker/` já existente, baseado em `opossum`).

## Human-in-the-loop

❌ IA muda `lead.stage` automaticamente.
✅ IA sugere via campo `aiSuggestedStage` + UI permite humano aprovar.
✅ Workflow explícito (admin habilita auto-apply em config) com auditoria.

## Métricas (Prometheus)

Expor via `prom-client` (já instalado):

- `insight_ai_jobs_total{tenant, status}` — counter
- `insight_ai_tokens_total{tenant, provider, kind}` — counter (kind=`input|output`)
- `insight_ai_cost_usd_total{tenant, provider}` — counter
- `insight_ai_latency_seconds{tenant, provider}` — histogram

## Tests (Jest no backend)

- Schema validation: input → expected output structure
- Fallback path: OpenAI 500 → heuristic kicks in
- Tenant isolation: análise de tenant A não aparece em listagem de B
- Cost calc: tokens conhecidos → custo previsível
- Circuit breaker: N falhas consecutivas → fallback automático

## See also

- `.cursor/rules/30-ai-governance.mdc`
- `docs/05-ai-governance.md`
- `docs/migration/04-insight-ai-patch-analysis.md`
