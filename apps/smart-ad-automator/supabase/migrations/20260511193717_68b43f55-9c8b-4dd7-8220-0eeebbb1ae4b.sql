
-- =====================================================
-- 1. ENUM agency_role
-- =====================================================
CREATE TYPE public.agency_role AS ENUM ('owner', 'admin', 'operator');

-- =====================================================
-- 2. TABLES
-- =====================================================
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agency_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.agency_role NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

CREATE TABLE public.agency_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.agency_role NOT NULL DEFAULT 'operator',
  token text NOT NULL UNIQUE,
  invited_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agency_members_user ON public.agency_members(user_id);
CREATE INDEX idx_agency_members_agency ON public.agency_members(agency_id);
CREATE INDEX idx_agency_invitations_token ON public.agency_invitations(token);
CREATE INDEX idx_agency_invitations_email ON public.agency_invitations(email);

-- =====================================================
-- 3. SEED INTERNAL AGENCY + agency_id columns
-- =====================================================
INSERT INTO public.agencies (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'AdPilotAI Interna', 'adpilot-internal', 'internal', 'active');

ALTER TABLE public.companies
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
UPDATE public.companies SET agency_id = '00000000-0000-0000-0000-000000000001' WHERE agency_id IS NULL;
ALTER TABLE public.companies ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN agency_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX idx_companies_agency ON public.companies(agency_id);

ALTER TABLE public.platform_configurations
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
UPDATE public.platform_configurations pc
  SET agency_id = c.agency_id FROM public.companies c WHERE pc.company_id = c.id;
ALTER TABLE public.platform_configurations ALTER COLUMN agency_id SET NOT NULL;
CREATE INDEX idx_platform_configs_agency ON public.platform_configurations(agency_id);

ALTER TABLE public.meta_configurations
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
UPDATE public.meta_configurations mc
  SET agency_id = c.agency_id FROM public.companies c WHERE mc.company_id = c.id;
ALTER TABLE public.meta_configurations ALTER COLUMN agency_id SET NOT NULL;
CREATE INDEX idx_meta_configs_agency ON public.meta_configurations(agency_id);

ALTER TABLE public.ai_campaign_analyses
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
UPDATE public.ai_campaign_analyses a
  SET agency_id = c.agency_id FROM public.companies c WHERE a.company_id = c.id;
ALTER TABLE public.ai_campaign_analyses ALTER COLUMN agency_id SET NOT NULL;
CREATE INDEX idx_ai_analyses_agency ON public.ai_campaign_analyses(agency_id);

-- =====================================================
-- 4. MIGRATE EXISTING ADMINS → super_admin + agency owner
-- =====================================================
INSERT INTO public.agency_members (agency_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', user_id, 'owner'::public.agency_role
FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (agency_id, user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'super_admin'::public.app_role FROM public.user_roles WHERE role = 'admin';

UPDATE public.agencies SET owner_user_id = (
  SELECT user_id FROM public.user_roles WHERE role = 'super_admin'::public.app_role LIMIT 1
) WHERE id = '00000000-0000-0000-0000-000000000001';

-- =====================================================
-- 5. SECURITY DEFINER FUNCTIONS
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_agency_member(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = _user_id AND agency_id = _agency_id)
$$;

CREATE OR REPLACE FUNCTION public.has_agency_role(_user_id uuid, _agency_id uuid, _role public.agency_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = _user_id AND agency_id = _agency_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_agency_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.agency_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.company_in_user_agencies(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.agency_members am ON am.agency_id = c.agency_id
    WHERE c.id = _company_id AND am.user_id = _user_id
  )
$$;

-- Restrict EXECUTE to authenticated only (avoid linter WARN)
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_agency_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_agency_role(uuid, uuid, public.agency_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_agency_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_in_user_agencies(uuid, uuid) FROM PUBLIC, anon;

-- =====================================================
-- 6. RLS - agencies / agency_members / invitations
-- =====================================================
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage agencies" ON public.agencies
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Members can view own agency" ON public.agencies
  FOR SELECT TO authenticated
  USING (public.is_agency_member(auth.uid(), id));

CREATE POLICY "Super admins manage members" ON public.agency_members
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners and admins manage own agency members" ON public.agency_members
  FOR ALL TO authenticated
  USING (
    public.has_agency_role(auth.uid(), agency_id, 'owner'::public.agency_role)
    OR public.has_agency_role(auth.uid(), agency_id, 'admin'::public.agency_role)
  )
  WITH CHECK (
    public.has_agency_role(auth.uid(), agency_id, 'owner'::public.agency_role)
    OR public.has_agency_role(auth.uid(), agency_id, 'admin'::public.agency_role)
  );

CREATE POLICY "Members can view team" ON public.agency_members
  FOR SELECT TO authenticated USING (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Super admins manage invitations" ON public.agency_invitations
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners and admins manage invitations" ON public.agency_invitations
  FOR ALL TO authenticated
  USING (
    public.has_agency_role(auth.uid(), agency_id, 'owner'::public.agency_role)
    OR public.has_agency_role(auth.uid(), agency_id, 'admin'::public.agency_role)
  )
  WITH CHECK (
    public.has_agency_role(auth.uid(), agency_id, 'owner'::public.agency_role)
    OR public.has_agency_role(auth.uid(), agency_id, 'admin'::public.agency_role)
  );

-- =====================================================
-- 7. RLS - replace policies on tenant tables
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
CREATE POLICY "Super admins manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Agency members manage own companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Admins can manage platform configs" ON public.platform_configurations;
CREATE POLICY "Super admins manage platform configs" ON public.platform_configurations
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Agency members manage platform configs" ON public.platform_configurations
  FOR ALL TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Admins can manage meta configs" ON public.meta_configurations;
CREATE POLICY "Super admins manage meta configs" ON public.meta_configurations
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Agency members manage meta configs" ON public.meta_configurations
  FOR ALL TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Admins can manage analyses" ON public.ai_campaign_analyses;
CREATE POLICY "Super admins manage analyses" ON public.ai_campaign_analyses
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Agency members manage analyses" ON public.ai_campaign_analyses
  FOR ALL TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS "Admins can manage access" ON public.client_company_access;
CREATE POLICY "Super admins manage client access" ON public.client_company_access
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Agency members manage client access for own companies" ON public.client_company_access
  FOR ALL TO authenticated
  USING (public.company_in_user_agencies(auth.uid(), company_id))
  WITH CHECK (public.company_in_user_agencies(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Super admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- =====================================================
-- 8. Trigger updated_at
-- =====================================================
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
