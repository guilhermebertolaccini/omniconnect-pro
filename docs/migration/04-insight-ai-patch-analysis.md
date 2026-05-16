# 04 — Análise do Patch InsightAI MVP

## Onde está
`~/Desktop/AMBIENTE DEV/insight-ai-mvp-patch/`

## O que o patch faz (na intenção)
Adicionar um módulo NestJS `insight-ai` ao backend do OmniConnect que:
- Lê conversas de um contato no Prisma
- Manda transcript pra OpenAI (gpt-4o-mini) com prompt estruturado
- Recebe JSON com `leadIntent`, `opportunityStatus`, `risk`, scores, objeções, próximo passo
- Persiste em uma nova tabela `ConversationAIAnalysis`
- Expõe 4 endpoints REST + um dashboard agregado
- Tem **fallback heurístico** quando não há `OPENAI_API_KEY` (vale ouro pra testes)

## Arquivos no patch

| Arquivo | Linhas | Função |
|---|---|---|
| `INSIGHT_AI_PATCH_README.md` | 39 | Instruções (ver problemas abaixo) |
| `omniconnect/.../backend/src/app.module.ts` | 87 | App.module modificado (= seu atual + 2 linhas) |
| `omniconnect/.../backend/prisma/schema.prisma` | 474 | Schema modificado (= seu atual + 47 linhas) |
| `omniconnect/.../backend/src/insight-ai/insight-ai.module.ts` | 13 | Módulo NestJS |
| `omniconnect/.../backend/src/insight-ai/insight-ai.controller.ts` | 43 | Controller com 4 endpoints |
| `omniconnect/.../backend/src/insight-ai/insight-ai.service.ts` | 365 | Lógica principal |
| `omniconnect/.../backend/src/insight-ai/insight-ai.prompt.ts` | 52 | Prompt OpenAI |
| `omniconnect/.../backend/src/insight-ai/insight-ai.types.ts` | 35 | Tipos compartilhados |

---

## 🔴 BLOQUEADORES (quebram build/aplicação se não tratar)

### 🔴 B1 — Pasta `dto/` não existe no patch (único bloqueador real)
O controller importa:
```typescript
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
```
Mas **a pasta `dto/` não foi incluída no patch**. Build vai falhar.

**Fix:** criar manualmente o arquivo. Baseado no uso no service e controller, o DTO precisa ter:
```typescript
// src/insight-ai/dto/analyze-conversation.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsBoolean, Min, Max } from 'class-validator';

export class AnalyzeConversationDto {
  @ApiPropertyOptional({ description: 'Telefone do contato (E.164)' })
  @IsOptional() @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Janela em dias para buscar conversas', default: 30 })
  @IsOptional() @IsInt() @Min(1) @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Limite de mensagens', default: 80 })
  @IsOptional() @IsInt() @Min(1) @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrar por segmento' })
  @IsOptional() @IsInt()
  segment?: number;

  @ApiPropertyOptional({ description: 'Filtrar por operador' })
  @IsOptional() @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: 'Persistir resultado na tabela', default: true })
  @IsOptional() @IsBoolean()
  persist?: boolean;
}
```

### ✅ Não-bloqueadores (correção de análise anterior)

A auditoria do `taticaofc/backend/package.json` e do `schema.prisma` mostra que:

- **`@nestjs/swagger`, `class-validator`, `class-transformer` já estão instalados.** Não é preciso `pnpm add`.
- **O enum `Role` já existe no schema** com os valores `admin | operator | supervisor | ativador | digital`. As referências do patch (`Role.admin`, `Role.supervisor`, `Role.digital`) resolvem direto — sem alteração no schema.

Ou seja, **B1 é o único bloqueador real**. As outras pendências do README do patch eram falsos positivos.

---

## 🟡 RISCOS (funciona mas tem impacto)

### 🟡 R1 — Chamadas síncronas à OpenAI dentro do request HTTP

No service:
```typescript
async openAiAnalysis(messages, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {...});
  // ...
}
```

E em `analyzeManyPending()` faz loop síncrono:
```typescript
for (const item of phones) {
  results.push(await this.analyzeByPhone(item.contactPhone, dto));
}
```

**Impacto:**
- Timeout HTTP (default 30s) com lotes grandes
- Custos disparam sem rate limit
- Sem retry em erro 429

**Fix recomendado:**
- Mover para fila **BullMQ** (o app já tem `BullModule` configurado; preferir BullMQ para código novo)
- Envolver o provider em **circuit breaker** via módulo `circuit-breaker/` (opossum) já existente
- Criar `InsightAiQueue` com job `analyze-conversation`
- `analyzeManyPending` enfileira N jobs e responde 202 com `jobIds[]`
- Endpoint `/insight-ai/jobs/:id` retorna status

### 🟡 R2 — PII enviada para a OpenAI sem redação

`insight-ai.prompt.ts`:
```typescript
const transcript = messages.map(m =>
  `[${m.datetime}] ${m.sender === 'contact' ? 'LEAD' : 'CORRETOR'}: ${m.text}`
).join('\n');
```

Manda o texto cru das conversas, que pode conter:
- CPF, RG, nascimento
- Telefones de terceiros
- Valores financeiros, salários
- Endereços completos

**Risco regulatório (LGPD):** mandar dados pessoais para LLM em jurisdição externa sem consentimento explícito.

**Fix recomendado:**
- Redação básica antes do prompt (regex CPF, telefones, e-mails → token `[REDACTED]`)
- Flag por conta/cliente para consentimento de uso da IA
- Documentar em política de privacidade

### 🟡 R3 — Cast `(this.prisma as any)` em vez de tipos gerados

```typescript
return (this.prisma as any).conversationAIAnalysis.findMany({...});
```

Indica que o autor não rodou `prisma generate` após adicionar o model. **Vai funcionar** após `pnpm prisma generate`, mas sinaliza descuido. Depois de aplicar o patch, fazer:
```bash
pnpm prisma generate
```
e **remover os `as any`** do service para ter tipo seguro.

### 🟡 R4 — Sem rate limit no endpoint
Endpoints expostos não têm rate limiting. Quem tiver token de admin pode disparar `analyzeManyPending` em loop e queimar a OpenAI key.

**Fix:** reutilizar o módulo interno `rate-limiting/` do projeto e aplicar guards/decorators no controller. **Não** instalar `@nestjs/throttler`.

### 🟡 R5 — `INSIGHT_AI_PATCH_README.md` sugere SQL manual fora do Prisma
O README diz:
> Rode a migration SQL em `backend/prisma/migrations/manual_insight_ai/migration.sql`

Esse arquivo SQL **não existe no patch** (foi mencionado mas não entregue). E mesmo se existisse, **executar SQL manual fora do `prisma migrate`** dessincroniza a tabela `_prisma_migrations`.

**Fix:** já está no plano — usar `pnpm prisma migrate dev --name add_conversation_ai_analysis` em vez de SQL manual.

---

## ✅ PONTOS FORTES do código real

Apesar dos bloqueadores, o código entrega coisas boas:

1. **Auth correto** — usa `JwtAuthGuard` + `RolesGuard` já existentes no projeto
2. **Fallback heurístico bem feito** — funciona sem OpenAI, dá pra testar grátis
3. **Prompt fechado com enums** — o LLM é forçado a responder com valores válidos (`leadIntent`, `opportunityStatus`, `risk`)
4. **`response_format: { type: 'json_object' }` + temperature 0.1** — bom para consistência
5. **Normalização do resultado** — `clamp(0,100)`, `Boolean()`, `String()` defensivos
6. **Dashboard agregado já implementado** — `getExecutiveSummary` traz métricas agregadas prontas
7. **Tipos TypeScript exportados** — `LeadIntent`, `OpportunityStatus`, `ConversationRisk`, `ConversationAIResult` ficam reutilizáveis pelo CRM e SAA

## ✅ Compatibilidade com schema existente

Bom: o service consome `Conversation` exatamente com os campos que o seu schema atual tem:
- `contactPhone` ✅
- `datetime` ✅
- `segment` ✅
- `userId`, `userName` ✅
- `message` ✅
- `sender` (mas é enum `Sender` no seu schema — verificar valores `'operator'` e `'contact'`)

> **A verificar:** o enum `Sender` do seu schema usa exatamente os valores `'operator'` e `'contact'`? O service compara assim:
> ```typescript
> messages.filter(m => m.sender === 'operator')
> ```

---

## Resumo das ações para aplicar o patch com segurança

Ordem:
1. Resolver B1 — criar `dto/analyze-conversation.dto.ts`
2. Verificar enum `Sender` no schema (valores esperados pelo service: `'operator'`, `'contact'`)
3. Copiar `src/insight-ai/` (sem `app.module.ts` e sem `schema.prisma`)
4. Adicionar `model ConversationAIAnalysis` no fim do schema atual
5. Adicionar `InsightAiModule` no `app.module.ts` atual
6. `pnpm install && pnpm prisma migrate dev --name add_conversation_ai_analysis`
7. `pnpm prisma generate`
8. `pnpm run build` — confirmar 0 erros
9. Smoke test sem `OPENAI_API_KEY` (modo heurístico)
10. Smoke test com `OPENAI_API_KEY` (chama OpenAI real)

Depois (não bloqueante, mas planejar):
- R1 — mover OpenAI para BullMQ + circuit breaker
- R2 — redação de PII
- R3 — remover `as any`
- R4 — usar módulo `rate-limiting/` interno nos endpoints
