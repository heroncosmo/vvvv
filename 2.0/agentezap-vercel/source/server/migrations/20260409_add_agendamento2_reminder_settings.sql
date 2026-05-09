ALTER TABLE agendamento2_config
ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE agendamento2_config
ADD COLUMN IF NOT EXISTS reminder_hours_before integer NOT NULL DEFAULT 1;

ALTER TABLE agendamento2_config
ADD COLUMN IF NOT EXISTS reminder_flow jsonb NOT NULL DEFAULT '[]'::jsonb;
