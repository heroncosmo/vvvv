CREATE TABLE IF NOT EXISTS agent_test_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('public_test', 'authenticated_simulator')),
  session_id text NOT NULL,
  token text,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  speaker text NOT NULL CHECK (speaker IN ('customer', 'agent', 'company')),
  content text NOT NULL DEFAULT '',
  media_url text,
  media_type text,
  media_name text,
  message_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_test_session_messages_session
  ON agent_test_session_messages (user_id, channel, session_id, message_order, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_test_session_messages_expires_at
  ON agent_test_session_messages (expires_at);

ALTER TABLE agent_test_session_messages ENABLE ROW LEVEL SECURITY;
