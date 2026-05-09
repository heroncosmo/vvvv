CREATE TABLE IF NOT EXISTS conversation_lead_intelligence (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  connection_id VARCHAR NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_number VARCHAR NOT NULL,
  contact_name VARCHAR,
  is_potential BOOLEAN NOT NULL DEFAULT false,
  potential_score INTEGER NOT NULL DEFAULT 0,
  potential_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
  business_type VARCHAR(255),
  persona_type VARCHAR(255),
  summary TEXT,
  qualification_reason TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_approach TEXT,
  recommended_message TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  catalog_is_qualified BOOLEAN NOT NULL DEFAULT false,
  catalog_score INTEGER NOT NULL DEFAULT 0,
  catalog_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
  catalog_segment VARCHAR(255),
  catalog_persona VARCHAR(255),
  catalog_region VARCHAR(255),
  catalog_stage VARCHAR(64),
  catalog_summary TEXT,
  catalog_need_summary TEXT,
  catalog_buyer_fit_summary TEXT,
  catalog_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog_confidence INTEGER NOT NULL DEFAULT 0,
  catalog_last_analyzed_at TIMESTAMP,
  admin_status VARCHAR(32) NOT NULL DEFAULT 'new',
  campaign_count INTEGER NOT NULL DEFAULT 0,
  last_campaign_at TIMESTAMP,
  last_analyzed_at TIMESTAMP,
  last_customer_message TEXT,
  last_agent_message TEXT,
  awaiting_contact_reply BOOLEAN NOT NULL DEFAULT false,
  pending_reply_message TEXT,
  last_generated_message TEXT,
  last_generated_at TIMESTAMP,
  raw_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_version VARCHAR(64) NOT NULL DEFAULT 'lead-intel-v1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_user
ON conversation_lead_intelligence(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_potential
ON conversation_lead_intelligence(is_potential, potential_grade);

CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_status
ON conversation_lead_intelligence(admin_status, last_analyzed_at);

DO $$
BEGIN
  ALTER TABLE conversation_lead_intelligence
    ADD COLUMN IF NOT EXISTS catalog_is_qualified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS catalog_score INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS catalog_grade VARCHAR(32) NOT NULL DEFAULT 'baixo',
    ADD COLUMN IF NOT EXISTS catalog_segment VARCHAR(255),
    ADD COLUMN IF NOT EXISTS catalog_persona VARCHAR(255),
    ADD COLUMN IF NOT EXISTS catalog_region VARCHAR(255),
    ADD COLUMN IF NOT EXISTS catalog_stage VARCHAR(64),
    ADD COLUMN IF NOT EXISTS catalog_summary TEXT,
    ADD COLUMN IF NOT EXISTS catalog_need_summary TEXT,
    ADD COLUMN IF NOT EXISTS catalog_buyer_fit_summary TEXT,
    ADD COLUMN IF NOT EXISTS catalog_signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS catalog_confidence INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS catalog_last_analyzed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS awaiting_contact_reply BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pending_reply_message TEXT,
    ADD COLUMN IF NOT EXISTS last_generated_message TEXT,
    ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMP;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversation_lead_intelligence_catalog
ON conversation_lead_intelligence(catalog_is_qualified, catalog_grade, catalog_stage);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_broadcasts'
  ) THEN
    ALTER TABLE admin_broadcasts
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(64) NOT NULL DEFAULT 'users',
      ADD COLUMN IF NOT EXISTS custom_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS campaign_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS custom_min_interval_seconds INTEGER,
      ADD COLUMN IF NOT EXISTS custom_max_interval_seconds INTEGER,
      ADD COLUMN IF NOT EXISTS custom_batch_size INTEGER,
      ADD COLUMN IF NOT EXISTS custom_batch_pause_seconds INTEGER;
  END IF;
END $$;
