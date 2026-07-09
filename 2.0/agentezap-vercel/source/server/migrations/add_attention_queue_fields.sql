ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS attention_priority VARCHAR(16),
  ADD COLUMN IF NOT EXISTS attention_reason TEXT,
  ADD COLUMN IF NOT EXISTS attention_confidence NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS needs_human_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attention_qualified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_conversations_attention_state
  ON conversations (connection_id, needs_human_attention, last_message_time DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_attention_priority
  ON conversations (
    connection_id,
    needs_human_attention,
    (
      CASE attention_priority
        WHEN 'critica' THEN 4
        WHEN 'alta' THEN 3
        WHEN 'media' THEN 2
        WHEN 'baixa' THEN 1
        ELSE 0
      END
    ) DESC,
    attention_qualified_at DESC,
    last_message_time DESC
  );
