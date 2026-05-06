BEGIN;

DROP INDEX IF EXISTS public.idx_autologin_expires;
DROP INDEX IF EXISTS public.idx_autologin_user_id;

COMMIT;
