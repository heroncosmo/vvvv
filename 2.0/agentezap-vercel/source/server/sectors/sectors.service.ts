import { pool } from "../db";

type SectorRow = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  auto_assign_agent_id: string | null;
  auto_assign_agent_email?: string | null;
};

type QueryResultLike<T = any> = {
  rows: T[];
  rowCount: number;
};

async function queryResult<T = any>(text: string, params: any[] = []): Promise<QueryResultLike<T>> {
  const result = await pool.query(text, params);
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount ?? 0,
  };
}

async function queryRows<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await queryResult<T>(text, params);
  return result.rows;
}

async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await queryRows<T>(text, params);
  return rows[0] || null;
}

function normalizeText(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  for (const keyword of keywords || []) {
    const normalized = normalizeText(keyword);
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}

function detectIntentBySector(message: string, sector: { name: string; keywords: string[] }): { score: number; matches: string[] } {
  const normalizedMessage = normalizeText(message);
  const messageTokens = normalizedMessage.split(/\s+/).filter(Boolean);
  const keywordSet = new Set(normalizeKeywords(sector.keywords || []));

  const matches: string[] = [];
  for (const keyword of keywordSet) {
    if (!keyword) continue;
    if (normalizedMessage.includes(keyword)) {
      matches.push(keyword);
      continue;
    }

    // Match por token exato (evita falso negativo para palavras curtas)
    if (messageTokens.includes(keyword)) {
      matches.push(keyword);
    }
  }

  const score = matches.length === 0
    ? 0
    : Math.min(0.97, 0.55 + (matches.length * 0.1));

  return { score, matches };
}

export async function listSectors(): Promise<SectorRow[]> {
  return queryRows(
    `SELECT s.*, a.email as auto_assign_agent_email
     FROM sectors s
     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text
     ORDER BY s.name ASC`
  );
}

export async function getSectorById(id: string): Promise<SectorRow | null> {
  return queryOne(
    `SELECT s.*, a.email as auto_assign_agent_email
     FROM sectors s
     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text
     WHERE s.id::text = $1::text`,
    [id]
  );
}

export async function createSector(input: {
  name: string;
  description?: string | null;
  keywords?: string[];
  autoAssignAgentId?: string | null;
}): Promise<SectorRow> {
  const keywords = normalizeKeywords(input.keywords || []);
  const result = await queryOne<SectorRow>(
    `INSERT INTO sectors (name, description, keywords, auto_assign_agent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.name.trim(),
      input.description?.trim() || null,
      keywords,
      input.autoAssignAgentId || null,
    ]
  );
  if (!result) throw new Error("Falha ao criar setor.");
  return result;
}

export async function updateSector(id: string, payload: any): Promise<SectorRow> {
  const allowed = ["name", "description", "keywords", "autoAssignAgentId"];
  const updates: string[] = [];
  const values: any[] = [id];
  let idx = 2;

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      const col = key === "autoAssignAgentId" ? "auto_assign_agent_id" : key;
      if (key === "keywords") {
        updates.push(`${col} = $${idx}`);
        values.push(normalizeKeywords(payload[key] || []));
      } else if (key === "name") {
        updates.push(`${col} = $${idx}`);
        values.push(String(payload[key]).trim());
      } else if (key === "description") {
        updates.push(`${col} = $${idx}`);
        values.push(payload[key] ? String(payload[key]).trim() : null);
      } else {
        updates.push(`${col} = $${idx}`);
        values.push(payload[key]);
      }
      idx++;
    }
  }

  if (updates.length === 0) throw new Error("Nenhum campo para atualizar.");

  const result = await queryOne<SectorRow>(
    `UPDATE sectors SET ${updates.join(", ")}, updated_at = NOW() WHERE id::text = $1::text RETURNING *`,
    values
  );
  if (!result) throw new Error("Setor nao encontrado.");
  return result;
}

export async function deleteSector(id: string): Promise<void> {
  await queryRows(`DELETE FROM sectors WHERE id::text = $1::text`, [id]);
}

export async function listAdminAgents(): Promise<Array<{ id: string; email: string; role: string }>> {
  return queryRows(
    `SELECT id::text as id, email, role
     FROM admins
     ORDER BY email ASC`
  );
}

// Sector Members
export async function listSectorMembers(sectorId: string): Promise<Array<{
  id: string;
  sector_id: string;
  member_id: string;
  member_email: string;
  member_name: string;
  member_role: string;
  member_is_active: boolean;
  is_primary: boolean;
  can_receive_tickets: boolean;
  max_open_tickets: number;
  current_open_tickets: number;
  assigned_by: string;
  assigned_at: string;
}>> {
  return queryRows(
    `SELECT
      sm.id::text as id,
      sm.sector_id::text,
      sm.member_id::text,
      tm.email as member_email,
      tm.name as member_name,
      tm.role as member_role,
      tm.is_active as member_is_active,
      sm.is_primary,
      sm.can_receive_tickets,
      sm.max_open_tickets,
      COALESCE(oc.open_count, 0)::int as current_open_tickets,
      sm.assigned_by,
      sm.assigned_at
     FROM sector_members sm
     JOIN team_members tm ON tm.id::text = sm.member_id::text
     LEFT JOIN (
       SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count
       FROM conversations
       WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false
       GROUP BY assigned_to_member_id
     ) oc ON oc.member_id = sm.member_id::text
     WHERE sm.sector_id::text = $1::text
     ORDER BY sm.is_primary DESC, COALESCE(oc.open_count, 0) ASC, sm.assigned_at ASC`,
    [sectorId]
  );
}

export async function addSectorMember(sectorId: string, input: {
  memberId: string;
  isPrimary?: boolean;
  canReceiveTickets?: boolean;
  maxOpenTickets?: number;
  assignedBy?: string;
}): Promise<any> {
  if (input.isPrimary) {
    await queryRows(`UPDATE sector_members SET is_primary = false WHERE sector_id::text = $1::text`, [sectorId]);
  }

  const result = await queryOne(
    `INSERT INTO sector_members (sector_id, member_id, is_primary, can_receive_tickets, max_open_tickets, assigned_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sector_id, member_id)
     DO UPDATE SET
       is_primary = EXCLUDED.is_primary,
       can_receive_tickets = EXCLUDED.can_receive_tickets,
       max_open_tickets = EXCLUDED.max_open_tickets,
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = NOW()
     RETURNING id::text`,
    [
      sectorId,
      input.memberId,
      input.isPrimary ?? false,
      input.canReceiveTickets ?? true,
      input.maxOpenTickets ?? 10,
      input.assignedBy ?? null,
    ]
  );

  if (!result) throw new Error("Falha ao adicionar membro ao setor.");
  const member = await queryOne(
    `SELECT
      sm.id::text as id,
      sm.sector_id::text,
      sm.member_id::text,
      tm.email as member_email,
      tm.name as member_name,
      tm.role as member_role,
      tm.is_active as member_is_active,
      sm.is_primary,
      sm.can_receive_tickets,
      sm.max_open_tickets,
      sm.current_open_tickets,
      sm.assigned_by,
      sm.assigned_at
     FROM sector_members sm
     JOIN team_members tm ON tm.id::text = sm.member_id::text
     WHERE sm.id::text = $1::text`,
    [result.id]
  );

  return member;
}

export async function removeSectorMember(sectorId: string, memberId: string): Promise<void> {
  const result = await queryResult(
    `DELETE FROM sector_members WHERE sector_id::text = $1::text AND member_id::text = $2::text`,
    [sectorId, memberId]
  );

  if (result.rowCount === 0) throw new Error("Membro não encontrado no setor.");
}

export async function updateSectorMember(sectorId: string, memberId: string, input: {
  isPrimary?: boolean;
  canReceiveTickets?: boolean;
  maxOpenTickets?: number;
}): Promise<any> {
  const updates: string[] = [];
  const values: any[] = [sectorId, memberId];
  let idx = 3;

  if (input.isPrimary !== undefined) {
    if (input.isPrimary) {
      await queryRows(`UPDATE sector_members SET is_primary = false WHERE sector_id::text = $1::text`, [sectorId]);
    }
    updates.push(`is_primary = $${idx}`);
    values.push(input.isPrimary);
    idx++;
  }

  if (input.canReceiveTickets !== undefined) {
    updates.push(`can_receive_tickets = $${idx}`);
    values.push(input.canReceiveTickets);
    idx++;
  }

  if (input.maxOpenTickets !== undefined) {
    updates.push(`max_open_tickets = $${idx}`);
    values.push(input.maxOpenTickets);
    idx++;
  }

  if (updates.length === 0) throw new Error("Nenhum campo para atualizar.");

  const result = await queryOne(
    `UPDATE sector_members
     SET ${updates.join(", ")}
     WHERE sector_id::text = $1::text AND member_id::text = $2::text
     RETURNING id::text`,
    values
  );

  if (!result) throw new Error("Membro não encontrado.");

  return queryOne(
    `SELECT
      sm.id::text as id,
      sm.sector_id::text,
      sm.member_id::text,
      tm.email as member_email,
      tm.name as member_name,
      tm.role as member_role,
      tm.is_active as member_is_active,
      sm.is_primary,
      sm.can_receive_tickets,
      sm.max_open_tickets,
      sm.current_open_tickets,
      sm.assigned_by,
      sm.assigned_at
     FROM sector_members sm
     JOIN team_members tm ON tm.id::text = sm.member_id::text
     WHERE sm.id::text = $1::text`,
    [result.id]
  );
}

// Routing
export async function routeConversation(conversationId: string, messageText: string): Promise<{
  sectorId: string;
  sectorName: string;
  assignedMemberId: string;
  assignedMemberName: string;
  method: string;
  confidence: number;
  reason?: string;
}> {
  const sectors = await queryRows<SectorRow>(`SELECT * FROM sectors ORDER BY name ASC`);
  if (sectors.length === 0) {
    throw new Error("Nenhum setor configurado.");
  }

  let selectedSector: SectorRow | null = null;
  let bestConfidence = 0;
  let bestReason = "";

  for (const sector of sectors) {
    const { score, matches } = detectIntentBySector(messageText, { name: sector.name, keywords: sector.keywords || [] });
    if (score > bestConfidence) {
      bestConfidence = score;
      selectedSector = sector;
      bestReason = matches.length
        ? `Match por intenção (${matches.length} keyword(s): ${matches.slice(0, 5).join(", ")})`
        : "Sem match";
    }
  }

  if (!selectedSector || bestConfidence <= 0) {
    selectedSector = await queryOne<SectorRow>(
      `SELECT s.*
       FROM sectors s
       JOIN sector_members sm ON sm.sector_id::text = s.id::text
       JOIN team_members tm ON tm.id::text = sm.member_id::text
       WHERE sm.can_receive_tickets = true AND tm.is_active = true
       GROUP BY s.id
       ORDER BY s.name ASC
       LIMIT 1`
    );
    bestConfidence = 0.35;
    bestReason = "Fallback por disponibilidade";
  }

  if (!selectedSector) {
    throw new Error("Nenhum setor disponível para roteamento.");
  }

  const pickMemberFromSector = async (sectorId: string) => queryOne<{
    member_id: string;
    member_name: string;
    current_load: number;
    max_open_tickets: number;
  }>(
    `SELECT
      sm.member_id::text,
      tm.name as member_name,
      COALESCE(loads.open_count, 0)::int as current_load,
      COALESCE(sm.max_open_tickets, 10)::int as max_open_tickets
     FROM sector_members sm
     JOIN team_members tm ON tm.id::text = sm.member_id::text
     LEFT JOIN (
       SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count
       FROM conversations
       WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false
       GROUP BY assigned_to_member_id
     ) loads ON loads.member_id = sm.member_id::text
     WHERE sm.sector_id::text = $1::text
       AND sm.can_receive_tickets = true
       AND tm.is_active = true
       AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)
     ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC, sm.assigned_at ASC
     LIMIT 1`,
    [sectorId]
  );

  let assignedMember = await pickMemberFromSector(selectedSector.id);

  // Fallback obrigatório: setor sem membro ativo/disponível
  if (!assignedMember) {
    const fallbackSector = await queryOne<SectorRow>(
      `SELECT s.*
       FROM sectors s
       JOIN sector_members sm ON sm.sector_id::text = s.id::text
       JOIN team_members tm ON tm.id::text = sm.member_id::text
       LEFT JOIN (
         SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count
         FROM conversations
         WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false
         GROUP BY assigned_to_member_id
       ) loads ON loads.member_id = sm.member_id::text
       WHERE sm.can_receive_tickets = true
         AND tm.is_active = true
         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)
       GROUP BY s.id
       ORDER BY s.name ASC
       LIMIT 1`
    );

    if (!fallbackSector) {
      throw new Error(`Setor "${selectedSector.name}" sem membros ativos/disponíveis e sem fallback global.`);
    }

    selectedSector = fallbackSector;
    assignedMember = await pickMemberFromSector(selectedSector.id);
    bestReason = `${bestReason} | Fallback para setor com membro disponível`;
    bestConfidence = Math.min(bestConfidence, 0.5);
  }

  if (!assignedMember) {
    throw new Error(`Setor "${selectedSector.name}" não possui membros ativos/disponíveis.`);
  }

  const intent = normalizeText(messageText).split(/\s+/).slice(0, 4).join("_") || "geral";

  await queryRows(
    `UPDATE conversations
     SET sector_id = $1,
         assigned_to_member_id = $2,
         routing_intent = $3,
         routing_confidence = $4,
         routing_at = NOW(),
         updated_at = NOW()
     WHERE id::text = $5::text`,
    [selectedSector.id, assignedMember.member_id, intent, bestConfidence, conversationId]
  );

  await queryRows(
    `INSERT INTO routing_logs (
      conversation_id,
      message_text,
      detected_intent,
      matched_sector_id,
      confidence_score,
      assigned_to_member_id,
      routing_method
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [conversationId, messageText, intent, selectedSector.id, bestConfidence, assignedMember.member_id, "intent+fallback"]
  );

  return {
    sectorId: selectedSector.id,
    sectorName: selectedSector.name,
    assignedMemberId: assignedMember.member_id,
    assignedMemberName: assignedMember.member_name,
    method: "intent+fallback",
    confidence: bestConfidence,
    reason: bestReason,
  };
}

// Reports
export async function getAttendanceReport(startDate: string, endDate: string): Promise<{
  totalConversations: number;
  bySector: Array<{
    sectorId: string;
    sectorName: string;
    assignedCount: number;
    closedCount: number;
    avgOpenTime: number;
  }>;
  byMember: Array<{
    memberId: string;
    memberEmail: string;
    memberName: string;
    assignedCount: number;
    closedCount: number;
    avgOpenTime: number;
  }>;
  totalClosed: number;
  totalOpen: number;
}> {
  const summary = await queryOne<{
    total_conversations: number;
    open_conversations: number;
    closed_conversations: number;
  }>(
    `SELECT
      COUNT(*)::int as total_conversations,
      COUNT(CASE WHEN COALESCE(c.is_closed, false) = false THEN 1 END)::int as open_conversations,
      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_conversations
     FROM conversations c
     WHERE c.routing_at IS NOT NULL
       AND c.routing_at::date BETWEEN $1::date AND $2::date`,
    [startDate, endDate]
  );

  const bySectorRaw = await queryRows<any>(
    `SELECT
      s.id::text as sector_id,
      s.name as sector_name,
      COUNT(c.id)::int as assigned_count,
      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,
      AVG(
        CASE
          WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at))
          ELSE NULL
        END
      ) as avg_open_time_seconds
     FROM sectors s
     LEFT JOIN conversations c
       ON c.sector_id::text = s.id::text
       AND c.routing_at::date BETWEEN $1::date AND $2::date
     GROUP BY s.id, s.name
     ORDER BY assigned_count DESC, s.name ASC`,
    [startDate, endDate]
  );

  const byMemberRaw = await queryRows<any>(
    `SELECT
      tm.id::text as member_id,
      tm.email as member_email,
      tm.name as member_name,
      COUNT(c.id)::int as assigned_count,
      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,
      AVG(
        CASE
          WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at))
          ELSE NULL
        END
      ) as avg_open_time_seconds
     FROM team_members tm
     LEFT JOIN conversations c
       ON c.assigned_to_member_id::text = tm.id::text
       AND c.routing_at::date BETWEEN $1::date AND $2::date
     GROUP BY tm.id, tm.email, tm.name
     ORDER BY assigned_count DESC, tm.name ASC`,
    [startDate, endDate]
  );

  return {
    totalConversations: Number(summary?.total_conversations || 0),
    totalOpen: Number(summary?.open_conversations || 0),
    totalClosed: Number(summary?.closed_conversations || 0),
    bySector: bySectorRaw.map((row) => ({
      sectorId: row.sector_id,
      sectorName: row.sector_name,
      assignedCount: Number(row.assigned_count || 0),
      closedCount: Number(row.closed_count || 0),
      avgOpenTime: Number(row.avg_open_time_seconds || 0),
    })),
    byMember: byMemberRaw.map((row) => ({
      memberId: row.member_id,
      memberEmail: row.member_email,
      memberName: row.member_name,
      assignedCount: Number(row.assigned_count || 0),
      closedCount: Number(row.closed_count || 0),
      avgOpenTime: Number(row.avg_open_time_seconds || 0),
    })),
  };
}

// Ticket closure
export async function closeTicket(conversationId: string, input: {
  closedBy: string;
  closedByName: string;
  reason?: string;
}): Promise<any> {
  const existing = await queryOne<any>(
    `SELECT id::text, COALESCE(is_closed, false) as is_closed FROM conversations WHERE id::text = $1::text`,
    [conversationId]
  );

  if (!existing) throw new Error("Conversa não encontrada.");
  if (existing.is_closed) throw new Error("Conversa já está fechada.");

  const result = await queryOne<any>(
    `UPDATE conversations
     SET is_closed = true,
         closed_at = NOW(),
         closed_by = $1,
         closure_reason = $2,
         updated_at = NOW()
     WHERE id::text = $3::text
     RETURNING *`,
    [input.closedBy, input.reason || null, conversationId]
  );

  await queryRows(
    `INSERT INTO ticket_closure_logs (conversation_id, action, performed_by, performed_by_name, reason)
     VALUES ($1, 'closed', $2, $3, $4)`,
    [conversationId, input.closedBy || "system", input.closedByName || "Sistema", input.reason || null]
  );

  return result;
}

export async function reopenTicket(conversationId: string, input: {
  reopenedBy: string;
  reopenedByName: string;
}): Promise<any> {
  const existing = await queryOne<any>(
    `SELECT id::text, COALESCE(is_closed, false) as is_closed FROM conversations WHERE id::text = $1::text`,
    [conversationId]
  );

  if (!existing) throw new Error("Conversa não encontrada.");
  if (!existing.is_closed) throw new Error("Conversa já está aberta.");

  const result = await queryOne<any>(
    `UPDATE conversations
     SET is_closed = false,
         closed_at = NULL,
         closed_by = NULL,
         closure_reason = NULL,
         updated_at = NOW()
     WHERE id::text = $1::text
     RETURNING *`,
    [conversationId]
  );

  await queryRows(
    `INSERT INTO ticket_closure_logs (conversation_id, action, performed_by, performed_by_name)
     VALUES ($1, 'reopened', $2, $3)`,
    [conversationId, input.reopenedBy || "system", input.reopenedByName || "Sistema"]
  );

  return result;
}

// Bulk actions
export async function bulkToggleAI(conversationIds: string[], disable: boolean, input: {
  performedBy: string;
  performedByName: string;
}): Promise<{ count: number; updated: Array<{ conversationId: string; success: boolean; error?: string }> }> {
  const updated: Array<{ conversationId: string; success: boolean; error?: string }> = [];

  for (const conversationId of conversationIds) {
    try {
      await queryRows(
        `UPDATE conversations
         SET followup_active = $1,
             followup_disabled_reason = $2,
             updated_at = NOW()
         WHERE id::text = $3::text`,
        [!disable, disable ? `IA desativada por ${input.performedByName}` : null, conversationId]
      );

      updated.push({ conversationId, success: true });
    } catch (error) {
      updated.push({
        conversationId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  await queryRows(
    `INSERT INTO bulk_actions_log (action_type, performed_by, performed_by_name, affected_conversations, conversation_ids, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [disable ? "disable_ai" : "enable_ai", input.performedBy || "system", input.performedByName || "Sistema", conversationIds.length, conversationIds, JSON.stringify({ disable })]
  );

  return {
    count: conversationIds.length,
    updated,
  };
}

// Scheduled messages
export async function createScheduledMessage(input: {
  conversationId: string;
  messageText: string;
  messageType?: string;
  aiPrompt?: string;
  scheduledAt: string;
  timezone?: string;
  createdBy: string;
  createdByName: string;
}): Promise<any> {
  const conversation = await queryOne<{ connection_id: string }>(
    `SELECT connection_id::text FROM conversations WHERE id::text = $1::text`,
    [input.conversationId]
  );

  if (!conversation?.connection_id) {
    throw new Error("Conversa inválida para agendamento (connection_id não encontrado).");
  }

  const result = await queryOne(
    `INSERT INTO scheduled_messages (
      conversation_id,
      connection_id,
      message_text,
      message_type,
      ai_prompt,
      scheduled_at,
      timezone,
      created_by,
      created_by_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      input.conversationId,
      conversation.connection_id,
      input.messageText,
      input.messageType || "text",
      input.aiPrompt || null,
      input.scheduledAt,
      input.timezone || "America/Sao_Paulo",
      input.createdBy,
      input.createdByName,
    ]
  );

  if (!result) throw new Error("Falha ao criar mensagem agendada.");
  return result;
}

export async function listScheduledMessages(input: {
  conversationId?: string;
  status?: string;
}): Promise<Array<{
  id: string;
  conversation_id: string;
  message_text: string;
  message_type: string;
  ai_prompt: string | null;
  scheduled_at: string;
  timezone: string;
  created_by: string;
  created_by_name: string;
  status: string;
  created_at: string;
}>> {
  const params: any[] = [];
  const where: string[] = ["1=1"];

  if (input.conversationId) {
    params.push(input.conversationId);
    where.push(`conversation_id::text = $${params.length}::text`);
  }

  if (input.status) {
    params.push(input.status);
    where.push(`status = $${params.length}`);
  }

  const sql = `SELECT * FROM scheduled_messages WHERE ${where.join(" AND ")} ORDER BY scheduled_at ASC`;
  return queryRows(sql, params);
}

export async function cancelScheduledMessage(id: string): Promise<void> {
  const result = await queryResult(`UPDATE scheduled_messages SET status = 'cancelled', updated_at = NOW() WHERE id::text = $1::text`, [id]);
  if (result.rowCount === 0) throw new Error("Mensagem agendada não encontrada.");
}

// AI message generation
export async function generateAIMessage(prompt: string, _conversationId?: string): Promise<{
  message: string;
  aiGenerated: boolean;
}> {
  return {
    message: `AI: ${prompt}`,
    aiGenerated: true,
  };
}
