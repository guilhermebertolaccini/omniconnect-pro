# Migração `taticaofc` → `omniconnect-pro`

Documentação de contexto e plano de migração para unificar 4 produtos num único monorepo chamado **`omniconnect-pro`**.

> **Status:** rascunho inicial — capturado a partir da conversa de planejamento em 15/05/2026.
> **Localização atual:** `taticaofc/docs/migration/`
> **Destino final:** quando o repositório `omniconnect-pro` for criado, esta pasta deve ser movida para a raiz do novo repo em `omniconnect-pro/docs/`.

## Índice

| # | Documento | O que tem dentro |
|---|---|---|
| 00 | [`00-context-and-decisions.md`](./00-context-and-decisions.md) | Histórico da conversa, decisões tomadas, racional do "por quê fazer isso" |
| 01 | [`01-projects-inventory.md`](./01-projects-inventory.md) | Inventário dos 5 projetos (taticaofc, botify, CRM, smart-ad, hub legado), stacks e estado |
| 02 | [`02-target-architecture.md`](./02-target-architecture.md) | Estrutura do monorepo `omniconnect-pro`, decisões de stack/tooling |
| 03 | [`03-migration-plan.md`](./03-migration-plan.md) | Plano em fases 0→8 com comandos concretos |
| 04 | [`04-insight-ai-patch-analysis.md`](./04-insight-ai-patch-analysis.md) | Análise do patch InsightAI MVP, problemas encontrados e correções |
| 05 | [`05-known-risks.md`](./05-known-risks.md) | Riscos técnicos (PII, OpenAI sync, auth, etc) |
| 06 | [`06-next-actions.md`](./06-next-actions.md) | Próximas decisões pendentes e ordem de execução |
| 07 | [`07-import-taticaofc-plan.md`](./07-import-taticaofc-plan.md) | Plano do próximo passo: importar backend + frontend do `taticaofc` em `apps/` |

## Como usar

- **Antes de importar o código do `taticaofc` no monorepo:** siga [`07-import-taticaofc-plan.md`](./07-import-taticaofc-plan.md).
- **Antes de começar a executar:** leia `00`, `01` e `06` na ordem.
- **Antes de aplicar o patch InsightAI:** leia `04` inteiro — tem 3 bloqueios reais que precisam ser resolvidos.
- **Para revisar a arquitetura proposta:** veja `02`.
- **Para executar a migração:** siga `03` passo a passo.

## Convenções deste doc

- Decisões marcadas como **✅ DECIDIDO** são definitivas.
- Decisões marcadas como **❓ PENDENTE** precisam ser respondidas pelo dono do projeto antes de executar.
- Problemas marcados como **🔴 BLOQUEADOR** quebram build/funcionalidade — devem ser tratados antes do go.
- Problemas marcados como **🟡 RISCO** funcionam tecnicamente mas têm impacto em custo/segurança/escala.
