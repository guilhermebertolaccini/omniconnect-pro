-- signatures table
CREATE TABLE IF NOT EXISTS public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  role text NOT NULL,
  signer_name text,
  signer_email text,
  status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  signed_at timestamptz,
  ip_address text,
  signature_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_id, role)
);

CREATE INDEX IF NOT EXISTS idx_signatures_contract ON public.signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_token ON public.signatures(token);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read signatures of accessible contracts"
ON public.signatures FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = signatures.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE POLICY "Insert signatures for accessible contracts"
ON public.signatures FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = signatures.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE POLICY "Update signatures of accessible contracts"
ON public.signatures FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = signatures.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE TRIGGER trg_signatures_updated_at
BEFORE UPDATE ON public.signatures
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- contract_events table
CREATE TABLE IF NOT EXISTS public.contract_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_events_contract ON public.contract_events(contract_id, created_at DESC);

ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read contract events of accessible contracts"
ON public.contract_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_events.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

CREATE POLICY "Insert contract events of accessible contracts"
ON public.contract_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = contract_events.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));

-- Seed signatures rows from contracts.signatures jsonb when a contract is created
CREATE OR REPLACE FUNCTION public.seed_contract_signatures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s jsonb;
BEGIN
  IF NEW.signatures IS NOT NULL AND jsonb_typeof(NEW.signatures) = 'array' THEN
    FOR s IN SELECT * FROM jsonb_array_elements(NEW.signatures)
    LOOP
      INSERT INTO public.signatures(contract_id, role, signer_name, status, signed_at)
      VALUES (
        NEW.id,
        COALESCE(s->>'role', 'unknown'),
        NULLIF(s->>'name', ''),
        CASE WHEN (s->>'signed')::boolean THEN 'signed' ELSE 'pending' END,
        CASE WHEN (s->>'signed')::boolean THEN COALESCE((s->>'signedAt')::timestamptz, now()) ELSE NULL END
      )
      ON CONFLICT (contract_id, role) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_contract_signatures() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_contract_signatures ON public.contracts;
CREATE TRIGGER trg_seed_contract_signatures
AFTER INSERT ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.seed_contract_signatures();

-- Log contract status changes
CREATE OR REPLACE FUNCTION public.log_contract_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contract_events(contract_id, event_type, to_status, created_by)
    VALUES (NEW.id, 'created', NEW.status::text, NEW.broker_id);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.contract_events(contract_id, event_type, from_status, to_status, created_by)
    VALUES (NEW.id, 'status_change', OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_contract_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contract_status_change ON public.contracts;
CREATE TRIGGER trg_contract_status_change
AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.log_contract_status_change();

-- Sync contracts.signatures jsonb when a signatures row changes (backward compat)
CREATE OR REPLACE FUNCTION public.sync_contract_signatures_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agg jsonb;
  all_signed boolean;
  cid uuid;
BEGIN
  cid := COALESCE(NEW.contract_id, OLD.contract_id);
  SELECT jsonb_agg(jsonb_build_object(
    'role', role,
    'name', COALESCE(signer_name, ''),
    'signed', status = 'signed',
    'signedAt', signed_at
  ) ORDER BY role)
  INTO agg
  FROM public.signatures WHERE contract_id = cid;

  SELECT bool_and(status = 'signed') INTO all_signed
  FROM public.signatures WHERE contract_id = cid;

  UPDATE public.contracts
  SET signatures = COALESCE(agg, '[]'::jsonb),
      status = CASE WHEN all_signed THEN 'signed'::contract_status ELSE status END
  WHERE id = cid;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_contract_signatures_jsonb() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_contract_sigs ON public.signatures;
CREATE TRIGGER trg_sync_contract_sigs
AFTER INSERT OR UPDATE OR DELETE ON public.signatures
FOR EACH ROW EXECUTE FUNCTION public.sync_contract_signatures_jsonb();

-- Backfill: seed signatures table for existing contracts
INSERT INTO public.signatures (contract_id, role, signer_name, status, signed_at)
SELECT
  c.id,
  COALESCE(s->>'role', 'unknown'),
  NULLIF(s->>'name', ''),
  CASE WHEN (s->>'signed')::boolean THEN 'signed' ELSE 'pending' END,
  CASE WHEN (s->>'signed')::boolean THEN COALESCE((s->>'signedAt')::timestamptz, now()) ELSE NULL END
FROM public.contracts c, jsonb_array_elements(c.signatures) s
ON CONFLICT (contract_id, role) DO NOTHING;