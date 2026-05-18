
-- Table to store Meta API configuration per company
CREATE TABLE public.meta_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  meta_business_id TEXT,
  ad_account_id TEXT,
  app_id TEXT,
  app_secret TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

ALTER TABLE public.meta_configurations ENABLE ROW LEVEL SECURITY;

-- Only admins can manage meta configurations
CREATE POLICY "Admins can manage meta configs"
  ON public.meta_configurations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Clients can view configs for their assigned companies (read-only, token masked in app)
CREATE POLICY "Clients can view own company meta config"
  ON public.meta_configurations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_company_access
      WHERE client_company_access.company_id = meta_configurations.company_id
        AND client_company_access.user_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE TRIGGER update_meta_configurations_updated_at
  BEFORE UPDATE ON public.meta_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
