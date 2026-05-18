CREATE TABLE public.frontend_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error','warn','exception','rejection')),
  message TEXT NOT NULL,
  source TEXT,
  stack TEXT,
  page TEXT,
  url TEXT,
  user_agent TEXT,
  user_id UUID,
  session_id TEXT,
  client_timestamp TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_frontend_logs_created_at ON public.frontend_logs(created_at DESC);
CREATE INDEX idx_frontend_logs_level ON public.frontend_logs(level);
CREATE INDEX idx_frontend_logs_page ON public.frontend_logs(page);

ALTER TABLE public.frontend_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view frontend logs"
ON public.frontend_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete frontend logs"
ON public.frontend_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));