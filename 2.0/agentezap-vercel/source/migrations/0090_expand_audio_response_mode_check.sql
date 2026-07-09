ALTER TABLE audio_config
DROP CONSTRAINT IF EXISTS audio_config_response_mode_check;

ALTER TABLE audio_config
ADD CONSTRAINT audio_config_response_mode_check
CHECK (
  response_mode IN (
    'audio_first_message_then_customer_audio',
    'audio_on_customer_audio',
    'audio_only',
    'audio_text'
  )
);
