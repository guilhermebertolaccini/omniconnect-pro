CREATE TABLE IF NOT EXISTS public.proposal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal ON public.proposal_events(proposal_id, created_at DESC);

ALTER TABLE public.proposal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read proposal events of accessible proposals"
ON public.proposal_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.proposals p
  WHERE p.id = proposal_events.proposal_id
    AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE POLICY "Insert proposal events for accessible proposals"
ON public.proposal_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.proposals p
  WHERE p.id = proposal_events.proposal_id
    AND (p.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE OR REPLACE FUNCTION public.log_proposal_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.proposal_events(proposal_id, event_type, to_status, created_by)
    VALUES (NEW.id, 'created', NEW.status::text, NEW.broker_id);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.proposal_events(proposal_id, event_type, from_status, to_status, created_by)
    VALUES (NEW.id, 'status_change', OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_status_change ON public.proposals;
CREATE TRIGGER trg_proposal_status_change
AFTER INSERT OR UPDATE OF status ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.log_proposal_status_change();