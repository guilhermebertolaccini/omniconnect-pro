
CREATE TABLE public.document_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_type text NOT NULL CHECK (parent_type IN ('proposal','contract')),
  parent_id uuid NOT NULL,
  pdf_url text NOT NULL,
  action text NOT NULL CHECK (action IN ('viewed','downloaded')),
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_access_parent ON public.document_access_log(parent_type, parent_id, created_at DESC);

ALTER TABLE public.document_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read access logs of accessible documents"
ON public.document_access_log FOR SELECT TO authenticated
USING (
  ((parent_type = 'proposal') AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = document_access_log.parent_id
      AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
  OR ((parent_type = 'contract') AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = document_access_log.parent_id
      AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
);

CREATE POLICY "Insert own access log for accessible documents"
ON public.document_access_log FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid())
  AND (
    ((parent_type = 'proposal') AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = document_access_log.parent_id
        AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
    ))
    OR ((parent_type = 'contract') AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = document_access_log.parent_id
        AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
    ))
  )
);
