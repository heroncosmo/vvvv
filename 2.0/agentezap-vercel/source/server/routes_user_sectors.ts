import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./supabaseAuth";
import {
  getConversationRoutingSnapshot,
  listOwnerSectors,
  routeConversationWithLLM,
  transferConversationAssignment,
} from "./sectorRoutingService";
import {
  authorizeMemberReplyToConversation,
  assertConversationAccess,
  getAssignableMembersForOwner,
  sanitizeConversationForRequest,
} from "./conversationAccess";

function getUserId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || null;
}

function asyncHandler(fn: (req: any, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as any, res)).catch(next);
  };
}

async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function qOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

function parseKeywords(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeControlledHandoffEnabled(input: unknown): boolean {
  return input === false ? false : true;
}

function normalizeMemberReplyScope(input: unknown): "assigned_only" | "shared" {
  return input === "shared" ? "shared" : "assigned_only";
}

function requireOwner(req: any, res: Response, next: NextFunction) {
  const ownerId = getUserId(req);
  if (!ownerId) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  if (req.user?.isMember === true) {
    return res.status(403).json({ error: "Acesso restrito ao dono da conta." });
  }

  next();
}

function normalizeRoutingTargets(req: any) {
  return {
    targetSectorId:
      typeof req.body?.targetSectorId === "string" && req.body.targetSectorId.trim().length > 0
        ? req.body.targetSectorId.trim()
        : null,
    targetMemberId:
      typeof req.body?.targetMemberId === "string" && req.body.targetMemberId.trim().length > 0
        ? req.body.targetMemberId.trim()
        : null,
    reason:
      typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
        ? req.body.reason.trim()
        : null,
    returnToAI: req.body?.returnToAI === true,
  };
}

async function buildConversationRoutingOptions(req: any, res: Response, conversationId: string) {
  const access = await assertConversationAccess(req, res, conversationId, {
    requireViewPermission: true,
  });
  if (!access) {
    return null;
  }

  const { ownerId, memberScope } = access;
  const [currentSnapshot, ownerSectors, ownerMembers] = await Promise.all([
    getConversationRoutingSnapshot(ownerId, conversationId),
    listOwnerSectors(ownerId),
    getAssignableMembersForOwner(ownerId),
  ]);

  const allowedSectorIds = memberScope ? new Set(memberScope.sectorIds) : null;
  const currentSectorId =
    (currentSnapshot?.sector_id as string | null | undefined) ||
    (access.conversation as any)?.sectorId ||
    null;
  const canChangeSector =
    currentSnapshot?.can_change_sector !== false &&
    currentSnapshot?.canChangeSector !== false;

  const sectors = ownerSectors
    .filter((sector) => (allowedSectorIds ? allowedSectorIds.has(String(sector.id)) : true))
    .map((sector) => ({
      id: String(sector.id),
      name: sector.name,
      description: sector.description || null,
      aiHandoffMode: sector.ai_handoff_mode || "copilot",
      controlledHandoffEnabled: sector.controlled_handoff_enabled !== false,
      memberReplyScope: sector.member_reply_scope === "shared" ? "shared" : "assigned_only",
      memberCount: sector.member_count || 0,
    }));

  const members = ownerMembers
    .filter((member: any) => (allowedSectorIds ? allowedSectorIds.has(String(member.sector_id)) : true))
    .filter((member: any) =>
      canChangeSector || !currentSectorId ? true : String(member.sector_id) === String(currentSectorId),
    )
    .map((member: any) => ({
      id: String(member.id),
      name: member.name,
      email: member.email,
      role: member.role,
      sectorId: String(member.sector_id),
      sectorName: member.sector_name,
      isPrimary: member.is_primary === true,
      canReceiveTickets: member.can_receive_tickets !== false,
    }));

  return {
    current: currentSnapshot ? sanitizeConversationForRequest(req, currentSnapshot as any) : null,
    sectors,
    members,
  };
}

async function handleConversationAssignment(req: any, res: Response, conversationId: string) {
  const access = await assertConversationAccess(req, res, conversationId, {
    requireViewPermission: true,
  });
  if (!access) {
    return null;
  }

  const { ownerId, memberScope } = access;
  let { targetSectorId, targetMemberId, reason, returnToAI } = normalizeRoutingTargets(req);

  if (memberScope) {
    const replyAuthorization = authorizeMemberReplyToConversation(access.conversation as any, memberScope);
    const currentAssigneeId =
      (access.conversation as any)?.assignedToMemberId ||
      (access.conversation as any)?.assigned_to_member_id ||
      null;

    if (
      currentAssigneeId &&
      currentAssigneeId !== memberScope.memberId &&
      replyAuthorization.allowed !== true
    ) {
      res.status(403).json({ error: replyAuthorization.reason || "Esta conversa não aceita colaboração entre membros." });
      return null;
    }

    if (targetSectorId && !memberScope.sectorIds.includes(targetSectorId)) {
      res.status(403).json({ error: "O membro não pode encaminhar para fora dos setores vinculados a ele." });
      return null;
    }

    if (targetMemberId) {
      const ownerMembers = await getAssignableMembersForOwner(ownerId);
      const selectedMember = ownerMembers.find((member: any) => String(member.id) === targetMemberId);
      if (!selectedMember) {
        res.status(404).json({ error: "Atendente de destino não encontrado." });
        return null;
      }

      const memberSectorId = String(selectedMember.sector_id);
      if (!memberScope.sectorIds.includes(memberSectorId)) {
        res.status(403).json({ error: "O membro não pode encaminhar para um atendente fora dos seus setores." });
        return null;
      }

      targetSectorId = targetSectorId || memberSectorId;
    }
  }

  const result = await transferConversationAssignment({
    ownerId,
    conversationId,
    actorId: req.user?.memberData?.id || ownerId,
    targetSectorId,
    targetMemberId,
    reason,
    returnToAI,
  });

  return result;
}

export function registerUserSectorRoutes(app: Express): void {
  app.get(
    "/api/user/sectors",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const items = await listOwnerSectors(ownerId);
      res.json({ items });
    }),
  );

  app.get(
    "/api/user/sectors/reports",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const startDate =
        (req.query.startDate as string) ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = (req.query.endDate as string) || new Date().toISOString().slice(0, 10);

      const summary = await qOne<any>(
        `
          SELECT
            COUNT(c.id)::int AS total_conversations,
            COUNT(CASE WHEN COALESCE(c.is_closed, false) = false THEN 1 END)::int AS open_conversations,
            COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int AS closed_conversations
          FROM conversations c
          JOIN whatsapp_connections wc ON wc.id = c.connection_id
          WHERE wc.user_id = $1
            AND c.routing_at::date BETWEEN $2::date AND $3::date
        `,
        [ownerId, startDate, endDate],
      );

      const bySector = await q<any>(
        `
          SELECT
            s.id AS sector_id,
            s.name AS sector_name,
            s.ai_handoff_mode,
            COUNT(c.id)::int AS assigned_count,
            COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int AS closed_count,
            ROUND(
              AVG(
                CASE
                  WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600
                  ELSE NULL
                END
              )::numeric,
              2
            ) AS avg_hours
          FROM sectors s
          LEFT JOIN conversations c
            ON c.sector_id = s.id
           AND c.routing_at::date BETWEEN $2::date AND $3::date
          WHERE s.owner_id = $1
          GROUP BY s.id, s.name, s.ai_handoff_mode
          ORDER BY assigned_count DESC, s.name ASC
        `,
        [ownerId, startDate, endDate],
      );

      const byMember = await q<any>(
        `
          SELECT
            tm.id AS member_id,
            tm.name AS member_name,
            tm.email AS member_email,
            COUNT(c.id)::int AS assigned_count,
            COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int AS closed_count,
            ROUND(
              AVG(
                CASE
                  WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600
                  ELSE NULL
                END
              )::numeric,
              2
            ) AS avg_hours
          FROM team_members tm
          LEFT JOIN conversations c
            ON c.assigned_to_member_id = tm.id
           AND c.routing_at::date BETWEEN $2::date AND $3::date
          WHERE tm.owner_id = $1
          GROUP BY tm.id, tm.name, tm.email
          ORDER BY assigned_count DESC, tm.name ASC
        `,
        [ownerId, startDate, endDate],
      );

      res.json({
        period: { startDate, endDate },
        totalConversations: summary?.total_conversations || 0,
        totalOpen: summary?.open_conversations || 0,
        totalClosed: summary?.closed_conversations || 0,
        bySector: bySector.map((row) => ({
          sectorId: row.sector_id,
          sectorName: row.sector_name,
          aiHandoffMode: row.ai_handoff_mode,
          assignedCount: row.assigned_count,
          closedCount: row.closed_count,
          avgHours: row.avg_hours == null ? null : Number(row.avg_hours),
        })),
        byMember: byMember.map((row) => ({
          memberId: row.member_id,
          memberName: row.member_name,
          memberEmail: row.member_email,
          assignedCount: row.assigned_count,
          closedCount: row.closed_count,
          avgHours: row.avg_hours == null ? null : Number(row.avg_hours),
        })),
      });
    }),
  );

  app.get(
    "/api/user/sectors/reports/conversations",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sectorId = typeof req.query.sectorId === "string" ? req.query.sectorId : null;
      const memberId = typeof req.query.memberId === "string" ? req.query.memberId : null;
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      const startDate =
        (req.query.startDate as string) ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = (req.query.endDate as string) || new Date().toISOString().slice(0, 10);

      const params: any[] = [ownerId, startDate, endDate];
      const filters: string[] = [
        "wc.user_id = $1",
        "COALESCE(c.routing_at::date, c.updated_at::date) BETWEEN $2::date AND $3::date",
      ];

      if (sectorId) {
        params.push(sectorId);
        filters.push(`c.sector_id = $${params.length}`);
      }

      if (memberId) {
        params.push(memberId);
        filters.push(`c.assigned_to_member_id = $${params.length}`);
      }

      if (status === "open") {
        filters.push("COALESCE(c.is_closed, false) = false");
      }

      if (status === "closed") {
        filters.push("COALESCE(c.is_closed, false) = true");
      }

      const items = await q<any>(
        `
          SELECT
            c.id,
            c.contact_name,
            c.contact_number,
            c.last_message_text,
            c.last_message_time,
            c.updated_at,
            c.is_closed,
            c.orchestration_mode,
            c.routing_intent,
            c.routing_confidence,
            c.routing_at,
            s.id AS sector_id,
            s.name AS sector_name,
            tm.id AS member_id,
            tm.name AS member_name
          FROM conversations c
          JOIN whatsapp_connections wc ON wc.id = c.connection_id
          LEFT JOIN sectors s ON s.id = c.sector_id
          LEFT JOIN team_members tm ON tm.id = c.assigned_to_member_id
          WHERE ${filters.join(" AND ")}
          ORDER BY COALESCE(c.updated_at, c.last_message_time, c.created_at) DESC
          LIMIT 300
        `,
        params,
      );

      res.json({
        items: items.map((row) => ({
          id: row.id,
          contactName: row.contact_name,
          contactNumber: row.contact_number,
          lastMessageText: row.last_message_text,
          lastMessageTime: row.last_message_time,
          updatedAt: row.updated_at,
          isClosed: row.is_closed,
          orchestrationMode: row.orchestration_mode,
          routingIntent: row.routing_intent,
          routingConfidence: row.routing_confidence == null ? null : Number(row.routing_confidence),
          routingAt: row.routing_at,
          sectorId: row.sector_id,
          sectorName: row.sector_name,
          memberId: row.member_id,
          memberName: row.member_name,
        })),
      });
    }),
  );

  app.get(
    "/api/user/sectors/conversations",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sectorId = typeof req.query.sectorId === "string" ? req.query.sectorId : null;
      const params: any[] = [ownerId];
      let sectorFilter = "";

      if (sectorId) {
        params.push(sectorId);
        sectorFilter = `AND c.sector_id = $2`;
      }

      const items = await q(
        `
          SELECT c.*
          FROM conversations c
          JOIN whatsapp_connections wc ON wc.id = c.connection_id
          WHERE wc.user_id = $1
            ${sectorFilter}
          ORDER BY c.updated_at DESC
          LIMIT 200
        `,
        params,
      );

      res.json({ items });
    }),
  );

  app.get(
    "/api/user/team-members-available",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const items = await q(
        `
          SELECT id, name, email, role, is_active
          FROM team_members
          WHERE owner_id = $1
          ORDER BY name ASC
        `,
        [ownerId],
      );
      res.json({ items });
    }),
  );

  app.post(
    "/api/user/sectors",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();
      const aiHandoffMode = req.body?.aiHandoffMode === "human_only" ? "human_only" : "copilot";
      const controlledHandoffEnabled = normalizeControlledHandoffEnabled(req.body?.controlledHandoffEnabled);
      const memberReplyScope = normalizeMemberReplyScope(req.body?.memberReplyScope);
      const keywords = parseKeywords(req.body?.keywords);

      if (name.length < 2) {
        return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." });
      }

      const existing = await qOne(
        `SELECT id FROM sectors WHERE owner_id = $1 AND lower(name) = lower($2) LIMIT 1`,
        [ownerId, name],
      );

      if (existing) {
        return res.status(400).json({ error: "Já existe um setor com este nome." });
      }

      const sector = await qOne(
        `
          INSERT INTO sectors (
            owner_id,
            name,
            description,
            keywords,
            ai_handoff_mode,
            controlled_handoff_enabled,
            member_reply_scope
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [ownerId, name, description || null, keywords, aiHandoffMode, controlledHandoffEnabled, memberReplyScope],
      );

      res.status(201).json({ sector });
    }),
  );

  app.post(
    "/api/user/sectors/route",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const conversationId = String(req.body?.conversationId || "");
      const messageText = String(req.body?.messageText || "").trim();

      if (!conversationId || !messageText) {
        return res.status(400).json({ error: "conversationId e messageText são obrigatórios." });
      }

      const result = await routeConversationWithLLM({
        ownerId,
        conversationId,
        messageText,
        handedOffBy: ownerId,
        routingMethod: "owner_manual_router",
      });

      res.json(result);
    }),
  );

  app.post(
    "/api/user/sectors/transfer",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const conversationId = String(req.body?.conversationId || "");
      if (!conversationId) {
        return res.status(400).json({ error: "conversationId é obrigatório." });
      }

      const result = await handleConversationAssignment(req, res, conversationId);
      if (!result) {
        return;
      }
      res.json(result);
    }),
  );

  app.get(
    "/api/conversations/:conversationId/routing-options",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const result = await buildConversationRoutingOptions(req, res, req.params.conversationId);
      if (!result) {
        return;
      }

      res.json(result);
    }),
  );

  app.post(
    "/api/conversations/:conversationId/assignment",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const result = await handleConversationAssignment(req, res, req.params.conversationId);
      if (!result) {
        return;
      }

      res.json(result);
    }),
  );

  app.get(
    "/api/user/sectors/:id",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sector = await qOne(`SELECT * FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`, [
        ownerId,
        req.params.id,
      ]);

      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      res.json({ sector });
    }),
  );

  app.patch(
    "/api/user/sectors/:id",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const updates: string[] = [];
      const values: any[] = [ownerId, req.params.id];
      let index = 3;

      if (req.body?.name !== undefined) {
        const name = String(req.body.name || "").trim();
        if (name.length < 2) {
          return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." });
        }
        updates.push(`name = $${index++}`);
        values.push(name);
      }

      if (req.body?.description !== undefined) {
        updates.push(`description = $${index++}`);
        values.push(String(req.body.description || "").trim() || null);
      }

      if (req.body?.keywords !== undefined) {
        updates.push(`keywords = $${index++}`);
        values.push(parseKeywords(req.body.keywords));
      }

      if (req.body?.aiHandoffMode !== undefined) {
        updates.push(`ai_handoff_mode = $${index++}`);
        values.push(req.body.aiHandoffMode === "human_only" ? "human_only" : "copilot");
      }

      if (
        !updates.length &&
        req.body?.controlledHandoffEnabled === undefined &&
        req.body?.memberReplyScope === undefined
      ) {
        return res.status(400).json({ error: "Nenhuma alteração informada." });
      }

      if (req.body?.controlledHandoffEnabled !== undefined) {
        updates.push(`controlled_handoff_enabled = $${index++}`);
        values.push(normalizeControlledHandoffEnabled(req.body.controlledHandoffEnabled));
      }

      if (req.body?.memberReplyScope !== undefined) {
        updates.push(`member_reply_scope = $${index++}`);
        values.push(normalizeMemberReplyScope(req.body.memberReplyScope));
      }

      updates.push("updated_at = NOW()");

      const sector = await qOne(
        `
          UPDATE sectors
          SET ${updates.join(", ")}
          WHERE owner_id = $1 AND id = $2
          RETURNING *
        `,
        values,
      );

      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      res.json({ sector });
    }),
  );

  app.delete(
    "/api/user/sectors/:id",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const result = await pool.query(`DELETE FROM sectors WHERE owner_id = $1 AND id = $2`, [
        ownerId,
        req.params.id,
      ]);

      if (!result.rowCount) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      res.status(204).send();
    }),
  );

  app.get(
    "/api/user/sectors/:id/members",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sector = await qOne(`SELECT id FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`, [
        ownerId,
        req.params.id,
      ]);

      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      const items = await q(
        `
          SELECT
            sm.id,
            sm.sector_id,
            sm.member_id,
            sm.is_primary,
            sm.can_receive_tickets,
            sm.max_open_tickets,
            sm.current_open_tickets,
            sm.assigned_at,
            tm.name AS member_name,
            tm.email AS member_email,
            tm.role AS member_role,
            tm.is_active AS member_is_active
          FROM sector_members sm
          JOIN team_members tm ON tm.id = sm.member_id
          JOIN sectors s ON s.id = sm.sector_id
          WHERE s.owner_id = $1
            AND sm.sector_id = $2
          ORDER BY sm.is_primary DESC, tm.name ASC
        `,
        [ownerId, req.params.id],
      );

      res.json({ items });
    }),
  );

  app.post(
    "/api/user/sectors/:id/members",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const memberId = String(req.body?.memberId || "");
      const isPrimary = req.body?.isPrimary === true;
      const canReceiveTickets = req.body?.canReceiveTickets !== false;
      const maxOpenTickets = Number(req.body?.maxOpenTickets || 10);

      const sector = await qOne(`SELECT id FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`, [
        ownerId,
        req.params.id,
      ]);
      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      const member = await qOne(
        `SELECT id FROM team_members WHERE owner_id = $1 AND id = $2 LIMIT 1`,
        [ownerId, memberId],
      );
      if (!member) {
        return res.status(404).json({ error: "Membro não encontrado." });
      }

      if (isPrimary) {
        await pool.query(`UPDATE sector_members SET is_primary = false WHERE sector_id = $1`, [
          req.params.id,
        ]);
      }

      await pool.query(
        `
          INSERT INTO sector_members (
            sector_id,
            member_id,
            is_primary,
            can_receive_tickets,
            max_open_tickets,
            assigned_by,
            assigned_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (sector_id, member_id)
          DO UPDATE SET
            is_primary = EXCLUDED.is_primary,
            can_receive_tickets = EXCLUDED.can_receive_tickets,
            max_open_tickets = EXCLUDED.max_open_tickets,
            assigned_by = EXCLUDED.assigned_by,
            assigned_at = NOW()
        `,
        [req.params.id, memberId, isPrimary, canReceiveTickets, maxOpenTickets, ownerId],
      );

      const item = await qOne(
        `
          SELECT
            sm.id,
            sm.sector_id,
            sm.member_id,
            sm.is_primary,
            sm.can_receive_tickets,
            sm.max_open_tickets,
            sm.current_open_tickets,
            sm.assigned_at,
            tm.name AS member_name,
            tm.email AS member_email,
            tm.role AS member_role,
            tm.is_active AS member_is_active
          FROM sector_members sm
          JOIN team_members tm ON tm.id = sm.member_id
          WHERE sm.sector_id = $1 AND sm.member_id = $2
        `,
        [req.params.id, memberId],
      );

      res.status(201).json({ item });
    }),
  );

  app.delete(
    "/api/user/sectors/:id/members/:memberId",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sector = await qOne(`SELECT id FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`, [
        ownerId,
        req.params.id,
      ]);
      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      const result = await pool.query(
        `DELETE FROM sector_members WHERE sector_id = $1 AND member_id = $2`,
        [req.params.id, req.params.memberId],
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Membro não encontrado no setor." });
      }

      res.status(204).send();
    }),
  );

  app.patch(
    "/api/user/sectors/:id/members/:memberId",
    isAuthenticated,
    requireOwner,
    asyncHandler(async (req, res) => {
      const ownerId = String(getUserId(req));
      const sector = await qOne(`SELECT id FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`, [
        ownerId,
        req.params.id,
      ]);
      if (!sector) {
        return res.status(404).json({ error: "Setor não encontrado." });
      }

      const updates: string[] = [];
      const values: any[] = [req.params.id, req.params.memberId];
      let index = 3;

      if (req.body?.isPrimary !== undefined) {
        if (req.body.isPrimary === true) {
          await pool.query(`UPDATE sector_members SET is_primary = false WHERE sector_id = $1`, [
            req.params.id,
          ]);
        }
        updates.push(`is_primary = $${index++}`);
        values.push(req.body.isPrimary === true);
      }

      if (req.body?.canReceiveTickets !== undefined) {
        updates.push(`can_receive_tickets = $${index++}`);
        values.push(req.body.canReceiveTickets !== false);
      }

      if (req.body?.maxOpenTickets !== undefined) {
        updates.push(`max_open_tickets = $${index++}`);
        values.push(Number(req.body.maxOpenTickets || 10));
      }

      if (!updates.length) {
        return res.status(400).json({ error: "Nenhuma alteração informada." });
      }

      await pool.query(
        `
          UPDATE sector_members
          SET ${updates.join(", ")}
          WHERE sector_id = $1 AND member_id = $2
        `,
        values,
      );

      const item = await qOne(
        `
          SELECT
            sm.id,
            sm.sector_id,
            sm.member_id,
            sm.is_primary,
            sm.can_receive_tickets,
            sm.max_open_tickets,
            sm.current_open_tickets,
            sm.assigned_at,
            tm.name AS member_name,
            tm.email AS member_email,
            tm.role AS member_role,
            tm.is_active AS member_is_active
          FROM sector_members sm
          JOIN team_members tm ON tm.id = sm.member_id
          WHERE sm.sector_id = $1 AND sm.member_id = $2
        `,
        [req.params.id, req.params.memberId],
      );

      res.json({ item });
    }),
  );

  app.get(
    "/api/member/sectors/my",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      if (req.user?.isMember !== true || !req.user?.memberData?.id) {
        return res.status(403).json({ error: "Acesso restrito a membros da equipe." });
      }

      const ownerId = String(getUserId(req));
      const memberId = String(req.user.memberData.id);
      const items = await q(
        `
          SELECT
            s.id,
            s.name,
            s.description,
            s.ai_handoff_mode
          FROM sector_members sm
          JOIN sectors s ON s.id = sm.sector_id
          WHERE sm.member_id = $1
            AND s.owner_id = $2
          ORDER BY s.name ASC
        `,
        [memberId, ownerId],
      );

      res.json({ items });
    }),
  );

  app.get(
    "/api/user/sectors/conversation/:conversationId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const access = await assertConversationAccess(req, res, req.params.conversationId, {
        requireViewPermission: true,
      });
      if (!access) {
        return;
      }

      const item = await getConversationRoutingSnapshot(access.ownerId, req.params.conversationId);
      if (!item) {
        return res.status(404).json({ error: "Conversa não encontrada." });
      }
      res.json(sanitizeConversationForRequest(req, item as any));
    }),
  );
}
