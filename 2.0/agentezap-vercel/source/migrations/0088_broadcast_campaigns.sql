-- Migration: 0088_broadcast_campaigns
-- Descrição: Adiciona tabela broadcast_campaigns para envio em massa de mensagens WhatsApp
-- Suporta envio com intervalos configuráveis, por lotes e opção de personalização via IA

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id    VARCHAR REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL DEFAULT 'Campanha',
  status           VARCHAR(50) NOT NULL DEFAULT 'pending',
  message_template TEXT NOT NULL,
  media_url        TEXT,
  media_type       VARCHAR(50),
  total_contacts   INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  use_ai           BOOLEAN NOT NULL DEFAULT FALSE,
  delay_min_ms     INTEGER NOT NULL DEFAULT 60000,
  delay_max_ms     INTEGER NOT NULL DEFAULT 90000,
  batch_size       INTEGER NOT NULL DEFAULT 10,
  batch_pause_ms   INTEGER NOT NULL DEFAULT 600000,
  contacts_json    JSONB NOT NULL DEFAULT '[]',
  results_json     JSONB NOT NULL DEFAULT '[]',
  scheduled_at     TIMESTAMP,
  started_at       TIMESTAMP,
  completed_at     TIMESTAMP,
  error_message    TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_user_status ON broadcast_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status_scheduled ON broadcast_campaigns(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_connection ON broadcast_campaigns(connection_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created ON broadcast_campaigns(created_at);
