-- Payment reminders + WhatsApp status scheduling/rotation

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS use_custom_message boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_message_sent_at timestamp;

CREATE TABLE IF NOT EXISTS payment_reminders (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id varchar(255) REFERENCES resellers(id) ON DELETE cascade,
  reseller_client_id varchar(255) REFERENCES reseller_clients(id) ON DELETE cascade,
  user_id varchar(255) REFERENCES users(id) ON DELETE cascade,
  scheduled_for timestamp NOT NULL,
  due_date timestamp,
  amount numeric(10,2),
  status varchar(30) DEFAULT 'pending' NOT NULL,
  reminder_type varchar(30) DEFAULT 'before_due',
  days_offset integer,
  message_template text,
  message_final text,
  ai_prompt text,
  ai_used boolean DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  sent_at timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_reseller ON payment_reminders(reseller_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_client ON payment_reminders(reseller_client_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_user ON payment_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_scheduled_for ON payment_reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_status ON payment_reminders(status);

CREATE TABLE IF NOT EXISTS scheduled_status (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE cascade,
  status_text text NOT NULL,
  scheduled_for timestamp NOT NULL,
  recurrence_type varchar(20) DEFAULT 'none' NOT NULL,
  recurrence_interval integer DEFAULT 1 NOT NULL,
  status varchar(20) DEFAULT 'pending' NOT NULL,
  last_sent_at timestamp,
  error_message text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_status_user ON scheduled_status(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status_scheduled_for ON scheduled_status(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_status_status ON scheduled_status(status);

CREATE TABLE IF NOT EXISTS status_rotation (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL REFERENCES users(id) ON DELETE cascade,
  name varchar(120) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  mode varchar(20) DEFAULT 'sequential' NOT NULL,
  interval_minutes integer DEFAULT 240 NOT NULL,
  last_sent_at timestamp,
  next_run_at timestamp,
  last_item_id varchar(255),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_rotation_user ON status_rotation(user_id);
CREATE INDEX IF NOT EXISTS idx_status_rotation_active ON status_rotation(is_active);
CREATE INDEX IF NOT EXISTS idx_status_rotation_next_run ON status_rotation(next_run_at);

CREATE TABLE IF NOT EXISTS status_rotation_items (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id varchar(255) NOT NULL REFERENCES status_rotation(id) ON DELETE cascade,
  status_text text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  display_order integer DEFAULT 0,
  weight integer DEFAULT 1,
  last_sent_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_rotation_items_rotation ON status_rotation_items(rotation_id);
CREATE INDEX IF NOT EXISTS idx_status_rotation_items_active ON status_rotation_items(is_active);
