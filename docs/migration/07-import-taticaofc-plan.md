# 07 — Plano: importar `taticaofc` no monorepo

Objetivo imediato: trazer o OmniConnect (`taticaofc`) para dentro do `omniconnect-pro` como **dois apps**:

- `apps/omniconnect-backend` (ex-`taticaofc/backend`)
- `apps/omniconnect-frontend` (ex-`taticaofc/frontend`)

Com **build e testes verdes** via `pnpm` na raiz do monorepo. **Nesta fase não** entram Botify, CRM Imobiliário nem Smart Ad Automator.

---

## Pré-requisitos

- Repositório local: `~/Desktop/AMBIENTE DEV/omniconnect-pro` (já com remote GitHub).
- Fontes no disco: `taticaofc/backend` e `taticaofc/frontend`.
- Nomes de pacote alvo: `omniconnect-backend` e `omniconnect-frontend` em cada `package.json`.
- Ambiente dev: Postgres + Redis (usar `docker-compose.yml` do monorepo ou o mesmo stack que já usa no `taticaofc`) — documentar qual opção foi adotada ao executar.

---

## Fase A — Backend primeiro (`apps/omniconnect-backend`)

**Motivo:** define lockfile, Prisma e é a base para CI e integração com o frontend.

1. Copiar `taticaofc/backend/` → `omniconnect-pro/apps/omniconnect-backend/`, **excluindo** artefatos: `node_modules`, `dist`, `coverage`, `.env`, `logs/`, `media/` (e lockfiles que não forem pnpm, se existirem).
2. Ajustar `apps/omniconnect-backend/package.json`: `name` → `omniconnect-backend`, `private: true`.
3. TypeScript: fazer o app estender o `tsconfig.base.json` da raiz (ou `packages/tsconfig` quando existir pacote compartilhado).
4. Confirmar que `pnpm-workspace.yaml` inclui `apps/*` (glob cobre o novo app).
5. Na **raiz** do monorepo: `pnpm install`.
6. Validações:
   - Prisma schema válido (`prisma validate` ou script do projeto).
   - `pnpm --filter omniconnect-backend run build`
   - `pnpm --filter omniconnect-backend test` (Jest)
7. Um **commit** dedicado ao import do backend (ex.: `feat(monorepo): import omniconnect backend from taticaofc`).

**Riscos:** paths absolutos em scripts, variáveis de ambiente, output customizado do Prisma, filas Bull/BullMQ apontando para Redis.

---

## Fase B — Frontend (`apps/omniconnect-frontend`)

1. Copiar `taticaofc/frontend/` → `apps/omniconnect-frontend/` com as mesmas exclusões (artefatos, segredos).
2. `package.json`: `name` → `omniconnect-frontend`.
3. Documentar/enviar para `.env.example` do app as variáveis necessárias (ex.: `VITE_*`); **nunca** commitar `.env`.
4. Alinhar `tsconfig` com a base do monorepo.
5. Validações:
   - `pnpm --filter omniconnect-frontend run build`
   - testes do frontend conforme scripts reais (`vitest`, etc.).
6. **Commit** separado do backend (`feat(monorepo): import omniconnect frontend from taticaofc`).

---

## Fase C — Integração na raiz do monorepo

1. Scripts na raiz (opcional): `dev` para backend/frontend ou documentação clara em `README.md`.
2. CI (quando criar workflows): um job por app com `pnpm --filter <pacote>` — item explícito, não obrigatório no primeiro dia.
3. `docker-compose.yml`: alinhar portas Postgres/Redis com o que `omniconnect-backend` espera.

---

## Fase D — Git / GitHub

1. Branch sugerida: `feat/import-taticaofc-apps`, ou merges pequenos direto em `main` (preferência da equipe).
2. `git push` para `origin`.

---

## O que não fazer neste ciclo

- Retrofit multi-tenant em massa (`tenantId` em todas as tabelas legadas).
- Aplicar o patch InsightAI (após estar confortável com o app importado).
- Importar Botify, CRM ou Smart Ad Automator.
- Substituir Jest por Vitest no backend.
- Arquivar o repositório `taticaofc` (somente quando o fluxo no monorepo estiver estável).

---

## Critérios de conclusão

- Backend e frontend **buildam** com `pnpm` a partir da raiz.
- Testes do backend executam sem falhas bloqueantes (follow-ups documentados se necessário).
- Nenhum segredo (`*.pem`, `.env`) versionado no Git.
- Pelo menos **dois commits** (ou dois PRs) bem separados: backend, depois frontend.

---

## Ordem resumida

`Import backend + nome + lockfile + build/test` → **push** → `Import frontend + nome + build/test` → **push** → atualizar `README` com como rodar os dois Apps.

---

## Ver também

- [`03-migration-plan.md`](./03-migration-plan.md)
- [`migrate-product-to-monorepo` skill](../../.cursor/skills/migrate-product-to-monorepo/SKILL.md)
- [`00-context-and-decisions.md`](./00-context-and-decisions.md)
