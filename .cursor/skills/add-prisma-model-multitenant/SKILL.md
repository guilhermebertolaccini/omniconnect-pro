---
name: add-prisma-model-multitenant
description: >-
  Add a new tenant-scoped Prisma model with the required tenantId field,
  indexes, audit columns, relation back to Tenant, and a versioned migration.
  Use when the user asks to add a model, table, or entity to the database, or
  mentions Prisma schema changes for any tenant-owned domain entity.
---

# Add Tenant-Scoped Prisma Model

Use this skill whenever a new model represents data owned by a customer (tenant). See `01-multitenancy.mdc` for the full list of tenant-owned entities.

## Inputs needed

Ask the user (or infer from context):

1. **Model name** — singular PascalCase (e.g. `Proposal`)
2. **Domain fields** — what columns does it need?
3. **Relations** — links to which other models?
4. **High-volume?** — needs extra composite indexes?

## Workflow

```
Task Progress:
- [ ] Step 1: Write the model with tenantId + audit columns + relation
- [ ] Step 2: Add required indexes
- [ ] Step 3: Generate the migration
- [ ] Step 4: Regenerate Prisma client
- [ ] Step 5: Add the service-side tenant filter pattern
- [ ] Step 6: Add isolation tests
```

## Step 1 — Model template

```prisma
model <ModelName> {
  id        String   @id @default(cuid())
  tenantId  String                                      // 🔒 required

  // ---- domain fields ----
  // <field1>  <type>
  // <field2>  <type>

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?                                   // soft-delete optional

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  // relations to other entities...

  @@index([tenantId])                                   // 🔒 required
  @@index([tenantId, createdAt])                        // for time-ordered queries
  // additional indexes per filter pattern
}
```

## Step 2 — Indexes

| Pattern | Index |
|---|---|
| Always | `@@index([tenantId])` |
| Time-ordered lists | `@@index([tenantId, createdAt])` |
| Status filter | `@@index([tenantId, status])` |
| User-scoped | `@@index([tenantId, userId])` |
| Search by external id | `@@unique([tenantId, externalId])` |

## Step 3 — Migration

```bash
cd apps/omniconnect-backend
pnpm prisma migrate dev --name add_<snake_case_name>
```

**Never** edit migration SQL by hand unless rolling back. **Never** run raw SQL outside Prisma.

## Step 4 — Regenerate client

```bash
pnpm prisma generate
```

Then remove any `(this.prisma as any).<model>` casts.

## Step 5 — Service pattern (tenant filter)

```typescript
@Injectable()
export class <ModelName>Service {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(tenantId: string, filters: ListDto) {
    return this.prisma.<modelName>.findMany({
      where: {
        tenantId,                              // 🔒 always
        ...this.buildFilters(filters),
      },
      take: filters.pageSize,
      skip: filters.page * filters.pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateDto, actorId?: string) {
    const item = await this.prisma.<modelName>.create({
      data: { tenantId, ...dto },
    });
    await this.events.emit({
      eventType: '<model>.created',
      tenantId,
      entityType: '<ModelName>',
      entityId: item.id,
      actorId,
      occurredAt: new Date().toISOString(),
      metadata: {},
    });
    return item;
  }
}
```

## Step 6 — Tests required

```typescript
describe('<ModelName>Service — tenant isolation', () => {
  it('does not return tenant B records when querying as tenant A', async () => {
    const a = await create({ tenantId: 'A' });
    await create({ tenantId: 'B' });
    const results = await service.findMany('A', {});
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(a.id);
  });

  it('emits <model>.created event with tenantId', async () => { /* ... */ });
});
```

## Anti-patterns

- ❌ Adding model without `tenantId`
- ❌ Adding `tenantId` without `@@index([tenantId])`
- ❌ Skipping the relation back to `Tenant`
- ❌ Forgetting `pnpm prisma generate` after migrate
- ❌ Casting `as any` to access the new model

## See also

- `.cursor/rules/11-prisma.mdc`
- `.cursor/rules/01-multitenancy.mdc`
- `docs/07-database-standards.md`
