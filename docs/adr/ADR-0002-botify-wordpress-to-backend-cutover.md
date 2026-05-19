# ADR-0002: Botify — cutover WordPress → `omniconnect-backend` (fonte de verdade)

**Status:** Proposed  
**Date:** 2026-05-18  
**Deciders:** Produto / engineering (aceitar explicitamente antes de implementar schema e APIs).

## Context

Hoje o Botify depende de **WordPress** como armazenamento e API de:

- Definição de **bots** e **fluxos** (grafo de nós, mensagens, delays, condições, ações).
- Persistência acoplada ao plugin PHP (`botflow-manager`) e REST exposto pelo WP.
- O **microserviço Node** (`wordpress-plugin/.../microservice`) lê e grava estado via `wordpress-client`, executa o motor (`flow-engine`) e integra WhatsApp / IA / ponte Omni.
- O **app Vite** (`apps/botify`) usa `wordpress-api.ts` / hooks para editar fluxos e operar chips.

Isso **diverge** do padrão OmniconnectPRO: domínio multi-tenant em **NestJS + Prisma + Postgres**, auth e RBAC unificados, observabilidade e testes no mesmo repositório que o core de conversas. A dependência de WP cria:

- Dois runtimes (PHP + Node + Vite) para um único produto “triagem”.
- Contratos frágeis (REST WP + JWT WP) e dificuldade de **garantir `tenantId`** em todas as camadas sem vazamentos.
- Duplicação de lógica (motor no microserviço vs nada equivalente no backend).

**Relacionado:** [ADR-0001](ADR-0001-botify-tenancy-model.md) fixa tenancy do **handoff** HMAC; não resolve onde os fluxos devem viver. Este ADR resolve a **fonte de verdade** do produto Botify.

## Decision

**Migrar a fonte de verdade de fluxos/bots do WordPress para o `omniconnect-backend`**, seguindo **Strangler Fig**:

1. **Modelar** fluxos como entidades Prisma **sempre com `tenantId`** (e relação com `Tenant`), versionadas ou com `publishedAt` / `draft` conforme design detalhado na Fase G1.
2. **Expor** CRUD e “publicar” via módulo Nest (`bot-flows` ou nome alinhado ao domínio), com `JwtAuthGuard`, DTOs validados e escopo estrito por tenant.
3. **Portar** a semântica do motor atual (`flow-engine.ts` e adjacências) para código **dentro do backend** (serviço + fila Bull onde fizer sentido), consumindo mensagens já normalizadas pelo pipeline Omni (WhatsApp/webhook) quando o bot estiver ativo.
4. **Encaminhar** o microserviço atual para consumir **definições e, se necessário, checkpoints** via API autenticada ao backend (token de integração ou padrão já usado em `IntegrationConnection`), até ser **fundido** ou reduzido a agente fino de canal.
5. **Cutover** do Vite: substituir chamadas `wordpress-api` por cliente HTTP ao backend (idealmente `packages/api-client` gerado/contratado).
6. **Descomissionar** o WordPress do **caminho crítico** (edição + execução). O plugin pode permanecer como **proxy legado** ou ferramenta de **importação** apenas durante a transição.

**Fora do escopo imediato deste ADR (podem ser ADRs próprios):**

- **Login Vite com JWT Omni** (substituir “WordPress-first” no browser) — pode ocorrer em paralelo, mas não é pré-requisito para persistir fluxos no Postgres.
- **Detalhe de schema** exato (`BotFlow` vs `BotFlowVersion` vs arestas normalizadas vs JSON document único) — a decisão aqui é **direção**; o desenho físico segue `database-prisma` / `add-prisma-model-multitenant`.

## Alternatives considered

- **Manter WP como CMS permanente dos fluxos** — rejeitado como estado final: perpetua dois stacks, dificulta isolamento por tenant e CI único; pode subsistir só como export legado.
- **Microserviço Botify como “mini-backend” isolado com Postgres próprio** — rejeitado: duplicaria padrões de auth, billing de mensagens, conversas e InsightAI já no core; aumenta custo operacional.
- **Big-bang rewrite do motor antes de qualquer API** — rejeitado: risco alto; Strangler Fig com import + dual-read permite validar paridade.

## Consequences

### Positive

- **Um** stack de dados operacional (Prisma) alinhado a `docs/03-multitenancy.md`.
- Testes E2E / contrato no mesmo app que `Conversations`, `MessageQueue`, `bot-bridge`.
- Caminho claro para políticas de InsightAI e handoff já desenhadas no core.

### Negative

- Esforço grande: import de dados, paridade do motor, regressão em clientes com WP existente.
- Período de **dual-run** (WP + backend) exige disciplina de feature flags e observabilidade.

### Neutral

- O microserviço Node pode permanecer temporariamente como **adaptador de canal** (Evolution, etc.) chamando o backend para decisões de fluxo.
- ADR-0001 continua válido para **resolução de tenant no handoff** até o emissor mudar.

## Phases (entrega incremental)

| Fase | Entrega | Notas |
|------|---------|--------|
| **G0** | Congelar contrato JSON do grafo (ex.: em `packages/shared-types`) espelhando o shape atual exportável do WP | Permite testes de import idempotente |
| **G1** | Migration Prisma + modelos tenant-scoped | Revisão multitenancy obrigatória |
| **G2** | Nest: CRUD + publicação + listagens paginadas | Sem motor ainda |
| **G3** | Motor de execução no backend + integração com entrada de mensagem | Reusar testes Vitest do microserviço como suite de referência |
| **G4** | Microserviço: `wordpress-client` substituído por cliente Omni (feature flag) | Dual-read opcional |
| **G5** | Vite: cutover API | Autenticação mínima acordada (API key tenant vs JWT) |
| **G6** | Script / job de import WP → Omni | Runbook + auditoria |
| **G7** | WP sai do caminho crítico; documentar desligamento | Atualizar `docs/operations/botify-omniconnect-bridge.md` |

## Notes

- Plano de produto: `docs/migration/sprint-6-botify-maturity-plan.md` — adicionar **Fase G**.
- Arquitetura macro: `docs/02-architecture.md`.
- Até aceite deste ADR, **não** criar tabelas novas sem review explícito de multitenancy.
