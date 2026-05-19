# Plano prático — Botify ao nível de maturidade CRM / SAA / Omni

Objetivo: **reduzir o desvio** entre `apps/botify` e os outros satélites (`crm-imobiliario`, `smart-ad-automator`), medido em **integração com `omniconnect-backend`**, **multi-tenancy**, **contratos de evento**, **observabilidade**, **testes/CI** e **documentação operacional** — sem necessariamente “virar uma cópia” do CRM (stacks podem diferir).

**Referências:**

- Ponte Omni hoje: `POST /webhooks/botify` (HMAC), evento `botify.handoff.created` — `docs/migration/sprint-4-bridge-processors.md`.
- Implementação cliente: `apps/botify/wordpress-plugin/botflow-manager/microservice/src/services/omniconnect-bridge.ts`.
- Motor que dispara handoff: `microservice/src/engine/flow-engine.ts` (ação `transfer`).
- Piloto ponta a ponta (inclui passo Botify): `docs/migration/pilot-flow-lead-to-recovery.md`.
- Runbook operacional (env, HMAC, troubleshooting): `docs/operations/botify-omniconnect-bridge.md`.

### Status por fase

| Fase | Estado | Notas |
|------|--------|--------|
| **A** — Básico integração | **Concluída** (2026-05-18) | Payload/runbook em docs; `externalId` com `flowKey`; health `omniconnectBridge.configured`; Vitest em `microservice` (2 testes em `omniconnect-bridge.spec.ts`). |
| **B** — Triagem rica | **Concluída** (2026-05-18) | `data.leadSummary` no webhook; `MessageQueue.leadSummary` + bloco legível na conversa ao desenfileirar; `FlowEngine` + editor Botify; testes dispatcher + bridge. |
| **C** — Motor de fluxo | **Concluída** (2026-05-18) | Inventário em `sprint-6-botify-flow-engine-inventory.md`; paleta bloqueia mídia/botões/lista; condição + histórico IA via WP; Vitest navegação/histórico. |
| **D** — Monorepo + CI | **Concluída** (2026-05-18) | `botify` depende de `@omniconnect/shared-types`; CI bloqueante `botify` + `botflow-microservice`; satélites CRM/SAA seguem não bloqueantes. |
| **E** — Tenancy | **Concluída** (2026-05-18) | `docs/adr/ADR-0001-botify-tenancy-model.md`; `integration-connections.md` + `03-multitenancy.md` + `.env.example` microserviço. |
| **F** — InsightAI (opcional) | **Concluída** (2026-05-18) | Política em `docs/05-ai-governance.md` (Botify ↔ InsightAI); enqueue opcional `INSIGHT_AI_ON_BOTIFY_HANDOFF` no dispatcher pós-handoff. |
| **G** — Cutover WordPress → backend | **Proposta** | Ver [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md): fluxos/bots em Prisma + Nest; Strangler Fig; Vite e microserviço passam a consumir API Omni. |

---

## 1. Estado atual (honesto)

| Dimensão | Botify hoje | CRM / SAA (referência) |
|-----------|-------------|-------------------------|
| **Stack** | Vite React + **WordPress** (plugin) + **microserviço Node** (Express/Bull/redis) | Vite React consumindo **API Nest**; domínio no Postgres Prisma |
| **Auth / tenant** | Auth **WordPress** (JWT plugin); sem `UserTenant` Omni no browser | Cutover para **JWT Omni** + membership por tenant |
| **Integração Omni** | **Só** handoff: HMAC para `/webhooks/botify` a partir do **microserviço** | **Emissor JWT** `POST /integrations/bridge/events` + HMAC inbound onde preciso |
| **Pacotes monorepo** | `botify` usa `@omniconnect/shared-types` (`workspace:*`) para o contrato handoff; **sem** `@omniconnect/api-client` no browser (emit continua no microserviço) | CRM/SAA usam `workspace:*` para contratos HTTP |
| **Eventos bridge** | Um tipo: `botify.handoff.created` | CRM/Ads: `crm.*`, `ads.*` (mapeáveis a domínio) |
| **Motor de fluxo** | Nós suportados documentados; mídia/botões/lista bloqueados na paleta até o motor existir; **condição** com ramos Sim/Não no microserviço | N/A (domínio diferente) |
| **IA no fluxo** | Histórico carregado do WordPress (`GET .../microservice/conversation/{id}/messages`) antes do `AIProcessor` | InsightAI é outro módulo; alinhamento futuro |
| **Testes** | Vitest no microserviço (bridge + navegação + histórico) | Vitest + smoke backend para emit |
| **CI** | `botify` + `botflow-microservice` em jobs bloqueantes no GitHub Actions | CRM tende a ganhar smoke bloqueante |
| **Docs** | README curto; Coolify; `.env.example` no microserviço | Sprints 2.x / 3.x detalhados |

**Conclusão:** o gargalo não é “não existir bridge”, e sim **profundidade de produto**, **modelo de identidade/tenant**, **completude do motor**, **qualidade de testes** e **alinhamento ao modo de trabalho do monorepo**.

---

## 2. Definição de “mesmo nível” (critérios mensuráveis)

O Botify será considerado **par** quando:

1. **Handoff + idempotência** — o fluxo piloto passa no critério **A2** do doc de piloto (sem duplicar fila; `IntegrationEntityLink` coerente).
2. **Contrato de evento versionado** — payload de `botify.handoff.created` documentado (campos obrigatórios/opcionais); evoluções com novos `eventType` só com testes.
3. **Triagem rica (MVP)** — o handoff envia **resumo estruturado** (intent, urgência, orçamento, região — alinhar a `packages/ai-contracts` ou DTO Nest) além de phone/name/message.
4. **Observabilidade** — logs estruturados no microserviço com `externalId`, `tenantId` **derivado da conexão** (nunca PII em excesso); métricas de falha do webhook Omni.
5. **Configuração operacional** — runbook único: criar `IntegrationConnection` provider `bot`, segredo, variáveis Coolify/local, verificação de saúde.
6. **Testes** — pelo menos: (a) teste unitário do `emitBotifyHandoffToOmniconnect` com `fetch` mock; (b) teste de integração ou contract test no backend para payload esperado; (c) opcional E2E piloto.
7. **Monorepo hygiene** — `botify` em `pnpm-workspace` com `@omniconnect/shared-types` para DTO do handoff HMAC (✅ Fase D); `@omniconnect/api-client` continua reservado a emissão JWT no browser (CRM/SAA).
8. **CI** — job `botify` verde no PR: `lint` + `test` + build do Vite; **microserviço** com `npm test` ou script `typecheck` em CI (matrix ou path filter).
9. **Estratégia de tenant** — ✅ `docs/adr/ADR-0001-botify-tenancy-model.md` (1:1 padrão; multi-tenant só com mapeamento servidor-side).

**Sprint 6 Botify:** fases A–F fechadas neste plano. **Fase G** (épico) remove o WordPress como fonte de verdade — ver ADR-0002. **ADRs futuros** adicionais podem cobrir identidade Omni no browser (JWT + `UserTenant`), em paralelo à Fase G.

---

## 3. Fases de execução (ordem sugerida)

### Fase A — Fechar o básico integração (1–2 semanas) ✅ concluída

| # | Entrega | Aceite |
|---|---------|--------|
| A1 | Documentar payload **`data`** de `botify.handoff.created` no backend + exemplos | `docs/06-api-standards.md` (Bridge inbound — Botify) + runbook |
| A2 | Garantir que `externalId` é estável e documentado | Formato: `botify:flow:{flowKey}:conv:{conversationId}:transfer` (`flowKey` = `context.flowId` ou `unknown`; mudança de formato pode criar nova linha de dedupe vs eventos antigos — ver runbook) |
| A3 | Runbook Botify-Omni | `docs/operations/botify-omniconnect-bridge.md`; `integration-connections.md` referencia `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID` |
| A4 | Health do microserviço expõe sinal de bridge (sem vazar secret) | `GET` health inclui `omniconnectBridge: { configured: boolean }` quando as três envs Omni estão definidas |

### Fase B — Triagem rica e contrato (1–2 semanas) ✅ concluída

| # | Entrega | Aceite |
|---|---------|--------|
| B1 | Estender `data` do handoff com objeto `leadSummary` | Contrato + sanitização no dispatcher; coluna `MessageQueue.leadSummary` |
| B2 | Opcional: novo `eventType` | Não adicionado (sem handler dedicado) |
| B3 | `FlowEngine` + UI preenchem resumo | Variáveis de nó transfer + último turno IA em `lastAssistantReply` / `lastUserMessage` |

### Fase C — Motor de fluxo (paralelo, 2–4 semanas) ✅ concluída

| # | Entrega | Aceite |
|---|---------|--------|
| C1 | Inventário nó a nó | `docs/migration/sprint-6-botify-flow-engine-inventory.md` |
| C2 | UI não oferece caminho impossível | Paleta: mídia/botões/lista não arrastáveis (`Em breve`); condição/IA/mensagem/delay/ação ativos |
| C3 | Histórico no `processAINode` | Rota WP microserviço + `wpMessagesToAiHistory` |
| C4 | Testes de regressão (núcleo motor) | `flow-engine-navigation.spec.ts`, `flow-engine-history.spec.ts` |

### Fase D — Monorepo, tipos e CI (1 semana + contínuo) ✅ concluída

| # | Entrega | Aceite |
|---|---------|--------|
| D1 | `botify` + tipos compartilhados | `@omniconnect/shared-types` (`botify-bridge.ts`) + `apps/botify/src/lib/omniconnect-bridge-contract.ts` (`import type` only) |
| D2 | CI bloqueia regressão Botify | `.github/workflows/ci.yml` — job `botify` ((shared-types build) + lint + test + build) |
| D3 | CI microserviço | Job `botflow-microservice`: `npm ci`, `npm test`, `npm run build` |

### Fase E — Tenancy e identidade (decisão de produto, 1–3 semanas) ✅ concluída

**Caminho mínimo (piloto):** uma instalação Botify = um `tenantId` Omni (config explícita no microserviço).  
**Caminho plataforma:** multi-tenant no mesmo processo só com mapeamento servidor-side documentado no ADR; login Vite via Omni fica para ADR futuro.

| # | Entrega | Aceite |
|---|---------|--------|
| E1 | ADR “Botify tenancy model” | `docs/adr/ADR-0001-botify-tenancy-model.md` (**Accepted**) |
| E2 | Multi-tenant: mapear `botId`/domínio → `IntegrationConnection` | ADR §Decision (opções réplica vs mapa servidor-side); ops em `integration-connections.md` |

### Fase F — Alinhamento InsightAI (opcional pós-piloto) ✅ concluída

| # | Entrega | Aceite |
|---|---------|--------|
| F1 | Política: InsightAI analisa conversas **após** handoff | Mesmo `tenantId` + **E.164** persistidos no Omni; o job `analyze-conversation` lê mensagens do core (ver `05-ai-governance.md`). Enfileiramento imediato opcional via `INSIGHT_AI_ON_BOTIFY_HANDOFF=true` (primeira corrida pode ser espartana até existir conversa humana; dedup horário no `jobId` permite reanálise). |
| F2 | Não duplicar PII; respeitar `redactPII` se transcript cruzar domínios | **Não** enviar transcript completo WordPress/Botify ao prompt do InsightAI; `leadSummary` no bridge é triagem operacional (já sanitizada no dispatcher), não substituto do transcript; qualquer texto extra-canal que entre em prompts passa pelo mesmo pipeline de redação. |

### Fase G — Cutover WordPress → `omniconnect-backend` (épico)

Objetivo: **eliminar o WordPress como fonte de verdade** de bots/fluxos e alinhar ao padrão Nest + Prisma do monorepo ([ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md)).

| # | Entrega | Aceite (resumo) |
|---|---------|-----------------|
| G0 | Contrato JSON do grafo em `shared-types` | `packages/shared-types` — `botify-flow-graph.ts` (`BotifyFlowNode`, `BotifyFlowGraph`, `normalizeBotifyFlowConnections`); usado no `FlowEditor` + microserviço |
| G1 | Schema Prisma com `tenantId` | Migration versionada + revisão multitenancy |
| G2 | APIs Nest (CRUD / publicar fluxo) | JWT + DTOs + listas paginadas |
| G3 | Motor de execução no backend | Paridade com testes atuais do microserviço |
| G4 | Microserviço obtém definições via Omni | Feature flag; dual-read opcional |
| G5 | Vite substitui `wordpress-api` (fluxos) por API backend | Mesmo rigor que CRM/SAA |
| G6 | Import WP → Omni | Runbook + trilho de auditoria |
| G7 | WP fora do run-time crítico | Atualizar runbooks |

**Gate:** não avançar G1 sem **aceitar** o ADR-0002 (evita retrabalho de modelo).

---

## 4. Riscos e mitigação

| Risco | Mitigação |
|--------|-----------|
| WordPress como fonte de verdade dos fluxos | **Fase G + [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md)** — Strangler Fig até Postgres/Nest ser canónico; até lá, um único lugar de edição “ativa” por cliente |
| Segredo HMAC em `.env` do microserviço | Rotação via `docs/operations/integration-connections.md`; nunca env para browser |
| Handoff com tenant errado | ADR-0001 + `IntegrationConnection` por tenant; sem `tenantId` no body |
| Escopo infinito no FlowEngine | Fase C com “desliga na UI” como primeira entrega |

---

## 5. Métricas de progresso

- **0** — Runbook + payload documentado + CI botify básico  
- **1** — Triagem rica no `data` + testes contrato  
- **2** — Motor: nós críticos alinhados ou desabilitados; AI com contexto  
- **3** — ADR tenancy + piloto A1–A2 passando com Botify no loop  
- **4** — Paridade percebida com CRM/SAA em **integração Omni** (mesmo rigor de evento + ops)
- **5** — **Fase G:** fluxos persistidos no `omniconnect-backend` (WP descontinuado no caminho crítico) — ver ADR-0002

---

## 6. Próximo passo imediato (esta semana)

1. **Fase G:** **G0** iniciado (`botify-flow-graph.ts` + uso no editor e microserviço). Próximo: **aceitar** [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md) e planear **G1** (Prisma tenant-scoped).  
2. **Migration Sprint 6:** a pasta `prisma/migrations/20260522120000_sprint_6_message_queue_lead_summary` já existe no repo — aplicar com `pnpm prisma migrate deploy` (ou equivalente) em cada ambiente que ainda não a tenha.  
3. Opcional: endurecer ESLint do `botify` (`no-explicit-any` error).  
4. Em paralelo à Fase G: ADR futuro **identidade Omni no app Botify** (JWT + `UserTenant`) se o browser tiver de emitir bridge como CRM/SAA.

---

## Ver também

- `docs/adr/ADR-0001-botify-tenancy-model.md` — tenancy Botify ↔ Omni  
- `docs/adr/ADR-0002-botify-wordpress-to-backend-cutover.md` — cutover WP → backend  
- `docs/migration/sprint-6-botify-flow-engine-inventory.md` — nós: motor vs UI  
- `docs/operations/botify-omniconnect-bridge.md` — runbook Botify ↔ Omni  
- `docs/09-roadmap.md` — Fase 3 Botify Triage  
- `docs/migration/pilot-flow-lead-to-recovery.md`  
- `packages/shared-types` — `BotifyHandoffWebhookPayload`, `BotifyLeadSummary`  
- `packages/api-client` — emit browser + JWT (CRM/SAA); Botify handoff continua server-side (HMAC)
