UPDATE whatsapp_connections
SET
  provider = COALESCE(NULLIF(provider, ''), 'baileys'),
  connection_method = COALESCE(NULLIF(connection_method, ''), 'qr'),
  provider_status = CASE
    WHEN provider = 'meta_cloud_api' AND COALESCE(NULLIF(provider_status, ''), 'inactive') <> 'inactive'
      THEN provider_status
    WHEN is_connected = true
      THEN 'connected'
    WHEN provider_status IS NULL OR provider_status = ''
      THEN 'inactive'
    ELSE provider_status
  END
WHERE
  provider IS NULL
  OR provider = ''
  OR connection_method IS NULL
  OR connection_method = ''
  OR provider_status IS NULL
  OR provider_status = ''
  OR is_connected = true;
