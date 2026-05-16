---
name: apply-insight-ai-patch
description: >-
  Apply the InsightAI MVP patch safely to apps/omniconnect-backend, handling
  the 3 known blockers (missing dto/ folder, missing @nestjs/swagger
  dependency, missing Role enum). Use when the user mentions InsightAI, the
  patch, conversation analytics module, ConversationAIAnalysis, or asks to
  set up AI conversation analysis in the backend.
---

# Apply InsightAI Patch (Safely)

## Context

The patch at `~/Desktop/AMBIENTE DEV/insight-ai-mvp-patch/` adds a NestJS module for conversation analytics. The original README from the patch suggests destructive `cp` operations that **must be avoided** (would overwrite the entire `app.module.ts` and `schema.prisma`).

This skill applies the patch **non-destructively**. The taticaofc backend already has the right foundation (Role enum, @nestjs/swagger, common guards), so the only real blocker is **one missing DTO file** that the patch's controller imports but doesn't include.

## Pre-checks

Before running any step, verify:

```bash
# 1. Backend exists at the expected path
ls apps/omniconnect-backend/src/

# 2. Schema has the Conversation model with expected fields
rg "model Conversation" apps/omniconnect-backend/prisma/schema.prisma

# 3. common/guards exists (jwt-auth.guard.ts, roles.guard.ts)
ls apps/omniconnect-backend/src/common/guards/

# 4. Role enum exists with expected values (admin, operator, supervisor, ativador, digital)
rg "enum Role" apps/omniconnect-backend/prisma/schema.prisma -A 8

# 5. Sender enum values (the service expects 'operator' | 'contact')
rg "enum Sender" apps/omniconnect-backend/prisma/schema.prisma -A 5

# 6. @nestjs/swagger is in dependencies
rg '"@nestjs/swagger"' apps/omniconnect-backend/package.json
```

All 6 checks should pass on the taticaofc base. If any fails → stop and ask the user.

## Workflow

```
Task Progress:
- [ ] Step 1: Copy only insight-ai/ folder (NOT app.module.ts, NOT schema.prisma)
- [ ] Step 2: Create missing dto/analyze-conversation.dto.ts (only real blocker)
- [ ] Step 3: Verify @Roles uses existing enum values (no code change needed in patch — they match)
- [ ] Step 4: Append ConversationAIAnalysis model to schema (do NOT overwrite)
- [ ] Step 5: Append InsightAiModule import to app.module.ts (do NOT overwrite)
- [ ] Step 6: Generate Prisma migration
- [ ] Step 7: Run build and smoke test
```

## Step 1 — Copy the module only

```bash
cp -r ~/Desktop/AMBIENTE\ DEV/insight-ai-mvp-patch/omniconnect/taticaofc-main/backend/src/insight-ai \
      apps/omniconnect-backend/src/
```

**Do NOT** copy `app.module.ts` or `schema.prisma` from the patch — they will overwrite your real files.

## Step 2 — Create the missing DTO (the only real blocker)

The patch's controller imports `AnalyzeConversationDto` from `./dto/analyze-conversation.dto.ts`, but the file is missing from the patch. Create it:

> `@nestjs/swagger`, `class-validator` and `class-transformer` are **already installed** on the taticaofc base — no `pnpm add` needed.

```typescript
// apps/omniconnect-backend/src/insight-ai/dto/analyze-conversation.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AnalyzeConversationDto {
  @ApiPropertyOptional({ description: 'E.164 phone of the contact' })
  @IsOptional() @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Time window in days', default: 30 })
  @IsOptional() @IsInt() @Min(1) @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Message limit', default: 80 })
  @IsOptional() @IsInt() @Min(1) @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by segment id' })
  @IsOptional() @IsInt()
  segment?: number;

  @ApiPropertyOptional({ description: 'Filter by operator/user id' })
  @IsOptional() @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: 'Persist result in DB', default: true })
  @IsOptional() @IsBoolean()
  persist?: boolean;
}
```

## Step 3 — Role enum check (no change needed)

The patch's controller uses:

```typescript
import { Role } from '@prisma/client';
@Roles(Role.admin, Role.supervisor, Role.digital)
```

The taticaofc schema **already has** the `Role` enum with these values:

```prisma
enum Role {
  admin
  operator
  supervisor
  ativador
  digital
}
```

So `Role.admin`, `Role.supervisor`, `Role.digital` resolve correctly. **Nothing to change** here — the patch works as-is against the existing schema.

## Step 4 — Append the model (do NOT overwrite)

Open `apps/omniconnect-backend/prisma/schema.prisma`. Append the `ConversationAIAnalysis` model from the patch's schema.prisma at the **end of the file**:

```prisma
// Análises de IA sobre conversas comerciais.
model ConversationAIAnalysis {
  id                                Int       @id @default(autoincrement())
  // ... (47 lines, see patch's schema.prisma starting at line 428)
}
```

Per `01-multitenancy.mdc`, this model should also include `tenantId`. Add when multi-tenant retrofit happens.

## Step 5 — Edit app.module.ts (do NOT overwrite)

Open `apps/omniconnect-backend/src/app.module.ts`. Add two lines only:

```typescript
import { InsightAiModule } from './insight-ai/insight-ai.module';
// ...
imports: [
  // ...existing 35+ modules
  InsightAiModule,
],
```

## Step 6 — Generate migration

```bash
cd apps/omniconnect-backend
pnpm prisma migrate dev --name add_conversation_ai_analysis
pnpm prisma generate
```

After `generate`, remove any `(this.prisma as any)` casts in `insight-ai.service.ts` — types are now available.

## Step 7 — Build & smoke test

```bash
pnpm run build                    # must pass with 0 errors

# Without OPENAI_API_KEY (heuristic mode)
pnpm run start:dev
curl -X POST http://localhost:3000/insight-ai/analyze/55119XXXXXXXX \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

## Post-merge (deferred risks)

These are documented in `docs/migration/05-known-risks.md` and should be tracked as follow-up issues:

- **R-AI-01** — PII redaction before LLM
- **R-AI-02** — Move OpenAI calls to BullMQ + wrap provider in `circuit-breaker/` (opossum) module
- **R-AI-03** — Apply project's internal `rate-limiting/` module on IA endpoints (NOT `@nestjs/throttler`)
- **R-AI-04** — Track tokens/cost per analysis (Prometheus via `prom-client`)

## See also

- `docs/migration/04-insight-ai-patch-analysis.md` (full analysis)
- `.cursor/rules/30-ai-governance.mdc`
- `.cursor/rules/11-prisma.mdc`
