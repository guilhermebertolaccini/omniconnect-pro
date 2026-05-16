---
name: migrate-product-to-monorepo
description: >-
  Import an existing standalone project into the omniconnect-pro monorepo as
  an app under apps/. Cleans build artifacts, removes nested .git, updates
  package.json name, wires the workspace, and validates the build. Use when
  the user asks to migrate, import, absorb, or add botify, crm-imobiliario,
  smart-ad-automator, or any other standalone product into the monorepo.
---

# Migrate Product to Monorepo

## When to use

Use when bringing in any of the existing standalone products:

- `taticaofc/backend/` → `apps/omniconnect-backend/` (NestJS)
- `taticaofc/frontend/` → `apps/omniconnect-frontend/` (React)
- `botify-whatsapp/` → `apps/botify/`
- `t-tica-vendas-imobili-rias-main/` → `apps/crm-imobiliario/`
- `smart-ad-automator-main/` → `apps/smart-ad-automator/`
- Or any future product folder.

> **`taticaofc` é o coração** — migrar primeiro, validar build/tests, depois os outros 3 apps em volta dele.

## Inputs needed

Ask the user (use AskQuestion if available):

1. **Source path** — absolute path of the source folder (e.g. `~/Desktop/AMBIENTE DEV/botify-whatsapp`)
2. **Target name** — folder name under `apps/` (e.g. `botify`)
3. **Preserve git history?** — usually no (recomeço limpo). If yes, use `git subtree add` instead of `cp -r`.

## Workflow

```
Task Progress:
- [ ] Step 1: Verify source exists and target slot is free
- [ ] Step 2: Copy source into apps/<target>
- [ ] Step 3: Strip artifacts (node_modules, dist, .git, .next, .turbo)
- [ ] Step 4: Update package.json name to "<target>"
- [ ] Step 5: Wire tsconfig to extend packages/tsconfig
- [ ] Step 6: Install and build inside the monorepo
- [ ] Step 7: Add to pnpm-workspace.yaml (only if not using apps/* glob)
- [ ] Step 8: Commit with "feat(monorepo): import <target>"
```

## Step 1 — Verify

```bash
ls "$SOURCE"               # must exist
ls "apps/$TARGET" 2>/dev/null && echo "TARGET ALREADY EXISTS — STOP"
```

## Step 2 — Copy

```bash
cp -r "$SOURCE" "apps/$TARGET"
```

## Step 3 — Strip artifacts

```bash
find "apps/$TARGET" -type d \( \
  -name node_modules -o \
  -name dist -o \
  -name .git -o \
  -name .next -o \
  -name .turbo -o \
  -name build \
\) -prune -exec rm -rf {} +
```

Also remove lockfiles from the source if they're not pnpm:

```bash
rm -f "apps/$TARGET/package-lock.json" "apps/$TARGET/yarn.lock" "apps/$TARGET/bun.lockb"
```

## Step 4 — Update package.json name

The 3 Lovable frontends share the generic name `vite_react_shadcn_ts` and the taticaofc backend is named `newvend-api`. Rename to match the workspace folder:

| Source `package.json#name`        | New name                |
|-----------------------------------|-------------------------|
| `newvend-api`                     | `omniconnect-backend`   |
| `vite_react_shadcn_ts` (taticaofc)| `omniconnect-frontend`  |
| `vite_react_shadcn_ts` (CRM)      | `crm-imobiliario`       |
| `vite_react_shadcn_ts` (SAA)      | `smart-ad-automator`    |
| (Botify)                          | `botify`                |

```jsonc
{
  "name": "<target>",     // e.g. "omniconnect-backend"
  "private": true,
  // ...
}
```

## Step 5 — Wire tsconfig

```jsonc
// apps/<target>/tsconfig.json
{
  "extends": "../../packages/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    // app-specific overrides
  }
}
```

## Step 6 — Install and build

```bash
pnpm install                              # from monorepo root
pnpm --filter "$TARGET" run build
pnpm --filter "$TARGET" run lint
```

If build fails, investigate before committing — don't commit broken state.

## Step 7 — Workspace

The root `pnpm-workspace.yaml` uses `apps/*` glob, so new apps are picked up automatically. If a more specific config is needed, add explicitly.

## Step 8 — Commit

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(monorepo): import <target> as apps/<target>

- copied from <source>
- stripped node_modules/.git/dist
- renamed package.json to <target>
- wired tsconfig to packages/tsconfig
EOF
)"
```

## Special cases

### taticaofc (backend + frontend together)
- Source has **two siblings** (`backend/`, `frontend/`) under one repo. They become **two separate apps** in the monorepo:
  - `taticaofc/backend/` → `apps/omniconnect-backend/`
  - `taticaofc/frontend/` → `apps/omniconnect-frontend/`
- Preserve `apps/omniconnect-backend/prisma/migrations/` integrity — never regenerate from scratch (use migrate-prisma-schema skill).
- The backend has `prisma/migration-tools/`, `media/`, `logs/` folders — keep them but add `media/` and `logs/` to `.gitignore`.
- Backend uses **Jest** (não Vitest). Não trocar.
- Frontend é **React 19** + `socket.io-client` + `recharts` + `sonner` — manter dependências como estão.

### Project has nested Supabase folder
- Keep `supabase/` inside the app (`apps/crm-imobiliario/supabase/`).
- Don't try to unify migrations across apps until the Supabase decision (Option A/B/C in `docs/migration/00-context-and-decisions.md`) is resolved.

### Project has WordPress plugin (Botify case)
- Keep `wordpress-plugin/` inside the app. Don't try to extract.

### Project has `cloudflared/` binaries or large blobs
- Move to `apps/<target>/.tooling/` and add to `.gitignore` if it's a runtime binary.

## See also

- `.cursor/rules/03-monorepo-structure.mdc`
- `docs/migration/03-migration-plan.md` (phases 5-7)
