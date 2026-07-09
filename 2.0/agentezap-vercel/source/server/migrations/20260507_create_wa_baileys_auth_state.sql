CREATE TABLE IF NOT EXISTS wa_baileys_auth_creds (
  scope_key TEXT PRIMARY KEY,
  creds JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_baileys_auth_keys (
  scope_key TEXT NOT NULL,
  key_type TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, key_type, key_id)
);

ALTER TABLE wa_baileys_auth_creds ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_baileys_auth_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE wa_baileys_auth_creds FROM anon;
    REVOKE ALL ON TABLE wa_baileys_auth_keys FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE wa_baileys_auth_creds FROM authenticated;
    REVOKE ALL ON TABLE wa_baileys_auth_keys FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'wa_baileys_auth_creds'
        AND policyname = 'wa_baileys_auth_creds_no_client_access'
    ) THEN
      CREATE POLICY wa_baileys_auth_creds_no_client_access
        ON wa_baileys_auth_creds
        AS RESTRICTIVE
        FOR ALL
        TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'wa_baileys_auth_keys'
        AND policyname = 'wa_baileys_auth_keys_no_client_access'
    ) THEN
      CREATE POLICY wa_baileys_auth_keys_no_client_access
        ON wa_baileys_auth_keys
        AS RESTRICTIVE
        FOR ALL
        TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    END IF;
  END IF;
END $$;
