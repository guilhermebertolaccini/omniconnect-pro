
-- App role enum (mirrors src/lib/permissions.ts)
create type public.app_role as enum (
  'corretor',
  'atendente',
  'gestor_comercial',
  'analista_agencia',
  'ceo_cfo',
  'admin'
);

-- Tenants
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  initials text not null,
  created_at timestamptz not null default now()
);

-- Profiles (1:1 com auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  default_tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenant members (usuário pertence a 1+ tenants com papel)
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'corretor',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_members_user_idx on public.tenant_members(user_id);
create index tenant_members_tenant_idx on public.tenant_members(tenant_id);

-- Habilita RLS
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_members enable row level security;

-- Helpers security definer (evitam recursão)
create or replace function public.is_tenant_member(_user uuid, _tenant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where user_id = _user and tenant_id = _tenant
  );
$$;

create or replace function public.has_tenant_role(_user uuid, _tenant uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where user_id = _user and tenant_id = _tenant and role = _role
  );
$$;

-- Policies: profiles (cada usuário lê/escreve o próprio)
create policy "profiles self select" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles self update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles self insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Policies: tenants (usuário vê tenants em que é membro)
create policy "tenants member read" on public.tenants
  for select to authenticated
  using (public.is_tenant_member(auth.uid(), id));

-- Policies: tenant_members
-- Cada usuário vê a própria associação
create policy "members self read" on public.tenant_members
  for select to authenticated using (user_id = auth.uid());
-- Admins do tenant veem todos os membros daquele tenant
create policy "members tenant admin read" on public.tenant_members
  for select to authenticated
  using (public.has_tenant_role(auth.uid(), tenant_id, 'admin'));
-- Admins do tenant gerenciam membros
create policy "members tenant admin write" on public.tenant_members
  for all to authenticated
  using (public.has_tenant_role(auth.uid(), tenant_id, 'admin'))
  with check (public.has_tenant_role(auth.uid(), tenant_id, 'admin'));

-- Trigger: cria profile e tenant default em todo signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  default_tenant uuid;
  derived_name text;
begin
  derived_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  -- Cria um tenant pessoal por usuário (ponto de partida; convites virão na Fase 6)
  insert into public.tenants (name, slug, initials)
  values (
    derived_name || ' workspace',
    'u-' || replace(new.id::text, '-', ''),
    upper(substr(coalesce(derived_name, 'U'), 1, 2))
  )
  returning id into default_tenant;

  insert into public.profiles (id, full_name, default_tenant_id)
  values (new.id, derived_name, default_tenant);

  insert into public.tenant_members (tenant_id, user_id, role)
  values (default_tenant, new.id, 'admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger em profiles
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
