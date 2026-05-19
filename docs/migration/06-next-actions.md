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
| CRM backend (Sprint 3) — schema + domain + signatures + storage + pdf-parser + realtime | ✅ |
| CRM frontend (Sprint 3.1) — auth + contexts + storage/parser + cleanup Supabase | ✅ |
| CRM hardening (Sprint 3.2) — timelines + document audit via backend | ✅ |
| InsightAI Sprint 5 — dashboard + custo multi-provider | ✅ |
| Bridge processors (Sprint 4) — handlers + emitters + `IntegrationEntityLink` | ✅ |
| Botify — paridade CRM/SAA (ver plano Sprint 6) + **cutover WP** (ADR-0002) | 🟡 Em andamento ([`sprint-6-botify-maturity-plan.md`](./sprint-6-botify-maturity-plan.md), [`ADR-0002`](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md)) |

## Próximo foco — Botify (maturidade) + Sprint 6 operacional

**Plano detalhado:** [`docs/migration/sprint-6-botify-maturity-plan.md`](./sprint-6-botify-maturity-plan.md) — integração Omni, contrato de handoff, motor de fluxo, CI, tenancy, triagem rica e **Fase G (cutover WordPress → Nest/Prisma)**.

**Decisão arquitetural:** [`docs/adr/ADR-0002-botify-wordpress-to-backend-cutover.md`](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md) (**Proposed**) — eliminar WP como fonte de verdade dos fluxos; Strangler Fig com fases G0–G7.

Sprint 5 (InsightAI v2) está **concluída** — ver `docs/migration/sprint-5-insight-ai-v2.md`
(`GET /insight-ai/dashboard/summary`, `GET /insight-ai/dashboard/usage`, `GET /insight-ai/analyses`,
UI `/inteligencia` no `omniconnect-frontend`).

**Piloto de produto (jornada ponta a ponta):** definir e validar o fluxo referência em [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md) (aceite binário, telas, seeds, runbook).

O roadmap macro aponta **Fase 3 — Botify Triage** em `docs/09-roadmap.md`; o plano Sprint 6 acima decompõe em entregas incrementais.

**Resumo Sprint 5 (InsightAI v2) — concluída:**

| Bloco | Resumo |
| --- | --- |
| **1** ✅ | Contrato `InsightAiLlmProvider` + `OpenAiInsightProvider`; env `INSIGHT_AI_DEFAULT_PROVIDER`. |
| **2** ✅ | Anthropic + Gemini (`google`); resolver; flags disable; `ModelPricing` + migration. |
| **3** ✅ | Dashboard: filtros de período/segmento, `AIUsageLog` agregado por provedor; UI Inteligência. |
| **4** ✅ | Docs de governança, padrões de API, runbook (`DEPLOYMENT.md`) com envs. |

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

## Sprint 3 — CRM Imobiliário backend cutover ✅ CONCLUÍDA

Detalhamento completo: ver `docs/migration/sprint-3-crm.md`.

Pattern consolidado pelas Sprints 2.3+2.4 aplicado de novo: backend
NestJS multi-tenant + Socket.io realtime + storage local + AI parser.
Decisão `do_zero` (sem ETL) — produto novo no schema canônico.

| Bloco | Resumo | Commit |
|---|---|---|
| **A — Schema** | Novo `Role.broker` + 12 enums CRM + 18 models (`CrmProperty`, `CrmUnit`, `CrmCommissionConfig`, `CrmClient`, `CrmLead`, `CrmInteraction`, `CrmFollowUp`, `CrmProposal(+Event)`, `CrmContract(+Event)`, `CrmSignature`, `CrmPayment`, `CrmCommission`, `CrmDocumentVersion`, `CrmDocumentAccessLog`, `CrmChangeHistory`, `CrmNotificationPreference`). Migration `20260520000000_sprint_3_crm_schema` inclui trigger PL/pgSQL `crm_generate_financials_on_signed` (gera CrmPayment + CrmCommission idempotentemente quando `CrmContract.status` muda para `signed`). | `d7dd035` |
| **B — Domain modules** | `crm/properties`, `crm/units`, `crm/clients` (PII masking obrigatória em `findAll`), `crm/leads` (+ interactions + follow-ups), `crm/proposals` (state-machine + auto-reservation da unit), `crm/contracts` (state-machine + signed-immutability), `crm/financial` (payments + commissions read-only via API; criação só pelo trigger). Broker scope em todos os flows (`brokerId === actor.id`). | `adc3809` |
| **C — Signatures** | `crm-signatures/` com Clicksign client + 2 controllers (autenticado para envelope create/list; público para webhook HMAC). HMAC-SHA256 timing-safe contra `IntegrationConnection.webhookSecretEncrypted`. Tenant resolution via `CrmContract.externalEnvelopeId`. Webhook `sign`/`refuse`/`close` aciona `CrmContractsService.markSignedInternal` que dispara o trigger SQL. | `586e793` |
| **D — Storage + PDF parser** | `crm-storage/` (multer memory + filesystem em `{CRM_STORAGE_ROOT}/crm/{tenantId}/{kind}/{fileId}`, anti path-traversal, audit em `CrmDocumentAccessLog`). `crm-pdf-parser/` consome texto extraído pelo frontend (pdf.js), envia ao OpenAI (`gpt-4o-mini`, `temperature=0`, JSON mode), loga `AIUsageLog` com `operationType='crm_pdf_parse'`. | `c0042b7` |
| **E — Realtime Socket.io** | `CrmGateway` em namespace `/crm`. JWT no handshake; rooms `crm:{tenantId}` + `crm:{tenantId}:broker:{userId}`. Eventos: `crm.proposal.transitioned`, `crm.contract.transitioned`, `crm.contract.signed`, `crm.payment.created`, `crm.commission.created` (+ `.self` para broker), `crm.signature.updated`. `CrmRealtimeService` desacopla services do gateway. | `9c99a9c` |
| **F — Tenant isolation specs + docs** | `crm-clients.service.spec.ts` (6 — PII masking + tenant/broker isolation), `crm-contracts.service.spec.ts` (7 — cross-tenant 404, broker scope, signed-immutability, emissão realtime após trigger). `sprint-3-crm.md`. | _este commit_ |

**Métricas finais Sprint 3:**
- Backend: 351/351 tests / 37 suites (+56 testes vs 2.4)
- `tsc --noEmit -p tsconfig.build.json` limpo

**Não-objetivos da Sprint 3:**
- Frontend do CRM (`apps/crm-imobiliario`) NÃO foi alterado — será Sprint 3.x ou 4.
- ETL Supabase → Postgres: não fazemos (decisão `do_zero`).
- S3/object storage: storage local local até o volume exigir.

## Sprint 3.1 — CRM frontend cutover ✅ CONCLUÍDA

Detalhamento completo: ver `docs/migration/sprint-3-1-crm-frontend.md`.

| Bloco | Resumo |
|---|---|
| **A — Auth** | `crm-imobiliario` passou a usar `omniconnectClient` com access token em memória + refresh cookie. `AuthContext`, login, signup e reset fallback sem Supabase. |
| **B — Properties/Units/Clients** | Contexts migrados para `/crm/properties`, `/crm/units`, `/crm/clients`; mapeamento centralizado em `src/lib/api/crm.ts`. |
| **C — CRM domain** | Leads/interactions/follow-ups, proposals, contracts, payments/commissions e commission config migrados para `/crm/*`; state machines usam `transition`. |
| **D — Storage/parser/realtime** | Upload PDF via `/crm/storage/upload`; parser via `/crm/pdf-parser`; realtime `/crm` via WebSocket Socket.io minimal client; document audit temporário local quando não há list endpoint. |
| **E — Cleanup** | Removidos imports, package deps e artefatos Supabase/Lovable (`supabase/`, `bun.lock`, `integrations/*`). |
| **F — Smoke** | `vite build` verde e Vitest `9/9` verde. `tsc --noEmit` ainda esbarra no baseline de tipos `lucide-react`/React, como no SAA. |

**Pendências conscientes pós-cutover:**
- Melhorar extração de texto PDF com `pdf.js`; hoje o cutover usa `File.text()` como fallback sem dependência.
- Tornar frontend CRM job bloqueante no CI quando os smoke tests forem ampliados.

## Sprint 3.2 — CRM frontend hardening ✅ CONCLUÍDA

Detalhamento completo: ver `docs/migration/sprint-3-2-crm-hardening.md`.

| Bloco | Resumo |
|---|---|
| **A — Document audit API** | `crm-storage` ganhou `GET /crm/storage/documents/:parentType/:parentId/versions` e `/access-logs`, ambos com `JwtAuthGuard`, tenant scope e broker scope via parent validation. |
| **B — Timeline API** | `crm/proposals/:id/events` e `crm/contracts/:id/events` listam eventos após validar acesso ao parent. Updates de `pdfUrl` agora registram evento `pdf_attached`/`pdf_removed`. |
| **C — Frontend cleanup** | `documentVersions.ts`, `ProposalDetail` e `ContractDetail` consomem os endpoints backend; removidos fallbacks locais em `localStorage` para documentos/timelines. |
| **D — Specs** | Specs focadas em tenant/broker scope e eventos PDF: `crm-storage`, `crm-proposals`, `crm-contracts`. |

**Métricas Sprint 3.2:**
- Backend specs afetadas: 26/26 verdes
- Backend `tsc --noEmit -p tsconfig.build.json`: limpo
- CRM frontend `vite build`: verde

## Roadmap longo (depois da Sprint 3.2)

1. **Sprint 4** — Bridges processors reais, fechada em
   `docs/migration/sprint-4-bridge-processors.md` (inclui
   `@omniconnect/api-client`, smoke emit→`CrmLead`, doc operacional de
   `IntegrationConnection`).
2. **Sprint 5** — InsightAI v2: multi-provider (Anthropic, Gemini)
   plug-in, dashboard com filtros, custo agregado por tenant.
3. **Sprint 6** — Botify: revisar segurança, alinhar ao mesmo padrão
   de bridges + ApiKeys que CRM/SAA estão usando.
