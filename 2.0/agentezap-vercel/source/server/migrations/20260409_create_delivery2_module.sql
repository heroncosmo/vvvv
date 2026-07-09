CREATE TABLE IF NOT EXISTS delivery2_config (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  send_to_ai boolean NOT NULL DEFAULT true,
  display_name varchar(255) DEFAULT 'Delivery 2.0',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery2_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  connection_id varchar NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_number varchar NOT NULL,
  contact_name varchar,
  customer_name varchar,
  status varchar(32) NOT NULL DEFAULT 'pending',
  delivery_type varchar(20),
  payment_method varchar(80),
  customer_address text,
  customer_complement text,
  customer_reference text,
  notes text,
  summary text,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10, 2) DEFAULT 0,
  delivery_fee numeric(10, 2) DEFAULT 0,
  total numeric(10, 2) DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0,
  finalized_at timestamp,
  last_customer_message text,
  last_agent_message text,
  last_analyzed_at timestamp,
  raw_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_version varchar(64) NOT NULL DEFAULT 'delivery2-v1',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery2_orders_user_status_created
  ON delivery2_orders (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery2_orders_conversation_created
  ON delivery2_orders (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery2_order_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL REFERENCES delivery2_orders(id) ON DELETE CASCADE,
  line_number integer NOT NULL DEFAULT 1,
  item_name varchar(180) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  size_label varchar(60),
  unit_price numeric(10, 2),
  total_price numeric(10, 2),
  notes text,
  selected_options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  half_and_half_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery2_order_items_order
  ON delivery2_order_items (order_id, line_number);
