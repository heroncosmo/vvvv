CREATE TABLE IF NOT EXISTS provider_calendar_busy_windows (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_key varchar(120) NOT NULL UNIQUE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id varchar(255) NOT NULL,
  external_event_id varchar(255),
  summary text,
  start_time timestamp NOT NULL,
  end_time timestamp NOT NULL,
  source varchar(50) NOT NULL DEFAULT 'maton',
  synced_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_calendar_busy_windows_user_range
  ON provider_calendar_busy_windows (user_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_provider_calendar_busy_windows_user_calendar
  ON provider_calendar_busy_windows (user_id, calendar_id);
