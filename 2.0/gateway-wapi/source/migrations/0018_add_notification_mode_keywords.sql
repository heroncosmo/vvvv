-- Migration: Add notification mode and manual keywords fields
-- Date: 2025-12-23

-- Add notification_mode column (ai, manual, both)
ALTER TABLE business_agent_configs 
ADD COLUMN IF NOT EXISTS notification_mode VARCHAR(20) DEFAULT 'ai' NOT NULL;

-- Add notification_manual_keywords column (comma-separated keywords)
ALTER TABLE business_agent_configs 
ADD COLUMN IF NOT EXISTS notification_manual_keywords TEXT;

-- Comment for documentation
COMMENT ON COLUMN business_agent_configs.notification_mode IS 'Notification detection mode: ai (IA analyzes context), manual (keyword matching), both (combines both methods)';
COMMENT ON COLUMN business_agent_configs.notification_manual_keywords IS 'Comma-separated list of keywords for manual notification detection';
