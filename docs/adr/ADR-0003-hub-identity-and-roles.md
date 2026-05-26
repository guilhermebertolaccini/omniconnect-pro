# ADR-0003: Hub — identidade e papéis (cutover Supabase Auth → backend Omni)

**Status:** Accepted
**Date:** 2026-05-20
**Deciders:** Produto / engineering OmniconnectPRO

## Context

Existe um **app shell** novo (`omniconnect-hub-3af79e2e-main`, gerado via Lovable) que será absorvido como `apps/omniconnect-hub` (ver [ADR-0004](ADR-0004-hub-into-monorepo.md)). Esse Hub é a entrada de identidade e a casa das superfícies **plataforma-nativa** (Home com KPIs por papel, Leads 360°, Régua de Acionamento, InsightAI, Painel Executivo, Settings). Cada app de domínio (CRM, OmniHub conversas, SAA, Botify) **mantém a sua UI própria** — o Hub não substitui essas UIs, apenas é o portal e o lar das superfícies que ainda não existiam.

Hoje, fora do monorepo, o Hub usa:

- **Supabase Auth** (`@supabase/supabase-js`, `auth.users` + RLS) como provedor de identidade.
- Tabelas locais Supabase **`tenants`**, **`tenant_members`**, **`profiles`** com `app_role` enum próprio (`corretor`, `atendente`, `gestor_comercial`, `analista_agencia`, `ceo_cfo`, `admin`).
- Trigger `handle_new_user` que cria tenant pessoal por utilizador no signup.

O `omniconnect-backend` é a fonte de verdade para tudo o resto:

- Auth: JWT curto em memória + refresh HttpOnly cookie (padrão consolidado em **Sprint 2.4 — SAA frontend cutover**, ver `docs/migration/sprint-2-4-saa-frontend.md`, blocos B.1–B.4 e C).
- Tenancy: `Tenant` + `UserTenant` em Prisma; `JwtStrategy` re-valida membership a cada request em produção (Sprint 1.3 Bloco B, ver `docs/03-multitenancy.md`).
- Papéis: enum **`Role` em `@prisma/client`** — `admin`, `supervisor`, `operator`, `ativador`, `digital`, `broker` (este último adicionado na Sprint 3 para o CRM Imobiliário).
- RBAC: `RolesGuard` lê `tenantRole` (vindo de `UserTenant.role`) com fallback para `User.role` global.

Manter **dois sistemas de identidade em paralelo** (Supabase Auth no Hub vs JWT/UserTenant no backend) é incompatível com a promessa de tenancy e com os contratos de bridges (HMAC + `IntegrationConnection`, JWT-emitted `POST /integrations/bridge/events`). Cria ambiguidade em:

- Quem é o utilizador efetivo (sessão Supabase ≠ subject do JWT Omni).
- Qual é o `tenantId` atual (linha em `public.tenants` do Supabase ≠ `Tenant.id` no Postgres do backend).
- Qual é o papel autorizativo (enum Supabase ≠ enum Prisma).

O risco prático: o Hub mostraria estado coerente para o utilizador, mas qualquer chamada ao backend recusaria — ou pior, aceitaria com tenant divergente.

[ADR-0001](ADR-0001-botify-tenancy-model.md) já tinha deferido a identidade do front Botify para uma ADR própria. Esta ADR fecha o tema também para o Hub.

## Decision

**O Hub adota a identidade do `omniconnect-backend` como fonte única.** Supabase Auth + tabelas Supabase de tenancy passam a ser **estado legado / mock de preview** e **não** são usados no caminho de produção.

### 1. Stack de identidade no Hub (alvo)

- Cliente HTTP único: **`packages/api-client/omniconnectClient`** (o mesmo já em uso no SAA frontend após Sprint 2.4 Bloco C).
- Access token: **memória do tab** (publish/subscribe via cliente), nunca `localStorage`.
- Refresh token: **cookie HttpOnly** emitido pelo backend em `POST /auth/login` e rotacionado em `POST /auth/refresh` (rotation chain + reuse detection já entregues — Sprint 2.4 Bloco B.2).
- Logout: `POST /auth/logout` (sessão atual) e `POST /auth/logout-all` (revoga toda a chain).
- Signup self-service (se habilitado por tenant): `POST /auth/register` com gating `AUTH_ALLOW_SIGNUP=true` (Sprint 2.4 Bloco B.3).
- Aceite de convite: fluxo `GET /tenant-invitations/by-token/:token` + `POST /tenant-invitations/:token/accept` (Sprint 2.4 Bloco A).

### 2. Fonte de verdade do tenant ativo

- Endpoint novo: **`GET /tenants/me`** — devolve as memberships do utilizador autenticado (lista `{ tenantId, tenantName, role, isActive }`), com `tenantRole` vindo de `UserTenant.role`.
- O Hub não escreve em `public.tenants` nem em `public.tenant_members` em produção. Não cria tenant pessoal em signup (a criação de tenant é responsabilidade do backend — registo ou convite).
- A escolha do tenant ativo persiste no Hub apenas como **preferência de UX** (cookie/local key), mas a autoridade final é o `tenantId` no JWT atual.

### 3. Papéis — backend canónico, Hub apenas mapeia rótulos

Os 6 valores do enum `Role` em Prisma permanecem canónicos. O Hub não adiciona, remove nem renomeia valores; mapeia para rótulos de display:

| Rótulo display (Hub) | Papel canónico (backend) | Notas |
|---|---|---|
| Corretor | `broker` | Adicionado na Sprint 3 (CRM) |
| Atendente | `operator` | OmniConnect operacional |
| Gestor comercial | `supervisor` | Tenant manager |
| Analista da agência | `digital` | Marketing digital / dashboards / IA |
| CEO / CFO | `digital` (provisório) | Ver §3.1 abaixo |
| Administrador | `admin` | Cross-tenant auditado |
| — | `ativador` | Sem entrada própria no menu Hub (papel operacional outbound visível apenas em vistas admin) |

#### 3.1 `ceo_cfo` provisório

- Para o piloto, `ceo_cfo` mapeia para `digital`. Acessos C-level (Painel Executivo, agregados de custo IA) são protegidos por **roles** no backend — `digital` já tem leitura nos endpoints `GET /insight-ai/dashboard/*`.
- Se ficheiro de permissão de produto provar que `ceo_cfo` precisa de superfícies que `digital` não pode ver (ou vice-versa), criar uma migration explícita adicionando **`executive`** ao enum (sem renomear / sem remover valores), com:
  - Update na seed e nas memberships existentes (`UserTenant.role`).
  - Update no `RolesGuard` e nos endpoints que exigirem.
  - Update neste ADR (Notas) referenciando a migration.

#### 3.2 Multiplicidade de papéis e tenants

O Hub respeita o que está hoje no backend: **um utilizador pode pertencer a vários tenants**, com **um papel por tenant** (`UserTenant`). O Hub apresenta:

- Lista de tenants via `GET /tenants/me`.
- Tenant ativo seleccionável; ao trocar, o Hub pede um novo access token escopado ao novo `tenantId` (mesmo padrão do SAA hoje).
- Menu derivado do papel **no tenant ativo**, não do papel global.

### 4. Module Gateway

O Hub é o ponto de entrada. Apps de domínio (CRM, OmniHub, SAA, Botify) abrem em URLs próprias, configuradas por env (`VITE_CRM_URL`, `VITE_OMNIHUB_URL`, etc., ver [ADR-0004](ADR-0004-hub-into-monorepo.md) §4).

Regras não-negociáveis:

- **Nunca** passar JWT em querystring ou hash.
- **Nunca** armazenar Meta tokens, OpenAI keys, refresh tokens em `localStorage`.
- Cookie de refresh deve ser **host-only no host da API**, `HttpOnly`,
  `Secure` em ambientes HTTPS, `SameSite=Lax` e `Path=/auth`. Não configurar
  `COOKIE_DOMAIN` na topologia publicada atual.
- Cada app satélite, ao receber a navegação, restaura sessão por
  `POST https://api.<dominio>/auth/refresh` com `credentials: include`.
  Não há SSO baseado em token compartilhado.
- Acessos negados no Hub (`hasModuleAccess === false`) são UX-only; a autorização real continua a ser feita no backend por endpoint.

### 5. Supabase no projeto Lovable original

- O `omniconnect-hub-3af79e2e-main` chega com migrations Supabase (`supabase/migrations/*.sql`) que criam `tenants`, `tenant_members`, `profiles`, `app_role` enum, trigger `handle_new_user`. **Não** são portadas para o monorepo, **não** são executadas em staging/produção.
- O ficheiro `apps/omniconnect-hub/src/integrations/supabase/*` (ou equivalente após move) é marcado como legacy. O cliente Supabase só é instanciado se um flag explícito (`VITE_USE_MOCK_AUTH=true`) estiver ligado — caminho de preview Lovable, nunca produção.

## Alternatives considered

- **Manter Supabase Auth e fazer JWT-exchange backend ↔ Supabase:** rejeitado. Duplica identidade, exige sincronização de papéis em ambos os enums, e quebra a regra de "tenantId nunca vem do client" se o JWT do Hub é assinado por outro provedor.
- **Backend assinar tokens compatíveis com Supabase (drop-in):** rejeitado. Acopla o backend a um formato de provedor terceiro e impede usar o refresh-rotation já entregue.
- **Adicionar `corretor`, `atendente`, etc. ao enum Prisma:** rejeitado por enquanto. O conjunto canónico já tem `broker` (Sprint 3) e cobre a operação. Renomeações em massa de roles são uma das operações mais arriscadas em multi-tenant — não fazer sem necessidade demonstrada.
- **Hub usar o omniconnect-frontend como identidade e iframe das outras apps:** rejeitado. Acoplaria a UI legada do `omniconnect-frontend` (que vai continuar como consola operacional) ao app shell novo. A separação UI vs identidade é o que torna o Hub interessante.

## Consequences

### Positive

- Uma única matriz de identidade: backend JWT + `UserTenant`. Todas as decisões de autorização ficam testáveis no backend (`RolesGuard`, suites E2E existentes).
- Reuso direto do cutover da Sprint 2.4 (login, refresh rotativo, signup, accept-invite, OAuth pickup) — o Hub não inventa nada novo.
- O contrato de bridges (HMAC + `IntegrationConnection`, JWT-emit) já assume backend como fonte de tenant — sem regressão de [ADR-0001](ADR-0001-botify-tenancy-model.md).
- Mapeamento display vs canónico é uma tabela pequena no Hub; muda sem migration.

### Negative

- O Hub Lovable original perde o ciclo "signup → tenant pessoal automático" via Supabase trigger. Equivalente backend é `POST /auth/register` com criação atómica de Tenant (Sprint 2.4 B.3) — válido para `AUTH_ALLOW_SIGNUP=true`, mas exige operação consciente.
- Convites multi-tenant viram fluxo backend (`tenant-invitations`) em vez de RLS Supabase. UX no Hub muda em relação ao que estava no Lovable.
- Compatibilidade com a UI Lovable inicial pode pedir adapters (ex.: `useAuth` do Hub muda de chamadas Supabase para `omniconnectClient`). Risco de regressão visual em login/signup/invite.

### Neutral

- A `app_role` enum no Supabase fica sem uso em produção. Pode ser removido das migrations futuras quando o `apps/omniconnect-hub` for promovido a job bloqueante no CI.
- O papel `ativador` continua existindo no backend mas sem item próprio no menu Hub. Visível em vistas admin (Settings) quando o caso aparecer.
- Uma topologia futura em que a API não possa receber o cookie host-only exigirá
  nova decisão de segurança antes de ampliar `Domain` do cookie.

## Notes

- Implementação real de **PR 3 — Hub identity Block A** (substituir Supabase Auth pelo `omniconnectClient`) sai desta ADR.
- Endpoint **`GET /tenants/me`** sai em **PR 3** ou **PR 4** — preferência por **PR 3** para destravar o login do Hub primeiro.
- Ver também:
  - [ADR-0001](ADR-0001-botify-tenancy-model.md) — tenancy de handoff Botify (independente).
  - [ADR-0004](ADR-0004-hub-into-monorepo.md) — onde o Hub vive fisicamente.
  - `docs/migration/sprint-2-4-saa-frontend.md` — padrão técnico já consolidado para auth no front.
  - `docs/03-multitenancy.md` — regras canónicas de tenant e role.
  - `docs/migration/pilot-flow-lead-to-recovery.md` — §4 fechado refere o Hub como casa de A6.
