-- Migration: Add missing columns to followup_logs and system_config
-- These columns were added in schema but not in a migration

-- Add missing columns to followup_logs
ALTER TABLE followup_logs 
  ADD COLUMN IF NOT EXISTS payment_status varchar(50),
  ADD COLUMN IF NOT EXISTS followup_type varchar(50),
  ADD COLUMN IF NOT EXISTS stage integer,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamp;

-- Create index on contact_number if not exists
CREATE INDEX IF NOT EXISTS "idx_followup_logs_contact" ON "followup_logs" ("contact_number");

-- Ensure system_config has updatedAt column (schema calls it updated_at)
ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
