ALTER TABLE agendamento2_config
ADD COLUMN IF NOT EXISTS scheduling_tracker_enabled boolean NOT NULL DEFAULT false;

UPDATE agendamento2_config
SET scheduling_tracker_enabled = true
WHERE is_active = true
  AND scheduling_tracker_enabled = false;
