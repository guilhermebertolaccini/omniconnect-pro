# OmniconnectPRO

> Multi-tenant Growth Operations platform — omnichannel conversations, CRM, automation, AI analytics and executive dashboards.

## What is this

OmniconnectPRO unifies 4 products into one platform:

- **OmniConnect** — backend NestJS + frontend operacional (WhatsApp, conversas, campanhas)
- **Botify** — bot/triagem antes do humano
- **CRM Imobiliário** — pipeline de vendas, propostas, contratos
- **Smart Ad Automator** — gestão de campanhas pagas Google/Meta/TikTok

Camada nova: **InsightAI** — análise IA das conversas com score, intenção, objeção, próximo passo.

## Documentação

Comece por:

- **`AGENTS.md`** — instruções para agentes IA e devs novos no repo
- **`docs/01-product-vision.md`** — visão de produto
- **`docs/02-architecture.md`** — arquitetura
- **`docs/03-multitenancy.md`** — multi-tenant (não-negociável)
- **`docs/04-security.md`** — segurança
- **`docs/05-ai-governance.md`** — governança de IA
- **`docs/09-roadmap.md`** — roadmap em fases
- **`docs/migration/`** — plano de migração inicial (do `taticaofc`)

## Estrutura

```
omniconnect-pro/
├── apps/
│   ├── omniconnect-backend/      # NestJS (núcleo)
│   ├── omniconnect-frontend/     # React
│   ├── botify/                   # React
│   ├── crm-imobiliario/          # React + Supabase
│   └── smart-ad-automator/       # React + Supabase
├── packages/
│   ├── ai-contracts/
│   ├── shared-types/
│   └── tsconfig/
├── docs/                         # documentação viva
└── .cursor/                      # rules e skills (IA assistant)
```

## Stack

- **Linguagem**: TypeScript estrito
- **Backend**: NestJS 10 + Prisma 5 + Postgres + BullMQ/Bull (Redis) + argon2 + winston + prom-client + socket.io + @nestjs/swagger
- **Frontends**: Vite + React 19 (omniconnect-frontend) / React 18 (botify, crm-imobiliario, smart-ad-automator) + shadcn-ui + Tailwind + TanStack Query 5 + socket.io-client
- **Banco**: Postgres (principal) + Supabase (CRM/SAA — transição)
- **IA**: OpenAI (`gpt-4o-mini` default) + heurístico fallback
- **Monorepo**: pnpm workspaces

## Quick start (após migração inicial)

```bash
# 1. Clonar
git clone https://github.com/guilhermebertolaccini/omniconnect-pro.git
cd omniconnect-pro

# 2. Instalar (use pnpm 9; se não estiver globalmente: npx pnpm@9.12.0 install)
pnpm install
# O pacote omniconnect-backend roda postinstall: prisma generate usando prisma/generate.ci.env
# (stub de DATABASE_URL apenas para gerar o client; em dev use .env real em apps/omniconnect-backend)

# 3. Subir infra local
docker compose up -d

# 4. Env
cp apps/omniconnect-backend/.env.example apps/omniconnect-backend/.env
# editar valores (DATABASE_URL etc.)

# 5. Migrate (com DB de pé)
pnpm prisma:migrate

# 6. Build (raiz: gera Prisma client + build backend + frontend)
pnpm run build

# 7. Dev
pnpm dev:backend
pnpm dev:frontend
```

## Status

**Em construção** — atualmente na fase de migração inicial. Ver `docs/migration/06-next-actions.md` para o que está pendente.

## Contribuindo

Leia primeiro:
- `AGENTS.md`
- `docs/08-development-workflow.md`
- `.cursor/rules/50-commits.mdc`

Branches: `feature/<scope>-<name>`, `fix/<scope>-<name>`.

Commits: **Conventional Commits**.

PRs: usar checklist em `docs/08-development-workflow.md`.

## License

Privado — propriedade do projeto. Sem licença pública.
