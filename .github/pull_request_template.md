## Summary
<!-- 1-3 bullets describing the change -->

## Type
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] migration
- [ ] security
- [ ] chore / docs / test

## Affected modules
<!-- e.g. backend/insight-ai, frontend/dashboard, packages/ai-contracts -->

## Risk review
- [ ] Tenant isolation preserved (queries scoped by tenantId, no cross-tenant reads/writes)
- [ ] Auth/permissions added or unchanged (JwtAuthGuard + RolesGuard where applicable)
- [ ] No new secrets/PII exposure (logs, AI prompts, error payloads)
- [ ] Migration tested locally (`prisma migrate dev`)
- [ ] Tests added/updated (unit + integration where applicable)
- [ ] Docs updated (`docs/*`, `AGENTS.md`, or `README.md` of the affected module)

## Test plan
<!-- Step-by-step: commands, curls, screenshots, expected outputs -->

## Rollback notes
<!-- If applicable: how to revert (migration down, feature flag, etc.) -->
