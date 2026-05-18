# 06 — Próximas Ações

Sequência de execução proposta. Cada bloco tem **dono** (quem decide / quem executa), **dependências** e **entregável**.

## Convenção
- ⏳ **Pendente** — ainda não começou
- 🟢 **Em andamento**
- ✅ **Concluído**

---

## Bloco A — Decisões estratégicas (você decide)

### A.1 ✅ Definir gerenciador de pacotes do monorepo
**Status:** Concluído. Usaremos `pnpm` (recomendado).

### A.2 ✅ Definir estratégia para Supabase
**Status:** Concluído. Abordagem C (Híbrida) — transição gradual para evitar perda de contexto, mas no final tudo será Postgres/NestJS.

### A.3 ✅ Verificar produção do `taticaofc`
**Status:** Concluído. O OmniconnectPRO será um produto **novo** com novos usuários. Portanto, não há necessidade de script de migração de banco de dados legado. Começaremos com o schema zerado.

### A.4 ✅ Status dos outros repos no GitHub
**Status:** Concluído. Botify, CRM e SAA continuarão existindo como produtos apartados e não serão arquivados.

### A.5 ✅ Multi-tenant ou single-tenant?
**Status:** Concluído. Será multi-tenant. Cada cliente (tenant) será isolado. (Conforme regras e documentação padrão).

---

## Bloco B — Setup de Rules e Skills do Cursor ✅ COMPLETO

### B.1 ✅ Proposta de Rules do usuário recebida e revisada
**Status:** Conteúdo revisado, ajustes acordados (formato `.mdc`, skills como diretórios, marcadores `:contentReference` removidos).

### B.2 ✅ Rules criadas em `.cursor/rules/`
12 arquivos `.mdc` criados:
1. `00-core-principles.mdc` — alwaysApply
2. `01-multitenancy.mdc` — alwaysApply
3. `02-security.mdc` — alwaysApply
4. `03-monorepo-structure.mdc` — alwaysApply
5. `10-nestjs-backend.mdc` — globs backend
6. `11-prisma.mdc` — globs Prisma
7. `12-api-standards.mdc` — globs controllers/DTOs
8. `13-events.mdc` — globs services/events
9. `20-react-frontend.mdc` — globs frontends
10. `30-ai-governance.mdc` — globs insight-ai
11. `40-testing.mdc` — globs testes
12. `50-commits.mdc` — alwaysApply

### B.3 ✅ Skills criadas em `.cursor/skills/`
11 skills criadas, cada uma em sua pasta com `SKILL.md`:
1. `apply-insight-ai-patch` — procedimento seguro do patch
2. `migrate-product-to-monorepo` — importar produto para apps/
3. `add-prisma-model-multitenant` — model com tenantId + indexes + migration
4. `create-bridge-endpoint` — bridge OmniConnect ↔ CRM/SAA/Botify
5. `backend-nestjs` — feature backend
6. `frontend-react` — feature frontend
7. `database-prisma` — schema design avançado
8. `insight-ai` — trabalho no módulo IA
9. `security-review` — review de segurança
10. `multitenancy-review` — review de isolamento
11. `product-owner` — priorização e filtro

---

## Bloco C — Execução da migração (depois das decisões)

> **Sequência exata em `03-migration-plan.md`.** Aqui só o resumo dos próximos 5 passos imediatos:

### C.1 ✅ Criar repo `omniconnect-pro` no GitHub e local
**Depende de:** A.1
**Entregável:** Fase 1 do plano completa, repo vazio funcional com workspace configurado

### C.2 ✅ Migrar OmniConnect para `apps/omniconnect-backend` e `apps/omniconnect-frontend`
**Depende de:** C.1 + A.3
**Entregável:** Fase 2, build do backend passa, build do frontend passa

### C.3 ✅ Aplicar patch InsightAI corrigido
**Depende de:** C.2 + bloqueadores do patch (`04-insight-ai-patch-analysis.md`)
**Entregável:** Fase 3, endpoint `/insight-ai/dashboard/summary` responde

### C.4 ✅ Setup `packages/ai-contracts` e `packages/shared-types`
**Depende de:** C.3
**Entregável:** Fase 4, tipos do InsightAI consumíveis por outros apps

### C.5 ✅ Migrar Botify
**Depende de:** A.2 + C.4
**Entregável:** Fase 5, `apps/botify` builda dentro do monorepo

### C.6 ✅ Migrar CRM Imobiliário
### C.7 ✅ Migrar Smart Ad Automator
### C.8 ✅ Bridges entre apps (OmniConnect↔CRM, SAA↔OmniConnect)
### C.9 ⏳ Arquivar `taticaofc`

---

## Bloco D — Validações pendentes antes da Fase 3 (patch InsightAI)

Estas verificações precisam ser feitas **diretamente no código atual** do `taticaofc/backend/` antes de aplicar o patch:

### D.1 ⏳ Verificar enum `Sender` no schema
**Comando:** `rg "enum Sender" backend/prisma/schema.prisma -A 5`
**Verificar:** os valores são `operator` e `contact` (como o service espera)?

### D.2 ⏳ Verificar `RolesGuard` e decorator `@Roles`
**Arquivos:** `backend/src/common/guards/roles.guard.ts`, `backend/src/common/decorators/roles.decorator.ts`
**Verificar:** aceita strings? Espera enum? Como é o campo `role` no `User`?

### D.3 ⏳ Verificar `JwtAuthGuard`
**Arquivo:** `backend/src/common/guards/jwt-auth.guard.ts`
**Verificar:** strategy usada (JWT? Passport? token de header?)

### D.4 ⏳ Confirmar campos do `Conversation` (já feito ✅)
Já confirmado: `contactPhone`, `datetime`, `segment`, `userId`, `userName`, `message`, `sender` existem.

### D.5 ⏳ Confirmar `package.json` do backend
**Verificar:**
- `class-validator` está nas deps?
- `class-transformer` está nas deps?
- versão do NestJS (precisa ser 9+ para `@nestjs/swagger` recente)

---

## O que está pronto

- ✅ Estrutura do `omniconnect-pro` criada em `~/Desktop/AMBIENTE DEV/omniconnect-pro/`
- ✅ 12 rules `.cursor/rules/*.mdc`
- ✅ 11 skills `.cursor/skills/<nome>/SKILL.md`
- ✅ 9 docs de produto em `docs/01-product-vision.md` → `docs/09-roadmap.md`
- ✅ Docs de migração copiados para `docs/migration/`
- ✅ `AGENTS.md`, `README.md`, `.gitignore`, `.editorconfig`, `.env.example`
- ✅ `package.json` (root + pnpm workspaces), `pnpm-workspace.yaml`, `tsconfig.base.json`
- ✅ `docker-compose.yml` (Postgres + Redis local)
- ✅ Esqueleto `docs/adr/` com template

## Próximas decisões antes de seguir

### A.3 ⏳ `taticaofc` tem produção rodando?
**Pergunta:** existe ambiente de produção rodando hoje com dados reais?
- Se SIM: precisamos plano de migração de banco com backup
- Se NÃO: podemos recriar schema do zero no `omniconnect-pro`

### A.4 ⏳ Status dos outros repos no GitHub
**Pergunta:** Botify, CRM e SAA têm repos próprios no GitHub hoje? Vão ser arquivados também?

### Repo `omniconnect-pro` no GitHub
Próximo passo prático: criar o repo `omniconnect-pro` no GitHub e fazer o primeiro `git init && git commit && git push`. Isso é uma decisão sua (privado/público? nome confirmado?).

## Próximos passos de execução

Quando você confirmar as decisões pendentes acima, a ordem é:

1. **Inicializar git no `omniconnect-pro` + primeiro commit** (configurar `gh repo create`)
2. **Migrar OmniConnect** (`taticaofc/backend` + `frontend`) para `apps/omniconnect-backend` e `apps/omniconnect-frontend` → skill `migrate-product-to-monorepo`
3. **Multi-tenant retrofit** no backend (adicionar `Tenant` model + `tenantId` em todas as tabelas)
4. **Aplicar patch InsightAI** com correções → skill `apply-insight-ai-patch`
5. Migrar Botify, CRM, SAA → skill `migrate-product-to-monorepo` (3x)
6. Criar packages `ai-contracts` e `shared-types`
7. Bridges entre apps → skill `create-bridge-endpoint`

---

## Bloco E — Sprint 1.1: Foundation hardening ✅ CONCLUÍDA

Sprint executada após o commit `67734b8` (foundation sprint) para fechar as brechas que sobraram antes de integrar CRM/Botify/SAA de verdade.

### Entregáveis

| Bloco | Status | Resumo |
|---|---|---|
| 1 — Schema | ✅ | `AIUsageLog` enriquecido (analysisId, operationType, promptVersion, currency, status, errorCode/errorMessage). Novo model `IntegrationEvent` (HMAC + idempotency). Migração `20260518100000_sprint_1_1_ai_usage_and_integration_events`. `.gitignore` agora versiona migrations. |
| 2 — Bridges | ✅ | `RawBodyMiddleware` em `/crm-bridge`, `/ads-bridge`, `/bot-bridge`. HMAC-SHA256 sobre raw body com `timingSafeEqual`. Idempotency via `IntegrationEvent.idempotencyKey @unique`. Filas Bull por provider. |
| 3 — InsightAI | ✅ | `BullModule.registerQueue('insight-ai-analysis')` + `AnalyzeConversationProcessor`. Endpoints `POST /insight-ai/analyze/:phone` (async default, `?sync=true` para debug) e `GET /insight-ai/jobs/:jobId`. Cast `(prisma as any)` removidos. `AIUsageLog` gravado em cada chamada. |
| 4a — Tenant helper | ✅ | `common/utils/tenant-context.ts` com `ensureTenant`, `withTenant`, `ensureJobTenant` (refusa `default-tenant` em produção). |
| 4b — Retrofit | ✅ | `tenantId` exigido em segments, tags, blocklist, reports (17 métodos), conversations.create. Propagado em api-messages, campaigns, webhooks (Evolution + Cloud API), processors e websocket gateway. Tenant para webhooks vem trusted do `App.tenantId` via `LinesStock.appId`. |
| 5 — Tests | ✅ | 50 testes Jest verdes. `tenant-context.spec`, `jwt.strategy.spec`, `contacts.service.spec`, `apps.service.spec`, `bridge-helpers.spec`, `auth.service.spec` atualizado. |
| 6 — CI | ✅ | `.github/workflows/ci.yml` com 3 jobs: backend-build (tsc + jest + nest build), backend-integration (Postgres 16 + Redis 7 + `prisma migrate deploy`), frontends-build (matriz dos 4 apps). PR template em `.github/pull_request_template.md`. |
| 7 — Docs | ✅ | `03-multitenancy.md`, `04-security.md`, `05-ai-governance.md` atualizados com a nova superfície. |

### FIXMEs pendentes (Sprint 1.2)

- `api-messages.service`: hoje usa `'default-tenant'` porque `ApiKeyGuard` só valida o `API_KEY` estático do `.env`. Plano: criar tabela `TenantApiKey` e resolver tenant via lookup do hash da key apresentada.
- `campaigns.service.uploadCampaign()`: idem — propagar `tenantId` do usuário autenticado pelo controller.
- `campaigns.processor`: hoje resolve tenant via `line.appId`; ideal é passar `tenantId` direto no payload do job ao enqueue.
- `message-queue.service`: idem — incluir tenantId no payload do scheduler.
- `AI_PRICING` constante hardcoded → mover para tabela `ModelPricing` por modelo/versão/data.
- Retrofit de `tenantId` em `lines`, `system-events`, `archiving`, `conversations` (demais métodos) ainda pendentes.

### Riscos conhecidos

- `prisma.config.ts` e `prisma/seed.ts` importam `@prisma/config` e `dotenv` que não estão nas devDependencies do backend. Isso quebra `tsc --noEmit` em 2 arquivos (não inclui o `src/`). Adicionar essas deps no Bloco inicial da Sprint 1.2.
- O job `frontends-build` no CI está marcado `continue-on-error: true` até alinharmos os 4 frontends — falhas neles **não bloqueiam** PRs hoje.

---

## Bloco F — Sprint 1.2: Hardening pós-foundation ✅ CONCLUÍDA

Sprint executada para fechar todos os FIXMEs deixados pela Sprint 1.1 e elevar o backend a "production-ready" antes de iniciar a migração dos backends do CRM e SAA.

### Entregáveis

| Bloco | Status | Resumo |
|---|---|---|
| 1.2.1 — TenantApiKey | ✅ | Novo model `TenantApiKey` (sha256 do plaintext, prefixo de exibição `oc_…`, scopes, revokedAt, expiresAt, lastUsedAt). `TenantApiKeysService.resolve()` + cache. `ApiKeyGuard` agora resolve `tenantId` via hash-lookup; rejeita tokens desconhecidos em produção, fallback de log apenas em dev. `api-messages.controller` propaga `tenantId` real para o service. |
| 1.2.2 — Bull tenant context | ✅ | Todo job (`campaigns`, `message-queue`, `insight-ai`) carrega `tenantId` no payload. Processors usam `ensureJobTenant()` para validar antes de qualquer DB write. Queries em `linesStock`, `template` e `conversation` dentro dos processors agora são tenant-scoped. |
| 1.2.3 — Retrofit tenantId | ✅ | `lines`, `system-events`, `archiving`, `conversations` reescritos: `tenantId` como primeiro argumento de **todos** os métodos públicos, controllers usando `@CurrentUser()` + `ensureTenant()`, queries Prisma 100% filtradas por `tenantId`. Removidos todos os `(prisma as any)` remanescentes. |
| 1.2.4 — ModelPricing | ✅ | Constante `AI_PRICING` substituída por tabela versionada `ModelPricing` (provider, name, inputPer1k, outputPer1k, currency, effectiveFrom/Until). `ModelPricingService` com cache TTL 5min + fallback resiliente para a baseline antiga. `InsightAiService` agora resolve preço dinamicamente. Migration seed mantém comportamento idêntico para gpt-4o e gpt-4o-mini no dia zero. |
| 1.2.5 — Build hygiene | ✅ | `dotenv` e `@prisma/config` declarados em `dependencies`. CI refatorado: `omniconnect-frontend` agora é job **bloqueante** (`frontend-core`); botify/crm-imobiliario/smart-ad-automator viraram matriz não-bloqueante (`frontends-satellite`, `continue-on-error: true`) até a migração de backend ser concluída. |
| 1.2.6 — E2E isolation | ✅ | `src/test/tenant-isolation.e2e.spec.ts`: boot do `ContactsController` com a stack real (`JwtAuthGuard` + `JwtStrategy` + `RolesGuard`) + Prisma in-memory que respeita `where.tenantId`. 13 casos HTTP provam que A não lê/altera/exclui dados de B e que não dá pra contrabandear `tenantId` no body. |

### Resultado

- **96 testes verdes** em 11 suites (era 50/6 na Sprint 1.1).
- `tsc --noEmit` limpo para `src/` (residual em `prisma.config.ts` e `prisma/seed.ts` some com `pnpm install`).
- Nenhum `(prisma as any)` cast no `src/`.
- Nenhum método de service tenant-scoped sem `tenantId` no contrato.
- CI sinaliza problemas reais no backend e no `omniconnect-frontend` sem ruído dos satélites.

### Próximos passos (Sprint 2 — backends CRM/SAA)

1. Mapear o schema Supabase de cada produto (CRM Imobiliário + SAA) e desenhar a versão Prisma multi-tenant equivalente.
2. Implementar os módulos no `omniconnect-backend` seguindo o padrão Sprint 1.2 (tenantId obrigatório, JWT, ApiKey quando server-to-server, eventos via Bull, AIUsageLog quando aplicável).
3. Substituir as chamadas Supabase em cada frontend pelo novo SDK do backend, app por app, com feature flag e Strangler Fig.
4. Plano detalhado por feature: leads CRM → pipeline → propostas → unidades imobiliárias → OAuth Meta/Google/TikTok → campanhas pagas.
