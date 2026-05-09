ALTER TABLE followup_configs
ADD COLUMN IF NOT EXISTS followup_audio_mode TEXT NOT NULL DEFAULT 'text_only';
