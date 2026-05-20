# Botify — Fase 2 (validação pós-Fase 1)

Objetivo: **provar** que o cutover interno (Nest ↔ microserviço) e as migrações Sprint 6 estão aplicáveis e verificáveis, **antes** de fechar o piloto de produto em [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md).

**Pré-requisito:** [Fase 1](./botify-phase1-operational-setup.md).

### Script executável (recomendado)

Na raiz do monorepo, com backend a correr e `jq` + `curl` instalados:

```bash
cp scripts/botify-pilot-validation.env.example scripts/botify-pilot-validation.env
# editar: BOTIFY_INTERNAL_SYNC_SECRET, OMNICONNECT_LOGIN_PASSWORD, etc.

./scripts/botify-pilot-validation.sh
```

O script cobre os passos **1–9** (migrações, health, JWT, bot/fluxo/conta Meta, internal runtime/routing, simulate, health do microserviço). O passo **10** (webhook Meta real, handoff, CRM) fica documentado no output e em [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md).

Flags úteis: `--skip-migrate`, `--skip-create`, `--cleanup` (apaga recursos criados nesta execução).

Para validar o trecho de handoff server-to-server local (`POST /webhooks/botify` → `IntegrationEvent` → `MessageQueue` + dedupe):

```bash
./scripts/botify-handoff-validation.sh
```

Para validar o caminho com **webhook Meta simulado** passando pelo microserviço Botify (`/webhooks/meta` → runtime Omni → nó `transfer` → handoff):

```bash
./scripts/botify-meta-webhook-validation.sh
```

Fluxos HSM / SAA / orgânico: [`botify-inbound-channels-flow.md`](./botify-inbound-channels-flow.md).

---

## 1. Migrações no `omniconnect-backend`

Na raiz do monorepo, com Postgres e `.env` do backend correctos:

```bash
pnpm --filter omniconnect-backend exec prisma migrate status
pnpm --filter omniconnect-backend exec prisma migrate deploy
```

Aceite:

- Lista inclui **`20260522120000_sprint_6_message_queue_lead_summary`** aplicada.
- Lista inclui **`20260523140000_sprint_6_botify_domain`** aplicada.
- Lista inclui **`20260525100000_sprint_6_botify_meta_accounts`** aplicada (Chips Omni).

---

## 2. Smoke interno `GET /botify/internal/flows/:flowId/runtime-config`

1. Definir no **backend** e no **microserviço** o mesmo `BOTIFY_INTERNAL_SYNC_SECRET` (ver Fase 1).
2. Criar no Omni (via API JWT ou script) pelo menos um `BotifyFlow` **publicado** no tenant alvo, ou usar um `flowId` conhecido após import WP.
3. Chamada (substituir `FLOW_ID` e o host):

```bash
export BOTIFY_INTERNAL_SYNC_SECRET='...'   # mesmo valor do .env backend
curl -sS -H "Authorization: Bearer ${BOTIFY_INTERNAL_SYNC_SECRET}" \
  -H "X-Omni-Tenant-Id: default-tenant" \
  "http://localhost:3000/botify/internal/flows/FLOW_ID/runtime-config"
```

Aceite esperado:

- **`401`** se o segredo estiver em falta no servidor ou Bearer incorreto.
- **`400`** se `X-Omni-Tenant-Id` for inválido (formato slug/UUID conforme `@omniconnect/shared-types` `isValidBotifySyncTenantId`).
- **`404`** se o fluxo não existir ou não pertencer ao tenant.
- **`200`** + JSON com `nodes`, etc., quando fluxo válido.

---

## 3. Smoke `GET /health`

- **Backend:** `botifyInternalSync.configured === true` após definir `BOTIFY_INTERNAL_SYNC_SECRET`.
- **Microserviço:** `botifyFlow.flowSource`; com URL + secret + `OMNICONNECT_BOTIFY_TENANT_ID` preenchidos, `botifyFlow.omniconnectRuntimeConfigured === true` (útil mesmo com modo `wordpress` para preload antes do cutover).

---

## 4. Matriz piloto §3.4

Campos obrigatórios do handoff **`botify.handoff.created`** alinhados ao dispatcher estão consolidados na secção **§3.4** de [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md) (não duplicar aqui).

---

## 5. Settings — canal + routing (G7 D4)

Com `VITE_BOTIFY_DATA_SOURCE=omniconnect` e login Omni:

1. **Configurações** → bot → credenciais Meta (`phoneNumberId`, `accessToken`) → salvar → badge **Conectado**.
2. **Routing:** `metaWabaAccountId` + **fluxo publicado** em `defaultFlowId` → salvar.
3. Microserviço: `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` no `.env`; URL webhook = `{MICROSERVICE}/webhooks/meta`.

---

## 6. Próximo bloco depois da Fase 2

1. **G7 — zero WP:** [`botify-g7-wordpress-removal.md`](./botify-g7-wordpress-removal.md).  
2. Piloto: critérios A1–A8 em [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md), seeds / `IntegrationConnection`.
