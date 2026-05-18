
-- Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_sent BOOLEAN NOT NULL DEFAULT true,
  contract_pending_signature BOOLEAN NOT NULL DEFAULT true,
  payment_due_soon BOOLEAN NOT NULL DEFAULT true,
  payment_overdue BOOLEAN NOT NULL DEFAULT true,
  commission_paid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification prefs"
  ON public.notification_preferences FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own notification prefs"
  ON public.notification_preferences FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own notification prefs"
  ON public.notification_preferences FOR UPDATE
  TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clicksign integration columns on contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS external_envelope_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_envelope_url TEXT;

-- Realtime for signatures
ALTER TABLE public.signatures REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'signatures'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.signatures';
  END IF;
END $$;
