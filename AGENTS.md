# AGENTS.md — OmniconnectPRO

> Instructions for any AI agent or developer working on this repository (Cursor, Codex, Claude, human contributors).

## Product summary

OmniconnectPRO is a **multi-tenant Growth Operations platform**.

It combines:
- Omnichannel conversations (WhatsApp first, then Instagram, Messenger, Email, SMS, RCS)
- Campaigns and broadcasts
- Botify chatbot/AI flows
- Real estate CRM
- Commercial pipeline
- InsightAI conversation analytics
- Executive dashboards
- Analyst-led optimization service

The goal is to help companies identify **where leads are lost** between marketing, conversations, sellers and sales.

## Monorepo

This is a **pnpm workspace monorepo**:

```
apps/
├── omniconnect-backend/      # NestJS + Prisma + Postgres + Bull (core)
├── omniconnect-frontend/     # React (operação)
├── botify/                   # React (bot/triagem)
├── crm-imobiliario/          # React + Supabase (CRM)
└── smart-ad-automator/       # React + Supabase (campanhas pagas)

packages/
├── ai-contracts/             # Tipos InsightAI compartilhados
├── shared-types/             # DTOs comuns entre apps
├── api-client/               # Helpers HTTP compartilhados (ex.: bridge emit)
└── tsconfig/                 # tsconfig base
```

Apps comunicam via HTTP/eventos, **nunca por import direto**.

## Main business domains

### Tenants
Tenant representa cliente/empresa/conta. **Toda entidade operacional pertence a um tenant.**

### Leads
Contato comercial. Origens: ads, WhatsApp, formulários, landing pages, imports, campanhas, manual.

### Conversations
Agrupam mensagens por canal. Canais: WhatsApp, Instagram, Messenger, Email, SMS, RCS (futuro).

### Messages
Pertencem a conversas. Preservam: direção, sender, channel, timestamp, content, attachments, providerMessageId.

### CRM
Deals, pipeline stages, sellers, proposals, visits, follow-ups, loss reasons, real estate units.

### InsightAI
Análise de conversas para inferir: leadIntent, objeção, qualidade do vendedor, abandono, oportunidade perdida, próximo melhor passo, score comercial.

## Technical principles

1. **API-first** — toda capability exposta como endpoint documentado
2. **Multi-tenant by default** — `tenantId` em tudo
3. **Secure by default** — validar, autorizar, isolar
4. **Event-driven** onde fizer sentido
5. **Human-in-the-loop AI** — IA é recomendação, humano decide
6. **Modular backend** — boundaries claros
7. **Typed frontend** — sem `any`
8. **Observable** — logs estruturados, métricas, traces
9. **Mínimo acoplamento** entre módulos/apps
10. **Documentação faz parte da entrega**

## Security principles

- ❌ Não confie em dados do client
- ❌ Não confie em webhook payloads sem validar
- ❌ Não exponha secrets
- ❌ Não retorne dados de outro tenant
- ❌ Não use raw SQL sem parametrização
- ❌ Não armazene dados pessoais desnecessários
- ❌ Não logue secrets ou conteúdo bruto de mensagens
- ✅ Sempre valide inputs
- ✅ Sempre cheque permissões
- ✅ Sempre inclua tenant scope em queries

Detalhes em `docs/04-security.md`.

## How to work on features

### Before coding

1. Leia docs relevantes em `docs/`
2. Identifique módulos afetados
3. Cheque comportamento multi-tenant
4. Cheque implicações de segurança
5. Cheque impacto no banco
6. Cheque impacto na API
7. Crie/atualize testes
8. Atualize docs

### During coding

- Conventional Commits (ver `.cursor/rules/50-commits.mdc`)
- Commits pequenos e frequentes
- Testes junto do código

### Before commit

```bash
pnpm lint
pnpm test
pnpm build
pnpm audit                  # se mudou deps
```

### Pull request

Inclua:
- Resumo do que mudou
- Módulos afetados
- Como testar
- Risk review (tenant isolation, auth, PII, migration, dependências)
- Plano de rollback se aplicável

Template completo em `docs/08-development-workflow.md`.

## Preferred delivery format

When implementing a feature, provide:

- Changed files
- What was added (and why)
- How to test (commands, curls, screenshots)
- Migration notes (if schema/DB changed)
- Security considerations
- Multi-tenant considerations
- Next recommended step

## Cursor configuration

Project rules and skills are in `.cursor/`:

- `.cursor/rules/*.mdc` — coding standards aplicados automaticamente por scope
- `.cursor/skills/<name>/SKILL.md` — procedimentos especializados invocáveis

Antes de implementar features que envolvem:

| Tipo de trabalho | Skill |
|---|---|
| Aplicar o patch InsightAI | `apply-insight-ai-patch` |
| Importar produto para o monorepo | `migrate-product-to-monorepo` |
| Adicionar model Prisma com tenantId | `add-prisma-model-multitenant` |
| Criar bridge entre apps | `create-bridge-endpoint` |
| Implementar feature backend | `backend-nestjs` |
| Implementar feature frontend | `frontend-react` |
| Schema design complexo | `database-prisma` |
| Trabalhar no InsightAI | `insight-ai` |
| Review de segurança | `security-review` |
| Review de multi-tenancy | `multitenancy-review` |
| Priorizar features | `product-owner` |

## Prompt padrão para tarefas

Quando pedir algo ao agente:

```
Leia antes:
- AGENTS.md
- docs/02-architecture.md
- docs/03-multitenancy.md
- docs/04-security.md
- .cursor/rules/00-core-principles.mdc
- .cursor/skills/<skill-relevante>/SKILL.md

Tarefa:
[descreva]

Contexto:
OmniconnectPRO — multi-tenant Growth Operations platform.

Requisitos obrigatórios:
- Manter isolamento por tenant
- Validar DTOs
- Não expor dados sensíveis
- Não usar raw SQL sem necessidade
- Atualizar docs se criar endpoint/módulo
- Adicionar testes para lógica crítica
- Explicar riscos e como testar

Entrega esperada:
- Arquivos alterados
- Resumo da implementação
- Comandos para testar
- Pontos de atenção
- Próximos passos
```

## Operating discipline

Para este projeto, o agente sempre opera em **3 etapas**:

1. **Entender** a arquitetura atual e o impacto
2. **Propor** plano técnico (especialmente se for mudança grande)
3. **Implementar** com segurança

Não "sair codando" direto em features que afetam multi-tenancy, auth, schema crítico ou IA. Para essas, sempre apresentar plano antes.
