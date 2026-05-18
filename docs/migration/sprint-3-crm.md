# Sprint 3 — CRM Imobiliário backend migration

> Migra o backend do CRM Imobiliário do Supabase para o
> `omniconnect-backend` (NestJS + Prisma + Bull + Socket.io), preservando
> o domínio (properties → units → clients → leads → proposals →
> contracts → financial) e impondo todos os invariantes multi-tenant +
> de segurança consolidados nas Sprints 1.x / 2.x.

## Decisões travadas

| Tópico | Decisão | Razão |
|---|---|---|
| Migração de dados | `do_zero` (sem ETL Supabase) | Produto sem produção; permite reorganizar schema para multi-tenant nativo. |
| Modelo de tenancy | `multi_tenant_full` | Cada agência/cliente é um Tenant separado desde o dia 1. |
| Role mapping | Estender `enum Role` com `broker` | Mantém RBAC global + UserTenant.role como override por tenant. |
| Realtime | Socket.io gateway próprio (mesmo padrão do WebsocketGateway) | Sem dependência de Supabase Realtime; pluga no JWT existente. |
| Triggers | Híbrido: app-layer audit + SQL trigger só para financeiro | Audit precisa de userId/contexto (impossível em SQL puro); financial é crítico transacionalmente. |
| Assinaturas | Migração total para o backend (Clicksign client + webhook HMAC) | Não dependemos mais de edge function. |
| Storage | Filesystem local (`./uploads/crm/{tenantId}/{kind}/{fileId}`) | Coolify + Nginx servem, sem necessidade de S3 ainda. |
| PDF parser | OpenAI master key + `AIUsageLog` (operationType=`crm_pdf_parse`) | Reaproveita custo + audit do InsightAI. |
| Escopo da Sprint | `cheia_phases` (Blocos A→F) | Permite commits pequenos e reviews focados. |

## Mapeamento Supabase → Prisma

| Supabase (CRM antigo) | Prisma |
|---|---|
| `properties` | `CrmProperty` |
| `units` | `CrmUnit` |
| `commission_configs` | `CrmCommissionConfig` |
| `clients` | `CrmClient` |
| `leads` (+ `interactions`, `follow_ups`) | `CrmLead`, `CrmInteraction`, `CrmFollowUp` |
| `proposals` (+ `proposal_events`) | `CrmProposal`, `CrmProposalEvent` |
| `contracts` (+ `contract_events`, `signatures`) | `CrmContract`, `CrmContractEvent`, `CrmSignature` |
| `payments` | `CrmPayment` |
| `commissions` | `CrmCommission` |
| `documents_versions` / `documents_access_log` | `CrmDocumentVersion`, `CrmDocumentAccessLog` |
| `change_history` | `CrmChangeHistory` |
| `notification_preferences` | `CrmNotificationPreference` |

12 enums novos: `CrmUnitStatus`, `CrmClientScore`, `CrmLeadStage`,
`CrmInteractionType`, `CrmProposalStatus`, `CrmContractStatus`,
`CrmPaymentType`, `CrmPaymentStatus`, `CrmCommissionStatus`,
`CrmDocumentParentType`, `CrmDocumentVersionAction`,
`CrmDocumentAccessAction`.

## Mapeamento Edge Functions → módulos NestJS

| Edge Function (Supabase) | Módulo NestJS |
|---|---|
| `properties-crud`, `units-crud` | `crm/properties/*`, `crm/units/*` |
| `clients-crud`, `leads-crud` | `crm/clients/*`, `crm/leads/*` |
| `proposals-crud`, `contracts-crud` | `crm/proposals/*`, `crm/contracts/*` |
| `signature-create`, `signature-webhook` | `crm-signatures/*` (auth API + webhook HMAC) |
| `pdf-storage` | `crm-storage/*` (multer memory + filesystem) |
| `pdf-parser` | `crm-pdf-parser/*` (texto extraído no frontend + OpenAI) |
| `payments-generate`, `commissions-generate` (lógica) | Trigger SQL `crm_generate_financials_on_signed` |
| `realtime-channels` (Supabase Realtime) | `crm-realtime/*` (Socket.io gateway) |

## Endpoints introduzidos

Todos `JwtAuthGuard + RolesGuard`. `tenantId` resolvido de `req.user`,
nunca do body. Broker scope (`broker` role) aplicado no service:
brokers só veem clientes, leads, proposals, contracts e files dos quais
são donos.

### `/crm/properties`, `/crm/units`
- Standard CRUD (admin/supervisor). Listagem e detail por tenant.
- `POST /properties/:id/commission-config` (admin/supervisor).
- `POST /units/:id/reserve` / `release` (transições de status).

### `/crm/clients`
- CRUD com PII masking obrigatório no `findAll`
  (`maskCpfCnpj`/`maskEmail`/`maskPhone` em `pii.ts`).
- `findOne` admin/supervisor: full PII; broker: somente os seus.

### `/crm/leads` + `/crm/follow-ups`
- CRUD; transições de stage; criação de interaction com `direction`/`channel`.

### `/crm/proposals`
- `POST` (admin/supervisor/broker — broker auto-assigned brokerId).
- `POST /:id/transition` — valida transições draft→sent→accepted/rejected.
- Side effect: aceitar reserva a unit (`status=reserved`).

### `/crm/contracts`
- `POST /from-proposal/:id` (admin/supervisor) — gera contract de proposta aceita.
- `POST /:id/transition` — valida transições; `signed` é exclusivo do
  módulo Signatures.
- Read-only após `signed` (update/transition/remove rejeitados).

### `/crm/payments`, `/crm/commissions`
- Apenas leitura via API + mark as paid (admin/supervisor).
- Criação é EXCLUSIVA do trigger SQL on-signed.

### `/crm/signatures` + `/webhooks/crm/signatures`
- `POST /crm/signatures/contracts/:contractId/envelope` — cria envelope no
  Clicksign, persiste 1 `CrmSignature` por signer, marca contract como
  `pending_signature`.
- `GET  /crm/signatures/contracts/:contractId` — lista signers (sem token).
- `POST /webhooks/crm/signatures` — público. HMAC-SHA256 timing-safe
  contra `IntegrationConnection.webhookSecretEncrypted` (provider=
  `clicksign`). Tenant resolution via `CrmContract.externalEnvelopeId`.

### `/crm/storage`
- `POST /upload` — multer memory storage; valida mime
  (PDF/PNG/JPG/WebP), tamanho (≤25MB), parent ownership; grava em
  `{CRM_STORAGE_ROOT}/crm/{tenantId}/{parentType}/{fileId}.{ext}`.
- `GET  /files/:fileId` — JWT + tenant scope + audit
  (`CrmDocumentAccessLog`).

### `/crm/pdf-parser`
- `POST /` — recebe texto extraído pelo frontend (pdf.js) + `kind`.
  Devolve JSON estruturado (propertyName, unitNumber, clientName,
  clientCpfCnpj, finalPrice, paymentCondition). Em dev sem
  `OPENAI_API_KEY` cai em fallback empty; em produção lança
  `ServiceUnavailable`.

### WebSocket `/crm` (Socket.io)
- Rooms: `crm:{tenantId}`, `crm:{tenantId}:broker:{userId}`.
- Eventos:
  - `crm.proposal.transitioned`
  - `crm.contract.transitioned`
  - `crm.contract.signed`
  - `crm.payment.created`
  - `crm.commission.created` (sala tenant) +
    `crm.commission.created.self` (sala do broker)
  - `crm.signature.updated`

## Trigger SQL on-signed

`crm_generate_financials_on_signed` (PL/pgSQL, idempotente):
- Dispara em `BEFORE UPDATE` de `CrmContract` quando `status` muda para
  `signed`.
- Carrega `paymentCondition` (JSONB) e gera 1 `CrmPayment` por
  installment + 1 `CrmCommission` por broker (lookup em
  `CrmCommissionConfig`).
- Usa `ON CONFLICT (tenantId, contractId, installmentNumber)` e
  `(tenantId, contractId, brokerId)` para garantir idempotência.

## Multi-tenancy

Todo módulo é validado contra a regra do
[`.cursor/rules/01-multitenancy.mdc`](../../.cursor/rules/01-multitenancy.mdc):

- `tenantId` em **todas** as 18 tabelas CRM, sempre indexado.
- `tenantId` **sempre** vem de `req.user.tenantId` (JwtStrategy resolve
  + UserTenant.role override). NUNCA do body/query.
- Cross-tenant access retorna 404 (não 403) — não vazamos existência.
- Broker scope: brokers só veem clientes/leads/proposals/contracts
  cujo `brokerId === actor.id`. Tentar acessar item de outro broker
  retorna 404.

## Segurança

- DTOs (`class-validator`) em **todas** as entradas.
- Webhook Clicksign: HMAC-SHA256 timing-safe (`crypto.timingSafeEqual`)
  com decrypt on-demand via `BridgeSecretCipher`.
- PII (CPF/CNPJ, email, phone, income) **mascarada** nas listas; full
  apenas no detail e mediante auth.
- Storage: path-traversal sanitizado (`resolveSafePath`) + verificação
  de root absoluto antes de gravar/ler.
- AI (PDF parser): `AIUsageLog` em sucesso E falha com
  `operationType='crm_pdf_parse'`.
- SystemEvent: `EventModule.CRM_SIGNATURES` + tipos dedicados
  (`crm_signature_envelope_created`, `crm_signature_webhook_received`,
  `crm_contract_signed`).

## Testes

- 35 suites / 338 testes (paralelo, estável).
- Coverage por bloco:
  - **B**: properties (tenant + commission), proposals (tenant +
    broker + state-machine).
  - **C**: signatures (envelope create, role duplicado, contract já
    signed, webhook sign/refuse/close, HMAC válido + inválido em
    produção, envelope desconhecido).
  - **D**: storage (upload válido, mime ruim, buffer vazio, parent de
    outro tenant, broker scope, serve cross-tenant 404, path
    traversal); pdf-parser (text curto, dev sem key, prod sem key,
    parse OK + AIUsageLog, OpenAI 500 + AIUsageLog failure).
  - **E**: realtime service (delegação, gateway com erro); gateway
    (auth, rooms, broker scope).
  - **F**: clients (PII masking + tenant/broker isolation),
    contracts (cross-tenant 404 + signed immutability + emissão
    realtime após trigger).

## Não-objetivos da Sprint 3

- Frontend do CRM (`apps/crm-imobiliario`) **NÃO** foi alterado nesta
  sprint. A migração strangler-fig do front segue padrão similar a
  `sprint-2-4-saa-frontend.md` em sprint futura.
- ETL Supabase → Postgres novo: não fazemos (decisão `do_zero`).
- S3/Spaces: storage permanece local; mover para object storage será
  feito quando volume exigir.

## Commits

| Bloco | SHA | Conteúdo |
|---|---|---|
| A | `d7dd035` | Prisma schema (18 models, 12 enums) + migration SQL com trigger on-signed. |
| B | `adc3809` | Modulos CRM domain (properties, units, clients, leads, proposals, contracts, financial). |
| C | `586e793` | Signatures (Clicksign envelope + webhook HMAC). |
| D | `c0042b7` | Storage filesystem + pdf-parser OpenAI. |
| E | `9c99a9c` | Realtime gateway Socket.io. |
| F | _este commit_ | E2E tenant isolation specs + docs. |
