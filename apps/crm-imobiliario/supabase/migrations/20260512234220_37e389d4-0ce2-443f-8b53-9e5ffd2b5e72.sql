
-- Enums
CREATE TYPE public.payment_type AS ENUM ('signal','installment','balloon');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','overdue');
CREATE TYPE public.commission_status AS ENUM ('pending','paid');

-- payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  property_id uuid NOT NULL,
  property_name text NOT NULL,
  unit_id uuid NOT NULL,
  unit_number text NOT NULL,
  client_id uuid NOT NULL,
  client_name text NOT NULL,
  type payment_type NOT NULL,
  installment_number int,
  amount numeric NOT NULL DEFAULT 0,
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  status payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_contract ON public.payments(contract_id);
CREATE INDEX idx_payments_property ON public.payments(property_id);
CREATE INDEX idx_payments_status_due ON public.payments(status, due_date);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read payments of accessible contracts" ON public.payments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.id = payments.contract_id
    AND (c.broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
));
CREATE POLICY "Insert payments by admin/manager" ON public.payments FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Update payments by admin/manager or contract broker" ON public.payments FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
  OR EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = payments.contract_id AND c.broker_id = auth.uid())
);
CREATE POLICY "Delete payments by admin" ON public.payments FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- commissions
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  property_id uuid NOT NULL,
  property_name text NOT NULL,
  unit_id uuid NOT NULL,
  unit_number text NOT NULL,
  broker_id uuid NOT NULL,
  broker_name text,
  sale_price numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 5,
  commission_value numeric NOT NULL DEFAULT 0,
  status commission_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_commissions_contract ON public.commissions(contract_id);
CREATE INDEX idx_commissions_broker ON public.commissions(broker_id);
CREATE INDEX idx_commissions_property ON public.commissions(property_id);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read commissions own/all" ON public.commissions FOR SELECT TO authenticated
USING (broker_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Insert commissions by admin/manager" ON public.commissions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Update commissions by admin/manager" ON public.commissions FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Delete commissions by admin" ON public.commissions FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_commissions_updated BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- commission_configs
CREATE TABLE public.commission_configs (
  property_id uuid PRIMARY KEY,
  commission_percent numeric NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.commission_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read commission configs all" ON public.commission_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage commission configs admin/manager" ON public.commission_configs FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_commission_configs_updated BEFORE UPDATE ON public.commission_configs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generation function
CREATE OR REPLACE FUNCTION public.generate_financials_on_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pc jsonb;
  down numeric;
  inst_n int;
  inst_v numeric;
  bal numeric;
  cfg numeric;
  i int;
  due timestamptz;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- avoid duplicate generation
    IF EXISTS (SELECT 1 FROM public.payments WHERE contract_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    pc := COALESCE(NEW.payment_condition, '{}'::jsonb);
    down := COALESCE((pc->>'downPayment')::numeric, 0);
    inst_n := COALESCE((pc->>'installments')::int, 0);
    inst_v := COALESCE((pc->>'installmentValue')::numeric, 0);
    bal := COALESCE((pc->>'balloon')::numeric, 0);

    IF down > 0 THEN
      INSERT INTO public.payments(contract_id, property_id, property_name, unit_id, unit_number,
        client_id, client_name, type, amount, due_date)
      VALUES (NEW.id, NEW.property_id, NEW.property_name, NEW.unit_id, NEW.unit_number,
        NEW.client_id, NEW.client_name, 'signal', down, now());
    END IF;

    IF inst_n > 0 AND inst_v > 0 THEN
      FOR i IN 1..inst_n LOOP
        due := now() + (i || ' months')::interval;
        INSERT INTO public.payments(contract_id, property_id, property_name, unit_id, unit_number,
          client_id, client_name, type, installment_number, amount, due_date)
        VALUES (NEW.id, NEW.property_id, NEW.property_name, NEW.unit_id, NEW.unit_number,
          NEW.client_id, NEW.client_name, 'installment', i, inst_v, due);
      END LOOP;
    END IF;

    IF bal > 0 THEN
      due := now() + ((inst_n + 1) || ' months')::interval;
      INSERT INTO public.payments(contract_id, property_id, property_name, unit_id, unit_number,
        client_id, client_name, type, amount, due_date)
      VALUES (NEW.id, NEW.property_id, NEW.property_name, NEW.unit_id, NEW.unit_number,
        NEW.client_id, NEW.client_name, 'balloon', bal, due);
    END IF;

    -- Commission
    SELECT commission_percent INTO cfg FROM public.commission_configs WHERE property_id = NEW.property_id;
    cfg := COALESCE(cfg, 5);
    INSERT INTO public.commissions(contract_id, property_id, property_name, unit_id, unit_number,
      broker_id, broker_name, sale_price, commission_percent, commission_value)
    VALUES (NEW.id, NEW.property_id, NEW.property_name, NEW.unit_id, NEW.unit_number,
      NEW.broker_id, NEW.broker_name, NEW.final_price, cfg, NEW.final_price * cfg / 100);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contracts_generate_financials
AFTER UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.generate_financials_on_signed();
