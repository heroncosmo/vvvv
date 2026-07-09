CREATE TABLE IF NOT EXISTS agendamento2_config (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  send_to_ai boolean NOT NULL DEFAULT true,
  display_name varchar(255) DEFAULT 'Agendamento 2.0',
  agenda_prompt text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agendamento2_insights (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  connection_id varchar NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_number varchar NOT NULL,
  contact_name varchar,
  status varchar(32) NOT NULL DEFAULT 'not_scheduled',
  agreed_schedule text,
  scheduled_date varchar(10),
  scheduled_time varchar(5),
  summary text,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 0,
  last_customer_message text,
  last_agent_message text,
  last_scheduled_at timestamp,
  last_analyzed_at timestamp,
  raw_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_version varchar(64) NOT NULL DEFAULT 'agendamento2-v1',
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendamento2_insights_user_status_date
  ON agendamento2_insights (user_id, status, scheduled_date, scheduled_time);
