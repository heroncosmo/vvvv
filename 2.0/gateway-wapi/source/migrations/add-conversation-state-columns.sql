-- Migration: Add persistent conversation state columns to admin_conversations
-- Purpose: Memory persistence per conversation so the agent doesn't lose context
-- Date: 2026-02-27

ALTER TABLE admin_conversations
  ADD COLUMN IF NOT EXISTS context_state jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS memory_summary text,
  ADD COLUMN IF NOT EXISTS linked_user_id varchar,
  ADD COLUMN IF NOT EXISTS last_test_token text,
  ADD COLUMN IF NOT EXISTS last_successful_action text,
  ADD COLUMN IF NOT EXISTS pending_slot text;

-- Index for fast lookup by linked_user_id
CREATE INDEX IF NOT EXISTS idx_admin_conversations_linked_user 
  ON admin_conversations(linked_user_id) 
  WHERE linked_user_id IS NOT NULL;

-- Index for fast lookup by last_test_token
CREATE INDEX IF NOT EXISTS idx_admin_conversations_test_token
  ON admin_conversations(last_test_token)
  WHERE last_test_token IS NOT NULL;
