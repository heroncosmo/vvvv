ALTER TABLE public.google_calendar_sync_state
  ADD COLUMN IF NOT EXISTS sync_token text,
  ADD COLUMN IF NOT EXISTS last_full_sync_at timestamp without time zone;

