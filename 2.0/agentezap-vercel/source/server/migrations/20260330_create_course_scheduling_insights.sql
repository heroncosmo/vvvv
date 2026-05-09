CREATE TABLE IF NOT EXISTS course_scheduling_insights (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  connection_id varchar NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_number varchar NOT NULL,
  contact_name varchar,
  status varchar(32) NOT NULL DEFAULT 'not_scheduled',
  agreed_schedule text,
  summary text,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 0,
  last_customer_message text,
  last_agent_message text,
  last_scheduled_at timestamp,
  last_analyzed_at timestamp,
  raw_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_version varchar(64) NOT NULL DEFAULT 'course-scheduling-v1',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_scheduling_insights_user
  ON course_scheduling_insights(user_id);

CREATE INDEX IF NOT EXISTS idx_course_scheduling_insights_status
  ON course_scheduling_insights(status, last_scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_scheduling_insights_connection
  ON course_scheduling_insights(connection_id);
