# Architecture Decision Records (ADR)

Esta pasta guarda **Architecture Decision Records** — decisões arquiteturais importantes, com contexto, alternativas consideradas e consequências.

## Quando criar um ADR

- Escolha entre alternativas com trade-offs significativos
- Decisão que afetará o projeto por anos
- Decisão controversa ou complexa
- Decisão que reverter custaria muito

## Template

Use o formato simples:

```markdown
# ADR-NNN: <Título curto da decisão>

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Date:** YYYY-MM-DD
**Deciders:** <quem decidiu>

## Context

Qual problema estamos tentando resolver? Quais constraints?

## Decision

O que decidimos fazer. Direto ao ponto.

## Alternatives considered

- Alternativa A: ... — rejeitada porque ...
- Alternativa B: ... — rejeitada porque ...

## Consequences

### Positive
- ...

### Negative
- ...

### Neutral
- ...

## Notes

(opcional — links, contexto adicional)
```

## Numeração

`ADR-0001-<kebab-case-title>.md`, `ADR-0002-<...>.md`, etc. Sequencial, sem reuso.

## Registro de ADRs

| ID | Título |
|----|--------|
| [ADR-0001](ADR-0001-botify-tenancy-model.md) | Modelo de tenancy Botify ↔ OmniconnectPRO |
| [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md) | Botify — cutover WordPress → backend (fonte de verdade) |

## ADRs sugeridos para criar cedo

- `ADR-0003-supabase-hybrid-strategy.md` (estado legado CRM/SAA)
- `ADR-0004-event-driven-internal-bus.md` (contratos estáveis além de `system-events`)
