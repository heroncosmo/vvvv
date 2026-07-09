import { pool } from "./db";
import { getRequestOwnerId, isMemberRequest } from "./conversationAccess";

export type KanbanBoardRecord = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  kind: string;
  is_default: boolean;
  is_active: boolean;
  created_by_member_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  member_ids?: string[];
};

export type ResolvedKanbanBoard = {
  board: KanbanBoardRecord;
  memberAccess: {
    canManageBoard: boolean;
    canManageStages: boolean;
    canMoveCards: boolean;
    canViewAllBoardCards: boolean;
  } | null;
};

export type ResolvedKanbanMoveDestination = {
  resolvedBoard: ResolvedKanbanBoard | null;
  invalidStage: boolean;
};

const DEFAULT_STAGE_ROWS = [
  { name: "Novos", description: "Leads novos", color: "bg-blue-500", position: 0 },
  { name: "Prospectando", description: "Em prospecção", color: "bg-purple-500", position: 1 },
  { name: "Negociando", description: "Em negociação", color: "bg-amber-500", position: 2 },
  { name: "Fechado", description: "Venda concluída", color: "bg-emerald-500", position: 3 },
  { name: "Perdido", description: "Não converteu", color: "bg-slate-400", position: 4 },
];

function mapBoard(row: any): KanbanBoardRecord {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name),
    description: row.description ? String(row.description) : "",
    kind: String(row.kind || "custom"),
    is_default: row.is_default === true,
    is_active: row.is_active !== false,
    created_by_member_id: row.created_by_member_id ? String(row.created_by_member_id) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    member_ids: Array.isArray(row.member_ids)
      ? row.member_ids.map((value: any) => String(value))
      : [],
  };
}

export async function ensureKanbanBoardsForOwner(ownerId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO kanban_boards (owner_id, name, description, kind, is_default, is_active)
      SELECT $1::text, 'Kanban Principal', 'Quadro principal do CRM', 'default', true, true
      WHERE NOT EXISTS (
        SELECT 1
        FROM kanban_boards
        WHERE owner_id = $1::text
          AND is_default = true
      )
    `,
    [ownerId],
  );

  const defaultBoardResult = await pool.query(
    `
      SELECT id
      FROM kanban_boards
      WHERE owner_id = $1::text
        AND is_default = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    `,
    [ownerId],
  );
  const defaultBoardId = defaultBoardResult.rows[0]?.id ? String(defaultBoardResult.rows[0].id) : null;

  if (defaultBoardId) {
    await pool.query(
      `
        UPDATE kanban_stages
        SET board_id = $2::text
        WHERE user_id = $1::text
          AND board_id IS NULL
      `,
      [ownerId, defaultBoardId],
    );

    for (const stage of DEFAULT_STAGE_ROWS) {
      await pool.query(
        `
          INSERT INTO kanban_stages (user_id, board_id, name, description, color, position, is_default)
          SELECT $1::text, $2::text, $3, $4, $5, $6, true
          WHERE NOT EXISTS (
            SELECT 1
            FROM kanban_stages
            WHERE board_id = $2::text
              AND position = $6
          )
        `,
        [ownerId, defaultBoardId, stage.name, stage.description, stage.color, stage.position],
      );
    }

    await pool.query(
      `
        UPDATE conversations c
        SET kanban_board_id = ks.board_id
        FROM whatsapp_connections wc, kanban_stages ks
        WHERE c.connection_id = wc.id
          AND wc.user_id = $1::text
          AND c.kanban_stage_id IS NOT NULL
          AND ks.id = c.kanban_stage_id
          AND ks.board_id IS NOT NULL
          AND (
            c.kanban_board_id IS NULL
            OR c.kanban_board_id <> ks.board_id
          )
      `,
      [ownerId],
    );
  }

  await pool.query(
    `
      INSERT INTO kanban_boards (owner_id, name, description, kind, is_default, is_active, created_by_member_id)
      SELECT tm.owner_id, CONCAT('Kanban de ', tm.name), 'Quadro pessoal do membro', 'personal', false, tm.is_active, tm.id
      FROM team_members tm
      WHERE tm.owner_id = $1::text
        AND NOT EXISTS (
          SELECT 1
          FROM kanban_boards kb
          WHERE kb.owner_id = tm.owner_id
            AND kb.kind = 'personal'
            AND kb.created_by_member_id = tm.id
        )
    `,
    [ownerId],
  );

  await pool.query(
    `
      INSERT INTO kanban_board_members (board_id, member_id, can_manage_board, can_manage_stages, can_move_cards, can_view_all_board_cards)
      SELECT kb.id, tm.id, false, false, true, true
      FROM kanban_boards kb
      JOIN team_members tm ON tm.id = kb.created_by_member_id
      WHERE kb.owner_id = $1::text
        AND kb.kind = 'personal'
        AND NOT EXISTS (
          SELECT 1
          FROM kanban_board_members kbm
          WHERE kbm.board_id = kb.id
            AND kbm.member_id = tm.id
        )
    `,
    [ownerId],
  );

  await pool.query(
    `
      UPDATE kanban_boards kb
      SET name = CONCAT('Kanban de ', tm.name),
          is_active = tm.is_active,
          updated_at = NOW()
      FROM team_members tm
      WHERE kb.owner_id = $1::text
        AND kb.kind = 'personal'
        AND kb.created_by_member_id = tm.id
        AND (kb.name IS DISTINCT FROM CONCAT('Kanban de ', tm.name) OR kb.is_active IS DISTINCT FROM tm.is_active)
    `,
    [ownerId],
  );

  await pool.query(
    `
      UPDATE kanban_board_members kbm
      SET can_move_cards = true,
          can_view_all_board_cards = true
      FROM kanban_boards kb
      WHERE kb.id = kbm.board_id
        AND kb.owner_id = $1::text
        AND kb.kind = 'personal'
        AND kb.created_by_member_id = kbm.member_id
    `,
    [ownerId],
  );

  await pool.query(
    `
      INSERT INTO kanban_stages (user_id, board_id, name, description, color, position, is_default)
      SELECT kb.owner_id, kb.id, stage.name, stage.description, stage.color, stage.position, true
      FROM kanban_boards kb
      JOIN (
        VALUES
          ('Novos', 'Leads novos', 'bg-blue-500', 0),
          ('Prospectando', 'Em prospecção', 'bg-purple-500', 1),
          ('Negociando', 'Em negociação', 'bg-amber-500', 2),
          ('Fechado', 'Venda concluída', 'bg-emerald-500', 3),
          ('Perdido', 'Não converteu', 'bg-slate-400', 4)
      ) AS stage(name, description, color, position) ON TRUE
      WHERE kb.owner_id = $1::text
        AND NOT EXISTS (
          SELECT 1
          FROM kanban_stages ks
          WHERE ks.board_id = kb.id
        )
    `,
    [ownerId],
  );
}

export async function listAccessibleKanbanBoards(req: any): Promise<KanbanBoardRecord[]> {
  const ownerId = getRequestOwnerId(req);
  if (!ownerId) {
    return [];
  }

  await ensureKanbanBoardsForOwner(String(ownerId));

  if (!isMemberRequest(req)) {
    const result = await pool.query(
      `
        SELECT
          kb.*,
          COALESCE(
            ARRAY_AGG(DISTINCT kbm.member_id) FILTER (WHERE kbm.member_id IS NOT NULL),
            ARRAY[]::varchar[]
          ) AS member_ids
        FROM kanban_boards kb
        LEFT JOIN kanban_board_members kbm ON kbm.board_id = kb.id
        WHERE kb.owner_id = $1::text
          AND kb.is_active = true
        GROUP BY kb.id
        ORDER BY kb.is_default DESC, kb.kind ASC, kb.name ASC
      `,
      [ownerId],
    );
    return result.rows.map(mapBoard);
  }

  const memberId = String(req.user.memberData.id);
  const result = await pool.query(
    `
      SELECT
        kb.*,
        COALESCE(
          ARRAY_AGG(DISTINCT kbm_all.member_id) FILTER (WHERE kbm_all.member_id IS NOT NULL),
          ARRAY[]::varchar[]
        ) AS member_ids
      FROM kanban_boards kb
      JOIN kanban_board_members kbm_access
        ON kbm_access.board_id = kb.id
       AND kbm_access.member_id = $2
      LEFT JOIN kanban_board_members kbm_all
        ON kbm_all.board_id = kb.id
      WHERE kb.owner_id = $1::text
        AND kb.is_active = true
      GROUP BY kb.id
      ORDER BY kb.is_default DESC, kb.kind ASC, kb.name ASC
    `,
    [ownerId, memberId],
  );
  return result.rows.map(mapBoard);
}

export async function resolveKanbanBoardForRequest(
  req: any,
  requestedBoardId?: string | null,
): Promise<ResolvedKanbanBoard | null> {
  const boards = await listAccessibleKanbanBoards(req);
  if (boards.length === 0) {
    return null;
  }

  const normalizedRequested = String(requestedBoardId || "").trim();
  const board = normalizedRequested
    ? boards.find((item) => item.id === normalizedRequested)
    : boards.find((item) => item.is_default) || boards[0];

  if (!board) {
    return null;
  }

  if (!isMemberRequest(req)) {
    return {
      board,
      memberAccess: {
        canManageBoard: true,
        canManageStages: true,
        canMoveCards: true,
        canViewAllBoardCards: true,
      },
    };
  }

  const accessResult = await pool.query(
    `
      SELECT
        can_manage_board,
        can_manage_stages,
        can_move_cards,
        can_view_all_board_cards
      FROM kanban_board_members
      WHERE board_id = $1
        AND member_id = $2
      LIMIT 1
    `,
    [board.id, String(req.user.memberData.id)],
  );

  const row = accessResult.rows[0];
  if (!row) {
    return null;
  }

  return {
    board,
    memberAccess: {
      canManageBoard: row.can_manage_board === true,
      canManageStages: row.can_manage_stages === true,
      canMoveCards: row.can_move_cards !== false,
      canViewAllBoardCards: row.can_view_all_board_cards !== false,
    },
  };
}

export async function resolveKanbanMoveDestinationForRequest(
  req: any,
  requestedBoardId?: string | null,
  stageId?: string | null,
): Promise<ResolvedKanbanMoveDestination> {
  const normalizedStageId = String(stageId || "").trim();
  if (!normalizedStageId) {
    return {
      resolvedBoard: await resolveKanbanBoardForRequest(req, requestedBoardId),
      invalidStage: false,
    };
  }

  const ownerId = getRequestOwnerId(req);
  if (!ownerId) {
    return {
      resolvedBoard: null,
      invalidStage: true,
    };
  }

  const accessibleBoards = await listAccessibleKanbanBoards(req);
  const accessibleBoardIds = Array.from(
    new Set(accessibleBoards.map((board) => String(board.id)).filter(Boolean)),
  );
  if (accessibleBoardIds.length === 0) {
    return {
      resolvedBoard: null,
      invalidStage: true,
    };
  }

  const stageResult = await pool.query(
    `
      SELECT ks.board_id
      FROM kanban_stages ks
      INNER JOIN kanban_boards kb
        ON kb.id = ks.board_id
      WHERE ks.id = $1
        AND ks.board_id = ANY($2::text[])
        AND ks.user_id = $3::text
        AND kb.owner_id = $3::text
        AND kb.is_active = true
      LIMIT 1
    `,
    [normalizedStageId, accessibleBoardIds, ownerId],
  );

  const stageBoardId = stageResult.rows[0]?.board_id ? String(stageResult.rows[0].board_id) : "";
  if (!stageBoardId) {
    return {
      resolvedBoard: null,
      invalidStage: true,
    };
  }

  const resolvedBoard = await resolveKanbanBoardForRequest(req, stageBoardId);
  return {
    resolvedBoard,
    invalidStage: !resolvedBoard,
  };
}

export async function createKanbanBoardForOwner(params: {
  ownerId: string;
  name: string;
  description?: string;
  kind?: string;
  memberIds?: string[];
}): Promise<KanbanBoardRecord> {
  await ensureKanbanBoardsForOwner(params.ownerId);

  const boardResult = await pool.query(
    `
      INSERT INTO kanban_boards (owner_id, name, description, kind, is_default, is_active)
      VALUES ($1, $2, $3, $4, false, true)
      RETURNING *
    `,
    [params.ownerId, params.name, params.description || "", params.kind || "custom"],
  );
  const board = mapBoard(boardResult.rows[0]);

  for (const stage of DEFAULT_STAGE_ROWS) {
    await pool.query(
      `
        INSERT INTO kanban_stages (user_id, board_id, name, description, color, position, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, true)
      `,
      [params.ownerId, board.id, stage.name, stage.description, stage.color, stage.position],
    );
  }

  if (params.memberIds?.length) {
    const uniqueMemberIds = Array.from(new Set(params.memberIds.map((value) => String(value)).filter(Boolean)));
    for (const memberId of uniqueMemberIds) {
      await pool.query(
        `
          INSERT INTO kanban_board_members (
            board_id,
            member_id,
            can_manage_board,
            can_manage_stages,
            can_move_cards,
            can_view_all_board_cards
          )
          SELECT $1, tm.id, false, false, true, true
          FROM team_members tm
          WHERE tm.owner_id = $2
            AND tm.id = $3
          ON CONFLICT (board_id, member_id) DO NOTHING
        `,
        [board.id, params.ownerId, memberId],
      );
    }
  }

  return board;
}

export async function updateKanbanBoardMembersForOwner(params: {
  ownerId: string;
  boardId: string;
  memberIds: string[];
}): Promise<void> {
  const uniqueMemberIds = Array.from(new Set(params.memberIds.map((value) => String(value)).filter(Boolean)));

  await pool.query(
    `
      DELETE FROM kanban_board_members
      WHERE board_id = $1
        AND member_id IN (
          SELECT id
          FROM team_members
          WHERE owner_id = $2
        )
        AND member_id NOT IN (
          SELECT created_by_member_id
          FROM kanban_boards
          WHERE id = $1
            AND created_by_member_id IS NOT NULL
        )
    `,
    [params.boardId, params.ownerId],
  );

  for (const memberId of uniqueMemberIds) {
    await pool.query(
      `
        INSERT INTO kanban_board_members (
          board_id,
          member_id,
          can_manage_board,
          can_manage_stages,
          can_move_cards,
          can_view_all_board_cards
        )
        SELECT $1, tm.id, false, false, true, true
        FROM team_members tm
        WHERE tm.owner_id = $2
          AND tm.id = $3
        ON CONFLICT (board_id, member_id) DO NOTHING
      `,
      [params.boardId, params.ownerId, memberId],
    );
  }
}

export async function getBoardMemberIds(boardId: string): Promise<string[]> {
  const result = await pool.query(
    `
      SELECT member_id
      FROM kanban_board_members
      WHERE board_id = $1
      ORDER BY created_at ASC NULLS LAST, member_id ASC
    `,
    [boardId],
  );
  return result.rows.map((row) => String(row.member_id));
}
