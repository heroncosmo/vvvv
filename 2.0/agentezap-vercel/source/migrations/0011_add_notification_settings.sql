ALTER TABLE business_agent_configs ADD COLUMN IF NOT EXISTS notification_phone_number VARCHAR;
ALTER TABLE business_agent_configs ADD COLUMN IF NOT EXISTS notification_trigger TEXT;
ALTER TABLE business_agent_configs ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT false NOT NULL;
