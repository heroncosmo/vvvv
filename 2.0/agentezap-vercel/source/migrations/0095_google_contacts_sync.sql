CREATE TABLE IF NOT EXISTS public.google_contacts_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  google_access_token text,
  google_refresh_token text,
  google_token_type varchar(50),
  google_expiry_date timestamptz,
  google_scope text,
  google_email text,
  auto_create_before_reply boolean NOT NULL DEFAULT true,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_sync_status varchar(40),
  last_sync_message text,
  last_imported_count integer NOT NULL DEFAULT 0,
  last_created_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_contacts_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resource_name text,
  etag text,
  display_name text,
  phone_number text,
  normalized_phone text,
  email text,
  created_by_agentezap boolean NOT NULL DEFAULT false,
  source varchar(40) NOT NULL DEFAULT 'google_contacts',
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  google_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_contacts_entries_user_resource_unique
  ON public.google_contacts_entries(user_id, resource_name)
  WHERE resource_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS google_contacts_entries_user_phone_unique
  ON public.google_contacts_entries(user_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS google_contacts_entries_user_synced_idx
  ON public.google_contacts_entries(user_id, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS google_contacts_configs_user_idx
  ON public.google_contacts_configs(user_id);

ALTER TABLE public.google_contacts_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_contacts_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_contacts_configs_service_role_all ON public.google_contacts_configs;
CREATE POLICY google_contacts_configs_service_role_all
  ON public.google_contacts_configs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS google_contacts_entries_service_role_all ON public.google_contacts_entries;
CREATE POLICY google_contacts_entries_service_role_all
  ON public.google_contacts_entries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS google_contacts_configs_owner_select ON public.google_contacts_configs;
CREATE POLICY google_contacts_configs_owner_select
  ON public.google_contacts_configs
  FOR SELECT
  USING ((auth.uid())::text = user_id);

DROP POLICY IF EXISTS google_contacts_entries_owner_select ON public.google_contacts_entries;
CREATE POLICY google_contacts_entries_owner_select
  ON public.google_contacts_entries
  FOR SELECT
  USING ((auth.uid())::text = user_id);

COMMENT ON TABLE public.google_contacts_configs IS 'Tokens e configuracao OAuth isolada para o modulo Google Contacts em contatos sincronizados.';
COMMENT ON TABLE public.google_contacts_entries IS 'Cache local dos contatos importados/criados no Google Contacts por usuario.';
