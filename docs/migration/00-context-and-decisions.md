# 00 — Contexto e Decisões

## Resumo executivo

O `taticaofc` (= OmniConnect, backend NestJS+Prisma+Postgres com WhatsApp Cloud, conversas, campanhas) vai se tornar a base de um **produto unificado chamado `omniconnect-pro`**, que integra:

1. **OmniConnect** (atual `taticaofc`) — núcleo operacional: WhatsApp, conversas, campanhas, contatos, tabulações
2. **Botify** (`botify-whatsapp`) — motor de fluxos/bot e triagem antes do humano
3. **CRM Imobiliário** (`t-tica-vendas-imobili-rias-main`) — pipeline, leads, propostas, contratos, espelho de vendas
4. **Smart Ad Automator** (`smart-ad-automator-main`) — gestão e análise de campanhas pagas (Google/Meta/TikTok)
5. **InsightAI** (camada nova) — Text Analytics comercial sobre as conversas, gerando score/intenção/objeção/oportunidade perdida

## Por que monorepo (e não 4 repos separados)

| Critério | Decisão |
|---|---|
| Os 4 produtos vão compartilhar tipos (ex.: `LeadIntent`, `ConversationAIResult`, `CampaignMetrics`) | Monorepo permite `packages/ai-contracts` reutilizado |
| 3 dos 4 frontends usam **stack idêntica** (Vite + React + shadcn-ui + Radix) | Componentes UI podem ir em `packages/ui` |
| InsightAI vai produzir dados que alimentam CRM e dashboards do SAA | Monorepo simplifica integração tipada |
| Versionamento e deploy coordenado entre produtos | Monorepo facilita feature flags e releases atômicas |
| Histórico de cada produto é curto / não precisa preservar | Sem fricção de `git subtree` |

## Decisões já tomadas

### ✅ DECIDIDO — Nome do novo repositório
**`omniconnect-pro`** (no GitHub: `guilhermebertolaccini/omniconnect-pro`)

### ✅ DECIDIDO — Repositório novo, não branch
A unificação de 4 produtos com escopo de plataforma é uma mudança grande demais para uma branch no `taticaofc`. Justifica repo novo.

### ✅ DECIDIDO — `taticaofc` vai ser arquivado
Depois que o `omniconnect-pro` estiver com a base do OmniConnect migrada e validada, o `taticaofc` no GitHub vai para `Settings → Archive`. README dele aponta para o novo repo.

### ✅ DECIDIDO — Histórico do `taticaofc` não será preservado no repo novo
Justificativa: o `taticaofc` tem apenas 1 commit (`ff2ac81 sha`). Não vale a pena `git subtree`. Recomeço limpo com 1º commit já estruturado como monorepo.

### ✅ DECIDIDO — Base inicial é o OmniConnect
Tecnicamente o mais robusto dos 4 (já tem NestJS, Prisma, Postgres, 19 models, 35 módulos, Bull/Redis, WhatsApp Cloud, webhooks, dashboards). Os outros 3 entram como `apps/` adicionais.

### ✅ DECIDIDO — Primeira camada nova é o InsightAI
Entra como módulo NestJS dentro do `apps/omniconnect-backend/src/insight-ai/`. Tabela `ConversationAIAnalysis` adicionada ao schema Prisma existente.

### ✅ DECIDIDO — Roadmap de integração entre produtos

```
OmniConnect (conversas) ──► InsightAI ──► CRM (lead.score/intent/objection/next_action)
                                      │
                                      └─► Dashboard CEO/CFO
                                      
Botify (triagem/bot) ──► OmniConnect (handoff p/ corretor)
                     └─► InsightAI (analisa também as conversas do bot)

Smart Ad Automator ──► leads pagos ──► OmniConnect (1ª conversa) ──► CRM
                  └─► IA: análise de criativos, CAC por canal, qualidade de lead por origem
```

## ✅ DECIDIDO — Multi-tenancy desde o dia 1
O produto é multi-tenant SaaS. Todo entity operacional tem `tenantId`. Detalhes em `docs/03-multitenancy.md` e regra `.cursor/rules/01-multitenancy.mdc`.

**Implicação:** o backend atual do `taticaofc` (sem multi-tenant) precisa de retrofit. Adicionado como **Fase 2.5** no `03-migration-plan.md`.

## ✅ DECIDIDO — RBAC (papéis do taticaofc preservados)
Mantemos exatamente os 5 papéis já definidos no enum `Role` do `taticaofc/backend/prisma/schema.prisma`:

- `admin` — acesso total, inclusive cross-tenant (auditado)
- `supervisor` — gerencia equipe do tenant
- `operator` — atende conversas
- `ativador` — outbound / ativação
- `digital` — marketing digital / dashboards / IA

**Não introduzimos** `platform_super_admin`, `tenant_owner`, `tenant_admin`, `manager`, `seller`, `analyst`, `viewer`, `integration_service`. Caso surja necessidade real, novos valores são adicionados ao enum em migration explícita. Service-to-service usa **API keys**, não papel humano. Detalhes em `docs/03-multitenancy.md`.

## ✅ DECIDIDO — Event-driven
Sistema de eventos internos com payload obrigatório (`tenantId`, `eventType`, `entityType`, `entityId`, `actorId`, `metadata`, `occurredAt`). Lista canônica de eventos em `.cursor/rules/13-events.mdc`.

## ✅ DECIDIDO — AI governance
Prompt versionado, output validado (Zod), PII redaction antes do LLM, custo rastreável (tokens + USD/BRL), fallback heurístico sem provedor externo. Detalhes em `docs/05-ai-governance.md`.

## ✅ DECIDIDO — Smart Ad Automator no escopo
SAA entra como 4º app do monorepo: `apps/smart-ad-automator`. Camada de aquisição (campanhas pagas Google/Meta/TikTok com análise IA). Detalhes em `docs/01-product-vision.md` e roadmap fase 5.

## ✅ DECIDIDO — Stack de testes
- **Backend = Jest** (já configurado em `taticaofc/backend`, scripts `test`, `test:cov`, `test:e2e`).
- **Frontends = Vitest** (já configurado nos 4 frontends).
- E2E nos frontends com **Playwright** (CRM já tem, replicar nos demais).
- Não trocar Jest por Vitest no backend — manter consistência com o que existe.

## ✅ DECIDIDO — Maximizar preservação do taticaofc
O `taticaofc` é a base mais robusta dos 4 produtos e tem ~40 módulos NestJS (incluindo `rate-limiting/`, `humanization/`, `spintax/`, `phone-validation/`, `circuit-breaker/`, `system-events/`, etc.). **Princípio guia:** reusar tudo o que já existe; só adicionar módulos novos quando necessário (`tenants`, `insight-ai`, `*-bridge`, `dashboards`, `audit-logs`, `billing-usage`).

Implicações práticas:
- Rate limiting: módulo interno `rate-limiting/`, **não** `@nestjs/throttler`
- Filas: preferir **BullMQ** em código novo; manter código legado em `bull`
- Logs: `winston` + `nest-winston` (módulo `logger/` existente)
- Métricas: `prom-client` (Prometheus) já instalado
- Hashing: `argon2` (instalado), **não** bcrypt
- WebSocket: `socket.io` no backend e `socket.io-client` no frontend

## ✅ DECIDIDO — Function size goal
**Meta aspiracional: funções < 50 linhas.** Services legados grandes (ex.: `conversations.service.ts` ~660 linhas) são dívida técnica conhecida — refatorar oportunisticamente, **não em massa**.

## ✅ DECIDIDO — Sem prefixo `/api` global
A API serve na raiz (`/leads`, `/conversations`, …). Apenas Swagger fica em `/api/docs` — decisão atual do `taticaofc`, mantida.

## Decisões pendentes

### ✅ DECIDIDO — Gerenciador de pacotes do monorepo
**`pnpm@9`** definido. Já configurado em `package.json` raiz + `pnpm-workspace.yaml`.

### ❓ PENDENTE — Orquestrador de build
Opções: `Turborepo`, `Nx`, nenhum (`pnpm -r`).
**Recomendação:** Turborepo quando passar de 3 apps ativos. **Começar sem ele.** Adicionar quando build total >1min.

### ❓ PENDENTE — Backend do CRM/SAA (Supabase × Postgres-NestJS)
Hoje CRM e Smart Ad Automator usam **Supabase**. Decisão estratégica:
- **Opção A**: manter os 2 em Supabase, integrar com OmniConnect via API/webhooks
- **Opção B**: migrar tudo para o Postgres+NestJS do OmniConnect (unifica de verdade, mas é trabalho grande)
- **Opção C híbrida**: começar com A, planejar B para um trimestre futuro

**Estratégia adotada provisoriamente:** Opção C (híbrida) — documentada em `docs/02-architecture.md`. Revisar quando passarmos da Fase 4.

### ❓ PENDENTE — Repositórios atuais dos outros 3 produtos
Os ZIPs vieram do Lovable (CRM e SAA têm `@lovable.dev/cloud-auth-js` ou similar). Botify também. Decidir:
- Vão ter repositório próprio no GitHub que será arquivado?
- Ou só existem como ZIP/Lovable e o `omniconnect-pro` vira o único repo deles?

### ❓ PENDENTE — `taticaofc` tem produção rodando?
Se houver dados reais em produção, multi-tenant retrofit precisa de:
- Backup de produção antes da migration
- Criação de Tenant "default" para dados legados
- Migration testada em staging com dump real
- Plano de rollback

### ❓ PENDENTE — Nome dos produtos no monorepo
Confirmação dos nomes que vou usar:
- `apps/omniconnect-backend` ✅
- `apps/omniconnect-frontend` ✅ (ex-`taticaofc/frontend`)
- `apps/botify` ✅
- `apps/crm-imobiliario` ✅ (ex-`t-tica-vendas-imobili-rias-main`)
- `apps/smart-ad-automator` ✅ (ex-`smart-ad-automator-main`)

## Histórico das conversas

A migração começou com a pergunta original do usuário: *"vou evoluir o projeto, faço um novo repositório ou uma branch?"*. A conversa percorreu:

1. **Branch vs repo novo** — recomendado branch para evolução incremental, repo novo para reescritas/mudanças de escopo.
2. **Esclarecimento do escopo** — usuário revelou que vai **unificar 4 produtos**, portanto repo novo está justificado.
3. **Análise do patch InsightAI** — pasta `~/Desktop/AMBIENTE DEV/insight-ai-mvp-patch/` veio de outra IA, mas com instruções perigosas (sugeria sobrescrever `app.module.ts` e `schema.prisma` inteiros). Análise do código real está em [`04-insight-ai-patch-analysis.md`](./04-insight-ai-patch-analysis.md).
4. **Inclusão do Smart Ad Automator no escopo** — entrou tardio na conversa, ainda em fase de absorção.
5. **Criação destes docs** — para servir de fonte de verdade ao longo da migração.
