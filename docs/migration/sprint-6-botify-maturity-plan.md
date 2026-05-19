# Plano prático — Botify ao nível de maturidade CRM / SAA / Omni

Objetivo: **reduzir o desvio** entre `apps/botify` e os outros satélites (`crm-imobiliario`, `smart-ad-automator`), medido em **integração com `omniconnect-backend`**, **multi-tenancy**, **contratos de evento**, **observabilidade**, **testes/CI** e **documentação operacional** — sem necessariamente “virar uma cópia” do CRM (stacks podem diferir).

**Referências:**

- Ponte Omni hoje: `POST /webhooks/botify` (HMAC), evento `botify.handoff.created` — `docs/migration/sprint-4-bridge-processors.md`.
- Implementação cliente: `apps/botify/wordpress-plugin/botflow-manager/microservice/src/services/omniconnect-bridge.ts`.
- Motor que dispara handoff: `microservice/src/engine/flow-engine.ts` (ação `transfer`).
- Piloto ponta a ponta (inclui passo Botify): `docs/migration/pilot-flow-lead-to-recovery.md`.
- Runbook operacional (env, HMAC, troubleshooting): `docs/operations/botify-omniconnect-bridge.md`.

> **Monorepo:** `apps/botify` é aplicação **versionada no mesmo repositório** que os outros `apps/*` (não é submodule).

### Status por fase

| Fase | Estado | Notas |
|------|--------|--------|
| **P1 — Config operacional Omni** | **Concluída** (2026-05-19) | Secrets/flags/`DATABASE_URL` + health + slug `default-tenant` na sync interna — `docs/migration/botify-phase1-operational-setup.md`. |
| **P2 — Validação cutover** | **Em curso** | Migrações Sprint 6 + smoke `GET /botify/internal/.../runtime-config` + matriz piloto §3.4 — `docs/migration/botify-phase2-operational-validation.md`. |
| **A** — Básico integração | **Concluída** (2026-05-18) | Payload/runbook em docs; `externalId` com `flowKey`; health `omniconnectBridge.configured`; Vitest em `microservice` (2 testes em `omniconnect-bridge.spec.ts`). |
| **B** — Triagem rica | **Concluída** (2026-05-18) | `data.leadSummary` no webhook; `MessageQueue.leadSummary` + bloco legível na conversa ao desenfileirar; `FlowEngine` + editor Botify; testes dispatcher + bridge. |
| **C** — Motor de fluxo | **Concluída** (2026-05-18) | Inventário em `sprint-6-botify-flow-engine-inventory.md`; paleta bloqueia mídia/botões/lista; condição + histórico IA via WP; Vitest navegação/histórico. |
| **D** — Monorepo + CI | **Concluída** (2026-05-18) | `botify` depende de `@omniconnect/shared-types`; CI bloqueante `botify` + `botflow-microservice`; satélites CRM/SAA seguem não bloqueantes. |
| **E** — Tenancy | **Concluída** (2026-05-18) | `docs/adr/ADR-0001-botify-tenancy-model.md`; `integration-connections.md` + `03-multitenancy.md` + `.env.example` microserviço. |
| **F** — InsightAI (opcional) | **Concluída** (2026-05-18) | Política em `docs/05-ai-governance.md` (Botify ↔ InsightAI); enqueue opcional `INSIGHT_AI_ON_BOTIFY_HANDOFF` no dispatcher pós-handoff. |
| **G** — Cutover WordPress → backend | **Código G1–G6 ✅; G7 operacional ⬜** | APIs/flags no repo; checklist “zero WP” em [`botify-g7-wordpress-removal.md`](./botify-g7-wordpress-removal.md). |

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

### Fase G — Cutover WordPress → `omniconnect-backend` (épico) — **G1–G7 no repo**

Objetivo: **`omniconnect-backend` como fonte de verdade** de bots/fluxos; WordPress permanece **legado** (conversas/UI auxiliar/import) conforme rollout. [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md) — **Accepted**.

| # | Entrega | Aceite (resumo) |
|---|---------|-----------------|
| G0 | Contrato JSON em `shared-types` | **✅** `packages/shared-types/src/botify-flow.ts` + Vitest round-trip (`botify-flow-contract.spec.ts`) |
| G1 | Schema Prisma com `tenantId` | **✅** `BotifyBot` / `BotifyFlow` + `20260523140000_sprint_6_botify_domain` |
| G2 | APIs Nest | **✅** `/botify/bots`, `/botify/flows`, `publish`/`unpublish`, `import/wordpress`, `runtime/simulate`; JWT; `botify.service.spec.ts` |
| G3 | Motor no backend | **✅** `BotifyFlowEngineService` (LLM não roda no Nest; handoff real opcional com telefone + conexão `bot`) |
| G4 | Microserviço + flag | **✅** `BOTIFY_FLOW_SOURCE` + `omniconnect-flow-runtime.ts` |
| G5 | Vite → API Nest | **✅** `VITE_BOTIFY_DATA_SOURCE` + `botify-domain-api.ts` |
| G6 | Import WP → Omni | **✅** `POST /botify/import/wordpress` |
| G7 | WP fora do caminho crítico de **fluxos** | **✅** Runbook; `VITE_BOTIFY_DATA_SOURCE=omniconnect` remove WP da edição de grafos |

**Gates:** ordem G0→G2 antes do motor — mantida.

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

**Fase 1:** [`botify-phase1-operational-setup.md`](./botify-phase1-operational-setup.md).

**Fase 2 (validação):** [`botify-phase2-operational-validation.md`](./botify-phase2-operational-validation.md) — inclui `prisma migrate deploy`, curl do runtime interno, e ligação à matriz **`botify.handoff.created`** na secção §3.4 do piloto.

A seguir à Fase 2: critérios **A1–A8** e ambiente piloto em [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md).

1. **Migration Botify + fila Sprint 6:** `pnpm prisma migrate deploy` no backend (ver lista na Fase 2).  
2. Configurar `BOTIFY_INTERNAL_SYNC_SECRET` (backend + microserviço) e flags (`BOTIFY_FLOW_SOURCE`, `VITE_BOTIFY_DATA_SOURCE`) quando testar cutover.  
3. Opcional: ESLint `botify` (`no-explicit-any` como `error`).  
4. Paralelo: ADR **identidade Omni no Botify** (JWT + `UserTenant`) se o browser for emitir bridge como CRM/SAA.

---

## Ver também

- `docs/adr/ADR-0001-botify-tenancy-model.md` — tenancy Botify ↔ Omni  
- `docs/adr/ADR-0002-botify-wordpress-to-backend-cutover.md` — cutover WP → backend  
- `docs/migration/sprint-6-botify-flow-engine-inventory.md` — nós: motor vs UI  
- `docs/operations/botify-omniconnect-bridge.md` — runbook Botify ↔ Omni  
- `docs/09-roadmap.md` — Fase 3 Botify Triage  
- `docs/migration/pilot-flow-lead-to-recovery.md`  
- `docs/migration/botify-phase1-operational-setup.md` — Fase 1 (secrets + flags + Postgres local raiz)
- `docs/migration/botify-phase2-operational-validation.md` — Fase 2 (migrações + smoke interno)
- `packages/shared-types` — `botify-flow.ts`, `BotifyHandoffWebhookPayload`, `BotifyLeadSummary`  
- `packages/api-client` — emit browser + JWT (CRM/SAA); Botify handoff continua server-side (HMAC)
