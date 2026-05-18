# Sprint 2.3 — Smart Ad Automator (SAA) backend migration

> Migra o backend do Smart Ad Automator do Supabase para o
> `omniconnect-backend` (NestJS + Prisma + Bull), preservando o modelo
> mental do produto e os fluxos OAuth Meta / Google Ads / TikTok Ads,
> e impondo todos os invariantes multi-tenant e de segurança
> consolidados nas Sprints 1.1 → 1.3.

## Decisões travadas

| Tópico | Decisão | Razão |
|---|---|---|
| `agencies` (Supabase) | = `Tenant` 1:1, sem entidade `Agency` separada | Reaproveita o backbone tenant + UserTenant + JWT. |
| `agency_members` | = `UserTenant` (`role` ∈ `admin\|supervisor\|operator`) | Roles já existem. `owner` ↦ `admin`, `admin` ↦ `supervisor`, `operator` ↦ `operator`. |
| `super_admin` global | `UserTenant.role=admin` em tenant especial `'platform'` | Evita coluna nova em `User`; aproveita JwtStrategy + RolesGuard atuais. |
| Token storage | `BridgeSecretCipher` (AES-256-GCM, `BRIDGE_SECRET_KEY`) cifra `accessTokenEncrypted` + `refreshTokenEncrypted` | Mesmo cipher do bloco Bridges (Sprint 1.3); um único segredo de plataforma. |
| OpenAI key | Master do OmniConnect, custo cobrado via `AIUsageLog` (`operationType='ad_campaign_analysis'`) | Alinha com modelo "IA como custo variável". |
| Migração de dados | `do_zero` (não importamos do Supabase) | Produto novo, sem produção. |
| Nome de `companies` | `AdvertiserCompany` | Distingue do `Contact`/`Lead` do CRM. |

## Mapeamento Supabase → Prisma

| Supabase | Prisma |
|---|---|
| `agencies` | `Tenant` |
| `agency_members` | `UserTenant` |
| `agency_invitations` | `TenantInvitation` |
| `user_roles.super_admin` | `UserTenant.role=admin` no tenant `'platform'` |
| `companies` | `AdvertiserCompany` |
| `client_company_access` | `AdvertiserCompanyAccess` |
| `platform_configurations` + `meta_configurations` | `AdPlatformConnection` |
| `ai_campaign_analyses` | `AdCampaignAIAnalysis` (+ `AIUsageLog`) |
| `organic_post_experiments` (+ variants) | `OrganicPostExperiment(+Variant)` |
| `audit_logs` | reutiliza `SystemEvent` |

## Mapeamento Edge Functions → módulos NestJS

| Edge Function | Módulo |
|---|---|
| `meta-api-proxy` (save_config / get_config / test_connection / proxy / create_campaign / proxy_all_pages) | `ad-platform-connections/*` (config + test) + `advertiser-companies/ad-platform-proxy.service` (proxy real) |
| `google-ads-proxy`, `tiktok-ads-proxy` | mesmos endpoints com envelope provider-specific |
| `token-health-check` (cron Supabase) | `ad-platform-tokens/jobs/token-refresh.processor` + `TokenRefreshBootstrap` (Bull repeatable a cada 1h) |
| `ai-campaign-analysis` | `ad-campaigns-ai/ad-campaigns-ai.service` (sync) + `analyze-ad-campaign.processor` (async) |
| `creative-insights*`, `experiment-*-insights` | futuro — escopo de Sprint 3+ |
| `_shared/audit.ts` | `SystemEventsService.logEvent` |

## Endpoints introduzidos

Todos sob `JwtAuthGuard + RolesGuard`. `tenantId` resolvido de `req.user`,
nunca do body.

### `/ad-platform-connections`
- `POST` (admin, supervisor) — cria connection, encripta `accessToken` e
  `refreshToken` antes de persistir.
- `GET` (admin, supervisor, operator) — lista; tokens sempre mascarados.
- `GET /:id` (idem) — leitura única.
- `PATCH /:id` (admin, supervisor) — rotação de token / outros campos.
- `DELETE /:id` (admin).
- `POST /:id/test` (admin, supervisor) — valida só o decrypt
  (`BridgeSecretCipher.decryptWithLegacyFallback`).

### `/advertiser-companies`
- `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id` — CRUD comum.
- `POST /:id/platforms/:platform/proxy` (admin, supervisor, operator) —
  proxy outbound. Body:
  ```json
  { "endpoint": "/me/adaccounts", "method": "GET",
    "params": { "fields": "name,account_id" }, "body": {} }
  ```
  - Bloqueia URL absoluta, `..`, e endpoint sem `/` (SSRF).
  - Envelope:
    - Meta: `?access_token=...` na query, sem header de auth.
    - Google: `Authorization: Bearer <token>`.
    - TikTok: `Access-Token: <token>`.
  - Audita em `SystemEvent` com `{platform, advertiserCompanyId, endpoint,
    method, status, durationMs}`. Nunca registra token nem body.

### `/ad-campaigns-ai`
- `POST /analyze` (admin, supervisor) — sync. Recebe campanha + insights
  brutos no body; aplica `redactPII` recursivo em todo o JSON antes de
  chamar OpenAI; persiste `AdCampaignAIAnalysis`; grava `AIUsageLog`.
- `POST /analyze/async` — enfileira na queue `ad-campaigns-ai`. JobId
  determinístico `aca:sha256(tenantId|advertiserCompanyId|platform|
  campaignId|campaignName|hourBucket)`. Dedup real, nada de PII em
  cleartext.
- `GET /jobs/:jobId` — 404 cross-tenant ou job sem `tenantId` no payload.
- `GET /analyses` + `GET /analyses/:id` (admin, supervisor, operator).

## Token refresh (Bull repeatable)

`AdPlatformTokensService.scanAndRefresh()`:

1. `findMany` em `AdPlatformConnection` com `tokenExpiresAt <= now+7d`
   e `isActive=true`.
2. Para cada row, despacha por `platform`:
   - **Meta**: GET `graph.facebook.com/v22.0/oauth/access_token?
     grant_type=fb_exchange_token&client_id=...&client_secret=...&
     fb_exchange_token=<decrypted>`. Long-lived token sem necessidade
     de refresh_token separado.
   - **Google**: POST `oauth2.googleapis.com/token` form-encoded com
     `grant_type=refresh_token&refresh_token=<decrypted>&client_id=...&
     client_secret=...`.
   - **TikTok**: POST `business-api.tiktok.com/.../oauth2/refresh_token/`
     JSON com `{app_id, secret, refresh_token: <decrypted>}`. Cycla
     access + refresh token.
3. Atualiza `accessTokenEncrypted` (+ `refreshTokenEncrypted` no TikTok)
   via `BridgeSecretCipher.encrypt`. Atualiza `tokenExpiresAt`.
4. Audita em `SystemEvent`:
   - sucesso → `AD_PLATFORM_TOKEN_REFRESHED` / INFO
   - falha → `AD_PLATFORM_TOKEN_REFRESH_FAILED` / ERROR
   - past-TTL sem refresh_token → `AD_PLATFORM_TOKEN_EXPIRED` / WARNING
     e `isActive=false`.

`TokenRefreshBootstrap` registra um único repeatable `every: 3600000ms`
no `onModuleInit` (jobId fixo, idempotente entre boots).

Variáveis de ambiente:

| Env | Default | Função |
|---|---|---|
| `BRIDGE_SECRET_KEY` | (obrigatório em prod) | Chave AES-256-GCM. 32 bytes base64 ou 64 hex. |
| `META_APP_ID`, `META_APP_SECRET` | — | Refresh long-lived Meta. |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` | — | Refresh Google Ads. |
| `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET` | — | Refresh TikTok. |
| `OPENAI_API_KEY` | — | `ad-campaigns-ai` (master OC). |
| `OPENAI_AD_CAMPAIGN_MODEL` | `gpt-4o-mini` | Modelo para análise de campanha. |
| `AD_PLATFORM_TOKEN_REFRESH_INTERVAL_MS` | `3600000` (1h) | Intervalo do cron Bull. |
| `AD_PLATFORM_TOKEN_REFRESH_DISABLED` | unset | `=1` desliga o scheduler (dev/teste). |

## Multi-tenant invariants exercidos

| Cenário | Comportamento esperado | Garantia |
|---|---|---|
| Tenant A pede `GET /ad-platform-connections` | só vê suas connections; tokens mascarados | E2E `saa-tenant-isolation` |
| Tenant A pede `GET /ad-platform-connections/<conn-B>` | 404 | E2E |
| Tenant A faz `POST /:id/test` em conn de B | 404 | E2E |
| Tenant A faz proxy `POST /advertiser-companies/ac-b/platforms/meta/proxy` | 404 (company não pertence a A) | E2E |
| Endpoint proxy recebe URL absoluta | 400 | E2E |
| Job ad-campaign-ai com `tenantId` mismatch | 404 em `getJobStatus` | unit + E2E |
| JWT com `tenantId` smuggled (user 1 ↦ tenant B) | 401 em produção (Sprint 1.3 Bloco B) | E2E |

## Bull queues novas

| Queue | Job name | Trigger | Idempotência |
|---|---|---|---|
| `ad-campaigns-ai` | `analyze` | `POST /ad-campaigns-ai/analyze/async` | `jobId=aca:sha256(...)` (hour-bucket) |
| `ad-platform-tokens` | `scan-and-refresh` | repeatable a cada 1h | `jobId=ad-platform-token-refresh-cron` fixo |

## Testes desta sprint

| Suite | Arquivo | Casos |
|---|---|---|
| AdPlatformConnectionsService | `ad-platform-connections.service.spec.ts` | 15 |
| AdvertiserCompaniesService | `advertiser-companies.service.spec.ts` | 8 |
| AdPlatformProxyService | `ad-platform-proxy.service.spec.ts` | 11 |
| AdCampaignsAiService | `ad-campaigns-ai.service.spec.ts` | 14 |
| AdPlatformTokensService | `ad-platform-tokens.service.spec.ts` | 8 |
| SAA tenant isolation (E2E) | `test/saa-tenant-isolation.e2e.spec.ts` | 12 |
| **Total novo** | | **68** |

Suite final do backend: **216 testes / 23 suites** verdes.

## Pendências (Sprint 2.4+)

- **Frontend strangler fig**: criar `omniconnectClient` no
  `apps/smart-ad-automator/` com feature flag e substituir as chamadas
  `supabase.from(...)` por chamadas REST ao backend.
- **Migração de Auth**: substituir `supabase.auth.signIn` por
  `/auth/login` do backend (JWT). Testar fluxo `/accept-invite/:token`
  contra `TenantInvitation`.
- **OAuth pickup flow**: callback Meta / Google / TikTok ainda mora no
  frontend (Supabase). Migrar para `POST /ad-platform-connections` com
  o code → token grant feito server-side, cifrando antes de persistir.
- **`organic-experiments` module**: schema já existe; falta
  controller/service. Escopo recomendado: Sprint 3 junto com
  `creative-insights*`.
- **Endpoints administrativos** de `TenantInvitation` (POST/accept) —
  ficaram pendentes; só o model foi criado.
