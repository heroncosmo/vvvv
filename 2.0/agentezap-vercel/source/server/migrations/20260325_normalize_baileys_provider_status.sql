UPDATE whatsapp_connections
SET provider_status = CASE
  WHEN is_connected = true THEN 'connected'
  ELSE 'inactive'
END
WHERE provider = 'baileys';
