-- Add share_token column to conversations for unique URLs
-- Token allows sharing conversation history with a unique URL

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_conversations_share_token 
ON conversations(share_token) 
WHERE share_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN conversations.share_token IS 'Unique token for sharing conversation via URL';
