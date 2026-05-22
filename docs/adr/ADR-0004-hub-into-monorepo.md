# ADR-0004: Absorção do app shell Hub no monorepo (`apps/omniconnect-hub`)

**Status:** Accepted
**Date:** 2026-05-20
**Deciders:** Produto / engineering OmniconnectPRO

## Context

O projeto `omniconnect-hub-3af79e2e-main` (gerado via Lovable, fora do monorepo) implementa o **app shell** da plataforma:

- Stack: **TanStack Start** (Vite + TanStack Router file-routes) + React 19 + Tailwind v4 + Radix + lucide-react + Supabase Auth (a ser cortado, ver [ADR-0003](ADR-0003-hub-identity-and-roles.md)).
- Superfícies plataforma-nativa: **Home** com KPIs por papel, **Módulos** (catálogo), **Leads 360°** (`/leads` + `/leads/$leadId`), **Régua de Acionamento** (`/journeys` + `/journeys/builder` com guarda de orçamento), **InsightAI** (`/insightai` com VOC, sentimento, keywords, ranking, conversation analyzer), **Painel Executivo** (`/executive`), **Settings** (brokers, audit, anti-fatigue, budget, line-health).
- `ModulePlaceholder` para apps de domínio (CRM, OmniHub, Ads/SAA, Botify): cada um mantém UI própria.
- Hoje, fora do monorepo, todos os dados são **mock** (`mock-data.ts`, `leads-data.ts`, etc.); auth é Supabase (objeto desta absorção corrigir).

Em paralelo, o monorepo `omniconnect-pro` tem:

- 5 apps: `omniconnect-backend`, `omniconnect-frontend`, `botify`, `crm-imobiliario`, `smart-ad-automator`.
- 4 packages: `ai-contracts`, `api-client`, `shared-types`, `tsconfig`.
- `omniconnect-frontend` é a UI operacional do core (conversas, painel de operador). Não tem Home unificada nem Leads 360°.

Sem absorver o Hub, ficaríamos com duas frentes de UI plataforma (uma fora do monorepo, mocks; outra dentro, operacional) e nenhuma das duas resolve o problema de **entrada única + UX coerente** que o piloto exige (ver `docs/migration/pilot-flow-lead-to-recovery.md`).

## Decision

**O `omniconnect-hub-3af79e2e-main` passa a viver no monorepo como `apps/omniconnect-hub`**, o **5.º frontend** do `pnpm-workspace`. O `omniconnect-frontend` **permanece** como consola operacional (conversas) — sem decisão de aposentadoria nesta ADR.

### 1. Move físico

- Origem: `omniconnect-hub-3af79e2e-main/` (fora do monorepo, no Desktop do dev).
- Destino: `apps/omniconnect-hub/` no monorepo `omniconnect-pro`.
- Move via `git mv` (ou cópia + commit inicial se a origem nunca esteve no git Omni), preservando histórico Lovable apenas se sem ruído.

### 2. Integração no workspace

- Atualizar `pnpm-workspace.yaml` se necessário (`apps/*` já cobre).
- `package.json` do Hub: renomear `"name": "tanstack_start_ts"` para `"name": "omniconnect-hub"`, ajustar `private: true`, manter `bun` fora (usar `pnpm` por consistência com o monorepo — `bun.lock` e `bunfig.toml` são removidos; `package-lock.json` também).
- Substituir uso de `bun install` por `pnpm install`. Scripts do Hub passam a ser invocáveis via `pnpm --filter omniconnect-hub <script>`.
- Adicionar Hub ao README e ao `docs/02-architecture.md` (módulos / apps).

### 3. Gerenciamento de dependências

- Verificar conflito de versões (`react`, `vite`, `tailwindcss`) com os outros frontends. O Hub usa React 19 e Vite 7; SAA frontend e CRM frontend já vivem com baseline TS errors em `lucide-react`/`recharts` × React 19 (Sprint 2.4 / 3.1). Tratar Hub no mesmo baseline (vide §5).
- Não introduzir `pnpm overrides` ainda. Decidir só se o hoist quebrar `omniconnect-frontend` (React 19) ou `botify` (React 18).
- Remover `@lovable.dev/cloud-auth-js` quando o cutover de auth da [ADR-0003](ADR-0003-hub-identity-and-roles.md) acontecer. Até lá, fica como dep dormente.

### 4. Module Gateway (URLs por env)

Apps de domínio continuam independentes. O Hub abre cada um por URL configurada via env do Hub (não via routing interno):

```env
VITE_API_URL=https://api.staging.omniconnectpro.<domain>
VITE_CRM_URL=https://crm.staging.omniconnectpro.<domain>
VITE_OMNIHUB_URL=https://omni.staging.omniconnectpro.<domain>
VITE_SAA_URL=https://ads.staging.omniconnectpro.<domain>
VITE_BOTIFY_URL=https://botify.staging.omniconnectpro.<domain>
```

Regras desta ADR (autoridade sobre o Module Gateway):

- O componente `ModulePlaceholder` ganha `href` real vindo dessas envs.
- **Nunca** passar JWT em querystring. Cross-app SSO usa cookie de refresh com `Domain` no parent comum (ver [ADR-0003](ADR-0003-hub-identity-and-roles.md) §4).
- Acesso negado é UX-only; autorização real continua nos endpoints do backend.

### 5. CI

- Adicionar o Hub ao workflow existente como **job não-bloqueante** (`continue-on-error: true`), mesma estratégia usada para `crm-imobiliario` e `smart-ad-automator` durante a Sprint 2.x / 3.x.
- Steps mínimos: `pnpm install`, `pnpm --filter omniconnect-hub run lint`, `pnpm --filter omniconnect-hub run build` (e `vitest` se houver testes).
- Promover a **bloqueante** quando:
  - Auth real (ADR-0003) estiver consolidada.
  - Pelo menos uma página (`/executive`) consumir dados reais do backend.
  - Baseline TS estiver tratado (mesma situação dos satélites — não bloqueia, mas documentar).

### 6. Sem decisão de aposentadoria

- O `omniconnect-frontend` **continua** como app de operação (conversas, painel de operador, `/inteligencia` legado). Nenhuma migração de páginas existentes para o Hub está incluída nesta ADR.
- Se no futuro a Home / Inteligência do `omniconnect-frontend` virar redundante com o Hub, uma ADR posterior decide a aposentadoria. Não fazer agora.

### 7. Supabase legacy

- Migrations Supabase do projeto Lovable (`supabase/migrations/*.sql`) **não** são portadas. Ficam no histórico como referência.
- Tudo que toca Supabase no código fica gated por `VITE_USE_MOCK_AUTH=true` (preview Lovable), nunca em staging/produção. Ver [ADR-0003](ADR-0003-hub-identity-and-roles.md) §5.

## Alternatives considered

- **Manter o Hub fora do monorepo, integrar via API:** rejeitado. Mesma matriz de tipos (`shared-types`, `api-client`), mesma identidade (ADR-0003), e o Hub é o ponto de entrada — não faz sentido viver noutro repo. Duplica CI, secrets e processo de deploy.
- **Tornar o Hub um package dentro de `packages/ui`:** rejeitado. O Hub é um app com rotas e estado próprio, não componentes reusáveis. Componentes que se queiram extrair vão para `packages/ui` numa iteração futura.
- **Substituir `omniconnect-frontend` pelo Hub agora:** rejeitado neste momento. O `omniconnect-frontend` tem código operacional (consola de conversas, `/inteligencia` real, integrações WhatsApp) que o Hub não cobre. Migração de páginas é trabalho futuro, com ADR própria.

## Consequences

### Positive

- Entrada única de produto: login + tenant + menu acontecem num app só.
- O Hub passa a poder consumir `packages/api-client/omniconnectClient`, `packages/shared-types`, `packages/ai-contracts` diretamente — sem cópias.
- A6 do piloto (Pilot Funnel) ganha casa natural no Hub `/executive`, sem precisar de duplicar UI no `omniconnect-frontend`.
- CI passa a tratar Hub no mesmo padrão dos outros frontends; o type-baseline é conhecido e gerível.

### Negative

- Mais um app no workspace = `pnpm install` mais pesado, builds CI mais longos. Aceitável.
- O `omniconnect-frontend` e o Hub vão sobrepor superfícies por algum tempo (Home, dashboards). Pode confundir utilizadores internos durante o staging — comunicar claramente qual é canónica.
- Custódia da dep Tailwind v4 (Hub) vs v3 (SAA/CRM/Botify) precisa de vigilância. Hoist do pnpm normalmente resolve; vigiar.

### Neutral

- O Hub ganha React 19 baseline. Mesma situação herdada de SAA / CRM frontend cutovers — TS errors em `lucide-react` / `recharts` documentados como aceitáveis até o ecossistema atualizar.
- Hub ainda usa **TanStack Start**; nada o impede de coexistir com Vite-only do resto.

## Notes

- Sequência operacional ligada a esta ADR:
  - **PR 2** — move físico + workspace integration (esta ADR).
  - **PR 3** — Hub identity Block A (cutover Supabase Auth → `omniconnectClient`, ver [ADR-0003](ADR-0003-hub-identity-and-roles.md)).
  - **PR 4** — Pilot Overview backend + Hub `/executive` card (fecha A6, ver pilot §4 fechado).
- Atualizações a registar:
  - `docs/02-architecture.md` — adicionar `omniconnect-hub` ao bloco de apps.
  - `docs/migration/06-next-actions.md` — secção "Próximo foco — Hub absorção + pilot orchestration" (esta entrega).
  - `docs/09-roadmap.md` — Hub como uma "trilha" paralela.
