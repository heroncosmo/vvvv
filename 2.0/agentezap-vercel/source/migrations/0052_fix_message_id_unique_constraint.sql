-- Migration: Fix messages_message_id_unique constraint
-- The message_id should NOT be globally unique - it can repeat across different conversations
-- The correct constraint should be unique per (conversation_id, message_id) pair

-- Remove the incorrect global unique constraint on message_id
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_message_id_unique";

-- Remove the index if it exists as well (some databases create both)
DROP INDEX IF EXISTS "messages_message_id_unique";
DROP INDEX IF EXISTS "idx_messages_message_id";
DROP INDEX IF EXISTS "messages_message_id_key";

-- Create the correct UNIQUE index: message_id should be unique within a conversation, not globally
CREATE UNIQUE INDEX IF NOT EXISTS "idx_messages_conversation_message_unique" 
ON "messages" ("conversation_id", "message_id");

-- Also create a regular index on message_id for faster lookups
CREATE INDEX IF NOT EXISTS "idx_messages_message_id" 
ON "messages" ("message_id");
