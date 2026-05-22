# Stacks locais — convenção e fluxo

O dia-a-dia "Mix dos dois" mantém **duas stacks Docker** rodando em paralelo
no laptop. Esta doc é o **mapa de portas + regra de operação** pra você não
errar qual backend / DB está sendo usado.

> Decisão: manter ambas. Justificativa em `06-next-actions.md` (Sprint Hub).
> Não unificar bancos — `omniconnect` (dev) e `omniconnect_staging` (mirror)
> ficam separados de propósito.

---

## Mapa de portas (memorize ou cole na parede)

| Camada | DEV (host + docker-compose.yml) | STAGING-MIRROR (docker-compose.staging.yml) |
|---|---|---|
| **Postgres** | `localhost:5432` (db `omniconnect`, user `dev`) | `localhost:15432` (db `omniconnect_staging`, user `omni`) |
| **Redis** | `localhost:6379` | `localhost:16379` |
| **Backend** | `localhost:3000` (`pnpm dev:backend`, no host, hot reload) | `localhost:13000` (Docker, imagem buildada, sem hot reload) |
| **Hub** | `localhost:8083` (`pnpm dev:hub`, no host, vite dev) | `localhost:14173` (Docker, vite dev dentro do container) |
| SAA frontend | `localhost:5175` (host vite) | `localhost:18082` (Docker nginx) |
| CRM frontend | `localhost:5174` (host vite) | `localhost:18081` (Docker nginx) |
| OmniConnect frontend | `localhost:5173` (host vite) | `localhost:18080` (Docker nginx) |
| Botify frontend | `localhost:5176` (host vite) | `localhost:18083` (Docker nginx) |

Regra mnemónica: **staging-mirror = DEV port + 10000** (com algumas exceções como o Hub).

## Containers que cada stack sobe

```
docker compose up -d                           # DEV — só infra
└─ omniconnect-pro-postgres
└─ omniconnect-pro-redis

docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
                                               # STAGING — infra + apps
├─ omni-staging-postgres
├─ omni-staging-redis
├─ omni-staging-backend
├─ omni-staging-hub
└─ omni-staging-{omniconnect-frontend|crm-imobiliario|smart-ad-automator|botify}
```

## Quando usar qual

| Tarefa | Use |
|---|---|
| Editar componente React, ver hot reload no browser | **DEV** + `./scripts/hub-aim-dev.sh` |
| Editar service Nest + breakpoint debugger | **DEV** + `pnpm dev:backend` |
| Confirmar que um Dockerfile builda sem quebrar | **STAGING-MIRROR** + `docker compose -f docker-compose.staging.yml build` |
| Validar o `prisma migrate deploy` no entrypoint do container | **STAGING-MIRROR** + restart do `omni-staging-backend` |
| Validar a cadeia auth/CORS/cookies sob HTTP localhost | qualquer das duas — mas o staging força mais pegadinhas (cookie `Secure`, etc.) |
| Smoke `botify-handoff-validation.sh` | qualquer das duas — o script lê `apps/omniconnect-backend/.env` (que aponta pro DEV); pra rodar contra staging, override `OMNICONNECT_BACKEND_URL=http://localhost:13000` |
| Validação Meta real (PR 7-exec) | **nenhuma** — precisa de HTTPS público (Coolify), ver `coolify-staging.md` |

## Os scripts utilitários

Todos em `scripts/` e devem rodar da raiz do repo.

| Script | O que faz |
|---|---|
| `./scripts/which-stack.sh` | Read-only. Mostra portas em uso, containers up, `.env.local` do Hub. Rode **sempre** que sentar na máquina depois de pausa. |
| `./scripts/hub-aim-dev.sh` | Reescreve `apps/omniconnect-hub/.env.local` apontando Vite → backend DEV (`:3000`). |
| `./scripts/hub-aim-staging.sh` | Reescreve `apps/omniconnect-hub/.env.local` apontando Vite → backend STAGING (`:13000`). |
| `./scripts/apply-migrations.sh` | `prisma migrate deploy` nos dois bancos (dev + staging). Pode receber `dev` ou `staging` como argumento pra só um. |

Depois de `hub-aim-*.sh`, **mate e religue o vite dev**. Vite só relê
`.env.local` no startup — HMR não cobre env.

## Fluxos típicos

### Manhã — descobrir o que ficou rodando da noite

```bash
./scripts/which-stack.sh
```

Olha o output e decide:
- Tudo down → escolhe a stack do dia.
- Só DEV up → continua codando.
- Só STAGING up → pode ir direto pro browser em `localhost:14173` (Hub dentro do Docker), sem precisar de vite dev no host.
- As duas up → ok também, mas confira `.env.local` pra saber qual o Hub host (porta 8083) tá apontando.

### Mudei schema Prisma → preciso aplicar nos dois

```bash
# Cria migration de dev normalmente
pnpm --filter omniconnect-backend exec prisma migrate dev --name <nome>

# Aplica nos dois
./scripts/apply-migrations.sh
```

### Trocar do Hub-staging pro Hub-dev no meio do dia

```bash
# Mate o vite dev (Ctrl+C ou kill <PID do which-stack.sh>)
./scripts/hub-aim-dev.sh
pnpm --filter omniconnect-hub run dev
```

### Limpar tudo

```bash
# DEV
docker compose down                                                   # mantém volumes
docker compose down -v                                                # nuke volumes

# STAGING
docker compose --env-file .env.staging -f docker-compose.staging.yml down
docker compose --env-file .env.staging -f docker-compose.staging.yml down -v
```

## Anti-pegadinhas

1. **Nunca rode dois backends ao mesmo tempo no mesmo banco.** Ambos tentam `prisma migrate deploy` no boot e brigam por locks. Confirme com `which-stack.sh` qual backend está up antes de subir outro.

2. **Cookies não cruzam entre `localhost` e `127.0.0.1`.** Browsers tratam como origens diferentes. Use sempre `localhost:*` no browser pra ambas as stacks.

3. **`localhost:3000/auth/login` no browser → 404.** É POST-only. Use curl pra inspecionar:
   ```bash
   curl -sS -X POST http://localhost:3000/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"...","password":"..."}'
   ```

4. **Usuários do seed só existem no banco onde o seed rodou.** O entrypoint do staging só roda seed se `User.count = 0`. Se você fez `/auth/register` antes, o seed pula. Pra forçar:
   ```bash
   docker exec -e DATABASE_URL='postgresql://omni:local-staging-pw@postgres:5432/omniconnect_staging?schema=public' \
     omni-staging-backend npx tsx prisma/seed.ts
   ```

5. **Memberships com `tenantId='default-tenant'` falham em produção.** O `JwtStrategy` em `NODE_ENV=production` rejeita esse valor explícito. Se você seedou e os logins dão 401 depois, é provavelmente isso — repointe para um tenant real via SQL.

6. **`.env.local` é gerado pelos scripts.** Não edite à mão; o próximo `hub-aim-*.sh` sobrescreve. Se precisar de override pessoal, suba `.env.local.personal` (não vai pro Vite — não tem precedência).

7. **Migrações destrutivas no banco DEV não afetam staging (e vice-versa).** Bom: experimentos isolados. Ruim: o que funciona no dev pode quebrar no staging se você esquecer de re-rodar `apply-migrations.sh`.

## Quando esta dualidade vai morrer

Quando a PR 7-exec rodar (Meta + Coolify), o staging real (HTTPS público) substitui o staging-mirror local. Aí pode-se decidir:

- Manter staging-mirror pra debug Docker offline → fica a dualidade.
- Aposentar staging-mirror, validações de Dockerfile passam direto pro CI/Coolify staging → cai pra 1 stack local.

Decisão fica pra depois da PR 7-exec — não vale renegociar isso agora.

## Ver também

- `coolify-staging.md` — packaging Coolify (mesmo Dockerfiles)
- `meta-staging-setup.md` — PR 7-prep, validação real Meta
- `../adr/ADR-0003-hub-identity-and-roles.md` — origem do `VITE_USE_MOCK_AUTH`
- `../adr/ADR-0004-hub-into-monorepo.md` — Hub no monorepo
- `../migration/06-next-actions.md` — estado da Sprint Hub
