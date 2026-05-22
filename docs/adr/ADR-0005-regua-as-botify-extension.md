# ADR-0005: Régua de Acionamento — extensão do flow engine do Botify

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** Produto / engineering OmniconnectPRO

## Context

O app shell (`apps/omniconnect-hub`) traz uma superfície chamada **Régua
de Acionamento** (rota `/journeys` + `/journeys/builder`) com um grafo de
nodes drag-and-drop. Os tipos de node hoje no mock
(`apps/omniconnect-hub/src/lib/leads-data.ts`):

```ts
export type JourneyNodeType =
  | "trigger" | "delay" | "condition" | "pacing"
  | "email" | "sms" | "rcs" | "hsm" | "bot"
  | "stage" | "notify";
```

Em paralelo, a [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md)
já decidiu migrar o engine de fluxos do Botify (hoje em WordPress) para o
`omniconnect-backend` em fases G0–G7:

- G0: contrato JSON em `packages/shared-types/src/botify-flow.ts`.
- G1: schema Prisma multi-tenant.
- G2: CRUD + publish.
- G3: motor (port do `flow-engine`).
- G4–G7: cutover WP → Nest, importador idempotente, retirada do WP.

A sobreposição entre o que a Régua precisa fazer (executar um grafo de
nodes com triggers, condições, delays, sends por canal, handoff, mudança
de stage) e o que o engine Botify já está construindo (mesmas estruturas
de grafo, motor, persistência) é **quase total**. A única diferença
prática são os **sinks** de canal: Botify originalmente despacha pra um
bot WhatsApp; a Régua despacha pra email, SMS, RCS, HSM, mudança de
estágio CRM e notificações operacionais.

Sem decisão formal, o time pode acabar construindo **dois motores**
paralelos (um em `botify/` e outro em `journeys/`), duplicando schema de
grafo, runner BullMQ, persistência de run logs, eventos de domínio,
e ferramentas de observabilidade.

## Decision

A **Régua de Acionamento implementa-se como extensão do flow engine do
Botify**, não como módulo separado.

Mais concretamente:

1. **Schema de grafo é único.** Os modelos Prisma definidos na fase G1
   da [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md)
   (provisoriamente nomeados `BotifyFlow` / `BotifyFlowNode` /
   `BotifyFlowEdge` ou equivalente — nome canônico fixa em G1) atendem
   também a Régua. **Renomear** para nomes neutros (`Flow`, `FlowNode`,
   `FlowEdge`) é tolerável em G1 — não criar `JourneyDefinition` /
   `JourneyNode` separados.

2. **Tipos de node são abertos.** Os node types da Régua
   (`email`, `sms`, `rcs`, `hsm`, `stage`, `notify`) entram no mesmo enum
   do contrato `botify-flow.ts` ou se adicionam via campo `actionType` /
   `nodeKind` discriminator. **Não criar enum separado**.

3. **Motor é único.** O runner BullMQ entregue na fase G3 da ADR-0002
   processa fluxos Botify *e* Régua. A distinção entre "fluxo é bot" vs
   "fluxo é régua" é classificação de UX (qual app shell mostra ele),
   não duplicação de runtime.

4. **Sinks por canal são plugáveis.** Cada node type que faz envio
   (`email`, `sms`, `rcs`, `hsm`, `whatsapp-bot`) chama um sink
   correspondente. Sinks são serviços NestJS isolados que aceitam um
   contrato comum `dispatch(tenantId, runId, nodeId, payload)`. Adicionar
   um sink novo é uma extensão, não um motor novo.

5. **Guards são compartilhados.** Antes de cada send, o motor invoca
   guards em sequência:
   - Wallet (`TenantWallet.debitForSend`) — Sprint Foundation F2.
   - Anti-fadiga (`AntiFatigueRule.checkBeforeSend`) — Sprint Foundation F3.
   - Template missing.
   - Line-health (para canais que dependem dela — sprint Quick-wins).

   Cada guard retorna `{ allowed: boolean, reason?: string }` e emite
   `flow.guard.blocked` em caso negativo, com `severity: warning`.

6. **Trigger sources são unificados.** O motor aceita triggers iniciais
   por:
   - Evento de domínio (`lead.created`, `conversation.closed`, etc.).
   - Manual via endpoint (`POST /flows/:id/runs`).
   - Scheduled (cron / `BullMQ repeatable`).

   A Régua não inventa um sistema de triggers próprio.

7. **Frontend "Régua" e "Botify"** continuam como apps shell distintos
   (`apps/omniconnect-hub` mostra `/journeys`, `apps/botify` mostra o
   editor original), mas ambos consomem **as mesmas APIs Nest**
   (`/flows`, `/flows/:id/publish`, `/flows/:id/runs`, etc., nomes
   canônicos fechados em G2). Cada um filtra "seus" fluxos pelo
   `nodeKind` predominante ou por tag (`flow.tags = ['regua']` /
   `['botify']`).

## Alternatives considered

- **Motor separado (`journeys/`) com schema próprio (`JourneyDefinition`).**
  Rejeitada. Duplica grafo, persistência, runner, eventos. Implica
  manter sincronia entre duas implementações se a semântica de node
  comum (delay, condition) evoluir. Custo de manutenção indefinido.

- **Botify mantém WordPress e Régua nasce direto no Nest.** Rejeitada
  porque contradiz [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md)
  (que está em curso). Não há benefício em paralelizar duas migrações
  do mesmo conceito.

- **Régua vira sub-feature de `campaigns/`** (o módulo legado de
  broadcasts). Rejeitada. `campaigns/` modela um envio em massa de
  template para uma audiência estática, sem grafo, sem condições, sem
  estado de run. Não tem o shape que a Régua exige.

## Consequences

### Positive

- **Um motor, uma fila BullMQ, uma trilha de eventos.** Todos os flow
  runs (Botify ou Régua) seguem o mesmo padrão de observabilidade,
  retry, dedup por `jobId` determinístico.
- **Sinks reutilizáveis.** `EmailSink` / `SmsSink` etc. servem tanto pra
  Régua quanto pra qualquer feature futura que precise mandar mensagem
  via journey-like (ex.: notificação operacional, broadcast condicional).
- **Roadmap previsível.** Conforme a fase G da ADR-0002 evolui, a Régua
  ganha capacidade automaticamente:
  - G1 fecha → schema disponível pra Régua.
  - G2 fecha → CRUD + publish prontos pra ambos os apps.
  - G3 fecha → execução real.
- **Audit + Eventos canônicos.** Eventos `flow.run.started`,
  `flow.run.completed`, `flow.guard.blocked`, `flow.node.executed`
  servem ambos os contextos sem inventar `journey.*` paralelos.

### Negative

- **Régua bloqueada por G2.** Não dá para executar a Régua antes que
  Botify G2 (CRUD + publish) feche. Isso pode parecer regressão em
  velocidade, mas é a alternativa correta vs. duplicação.
- **Acoplamento bidirecional.** Mudanças no schema/motor que beneficiam
  só Botify afetam Régua e vice-versa. Mitigação: review de
  multitenancy obrigatório por ADR-0002 condição 4; testes de
  isolamento por tenant em cada fase G.
- **Nome do módulo.** `botify-flows/` no Nest pode ficar confuso quando
  Régua começar a usar. **Renomear** para `flows/` (ou `flow-engine/`)
  em G1 é a forma natural; deixar `botify-*` reservado pro adapter de
  canal WhatsApp-bot.

### Neutral

- O app shell continua mostrando Régua e Botify como duas experiências
  distintas — porque do ponto de vista do usuário, são. A unidade fica
  no backend.

## Dependências e ordem

- **Sprint Foundation** (esta sprint) entrega os guards (Wallet,
  AntiFadiga) **antes** da Régua executar. F1/F2/F3 não dependem desta
  ADR e podem rodar em paralelo às fases G.
- **Sprint Quick-wins** (paralela) entrega Leads 360°, Line-health
  policy, Guards audit — independentes do engine.
- **Sprint Régua-Engine** (futura) só começa depois de Botify G2 fechado.
  Ela materializa os sinks (`email`, `sms`, `rcs`, `hsm`, `stage`,
  `notify`), os trigger sources, e a UI `/journeys/builder` consumindo
  as APIs unificadas.
- **Sprint Régua-Hardening** (futura) fecha E2E tenant isolation +
  rate-limit + audit + runbook.

## Notes

- Caso a fase G1 da ADR-0002 já tenha pinned um nome de modelo
  (`BotifyFlow`), avaliar renomeação no mesmo PR para evitar débito
  técnico de naming. Decisão fica na G1 PR review.
- Renomear `apps/botify/wordpress-plugin/botflow-manager/microservice`
  para algo neutro (`apps/flow-microservice`) está **fora** desta ADR.
- Multi-rule anti-fadiga **por carteira** (sugerido pelo mock em
  `apps/omniconnect-hub/src/lib/leads-data.ts`) **não** está no escopo
  da ADR. F3 da Foundation entrega 1 regra global por tenant; se a
  Régua exigir multi-escopo, abrir ADR-0006 separada.

## Ver também

- [ADR-0001](ADR-0001-botify-tenancy-model.md) — tenancy do handoff Botify.
- [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md) — cutover WP → Nest (G0–G7).
- [ADR-0003](ADR-0003-hub-identity-and-roles.md) — identidade do Hub.
- [ADR-0004](ADR-0004-hub-into-monorepo.md) — Hub no monorepo.
- `docs/migration/06-next-actions.md` — estado atual e roadmap das sprints.
- `docs/migration/sprint-6-botify-maturity-plan.md` — plano operacional Botify.
- `apps/omniconnect-hub/src/lib/leads-data.ts` — `JourneyNodeType` (referência do mock).
