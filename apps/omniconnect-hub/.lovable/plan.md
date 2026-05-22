# Plano: Multi-tenant real com Lovable Cloud

Migrar o app do estado atual (multi-tenant só visual, com `localStorage` e tenants fixos) para um modelo real com isolamento de dados, autenticação e papéis por organização — usando Lovable Cloud + RLS.

Abordagem escolhida: **tenant por linha (`tenant_id` em cada tabela) + RLS**, com tabela `tenant_members` ligando `auth.users` a tenants e papéis. É o padrão mais escalável e adequado ao perfil do app (vários tenants, mesmos módulos).

---

## Etapa 1 — Habilitar Lovable Cloud e auth

- Ativar Lovable Cloud (cria projeto Supabase gerenciado, sem conta externa).
- Habilitar **Email/Senha** + **Google** (defaults da plataforma).
- Manter a tela `/login` atual, mas trocar o mock por `supabase.auth.signInWithPassword` e o botão Google pelo broker (`lovable.auth.signInWithOAuth("google", ...)`).
- Adicionar página `/reset-password` (obrigatória quando há reset por email).
- Criar `_authenticated` layout route com `beforeLoad` que redireciona não autenticados para `/login` (hoje `_app.tsx` faz isso manualmente; vamos padronizar).

## Etapa 2 — Esquema de dados (migrations)

Tabelas base:

```text
tenants
  id uuid pk
  name text
  slug text unique
  initials text
  created_at timestamptz

profiles                       -- 1:1 com auth.users
  id uuid pk references auth.users on delete cascade
  full_name text
  avatar_url text
  default_tenant_id uuid references tenants

app_role (enum)                -- mesmos papéis de src/lib/permissions.ts
  'corretor' | 'atendente' | 'gestor_comercial'
  | 'analista_agencia' | 'ceo_cfo' | 'admin'

tenant_members                 -- quem pertence a qual tenant + papel
  id uuid pk
  tenant_id uuid references tenants on delete cascade
  user_id  uuid references auth.users on delete cascade
  role     app_role not null
  created_at timestamptz
  unique (tenant_id, user_id)
```

Trigger `handle_new_user` cria `profiles` automaticamente no signup. Trigger opcional para inserir o primeiro usuário como `admin` em um tenant default (ou exigir convite — ver Etapa 6).

## Etapa 3 — Helpers `security definer` (evitam recursão em RLS)

```sql
public.is_tenant_member(_user uuid, _tenant uuid) returns boolean
public.has_tenant_role(_user uuid, _tenant uuid, _role app_role) returns boolean
public.current_tenant_id() returns uuid  -- lê de JWT claim ou request header
```

Todas `stable security definer set search_path = public`.

## Etapa 4 — `tenant_id` em todas as tabelas de domínio

Quando módulos forem persistidos (leads, jornadas, anti-fadiga, brokers, budget, auditoria, line-health, omnihub, ads, etc.), cada tabela ganha:

- `tenant_id uuid not null references tenants`
- índice `(tenant_id, ...)` para consultas frequentes
- RLS habilitada com policies do tipo:

```sql
create policy "tenant read" on public.leads
  for select using (public.is_tenant_member(auth.uid(), tenant_id));

create policy "tenant write" on public.leads
  for insert with check (public.is_tenant_member(auth.uid(), tenant_id));
```

Policies adicionais por papel onde necessário (ex.: só `admin`/`gestor_comercial` editam configurações).

## Etapa 5 — Tenant ativo no cliente + servidor

- Refatorar `src/lib/auth-context.tsx`:
  - remover `TENANTS` fixo e `localStorage`;
  - hidratar usuário via `supabase.auth.onAuthStateChange` + `getSession`;
  - carregar `tenants` reais do usuário via server function (`listMyTenants`) usando `tenant_members`;
  - `switchTenant(id)` grava o tenant ativo (em cookie httpOnly ou em `localStorage` + header `x-tenant-id` enviado pelo `attachSupabaseAuth`).
- Criar middleware server `requireTenant` que valida `x-tenant-id` contra `tenant_members` e injeta `tenantId` no context dos server functions.
- Todos os `createServerFn` de domínio passam a usar `requireSupabaseAuth` + `requireTenant` e filtram por `tenant_id` (RLS é a rede de segurança, server fn é o gate principal).

## Etapa 6 — Convites e gestão de membros

- Tela em `/settings` → "Equipe": listar `tenant_members` do tenant ativo, convidar por email, alterar papel, remover.
- Server functions: `inviteMember`, `acceptInvite`, `updateMemberRole`, `removeMember` (admin do tenant).
- Tabela `tenant_invites (id, tenant_id, email, role, token, expires_at, accepted_at)`.

## Etapa 7 — Auditoria por tenant

- Tabela `audit_events (id, tenant_id, user_id, action, payload jsonb, created_at)`.
- Helper server-side `logAudit(action, payload)` chamado nas mutations sensíveis.
- Tela `/settings/audit` filtra por `tenant_id` via RLS.

## Etapa 8 — Migração dos mocks

- `leads-data.ts`, `mock-data.ts`, `line-health.functions.ts` etc. passam a ler do banco filtrando pelo tenant ativo.
- Manter um seed opcional para popular `Construtora Vega` e `Imobiliária Aurora` com dados de demonstração, só em ambientes dev.

---

## Detalhes técnicos relevantes

- **Sem Edge Functions** — toda lógica server-side via `createServerFn` (regra do template TanStack Start).
- **`attachSupabaseAuth`** já deve estar em `src/start.ts` antes de qualquer server fn protegido; vamos verificar e, se faltar, adicionar (também anexando `x-tenant-id`).
- **RLS é backstop**, não gate único: cada server fn valida `tenantId` via `requireTenant` antes de tocar o banco.
- **Papéis continuam em `src/lib/permissions.ts`** para gate de UI, mas a fonte da verdade passa a ser `tenant_members.role` (carregado por tenant ativo).
- **Sem expor "Supabase" ao usuário** — comunicação como "Lovable Cloud".

---

## Entrega sugerida em fases (cada fase é publicável)

1. Cloud + auth real + `_authenticated` layout (sem multi-tenant ainda — 1 tenant default).
2. Schema `tenants` / `profiles` / `tenant_members` + helpers + switch de tenant funcional.
3. Primeira tabela de domínio com `tenant_id` + RLS (ex.: `leads`) como referência.
4. Convites + gestão de membros.
5. Migração progressiva dos demais módulos para tabelas reais com `tenant_id`.
6. Auditoria por tenant.

Posso começar pela **Fase 1** (ativar Cloud, auth real, layout `_authenticated`) e seguir incrementalmente. Quer que eu siga essa ordem ou prefere outra priorização (ex.: começar pelo schema multi-tenant já na fase 1)?
