import { pool } from "./db";
import { generateWithLLM } from "./llm";
import { storage } from "./storage";

type SectorRecord = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  ai_handoff_mode: "copilot" | "human_only";
  controlled_handoff_enabled?: boolean | null;
  member_reply_scope?: "assigned_only" | "shared" | null;
  member_count?: number;
};

type AssignmentResult = {
  sectorId: string | null;
  sectorName: string | null;
  assignedMemberId: string | null;
  assignedMemberName: string | null;
  orchestrationMode: "ai" | "copilot" | "human";
  confidence: number | null;
  reason: string;
  intent: string | null;
};

export type ConversationRoutingDecision = {
  mode?: "keep_current" | "route_to_sector";
  targetSectorId?: string | null;
  confidence?: number | null;
  intent?: string | null;
  reason?: string | null;
};

type ConversationTransferState = {
  id: string;
  sector_id: string | null;
  sector_name: string | null;
  assigned_to_member_id: string | null;
  assigned_member_name: string | null;
  handed_off_at: Date | null;
  routing_intent: string | null;
  routing_confidence: string | number | null;
  orchestration_mode: "ai" | "copilot" | "human";
  has_manual_human_reply_since_handoff: boolean;
};

function buildSingleSectorAutoRoutingReason(baseReason: string | null | undefined): string {
  const normalizedBaseReason =
    typeof baseReason === "string" && baseReason.trim().length > 0
      ? baseReason.trim()
      : null;

  if (!normalizedBaseReason || normalizedBaseReason === "A IA decidiu manter a conversa no fluxo atual.") {
    return "Encaminhamento automatico para o unico setor configurado.";
  }

  return `${normalizedBaseReason} Encaminhamento automatico para o unico setor configurado.`;
}

function buildAssignmentResultFromCurrentState(
  currentState: ConversationTransferState | null,
  overrides?: Partial<AssignmentResult>,
): AssignmentResult {
  return {
    sectorId: overrides?.sectorId ?? currentState?.sector_id ?? null,
    sectorName: overrides?.sectorName ?? currentState?.sector_name ?? null,
    assignedMemberId: overrides?.assignedMemberId ?? currentState?.assigned_to_member_id ?? null,
    assignedMemberName: overrides?.assignedMemberName ?? currentState?.assigned_member_name ?? null,
    orchestrationMode: overrides?.orchestrationMode ?? currentState?.orchestration_mode ?? "ai",
    confidence:
      overrides?.confidence ??
      (currentState?.routing_confidence === null || currentState?.routing_confidence === undefined
        ? null
        : Number(currentState.routing_confidence)),
    reason:
      overrides?.reason ??
      (currentState?.sector_name
        ? `Conversa mantida em ${currentState.sector_name}.`
        : "Conversa mantida no estado atual."),
    intent: overrides?.intent ?? currentState?.routing_intent ?? null,
  };
}

function safeJsonParse(raw: string): any | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getSectorTransferLockReason(currentState: ConversationTransferState): string {
  const sectorName = currentState.sector_name || "setor atual";
  return `O ${sectorName} já iniciou atendimento humano nesta conversa. A mudança de setor fica bloqueada após a primeira resposta humana.`;
}

async function getConversationTransferState(
  ownerId: string,
  conversationId: string,
): Promise<ConversationTransferState | null> {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.sector_id,
        s.name AS sector_name,
        c.assigned_to_member_id,
        tm.name AS assigned_member_name,
        c.handed_off_at,
        c.routing_intent,
        c.routing_confidence,
        c.orchestration_mode,
        EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.from_me = true
            AND COALESCE(m.is_from_agent, false) = false
            AND (c.handed_off_at IS NULL OR m.timestamp >= c.handed_off_at)
        ) AS has_manual_human_reply_since_handoff
      FROM conversations c
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      LEFT JOIN sectors s ON s.id = c.sector_id
      LEFT JOIN team_members tm ON tm.id = c.assigned_to_member_id
      WHERE c.id = $1
        AND wc.user_id = $2
      LIMIT 1
    `,
    [conversationId, ownerId],
  );

  return (result.rows[0] || null) as ConversationTransferState | null;
}

export async function listOwnerSectors(ownerId: string): Promise<SectorRecord[]> {
  const result = await pool.query(
    `
      SELECT
        s.*,
        (
          SELECT COUNT(*)::int
          FROM sector_members sm
          JOIN team_members tm ON tm.id = sm.member_id
          WHERE sm.sector_id = s.id
            AND tm.is_active = true
        ) AS member_count
      FROM sectors s
      WHERE s.owner_id = $1
      ORDER BY s.name ASC
    `,
    [ownerId],
  );

  return result.rows as SectorRecord[];
}

async function pickBestMember(ownerId: string, sectorId: string) {
  const result = await pool.query(
    `
      SELECT
        sm.member_id,
        tm.name AS member_name,
        COALESCE(loads.open_count, 0) AS current_load,
        COALESCE(sm.max_open_tickets, 10) AS max_open_tickets
      FROM sector_members sm
      JOIN team_members tm ON tm.id = sm.member_id
      JOIN sectors s ON s.id = sm.sector_id
      LEFT JOIN (
        SELECT assigned_to_member_id AS member_id, COUNT(*)::int AS open_count
        FROM conversations
        WHERE assigned_to_member_id IS NOT NULL
          AND COALESCE(is_closed, false) = false
        GROUP BY assigned_to_member_id
      ) loads ON loads.member_id = sm.member_id
      WHERE sm.sector_id = $1
        AND s.owner_id = $2
        AND tm.is_active = true
        AND COALESCE(sm.can_receive_tickets, true) = true
        AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)
      ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC, tm.name ASC
      LIMIT 1
    `,
    [sectorId, ownerId],
  );

  return result.rows[0] || null;
}

async function getMemberSectorForTransfer(
  ownerId: string,
  memberId: string,
  options?: {
    preferredSectorId?: string | null;
    fallbackSectorId?: string | null;
  },
) {
  const preferredSectorId = options?.preferredSectorId || null;
  const fallbackSectorId = options?.fallbackSectorId || null;
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.name,
        s.ai_handoff_mode
      FROM sector_members sm
      JOIN sectors s ON s.id = sm.sector_id
      JOIN team_members tm ON tm.id = sm.member_id
      WHERE tm.owner_id = $1
        AND tm.id = $2
      ORDER BY
        CASE
          WHEN $3::varchar IS NOT NULL AND sm.sector_id = $3::varchar THEN 0
          WHEN $4::varchar IS NOT NULL AND sm.sector_id = $4::varchar THEN 1
          WHEN COALESCE(sm.is_primary, false) = true THEN 2
          ELSE 3
        END,
        s.name ASC
      LIMIT 1
    `,
    [ownerId, memberId, preferredSectorId, fallbackSectorId],
  );

  return result.rows[0] || null;
}

async function applyConversationAssignment(params: {
  ownerId: string;
  conversationId: string;
  sector: SectorRecord | null;
  assignedMemberId?: string | null;
  assignedMemberName?: string | null;
  confidence?: number | null;
  reason: string;
  intent?: string | null;
  routingMethod: string;
  handedOffBy?: string | null;
  handoffMode?: "ai" | "copilot" | "human";
}) {
  const {
    conversationId,
    sector,
    assignedMemberId = null,
    assignedMemberName = null,
    confidence = null,
    reason,
    intent = null,
    routingMethod,
    handedOffBy = null,
  } = params;

  const orchestrationMode =
    params.handoffMode ||
    (sector
      ? sector.ai_handoff_mode === "human_only"
        ? "human"
        : "copilot"
      : "ai");

  await pool.query(
    `
      UPDATE conversations
      SET
        sector_id = $1,
        assigned_to_member_id = $2,
        routing_intent = $3,
        routing_confidence = $4,
        routing_at = NOW(),
        orchestration_mode = $5,
        handoff_reason = $6,
        handed_off_at = NOW(),
        handed_off_by = $7,
        updated_at = NOW()
      WHERE id = $8
    `,
    [
      sector?.id || null,
      assignedMemberId,
      intent,
      confidence,
      orchestrationMode,
      reason,
      handedOffBy,
      conversationId,
    ],
  );

  try {
    await pool.query(
      `
        INSERT INTO routing_logs (
          conversation_id,
          message_text,
          detected_intent,
          matched_sector_id,
          confidence_score,
          assigned_to_member_id,
          routing_method
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        conversationId,
        reason,
        intent,
        sector?.id || null,
        confidence,
        assignedMemberId,
        routingMethod,
      ],
    );
  } catch {
    // non-fatal audit failure
  }

  if (orchestrationMode === "human") {
    await storage.disableAgentForConversation(conversationId, null);
  } else {
    await storage.enableAgentForConversation(conversationId);
  }

  return {
    sectorId: sector?.id || null,
    sectorName: sector?.name || null,
    assignedMemberId,
    assignedMemberName,
    orchestrationMode,
    confidence,
    reason,
    intent,
  } satisfies AssignmentResult;
}

export async function routeConversationWithLLM(params: {
  ownerId: string;
  conversationId: string;
  messageText: string;
  handedOffBy?: string | null;
  routingMethod?: string;
}) {
  const { ownerId, conversationId, messageText, handedOffBy = null, routingMethod = "llm_router" } = params;
  const currentState = await getConversationTransferState(ownerId, conversationId);

  if (currentState?.sector_id && currentState.has_manual_human_reply_since_handoff) {
    return {
      sectorId: currentState.sector_id,
      sectorName: currentState.sector_name,
      assignedMemberId: currentState.assigned_to_member_id,
      assignedMemberName: currentState.assigned_member_name,
      orchestrationMode: currentState.orchestration_mode,
      confidence:
        currentState.routing_confidence === null || currentState.routing_confidence === undefined
          ? 1
          : Number(currentState.routing_confidence),
      reason: getSectorTransferLockReason(currentState),
      intent: currentState.routing_intent || "locked_human_handoff",
    } satisfies AssignmentResult;
  }

  const sectors = await listOwnerSectors(ownerId);

  if (!sectors.length) {
    throw new Error("Nenhum setor configurado.");
  }

  const sectorCatalog = sectors
    .map((sector) => ({
      id: sector.id,
      name: sector.name,
      description: sector.description || "",
      keywords: sector.keywords || [],
      aiHandoffMode: sector.ai_handoff_mode || "copilot",
      memberCount: sector.member_count || 0,
    }))
    .map((item, index) => `${index + 1}. ${JSON.stringify(item)}`)
    .join("\n");

  const systemPrompt = [
    "Você é um roteador semântico de CRM.",
    "Escolha o melhor setor para a mensagem do cliente.",
    "Use contexto semântico, não combinação literal.",
    "Se nenhum setor fizer sentido, retorne sectorId null.",
    'Responda apenas JSON com: {"sectorId":string|null,"intent":string,"confidence":0-1,"reason":string}.',
  ].join(" ");

  const userPrompt = [
    `Mensagem do cliente: ${messageText}`,
    "Setores disponíveis:",
    sectorCatalog,
  ].join("\n");

  let parsed: any | null = null;

  try {
    const raw = await generateWithLLM(systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: 220,
    });
    parsed = safeJsonParse(raw);
  } catch (error) {
    console.warn("[SectorRouting] LLM routing failed, falling back to availability:", error);
  }

  let selectedSector =
    sectors.find((sector) => sector.id === parsed?.sectorId) ||
    null;

  let confidence =
    typeof parsed?.confidence === "number" ? Number(parsed.confidence) : null;

  const intent =
    typeof parsed?.intent === "string" && parsed.intent.trim().length > 0
      ? parsed.intent.trim().slice(0, 100)
      : "setor_responsavel";

  let reason =
    typeof parsed?.reason === "string" && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : "Roteamento semântico pela mensagem do cliente.";

  if (!selectedSector) {
    selectedSector =
      sectors.find((sector) => (sector.member_count || 0) > 0) ||
      sectors[0] ||
      null;
    confidence = confidence ?? 0.45;
    reason = parsed ? `${reason} Fallback por disponibilidade.` : "Fallback por disponibilidade do setor.";
  }

  if (!selectedSector) {
    throw new Error("Nenhum setor disponível para roteamento.");
  }

  return applyConversationRoutingDecision({
    ownerId,
    conversationId,
    decision: {
      mode: "route_to_sector",
      targetSectorId: selectedSector.id,
      confidence,
      reason,
      intent,
    },
    routingMethod,
    handedOffBy,
  });
}

export async function applyConversationRoutingDecision(params: {
  ownerId: string;
  conversationId: string;
  decision?: ConversationRoutingDecision | null;
  handedOffBy?: string | null;
  routingMethod?: string;
}) {
  const {
    ownerId,
    conversationId,
    decision = null,
    handedOffBy = null,
    routingMethod = "llm_router",
  } = params;

  const currentState = await getConversationTransferState(ownerId, conversationId);
  if (!currentState) {
    throw new Error("Conversa de origem não encontrada.");
  }

  const normalizedMode = decision?.mode === "route_to_sector" ? "route_to_sector" : "keep_current";
  const normalizedReason =
    typeof decision?.reason === "string" && decision.reason.trim().length > 0
      ? decision.reason.trim()
      : normalizedMode === "route_to_sector"
        ? "Handoff semântico decidido pela IA."
        : "A IA decidiu manter a conversa no fluxo atual.";
  const normalizedIntent =
    typeof decision?.intent === "string" && decision.intent.trim().length > 0
      ? decision.intent.trim().slice(0, 100)
      : normalizedMode === "route_to_sector"
        ? "llm_handoff"
        : currentState.routing_intent || "keep_current";
  const normalizedConfidence =
    typeof decision?.confidence === "number" && !Number.isNaN(decision.confidence)
      ? Math.max(0, Math.min(1, Number(decision.confidence)))
      : null;

  if (normalizedMode !== "route_to_sector" || !decision?.targetSectorId) {
    if (!currentState.sector_id) {
      const sectors = await listOwnerSectors(ownerId);
      if (sectors.length === 1) {
        const singleSector = sectors[0];
        const member = await pickBestMember(ownerId, singleSector.id);

        return applyConversationAssignment({
          ownerId,
          conversationId,
          sector: singleSector,
          assignedMemberId: member?.member_id || null,
          assignedMemberName: member?.member_name || null,
          confidence: normalizedConfidence,
          reason: buildSingleSectorAutoRoutingReason(normalizedReason),
          intent: normalizedIntent || "single_sector_default",
          routingMethod,
          handedOffBy,
        });
      }
    }

    return buildAssignmentResultFromCurrentState(currentState, {
      confidence: normalizedConfidence,
      reason: normalizedReason,
      intent: normalizedIntent,
    });
  }

  const sectors = await listOwnerSectors(ownerId);
  const selectedSector = sectors.find((sector) => sector.id === decision.targetSectorId) || null;
  if (!selectedSector) {
    return buildAssignmentResultFromCurrentState(currentState, {
      confidence: normalizedConfidence,
      reason: `${normalizedReason} O setor sugerido não existe mais, então o handoff foi ignorado.`,
      intent: normalizedIntent,
    });
  }

  const isChangingSector =
    !!currentState.sector_id &&
    currentState.sector_id !== selectedSector.id;
  const isSameSectorWithCurrentAssignee =
    currentState.sector_id === selectedSector.id &&
    !!currentState.assigned_to_member_id;

  if (isSameSectorWithCurrentAssignee) {
    return buildAssignmentResultFromCurrentState(currentState, {
      confidence: normalizedConfidence,
      reason: normalizedReason,
      intent: normalizedIntent,
    });
  }

  if (isChangingSector && currentState.has_manual_human_reply_since_handoff) {
    return buildAssignmentResultFromCurrentState(currentState, {
      confidence: normalizedConfidence,
      reason: getSectorTransferLockReason(currentState),
      intent: "locked_human_handoff",
    });
  }

  const member = await pickBestMember(ownerId, selectedSector.id);

  return applyConversationAssignment({
    ownerId,
    conversationId,
    sector: selectedSector,
    assignedMemberId: member?.member_id || null,
    assignedMemberName: member?.member_name || null,
    confidence: normalizedConfidence,
    reason: normalizedReason,
    intent: normalizedIntent,
    routingMethod,
    handedOffBy,
  });
}

export async function transferConversationAssignment(params: {
  ownerId: string;
  conversationId: string;
  actorId?: string | null;
  targetSectorId?: string | null;
  targetMemberId?: string | null;
  reason?: string | null;
  returnToAI?: boolean;
}) {
  const {
    ownerId,
    conversationId,
    actorId = null,
    targetSectorId = null,
    targetMemberId = null,
    reason = null,
    returnToAI = false,
  } = params;

  if (returnToAI) {
    return applyConversationAssignment({
      ownerId,
      conversationId,
      sector: null,
      assignedMemberId: null,
      assignedMemberName: null,
      confidence: 1,
      reason: reason || "Conversa devolvida para a IA.",
      intent: "return_to_ai",
      routingMethod: "return_to_ai",
      handedOffBy: actorId,
      handoffMode: "ai",
    });
  }

  const currentState = await getConversationTransferState(ownerId, conversationId);
  if (!currentState) {
    throw new Error("Conversa de origem não encontrada.");
  }

  let sector: SectorRecord | null = null;
  let assignedMemberId: string | null = null;
  let assignedMemberName: string | null = null;

  if (targetMemberId) {
    const targetMember = await pool.query(
      `
        SELECT tm.id, tm.name, tm.email
        FROM team_members tm
        WHERE tm.owner_id = $1
          AND tm.id = $2
          AND tm.is_active = true
        LIMIT 1
      `,
      [ownerId, targetMemberId],
    );

    if (!targetMember.rows[0]) {
      throw new Error("Atendente de destino não encontrado.");
    }

    const memberSector = await getMemberSectorForTransfer(ownerId, targetMemberId, {
      preferredSectorId: targetSectorId,
      fallbackSectorId: currentState.sector_id,
    });
    if (!memberSector) {
      throw new Error("O atendente de destino não está vinculado a nenhum setor.");
    }

    const sectorResult = await pool.query(
      `SELECT * FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`,
      [ownerId, memberSector.id],
    );

    sector = (sectorResult.rows[0] || null) as SectorRecord | null;
    assignedMemberId = targetMemberId;
    assignedMemberName = targetMember.rows[0].name;
  } else if (targetSectorId) {
    const sectorResult = await pool.query(
      `SELECT * FROM sectors WHERE owner_id = $1 AND id = $2 LIMIT 1`,
      [ownerId, targetSectorId],
    );

    sector = (sectorResult.rows[0] || null) as SectorRecord | null;
    if (!sector) {
      throw new Error("Setor de destino não encontrado.");
    }

    const member = await pickBestMember(ownerId, sector.id);
    assignedMemberId = member?.member_id || null;
    assignedMemberName = member?.member_name || null;
  } else {
    throw new Error("Destino de encaminhamento não informado.");
  }

  const isChangingSector =
    !!currentState.sector_id &&
    !!sector?.id &&
    currentState.sector_id !== sector.id;

  if (isChangingSector && currentState.has_manual_human_reply_since_handoff) {
    throw new Error(getSectorTransferLockReason(currentState));
  }

  return applyConversationAssignment({
    ownerId,
    conversationId,
    sector,
    assignedMemberId,
    assignedMemberName,
    confidence: 1,
    reason: reason || "Encaminhamento manual.",
    intent: targetMemberId ? "manual_member_transfer" : "manual_sector_transfer",
    routingMethod: targetMemberId ? "manual_member_transfer" : "manual_sector_transfer",
    handedOffBy: actorId,
  });
}

export async function getConversationRoutingSnapshot(ownerId: string, conversationId: string) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.connection_id,
        c.contact_number,
        c.contact_name,
        c.last_message_text,
        c.last_message_time,
        c.last_message_from_me,
        c.unread_count,
        c.is_closed,
        c.followup_active,
        c.sector_id,
        c.assigned_to_member_id,
        c.routing_intent,
        c.routing_confidence,
        c.routing_at,
        c.orchestration_mode,
        c.handoff_reason,
        c.handed_off_at,
        c.handed_off_by,
        EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.from_me = true
            AND COALESCE(m.is_from_agent, false) = false
            AND (c.handed_off_at IS NULL OR m.timestamp >= c.handed_off_at)
        ) AS has_manual_human_reply_since_handoff,
        s.name AS sector_name,
        s.ai_handoff_mode AS sector_ai_handoff_mode,
        COALESCE(s.controlled_handoff_enabled, true) AS sector_controlled_handoff_enabled,
        CASE
          WHEN s.member_reply_scope = 'shared' THEN 'shared'
          ELSE 'assigned_only'
        END AS sector_member_reply_scope,
        tm.name AS assigned_member_name,
        tm.email AS assigned_member_email
      FROM conversations c
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      LEFT JOIN sectors s ON s.id = c.sector_id
      LEFT JOIN team_members tm ON tm.id = c.assigned_to_member_id
      WHERE c.id = $1
        AND wc.user_id = $2
      LIMIT 1
    `,
    [conversationId, ownerId],
  );

  const item = result.rows[0] || null;
  if (!item) {
    return null;
  }

  const canChangeSector =
    !item.sector_id || item.has_manual_human_reply_since_handoff !== true;
  const transferLockReason =
    canChangeSector || !item.sector_id
      ? null
      : getSectorTransferLockReason(item as ConversationTransferState);

  return {
    ...item,
    sector_controlled_handoff_enabled: item.sector_controlled_handoff_enabled !== false,
    sector_member_reply_scope: item.sector_member_reply_scope === "shared" ? "shared" : "assigned_only",
    can_change_sector: canChangeSector,
    canChangeSector,
    transfer_lock_reason: transferLockReason,
    transferLockReason,
  };
}
