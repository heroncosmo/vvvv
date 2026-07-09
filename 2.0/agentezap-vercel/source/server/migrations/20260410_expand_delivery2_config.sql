ALTER TABLE delivery2_config
  ADD COLUMN IF NOT EXISTS menu_auto_send_on_greeting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS menu_auto_send_on_request boolean NOT NULL DEFAULT true;
