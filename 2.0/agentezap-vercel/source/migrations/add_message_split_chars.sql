-- Add message_split_chars column to ai_agent_config table
-- This column controls how many characters each message bubble can have before splitting
-- 0 = no split, 200 = small bubbles, 400 = medium (default), 600 = large bubbles

ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS message_split_chars INTEGER DEFAULT 400;

COMMENT ON COLUMN ai_agent_config.message_split_chars IS 'Maximum characters per message bubble. 0 = no split';
