
-- =============================================
-- Fix ALL RLS policies to be PERMISSIVE
-- Also create trigger for handle_new_user
-- Also create function to auto-assign admin to first user
-- =============================================

-- COMPANIES
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Clients can view assigned companies" ON public.companies;

CREATE POLICY "Admins can manage companies"
ON public.companies FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view assigned companies"
ON public.companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM client_company_access
    WHERE client_company_access.company_id = companies.id
      AND client_company_access.user_id = auth.uid()
  )
);

-- META_CONFIGURATIONS
DROP POLICY IF EXISTS "Admins can manage meta configs" ON public.meta_configurations;
DROP POLICY IF EXISTS "Clients can view own company meta config" ON public.meta_configurations;

CREATE POLICY "Admins can manage meta configs"
ON public.meta_configurations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view own company meta config"
ON public.meta_configurations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM client_company_access
    WHERE client_company_access.company_id = meta_configurations.company_id
      AND client_company_access.user_id = auth.uid()
  )
);

-- CLIENT_COMPANY_ACCESS
DROP POLICY IF EXISTS "Admins can manage access" ON public.client_company_access;
DROP POLICY IF EXISTS "Users can view own access" ON public.client_company_access;

CREATE POLICY "Admins can manage access"
ON public.client_company_access FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own access"
ON public.client_company_access FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- USER_ROLES
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- PROFILES
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Also allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for auto-creating profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If no admin exists yet, make this user an admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-assign admin on signup
CREATE OR REPLACE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_first_admin();
