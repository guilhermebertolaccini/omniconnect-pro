
CREATE TABLE public.change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_history_entity ON public.change_history(entity_type, entity_id, created_at DESC);

ALTER TABLE public.change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read change history all authenticated" ON public.change_history FOR SELECT TO authenticated USING (true);
-- No insert/update/delete policies — only triggers (SECURITY DEFINER) write to it.

-- Helper: resolve current user's display name
CREATE OR REPLACE FUNCTION public.audit_current_user_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.full_name, '') FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.audit_current_user_name() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_current_user_name() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_current_user_name() FROM authenticated;

-- Generic logger for a single (entity_type, entity_id, field) change
CREATE OR REPLACE FUNCTION public.log_field_change(
  _entity_type text, _entity_id uuid, _field text, _old text, _new text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _old IS DISTINCT FROM _new THEN
    INSERT INTO public.change_history(entity_type, entity_id, field, old_value, new_value, user_id, user_name)
    VALUES (_entity_type, _entity_id, _field, _old, _new, auth.uid(), public.audit_current_user_name());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_field_change(text, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_field_change(text, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_field_change(text, uuid, text, text, text) FROM authenticated;

-- Units audit trigger
CREATE OR REPLACE FUNCTION public.audit_units_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_field_change('unit', NEW.id, 'status', OLD.status::text, NEW.status::text);
  PERFORM public.log_field_change('unit', NEW.id, 'price', OLD.price::text, NEW.price::text);
  PERFORM public.log_field_change('unit', NEW.id, 'client_id',
    COALESCE(OLD.client_id::text, ''), COALESCE(NEW.client_id::text, ''));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_units_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_units_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_units_changes() FROM authenticated;

CREATE TRIGGER trg_audit_units AFTER UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.audit_units_changes();

-- Properties audit trigger
CREATE OR REPLACE FUNCTION public.audit_properties_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_field_change('property', NEW.id, 'name', OLD.name, NEW.name);
  PERFORM public.log_field_change('property', NEW.id, 'address', OLD.address, NEW.address);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_properties_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_properties_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_properties_changes() FROM authenticated;

CREATE TRIGGER trg_audit_properties AFTER UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.audit_properties_changes();

-- Leads audit trigger
CREATE OR REPLACE FUNCTION public.audit_leads_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_field_change('lead', NEW.id, 'stage', OLD.stage::text, NEW.stage::text);
  PERFORM public.log_field_change('lead', NEW.id, 'broker_id',
    COALESCE(OLD.broker_id::text, ''), COALESCE(NEW.broker_id::text, ''));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_leads_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_leads_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_leads_changes() FROM authenticated;

CREATE TRIGGER trg_audit_leads AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_leads_changes();
