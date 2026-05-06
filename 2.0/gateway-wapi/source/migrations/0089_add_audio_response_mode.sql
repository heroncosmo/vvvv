ALTER TABLE audio_config
ADD COLUMN IF NOT EXISTS response_mode text NOT NULL DEFAULT 'audio_text';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audio_config_response_mode_check'
  ) THEN
    ALTER TABLE audio_config
    ADD CONSTRAINT audio_config_response_mode_check
    CHECK (response_mode IN ('audio_on_customer_audio', 'audio_only', 'audio_text'));
  END IF;
END $$;
