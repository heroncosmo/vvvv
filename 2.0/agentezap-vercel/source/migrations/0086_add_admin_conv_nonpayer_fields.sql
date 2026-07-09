-- Migration: Add missing columns to admin_conversations for follow-up non-payer system
-- These columns were in schema but not migrated to production

-- Add payment_status column
ALTER TABLE admin_conversations
  ADD COLUMN IF NOT EXISTS payment_status varchar(50) DEFAULT 'pending';

-- Add followup_for_non_payers toggle
ALTER TABLE admin_conversations
  ADD COLUMN IF NOT EXISTS followup_for_non_payers boolean DEFAULT true;

-- Add followup_config jsonb
ALTER TABLE admin_conversations
  ADD COLUMN IF NOT EXISTS followup_config jsonb DEFAULT '{"enabled":true,"maxAttempts":8,"intervalsMinutes":[10,30,180,1440,4320,10080,259200,432000],"finalMinDays":15,"finalMaxDays":30,"businessHoursStart":"09:00","businessHoursEnd":"18:00","respectBusinessHours":true,"tone":"friendly","formalityLevel":3,"useEmojis":true}';

-- Add followup_disabled_reason
ALTER TABLE admin_conversations
  ADD COLUMN IF NOT EXISTS followup_disabled_reason text;
