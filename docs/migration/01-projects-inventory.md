# 01 — Inventário dos Projetos

Todos os projetos estão hoje em `~/Desktop/AMBIENTE DEV/`.

## 1. `taticaofc/` — OmniConnect (workspace atual)

| Campo | Valor |
|---|---|
| Repo GitHub | `https://github.com/guilhermebertolaccini/taticaofc.git` |
| Branch padrão | `main` |
| Commits | 1 (`ff2ac81 sha`) |
| Papel no produto novo | **Base do monorepo** — vira `apps/omniconnect-backend` + `apps/omniconnect-frontend` |

### Stack
- **Backend:** NestJS 10 + Prisma 5 + Postgres + BullMQ/Bull (Redis) + Passport JWT + argon2 + winston/nest-winston + prom-client + socket.io + @nestjs/swagger
- **Frontend:** Vite + **React 19** + TypeScript estrito + Tailwind + shadcn-ui + Radix UI + TanStack Query 5 + React Hook Form 7 + Zod 3 + react-router-dom 6 + socket.io-client + recharts + sonner + lucide-react + date-fns
- **Backend tests:** Jest + Supertest (configurado em `package.json`)
- **Frontend tests:** Vitest

### Capacidades já implementadas
35+ módulos NestJS, incluindo:
- `AuthModule`, `UsersModule`, `SegmentsModule`, `TabulationsModule`
- `ContactsModule`, `CampaignsModule`, `BlocklistModule`, `LinesModule`
- `WhatsappCloudModule`, `MetaBusinessModule`
- `ConversationsModule`, `WebsocketModule`, `WebhooksModule`
- `ReportsModule`, `MediaModule`, `TagsModule`, `TemplatesModule`
- `ControlPanelModule`, `MessageQueueModule`, `SystemEventsModule`
- Infra: `LoggerModule`, `CircuitBreakerModule`, `CacheModule`, `ArchivingModule`, `AppsModule`
- `MessageValidationModule`, `MessageSendingModule`, `ApiLogsModule`, `ApiMessagesModule`

### Schema Prisma (19 models, 427 linhas)
`User`, `Segment`, `Tabulation`, `Contact`, `Campaign`, `BlockList`, `App`, `LinesStock`, `LineOperator`, `Conversation`, `Tag`, `ApiLog`, `Template`, `TemplateMessage`, `ControlPanel`, `ContactRepescagem`, `SendHistory`, `MessageQueue`, `SystemEvent`.

### Plano de evolução prévio
Existe `IMPLEMENTATION_PLAN.md` na raiz descrevendo reestruturação de linha-operador (manter `LineOperator` para auditoria, remover vínculo rígido). **Esse plano deve continuar válido depois da migração**, agora dentro do `omniconnect-pro`.

---

## 2. `botify-whatsapp/` — Botify

| Campo | Valor |
|---|---|
| `package.json name` | `botflow-manager` |
| Tipo | Frontend (sem backend dedicado evidente) |
| Papel no produto novo | `apps/botify` — motor de fluxos / triagem antes do humano |

### Stack
- **Frontend:** Vite + React 18 + TypeScript + Tailwind + shadcn-ui + Radix UI
- **Estado/forms:** React Hook Form + Zod (`@hookform/resolvers`)
- **Data fetching:** TanStack Query
- **Testes:** Vitest

### Estrutura `src/`
`components/`, `contexts/`, `hooks/`, `lib/`, `main.tsx`, `pages/`, `services/`, `test/`, `types/`

### Extras
- Pasta `wordpress-plugin/` com `Dockerfile`, `README`, subpasta `botflow-manager` — indica que existe **integração WordPress**
- `cloudflared/` na raiz — sugere uso de túnel Cloudflare para dev
- `start-dev.sh` / `stop-dev.sh` — scripts próprios de dev
- `DEPLOYMENT-COOLIFY.md` — projeto já tem documentação de deploy via Coolify

### A verificar antes de migrar
- Como o bot **persiste estado de fluxo** (LocalStorage? backend externo? Supabase oculto?)
- Como faz **handoff para humano** hoje (callback URL? webhook? polling?)
- Que **APIs externas** consome (WhatsApp direto? OmniConnect? Meta?)

---

## 3. `t-tica-vendas-imobili-rias-main/` — CRM Imobiliário

| Campo | Valor |
|---|---|
| `package.json name` | `vite_react_shadcn_ts` (template Lovable) |
| Origem | Lovable.dev (tem `@lovable.dev/cloud-auth-js`) |
| Papel no produto novo | `apps/crm-imobiliario` — pipeline de vendas, propostas, contratos |

### Stack
- **Frontend:** Vite + React 18 + TypeScript + Tailwind + shadcn-ui + Radix UI
- **Backend-as-a-Service:** Supabase (`@supabase/supabase-js`)
- **Auth:** Lovable Cloud Auth (camada sobre Supabase)
- **Monitoring:** Sentry (`@sentry/react`)
- **PDF:** jspdf + jspdf-autotable (geração de propostas/contratos)
- **i18n:** pasta `src/i18n/` existe
- **Testes:** Playwright + Vitest

### Estrutura `src/`
`components/`, `contexts/`, `data/`, `hooks/`, `i18n/`, `integrations/`, `lib/`, `pages/`, `test/`, `types/`

### Estrutura Supabase
- `config.toml`
- `functions/` (Edge Functions)
- `migrations/` (versionadas)

### A verificar antes de migrar
- Schema completo do Supabase: tabelas, RLS policies, triggers
- Edge Functions: quais são, o que fazem
- Como ele consome dados do OmniConnect hoje (se consome) — provavelmente **ainda não consome**, é o que vamos integrar

---

## 4. `smart-ad-automator-main/` — Smart Ad Automator (SAA)

| Campo | Valor |
|---|---|
| `package.json name` | `vite_react_shadcn_ts` (template Lovable) |
| Origem | Lovable.dev (provavelmente) |
| Papel no produto novo | `apps/smart-ad-automator` — gestão de campanhas pagas Google/Meta/TikTok com análise IA |

### Stack
- **Frontend:** Vite + React 18 + TypeScript + Tailwind + shadcn-ui + Radix UI
- **Backend-as-a-Service:** Supabase
- **PDF:** jspdf + jspdf-autotable (relatórios de campanha?)
- **Testes:** Vitest

### Estrutura `src/`
`components/`, `contexts/`, `data/`, `hooks/`, `integrations/`, `lib/`, `pages/`, `services/`, `test/`, `types/`

### Estrutura Supabase
- `config.toml`
- `functions/`
- `migrations/`

### Docs já existentes
- `docs/CREDENCIAIS_PLATAFORMAS.md` — credenciais Google/Meta/TikTok
- `docs/META_API_INTEGRATION.md` — integração Meta Ads

### Papel estratégico
A "camada de análise forte com IA" mencionada pelo usuário. Hipótese de integração:
- SAA gera leads pagos → manda para OmniConnect via webhook → OmniConnect abre conversa
- InsightAI analisa qualidade do lead → devolve score por canal/criativo para SAA
- SAA recalibra orçamento e criativos com base no CAC real (não no CPL bruto)

---

## 5. `insight-ai-mvp-patch/` — Patch InsightAI

| Campo | Valor |
|---|---|
| Origem | Outra IA (sandbox externa) |
| Tamanho | 8 arquivos |
| Papel | Módulo NestJS dentro de `apps/omniconnect-backend/src/insight-ai/` + 1 model novo no schema |

### Conteúdo do patch
```
insight-ai-mvp-patch/
├── INSIGHT_AI_PATCH_README.md
└── omniconnect/taticaofc-main/
    └── backend/
        ├── src/
        │   ├── app.module.ts          (= o seu atual + 2 linhas)
        │   └── insight-ai/
        │       ├── insight-ai.module.ts
        │       ├── insight-ai.controller.ts
        │       ├── insight-ai.service.ts   (~365 linhas)
        │       ├── insight-ai.prompt.ts
        │       └── insight-ai.types.ts
        └── prisma/schema.prisma       (= o seu atual + 1 model)
```

### Endpoints expostos
- `POST /insight-ai/analyze/:phone` — analisa por telefone (auth: admin, supervisor, digital)
- `POST /insight-ai/analyze` — analisa lote
- `GET /insight-ai/analyses` — lista análises persistidas
- `GET /insight-ai/dashboard/summary` — resumo executivo

### Análise detalhada
Ver [`04-insight-ai-patch-analysis.md`](./04-insight-ai-patch-analysis.md) — tem 3 bloqueadores que precisam ser corrigidos antes de aplicar.

---

## Outros achados na pasta `~/Desktop/AMBIENTE DEV/`

Projetos que **não fazem parte do escopo da unificação**, mas existem no mesmo diretório:

| Pasta | O que parece ser | Decisão |
|---|---|---|
| `omniconnect-hub-main/` + zip | Versão **anterior** do OmniConnect (anterior ao `taticaofc`) | Ignorar — é legado, possivelmente útil para comparação |
| `agro-link-direct/` | Outro projeto, não relacionado | Ignorar |
| `concilig-autonegociacao*/` | Múltiplas versões de outro projeto | Ignorar |
| `darwin-laravel*/` | Projetos Laravel | Ignorar |
| `dealer-order-flow/`, `municipal-hub/`, `newvend-main/`, etc. | Outros projetos do usuário | Ignorar |
| `tatica-wedding-suite/` | Outro produto da marca Tatica | Possível candidato para escopo futuro? **Marcar como "fora do MVP"** |

> **Nota:** o nome `tatica-wedding-suite` sugere que pode haver mais produtos da marca Tatica em paralelo. Vale uma conversa em algum momento sobre se o `omniconnect-pro` ambiciona ser **plataforma multi-vertical** (imobiliário + casamentos + etc.) ou foca em **vertical imobiliária**.

---

## Resumo de compatibilidade de stacks

| Produto | Frontend | Backend | DB |
|---|---|---|---|
| OmniConnect (taticaofc) | (a verificar) | NestJS | Postgres |
| Botify | Vite/React/shadcn | — | — |
| CRM Imobiliário | Vite/React/shadcn | Supabase | Postgres (Supabase) |
| Smart Ad Automator | Vite/React/shadcn | Supabase | Postgres (Supabase) |

**Conclusão:** stacks **muito compatíveis**. Os 3 frontends (Botify, CRM, SAA) podem compartilhar `packages/ui` quase 100%. O ponto de divergência é o backend: NestJS+Postgres próprio vs Supabase. Essa é a decisão arquitetural mais importante a tomar (ver `00-context-and-decisions.md` → "Decisões pendentes").
