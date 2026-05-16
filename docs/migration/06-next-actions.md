# 06 — Próximas Ações

Sequência de execução proposta. Cada bloco tem **dono** (quem decide / quem executa), **dependências** e **entregável**.

## Convenção
- ⏳ **Pendente** — ainda não começou
- 🟢 **Em andamento**
- ✅ **Concluído**

---

## Bloco A — Decisões estratégicas (você decide)

### A.1 ✅ Definir gerenciador de pacotes do monorepo
**Status:** Concluído. Usaremos `pnpm` (recomendado).

### A.2 ✅ Definir estratégia para Supabase
**Status:** Concluído. Abordagem C (Híbrida) — transição gradual para evitar perda de contexto, mas no final tudo será Postgres/NestJS.

### A.3 ✅ Verificar produção do `taticaofc`
**Status:** Concluído. O OmniconnectPRO será um produto **novo** com novos usuários. Portanto, não há necessidade de script de migração de banco de dados legado. Começaremos com o schema zerado.

### A.4 ✅ Status dos outros repos no GitHub
**Status:** Concluído. Botify, CRM e SAA continuarão existindo como produtos apartados e não serão arquivados.

### A.5 ✅ Multi-tenant ou single-tenant?
**Status:** Concluído. Será multi-tenant. Cada cliente (tenant) será isolado. (Conforme regras e documentação padrão).

---

## Bloco B — Setup de Rules e Skills do Cursor ✅ COMPLETO

### B.1 ✅ Proposta de Rules do usuário recebida e revisada
**Status:** Conteúdo revisado, ajustes acordados (formato `.mdc`, skills como diretórios, marcadores `:contentReference` removidos).

### B.2 ✅ Rules criadas em `.cursor/rules/`
12 arquivos `.mdc` criados:
1. `00-core-principles.mdc` — alwaysApply
2. `01-multitenancy.mdc` — alwaysApply
3. `02-security.mdc` — alwaysApply
4. `03-monorepo-structure.mdc` — alwaysApply
5. `10-nestjs-backend.mdc` — globs backend
6. `11-prisma.mdc` — globs Prisma
7. `12-api-standards.mdc` — globs controllers/DTOs
8. `13-events.mdc` — globs services/events
9. `20-react-frontend.mdc` — globs frontends
10. `30-ai-governance.mdc` — globs insight-ai
11. `40-testing.mdc` — globs testes
12. `50-commits.mdc` — alwaysApply

### B.3 ✅ Skills criadas em `.cursor/skills/`
11 skills criadas, cada uma em sua pasta com `SKILL.md`:
1. `apply-insight-ai-patch` — procedimento seguro do patch
2. `migrate-product-to-monorepo` — importar produto para apps/
3. `add-prisma-model-multitenant` — model com tenantId + indexes + migration
4. `create-bridge-endpoint` — bridge OmniConnect ↔ CRM/SAA/Botify
5. `backend-nestjs` — feature backend
6. `frontend-react` — feature frontend
7. `database-prisma` — schema design avançado
8. `insight-ai` — trabalho no módulo IA
9. `security-review` — review de segurança
10. `multitenancy-review` — review de isolamento
11. `product-owner` — priorização e filtro

---

## Bloco C — Execução da migração (depois das decisões)

> **Sequência exata em `03-migration-plan.md`.** Aqui só o resumo dos próximos 5 passos imediatos:

### C.1 ⏳ Criar repo `omniconnect-pro` no GitHub e local
**Depende de:** A.1
**Entregável:** Fase 1 do plano completa, repo vazio funcional com workspace configurado

### C.2 ⏳ Migrar OmniConnect para `apps/omniconnect-backend` e `apps/omniconnect-frontend`
**Depende de:** C.1 + A.3
**Entregável:** Fase 2, build do backend passa, build do frontend passa

### C.3 ⏳ Aplicar patch InsightAI corrigido
**Depende de:** C.2 + bloqueadores do patch (`04-insight-ai-patch-analysis.md`)
**Entregável:** Fase 3, endpoint `/insight-ai/dashboard/summary` responde

### C.4 ⏳ Setup `packages/ai-contracts` e `packages/shared-types`
**Depende de:** C.3
**Entregável:** Fase 4, tipos do InsightAI consumíveis por outros apps

### C.5 ⏳ Migrar Botify
**Depende de:** A.2 + C.4
**Entregável:** Fase 5, `apps/botify` builda dentro do monorepo

### C.6 ⏳ Migrar CRM Imobiliário
### C.7 ⏳ Migrar Smart Ad Automator
### C.8 ⏳ Bridges entre apps (OmniConnect↔CRM, SAA↔OmniConnect)
### C.9 ⏳ Arquivar `taticaofc`

---

## Bloco D — Validações pendentes antes da Fase 3 (patch InsightAI)

Estas verificações precisam ser feitas **diretamente no código atual** do `taticaofc/backend/` antes de aplicar o patch:

### D.1 ⏳ Verificar enum `Sender` no schema
**Comando:** `rg "enum Sender" backend/prisma/schema.prisma -A 5`
**Verificar:** os valores são `operator` e `contact` (como o service espera)?

### D.2 ⏳ Verificar `RolesGuard` e decorator `@Roles`
**Arquivos:** `backend/src/common/guards/roles.guard.ts`, `backend/src/common/decorators/roles.decorator.ts`
**Verificar:** aceita strings? Espera enum? Como é o campo `role` no `User`?

### D.3 ⏳ Verificar `JwtAuthGuard`
**Arquivo:** `backend/src/common/guards/jwt-auth.guard.ts`
**Verificar:** strategy usada (JWT? Passport? token de header?)

### D.4 ⏳ Confirmar campos do `Conversation` (já feito ✅)
Já confirmado: `contactPhone`, `datetime`, `segment`, `userId`, `userName`, `message`, `sender` existem.

### D.5 ⏳ Confirmar `package.json` do backend
**Verificar:**
- `class-validator` está nas deps?
- `class-transformer` está nas deps?
- versão do NestJS (precisa ser 9+ para `@nestjs/swagger` recente)

---

## O que está pronto

- ✅ Estrutura do `omniconnect-pro` criada em `~/Desktop/AMBIENTE DEV/omniconnect-pro/`
- ✅ 12 rules `.cursor/rules/*.mdc`
- ✅ 11 skills `.cursor/skills/<nome>/SKILL.md`
- ✅ 9 docs de produto em `docs/01-product-vision.md` → `docs/09-roadmap.md`
- ✅ Docs de migração copiados para `docs/migration/`
- ✅ `AGENTS.md`, `README.md`, `.gitignore`, `.editorconfig`, `.env.example`
- ✅ `package.json` (root + pnpm workspaces), `pnpm-workspace.yaml`, `tsconfig.base.json`
- ✅ `docker-compose.yml` (Postgres + Redis local)
- ✅ Esqueleto `docs/adr/` com template

## Próximas decisões antes de seguir

### A.3 ⏳ `taticaofc` tem produção rodando?
**Pergunta:** existe ambiente de produção rodando hoje com dados reais?
- Se SIM: precisamos plano de migração de banco com backup
- Se NÃO: podemos recriar schema do zero no `omniconnect-pro`

### A.4 ⏳ Status dos outros repos no GitHub
**Pergunta:** Botify, CRM e SAA têm repos próprios no GitHub hoje? Vão ser arquivados também?

### Repo `omniconnect-pro` no GitHub
Próximo passo prático: criar o repo `omniconnect-pro` no GitHub e fazer o primeiro `git init && git commit && git push`. Isso é uma decisão sua (privado/público? nome confirmado?).

## Próximos passos de execução

Quando você confirmar as decisões pendentes acima, a ordem é:

1. **Inicializar git no `omniconnect-pro` + primeiro commit** (configurar `gh repo create`)
2. **Migrar OmniConnect** (`taticaofc/backend` + `frontend`) para `apps/omniconnect-backend` e `apps/omniconnect-frontend` → skill `migrate-product-to-monorepo`
3. **Multi-tenant retrofit** no backend (adicionar `Tenant` model + `tenantId` em todas as tabelas)
4. **Aplicar patch InsightAI** com correções → skill `apply-insight-ai-patch`
5. Migrar Botify, CRM, SAA → skill `migrate-product-to-monorepo` (3x)
6. Criar packages `ai-contracts` e `shared-types`
7. Bridges entre apps → skill `create-bridge-endpoint`
