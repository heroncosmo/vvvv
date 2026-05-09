ALTER TABLE sectors
ADD COLUMN IF NOT EXISTS controlled_handoff_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS member_reply_scope VARCHAR(32) NOT NULL DEFAULT 'assigned_only';

UPDATE sectors
SET controlled_handoff_enabled = COALESCE(controlled_handoff_enabled, TRUE)
WHERE controlled_handoff_enabled IS NULL;

UPDATE sectors
SET member_reply_scope = CASE
  WHEN member_reply_scope IN ('assigned_only', 'shared') THEN member_reply_scope
  ELSE 'assigned_only'
END
WHERE member_reply_scope IS NULL
   OR member_reply_scope NOT IN ('assigned_only', 'shared');
