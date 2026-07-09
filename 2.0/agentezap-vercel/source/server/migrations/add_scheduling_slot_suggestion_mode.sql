ALTER TABLE scheduling_config
  ADD COLUMN IF NOT EXISTS slot_suggestion_mode varchar(40) DEFAULT 'first_available';

UPDATE scheduling_config
SET slot_suggestion_mode = COALESCE(NULLIF(slot_suggestion_mode, ''), 'first_available')
WHERE slot_suggestion_mode IS NULL OR slot_suggestion_mode = '';
