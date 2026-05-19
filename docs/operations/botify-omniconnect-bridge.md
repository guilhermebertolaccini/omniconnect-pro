# Runbook — Botify (BotFlow) ↔ OmniconnectPRO

Conecta o **microserviço Node** do BotFlow Manager (`apps/botify/wordpress-plugin/botflow-manager/microservice`) ao **`omniconnect-backend`** para **handoff humano**: ao executar o nó de ação **“Transferir para atendente”** no fluxo, o microserviço envia um webhook assinado que cria/atualiza `Contact` e enfileira `MessageQueue` no tenant correto.

**Código de referência:**

- Emissor: `apps/botify/wordpress-plugin/botflow-manager/microservice/src/services/omniconnect-bridge.ts`
- Disparo: `.../microservice/src/engine/flow-engine.ts` (`actionType === 'transfer'`)
- Receptor: `POST /webhooks/botify` — `apps/omniconnect-backend/src/bot-bridge/`
- Dispatcher: `BridgeEventDispatcherService.createBotifyHandoff` — `integration-events/bridge-event-dispatcher.service.ts`

---

## Pré-requisitos no Omni

1. **Tenant** ativo com usuários operacionais.
2. **`IntegrationConnection`** com `provider` compatível com bridge Botify (valor interno `bot` — ver Prisma / módulo bot-bridge).
3. **`webhookSecretEncrypted`** preenchido com o **mesmo segredo em texto** que o microserviço usa em `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET` (criptografia no Omni via fluxo documentado em `integration-connections.md`).
4. Anotar o **`IntegrationConnection.id`** (UUID) — vai para `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID`.

---

## Variáveis no microserviço

Definir no `.env` do microserviço (nunca commitar valores reais):

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `OMNICONNECT_API_URL` | Sim* | Base URL do backend (ex.: `https://api.seudominio.com`), sem barra final |
| `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID` | Sim* | UUID da `IntegrationConnection` (header `x-integration-id`) |
| `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET` | Sim* | Segredo HMAC em texto plano (igual ao configurado na conexão Omni) |

\*Se qualquer uma faltar, o handoff é **ignorado** (log de aviso) — útil em dev sem Omni.

Ver também: `microservice/.env.example`.

---

## Contrato do webhook

- **Método:** `POST {OMNICONNECT_API_URL}/webhooks/botify`
- **Headers:**
  - `Content-Type: application/json`
  - `x-integration-id`: UUID da conexão
  - `x-signature`: HMAC-SHA256 do **raw body** em hex (mesmo algoritmo que o backend valida em produção)
  - `idempotency-key`: recomendado `botify:handoff:{externalId}`

### Corpo JSON (envelope)

```json
{
  "eventType": "botify.handoff.created",
  "externalId": "botify:flow:<flowId>:conv:<conversationId>:transfer",
  "occurredAt": "2026-05-18T12:00:00.000Z",
  "source": "botify-microservice",
  "data": {
    "phone": "+5511999990001",
    "name": "Opcional",
    "message": "Texto opcional para a fila",
    "segment": 1,
    "leadSummary": {
      "intent": "qualificado",
      "urgency": "alta",
      "budget": "até 500k",
      "region": "Zona Sul",
      "propertyInterest": "2 quartos",
      "notes": "Quer visita esta semana",
      "flowId": "flow-uuid-opcional",
      "flowName": "Triagem imóveis",
      "lastUserMessage": "Última mensagem do contato",
      "lastAssistantReply": "Última resposta do bot (ex.: nó IA)",
      "collectedFields": { "quartos": "3", "tipo": "apartamento" }
    }
  }
}
```

### Campo `data` (processado pelo dispatcher)

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| `phone` | **Sim** | E.164 ou número normalizado; sem `phone` o evento falha no dispatcher |
| `name` | Não | Alternativa suportada no backend: `contactName` |
| `message` | Não | Default: mensagem genérica de handoff |
| `segment` | Não | Inteiro; alinhado a `Contact.segment` / fila |
| `leadSummary` | Não | Objeto de triagem; ver tabela abaixo. Persistido em `MessageQueue.leadSummary` (JSON) e anexado à conversa ao desenfileirar |

### `leadSummary` (opcional)

Objeto **plano** (sem aninhar JSON arbitrário). O backend **sanitiza** (whitelist, truncagem). Campos suportados:

| Campo | Máx. (bytes lógicos) | Notas |
|-------|----------------------|--------|
| `intent` | 80 | Rótulo livre; pode alinhar depois com `LeadIntent` em `ai-contracts` |
| `urgency` | 32 | ex. baixa / média / alta |
| `budget` | 120 | Faixa textual |
| `region` | 120 | |
| `propertyInterest` | 255 | |
| `notes` | 500 | Resumo operador |
| `flowId`, `flowName` | 120 | Contexto do fluxo Botify |
| `lastUserMessage`, `lastAssistantReply` | 600 | Último turno (microserviço preenche quando há mensagem / nó IA antes do transfer) |
| `collectedFields` | Até 15 chaves × 200 chars | Mapa chave → valor string |

Se `leadSummary` for inválido (não-objeto), o dispatcher ignora e só grava telefone/mensagem como hoje.

Formato atual (Sprint 6 — Fase A):

`botify:flow:{flowId}:conv:{conversationId}:transfer`

- Deve ser **estável** para o mesmo par fluxo + conversa + intenção de transferência (reprocessamento do mesmo handoff não deve criar segunda fila — ver `IntegrationEntityLink` provider `bot`, entityType `MessageQueue`).

---

## Fonte dos fluxos (ADR-0002 — G4/G5/G7)

- **Backend:** domínio Prisma `BotifyBot` / `BotifyFlow`; API autenticada `GET/POST/PATCH /botify/...`; publicação `POST /botify/flows/:id/publish` (e `.../unpublish`). Import idempotente: `POST /botify/import/wordpress`.
- **Microserviço:** `BOTIFY_FLOW_SOURCE=wordpress|omniconnect|dual`. Em `omniconnect`/`dual`, define também `OMNICONNECT_BACKEND_URL`, `BOTIFY_INTERNAL_SYNC_SECRET` (igual ao backend) e `OMNICONNECT_BOTIFY_TENANT_ID`. O motor chama `GET /botify/internal/flows/:flowId/runtime-config` com `Authorization: Bearer <secret>` e `X-Omni-Tenant-Id: <uuid>`.
- **Vite:** `VITE_BOTIFY_DATA_SOURCE=wordpress|omniconnect|dual`; para Omni, `VITE_OMNICONNECT_API_URL` e token (`VITE_OMNICONNECT_API_TOKEN` ou futuro login Omni em `localStorage` key `omniconnect_access_token`). WordPress continua a ser usado para conversas/Meta até migração desses módulos.
- **Handoff:** inalterado — continua `POST /webhooks/botify` (HMAC) a partir do microserviço na maior parte dos deploys; o motor no backend pode emitir handoff via `IntegrationBridgeEmitService` quando chamado com contexto adequado.

---

## Verificação rápida

1. **Health do microserviço** (`GET /health` ou rota configurada): campo `omniconnectBridge.configured` deve ser `true` quando as três variáveis Omni estão definidas.
2. Disparar fluxo de teste com nó **transfer** e conferir:
   - Log do microserviço sem `Handoff webhook failed`
   - No Omni: `IntegrationEvent` `processed`; `Contact` com telefone; no máximo **uma** `MessageQueue` pendente por `externalId` para o tenant.

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Handoff nunca chega | Env Omni ausente no microserviço |
| `401/403` ou assinatura | Segredo diferente entre microserviço e `IntegrationConnection` |
| `404` integration | `x-integration-id` errado ou conexão de outro tenant |
| Duas filas para mesmo lead | `externalId` mudou entre retries (deve ser estável) |

---

## Ver também

- `docs/adr/ADR-0001-botify-tenancy-model.md` — uma instalação = um tenant; multi-tenant só com mapeamento seguro  
- `docs/operations/integration-connections.md`  
- `docs/migration/sprint-4-bridge-processors.md`  
- `docs/migration/pilot-flow-lead-to-recovery.md`  
- `docs/migration/sprint-6-botify-flow-engine-inventory.md` — motor Node vs editor
