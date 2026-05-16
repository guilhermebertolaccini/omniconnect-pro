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
│   ├── omniconnect-frontend/     # React — operational UI
│   ├── botify/                   # React — bot/flows
│   ├── crm-imobiliario/          # React + Supabase — sales
│   └── smart-ad-automator/       # React + Supabase — ads
├── packages/
│   ├── ai-contracts/             # tipos InsightAI
│   ├── shared-types/             # DTOs entre apps
│   ├── ui/                       # componentes compartilhados (futuro)
│   ├── api-client/               # SDK do backend (futuro)
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

**Módulos a criar para virar OmniconnectPRO:**

| Módulo novo | Responsabilidade |
|---|---|
| `tenants` | Tenant CRUD, configurações (multi-tenant retrofit) |
| `insight-ai` | Análise IA de conversas (vem do patch) |
| `dashboards` | Agregações executivas (lead lifecycle, AI cost, leakage) |
| `events` | Eventos de domínio expostos a integrações (complementa `system-events`) |
| `audit-logs` | Log de auditoria de ações sensíveis (multi-tenant) |
| `billing-usage` | Consumo de IA, mensagens, custos por tenant |
| `bot-bridge` | Ponte com app Botify |
| `crm-bridge` | Ponte com CRM Imobiliário |
| `ads-bridge` | Ponte com Smart Ad Automator |

> **Princípio:** reusar módulos existentes em vez de criar novos. Ex.: `humanization`, `spintax`, `phone-validation`, `circuit-breaker`, `rate-limiting` já resolvem casos que `taticaofc` já enfrentou.

## Integration flow (lead lifecycle)

1. Lead entra via campanha (SAA), formulário, ou WhatsApp espontâneo
2. **`omniconnect-backend`** cria `Lead` com `tenantId`
3. Conversa inicia (`Conversation` + primeira `Message`)
4. **Botify** (opcional) faz triagem do lead
5. Lead atribuído a vendedor (humano) via `bot.handoff`
6. **CRM** cria/atualiza `Deal` correspondente
7. Mensagens fluem entre lead e vendedor (`Message` por turno)
8. **InsightAI** analisa a conversa periodicamente (BullMQ job)
9. Análise IA atualiza campos comerciais (`leadIntent`, `mainObjection`, `nextBestAction`)
10. **Dashboard executivo** agrega métricas para CEO/CFO
11. Oportunidades perdidas detectadas → lista de recuperação

## Event-driven backbone

Ações comerciais importantes emitem eventos internos (`lead.created`, `conversation.analyzed`, `crm.stage_changed`, etc.). Ver `13-events.mdc`.

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

## Hybrid backend strategy (Supabase × Postgres-NestJS)

Curto prazo (1-2 trimestres):
- CRM e SAA permanecem em **Supabase**
- Backend Nesjs continua dono dos dados operacionais (conversas, leads, IA)
- Integração via HTTP entre apps

Médio prazo (3-6 meses):
- Migração de tabelas críticas do Supabase para o Postgres do OmniConnect
- Auth unificado (OmniConnect como IdP)

Longo prazo (12+ meses):
- Decisão final: tudo Postgres+NestJS, ou Supabase fica como camada de Realtime
- Reavaliar baseado em escala e custo

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
- `03-multitenancy.md`
- `06-api-standards.md`
- `07-database-standards.md`
