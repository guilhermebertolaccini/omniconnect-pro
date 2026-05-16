---
name: database-prisma
description: >-
  Design or modify the Prisma schema for omniconnect-pro — adding models,
  relations, indexes, enums, and creating versioned migrations safely. Use
  when the user asks about schema design, database structure, Prisma models,
  migrations, or indexes that don't fit the simpler add-prisma-model-
  multitenant skill (e.g. enums, junction tables, refactors).
---

# Prisma Schema Design

For **adding a single tenant-owned model**, use `add-prisma-model-multitenant`. Use this skill for broader schema work: enums, junction tables, refactors, performance indexes.

## Decision tree

| Need | Skill |
|---|---|
| Add one model with tenantId | `add-prisma-model-multitenant` |
| Add enum | this skill (Enum Pattern) |
| Add many-to-many | this skill (Junction Pattern) |
| Change existing column type | this skill (Refactor Pattern) |
| Drop column/model | this skill (Destructive Pattern) — extra care |

## Enum Pattern

```prisma
enum LeadStage {
  new
  contacted
  qualified
  proposal
  visit_scheduled
  won
  lost
}

model Lead {
  // ...
  stage LeadStage @default(new)
  @@index([tenantId, stage])
}
```

Migration: `pnpm prisma migrate dev --name add_lead_stage_enum`.

Renaming an enum value requires explicit migration step (Postgres doesn't drop/rename enum values directly):

```sql
-- in the generated migration, edit if Prisma asks
ALTER TYPE "LeadStage" RENAME VALUE 'old_name' TO 'new_name';
```

## Junction Pattern (M:N)

```prisma
model Lead {
  id   String @id @default(cuid())
  tags LeadTag[]
}

model Tag {
  id    String @id @default(cuid())
  tenantId String
  leads LeadTag[]
  @@index([tenantId])
}

model LeadTag {
  leadId String
  tagId  String
  tenantId String                              // 🔒 denormalized for fast tenant filter

  lead Lead @relation(fields: [leadId], references: [id])
  tag  Tag  @relation(fields: [tagId], references: [id])

  @@id([leadId, tagId])
  @@index([tenantId])
}
```

Denormalize `tenantId` na junction para evitar JOIN só para filtrar tenant.

## Refactor Pattern (renomear coluna)

Em produção, **nunca** renomear coluna em 1 migration. Faça em 2 fases:

1. **Migration 1**: criar nova coluna, copiar dados, manter antiga
2. Deploy + atualizar código para escrever em ambas, ler da nova
3. **Migration 2**: remover coluna antiga

## Destructive Pattern (drop)

Antes de qualquer `DROP TABLE`/`DROP COLUMN`:

- [ ] Backup do DB de produção
- [ ] Confirma que não há tráfego escrevendo ali
- [ ] Migration testada em staging com dados reais
- [ ] Plano de rollback documentado

Se houver dúvida, use **soft delete** (`deletedAt DateTime?`) primeiro.

## High-volume table considerations

Para `Message`, `Event`, `AIAnalysis`, `WebhookEvent`:

- Indexes em `tenantId`, `createdAt`, e campos de filtro frequente
- Considerar **particionamento** (Postgres declarative partitioning) por `createdAt` se >100M rows
- Estratégia de **arquivamento** (move pra tabela `*_archive` após N meses) — OmniConnect já tem `ArchivingModule`
- Evitar `Json` para campos consultáveis — use coluna tipada + índice

## Auditoria

Mudanças sensíveis devem gerar audit log:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  actorId   String?
  action    String                  // 'role.changed', 'crm.stage_changed', etc.
  entityType String
  entityId  String
  before    Json?
  after     Json?
  createdAt DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
}
```

## Naming reminder

Singular PascalCase para models. camelCase para fields. Nada de `tbl_lead`, `Lead_Tag_Map`.

## See also

- `.cursor/rules/11-prisma.mdc`
- `.cursor/rules/01-multitenancy.mdc`
- `docs/07-database-standards.md`
