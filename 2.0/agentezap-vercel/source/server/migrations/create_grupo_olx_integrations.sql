CREATE TABLE IF NOT EXISTS grupo_olx_integrations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(50) NOT NULL DEFAULT 'inactive',
  token varchar(128) NOT NULL,
  connection_id varchar REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  funnel_id varchar REFERENCES sales_funnels(id) ON DELETE SET NULL,
  stage_id varchar REFERENCES funnel_stages(id) ON DELETE SET NULL,
  auto_reply_template text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_olx_integrations_user
  ON grupo_olx_integrations(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_olx_integrations_token
  ON grupo_olx_integrations(token);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_integrations_active
  ON grupo_olx_integrations(active);

CREATE TABLE IF NOT EXISTS grupo_olx_lead_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id varchar NOT NULL REFERENCES grupo_olx_integrations(id) ON DELETE CASCADE,
  origin_lead_id varchar(255) NOT NULL,
  client_listing_id varchar(255),
  portal_source varchar(100) NOT NULL DEFAULT 'Grupo OLX',
  lead_type varchar(100),
  contact_name varchar(255),
  contact_phone varchar(50),
  contact_email varchar(255),
  conversation_id varchar REFERENCES conversations(id) ON DELETE SET NULL,
  deal_id varchar REFERENCES funnel_deals(id) ON DELETE SET NULL,
  status varchar(50) NOT NULL DEFAULT 'received',
  error_message text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_lead_events_integration
  ON grupo_olx_lead_events(integration_id);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_lead_events_status
  ON grupo_olx_lead_events(status);

CREATE INDEX IF NOT EXISTS idx_grupo_olx_lead_events_created
  ON grupo_olx_lead_events(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_olx_lead_events_unique_origin
  ON grupo_olx_lead_events(integration_id, origin_lead_id);
