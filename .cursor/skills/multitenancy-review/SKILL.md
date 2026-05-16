---
name: multitenancy-review
description: >-
  Review a model, module, query, endpoint, or migration for proper tenant
  isolation in omniconnect-pro. Checks tenantId presence, query scoping,
  webhook tenant resolution, background job context, and required tenant
  isolation tests. Use when reviewing changes to Prisma models, services,
  controllers, webhooks, jobs, or asks specifically about tenant isolation.
---

# Multi-Tenancy Review

OmniconnectPRO is multi-tenant from day one. Every tenant-owned entity must be properly isolated. **No exceptions.**

## When to use this skill

- Reviewing new Prisma model
- Reviewing new service method that queries DB
- Reviewing new endpoint
- Reviewing webhook handler
- Reviewing Bull job processor
- Reviewing dashboard aggregation

## Checklist by surface

### New model

- [ ] Has `tenantId String` field
- [ ] Has relation: `tenant Tenant @relation(fields: [tenantId], references: [id])`
- [ ] Has `@@index([tenantId])` minimum
- [ ] Has `@@index([tenantId, createdAt])` if high-volume
- [ ] Unique constraints scoped: `@@unique([tenantId, externalId])` not just `@unique externalId`

### New service method

- [ ] Receives `tenantId` as first argument (not derived from input DTO)
- [ ] All `prisma.<model>.findMany / findFirst / findUnique / update / delete` include `where: { tenantId }`
- [ ] Nested relations validated belong to same tenant before mutation
- [ ] Returns only data of the passed `tenantId`

### New endpoint (controller)

- [ ] Uses `JwtAuthGuard`
- [ ] Reads `tenantId` from `req.user.tenantId` (not from body)
- [ ] Passes `tenantId` to service
- [ ] Does NOT accept `tenantId` in body/query unless caller is super_admin (and even then, audit logged)

### New webhook handler

- [ ] Verifies signature before any logic
- [ ] Resolves `tenantId` from **integration credential** (channel id, phone mapping, API key) — never from payload field
- [ ] Rejects if integration doesn't match any tenant
- [ ] Includes `tenantId` in the queued job payload

### New background job

- [ ] Job payload includes `tenantId`
- [ ] Processor re-reads `tenantId` from `job.data.tenantId` (not from external state)
- [ ] All DB writes inside the processor are tenant-scoped

### New dashboard / aggregation

- [ ] All queries grouped/filtered by `tenantId`
- [ ] No cross-tenant aggregations except for platform-super-admin views (audit logged)

## Common mistakes — block on review

```typescript
// 🔴 No tenantId
prisma.lead.findMany({ where: { status: 'qualified' } });

// 🔴 tenantId from body
async create(@Body() dto: CreateLeadDto) {
  return this.prisma.lead.create({ data: { tenantId: dto.tenantId, ...dto } });
}

// 🔴 Nested mutation without tenant validation
async addNote(leadId, note) {
  await this.prisma.note.create({ data: { leadId, ...note } });  // didn't check lead.tenantId
}

// 🔴 Webhook trusting body
const tenantId = payload.companyId;                              // attacker controls

// 🔴 Job without tenantId
await this.queue.add('process', { conversationId });             // worker has no context
```

## Test cases (required for every tenant-owned module)

```typescript
describe('<Module> — tenant isolation', () => {
  it('user from tenant A gets 404 when reading tenant B resource', async () => { /* ... */ });
  it('user from tenant A cannot update tenant B resource', async () => { /* ... */ });
  it('user from tenant A cannot delete tenant B resource', async () => { /* ... */ });
  it('list endpoint returns only tenant A data', async () => { /* ... */ });
  it('webhook for integration A only mutates tenant A data', async () => { /* ... */ });
  it('dashboard aggregations exclude other tenants', async () => { /* ... */ });
});
```

## Edge cases worth flagging

- **Soft-delete + queries**: `where: { tenantId, deletedAt: null }` everywhere, not just `tenantId`
- **Counts / cardinality**: `prisma.lead.count({ where: { tenantId } })` — never count globally
- **Search**: full-text search must scope by tenant before fuzzy matching
- **Caching**: cache keys include `tenantId` (`leads:${tenantId}:list:${...}`)
- **Logs / metrics**: include `tenantId` in structured logs for audit and debug

## Output format

```markdown
### 🔴 Cross-tenant leak in MessagesService.getRecent

`apps/omniconnect-backend/src/messages/messages.service.ts:78`

\`\`\`typescript
return this.prisma.message.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
\`\`\`

Returns messages from all tenants.

**Fix:** add `where: { tenantId }`.
```

## See also

- `.cursor/rules/01-multitenancy.mdc`
- `docs/03-multitenancy.md`
- skill `add-prisma-model-multitenant`
