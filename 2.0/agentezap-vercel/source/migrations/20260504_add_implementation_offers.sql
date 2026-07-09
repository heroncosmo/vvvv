CREATE TABLE IF NOT EXISTS public.implementation_offers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  access_code text NOT NULL UNIQUE,
  title text NOT NULL,
  badge text,
  description text NOT NULL,
  original_amount numeric(10, 2) NOT NULL DEFAULT 0,
  promotional_amount numeric(10, 2) NOT NULL DEFAULT 0,
  delivery_days integer NOT NULL DEFAULT 7,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_implementation_offers_status
  ON public.implementation_offers(status);

CREATE INDEX IF NOT EXISTS idx_implementation_offers_created_at
  ON public.implementation_offers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_implementation_offers_access_code
  ON public.implementation_offers(upper(access_code));

ALTER TABLE public.implementation_offers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'implementation_offers'
      AND policyname = 'implementation_offers_no_direct_client_access'
  ) THEN
    CREATE POLICY implementation_offers_no_direct_client_access
      ON public.implementation_offers
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

ALTER TABLE public.specialist_addons
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_specialist_addons_metadata_implementation_code
  ON public.specialist_addons ((metadata->>'implementationCode'));
