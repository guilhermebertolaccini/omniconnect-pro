-- Extend enums (additive — values cannot be used in same tx, but we only do DDL here)
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'visit';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'closed_won';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'closed_lost';
ALTER TYPE public.interaction_type ADD VALUE IF NOT EXISTS 'visit';

-- Leads: link to client, free-text property interest, cached broker name
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS property_interest text,
  ADD COLUMN IF NOT EXISTS broker_name text;

CREATE INDEX IF NOT EXISTS idx_leads_client_id ON public.leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_broker_id ON public.leads(broker_id);

-- Follow-ups: title + completed_at
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_id ON public.follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON public.interactions(lead_id);