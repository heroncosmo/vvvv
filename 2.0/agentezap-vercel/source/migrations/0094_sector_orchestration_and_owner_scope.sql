-- Sector ownership + AI/human orchestration

ALTER TABLE sectors
ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS ai_handoff_mode VARCHAR(32) DEFAULT 'copilot';

UPDATE sectors s
SET owner_id = tm.owner_id
FROM sector_members sm
JOIN team_members tm ON tm.id = sm.member_id
WHERE sm.sector_id = s.id
  AND s.owner_id IS NULL;

UPDATE sectors s
SET owner_id = wc.user_id
FROM conversations c
JOIN whatsapp_connections wc ON wc.id = c.connection_id
WHERE c.sector_id = s.id
  AND s.owner_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sectors_owner_id_users_fk'
  ) THEN
    ALTER TABLE sectors
    ADD CONSTRAINT sectors_owner_id_users_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sectors_owner ON sectors(owner_id);

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS orchestration_mode VARCHAR(32) DEFAULT 'ai',
ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
ADD COLUMN IF NOT EXISTS handed_off_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS handed_off_by VARCHAR(255);

UPDATE conversations
SET orchestration_mode = CASE
  WHEN orchestration_mode IS NOT NULL THEN orchestration_mode
  WHEN assigned_to_member_id IS NOT NULL THEN 'human'
  ELSE 'ai'
END
WHERE orchestration_mode IS NULL;

ALTER TABLE routing_logs
ADD COLUMN IF NOT EXISTS routing_method VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_conversations_orchestration_mode
ON conversations(orchestration_mode);
