BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_usage_unique
  ON public.daily_usage (user_id, usage_date);

COMMIT;
