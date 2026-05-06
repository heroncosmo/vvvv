import type { Response } from "express";
import { extractMeaningfulContactName } from "@shared/contactNameVisibility";
import { pool } from "./db";
import { storage } from "./storage";
import { canViewPhoneNumbersFromPermissions } from "./memberPhoneVisibility";

type MemberScope = {
  memberId: string;
  ownerId: string;
  sectorIds: string[];
  defaultSectorId: string | null;
  sectorSettings: Record<
    string,
    {
      controlledHandoffEnabled: boolean;
      memberReplyScope: "assigned_only" | "shared";
    }
  >;
  permissions: Record<string, boolean>;
};

type MemberConversationScopeCandidate = {
  id?: string | null;
  sectorId?: string | null;
  assignedToMemberId?: string | null;
  sector_id?: string | null;
  assigned_to_member_id?: string | null;
  hasManualHumanReplySinceHandoff?: boolean;
  has_manual_human_reply_since_handoff?: boolean;
};

type ConversationIdentityPayload = {
  id?: string | null;
  contactName?: string | null;
  contactNumber?: string | null;
  remoteJid?: string | null;
  contact_name?: string | null;
  contact_number?: string | null;
  remote_jid?: string | null;
};

export function getRequestOwnerId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || null;
}

export function isMemberRequest(req: any): boolean {
  return req.user?.isMember === true && !!req.user?.memberData?.id;
}

export function canMemberViewPhoneNumbers(req: any): boolean {
  if (!isMemberRequest(req)) {
    return true;
  }

  return canViewPhoneNumbersFromPermissions(req.user?.memberData?.permissions);
}

export function ensureMemberPermission(
  req: any,
  res: Response,
  permission: string,
  message = "Permissão insuficiente para esta ação.",
): boolean {
  if (!isMemberRequest(req)) {
    return true;
  }

  const permissions = (req.user?.memberData?.permissions || {}) as Record<string, boolean>;
  if (permissions[permission] === false) {
    res.status(403).json({ message });
    return false;
  }

  return true;
}

export async function getMemberScope(req: any): Promise<MemberScope | null> {
  if (!isMemberRequest(req)) {
    return null;
  }

  const ownerId = getRequestOwnerId(req);
  const memberId = String(req.user.memberData.id);

  const result = await pool.query(
    `
      SELECT DISTINCT
        sm.sector_id,
        COALESCE(s.controlled_handoff_enabled, true) AS controlled_handoff_enabled,
        CASE
          WHEN s.member_reply_scope = 'shared' THEN 'shared'
          ELSE 'assigned_only'
        END AS member_reply_scope
      FROM sector_members sm
      JOIN sectors s ON s.id = sm.sector_id
      WHERE sm.member_id = $1
        AND s.owner_id = $2
    `,
    [memberId, ownerId],
  );

  const sectorIds = result.rows.map((row: any) => String(row.sector_id)).filter(Boolean);
  const sectorSettings = Object.fromEntries(
    result.rows
      .map((row: any) => {
        const sectorId = String(row.sector_id || "").trim();
        if (!sectorId) {
          return null;
        }

        return [
          sectorId,
          {
            controlledHandoffEnabled: row.controlled_handoff_enabled !== false,
            memberReplyScope: row.member_reply_scope === "shared" ? "shared" : "assigned_only",
          },
        ] as const;
      })
      .filter(Boolean) as Array<
      readonly [
        string,
        {
          controlledHandoffEnabled: boolean;
          memberReplyScope: "assigned_only" | "shared";
        },
      ]
    >,
  );

  return {
    memberId,
    ownerId: String(ownerId),
    sectorIds,
    defaultSectorId: sectorIds.length === 1 ? sectorIds[0] : null,
    sectorSettings,
    permissions: (req.user?.memberData?.permissions || {}) as Record<string, boolean>,
  };
}

type ResolvedMemberSectorSettings = {
  sectorId: string;
  controlledHandoffEnabled: boolean;
  memberReplyScope: "assigned_only" | "shared";
};

export function resolveConversationSectorIdForMemberScope(
  conversation: MemberConversationScopeCandidate,
  scope: MemberScope,
): string | null {
  const sectorId = conversation.sectorId ?? conversation.sector_id ?? null;
  if (sectorId) {
    return sectorId;
  }

  return scope.defaultSectorId;
}

export function resolveConversationSectorSettingsForMemberScope(
  conversation: MemberConversationScopeCandidate,
  scope: MemberScope,
): ResolvedMemberSectorSettings | null {
  const sectorId = resolveConversationSectorIdForMemberScope(conversation, scope);
  if (!sectorId || !scope.sectorIds.includes(sectorId)) {
    return null;
  }

  const configured = scope.sectorSettings[sectorId];
  return {
    sectorId,
    controlledHandoffEnabled: configured?.controlledHandoffEnabled !== false,
    memberReplyScope: configured?.memberReplyScope === "shared" ? "shared" : "assigned_only",
  };
}

export function canMemberAccessConversation(
  conversation: MemberConversationScopeCandidate,
  scope: MemberScope,
): boolean {
  if (!scope) {
    return false;
  }

  const assignedToMemberId = conversation.assignedToMemberId ?? conversation.assigned_to_member_id ?? null;
  if (assignedToMemberId && assignedToMemberId === scope.memberId) {
    return true;
  }

  const sectorSettings = resolveConversationSectorSettingsForMemberScope(conversation, scope);
  if (!sectorSettings) {
    return false;
  }

  if (!sectorSettings.controlledHandoffEnabled) {
    return true;
  }

  return !hasManualHumanReplySinceHandoff(conversation);
}

function hasManualHumanReplySinceHandoff(conversation: MemberConversationScopeCandidate): boolean {
  return (
    conversation.hasManualHumanReplySinceHandoff === true ||
    conversation.has_manual_human_reply_since_handoff === true
  );
}

export function canMemberClaimConversationFromSectorQueue(
  conversation: MemberConversationScopeCandidate,
  scope: MemberScope,
): boolean {
  if (!scope) {
    return false;
  }

  const assignedToMemberId = conversation.assignedToMemberId ?? conversation.assigned_to_member_id ?? null;
  if (assignedToMemberId === scope.memberId) {
    return true;
  }

  const sectorSettings = resolveConversationSectorSettingsForMemberScope(conversation, scope);
  if (!sectorSettings) {
    return false;
  }

  return !hasManualHumanReplySinceHandoff(conversation);
}

export function authorizeMemberReplyToConversation(
  conversation: MemberConversationScopeCandidate,
  scope: MemberScope,
): {
  allowed: boolean;
  shouldAutoClaim: boolean;
  sectorId: string | null;
  reason: string | null;
} {
  if (!scope) {
    return {
      allowed: false,
      shouldAutoClaim: false,
      sectorId: null,
      reason: "Escopo do membro não encontrado.",
    };
  }

  const assignedToMemberId = conversation.assignedToMemberId ?? conversation.assigned_to_member_id ?? null;
  if (assignedToMemberId === scope.memberId) {
    return {
      allowed: true,
      shouldAutoClaim: false,
      sectorId: resolveConversationSectorIdForMemberScope(conversation, scope),
      reason: null,
    };
  }

  const sectorSettings = resolveConversationSectorSettingsForMemberScope(conversation, scope);
  if (!sectorSettings) {
    return {
      allowed: false,
      shouldAutoClaim: false,
      sectorId: null,
      reason: "A conversa precisa estar vinculada a um setor do membro para ser assumida.",
    };
  }

  if (sectorSettings.memberReplyScope === "shared") {
    return {
      allowed: true,
      shouldAutoClaim: !assignedToMemberId,
      sectorId: sectorSettings.sectorId,
      reason: null,
    };
  }

  if (canMemberClaimConversationFromSectorQueue(conversation, scope)) {
    return {
      allowed: true,
      shouldAutoClaim: assignedToMemberId !== scope.memberId,
      sectorId: sectorSettings.sectorId,
      reason: null,
    };
  }

  return {
    allowed: false,
    shouldAutoClaim: false,
    sectorId: sectorSettings.sectorId,
    reason: "Esta conversa já está em atendimento por outro membro e o setor não permite colaboração entre membros.",
  };
}

export async function getConversationHumanReplyStateMap(
  conversationIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueConversationIds = Array.from(new Set(conversationIds.filter(Boolean)));
  if (uniqueConversationIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `
      SELECT
        c.id AS conversation_id,
        EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.from_me = true
            AND COALESCE(m.is_from_agent, false) = false
            AND (c.handed_off_at IS NULL OR m.timestamp >= c.handed_off_at)
        ) AS has_manual_human_reply_since_handoff
      FROM conversations c
      WHERE c.id = ANY($1::varchar[])
    `,
    [uniqueConversationIds],
  );

  return new Map(
    result.rows.map((row: any) => [
      String(row.conversation_id),
      row.has_manual_human_reply_since_handoff === true,
    ]),
  );
}

export async function hasConversationHumanReplySinceHandoff(conversationId: string): Promise<boolean> {
  const replyStateMap = await getConversationHumanReplyStateMap([conversationId]);
  return replyStateMap.get(conversationId) === true;
}

export async function assertConversationAccess(
  req: any,
  res: Response,
  conversationId: string,
  options?: {
    requireViewPermission?: boolean;
    requireSendPermission?: boolean;
  },
) {
  const ownerId = getRequestOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  if (options?.requireViewPermission && !ensureMemberPermission(req, res, "canViewConversations")) {
    return null;
  }

  if (options?.requireSendPermission && !ensureMemberPermission(req, res, "canSendMessages")) {
    return null;
  }

  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ message: "Conversation not found" });
    return null;
  }

  const connection = await storage.getConnectionById(conversation.connectionId);
  if (!connection || connection.userId !== ownerId) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  if (!isMemberRequest(req)) {
    return { ownerId, conversation, connection, memberScope: null };
  }

  const memberScope = await getMemberScope(req);
  const humanReplySinceHandoff = await hasConversationHumanReplySinceHandoff(conversationId);
  const scopedConversation = {
    ...conversation,
    hasManualHumanReplySinceHandoff: humanReplySinceHandoff,
  };

  if (!memberScope || !canMemberAccessConversation(scopedConversation, memberScope)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return {
    ownerId,
    conversation: scopedConversation,
    connection,
    memberScope,
    humanReplySinceHandoff,
  };
}

export async function filterConversationsForRequest<
  T extends MemberConversationScopeCandidate,
>(
  req: any,
  items: T[],
): Promise<T[]> {
  if (!isMemberRequest(req)) {
    return items;
  }

  const scope = await getMemberScope(req);
  if (!scope) {
    return [];
  }

  const replyStateMap = await getConversationHumanReplyStateMap(
    items.map((item) => String(item.id || "")).filter(Boolean),
  );

  return items.filter((item) =>
    canMemberAccessConversation(
      {
        ...item,
        hasManualHumanReplySinceHandoff: replyStateMap.get(String(item.id || "")) === true,
      },
      scope,
    ),
  );
}

function buildMemberSafeContactName(conversation: ConversationIdentityPayload): string {
  const existingName = extractMeaningfulContactName(conversation.contactName);
  if (existingName) {
    return existingName;
  }

  const safeSuffix = Array.from(String(conversation.id || ""))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122)
      );
    })
    .join("")
    .slice(0, 6)
    .toUpperCase();
  return safeSuffix ? `Contato ${safeSuffix}` : "Contato em atendimento";
}

export function sanitizeConversationForRequest<T extends ConversationIdentityPayload>(req: any, item: T): T {
  if (!isMemberRequest(req) || canMemberViewPhoneNumbers(req)) {
    return item;
  }

  return {
    ...item,
    contactName: buildMemberSafeContactName(item),
    contactNumber: "",
    remoteJid: null,
    contact_name: buildMemberSafeContactName(item),
    contact_number: "",
    remote_jid: null,
  };
}

export function sanitizeConversationsForRequest<T extends ConversationIdentityPayload>(req: any, items: T[]): T[] {
  if (!isMemberRequest(req)) {
    return items;
  }

  return items.map((item) => sanitizeConversationForRequest(req, item));
}

export async function getAssignableMembersForOwner(ownerId: string, sectorId?: string | null) {
  const values: any[] = [ownerId];
  let sectorFilter = "";

  if (sectorId) {
    values.push(sectorId);
    sectorFilter = "AND sm.sector_id = $2";
  }

  const result = await pool.query(
    `
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        sm.sector_id,
        s.name AS sector_name,
        sm.is_primary,
        sm.can_receive_tickets
      FROM team_members tm
      JOIN sector_members sm ON sm.member_id = tm.id
      JOIN sectors s ON s.id = sm.sector_id
      WHERE tm.owner_id = $1
        AND tm.is_active = true
        ${sectorFilter}
      ORDER BY s.name ASC, sm.is_primary DESC, tm.name ASC
    `,
    values,
  );

  return result.rows;
}
