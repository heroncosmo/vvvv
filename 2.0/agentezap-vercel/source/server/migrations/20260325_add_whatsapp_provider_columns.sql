ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS provider varchar(50) NOT NULL DEFAULT 'baileys',
  ADD COLUMN IF NOT EXISTS connection_method varchar(50) NOT NULL DEFAULT 'qr',
  ADD COLUMN IF NOT EXISTS provider_status varchar(50) NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS provider_config jsonb;

UPDATE whatsapp_connections
SET
  provider = COALESCE(NULLIF(provider, ''), 'baileys'),
  connection_method = COALESCE(NULLIF(connection_method, ''), 'qr'),
  provider_status = CASE
    WHEN is_connected = true THEN 'connected'
    ELSE COALESCE(NULLIF(provider_status, ''), 'inactive')
  END
WHERE
  provider IS NULL
  OR connection_method IS NULL
  OR provider_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_provider
  ON whatsapp_connections(provider);
