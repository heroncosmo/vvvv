-- Migration: Add trigger_phrases column to ai_agent_config table
-- Date: 2025-11-18
-- Description: Adds support for trigger phrases that control when the AI agent should respond

ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS trigger_phrases TEXT[];

-- Add comment to column
COMMENT ON COLUMN ai_agent_config.trigger_phrases IS 'Array of trigger phrases - AI will only respond if conversation contains at least one of these phrases. NULL/empty means respond to all conversations.';
