-- Migration: Add remote_jid column to conversations table
-- Date: 2025-11-19
-- Description: Stores the complete original WhatsApp JID (e.g., 5517912345678@s.whatsapp.net or 254635809968349:20@lid)
-- This is CRITICAL - always use this exact JID when sending messages back to the contact

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS remote_jid TEXT;

COMMENT ON COLUMN conversations.remote_jid IS 'Complete original WhatsApp JID from remoteJid field. ALWAYS use this when sending messages!';

-- For existing conversations, try to reconstruct the remoteJid from contactNumber + jidSuffix
UPDATE conversations
SET remote_jid = CASE
  WHEN jid_suffix IS NOT NULL THEN contact_number || '@' || jid_suffix
  ELSE contact_number || '@s.whatsapp.net'
END
WHERE remote_jid IS NULL;
