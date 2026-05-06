-- Migration: Add daily_usage table for tracking daily limits (calibrations and simulator messages)
-- This table helps enforce daily limits for free users

CREATE TABLE IF NOT EXISTS daily_usage (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    prompt_edits_count INTEGER NOT NULL DEFAULT 0,
    simulator_messages_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_daily_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_date UNIQUE (user_id, usage_date)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_id ON daily_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, usage_date);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_daily_usage_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_daily_usage_updated_at ON daily_usage;
CREATE TRIGGER trigger_daily_usage_updated_at
    BEFORE UPDATE ON daily_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_usage_timestamp();

-- Cleanup old records (optional - keeps only last 30 days)
-- This can be run periodically as a maintenance task
-- DELETE FROM daily_usage WHERE usage_date < CURRENT_DATE - INTERVAL '30 days';
