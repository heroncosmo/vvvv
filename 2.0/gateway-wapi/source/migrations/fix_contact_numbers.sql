-- Migration: Delete conversations with incorrect contact numbers (containing :XX metadata)
-- Date: 2025-11-19
-- Description: Removes conversations saved with :XX metadata so new messages create fresh conversations with correct numbers

-- Delete conversations that have :XX metadata in contact_number
-- These are incorrect and will be recreated automatically when the contact sends a new message
DELETE FROM conversations
WHERE contact_number LIKE '%:%';

-- Log the changes
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % conversation(s) with incorrect contact numbers. They will be recreated automatically with correct numbers when contacts send new messages.', deleted_count;
END $$;
