BEGIN;

CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_user
  ON public.admin_autologin_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_admin_autologin_tokens_expires
  ON public.admin_autologin_tokens (expires_at);

DROP INDEX IF EXISTS public.idx_autologin_user_id;
DROP INDEX IF EXISTS public.idx_autologin_expires;

COMMIT;
