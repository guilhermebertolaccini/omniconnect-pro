
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  company_id uuid,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user','system','webhook','cron')),
  category text NOT NULL CHECK (category IN ('oauth','token','api_call','webhook','permission','config')),
  action text NOT NULL,
  platform public.ad_platform,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_agency_created ON public.audit_logs (agency_id, created_at DESC);
CREATE INDEX idx_audit_logs_company_created ON public.audit_logs (company_id, created_at DESC);
CREATE INDEX idx_audit_logs_category_severity ON public.audit_logs (category, severity);
CREATE INDEX idx_audit_logs_severity_created ON public.audit_logs (severity, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage audit logs"
ON public.audit_logs FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Agency members view own audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_agency_member(auth.uid(), agency_id));

CREATE POLICY "Clients view own company alert logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND severity IN ('warning','error','critical')
  AND EXISTS (
    SELECT 1 FROM public.client_company_access
    WHERE company_id = audit_logs.company_id AND user_id = auth.uid()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
