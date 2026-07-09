-- Migration: Add auto-reactivation timer feature for paused AI conversations
-- When owner replies manually, AI is paused. This feature allows automatic reactivation
-- after a configurable time if the owner doesn't continue the conversation.

-- 1. Add auto-reactivation timer to agent config (user's global preference)
ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS auto_reactivate_minutes integer DEFAULT NULL;

-- 2. Add fields to agent_disabled_conversations for tracking auto-reactivation
ALTER TABLE agent_disabled_conversations 
ADD COLUMN IF NOT EXISTS owner_last_reply_at timestamp DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS auto_reactivate_after_minutes integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS client_has_pending_message boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS client_last_message_at timestamp DEFAULT NULL;

-- 3. Create index for efficient auto-reactivation queries
CREATE INDEX IF NOT EXISTS idx_disabled_conversations_auto_reactivate 
ON agent_disabled_conversations (owner_last_reply_at, auto_reactivate_after_minutes) 
WHERE auto_reactivate_after_minutes IS NOT NULL;

-- 4. Add comment explaining the feature
COMMENT ON COLUMN ai_agent_config.auto_reactivate_minutes IS 
'Time in minutes after which AI auto-reactivates if owner does not continue conversation. NULL = never auto-reactivate (manual only)';

COMMENT ON COLUMN agent_disabled_conversations.owner_last_reply_at IS 
'Timestamp of when the owner last replied. Timer counts from this moment.';

COMMENT ON COLUMN agent_disabled_conversations.auto_reactivate_after_minutes IS 
'Inherited from user config at pause time. NULL = never auto-reactivate.';

COMMENT ON COLUMN agent_disabled_conversations.client_has_pending_message IS 
'True if client sent a message after owner last reply. AI will respond upon reactivation.';

COMMENT ON COLUMN agent_disabled_conversations.client_last_message_at IS 
'Timestamp of clients last message while AI was paused. Used to check if there is pending message to respond to.';
