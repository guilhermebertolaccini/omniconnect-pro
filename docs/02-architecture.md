# Architecture — OmniconnectPRO

## High-level architecture

OmniconnectPRO is a **pnpm workspace monorepo** with multiple apps and shared packages. The backend follows a modular monolith pattern (split into microservices only when scale demands).

```
Acquisition (SAA)
    ↓ leads
Conversation (OmniConnect)
    ↓ messages
Automation (Botify)         InsightAI ───┐
    ↓ handoff               (analytics) │
Sales (CRM)        ←────────  AI signals ┘
    ↓ deals
Executive Dashboards
```

## Monorepo structure

```
omniconnect-pro/
├── apps/
│   ├── omniconnect-backend/      # NestJS — the core
│   ├── omniconnect-frontend/     # React — operational UI (consola de conversas; legado da Home/Inteligência migra para o Hub)
│   ├── omniconnect-hub/          # React 19 + TanStack Start — app shell da plataforma (login + tenant + menu + superfícies plataforma-nativa). Ver ADR-0003 e ADR-0004.
│   ├── botify/                   # React — bots/fluxos (integração via bridge; **cutover WP → Nest**: ver ADR-0002)
│   ├── crm-imobiliario/          # React — CRM imobiliário (consome APIs Nest CRM; ver sprints migração)
│   └── smart-ad-automator/       # React — campanhas pagas (consome APIs Nest SAA / OAuth)
├── packages/
│   ├── ai-contracts/             # tipos InsightAI
│   ├── shared-types/             # DTOs entre apps
│   ├── ui/                       # componentes compartilhados (futuro)
│   ├── api-client/               # SDK leve (p.ex. bridge JWT) p/ apps satélite
│   ├── tsconfig/                 # tsconfig base
│   └── eslint-config/            # ESLint base
├── docs/
└── .cursor/
```

**Apps separados ≠ módulos NestJS.** Os 4 frontends comunicam-se com o `omniconnect-backend` via HTTP. Não há import direto entre apps.

## Backend modules (NestJS)

Todos dentro de `apps/omniconnect-backend/src/`. **Módulos já existentes em `taticaofc` (40+):**

| Categoria | Módulos |
|---|---|
| **Identity** | `auth` (JWT, Passport), `users`, `apps` |
| **Channels & Messaging** | `whatsapp-cloud`, `meta-business`, `webhooks` (+ `cloud-api-webhook`), `websocket`, `media` |
| **Operations / Domain** | `contacts`, `conversations`, `campaigns`, `tabulations`, `segments`, `lines`, `templates`, `tags`, `blocklist`, `control-panel` |
| **Messaging pipeline** | `message-queue`, `message-sending`, `message-validation`, `humanization`, `spintax`, `phone-validation`, `line-reputation` |
| **Infrastructure** | `logger` (winston), `cache`, `archiving`, `health`, `health-check-cache`, `circuit-breaker` (opossum), `rate-limiting` (próprio), `system-events`, `api-logs`, `api-messages`, `reports` |

**Módulos OmniconnectPRO (além do legado `taticaofc`):**

| Módulo / área | Responsabilidade | Estado típico |
|---|---|---|
| `insight-ai` | Análise IA de conversas, fila, custo, dashboards API | ✅ Núcleo entregue (multi-provedor; ver `docs/migration/sprint-5-insight-ai-v2.md`) |
| `crm-bridge` | Webhooks HMAC, eventos CRM ↔ core | ✅ Em evolução com processors |
| `ads-bridge` | Webhooks / integração SAA ↔ core | ✅ Em evolução com processors |
| `bot-bridge` | Eventos Botify ↔ core | ✅ Handoff HMAC; **definição de fluxos a migrar para Prisma** — [ADR-0002](adr/ADR-0002-botify-wordpress-to-backend-cutover.md) |
| `integration-events` | `IntegrationEvent`, filas, processors CRM/Ads/Bot | ✅ (ver `docs/migration/sprint-4-bridge-processors.md`) |
| `integration-bridge-emit` | Emissão controlada de eventos a partir de apps satélite (JWT) | ✅ |
| Domínio **CRM** (Nest/Prisma) | Leads, deals, storage, parser, realtime operacional | ✅ Schema + APIs (ver Sprint 3) |
| Domínio **SAA** (Nest/Prisma) | Conexões de ads, proxies, análise IA de campanha | ✅ (ver Sprint 2) |
| `system-events` | Auditoria operacional de integrações | ✅ |
| `rate-limiting` | Limites por chave/tenant (webhooks sensíveis, etc.) | ✅ Em expansão |

**Ainda a consolidar como “produto fechado” (épicos de roadmap):**

| Área | Responsabilidade |
|---|---|
| `dashboards` / **Executive** | Agregações C-level (aquisição + conversão + leakage) além de relatórios atuais |
| `billing-usage` | Faturamento comercial vs rastreio técnico — hoje custo IA em `AIUsageLog` + painéis Insight |
| Catálogo formal de **eventos de domínio** | Complementar `system-events` com contratos estáveis (ver `.cursor/rules/13-events.mdc`) |

> **Princípio:** reusar módulos existentes em vez de criar novos. Ex.: `humanization`, `spintax`, `phone-validation`, `circuit-breaker`, `rate-limiting` já resolvem casos que `taticaofc` já enfrentou.

## Integration flow (lead lifecycle)

1. Lead entra via campanha (SAA), formulário, ou WhatsApp espontâneo
2. **`omniconnect-backend`** cria `Lead` com `tenantId`
3. Conversa inicia (`Conversation` + primeira `Message`)
4. **Botify** (opcional) faz triagem do lead
5. Lead atribuído a vendedor (humano) via `bot.handoff`
6. **CRM** (API Nest ou satélite) cria/atualiza `Deal` / entidades equivalentes, também via eventos dos bridges
7. Mensagens fluem entre lead e vendedor (`Message` por turno)
8. **InsightAI** analisa a conversa periodicamente (BullMQ job)
9. Análise IA atualiza campos comerciais (`leadIntent`, `mainObjection`, `nextBestAction`)
10. **Dashboard executivo** agrega métricas para CEO/CFO
11. Oportunidades perdidas detectadas → lista de recuperação

## Event-driven backbone

Ações comerciais importantes emitem eventos internos (`lead.created`, `conversation.analyzed`, `crm.stage_changed`, etc.). Ver `.cursor/rules/13-events.mdc`.

Eventos alimentam:
- Dashboards (agregação temporal)
- Audit logs (subset filtrado)
- Pipeline de IA (analisar conversas após N mensagens)
- Integrações futuras (outbox pattern)

## Async processing

Tudo lento ou caro **não bloqueia o request HTTP**:

| Operação | Fila BullMQ |
|---|---|
| Análise InsightAI | `insight-ai` |
| Envio de broadcast | `campaign-send` |
| Retry de webhook | `webhook-retry` |
| Geração de relatório | `reports` |
| Importação de leads (CSV) | `imports` |
| Push para CRM/SAA bridges | `crm-bridge`, `ads-bridge` |

Infra: Postgres + Redis (BullMQ). O backend já tem `bullmq` e o legado `bull` instalados — preferir `bullmq` para código novo.

## Estratégia de dados (Postgres Nest × Supabase × satélites)

**Hoje (2026):** grande parte do **domínio comercial estendido** (CRM imobiliário, SAA) foi **absorvida pelo Postgres do `omniconnect-backend`** (Prisma, migrations, módulos de domínio). Os apps `crm-imobiliario` e `smart-ad-automator` funcionam como **frontends satélite** que chamam essas APIs (e podem ainda usar **Supabase ou outro BFF** em transição para auth, realtime legado ou telas não migradas — ver docs de sprint por app).

**Tenancy:** `tenantId` em entidades operacionais; JWT e bridges resolvem contexto (ver `03-multitenancy.md`).

**Direção:** continuar **movendo fonte de verdade** para o monólito modular enquanto se fecha a **orquestração** (`IntegrationEvent` → processors → entidades CRM/SAA). Supabase pode permanecer como **realtime edge** ou ser reduzido conforme equivalentes em Nest/WebSocket maduram.

**Curto prazo:** priorizar **eventos confiáveis** e **idempotência** entre Omni e satélites antes de novos extractors.

**Médio / longo prazo:** auth unificado (OmniConnect como IdP para satélites), menos duplicação de modelo de dados, dashboard executivo alimentado pelos mesmos eventos.

---

**Histórico (trecho antigo Supabase-first):** em um plano anterior, CRM e SAA ficariam só no Supabase no curto prazo; a execução **antecipou** a absorção no Postgres Nest. Ignore esse roteiro em favor da seção anterior.

---

## Scalability direction

Começamos com **modular monolith** (1 deploy NestJS). Evoluímos para microservices **só quando**:

- Volume exige (ex.: workers de IA precisam escalar independente)
- Times exigem (ex.: equipes separadas de canal, IA, CRM)
- Ciclos de deploy divergem
- Integrações precisam de escala isolada

**Evitar microservices prematuros** — complexidade explode antes do benefício.

## Observability

Stack já instalada no `taticaofc`:

- **Logs estruturados** — `winston` + `nest-winston` (módulo `logger/`). JSON com `tenantId`, `requestId`, `actorId`.
- **Métricas** — `prom-client` (Prometheus). Latência por endpoint, throughput, erro por tenant, custo de IA.
- **WebSocket** — `socket.io` (módulo `websocket/`) para tempo real frontend↔backend.
- **Swagger** — `@nestjs/swagger` em `/api/docs`.
- **Tracing** — adicionar OpenTelemetry quando escala exigir (não há hoje).
- **Alertas** — queue depth, error rate, AI cost spike, webhook signature failures (a configurar conforme infra de prod).

## See also

- `01-product-vision.md`
- `09-roadmap.md` (épicos e trilhos paralelos)
- `03-multitenancy.md`
- `06-api-standards.md`
- `07-database-standards.md`
