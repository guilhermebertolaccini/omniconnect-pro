
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Clients can view assigned companies" ON public.companies;

CREATE POLICY "Admins can manage companies"
ON public.companies FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

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

-- Also fix meta_configurations policies
DROP POLICY IF EXISTS "Admins can manage meta configs" ON public.meta_configurations;
DROP POLICY IF EXISTS "Clients can view own company meta config" ON public.meta_configurations;

CREATE POLICY "Admins can manage meta configs"
ON public.meta_configurations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

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

-- Fix client_company_access policies too
DROP POLICY IF EXISTS "Admins can manage access" ON public.client_company_access;
DROP POLICY IF EXISTS "Users can view own access" ON public.client_company_access;

CREATE POLICY "Admins can manage access"
ON public.client_company_access FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own access"
ON public.client_company_access FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
