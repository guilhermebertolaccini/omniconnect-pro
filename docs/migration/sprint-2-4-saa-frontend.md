# Sprint 2.4 — SAA frontend cutover (strangler fig)

> Migra o frontend do Smart Ad Automator do Supabase SDK para o
> `omniconnect-backend` da Sprint 2.3. Reescreve auth, convites, OAuth
> e camada de configuração de plataforma para falar diretamente com a
> nova API multi-tenant — sem feature flag, em substituição direta.

## Decisões travadas

| Tópico | Decisão | Razão |
|---|---|---|
| Storage do JWT | Access token em memória + refresh token rotativo em cookie HttpOnly (`/auth/refresh`) | XSS-safe; tokens curtos no front, controle de rotação no backend, revogação imediata possível. |
| Redirect do OAuth | Provider redireciona para o backend; backend faz o exchange e devolve o user ao frontend com `?platform=&status=&connectionId=` | Secrets nunca tocam o navegador. Compatível com Meta/Google/TikTok. |
| Feature flag | Sem flag — substituição direta | Produto ainda não tem prod ativa; flag adicionaria complexidade sem ganho. |
| Convites | Token expira por TTL configurável (`TENANT_INVITATION_TTL_HOURS`, default 168h) | Permite ajuste por ambiente sem deploy. |
| Pesquisa de empresa | `agencies`/`companies` do Supabase ↦ `AdvertiserCompany` (Sprint 2.3) | Mantém o modelo mental do produto sem termos legados confusos. |

## Estrutura entregue

### Backend

- `tenant-invitations` (novo módulo)
  - `POST /tenant-invitations` — admin/supervisor; respeita hierarquia (supervisor não pode dar admin) e gera token hex (32 bytes) que aparece **apenas nessa resposta**.
  - `GET /tenant-invitations` — lista do tenant atual; nunca devolve `token`.
  - `DELETE /tenant-invitations/:id` — revoga invite não aceito.
  - `GET /tenant-invitations/by-token/:token` — preview público (`OptionalJwtAuthGuard`).
  - `POST /tenant-invitations/by-token/:token/accept` — aceita em 3 cenários: usuário autenticado / usuário existente com password / usuário novo com name+password.
  - Auditoria: `TENANT_INVITATION_CREATED|ACCEPTED|REVOKED|REJECTED`.

- Refresh tokens
  - Modelo `RefreshToken` (tenantId, userId, tokenHash sha256, expiresAt, revokedAt, successorId).
  - `RefreshTokenService.issue/rotate/revoke/revokeAllForUser` — só persiste hash.
  - `POST /auth/login` agora retorna `{ accessToken, user }` e seta cookie HttpOnly em `/auth/refresh`.
  - `POST /auth/refresh` rotaciona o token (com reuse-detection auditada como `AUTH_REFRESH_REUSE_DETECTED`).
  - `POST /auth/logout` revoga só o cookie apresentado. `POST /auth/logout-all` revoga todos.
  - `POST /auth/register` — signup self-service (cria User+Tenant atomicamente). Habilitado por `AUTH_ALLOW_SIGNUP=true`.

- OAuth pickup server-side (`oauth/`)
  - `GET /oauth/:platform/start` autenticado → devolve `{ authorizeUrl, state, expiresAt }`. State é o JSON `{ tid, uid, aci, plat, n, exp, ru }` cifrado pelo `BridgeSecretCipher` (AES-256-GCM, TTL 5min).
  - `GET /oauth/:platform/callback` público: valida state (tenant + platform + expiração + company.tenantId), fecha o code-exchange server-side (Meta v22.0, Google Ads, TikTok Business API), cifra `accessToken`/`refreshToken`, faz upsert em `AdPlatformConnection`, e redireciona para `OAUTH_FRONTEND_REDIRECT_BASE` com `?platform=&status=&connectionId=`.
  - Auditoria: `AD_PLATFORM_OAUTH_STARTED|COMPLETED|FAILED`.

### Frontend (`apps/smart-ad-automator`)

- `lib/omniconnectClient.ts` — cliente HTTP único. Mantém access token em memória, faz auto-refresh em 401 com retry, expõe `signIn/signUp/signOut/signOutAll/restoreSession`, `previewInvitation/acceptInvitation`, `startAdPlatformOAuth`. Anti-loop ao chamar `/auth/refresh`.
- `hooks/useAuth.ts` — agora consome o cliente, com `subscribe()` para reatividade.
- `hooks/useAgency.ts` — deriva `tenantId/role` direto do JWT, sem `agency_members`.
- `pages/AdminLogin.tsx`, `pages/AdminSignup.tsx`, `pages/AcceptInvite.tsx` — reescritos contra o cliente novo. Signup pede `tenantName`; AcceptInvite cobre os 3 cenários do backend.
- `services/platformConfigService.ts` — agora bate em `/advertiser-companies` e `/ad-platform-connections`. Tokens nunca chegam em claro (`accessTokenHint` é o único hint). Conexão inicial obrigatoriamente via `connectViaOAuth(platform, advertiserCompanyId, returnUrl)`.
- `services/metaConfigService.ts` — virou wrapper do proxy `/advertiser-companies/:id/platforms/meta/proxy`. `saveMetaConfig` agora throws com mensagem deprecada (OAuth é o único path).
- `components/settings/MetaConfigPanel.tsx`, `GoogleAdsConfigPanel.tsx`, `TikTokAdsConfigPanel.tsx` — UI OAuth-first. Sem mais campo de access token / app secret no formulário.

### Migrações Prisma

- `20260519100000_sprint_2_4_refresh_tokens` — cria `RefreshToken` com unique em `tokenHash`/`successorId` e relação self (rotation chain).

## Como testar

```bash
# Backend
pnpm --filter omniconnect-backend exec prisma migrate dev
pnpm --filter omniconnect-backend test
# SAA frontend
pnpm --filter smart-ad-automator test
```

### Endpoints úteis

```bash
# Convidar
curl -X POST http://localhost:3000/tenant-invitations \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","role":"operator"}'

# Iniciar OAuth Meta
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "http://localhost:3000/oauth/meta/start?advertiserCompanyId=<id>&returnUrl=/settings"
```

## Pontos de atenção

- **Cookie HttpOnly em produção precisa de HTTPS.** O `RefreshTokenService` já força `secure: true` em prod; o frontend espera `credentials: 'include'`.
- **CORS:** `CORS_ORIGINS` precisa listar o domínio do SAA para o cookie ir/voltar.
- **Mismatch de email no accept:** quando o JWT do caller está logado em outra conta que não é o invitee, o backend devolve 401 e o frontend mostra o aviso `account mismatch`. UI permite logout + retry como anônimo.
- **Token hint:** o front exibe apenas os 4 últimos chars (`••••XXXX`). Não tente comparar tokens no cliente.
- **Erros pré-existentes TS2786 (React 19 vs lucide-react/recharts):** 493 erros no SAA — todos do baseline pré-Sprint 2.3, não causados por esta sprint. `vite build` não é bloqueado.

## Estado de testes

| Suíte | Resultado |
|---|---|
| `omniconnect-backend` (Jest, 28 arquivos) | 295 / 295 ✅ |
| `smart-ad-automator` (Vitest) | 11 / 11 ✅ |

Inclui E2Es novos:

- `src/test/tenant-invitations.e2e.spec.ts` — 21 testes cobrindo isolation, role hierarchy, preview público sem token, accept (3 cenários + idempotência + expiração + mismatch).
- `src/test/oauth-state.e2e.spec.ts` — 11 testes cobrindo /start sem JWT, cross-tenant smuggling, callback com state expirado / plataforma mismatched / company de outro tenant / state malformado / provider error, e gravação cifrada da connection.

## Próximos passos

1. **Cutover CRM** (Sprint 3) — replicar o pattern: backend NestJS + omniconnectClient, depois frontend.
2. **Webhooks LGPD / consent log** quando entrar no roadmap.
3. **Login social** opcional: o `omniconnectClient` já tem espaço para um `/auth/oauth/start` se for usar SSO de operadores.
