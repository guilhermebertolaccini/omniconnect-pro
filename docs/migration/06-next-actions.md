# 06 — Próximas Ações

> Histórico das fases anteriores (Blocos A–F, Sprints 1.1 / 1.2) está em
> `docs/migration/archive/06-next-actions-historical.md`. Esta página
> mantém apenas o estado atual e o que vem a seguir.

## Estado atual

| Capacidade | Status |
|---|---|
| Monorepo (`pnpm` workspace) | ✅ |
| `omniconnect-backend` (NestJS + Prisma + Postgres + Bull) | ✅ |
| `omniconnect-frontend` (operação) | ✅ |
| `botify`, `crm-imobiliario`, `smart-ad-automator` no monorepo | ✅ |
| `packages/ai-contracts`, `packages/shared-types` | ✅ |
| Multi-tenancy (tenantId em models, services, jobs, JWT, API keys) | ✅ |
| Auth: JWT valida membership por tenant + roles por tenant | ✅ (Sprint 1.3 Bloco B) |
| Bridges com HMAC real + segredo criptografado em repouso (AES-256-GCM) | ✅ (Sprint 1.3 Bloco A) |
| Idempotency `(tenantId, provider, key)` | ✅ (Sprint 1.3 Bloco A) |
| InsightAI: fila Bull + `AIUsageLog` + `ModelPricing` + jobId determinístico | ✅ (Sprint 1.3 Bloco C) |
| PII redactor LGPD-grade (CPF/CNPJ/CEP/data/renda/contrato/endereço) | ✅ (Sprint 1.3 Bloco C) |
| Testes backend: 295 verdes / 28 suites (unit + integration + 64 E2E HTTP) | ✅ |
| Testes SAA frontend (Vitest): 11/11 verdes | ✅ |
| CI: workflow GitHub Actions (backend bloqueante, satélites não-bloqueantes) | ✅ |
| Docs core (`docs/01..09`) | ✅ |
| SAA backend (Sprint 2.3) — schema + connections + proxies + AI + token refresh | ✅ |
| SAA frontend (Sprint 2.4) — invites, refresh tokens, OAuth pickup, cutover | ✅ |

## Sprint 1.3 — Hardening final pré-Sprint 2 ✅ CONCLUÍDA

Fechou as 4 arestas que separavam a fundação de "production-ready":

| Bloco | Resumo |
|---|---|
| **A — Bridges** | `IntegrationConnection.secretHash` → `webhookSecretEncrypted` (AES-256-GCM com `BridgeSecretCipher`, versionado `v1.<iv>.<tag>.<ct>`). `IntegrationEvent.idempotencyKey` agora é unique composto `(tenantId, provider, key)` — colisões cross-tenant não são mais silenciadas. |
| **B — Auth** | `JwtStrategy` valida `UserTenant.findUnique({ userId_tenantId })` a cada request. Em produção, sem membership → 401. `RolesGuard` lê `tenantRole` primeiro (UserTenant.role) com fallback `user.role`. |
| **C — InsightAI** | `getJobStatus` é estrito: job sem `tenantId` no payload é 404. `enqueueAnalyzeByPhone` passa `jobId` determinístico `iai:<sha256(...)>` com hour-bucket (dedup real, telefone nunca no Redis). `redactPII` agora cobre CPF, CNPJ, CEP, RG, datas, renda/salário, contrato/matrícula/processo/protocolo/reserva, e endereços (número mascarado, rua preservada). |
| **D — Tests + docs** | E2E novo de InsightAI: 6 casos provando que tenant A nunca lê job/análise de B via HTTP real. Limpeza desta doc; histórico antigo arquivado em `archive/`. |

**Métricas finais:**
- 148 testes unit + integration verdes / 17 suites
- 19 testes E2E HTTP (ContactsController + InsightAiController)
- `tsc --noEmit -p src/` 100% limpo

## Sprint 2 — Migração de backends CRM + SAA (próxima)

A fundação multi-tenant está sólida. A próxima sprint absorve os
back-ends do CRM Imobiliário e do Smart Ad Automator (hoje em Supabase)
para módulos no `omniconnect-backend`, em padrão Strangler Fig.

### Fase 2.1 — Discovery (1 sprint)
- [ ] Mapear schema Supabase do CRM (`leads`, `pipeline_stages`,
      `deals`, `proposals`, `visits`, `units`, `loss_reasons`).
- [ ] Mapear schema Supabase do SAA (`ad_accounts`, `campaigns`,
      `ad_sets`, `ads`, `creatives`, `pixel_events`, OAuth tokens).
- [ ] Listar Supabase Edge Functions e Triggers em uso por cada app.
- [ ] Inventariar uso de Supabase Auth nos dois frontends.

### Fase 2.2 — CRM backend (`real-estate-crm` module)
- [ ] Prisma models multi-tenant para `Lead`, `Deal`, `Pipeline`,
      `PipelineStage`, `Proposal`, `Visit`, `RealEstateUnit`,
      `LossReason`. Skill: `add-prisma-model-multitenant`.
- [ ] Controllers + services com `tenantId` obrigatório no contrato.
- [ ] Importer one-shot do Supabase via `pg_dump` + ETL para o novo
      schema (com mapeamento `supabase_org_id → tenantId`).
- [ ] Endpoint bridge para receber webhook do CRM Imobiliário enquanto
      o frontend ainda fala com Supabase (strangler fig).

### Fase 2.3 — SAA backend (`smart-ad-automator` module) ✅ CONCLUÍDA

Detalhamento e shape final: ver `docs/migration/sprint-2-saa.md`.

| Bloco | Resumo |
|---|---|
| **A — Schema** | Novo enum `AdPlatform { meta, google_ads, tiktok_ads }` + 7 models tenant-scoped: `TenantInvitation`, `AdvertiserCompany`, `AdvertiserCompanyAccess`, `AdPlatformConnection` (tokens AES-256-GCM), `AdCampaignAIAnalysis`, `OrganicPostExperiment(+Variant)`. Migration única `20260518140000_sprint_2_saa_schema`. |
| **B — `ad-platform-connections`** | CRUD tenant-scoped com cifra ponta-a-ponta via `BridgeSecretCipher`. Listagem nunca devolve token nem hint. Endpoint `/:id/test` valida só o decrypt. Endpoint `getDecryptedAccessToken` é o único chokepoint de plaintext, usado exclusivamente pelos proxies. |
| **C — `advertiser-companies` + proxies** | CRUD + proxy `POST /:id/platforms/:platform/proxy`. Envelope por provider (Meta: token em query, Google: `Authorization: Bearer`, TikTok: `Access-Token`). Defesa SSRF: bloqueia URL absoluta / `..` / sem `/`. Audita cada chamada em `SystemEvent` (sem token, sem body). |
| **D — `ad-campaigns-ai`** | Análise IA sync + async (Bull). `jobId` determinístico `aca:sha256(...)`, `getJobStatus` 404 cross-tenant. PII redaction recursiva no `campaign`+`insights` antes de chamar OpenAI. `AIUsageLog` com `operationType='ad_campaign_analysis'` + `ModelPricing`. |
| **E — Token refresh job** | Bull repeatable a cada 1h (`AD_PLATFORM_TOKEN_REFRESH_INTERVAL_MS`, default 3600000). Refresh Meta (long-lived exchange), Google (refresh_token grant), TikTok (cycle access+refresh). Cifra os novos tokens via `BridgeSecretCipher`. Audit por tenant em `SystemEvent`. Pode ser desligado em dev com `AD_PLATFORM_TOKEN_REFRESH_DISABLED=1`. |
| **F — E2E + docs** | E2E HTTP `saa-tenant-isolation.e2e.spec.ts` (12 casos) provando que A não vê connections/companies/análises de B, recusa proxy cross-tenant e bloqueia URL absoluta. Esta doc + `sprint-2-saa.md`. |

**Métricas finais Sprint 2.3:** 216/216 tests / 23 suites — `tsc --noEmit -p tsconfig.build.json` limpo.

### Fase 2.4 — SAA frontend cutover ✅ CONCLUÍDA

Detalhamento completo: ver `docs/migration/sprint-2-4-saa-frontend.md`.

| Bloco | Resumo | Commit |
|---|---|---|
| **A — Tenant invitations** | Módulo `tenant-invitations` com CRUD admin (`POST/GET/DELETE`), hierarquia de roles (supervisor não pode dar admin), preview público (`GET by-token/:token`) e aceite em 3 cenários (autenticado / existente+password / novo+name+password). Token aparece **só** na resposta do `POST`. TTL configurável via `TENANT_INVITATION_TTL_HOURS` (default 168h). `OptionalJwtAuthGuard` para o aceite. | `34ce77a` |
| **B.1 — RefreshToken model** | Migration `20260519100000_sprint_2_4_refresh_tokens`: model `RefreshToken` com `tokenHash` único (sha256), `successorId` self-relation (rotation chain), `expiresAt/revokedAt`. | `fdbd5a5` |
| **B.2 — Refresh rotativo** | `RefreshTokenService` (issue/rotate/revoke/revokeAllForUser). `POST /auth/login` agora retorna `{ accessToken, user }` + seta cookie HttpOnly em `/auth/refresh`. Novos endpoints: `POST /auth/refresh` (reuse detection auditada como `AUTH_REFRESH_REUSE_DETECTED`), `POST /auth/logout`, `POST /auth/logout-all`. `cookie-parser` global. | `ba8039d` |
| **B.3 — Signup self-service** | `POST /auth/register` cria User + Tenant atomicamente. Gating por `AUTH_ALLOW_SIGNUP=true`. Argon2 hash, reserva de tenant `'platform'`, conflict 409 em email duplicado. | `965c2bb` |
| **B.4 — OAuth pickup** | Módulo `oauth/` com `GET /:platform/start` (autenticado) e `GET /:platform/callback` (público). State é JSON cifrado AES-256-GCM com TTL 5min (`{ tid, uid, aci, plat, n, exp, ru }`). Exchange server-side de Meta v22.0 / Google Ads (`oauth2/token`) / TikTok (`open_api/v1.3/oauth2/access_token/`). Tokens encriptados em `AdPlatformConnection`. Audit `AD_PLATFORM_OAUTH_STARTED/COMPLETED/FAILED`. | `7a8fe8a` |
| **C — `omniconnectClient`** | Cliente HTTP único do SAA. Access em memória, refresh em cookie HttpOnly. Auto-retry em 401 (com anti-loop para `/auth/refresh`), publish/subscribe para reatividade, `signIn/signUp/signOut/signOutAll/restoreSession`, `previewInvitation/acceptInvitation`, `startAdPlatformOAuth`. 10 testes Vitest. | `a1a251e` |
| **D — Auth cutover** | `useAuth.ts` consome `omniconnectClient` (subscribe + restoreSession). `useAgency.ts` deriva tenancy direto do JWT. `AdminLogin.tsx`, `AdminSignup.tsx` (+ campo `tenantName`) e `AcceptInvite.tsx` (cobre os 3 cenários) reescritos contra o cliente novo. `Header.tsx` ajustado para `user.name`. | `ee9f5a1` |
| **E — Platform config cutover** | `services/platformConfigService.ts` reescrito (CRUD via `/ad-platform-connections`, listagem via `/advertiser-companies`, OAuth via `connectViaOAuth`). `services/metaConfigService.ts` virou wrapper do proxy `/advertiser-companies/:id/platforms/meta/proxy` (`saveMetaConfig` agora throws deprecação). `Meta/GoogleAds/TikTokAdsConfigPanel.tsx` reescritos OAuth-first — sem mais campo de Access Token / App Secret no formulário. | `c2a7b59` |
| **F — E2E backend + docs** | `tenant-invitations.e2e.spec.ts` (21 tests: isolation, role hierarchy, preview sem token, accept idempotente, expiração, mismatch). `oauth-state.e2e.spec.ts` (11 tests com cifra real: cross-tenant smuggling, plat mismatch, state expirado, state malformado, provider `?error=`). `sprint-2-4-saa-frontend.md` + atualização do README de migração. | `158291f` |

**Métricas finais Sprint 2.4:**
- Backend: 295/295 tests / 28 suites (+32 testes vs 2.3)
- SAA frontend: 11/11 Vitest
- TSC SAA: 493 erros TS2786 pré-existentes (lucide-react/recharts vs React 19) — exatamente o baseline; `vite build` não bloqueia.

### Fase 2.5 — Cleanup (pós CRM)
- [ ] Remover Supabase do `crm-imobiliario` (depois da Sprint 3).
- [ ] SAA: já cortou Supabase em auth/invites/OAuth; falta auditar
      imports residuais de `@supabase/supabase-js` (analytics legacy).
- [ ] Promover `crm-imobiliario` e `smart-ad-automator` a jobs
      bloqueantes no CI (matriz `frontends-satellite` esvazia).
- [ ] Atualizar `docs/02-architecture.md` removendo referências a
      Supabase como dependência ativa.

## Decisões fechadas (Sprint 2.3 + 2.4)

- **OAuth token storage** — uso compartilhado de `BridgeSecretCipher`
  (AES-256-GCM, `BRIDGE_SECRET_KEY` único). Decifra-se via `decryptWith-
  LegacyFallback` em dev (warning) e estrito em produção.
- **Importador SAA** — `do_zero` (não importamos dados do Supabase).
  Produto novo, sem produção; o schema agora é o canônico.
- **`super_admin` de plataforma** — modelado como `UserTenant.role=admin`
  num tenant especial `'platform'`. Não houve necessidade de flag extra
  em `User`.
- **Chave OpenAI** — master do OmniConnect, custo cobrado via
  `AIUsageLog` (`operationType='ad_campaign_analysis'`).
- **JWT storage no frontend** — access token em memória + refresh token
  em cookie HttpOnly rotativo (`/auth/refresh`). XSS-safe; revogação
  imediata; reuse detection auditada.
- **OAuth redirect** — provider redireciona para o backend; backend faz
  o exchange e devolve o user ao frontend com `?platform=&status=&connectionId=`.
  Client secrets nunca tocam o navegador.
- **Convites** — token único hex(32) que aparece **apenas** na resposta
  do POST; TTL configurável via `TENANT_INVITATION_TTL_HOURS`. Accept
  cobre 3 cenários (autenticado, existing+password, novo+name+password).

## Sprint 3 — CRM Imobiliário backend cutover 🚧 PRÓXIMA

Pattern já consolidado pelas Sprints 2.3+2.4: backend NestJS multi-tenant
+ `omniconnectClient` no frontend, em strangler-fig. CRM tem um produto
mais maduro que o SAA (com dados reais de venda imobiliária), então a
sprint inclui ETL real do Supabase.

### Fase 3.0 — Discovery
- [ ] Mapear schema Supabase do CRM: `leads`, `pipeline_stages`,
      `deals`, `proposals`, `visits`, `units`, `loss_reasons`,
      `attachments`, `notes`, `agents/sellers`.
- [ ] Listar Edge Functions do CRM (`crm-imobiliario/supabase/functions`).
- [ ] Inventariar uso de Supabase Storage (uploads de proposals/units).
- [ ] Mapear RLS policies → contratos de autorização do
      `omniconnect-backend`.

### Fase 3.1 — CRM backend module
- [ ] Prisma models multi-tenant: `Lead`, `Pipeline`, `PipelineStage`,
      `Deal`, `Proposal`, `Visit`, `RealEstateUnit`, `LossReason`,
      `Agent` (skill `add-prisma-model-multitenant`).
- [ ] Controllers + services com tenant scope obrigatório, DTOs
      validados.
- [ ] Endpoint `/crm-bridge/events` para receber eventos do frontend
      enquanto Supabase ainda é fonte primária (strangler-fig).
- [ ] Mover uploads para storage neutro (S3-compatible / Supabase
      Storage com credentials no backend).

### Fase 3.2 — ETL Supabase → omniconnect
- [ ] Script Node + Prisma em `apps/omniconnect-backend/src/scripts/import-crm.ts`
      com mapeamento `supabase_org_id → tenantId`.
- [ ] Idempotente, transacional por tenant, com dry-run.
- [ ] Logs estruturados (winston) + relatório de divergências.

### Fase 3.3 — Frontend cutover
- [ ] Reutilizar `omniconnectClient` no `crm-imobiliario` (pode virar
      `packages/api-client` se for compartilhar).
- [ ] Reescrever services `leadsService`, `dealsService`, etc para a API
      nova.
- [ ] Remover Supabase Auth (login/signup/reset) → reusa
      `/auth/login + /auth/refresh + tenant-invitations`.
- [ ] Acabar com `@supabase/supabase-js` no app (lint rule depois para
      evitar regressão).

### Fase 3.4 — E2E + docs
- [ ] E2E HTTP de tenant isolation para Leads/Deals/Proposals.
- [ ] Sprint doc em `docs/migration/sprint-3-crm.md`.
- [ ] Atualizar `02-architecture.md` removendo Supabase como dep ativa
      do CRM.

## Roadmap longo (depois da Sprint 3)

1. **Sprint 4** — Bridges processors reais (consumir `IntegrationEvent`
   e propagar para `Lead`, `Deal`, `Campaign`). Hoje só persistimos +
   enfileiramos; o processor concreto ainda é stub.
2. **Sprint 5** — InsightAI v2: multi-provider (Anthropic, Gemini)
   plug-in, dashboard com filtros, custo agregado por tenant.
3. **Sprint 6** — Botify: revisar segurança, alinhar ao mesmo padrão
   de bridges + ApiKeys que CRM/SAA estão usando.
