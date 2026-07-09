ALTER TABLE public.coupons
ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.coupons
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_coupons_owner_user_id
ON public.coupons(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_coupons_active_valid_until
ON public.coupons(is_active, valid_until);
