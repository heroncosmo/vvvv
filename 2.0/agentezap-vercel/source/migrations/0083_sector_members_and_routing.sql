-- Migration: Sector members and routing for T4.4
-- Supports multiple members per sector and routing
-- Created: 2025-02-18

-- Create sector_members table for many-to-many relationship
CREATE TABLE IF NOT EXISTS sector_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE, -- Primary responsible for this sector
  can_receive_tickets BOOLEAN DEFAULT TRUE,
  max_open_tickets INTEGER DEFAULT 10, -- Max tickets this member can handle
  current_open_tickets INTEGER DEFAULT 0,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by VARCHAR(255),
  UNIQUE(sector_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_sector_members_sector ON sector_members(sector_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_member ON sector_members(member_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_primary ON sector_members(sector_id, is_primary) WHERE is_primary = TRUE;

-- Add sector_id to conversations for routing
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_to_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS routing_intent VARCHAR(100), -- Detected intent (finance, support, sales)
ADD COLUMN IF NOT EXISTS routing_confidence DECIMAL(3,2), -- AI confidence score (0.00 - 1.00)
ADD COLUMN IF NOT EXISTS routing_at TIMESTAMP; -- When routing occurred

CREATE INDEX IF NOT EXISTS idx_conversations_sector ON conversations(sector_id) WHERE sector_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to_member_id) WHERE assigned_to_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_routing_intent ON conversations(routing_intent) WHERE routing_intent IS NOT NULL;

-- Create routing_logs table for audit and analytics
CREATE TABLE IF NOT EXISTS routing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_text TEXT, -- The message that triggered routing
  detected_intent VARCHAR(100),
  matched_sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  confidence_score DECIMAL(3,2),
  assigned_to_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  routing_method VARCHAR(50), -- 'ai', 'manual', 'keyword', 'round_robin'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_logs_conversation ON routing_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_created_at ON routing_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_routing_logs_sector ON routing_logs(matched_sector_id);

-- Create saas_owner_reports table for T4.4 reporting
CREATE TABLE IF NOT EXISTS saas_owner_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(50) NOT NULL, -- 'attendance', 'sector', 'agent', 'response_time'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  generated_by VARCHAR(255),
  
  -- Report data as JSONB for flexibility
  data JSONB DEFAULT '{}',
  
  -- Summary metrics
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  avg_response_time_minutes INTEGER,
  satisfaction_score DECIMAL(3,2),
  
  -- Filters used
  filters JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_saas_owner_reports_type ON saas_owner_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_saas_owner_reports_period ON saas_owner_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_saas_owner_reports_generated ON saas_owner_reports(generated_at);

-- Add comments
COMMENT ON TABLE sector_members IS 'Links team members to sectors - supports multiple members per sector';
COMMENT ON TABLE routing_logs IS 'Audit trail for conversation routing decisions';
COMMENT ON TABLE saas_owner_reports IS 'Reports for SaaS owner about system usage and attendance';
