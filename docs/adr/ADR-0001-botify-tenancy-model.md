# ADR-0001: Modelo de tenancy Botify ↔ OmniconnectPRO

**Status:** Accepted  
**Date:** 2026-05-18  
**Deciders:** Equipa produto/engineering OmniconnectPRO (revisão na implementação da Sprint 6).

## Context

O Botify (app Vite + plugin WordPress + **microserviço Node**) envia handoffs humanos para o `omniconnect-backend` via **`POST /webhooks/botify`** com HMAC e header **`x-integration-id`** (UUID de `IntegrationConnection`).

O backend **não** deve confiar em `tenantId` ou identificadores de tenant no corpo JSON do utilizador final: o **`tenantId` efetivo** deve ser resolvido a partir da ligação de integração **autenticada** (id + segredo), como nos outros bridges (`docs/03-multitenancy.md`).

Existem dois cenários de implantação:

1. **Piloto / SMB:** uma instalação WordPress + um microserviço por **um** cliente Omni (1:1).
2. **Plataforma (futuro):** um único cluster Botify serve **vários** tenants Omni — exige mapeamento explícito e segregação operacional.

Sem decisão documentada, o risco é configurar **uma** `IntegrationConnection` partilhada ou derivar tenant de payload, causando **handoff no tenant errado** (quebra de isolamento).

## Decision

### Caminho padrão (aceite hoje): **1 instalação Botify ↔ 1 tenant Omni**

- Cada ambiente de execução do microserviço tem **um** par fixo nas variáveis de ambiente:
  - `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID` = UUID de uma linha `IntegrationConnection` com `provider = 'bot'` e `tenantId = <cliente>` no Postgres Omni.
  - `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET` = segredo em texto plano **igual** ao valor usado para gerar `webhookSecretEncrypted` dessa linha.
- O backend resolve **`tenantId`** exclusivamente a partir dessa conexão (fluxo já implementado no módulo bot-bridge). O `data` do webhook **não** transporta `tenantId` para autorização.

Este modelo é obrigatório para **piloto** e recomendado para a maioria dos clientes até existir produto multi-tenant no Botify.

### Caminho futuro (plataforma): **multi-tenant no Botify** — só com mapeamento explícito em servidor

Se vários clientes Omni partilharem **o mesmo** deploy do microserviço:

1. **Preferido:** **uma réplica / segredo por cliente** (ex.: um Coolify stack por tenant, ou variáveis injetadas por namespace) — cada réplica mantém o modelo 1:1.
2. **Alternativa (único processo):** tabela ou configuração **só no servidor** que mapeia **`(origem estável) → connectionId (+ material de HMAC)`**, por exemplo:
   - chave: `bot_id` WordPress, ou `WORDPRESS_SITE_URL` + `bot_id`, ou hostname do site;
   - valor: UUID `IntegrationConnection` **e** segredo correspondente **desse** tenant (nunca um segredo global partilhado entre tenants).

Regras **não negociáveis:**

- **Nunca** escolher `IntegrationConnection` ou `tenantId` com base em texto livre do contacto, payload WhatsApp, ou campos `data` do handoff.
- **Nunca** reutilizar o mesmo segredo HMAC entre dois tenants Omni em produção (rotação = nova linha `IntegrationConnection` por tenant).

### Identidade no browser (app `apps/botify`)

O login do operador Botify continua **WordPress-first**. O encaminhamento **cutover** para JWT Omni + `UserTenant` no Vite é **fora do âmbito** desta ADR e exige ADR próprio (OAuth/workspace picker, isolamento de dados WP vs Omni).

## Alternatives considered

- **JWT no microserviço emitindo `POST /integrations/bridge/events`:** alinhado a CRM/SAA, mas exige identidade Omni no servidor Botify e renovação de tokens — adiado; HMAC + `IntegrationConnection` permanece o contrato do microserviço.
- **Um único `IntegrationConnection` “partilhado” com `tenantId` no body:** rejeitado — viola isolamento; o body não é fonte de verdade para tenant.
- **Derivar tenant só pelo número WhatsApp:** rejeitado — ambíguo entre clientes e exposto a abuso se o payload for manipulado no meio sem HMAC correto (o HMAC já fixa a conexão; não expandir regras ad hoc).

## Consequences

### Positive

- Isolamento **igual** ao dos outros bridges: tenant vem da linha `IntegrationConnection` verificada pelo id + segredo.
- Piloto simples: três variáveis no microserviço (URL + connection id + secret).
- Runbooks existentes (`docs/operations/botify-omniconnect-bridge.md`, `integration-connections.md`) mantêm-se válidos.

### Negative

- Multi-tenant num **único** processo exige engenharia adicional (mapa de conexões, rotação por tenant, observabilidade por tenant) — não há atalho “uma env para todos”.
- WordPress multi-site pode ter vários `bot_id`; sem mapa servidor-side, só o modelo 1:1 por deploy é seguro.

### Neutral

- O app Vite `botify` **não** precisa do UUID da bridge para handoff (quem fala com Omni no triage server-side é o microserviço). Tipos partilhados (`@omniconnect/shared-types`) servem contrato documental no front.

## Notes

- Critérios de aceite Sprint 6 Fase E: este ADR + secção operacional em `docs/operations/integration-connections.md` (mapeamento multi-tenant).
- Relacionado: `docs/migration/sprint-6-botify-maturity-plan.md`, `.cursor/rules/01-multitenancy.mdc`.
- **Fonte de verdade dos fluxos (WordPress vs backend):** ver [ADR-0002](ADR-0002-botify-wordpress-to-backend-cutover.md) — independente desta ADR de tenancy no handoff.
