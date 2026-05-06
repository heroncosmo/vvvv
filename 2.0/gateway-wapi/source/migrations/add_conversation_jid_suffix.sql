-- Migration: Add jid_suffix column to conversations table
-- Date: 2025-11-19
-- Description: Stores WhatsApp JID suffix (domain) so we can send messages correctly to @s.whatsapp.net or @lid

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS jid_suffix VARCHAR(32) DEFAULT 's.whatsapp.net';

COMMENT ON COLUMN conversations.jid_suffix IS 'Suffix/domain used to build WhatsApp JID (e.g., s.whatsapp.net, lid).';

