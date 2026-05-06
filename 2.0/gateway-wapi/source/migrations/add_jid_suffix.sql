-- Migration: Add jid_suffix column to conversations table
-- Date: 2025-11-19
-- Description: Adds jid_suffix field to store the WhatsApp JID domain (s.whatsapp.net or lid)

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS jid_suffix VARCHAR(32) DEFAULT 's.whatsapp.net';

-- Add comment to column
COMMENT ON COLUMN conversations.jid_suffix IS 'WhatsApp JID suffix/domain used for sending messages (e.g., s.whatsapp.net for normal WhatsApp, lid for WhatsApp Business)';
