-- Add media support columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS media_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS media_duration INTEGER,
ADD COLUMN IF NOT EXISTS media_caption TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON messages(media_type);
