-- Migration: Multi-WhatsApp support for T4.5
-- Allows multiple WhatsApp connections per user
-- Created: 2025-02-18

-- Add connection-specific fields to whatsapp_connections
ALTER TABLE whatsapp_connections
ADD COLUMN IF NOT EXISTS connection_name VARCHAR(100), -- User-friendly name (ex: "Loja Centro", "Suporte")
ADD COLUMN IF NOT EXISTS connection_type VARCHAR(50) DEFAULT 'business', -- 'business', 'personal', 'support'
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE, -- Primary connection for the user
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL; -- Link to specific AI agent

-- Create index for user's connections lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_primary ON whatsapp_connections(userId, is_primary);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_agent ON whatsapp_connections(agent_id) WHERE agent_id IS NOT NULL;

-- Create connection_agents junction table for many-to-many relationship (connection <-> agents)
CREATE TABLE IF NOT EXISTS connection_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by VARCHAR(255),
  UNIQUE(connection_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_agents_connection ON connection_agents(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_agents_agent ON connection_agents(agent_id);

-- Create connection_members table to link team members to specific connections
CREATE TABLE IF NOT EXISTS connection_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT TRUE,
  can_respond BOOLEAN DEFAULT TRUE,
  can_manage BOOLEAN DEFAULT FALSE, -- Can manage connection settings
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(connection_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_members_connection ON connection_members(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_members_member ON connection_members(member_id);

-- Add comment
COMMENT ON TABLE connection_agents IS 'Links WhatsApp connections to AI agents - supports multi-agent per connection';
COMMENT ON TABLE connection_members IS 'Links team members to specific WhatsApp connections for access control';
