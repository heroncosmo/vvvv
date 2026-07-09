CREATE TABLE IF NOT EXISTS kanban_boards (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  kind VARCHAR(32) NOT NULL DEFAULT 'custom',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_member_id VARCHAR REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_boards_owner ON kanban_boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_kanban_boards_owner_active ON kanban_boards(owner_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_boards_owner_default
  ON kanban_boards(owner_id, is_default)
  WHERE is_default = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_boards_personal_member
  ON kanban_boards(owner_id, created_by_member_id)
  WHERE kind = 'personal' AND created_by_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kanban_board_members (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id VARCHAR NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  member_id VARCHAR NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  can_manage_board BOOLEAN NOT NULL DEFAULT false,
  can_manage_stages BOOLEAN NOT NULL DEFAULT false,
  can_move_cards BOOLEAN NOT NULL DEFAULT true,
  can_view_all_board_cards BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_board_members_unique
  ON kanban_board_members(board_id, member_id);
CREATE INDEX IF NOT EXISTS idx_kanban_board_members_member
  ON kanban_board_members(member_id);

ALTER TABLE kanban_stages
  ADD COLUMN IF NOT EXISTS board_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_kanban_stages_board
  ON kanban_stages(board_id, position);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS kanban_board_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_conversations_kanban_board
  ON conversations(kanban_board_id, kanban_stage_id);

INSERT INTO kanban_boards (owner_id, name, description, kind, is_default, is_active)
SELECT owners.owner_id, 'Kanban Principal', 'Quadro principal do CRM', 'default', true, true
FROM (
  SELECT DISTINCT user_id AS owner_id
  FROM kanban_stages
  WHERE user_id IS NOT NULL
  UNION
  SELECT DISTINCT wc.user_id AS owner_id
  FROM conversations c
  JOIN whatsapp_connections wc ON wc.id = c.connection_id
  WHERE wc.user_id IS NOT NULL
) owners
WHERE NOT EXISTS (
  SELECT 1
  FROM kanban_boards kb
  WHERE kb.owner_id = owners.owner_id
    AND kb.is_default = true
);

UPDATE kanban_stages ks
SET board_id = kb.id
FROM kanban_boards kb
WHERE ks.board_id IS NULL
  AND ks.user_id = kb.owner_id
  AND kb.is_default = true;

INSERT INTO kanban_stages (user_id, board_id, name, description, color, position, is_default)
SELECT kb.owner_id, kb.id, defaults.name, defaults.description, defaults.color, defaults.position, true
FROM kanban_boards kb
JOIN (
  VALUES
    ('Novos', 'Leads novos', 'bg-blue-500', 0),
    ('Prospectando', 'Em prospecção', 'bg-purple-500', 1),
    ('Negociando', 'Em negociação', 'bg-amber-500', 2),
    ('Fechado', 'Venda concluída', 'bg-emerald-500', 3),
    ('Perdido', 'Não converteu', 'bg-slate-400', 4)
) AS defaults(name, description, color, position) ON TRUE
WHERE kb.is_default = true
  AND NOT EXISTS (
    SELECT 1
    FROM kanban_stages ks
    WHERE ks.board_id = kb.id
  );

UPDATE conversations c
SET kanban_board_id = ks.board_id
FROM kanban_stages ks
WHERE c.kanban_stage_id = ks.id
  AND ks.board_id IS NOT NULL
  AND c.kanban_board_id IS NULL;

UPDATE conversations c
SET kanban_board_id = kb.id
FROM whatsapp_connections wc
JOIN kanban_boards kb
  ON kb.owner_id = wc.user_id
 AND kb.is_default = true
WHERE c.connection_id = wc.id
  AND c.kanban_board_id IS NULL;

INSERT INTO kanban_boards (owner_id, name, description, kind, is_default, is_active, created_by_member_id)
SELECT tm.owner_id, CONCAT('Kanban de ', tm.name), 'Quadro pessoal do membro', 'personal', false, tm.is_active, tm.id
FROM team_members tm
WHERE NOT EXISTS (
  SELECT 1
  FROM kanban_boards kb
  WHERE kb.owner_id = tm.owner_id
    AND kb.kind = 'personal'
    AND kb.created_by_member_id = tm.id
);

INSERT INTO kanban_board_members (board_id, member_id, can_manage_board, can_manage_stages, can_move_cards, can_view_all_board_cards)
SELECT kb.id, tm.id, false, false, true, true
FROM kanban_boards kb
JOIN team_members tm
  ON tm.id = kb.created_by_member_id
WHERE kb.kind = 'personal'
  AND NOT EXISTS (
    SELECT 1
    FROM kanban_board_members kbm
    WHERE kbm.board_id = kb.id
      AND kbm.member_id = tm.id
  );

INSERT INTO kanban_stages (user_id, board_id, name, description, color, position, is_default)
SELECT kb.owner_id, kb.id, defaults.name, defaults.description, defaults.color, defaults.position, true
FROM kanban_boards kb
JOIN (
  VALUES
    ('Novos', 'Leads novos', 'bg-blue-500', 0),
    ('Prospectando', 'Em prospecção', 'bg-purple-500', 1),
    ('Negociando', 'Em negociação', 'bg-amber-500', 2),
    ('Fechado', 'Venda concluída', 'bg-emerald-500', 3),
    ('Perdido', 'Não converteu', 'bg-slate-400', 4)
) AS defaults(name, description, color, position) ON TRUE
WHERE kb.kind = 'personal'
  AND NOT EXISTS (
    SELECT 1
    FROM kanban_stages ks
    WHERE ks.board_id = kb.id
  );
