
-- Client-company access table
CREATE TABLE public.client_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
ALTER TABLE public.client_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage access"
  ON public.client_company_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own access"
  ON public.client_company_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Now add policy for clients to view their assigned companies
CREATE POLICY "Clients can view assigned companies"
  ON public.companies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_company_access
      WHERE client_company_access.company_id = companies.id
        AND client_company_access.user_id = auth.uid()
    )
  );
