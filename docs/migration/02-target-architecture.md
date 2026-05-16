# 02 — Arquitetura-alvo do `omniconnect-pro`

## Visão geral

`omniconnect-pro` é um **monorepo TypeScript** que abriga:

- 1 backend NestJS+Prisma+Postgres (núcleo operacional + InsightAI)
- 3 frontends Vite+React+shadcn (OmniConnect, Botify, CRM, SAA — quatro frontends contando o atual)
- N pacotes compartilhados (`ai-contracts`, `shared-types`, `ui`, etc.)
- Funções Supabase (enquanto CRM e SAA não forem migrados para o backend NestJS)

## Estrutura de pastas proposta

```
omniconnect-pro/
├── apps/
│   ├── omniconnect-backend/          # NestJS (ex-taticaofc/backend)
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── conversations/
│   │   │   ├── insight-ai/           # NOVO — vindo do patch
│   │   │   ├── ...                   # 35+ módulos existentes
│   │   │   └── app.module.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # +1 model ConversationAIAnalysis
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   ├── omniconnect-frontend/         # Frontend operacional (ex-taticaofc/frontend)
│   │
│   ├── botify/                       # apps/botify (Vite+React)
│   │   ├── src/
│   │   ├── wordpress-plugin/         # mantido como hoje
│   │   └── package.json
│   │
│   ├── crm-imobiliario/              # Vite+React+Supabase
│   │   ├── src/
│   │   ├── supabase/
│   │   │   ├── config.toml
│   │   │   ├── functions/
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   └── smart-ad-automator/           # Vite+React+Supabase
│       ├── src/
│       ├── supabase/
│       └── package.json
│
├── packages/
│   ├── ai-contracts/                 # Tipos do InsightAI (LeadIntent, ConversationAIResult)
│   │   ├── src/index.ts
│   │   └── package.json
│   │
│   ├── shared-types/                 # DTOs comuns entre OmniConnect ↔ CRM ↔ SAA
│   │   ├── src/index.ts
│   │   └── package.json
│   │
│   ├── ui/                           # Componentes shadcn reutilizáveis
│   │   ├── src/                      # button, dialog, form, etc.
│   │   └── package.json
│   │
│   ├── eslint-config/                # ESLint base compartilhado
│   ├── tsconfig/                     # tsconfig base
│   └── api-client/                   # SDK TypeScript para o backend OmniConnect
│
├── docs/
│   ├── migration/                    # Esta pasta, movida do taticaofc
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   └── adr/                          # Architecture Decision Records
│
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       ├── frontend-ci.yml
│       └── deploy.yml
│
├── .cursor/
│   ├── rules/                        # Rules globais do agente Cursor
│   └── skills/                       # Skills do agente Cursor
│
├── docker-compose.yml                # Postgres + Redis para dev local
├── package.json                      # workspace root
├── pnpm-workspace.yaml               # ou outro gerenciador
├── turbo.json                        # opcional
├── .editorconfig
├── .gitignore
├── .env.example
├── AGENTS.md                         # rules legíveis pelo Cursor
└── README.md
```

## Decisões de stack & tooling

### Gerenciador de pacotes
**Proposta:** `pnpm@9` (a confirmar — pode ser bun, dado que 3 dos 4 projetos já usam `bun.lockb`).

**Razões pró pnpm:**
- Padrão de fato em monorepo TS
- Resolução de deps determinística
- Suporte nativo a workspaces sem ferramenta extra
- Cache global eficiente

**Razões pró bun:**
- Os 3 frontends (Botify, CRM, SAA) já vêm com `bun.lockb`
- Velocidade de instalação 10x

**Razões pró npm workspaces:**
- O backend `taticaofc` usa `npm` (`package-lock.json`)
- Zero ferramenta extra para instalar

### Orquestrador de build
**Proposta:** **começar sem orquestrador**, usar `pnpm -r run build`. Adicionar Turborepo (ou Nx) quando:
- Tivermos 3+ apps ativos
- Build total começar a passar de 1 minuto
- Quisermos cache remoto

### TypeScript
- TS 5.x estrito em todos os projetos
- `tsconfig` base no `packages/tsconfig/base.json`, cada app/pacote estende com overrides locais

### Lint & format
- ESLint 9 (flat config) — base no `packages/eslint-config/`
- Prettier para format
- Husky + lint-staged no pré-commit (a discutir)

### Testes
- **Backend = Jest** (já configurado em `taticaofc/backend`, manter)
- **Frontends = Vitest** (já adotado pelos 4 frontends)
- Playwright para E2E (CRM já tem; replicar nos demais frontends)
- Supertest para integração NestJS (vem com `@nestjs/testing`, já disponível)

### CI/CD
GitHub Actions:
- `backend-ci.yml`: lint + test + build do `apps/omniconnect-backend`
- `frontend-ci.yml`: lint + test + build de cada `apps/<frontend>`
- `deploy.yml`: a definir (Coolify? Vercel? Render? Railway?)

Botify já tem `DEPLOYMENT-COOLIFY.md`, então provavelmente Coolify é uma referência válida.

## Diagrama de integração entre os apps

```
                          ┌─────────────────────────────────┐
                          │      apps/omniconnect-backend   │
                          │      (NestJS + Postgres + Bull) │
                          │                                 │
                          │  - Conversations                │
                          │  - Campaigns                    │
                          │  - WhatsApp Cloud               │
                          │  - InsightAI ◄────────┐         │
                          │  - Webhooks API       │         │
                          └────────┬────────────────────────┘
                                   │                │
                  REST/WS          │ produz         │ consome
              ┌────────┬───────────┘ análises       │ msgs
              │        │                            │
              ▼        ▼                            │
  ┌───────────────┐  ┌──────────────────────┐       │
  │ omniconnect-  │  │  crm-imobiliario     │       │
  │ frontend      │  │  (Vite+React+        │       │
  │ (operação,    │  │   Supabase)          │       │
  │  atendentes)  │  │  - Aba              │       │
  │               │  │   "Inteligência     │       │
  └───────────────┘  │    Comercial"       │       │
                     │  - Score, intent,   │       │
                     │   objection,        │       │
                     │   next action       │       │
                     └──────────────────────┘
                              ▲
                              │ score/intent/objection
                              │
              ┌───────────────┴─────────────────┐
              │                                 │
   ┌──────────────────┐              ┌──────────────────────┐
   │     botify       │              │ smart-ad-automator   │
   │  (triagem/bot,   │              │  (campanhas pagas    │
   │   handoff p/     │   ──leads──► │   Google/Meta/TikTok │
   │   humano)        │              │   + análise IA)      │
   └────────┬─────────┘              └──────────────────────┘
            │
            └── handoff ──► omniconnect-backend (Conversation)
```

### Contratos-chave (vão para `packages/ai-contracts` e `packages/shared-types`)

```typescript
// packages/ai-contracts/src/index.ts
export type LeadIntent =
  | 'curioso' | 'frio' | 'pesquisa' | 'qualificado'
  | 'quente' | 'pronto_para_visita' | 'pronto_para_proposta' | 'indefinido';

export type OpportunityStatus =
  | 'ativa' | 'em_risco' | 'perdida'
  | 'pronta_para_retomada' | 'sem_oportunidade_clara';

export type ConversationRisk = 'baixo' | 'medio' | 'alto' | 'critico';

export interface ConversationAIResult {
  summary: string;
  leadIntent: LeadIntent;
  opportunityStatus: OpportunityStatus;
  risk: ConversationRisk;
  // ... (espelho exato do model ConversationAIAnalysis)
}

// packages/shared-types/src/lead-bridge.ts
export interface LeadFromOmniConnect {
  contactPhone: string;
  contactName?: string;
  source: 'whatsapp' | 'meta_ads' | 'google_ads' | 'tiktok_ads' | 'organic';
  campaignId?: string;
  aiAnalysis?: ConversationAIResult;  // do InsightAI
  firstContactAt: string;
  // ...
}
```

A ideia é que **todos os apps importem desses pacotes**, evitando drift entre backend NestJS e os 3 frontends.

## Ambiente local de desenvolvimento

`docker-compose.yml` na raiz:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: omniconnect
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
    volumes: [postgres-data:/var/lib/postgresql/data]
  
  redis:
    image: redis:7
    ports: ["6379:6379"]
  
  # Supabase local para CRM/SAA (opcional, podem usar cloud)
  # supabase-db:
  #   image: supabase/postgres:15.x
  #   ...

volumes:
  postgres-data:
```

## Sobre o backend Supabase do CRM e SAA

Hoje, CRM e Smart Ad Automator usam **Supabase como backend**. O OmniConnect usa **Postgres+NestJS próprio**. Isso cria dois mundos.

### Estratégia recomendada (Opção C híbrida)

**Curto prazo (próximos 1-2 trimestres):**
- Manter Supabase como está nos dois apps
- OmniConnect expõe endpoints REST com os dados de InsightAI
- CRM e SAA consomem via `fetch`/`tanstack-query` direto do navegador
- Auth: token JWT compartilhado (pode ser o do OmniConnect ou do Supabase, padronizar um deles)

**Médio prazo (3-6 meses):**
- Migrar tabelas críticas do Supabase para o Postgres do OmniConnect
- Auth unificado (provavelmente OmniConnect como IdP)
- Supabase fica como camada de Realtime / Edge Functions auxiliar

**Longo prazo (12+ meses):**
- Decidir se Supabase fica ou sai completamente
- Se sair: tudo Postgres+NestJS, com Realtime via WebSocket próprio do OmniConnect

> Essa decisão é **❓ PENDENTE** — ver `00-context-and-decisions.md`.
