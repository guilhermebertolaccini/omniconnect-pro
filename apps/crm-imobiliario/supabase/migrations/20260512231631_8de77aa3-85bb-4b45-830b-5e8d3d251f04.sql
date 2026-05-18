-- ============= PROPOSALS =============
CREATE TYPE public.proposal_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  property_name TEXT NOT NULL,
  unit_id UUID NOT NULL,
  unit_number TEXT NOT NULL,
  client_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  broker_id UUID NOT NULL,
  broker_name TEXT,
  original_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  final_price NUMERIC NOT NULL DEFAULT 0,
  payment_condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  status proposal_status NOT NULL DEFAULT 'draft',
  valid_until TIMESTAMPTZ,
  pdf_url TEXT,
  source_pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_unit ON public.proposals(unit_id);
CREATE INDEX idx_proposals_client ON public.proposals(client_id);
CREATE INDEX idx_proposals_broker ON public.proposals(broker_id);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own proposals or all if admin/manager" ON public.proposals
  FOR SELECT TO authenticated USING (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Insert proposals as broker/admin/manager" ON public.proposals
  FOR INSERT TO authenticated WITH CHECK (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Update own proposals or all if admin/manager" ON public.proposals
  FOR UPDATE TO authenticated USING (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Delete proposals admin/manager" ON public.proposals
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= CONTRACTS =============
CREATE TYPE public.contract_status AS ENUM ('draft', 'review', 'pending_signature', 'signed');

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID,
  property_id UUID NOT NULL,
  property_name TEXT NOT NULL,
  unit_id UUID NOT NULL,
  unit_number TEXT NOT NULL,
  client_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  client_cpf_cnpj TEXT,
  broker_id UUID NOT NULL,
  broker_name TEXT,
  final_price NUMERIC NOT NULL DEFAULT 0,
  payment_condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  status contract_status NOT NULL DEFAULT 'draft',
  signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_url TEXT,
  source_pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_unit ON public.contracts(unit_id);
CREATE INDEX idx_contracts_proposal ON public.contracts(proposal_id);
CREATE INDEX idx_contracts_broker ON public.contracts(broker_id);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own contracts or all if admin/manager" ON public.contracts
  FOR SELECT TO authenticated USING (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Insert contracts as broker/admin/manager" ON public.contracts
  FOR INSERT TO authenticated WITH CHECK (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Update own contracts or all if admin/manager" ON public.contracts
  FOR UPDATE TO authenticated USING (
    broker_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Delete contracts admin/manager" ON public.contracts
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= STORAGE BUCKET =============
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-contracts', 'proposal-contracts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated read proposal-contracts" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'proposal-contracts');

CREATE POLICY "Authenticated insert proposal-contracts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'proposal-contracts' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Authenticated update own proposal-contracts" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'proposal-contracts' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Authenticated delete own proposal-contracts" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'proposal-contracts' AND auth.uid()::text = (storage.foldername(name))[1]
  );