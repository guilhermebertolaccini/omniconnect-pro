# ADR-0002: Botify — cutover WordPress → `omniconnect-backend` (fonte de verdade)

**Status:** Accepted  
**Date:** 2026-05-18  
**Accepted:** 2026-05-19  
**Deciders:** Produto / engineering

## Context

Hoje o Botify depende de **WordPress** como armazenamento e API de:

- Definição de **bots** e **fluxos** (grafo de nós, mensagens, delays, condições, ações).
- Persistência acoplada ao plugin PHP (`botflow-manager`) e REST exposto pelo WP.
- O **microserviço Node** (`apps/botify/wordpress-plugin/.../microservice`) lê e grava estado via `wordpress-client`, executa o motor (`flow-engine`) e integra WhatsApp / IA / ponte Omni.
- O **app Vite** (`apps/botify`) usa `wordpress-api.ts` / hooks para editar fluxos e operar chips.

Isso **diverge** do padrão OmniconnectPRO: domínio multi-tenant em **NestJS + Prisma + Postgres**, auth e RBAC unificados, observabilidade e testes no mesmo repositório que o core de conversas.

**Relacionado:** [ADR-0001](ADR-0001-botify-tenancy-model.md) fixa tenancy do **handoff** HMAC; não resolve onde os fluxos devem viver. Este ADR resolve a **fonte de verdade** do produto Botify.

## Decision

**O `omniconnect-backend` é a fonte de verdade futura** de bots e fluxos Botify. **WordPress** permanece **apenas** como camada **transitória / legado / importação / proxy**, até remoção do caminho crítico (G7).

A migração segue **Strangler Fig** — **sem big-bang**, **sem remover WordPress agora**, **sem portar o motor antes de:**

1. Congelar o contrato JSON do grafo em `packages/shared-types` (G0).
2. Criar o schema **multi-tenant** em Prisma após **review explícito de multitenancy** (G1).

Ordem obrigatória de entrega: **G0 → G1 (schema mínimo) → G2 (CRUD + publish) → G3 (motor) → G4–G7**.

## Condições obrigatórias

1. Toda entidade nova Botify no Postgres tem **`tenantId`** (e queries sempre escopadas).
2. **Não** aceitar `tenantId` do body (nem de import cru) quando puder ser derivado de **JWT / API key / integration** — validar server-side.
3. **Primeiro** o contrato JSON do grafo em `packages/shared-types` (`botify-flow.ts`) — **depois** Prisma.
4. **Schema Prisma** só após **review multitenancy** (skill / checklist interno).
5. **CRUD + publish** antes do **motor** no backend.
6. **Feature flag** da fonte dos fluxos: `wordpress` | `omniconnect` | `dual` até cutover completo.
7. Import **WP → Omni** **idempotente** (chaves externas estáveis, sem duplicar grafos).
8. **Testes de isolamento por tenant** para módulo Botify (API + serviços) antes de declarar G2 fechado.
9. Manter **`docs/migration/sprint-6-botify-maturity-plan.md`** alinhado a estas fases.
10. **Compatibilidade** com o **microserviço atual** até cutover completo (dual-read / flag).

**Handoff** para Omni continua definido em contrato bridge (`botify-bridge.ts` + evento `botify.handoff.created`); no grafo, o nó **`action`** com `actionType: 'transfer'` é o análogo de “handoff interno” até unificação de nomenclatura.

## Alternatives considered

- **Manter WP como CMS permanente** — rejeitado como estado final.
- **Microserviço Botify com Postgres próprio** — rejeitado.
- **Big-bang (motor primeiro)** — rejeitado.

## Consequences

### Positive

- Um stack Prisma; CI e testes no mesmo repositório que conversas, bridges e InsightAI.

### Negative

- Período longo de dual-run; exige disciplina de feature flags e observabilidade.

### Neutral

- Microserviço Node pode permanecer como adaptador de canal durante a transição.

## Phases (G0–G7)

| Fase | Entrega | Notas |
|------|---------|--------|
| **G0** | Contrato JSON em `packages/shared-types/src/botify-flow.ts` (Bot, Flow, Node, Edge, tipos de dados, legado + canónico, funções puras) | **Sem** Prisma; **sem** motor |
| **G1** | Migration Prisma + modelos **tenant-scoped** (schema mínimo; preferência por grafo versionado JSON se simplificar) | Review multitenancy **antes** do merge |
| **G2** | Nest: `GET/POST /botify/bots`, `GET/POST/PATCH /botify/flows`, `POST .../publish` (paginação, DTOs, guards) | Testes isolamento tenant |
| **G3** | Motor no backend (portar `flow-engine`) | Só após G2 estável |
| **G4** | Microserviço lê fluxos do Omni (**flag** `wordpress` / `omniconnect` / `dual`) | `wordpress-client` permanece até cutover |
| **G5** | Vite: substituir `wordpress-api` para fluxos por API Nest | Auth acordada |
| **G6** | Importador idempotente WP → Omni | Runbook + auditoria |
| **G7** | WP fora do caminho crítico | Atualizar runbooks |

## Notes

- Plano Sprint 6: `docs/migration/sprint-6-botify-maturity-plan.md`.
- Arquitetura: `docs/02-architecture.md`.
- `tenantId` e padrões: `docs/03-multitenancy.md`.
