# Database Standards

## General principles

- **PostgreSQL** como banco principal
- **Prisma** como ORM e ferramenta de migrations
- **Migrations versionadas** — todo schema change passa por `prisma migrate dev`
- **Nunca** alterar schema de produção manualmente
- **Nunca** rodar SQL bruto fora do Prisma (exceto rollback emergencial documentado)

## Migrations

```bash
# Desenvolvimento — aplica e gera migration nomeada
pnpm prisma migrate dev --name <snake_case_description>

# Produção — aplica migrations já versionadas
pnpm prisma migrate deploy

# Verificar drift entre schema.prisma e DB
pnpm prisma migrate diff
```

Toda mudança de schema **deve**:
- Ter migration nomeada
- Ter review (PR)
- Ter consideração de **rollback**
- Ter consideração de **impacto em dados existentes**
- Em produção: testada em staging primeiro

## Tenant scope

Todo model **novo** que pertence a um cliente:

```prisma
model <Entity> {
  id        String   @id @default(cuid())
  tenantId  String                                      // 🔒
  // ... domain fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])                                   // 🔒
  @@index([tenantId, createdAt])                        // alto volume
}
```

> **Retrofit nos modelos existentes do taticaofc:** as tabelas atuais (`User`, `Conversation`, `Message`, `Contact`, `Campaign`, etc.) usam `Int autoincrement` para IDs e **não têm** `tenantId`. Manter `Int` nelas (não migrar IDs em massa); apenas **adicionar a coluna `tenantId Int`** (ou `String` se Tenant tiver cuid) com FK para `Tenant` e backfill por Tenant "default". Detalhes em `migration/03-migration-plan.md`.

## Indexes obrigatórios

| Padrão | Index |
|---|---|
| Sempre | `@@index([tenantId])` |
| Listas ordenadas por tempo | `@@index([tenantId, createdAt])` |
| Filtros frequentes | `@@index([tenantId, status])`, `@@index([tenantId, source])` |
| FK não tratada por @relation | `@@index([referencedId])` |
| Busca por externalId/integração | `@@unique([tenantId, externalId])` |

## High-volume tables

Tabelas que crescem rápido:

- `Message` (todas as mensagens trocadas)
- `Event` (eventos internos)
- `ConversationAIAnalysis` (uma análise por conversa, atualizada)
- `WebhookEvent` (todo webhook recebido)
- `CampaignSend` (cada envio de broadcast)
- `AuditLog`

Para elas:

- **Indexes corretos** (não esquecer composite com `tenantId`)
- **Paginação obrigatória** (cursor para feeds)
- **Estratégia de arquivamento** (mover para `*_archive` após N meses)
- **Considerar particionamento** Postgres declarative quando passar de 50M-100M rows
- **Evitar campos `Json` consultáveis** — use colunas tipadas + index

## Naming conventions

### Models
Singular, PascalCase:

✅ `Lead`, `Conversation`, `ConversationAIAnalysis`, `SellerPerformanceSnapshot`
❌ `Leads`, `lead`, `Data`, `Info`, `Misc`, `Tbl_Lead`

### Fields
camelCase:

✅ `createdAt`, `tenantId`, `mainObjection`, `nextBestAction`
❌ `created_at`, `tenant_id`, `MainObjection`

### Enums
PascalCase para o tipo, snake_case para valores (com exceção do enum `Role` que já existe em lowercase no `taticaofc`):

```prisma
// Enum atual (preservado do taticaofc) — NÃO alterar valores existentes
enum Role {
  admin
  operator
  supervisor
  ativador
  digital
}

// Exemplo de novo enum
enum LeadStage {
  new
  contacted
  qualified
  proposal
  visit_scheduled
  won
  lost
}
```

### Indexes
Auto-nomeados pelo Prisma. Para constraints únicas semânticas, usar `@@unique` com nome descritivo via `map`:

```prisma
@@unique([tenantId, email], map: "Lead_unique_email_per_tenant")
```

## ID strategy

- **Modelos existentes** (taticaofc): mantêm `Int @id @default(autoincrement())` — não migrar em massa
- **Modelos novos**: `String @id @default(cuid())`
- IDs externos (integração): coluna separada `externalId String`
- IDs públicos (URL): preferir `cuid`/`nanoid` para novos endpoints. Endpoints legados com `:id` numérico continuam aceitando `Int`.

## Datas

- Sempre `DateTime` (com timezone, UTC no DB, convertido na UI)
- `createdAt @default(now())` em todo model
- `updatedAt @updatedAt` em models mutáveis
- `deletedAt DateTime?` para soft-delete

## JSON

Use `Json` para:
- ✅ Payloads não estruturados (webhook bruto recebido)
- ✅ Configurações flexíveis por tenant
- ❌ Campos que você precisa filtrar/buscar → use coluna tipada

## Soft delete

Padrão preferido: `deletedAt DateTime?`. Queries sempre filtram:

```typescript
where: { tenantId, deletedAt: null }
```

Hard delete só quando:
- Compliance exige (right to be forgotten — LGPD)
- Audit log preservou o histórico
- Não há dependentes (ou cascade documentado)

## Auditability

Mudanças sensíveis criam audit log:

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  tenantId    String
  actorId     String?         // userId que originou
  action      String          // 'role.changed', 'crm.stage_changed', 'integration.connected'
  entityType  String          // 'User', 'Lead', 'Integration'
  entityId    String
  before      Json?
  after       Json?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
  @@index([action, tenantId])
}
```

Ações tipicamente auditadas:
- `user.role_changed`
- `user.invited`
- `user.removed`
- `lead.assigned`
- `crm.stage_changed`
- `integration.connected`
- `integration.disconnected`
- `campaign.launched`
- `ai.analysis.overridden` (humano corrigiu IA)
- `conversation.exported`
- `tenant.config_changed`

## Performance heuristics

- Query lenta? → primeiro `EXPLAIN ANALYZE`, depois pensar em index
- N+1 query? → use `include` ou `select` do Prisma corretamente
- Agregação pesada? → considerar tabela de snapshot materializada (`SellerPerformanceSnapshot`) atualizada via job
- Read-heavy? → considerar replica de leitura (Postgres) quando volume justificar

## Backup & DR

- Backup automático diário (mínimo retenção 30 dias)
- PITR (point-in-time-recovery) se provedor suportar
- DR test trimestral — restaurar backup em ambiente isolado, validar integridade
- Documentar RPO (15min) e RTO (4h) — ajustar conforme contratos

## See also

- `.cursor/rules/11-prisma.mdc`
- `03-multitenancy.md`
- skill `add-prisma-model-multitenant`
- skill `database-prisma`
