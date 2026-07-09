-- Migration: UI/UX improvements and scheduling enhancements for T4.1 and T4.3
-- Created: 2025-02-18

-- Add signature fields to team_members (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'signature') THEN
    ALTER TABLE team_members ADD COLUMN signature VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_members' AND column_name = 'signature_enabled') THEN
    ALTER TABLE team_members ADD COLUMN signature_enabled BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add bulk_actions_log table for tracking mass operations
CREATE TABLE IF NOT EXISTS bulk_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL, -- 'enable_ai', 'disable_ai', 'tag', 'archive', 'close'
  performed_by VARCHAR(255) NOT NULL,
  performed_by_name VARCHAR(255),
  affected_conversations INTEGER DEFAULT 0,
  conversation_ids TEXT[], -- Array of affected conversation IDs
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_actions_log_created ON bulk_actions_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bulk_actions_log_type ON bulk_actions_log(action_type);

-- Add scheduled_messages table for T4.3
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  
  -- Message content
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'ai_generated', 'template'
  
  -- AI generation fields
  ai_prompt TEXT, -- Prompt used to generate message (if AI generated)
  ai_generated_text TEXT, -- Original AI generated text before editing
  was_edited BOOLEAN DEFAULT FALSE, -- Whether user edited the AI output
  
  -- Scheduling
  scheduled_at TIMESTAMP NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  sent_at TIMESTAMP,
  error_message TEXT,
  
  -- Metadata
  created_by VARCHAR(255) NOT NULL,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation ON scheduled_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON scheduled_messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending ON scheduled_messages(status, scheduled_at) WHERE status = 'pending';

-- Create function to send scheduled messages (can be called by a cron job)
CREATE OR REPLACE FUNCTION process_scheduled_messages()
RETURNS INTEGER AS $$
DECLARE
  sent_count INTEGER := 0;
  msg RECORD;
BEGIN
  FOR msg IN 
    SELECT * FROM scheduled_messages 
    WHERE status = 'pending' 
    AND scheduled_at <= NOW()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- The actual sending will be handled by the application
    -- This function just marks them as ready to send
    UPDATE scheduled_messages 
    SET status = 'processing'
    WHERE id = msg.id;
    
    sent_count := sent_count + 1;
  END LOOP;
  
  RETURN sent_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE scheduled_messages IS 'Messages scheduled to be sent at a specific time, with optional AI generation';
COMMENT ON TABLE bulk_actions_log IS 'Audit log for bulk actions performed on conversations';
COMMENT ON COLUMN scheduled_messages.message_type IS 'Type: text (manual), ai_generated (AI created), template (pre-defined)';
COMMENT ON COLUMN scheduled_messages.was_edited IS 'True if user edited the AI generated message before scheduling';
