-- =====================================================================
-- Migration: Add contact_avatar column to conversations table
-- Purpose: Store WhatsApp contact profile picture
-- Date: 2025-11-22
-- =====================================================================

-- Add contact_avatar column
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS contact_avatar TEXT;

-- Add comment
COMMENT ON COLUMN conversations.contact_avatar IS 'URL da foto de perfil do contato (Base64 ou URL do Baileys profilePictureUrl)';

-- Verify column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' 
    AND column_name = 'contact_avatar'
  ) THEN
    RAISE NOTICE 'SUCCESS: contact_avatar column added to conversations';
  ELSE
    RAISE EXCEPTION 'FAILED: contact_avatar column not found';
  END IF;
END $$;
