
-- Enum de plataformas suportadas
CREATE TYPE public.ad_platform AS ENUM ('meta', 'google_ads', 'tiktok_ads');

-- Tabela unificada de configurações por plataforma
CREATE TABLE public.platform_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  platform public.ad_platform NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  account_id text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, platform)
);

CREATE INDEX idx_platform_configurations_company ON public.platform_configurations (company_id);
CREATE INDEX idx_platform_configurations_platform ON public.platform_configurations (platform);

ALTER TABLE public.platform_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage platform configs"
  ON public.platform_configurations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own company platform config"
  ON public.platform_configurations
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_company_access
    WHERE client_company_access.company_id = platform_configurations.company_id
      AND client_company_access.user_id = auth.uid()
  ));

CREATE TRIGGER trg_platform_configurations_updated_at
  BEFORE UPDATE ON public.platform_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar configurações Meta existentes
INSERT INTO public.platform_configurations
  (company_id, platform, access_token, account_id, token_expires_at, extra, is_active, created_by, created_at, updated_at)
SELECT
  company_id,
  'meta'::public.ad_platform,
  access_token,
  ad_account_id,
  token_expires_at,
  jsonb_strip_nulls(jsonb_build_object(
    'meta_business_id', meta_business_id,
    'app_id', app_id,
    'app_secret', app_secret
  )),
  is_active,
  created_by,
  created_at,
  updated_at
FROM public.meta_configurations
ON CONFLICT (company_id, platform) DO NOTHING;

-- Plataforma na análise de IA
ALTER TABLE public.ai_campaign_analyses
  ADD COLUMN platform public.ad_platform NOT NULL DEFAULT 'meta';

CREATE INDEX idx_ai_campaign_analyses_platform ON public.ai_campaign_analyses (platform);
