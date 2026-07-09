ALTER TABLE public.grupo_olx_integrations
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_token_type varchar(64),
  ADD COLUMN IF NOT EXISTS google_expiry_date timestamp without time zone,
  ADD COLUMN IF NOT EXISTS google_scope text,
  ADD COLUMN IF NOT EXISTS google_email varchar(320),
  ADD COLUMN IF NOT EXISTS google_last_checked_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS google_last_error text;

COMMENT ON COLUMN public.grupo_olx_integrations.google_access_token IS 'Token OAuth Google/Gmail isolado do modulo Imobiliaria Grupo OLX.';
COMMENT ON COLUMN public.grupo_olx_integrations.google_refresh_token IS 'Refresh token OAuth Google/Gmail isolado do modulo Imobiliaria Grupo OLX.';
COMMENT ON COLUMN public.grupo_olx_integrations.google_email IS 'Conta Gmail conectada diretamente para leitura dos leads imobiliarios por e-mail.';
COMMENT ON COLUMN public.grupo_olx_integrations.google_scope IS 'Scopes concedidos na conexao direta Gmail da Imobiliaria.';
