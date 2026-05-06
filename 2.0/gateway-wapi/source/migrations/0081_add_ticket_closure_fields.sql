-- Migration: Add ticket closure fields for T4.2 Encerrar Chamado
-- Created: 2025-02-18

-- Add fields to conversations table for ticket closure system
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS closed_by VARCHAR(255), -- userId or 'system'
ADD COLUMN IF NOT EXISTS closure_reason TEXT,
ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(50); -- Optional ticket reference number

-- Create index for closed conversations lookup
CREATE INDEX IF NOT EXISTS idx_conversations_closed ON conversations(is_closed) WHERE is_closed = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(closed_at) WHERE closed_at IS NOT NULL;

-- Create ticket_closure_logs table for audit trail
CREATE TABLE IF NOT EXISTS ticket_closure_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'closed', 'reopened'
  performed_by VARCHAR(255) NOT NULL, -- userId or 'system'
  performed_by_name VARCHAR(255), -- Display name
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_closure_logs_conversation ON ticket_closure_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ticket_closure_logs_created_at ON ticket_closure_logs(created_at);

-- Add comment explaining the feature
COMMENT ON COLUMN conversations.is_closed IS 'When TRUE, conversation is archived/closed but history is preserved. New messages from same contact start fresh context.';
COMMENT ON COLUMN conversations.closed_at IS 'Timestamp when the ticket was closed';
COMMENT ON COLUMN conversations.closed_by IS 'User ID who closed the ticket, or system if auto-closed';
