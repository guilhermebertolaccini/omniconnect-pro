# Coolify Staging — runbook (Sprint Hub / PR 6)

Como deployar `omniconnect-pro` num servidor Coolify para validação real do
pilot ponta-a-ponta (PR 7 — Meta webhook em domínio público HTTPS).

> Esta doc é o **runbook operacional**. Decisões fixas estão em
> [ADR-0003](../adr/ADR-0003-hub-identity-and-roles.md),
> [ADR-0004](../adr/ADR-0004-hub-into-monorepo.md),
> `docs/04-security.md` e `docs/migration/pilot-flow-lead-to-recovery.md`.

---

## 1. Topologia alvo

```
┌─────────────────────────────────────────────────────────────────────┐
│ staging.omniconnectpro.<domain>                                     │
│                                                                     │
│  app.<…>      → omniconnect-hub          (TanStack Start)           │
│  api.<…>      → omniconnect-backend      (NestJS + Prisma)          │
│  omni.<…>     → omniconnect-frontend     (Vite SPA)                 │
│  crm.<…>      → crm-imobiliario          (Vite SPA)                 │
│  ads.<…>      → smart-ad-automator       (Vite SPA)                 │
│  botify.<…>   → botify                   (Vite SPA)                 │
│  botify-api.<…> → botify microservice    (Node, plugin WP)          │
│                                                                     │
│  Postgres + Redis  → Coolify managed services (mesma VPC)           │
└─────────────────────────────────────────────────────────────────────┘
```

Todos os apps moram **sob o mesmo parent domain** para que o refresh cookie
HttpOnly (`Domain=.staging.omniconnectpro.<domain>`) funcione cross-subdomain
sem trocas server-to-server.

## 2. Pré-requisitos

| Item | Origem |
|---|---|
| Coolify instalado e acessível | https://coolify.io |
| Domínio próprio com DNS gerenciável | registrar / Cloudflare |
| Wildcard ou registros A por subdomínio | DNS |
| Postgres 16+ | Coolify "Database" |
| Redis 7+ | Coolify "Database" |
| Git remote do `omniconnect-pro` configurado no Coolify | Source → GitHub/GitLab |

## 3. Secrets — gere antes de tudo

Cada comando produz um valor diferente. **Não reutilize entre ambientes.**

```bash
# JWT signing secret (≥32 chars)
openssl rand -hex 32

# AES-256-GCM master key (32 bytes base64) — webhook secrets + OAuth tokens at rest
openssl rand -base64 32

# Botify internal sync (mesma string nos dois lados — backend + microservice)
openssl rand -hex 32

# Postgres password
openssl rand -base64 24
```

Guarde em **Doppler / 1Password / Coolify env panel** — nunca em arquivos
versionados. `.env.staging.example` mostra as chaves; preencha o `.env.staging`
local equivalente apenas para o local mirror.

## 4. Local mirror (validar antes do Coolify)

Reproduz a topologia inteira num host só, útil para fechar Dockerfiles e
smoke do funil antes do staging real.

```bash
cd /path/to/omniconnect-pro
cp .env.staging.example .env.staging
# edite .env.staging com os secrets de teste (pode ser senha simples no local)

# Build + up
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build

# Logs
docker compose -f docker-compose.staging.yml logs -f omniconnect-backend
docker compose -f docker-compose.staging.yml logs -f omniconnect-hub

# Smokes
curl -s http://localhost:3000/health | jq .       # backend
curl -s -I http://localhost:4173/                  # hub (vite preview)
curl -s -I http://localhost:8080/healthz           # omni-frontend (nginx)

# Teardown (volumes preservados)
docker compose -f docker-compose.staging.yml down
```

> O hub é TanStack Start projetado para Cloudflare Workers em produção
> (ver `apps/omniconnect-hub/wrangler.jsonc`). O Dockerfile.hub usa
> `vite preview` — adequado para staging local; em prod Workers o caminho
> oficial é `wrangler deploy`. Documentar a decisão no PR 7+ se mantiver
> Coolify também em prod.

## 5. Coolify — passo a passo

### 5.1 Project + databases

1. Criar **Project** "omniconnect-staging".
2. Em **Resources → Databases**:
   - **Postgres 16** com `POSTGRES_DB=omniconnect`, user `omni`, senha gerada (§3).
   - **Redis 7** (sem auth ou com auth se a infra exigir).
3. Anotar as URLs internas (Coolify expõe DNS interno tipo `postgres-<id>:5432`).

### 5.2 Backend (`omniconnect-backend`)

1. **Resources → Application** → "From a Git Repository".
2. Repo: o monorepo `omniconnect-pro`. Branch: `main` ou `develop`.
3. **Build Pack**: Dockerfile.
4. **Dockerfile location**: `Dockerfile.backend`.
5. **Base Directory**: `/` (raiz — workspace-aware).
6. **Domain**: `https://api.staging.omniconnectpro.<domain>`.
7. **Port**: `3000`.
8. **Healthcheck**: `/health` (já dentro do Dockerfile).
9. **Env vars** (ver `.env.staging.example` para a lista completa) — destaque:
   - `DATABASE_URL` apontando para o Postgres do Coolify (rede interna).
   - `REDIS_HOST`/`REDIS_PORT` idem.
   - `JWT_SECRET`, `BRIDGE_SECRET_KEY`, `BOTIFY_INTERNAL_SYNC_SECRET` — secrets §3.
   - `CORS_ORIGINS` = todas as URLs HTTPS dos frontends.
   - `COOKIE_DOMAIN=.staging.omniconnectpro.<domain>`.
   - `COOKIE_SECURE=true` (HTTPS obrigatório).
   - `OPENAI_API_KEY` opcional — sem ele, InsightAI usa heurística.
   - `INSIGHT_AI_ON_BOTIFY_HANDOFF=true`.
   - `WHATSAPP_*` e `META_*` ficam vazios até a PR 7.
10. **Deploy**.
11. **Smoke após deploy**:
    ```bash
    curl -fsS https://api.staging.<...>/health | jq .
    # Esperado: status=ok, database=connected, botifyInternalSync.configured=true.
    ```
12. **Migrations**: o entrypoint (`docker-entrypoint.sh`) roda
    `prisma migrate deploy` automaticamente. Se quiser explicitar:
    ```bash
    # No Coolify "Execute Command on Application":
    pnpm --filter omniconnect-backend exec prisma migrate deploy
    ```

### 5.3 Hub (`omniconnect-hub`)

1. **Application** → Dockerfile.
2. **Dockerfile location**: `Dockerfile.hub`.
3. **Base Directory**: `/`.
4. **Domain**: `https://app.staging.omniconnectpro.<domain>`.
5. **Port**: `4173`.
6. **Build env** (`VITE_*` — baked no build, não em runtime):
   - `VITE_API_URL=https://api.staging.omniconnectpro.<domain>`
   - `VITE_USE_MOCK_AUTH=false`
   - `VITE_USE_MOCK_DATA=false`
   - `VITE_CRM_URL=https://crm.staging.omniconnectpro.<domain>`
   - `VITE_OMNIHUB_URL=https://omni.staging.omniconnectpro.<domain>`
   - `VITE_SAA_URL=https://ads.staging.omniconnectpro.<domain>`
   - `VITE_BOTIFY_URL=https://botify.staging.omniconnectpro.<domain>`
7. Deploy. Verificar `https://app.staging.<...>/` carrega tela de login Hub.

### 5.4 Frontends SPA (omniconnect-frontend, crm-imobiliario, smart-ad-automator, botify)

Para cada um:

1. **Application** → Dockerfile.
2. **Dockerfile location**: `Dockerfile.spa`.
3. **Base Directory**: `/`.
4. **Build args**: `APP=<nome-do-app>` (ex.: `crm-imobiliario`).
5. **Domain**: subdomain correspondente.
6. **Port**: `80`.
7. **Build env** (`VITE_API_URL`, etc.) conforme cada app.
8. Deploy.

### 5.5 Botify microservice (WordPress companion)

Não está no `docker-compose.staging.yml` raiz (vive sob
`apps/botify/wordpress-plugin/botflow-manager/microservice/`). Caminho:

1. **Application** com source root = `apps/botify/wordpress-plugin/botflow-manager/microservice`.
2. **Dockerfile**: o que já existe no plugin (`apps/botify/wordpress-plugin/Dockerfile`)
   ou crie um workspace-aware se ainda não houver.
3. **Domain**: `https://botify-api.staging.omniconnectpro.<domain>`.
4. **Env vars** críticos:
   - `OMNICONNECT_BACKEND_URL=https://api.staging.<...>`
   - `BOTIFY_INTERNAL_SYNC_SECRET=<mesmo valor do backend>`
   - `BOTIFY_FLOW_SOURCE=omniconnect` (ou `dual` durante transição — ADR-0002 G7).
   - `OMNICONNECT_BOTIFY_TENANT_ID=<UUID do tenant piloto>`
   - `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID=<UUID da IntegrationConnection bot>`
   - `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET=<plaintext do segredo cifrado>`
   - `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` (PR 7).
5. Webhook URL para a Meta (configurar no app Meta Developer):
   `https://botify-api.staging.<...>/webhooks/meta`.

## 6. Pós-deploy — verificação de aceite

```bash
# 1. Backend saudável + tenant-isolation
curl -fsS https://api.staging.<...>/health
# Esperado: status=ok, database=connected.

# 2. Hub carrega + redireciona não-autenticado para /login
curl -sI https://app.staging.<...>/

# 3. Cookie domain correto (após login real no browser)
# DevTools → Application → Cookies → ver Domain=.staging.<...>

# 4. Scripts de validação local agora apontam para staging
export OMNICONNECT_BACKEND_URL=https://api.staging.<...>
export OMNICONNECT_TENANT_ID=<uuid-piloto>
export OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET=<plaintext>
./scripts/botify-handoff-validation.sh    # Sprint 6 / Fase 2

# 5. Hub /executive carrega o Pilot Funnel card (PR 4)
# 6. Hub /insightai carrega dados reais (PR 5) — sem mock
```

A6 do piloto (`docs/migration/pilot-flow-lead-to-recovery.md` §7) está fechado
quando: backend deployado, hub login funcional, card "Pilot Funnel" no
`/executive`, dados não-zero após o smoke acima.

## 7. Backups & DR (mínimo viável para staging)

- **Postgres**: backup automático diário (Coolify oferece). Retenção 7 dias
  em staging é suficiente.
- **Redis**: dados são transitórios (filas BullMQ). Não exige backup; pode
  ficar com `appendonly yes` para reduzir perda em restart.
- **Uploads** (volume `backend-uploads`): não há dados produtivos em staging;
  pode ser limpo a qualquer hora.

Para produção (PR posterior ao PR 7): retenção 30+ dias, RPO/RTO
documentados conforme `docs/04-security.md` §Production checklist.

## 8. Rotação de secrets

Quando rotacionar:

| Trigger | Ação |
|---|---|
| Suspeita de comprometimento | Tudo: novos `JWT_SECRET`, `BRIDGE_SECRET_KEY`, `BOTIFY_INTERNAL_SYNC_SECRET`. |
| Fim de teste com vendor externo | `OPENAI_API_KEY`, Meta tokens. |
| Trimestral (boa prática) | `JWT_SECRET` (todos os refresh tokens são invalidados). |

`BRIDGE_SECRET_KEY` aceita rotação coordenada com o cipher versionado
(`v1.<iv>.<tag>.<ct>`) — ver `docs/04-security.md` §Webhook secret encrypted
at rest.

## 9. Troubleshooting comum

| Sintoma | Causa provável | Fix |
|---|---|---|
| `401 Unauthorized` no Hub após login OK | Cookie domain errado | `COOKIE_DOMAIN=.staging.<…>` (com ponto inicial) |
| `CORS error` no browser | `CORS_ORIGINS` desatualizado | Adicionar a URL do frontend exato |
| `prisma migrate deploy` falha no boot | `DATABASE_URL` incorreto / FK em conflito | Verificar URL interna e estado da DB |
| `BullMQ` workers não consomem | Redis inacessível ou senha errada | `REDIS_HOST`/`REDIS_PORT` apontando para serviço Coolify |
| Meta webhook 401 | `WHATSAPP_APP_SECRET` divergente | Sincronizar com o app Meta Developer |
| HTTPS / WSS fail no `/inteligencia` Socket.io | Coolify reverse proxy sem upgrade | Habilitar WebSocket no domínio |
| Token muito grande no cookie / parsing fail | App proxy strip-cookie | Verificar config Coolify Traefik |

## 10. O que NÃO fazer

- ❌ HTTP (não-TLS) com `COOKIE_SECURE=true` — cookies não são setados.
- ❌ Reutilizar `BRIDGE_SECRET_KEY` entre staging e produção.
- ❌ Setar `CORS_ORIGINS=*` mesmo em staging (vaza dev tokens em postMessage).
- ❌ Logar `WHATSAPP_ACCESS_TOKEN`, `OPENAI_API_KEY` ou secrets nos logs.
- ❌ Apontar mais de um app Meta Developer para o mesmo número (corrida de
  webhook entre staging/prod).
- ❌ Commitar `.env.staging`.

## 11. Próximos passos depois desta PR

- **PR 7** — Meta real validation:
  1. Criar app Meta Developer "OmniconnectPRO Staging".
  2. Configurar webhook → `botify-api.staging.<...>/webhooks/meta`.
  3. Subscrever WhatsApp message events.
  4. Conectar WABA / phone number ao tenant piloto.
  5. Rodar aceite A1–A8 do `pilot-flow-lead-to-recovery.md` §7.

## Ver também

- [ADR-0001](../adr/ADR-0001-botify-tenancy-model.md) — tenancy Botify
- [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md) — WordPress cutover
- [ADR-0003](../adr/ADR-0003-hub-identity-and-roles.md) — identidade do Hub
- [ADR-0004](../adr/ADR-0004-hub-into-monorepo.md) — Hub no monorepo
- `../04-security.md` — segredos e produção checklist
- `../migration/pilot-flow-lead-to-recovery.md` — aceite do piloto (A1–A8)
- `../migration/06-next-actions.md` — estado atual
