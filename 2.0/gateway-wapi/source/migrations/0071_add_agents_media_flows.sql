-- Migration: add agents, media flows, media flow items, agent_id on whatsapp_connections
-- Created: 2026-02-17

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);

ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_agent ON whatsapp_connections(agent_id);

CREATE TABLE IF NOT EXISTS media_flows (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_flows_agent ON media_flows(agent_id);
CREATE INDEX IF NOT EXISTS idx_media_flows_active ON media_flows(is_active);

CREATE TABLE IF NOT EXISTS media_flow_items (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  flow_id VARCHAR(255) NOT NULL REFERENCES media_flows(id) ON DELETE CASCADE,
  media_id VARCHAR(255),
  media_name VARCHAR(255) NOT NULL,
  media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('audio', 'image', 'video', 'document')),
  storage_url TEXT NOT NULL,
  caption TEXT,
  delay_seconds INTEGER DEFAULT 0 NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_flow_items_flow ON media_flow_items(flow_id);
CREATE INDEX IF NOT EXISTS idx_media_flow_items_order ON media_flow_items(flow_id, display_order);
