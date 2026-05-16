---
name: security-review
description: >-
  Review a diff or PR for security issues following OmniconnectPRO standards
  before merge. Covers auth, tenant isolation, validation, secrets handling,
  webhook signatures, SQL injection, dependency vulnerabilities, PII/LGPD,
  and AI data exposure. Use when the user asks to review, audit, or check the
  security of code changes, a PR, or before merging changes that touch auth,
  webhooks, payments, AI, or multi-tenant data.
---

# Security Review

Block merges that fail the checklist. Be opinionated. Cite specific lines.

## Quick checklist (run through every item)

```
Task Progress:
- [ ] Authentication: guarded with JwtAuthGuard?
- [ ] Authorization: @Roles applied? roles correct?
- [ ] Tenant isolation: every query has where: { tenantId }?
- [ ] tenantId NOT from request body
- [ ] Input validation: DTO with class-validator decorators?
- [ ] Output: returning DTO, not raw Prisma entity with sensitive fields?
- [ ] Secrets: no API keys/tokens in code/config?
- [ ] Webhook: signature verification before any DB write?
- [ ] Webhook: tenantId resolved from trusted integration?
- [ ] Webhook: idempotency key set?
- [ ] Rate limiting: applied where appropriate?
- [ ] SQL: no string concatenation in raw queries?
- [ ] Logging: no passwords/tokens/CPF/raw prompts?
- [ ] PII: redaction before sending to LLM?
- [ ] Dependencies: pnpm audit clean? no new abandoned packages?
- [ ] Tests: tenant isolation test included?
- [ ] Docs: updated if endpoint/module is new or changed?
```

## Severity scale

- 🔴 **Critical (block merge)** — data leak, cross-tenant access, secret exposure, SQL injection, missing auth
- 🟠 **High (fix before merge)** — missing validation, missing rate limit on sensitive endpoint, raw error exposed
- 🟡 **Medium (file follow-up)** — missing audit log on sensitive action, weak type, missing test
- 🟢 **Low (suggestion)** — naming, style, minor refactor

## Red flags — block immediately

```typescript
// 🔴 Cross-tenant access
await prisma.lead.findMany();                                  // no tenantId

// 🔴 Trusting body
const { tenantId } = req.body;

// 🔴 Secret in code
const apiKey = 'sk-abc123...';

// 🔴 SQL injection
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);

// 🔴 No signature verification on webhook
@Post('webhooks/foo')
async receive(@Body() payload) {
  await this.service.process(payload);                          // anyone can call!
}

// 🔴 Logging secrets
this.logger.log(`Token: ${user.refreshToken}`);

// 🔴 Sending raw conversation to LLM (PII)
const result = await openai.chat({ messages: [{ role: 'user', content: rawTranscript }] });
```

## Common high-severity issues

```typescript
// 🟠 Returning Prisma entity with passwordHash
return user;                                                    // leaks passwordHash field

// 🟠 Missing pagination
@Get()
async list() { return this.prisma.message.findMany(); }         // unbounded

// 🟠 No rate limit on AI endpoint
@Post('insight-ai/analyze')                                     // can burn API budget

// 🟠 Stack trace in response
catch (e) { return { error: e.stack }; }
```

## Feedback format

For each issue:

```markdown
### 🔴 Critical: Cross-tenant access in LeadsService.list

`apps/omniconnect-backend/src/leads/leads.service.ts:42`

\`\`\`typescript
return this.prisma.lead.findMany({ where: filters });
\`\`\`

Missing `tenantId` filter. Tenant A can list Tenant B's leads.

**Fix:**
\`\`\`typescript
return this.prisma.lead.findMany({ where: { tenantId, ...filters } });
\`\`\`
```

## What to NOT block on

- Code style / formatting (lint catches that)
- Function naming preferences
- Test framework choice
- Performance optimizations that aren't bugs

Stay focused on **security and tenant isolation**.

## OWASP alignment

Cross-check against OWASP API Security Top 10:
- API1: Broken Object Level Authorization → tenant isolation
- API2: Broken Authentication → JwtAuthGuard usage
- API3: Excessive Data Exposure → DTO returns
- API4: Lack of Resources & Rate Limiting → internal `rate-limiting/` module
- API5: Broken Function Level Authorization → `@Roles(Role.X)` with `Role` from `@prisma/client`
- API7: Security Misconfiguration → CORS, Helmet (to be added), env handling
- API8: Injection → Prisma vs raw SQL
- API9: Improper Inventory Management → audit logs
- API10: Insufficient Logging → structured logs without secrets

## See also

- `.cursor/rules/02-security.mdc`
- `.cursor/rules/01-multitenancy.mdc`
- `docs/04-security.md`
