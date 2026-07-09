WITH simulator_candidates AS (
  SELECT
    wc.id
  FROM whatsapp_connections wc
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS real_conversations
    FROM conversations c
    WHERE c.connection_id = wc.id
      AND coalesce(c.contact_number, '') <> ''
      AND c.contact_number NOT LIKE 'sim-%'
  ) stats ON true
  WHERE (
    lower(coalesce(wc.provider, '')) = 'simulator'
    OR lower(coalesce(wc.connection_method, '')) = 'simulator'
    OR lower(coalesce(wc.connection_type, '')) = 'simulator'
    OR lower(coalesce(wc.connection_name, '')) = 'simulador estamparia'
    OR coalesce(wc.provider_config ->> 'source', '') = 'estamparia-simulator'
  )
    AND (
      (coalesce(wc.phone_number, '') <> '' AND wc.phone_number NOT LIKE 'sim-%')
      OR coalesce(stats.real_conversations, 0) > 0
      OR wc.is_connected = true
      OR lower(coalesce(wc.provider_status, '')) = 'connected'
    )
)
UPDATE whatsapp_connections wc
SET
  provider = 'baileys',
  connection_method = 'qr',
  provider_status = CASE
    WHEN wc.is_connected = true OR lower(coalesce(wc.provider_status, '')) = 'connected' THEN 'connected'
    ELSE 'inactive'
  END,
  is_connected = CASE
    WHEN wc.is_connected = true OR lower(coalesce(wc.provider_status, '')) = 'connected' THEN true
    ELSE wc.is_connected
  END,
  connection_type = CASE
    WHEN lower(coalesce(wc.connection_type, '')) = 'simulator' THEN
      CASE
        WHEN coalesce(wc.is_primary, false) THEN 'primary'
        ELSE 'secondary'
      END
    ELSE wc.connection_type
  END,
  connection_name = CASE
    WHEN lower(coalesce(wc.connection_name, '')) = 'simulador estamparia' THEN NULL
    ELSE wc.connection_name
  END,
  provider_config = CASE
    WHEN jsonb_typeof(wc.provider_config) = 'object' THEN
      CASE
        WHEN (wc.provider_config - 'source') = '{}'::jsonb THEN NULL
        ELSE (wc.provider_config - 'source')
      END
    ELSE wc.provider_config
  END,
  updated_at = NOW()
FROM simulator_candidates sc
WHERE wc.id = sc.id;
