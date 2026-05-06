import type { Express, Request, Response } from "express";
import { isAdmin } from "./supabaseAuth";
import { db } from "./db";
import { memoryCache, storage } from "./storage";
import { adminConversations, followupLogs, systemConfig } from "@shared/schema";
import { eq, and, gte, desc, sql, asc } from "drizzle-orm";
import { followUpService } from "./followUpService";
import {
  migrateUserFollowupLogsToAdmin,
  migrateUserFollowupsToAdmin,
  repairAdminFailedFollowupRetries,
} from "./adminFollowupMigrationService";
import { sanitizeAdminFollowupConfig } from "./adminMessagingFeaturePolicy";
import {
  BRAZIL_UTC_OFFSET,
  getBrazilWallClockNow,
  parseBrazilWallClockDateTime,
  serializeBrazilWallClockDateTime,
} from "./brazilWallClock";

// ============================================================================
// HELPERS PARA CONFIGURAÇÃO GLOBAL DE FOLLOW-UP (systemConfig)
// ============================================================================

const GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_NOW_SQL = sql.raw(`(NOW() AT TIME ZONE '${BRAZIL_TIME_ZONE}')`);
const BRAZIL_DAY_START_SQL = sql.raw(`DATE_TRUNC('day', NOW() AT TIME ZONE '${BRAZIL_TIME_ZONE}')`);
const BRAZIL_DAY_END_SQL = sql.raw(`DATE_TRUNC('day', NOW() AT TIME ZONE '${BRAZIL_TIME_ZONE}') + INTERVAL '1 day'`);

const DEFAULT_GLOBAL_FOLLOWUP_CONFIG = {
  id: "global",
  userId: "admin",
  isEnabled: false,
  // Toggle follow-up para não pagantes
  followupNonPayersEnabled: false,
  maxAttempts: 8,
  intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  respectBusinessHours: true,
  tone: "friendly",
  formalityLevel: 3,
  useEmojis: true,
  importantInfo: [],
  infiniteLoop: true,
  infiniteLoopMinDays: 15,   // Periodicidade mínima configurável
  infiniteLoopMaxDays: 30,   // Periodicidade máxima configurável
};

async function getGlobalFollowupConfig() {
  try {
    const row = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });
    if (row?.valor) {
      const saved = JSON.parse(row.valor);
      return sanitizeAdminFollowupConfig({ ...DEFAULT_GLOBAL_FOLLOWUP_CONFIG, ...saved });
    }
  } catch (_) {}
  return sanitizeAdminFollowupConfig(DEFAULT_GLOBAL_FOLLOWUP_CONFIG);
}

async function saveGlobalFollowupConfig(data: Record<string, any>) {
  const merged = sanitizeAdminFollowupConfig({ ...DEFAULT_GLOBAL_FOLLOWUP_CONFIG, ...data });
  const valor = JSON.stringify(merged);
  // Upsert via insert + conflict update
  try {
    const existing = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });
    if (existing) {
      await db.update(systemConfig)
        .set({ valor, updatedAt: new Date() })
        .where(eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY));
    } else {
      await db.insert(systemConfig).values({
        chave: GLOBAL_FOLLOWUP_CONFIG_KEY,
        valor,
      });
    }
  } catch (err) {
    console.error("[ADMIN FOLLOWUP CONFIG] Erro ao salvar config global:", err);
    throw err;
  }
  return merged;
}

function getBrazilNowDate() {
  return getBrazilWallClockNow();
}

function toBrazilDateTimeString(value?: Date | string | null) {
  return serializeBrazilWallClockDateTime(value);
}

function isDueInBrazil(value?: Date | string | null) {
  const parsed = parseBrazilWallClockDateTime(value);
  if (!parsed) {
    return false;
  }

  return parsed <= getBrazilNowDate();
}

// ============================================================================
// ROTAS DE FOLLOW-UP DO ADMIN (CONFIGURAÇÃO GLOBAL)
// ============================================================================

export function registerAdminFollowUpRoutes(app: Express) {
  const invalidateAdminFollowUpDashboardCaches = (adminId: string) => {
    memoryCache.invalidate(`followup:admin:stats:${adminId}`);
    memoryCache.invalidate(`followup:admin:pending:${adminId}`);
    memoryCache.invalidate(`followup:admin:agenda:${adminId}`);
    memoryCache.invalidate(`followup:admin:logs:${adminId}`);
  };

  // ==================== CONFIGURAÇÃO GLOBAL ====================

  /**
   * GET /api/admin/followup/config
   * Buscar configuração global de follow-up do admin (persiste no banco)
   */
  app.get("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const config = await getGlobalFollowupConfig();
      res.json(config);
    } catch (error: any) {
      console.error("Erro ao buscar config de follow-up do admin:", error);
      res.status(500).json({ message: "Erro ao buscar configuração" });
    }
  });

  /**
   * PUT /api/admin/followup/config
   * Atualizar configuração global de follow-up (persiste no banco)
   */
  app.put("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const incoming = req.body;

      // Validar periodicidade
      if (incoming.infiniteLoopMinDays !== undefined) {
        const min = Number(incoming.infiniteLoopMinDays);
        if (isNaN(min) || min < 1 || min > 365) {
          return res.status(400).json({ message: "infiniteLoopMinDays deve ser entre 1 e 365" });
        }
        incoming.infiniteLoopMinDays = min;
      }
      if (incoming.infiniteLoopMaxDays !== undefined) {
        const max = Number(incoming.infiniteLoopMaxDays);
        if (isNaN(max) || max < 1 || max > 365) {
          return res.status(400).json({ message: "infiniteLoopMaxDays deve ser entre 1 e 365" });
        }
        incoming.infiniteLoopMaxDays = max;
      }
      if (
        incoming.infiniteLoopMinDays !== undefined &&
        incoming.infiniteLoopMaxDays !== undefined &&
        incoming.infiniteLoopMinDays > incoming.infiniteLoopMaxDays
      ) {
        return res.status(400).json({ message: "infiniteLoopMinDays não pode ser maior que infiniteLoopMaxDays" });
      }

      const saved = await saveGlobalFollowupConfig(incoming);
      console.log(`[ADMIN] Config de follow-up global atualizada por admin ${adminId}`);
      if (adminId) {
        invalidateAdminFollowUpDashboardCaches(adminId);
      }

      res.json({
        success: true,
        message: "Configuração atualizada com sucesso",
        config: saved,
      });
    } catch (error: any) {
      console.error("Erro ao atualizar config de follow-up do admin:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração" });
    }
  });

  // ==================== ESTATÍSTICAS GERAIS ====================

  /**
   * GET /api/admin/followup/stats
   * Estatísticas gerais de follow-up de todas as conversas
   */
  app.get("/api/admin/followup/stats", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }

      const stats = await memoryCache.getOrCompute(`followup:admin:stats:${adminId}`, async () => {
        const [statusCounts, conversationStats, nonPayerStats] = await Promise.all([
          db.execute(sql`
            SELECT fl.status, COUNT(*)::int AS count
            FROM followup_logs fl
            INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id
            WHERE ac.admin_id = ${adminId}
            GROUP BY fl.status
          `),
          db.execute(sql`
            SELECT
              COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at <= ${BRAZIL_NOW_SQL} THEN 1 END)::int AS pending,
              COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at >= ${BRAZIL_DAY_START_SQL} AND next_followup_at < ${BRAZIL_DAY_END_SQL} THEN 1 END)::int AS scheduled_today
            FROM admin_conversations
            WHERE admin_id = ${adminId}
          `),
          db.execute(sql`
            SELECT
              COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid,
              COUNT(CASE WHEN payment_status = 'unpaid' AND followup_for_non_payers = true THEN 1 END)::int AS unpaid_followups_enabled
            FROM admin_conversations
            WHERE admin_id = ${adminId}
          `),
        ]);

        const statsByStatus: Record<string, number> = {};
        for (const row of statusCounts.rows as any[]) {
          statsByStatus[row.status] = Number(row.count) || 0;
        }

        const convRow = (conversationStats.rows[0] as any) || {};
        const nonPayerRow = (nonPayerStats.rows[0] as any) || {};

        return {
          totalSent: statsByStatus.sent || 0,
          totalFailed: statsByStatus.failed || 0,
          totalCancelled: statsByStatus.cancelled || 0,
          totalSkipped: statsByStatus.skipped || 0,
          pending: Number(convRow.pending) || 0,
          scheduledToday: Number(convRow.scheduled_today) || 0,
          unpaid: Number(nonPayerRow.unpaid) || 0,
          unpaidFollowupsEnabled: Number(nonPayerRow.unpaid_followups_enabled) || 0,
        };
      }, 30000);

      res.json(stats);
    } catch (error: any) {
      console.error("Erro ao buscar estatísticas de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar estatísticas" });
    }
  });

  // ==================== LOGS DE FOLLOW-UP ====================

  /**
   * GET /api/admin/followup/logs
   * Logs de follow-up de todas as conversas
   */
  app.get("/api/admin/followup/logs", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const limit = parseInt(req.query.limit as string) || 200;
      const status = req.query.status as string | undefined;

      const rows = await memoryCache.getOrCompute(`followup:admin:logs:${adminId}:status:${status || "all"}:limit:${limit}`, async () => {
        const result = await db.execute(sql`
          SELECT
            fl.id,
            fl.conversation_id AS "conversationId",
            fl.contact_number AS "contactNumber",
            ac.contact_name AS "contactName",
            fl.status,
            fl.message_content AS "messageContent",
            fl.stage,
            to_char(fl.executed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || ${BRAZIL_UTC_OFFSET} AS "executedAt",
            fl.error_reason AS "errorReason",
            fl.followup_type AS "followupType",
            fl.payment_status AS "paymentStatus",
            CASE
              WHEN fl.scheduled_for IS NULL THEN NULL
              ELSE to_char(fl.scheduled_for, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || ${BRAZIL_UTC_OFFSET}
            END AS "scheduledFor"
          FROM followup_logs fl
          INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id
          WHERE ac.admin_id = ${adminId}
          ${status ? sql`AND fl.status = ${status}` : sql``}
          ORDER BY fl.executed_at DESC, fl.id DESC
          LIMIT ${limit}
        `);

        return result.rows;
      }, 60000);

      res.json(rows);
    } catch (error: any) {
      console.error("Erro ao buscar logs de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar logs" });
    }
  });

  // ==================== PENDENTES ====================

  /**
   * GET /api/admin/followup/pending
   * Lista conversas com follow-up pendente
   */
  app.get("/api/admin/followup/pending", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }

      const pending = await memoryCache.getOrCompute(`followup:admin:pending:${adminId}`, () => db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.adminId, adminId),
          eq(adminConversations.followupActive, true),
          sql`${adminConversations.nextFollowupAt} IS NOT NULL`,
          sql`${adminConversations.nextFollowupAt} <= ${BRAZIL_NOW_SQL}`
        ),
        orderBy: [asc(adminConversations.nextFollowupAt)],
        limit: 100
      }), 30000);

      // Mapear para o formato esperado pelo UI
      const formatted = pending.map(conv => ({
        id: conv.id,
        contactNumber: conv.contactNumber || "",
        contactName: conv.contactName || null,
        stage: conv.followupStage || 0,
        nextFollowupAt: toBrazilDateTimeString(conv.nextFollowupAt) || "",
        lastMessageText: conv.lastMessageText || null,
        lastMessageTime: toBrazilDateTimeString(conv.lastMessageTime) || null,
        note: null, // followupDisabledReason not available in adminConversations
        // 🛡️ FOLLOW-UP FOR NON-PAYERS
        paymentStatus: conv.paymentStatus || 'pending',
        followupForNonPayers: conv.followupForNonPayers ?? true,
        followupConfig: conv.followupConfig
      }));

      res.json(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar follow-ups pendentes:", error);
      res.status(500).json({ message: "Erro ao buscar pendentes" });
    }
  });

  /**
   * GET /api/admin/followup/agenda
   * Lista toda a agenda ativa do admin, incluindo follow-ups futuros e vencidos
   */
  app.get("/api/admin/followup/agenda", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }

      const limit = parseInt(req.query.limit as string) || 500;
      const agenda = await memoryCache.getOrCompute(`followup:admin:agenda:${adminId}:limit:${limit}`, () => db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.adminId, adminId),
          eq(adminConversations.followupActive, true),
          sql`${adminConversations.nextFollowupAt} IS NOT NULL`
        ),
        orderBy: [asc(adminConversations.nextFollowupAt)],
        limit,
      }), 45000);

      const formatted = agenda.map(conv => ({
        id: conv.id,
        conversationId: conv.id,
        contactNumber: conv.contactNumber || "",
        contactName: conv.contactName || null,
        stage: conv.followupStage || 0,
        nextFollowupAt: toBrazilDateTimeString(conv.nextFollowupAt) || "",
        status: isDueInBrazil(conv.nextFollowupAt) ? "pending" : "scheduled",
        paymentStatus: conv.paymentStatus || "pending",
        followupForNonPayers: conv.followupForNonPayers ?? true,
        followupConfig: conv.followupConfig,
      }));

      res.json(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar agenda de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar agenda" });
    }
  });

  // ==================== CONTROLE POR CONVERSA ====================

  /**
   * POST /api/admin/followup/conversation/:id/toggle
   * Ativar/Desativar follow-up para uma conversa específica
   */
  app.post("/api/admin/followup/conversation/:id/toggle", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;
      const { active } = req.body;

      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: "active (boolean) é obrigatório" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (active) {
        await storage.toggleAdminConversationFollowup(id, true, {
          manual: true,
          resetToStageZero: true,
        });

        const activationResult = await followUpService.scheduleInitialFollowUp(id, { allowManualResume: true });

        if (activationResult?.active === false) {
          return res.status(409).json({
            success: false,
            active: false,
            message: "Follow-up já está priorizado em rodrigo4@gmail.com para este cliente",
            disabledReason: activationResult.blockedReason || null,
          });
        }

        console.log(`[ADMIN] Follow-up ATIVADO para conversa ${id}`);
      } else {
        await storage.toggleAdminConversationFollowup(id, false, {
          manual: true,
          resetToStageZero: false,
        });

        console.log(`[ADMIN] Follow-up DESATIVADO para conversa ${id}`);
      }

      invalidateAdminFollowUpDashboardCaches(adminId);
      res.json({ success: true, active });
    } catch (error: any) {
      console.error("Erro ao alternar follow-up:", error);
      res.status(500).json({ message: "Erro ao alternar follow-up" });
    }
  });

  /**
   * GET /api/admin/followup/conversation/:id/status
   * Verificar status do follow-up de uma conversa
   */
  app.get("/api/admin/followup/conversation/:id/status", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      res.json({
        active: conversation.followupActive,
        stage: conversation.followupStage,
        nextFollowupAt: conversation.nextFollowupAt,
        disabledReason: conversation.followupDisabledReason || null,
        // 🛡️ FOLLOW-UP FOR NON-PAYERS
        paymentStatus: conversation.paymentStatus || 'pending',
        followupForNonPayers: conversation.followupForNonPayers ?? true,
        followupConfig: conversation.followupConfig
      });
    } catch (error: any) {
      console.error("Erro ao buscar status de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/reset
   * Resetar ciclo de follow-up
   */
  app.post("/api/admin/followup/conversation/:id/reset", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      await storage.toggleAdminConversationFollowup(id, true, {
        manual: true,
        resetToStageZero: true,
      });

      const activationResult = await followUpService.scheduleInitialFollowUp(id, {
        forceRestart: true,
        allowManualResume: true,
      });

      if (activationResult?.active === false) {
        return res.status(409).json({
          success: false,
          message: "Follow-up já está priorizado em rodrigo4@gmail.com para este cliente",
          disabledReason: activationResult.blockedReason || null,
        });
      }

      console.log(`[ADMIN] Ciclo de follow-up resetado para conversa ${id}`);

      res.json({ success: true, message: "Ciclo de follow-up resetado" });
    } catch (error: any) {
      console.error("Erro ao resetar follow-up:", error);
      res.status(500).json({ message: "Erro ao resetar follow-up" });
    }
  });

  // ==================== 🛡️ FOLLOW-UP FOR NON-PAYERS ====================

  /**
   * POST /api/admin/followup/conversation/:id/update-payment-status
   * Atualizar status de pagamento de uma conversa
   */
  app.post("/api/admin/followup/conversation/:id/update-payment-status", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;
      const { paymentStatus } = req.body;

      // Validação
      const validStatuses = ['paid', 'unpaid', 'pending'];
      if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Atualizar status de pagamento
      await db.update(adminConversations)
        .set({
          paymentStatus,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Status de pagamento atualizado para ${paymentStatus} em conversa ${id}`);

      res.json({
        success: true,
        paymentStatus,
        message: "Status de pagamento atualizado com sucesso"
      });
    } catch (error: any) {
      console.error("Erro ao atualizar status de pagamento:", error);
      res.status(500).json({ message: "Erro ao atualizar status de pagamento" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/toggle-non-payer-followup
   * Ativar/Desativar follow-up para não pagantes
   */
  app.post("/api/admin/followup/conversation/:id/toggle-non-payer-followup", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled (boolean) é obrigatório" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Atualizar toggle de follow-up para não pagantes
      await db.update(adminConversations)
        .set({
          followupForNonPayers: enabled,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Follow-up para não pagantes ${enabled ? 'ATIVADO' : 'DESATIVADO'} para conversa ${id}`);

      res.json({
        success: true,
        followupForNonPayers: enabled,
        message: `Follow-up para não pagantes ${enabled ? 'ativado' : 'desativado'} com sucesso`
      });
    } catch (error: any) {
      console.error("Erro ao alternar follow-up para não pagantes:", error);
      res.status(500).json({ message: "Erro ao alternar follow-up para não pagantes" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/update-config
   * Atualizar configuração de follow-up para uma conversa
   */
  app.post("/api/admin/followup/conversation/:id/update-config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;
      const config = req.body;

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Validar configuração
      const validStatuses = ['paid', 'unpaid', 'pending'];
      if (config.paymentStatus && !validStatuses.includes(config.paymentStatus)) {
        return res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" });
      }

      // Atualizar configuração
      await db.update(adminConversations)
        .set({
          ...config,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Configuração de follow-up atualizada para conversa ${id}`);

      res.json({
        success: true,
        message: "Configuração de follow-up atualizada com sucesso",
        config
      });
    } catch (error: any) {
      console.error("Erro ao atualizar configuração de follow-up:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração de follow-up" });
    }
  });

  // ==================== AGENDAMENTO DE MENSAGENS COM IA ====================

  /**
   * POST /api/admin/followup/conversation/:id/schedule-message
   * Agendar uma mensagem para ser enviada em uma data específica
   * Suporta texto manual ou gerado com IA
   */
  app.post("/api/admin/followup/conversation/:id/schedule-message", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;
      const { scheduledFor, text, useAI, note } = req.body;

      // Validação
      if (!scheduledFor) {
        return res.status(400).json({ message: "scheduledFor (data/hora) é obrigatório" });
      }

      if (!text) {
        return res.status(400).json({ message: "text é obrigatório" });
      }

      const parsedScheduledFor = parseBrazilWallClockDateTime(scheduledFor);
      if (!parsedScheduledFor) {
        return res.status(400).json({ message: "Data inválida" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Criar registro de mensagem agendada
      const scheduledMessage = {
        conversationId: id,
        scheduledFor: parsedScheduledFor,
        text,
        useAI,
        note: note || null,
        createdBy: adminId,
        createdAt: new Date(),
        status: 'scheduled' // scheduled, sent, failed
      };

      // Inserir no banco
      // Precisamos criar uma tabela para mensagens agendadas
      // Por enquanto, vamos usar a tabela followupLogs como placeholder
      const log = await db.insert(followupLogs).values({
        conversationId: id,
        contactNumber: conversation.contactNumber || "",
        messageContent: text,
        scheduledFor: parsedScheduledFor,
        executedAt: null, // Ainda não executado
        status: 'scheduled'
      }).returning();

      console.log(`[ADMIN] Mensagem agendada para conversa ${id} em ${scheduledFor}`);
      console.log(`  Texto: ${text.substring(0, 50)}...`);
      console.log(`  IA: ${useAI ? 'sim' : 'não'}`);

      res.json({
        success: true,
        messageId: log[0].id,
        scheduledFor: serializeBrazilWallClockDateTime(log[0].scheduledFor)
      });
    } catch (error: any) {
      console.error("Erro ao agendar mensagem:", error);
      res.status(500).json({ message: "Erro ao agendar mensagem" });
    }
  });

  /**
   * GET /api/admin/followup/conversation/:id/scheduled-messages
   * Buscar mensagens agendadas para uma conversa
   */
  app.get("/api/admin/followup/conversation/:id/scheduled-messages", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      const messages = await db.query.followupLogs.findMany({
        where: and(
          eq(followupLogs.conversationId, id),
          eq(followupLogs.status, 'scheduled')
        ),
        orderBy: [asc(followupLogs.scheduledFor)]
      });

      res.json(messages);
    } catch (error: any) {
      console.error("Erro ao buscar mensagens agendadas:", error);
      res.status(500).json({ message: "Erro ao buscar mensagens agendadas" });
    }
  });

  /**
   * DELETE /api/admin/followup/conversation/:id/scheduled-messages/:messageId
   * Cancelar mensagem agendada
   */
  app.delete("/api/admin/followup/conversation/:id/scheduled-messages/:messageId", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }
      const { id, messageId } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: and(
          eq(adminConversations.id, id),
          eq(adminConversations.adminId, adminId)
        )
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Atualizar status para cancelled
      await db.update(followupLogs)
        .set({ status: 'cancelled' })
        .where(and(
          eq(followupLogs.id, messageId),
          eq(followupLogs.conversationId, id)
        ));

      console.log(`[ADMIN] Mensagem agendada ${messageId} cancelada`);

      res.json({ success: true, message: "Mensagem agendada cancelada" });
    } catch (error: any) {
      console.error("Erro ao cancelar mensagem agendada:", error);
      res.status(500).json({ message: "Erro ao cancelar mensagem agendada" });
    }
  });

  /**
   * POST /api/admin/followup/reorganize
   * Recalcula a agenda preservando estágio e baseando-se no último envio já feito
   */
  app.post("/api/admin/followup/reorganize", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }

      const result = await followUpService.reorganizeAllFollowups(adminId);
      invalidateAdminFollowUpDashboardCaches(adminId);
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("Erro ao reorganizar follow-ups do admin:", error);
      res.status(500).json({ message: "Erro ao reorganizar follow-ups" });
    }
  });

  app.post("/api/admin/followup/migrate-user", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { sourceEmail, sourceUserId, includeLogs = true, repairFailed = true } = req.body || {};

      if (!adminId) {
        return res.status(401).json({ message: "Admin não autenticado" });
      }

      if (!sourceEmail && !sourceUserId) {
        return res.status(400).json({ message: "sourceEmail ou sourceUserId é obrigatório" });
      }

      const result = await migrateUserFollowupsToAdmin({
        adminId,
        sourceEmail,
        sourceUserId,
      });

      const logsResult = includeLogs === false
        ? null
        : await migrateUserFollowupLogsToAdmin({
            adminId,
            sourceEmail,
            sourceUserId,
          });

      const repairResult = repairFailed === false
        ? null
        : await repairAdminFailedFollowupRetries({ adminId });

      console.log(`[ADMIN FOLLOW-UP] Migração concluída para admin ${adminId}`, { result, logsResult, repairResult });
      res.json({ success: true, result, logsResult, repairResult });
    } catch (error: any) {
      console.error("Erro ao migrar follow-ups para o admin:", error);
      res.status(500).json({ message: error?.message || "Erro ao migrar follow-ups" });
    }
  });

  console.log("✅ [ADMIN FOLLOW-UP] Rotas registradas");
}
