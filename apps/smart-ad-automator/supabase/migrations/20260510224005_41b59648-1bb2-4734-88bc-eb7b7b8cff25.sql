CREATE TABLE public.ai_campaign_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  analysis jsonb NOT NULL,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_campaign_analyses_company ON public.ai_campaign_analyses(company_id);
CREATE INDEX idx_ai_campaign_analyses_campaign ON public.ai_campaign_analyses(campaign_id);

ALTER TABLE public.ai_campaign_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage analyses"
ON public.ai_campaign_analyses
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view assigned analyses"
ON public.ai_campaign_analyses
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM client_company_access
  WHERE client_company_access.company_id = ai_campaign_analyses.company_id
    AND client_company_access.user_id = auth.uid()
));