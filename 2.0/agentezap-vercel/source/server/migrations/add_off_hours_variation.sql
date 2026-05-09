ALTER TABLE ai_agent_config
ADD COLUMN IF NOT EXISTS off_hours_variation boolean DEFAULT false NOT NULL;
