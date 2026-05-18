
CREATE TABLE public.organic_post_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  company_id uuid NOT NULL,
  platform public.ad_platform NOT NULL DEFAULT 'meta'::public.ad_platform,
  account_id text,
  name text NOT NULL,
  hypothesis text,
  mode text NOT NULL CHECK (mode IN ('retroactive','manual','publish')),
  winning_metric text NOT NULL DEFAULT 'engagement_rate',
  min_sample_reach integer NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','completed','cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  winner_variant_id uuid,
  ai_summary jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organic_post_experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.organic_post_experiments(id) ON DELETE CASCADE,
  label text NOT NULL,
  note text,
  post_id text,
  scheduled_for timestamptz,
  caption text,
  media_url text,
  post_type text,
  platform text,
  metrics_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ope_company ON public.organic_post_experiments(company_id);
CREATE INDEX idx_ope_agency ON public.organic_post_experiments(agency_id);
CREATE INDEX idx_opev_experiment ON public.organic_post_experiment_variants(experiment_id);

ALTER TABLE public.organic_post_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organic_post_experiment_variants ENABLE ROW LEVEL SECURITY;

-- Experiments policies
CREATE POLICY "Agency members manage experiments"
  ON public.organic_post_experiments FOR ALL TO authenticated
  USING (public.is_agency_member(auth.uid(), agency_id))
  WITH CHECK (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Clients view assigned experiments"
  ON public.organic_post_experiments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_company_access
    WHERE client_company_access.company_id = organic_post_experiments.company_id
      AND client_company_access.user_id = auth.uid()
  ));

CREATE POLICY "Super admins manage experiments"
  ON public.organic_post_experiments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Variants policies (delegate to parent)
CREATE POLICY "Agency members manage variants"
  ON public.organic_post_experiment_variants FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organic_post_experiments e
    WHERE e.id = experiment_id AND public.is_agency_member(auth.uid(), e.agency_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organic_post_experiments e
    WHERE e.id = experiment_id AND public.is_agency_member(auth.uid(), e.agency_id)
  ));

CREATE POLICY "Clients view assigned variants"
  ON public.organic_post_experiment_variants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organic_post_experiments e
    JOIN public.client_company_access cca ON cca.company_id = e.company_id
    WHERE e.id = experiment_id AND cca.user_id = auth.uid()
  ));

CREATE POLICY "Super admins manage variants"
  ON public.organic_post_experiment_variants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_ope_updated
  BEFORE UPDATE ON public.organic_post_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_opev_updated
  BEFORE UPDATE ON public.organic_post_experiment_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
