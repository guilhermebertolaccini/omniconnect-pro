# Development Workflow

## Branch strategy

```
main              # produção
develop           # integração (opcional, adicionar quando time >2 devs)
feature/<scope>-<short-name>      # feature/insight-ai-mvp
fix/<scope>-<short-name>          # fix/tenant-isolation-leads
security/<scope>-<short-name>     # security/webhook-signature-validation
chore/<short-name>                # chore/bump-deps
migration/<scope>-<short-name>    # migration/add-tenant-id
```

Branches sempre via PR — sem commit direto em `main`.

## Before coding

Checklist mental:

1. Li a doc relevante? (`02-architecture.md`, `03-multitenancy.md`, `04-security.md`)
2. Identifiquei o escopo de tenant?
3. Identifiquei as permissões necessárias?
4. Identifiquei o impacto no schema/DB?
5. Identifiquei o impacto na API?
6. Identifiquei os riscos de segurança?
7. Identifiquei os testes necessários?
8. Existe skill relevante? (e.g. `add-prisma-model-multitenant`, `apply-insight-ai-patch`)

## During coding

- Commits pequenos e frequentes (Conventional Commits — ver `50-commits.mdc`)
- Testes escritos junto com o código
- Docs atualizadas se mudou contrato público

## Before commit

```bash
pnpm lint                                  # ESLint
pnpm test                                  # Vitest
pnpm build                                 # tsc + bundlers
pnpm prisma validate                       # se mexeu schema
pnpm prisma generate                       # se mexeu schema
```

Se mudou deps:
```bash
pnpm audit                                 # vulnerabilidades
pnpm outdated                              # atualizações
```

## Pull Request checklist

Todo PR deve responder no description:

```markdown
## Summary
- (1-3 bullets, o que mudou)

## Type
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] migration
- [ ] security

## Affected modules
- backend/insight-ai
- frontend/dashboard

## Risk review
- [ ] Tenant isolation preserved (queries scoped by tenantId)
- [ ] Auth/permissions added or unchanged
- [ ] No new secrets/PII exposure
- [ ] Migration tested locally (if applicable)
- [ ] Tests added/updated
- [ ] Docs updated (if applicable)
- [ ] LLM calls go through queue (if applicable)

## Test plan
- (passo a passo para validar)

## Screenshots / curls
- (quando aplicável)

## Rollback plan
- (para migrations destrutivas ou mudanças de contrato)
```

## Review checklist

Reviewer checa:
- Conformidade com `.cursor/rules/*`
- Tests cobrem o caminho crítico
- Sem segredos commitados
- Tenant isolation preservado
- DTOs validam input
- Logs sem PII
- Doc atualizada

Para PRs sensíveis (auth, webhooks, IA, multi-tenancy), usar skill `security-review` e/ou `multitenancy-review`.

## Local dev setup

```bash
# 1. Clonar
git clone https://github.com/<org>/omniconnect-pro.git
cd omniconnect-pro

# 2. Instalar deps
pnpm install

# 3. Subir infra local (Postgres + Redis)
docker compose up -d

# 4. Configurar env
cp .env.example .env
# editar valores

# 5. Migrate
pnpm --filter omniconnect-backend prisma migrate dev

# 6. Seed (opcional)
pnpm --filter omniconnect-backend prisma db seed

# 7. Rodar backend
pnpm --filter omniconnect-backend run start:dev

# 8. Rodar frontend (outra aba)
pnpm --filter omniconnect-frontend run dev
```

## Commands cheatsheet

| Comando | Quando |
|---|---|
| `pnpm install` | Sync deps após pull |
| `pnpm -r run build` | Build tudo |
| `pnpm --filter <app> run dev` | Dev de um app específico |
| `pnpm --filter omniconnect-backend prisma migrate dev --name X` | Nova migration |
| `pnpm --filter omniconnect-backend prisma generate` | Regenerar Prisma client |
| `pnpm --filter omniconnect-backend prisma studio` | UI do DB |
| `pnpm --filter omniconnect-backend test` | Tests do backend |
| `pnpm audit` | Vulnerabilidades |
| `pnpm outdated` | Atualizações disponíveis |

## Migrations workflow

```bash
# 1. Editar schema.prisma
# 2. Gerar migration
pnpm --filter omniconnect-backend prisma migrate dev --name <descriptive_name>

# 3. Inspecionar SQL gerado em prisma/migrations/<timestamp>_<name>/migration.sql
# 4. Se quiser ajustar (renames, dados), editar o SQL ANTES de aplicar
# 5. Aplicar
pnpm --filter omniconnect-backend prisma migrate dev

# 6. Commitar schema.prisma + pasta migration + lockfile
git add prisma/ pnpm-lock.yaml
git commit -m "migration(prisma): <description>"
```

## CI/CD (futuro)

GitHub Actions:
- `backend-ci.yml`: lint + test + build em PRs
- `frontend-ci.yml`: lint + test + build em PRs
- `security-ci.yml`: `pnpm audit`, dependabot
- `deploy.yml`: deploy automático para staging em merge na `main`

Production deploy: manual ou via tag (decisão futura: Coolify, Vercel, Railway, AWS).

## Hot-fix workflow

Se quebrou produção:

1. Branch `fix/<crítico>` a partir de `main`
2. Fix mínimo possível
3. PR com revisão acelerada (1 reviewer suficiente)
4. Deploy
5. Post-mortem documentado em `docs/adr/` ou issue

## See also

- `.cursor/rules/50-commits.mdc`
- `09-roadmap.md`
- skill `security-review`
