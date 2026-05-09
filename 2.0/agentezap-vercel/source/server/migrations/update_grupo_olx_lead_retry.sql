ALTER TABLE grupo_olx_lead_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamp;

CREATE INDEX IF NOT EXISTS idx_grupo_olx_lead_events_next_retry
  ON grupo_olx_lead_events(next_retry_at);
