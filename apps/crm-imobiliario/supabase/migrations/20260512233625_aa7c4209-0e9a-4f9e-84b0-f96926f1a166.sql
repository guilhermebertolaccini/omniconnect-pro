
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL CHECK (parent_type IN ('proposal','contract')),
  parent_id uuid NOT NULL,
  pdf_url text NOT NULL,
  file_name text,
  action text NOT NULL DEFAULT 'attached' CHECK (action IN ('attached','replaced','generated','imported')),
  uploaded_by uuid,
  uploader_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_versions_parent ON public.document_versions(parent_type, parent_id, created_at DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read versions of accessible documents"
ON public.document_versions FOR SELECT TO authenticated
USING (
  (parent_type = 'proposal' AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = document_versions.parent_id
      AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
  OR
  (parent_type = 'contract' AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = document_versions.parent_id
      AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
);

CREATE POLICY "Insert versions for accessible documents"
ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (
  (parent_type = 'proposal' AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = document_versions.parent_id
      AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
  OR
  (parent_type = 'contract' AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = document_versions.parent_id
      AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  ))
);
