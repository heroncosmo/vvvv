CREATE TABLE IF NOT EXISTS specialist_addons (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id varchar NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  status varchar(50) NOT NULL DEFAULT 'pending_payment',
  original_amount numeric(10, 2) NOT NULL DEFAULT 1000.00,
  promotional_amount numeric(10, 2) NOT NULL DEFAULT 500.00,
  pix_code text,
  pix_qr_code text,
  payment_reference varchar(255),
  receipt_url text,
  receipt_filename varchar(255),
  receipt_mime_type varchar(120),
  starts_at timestamp,
  ends_at timestamp,
  reviewed_by varchar(255),
  reviewed_at timestamp,
  admin_notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specialist_addons_user
  ON specialist_addons(user_id);

CREATE INDEX IF NOT EXISTS idx_specialist_addons_subscription
  ON specialist_addons(subscription_id);

CREATE INDEX IF NOT EXISTS idx_specialist_addons_status
  ON specialist_addons(status);
