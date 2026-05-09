ALTER TABLE scheduling_config
  ADD COLUMN IF NOT EXISTS reminder_times jsonb DEFAULT '[24]'::jsonb;

ALTER TABLE scheduling_config
  ADD COLUMN IF NOT EXISTS booking_notification_enabled boolean DEFAULT false;

ALTER TABLE scheduling_config
  ADD COLUMN IF NOT EXISTS booking_notification_phone varchar(50);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_times_sent jsonb DEFAULT '[]'::jsonb;

ALTER TABLE scheduling_services
  ADD COLUMN IF NOT EXISTS requires_customer_address boolean DEFAULT false;

UPDATE scheduling_config
SET reminder_times = COALESCE(reminder_times, '[24]'::jsonb)
WHERE reminder_times IS NULL;

UPDATE appointments
SET reminder_times_sent = COALESCE(reminder_times_sent, '[]'::jsonb)
WHERE reminder_times_sent IS NULL;

UPDATE scheduling_services
SET requires_customer_address = COALESCE(requires_customer_address, false)
WHERE requires_customer_address IS NULL;
