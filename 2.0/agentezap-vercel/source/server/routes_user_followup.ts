import { Express, Request, Response } from "express";
import { isAuthenticated } from "./supabaseAuth";
import { userFollowUpService } from "./userFollowUpService";
import { followupConfigSchema } from "@shared/schema";
import { db } from "./db";
import { conversations, followupConfigs, userFollowupLogs, conversationScheduledMessages } from "@shared/schema";
import { eq, and, asc, gte } from "drizzle-orm";
import { memoryCache, storage } from "./storage";
import { getOutboundAnalytics } from "./outboundAnalyticsService";
import {
  getBrazilWallClockNow,
  parseBrazilWallClockDateTime,
  serializeBrazilWallClockDateTime,
} from "./brazilWallClock";

function isGroupConversationRecord(
  conversation: { remoteJid?: string | null; jidSuffix?: string | null } | null | undefined,
) {
  return Boolean(
    conversation?.jidSuffix === "g.us" ||
      String(conversation?.remoteJid || "").trim().endsWith("@g.us"),
  );
}

function normalizeFollowUpReason(value: unknown): string {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildManualFollowUpBlockedMessage(reason: unknown): string | null {
  const normalized = normalizeFollowUpReason(reason);
  if (!normalized) return null;

  if (normalized.includes("cliente foi o ultimo") || normalized.includes("aguardar resposta da empresa")) {
    return "Não enviei porque o cliente foi o último a falar. O follow-up volta a contar depois de uma resposta da empresa.";
  }
  if (normalized.includes("primeira resposta")) {
    return "Nao enviei porque o cliente ainda nao respondeu nesta conversa.";
  }
  if (normalized.includes("duplicad")) {
    return "Não enviei para evitar duplicidade. Use a conversa principal desse contato.";
  }
  if (normalized.includes("lista de exclusao")) {
    return "Não enviei porque esse número está protegido pela lista de exclusão.";
  }
  if (normalized.includes("conexao") || normalized.includes("whatsapp")) {
    return "A linha desta conversa ainda não está pronta para envio. Reconecte o WhatsApp e tente novamente.";
  }

  return null;
}

function buildManualFollowUpLogMessage(log: any): string {
  const reason = log?.errorReason || log?.aiDecision?.reason || "";
  const blockedMessage = buildManualFollowUpBlockedMessage(reason);
  if (blockedMessage) return blockedMessage;
  return String(reason || "Nenhuma mensagem saiu agora. Confira se o Follow-up Inteligente está ativo e se a conversa está em uma linha conectada.");
}

// ============================================================================
// ROTAS DO FOLLOW-UP INTELIGENTE
// ============================================================================

export function registerFollowUpRoutes(app: Express) {
  const invalidateFollowUpDashboardCaches = (userId: string) => {
    memoryCache.invalidate(`followup:user:stats:${userId}`);
    memoryCache.invalidate(`followup:user:pending:${userId}`);
    memoryCache.invalidate(`followup:user:analytics:${userId}`);
    memoryCache.invalidate(`followup:user:logs:${userId}`);
  };
  const isGlobalFollowUpEnabledForUser = async (userId: string) => {
    const config = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId),
    });
    return config?.isEnabled === true;
  };
  
  // ==================== CONFIGURAÇÃO ====================
  
  /**
   * GET /api/followup/config
   * Buscar configuração de follow-up do usuário
   */
  app.get("/api/followup/config", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const config = await userFollowUpService.getFollowupConfig(userId);
      res.json(config);
    } catch (error: any) {
      console.error("Erro ao buscar config de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar configuração" });
    }
  });

  /**
   * PUT /api/followup/config
   * Atualizar configuração de follow-up
   */
  app.put("/api/followup/config", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validar dados
      const validationResult = followupConfigSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dados inválidos",
          errors: validationResult.error.errors 
        });
      }

      const updated = await userFollowUpService.updateFollowupConfig(userId, validationResult.data);
      invalidateFollowUpDashboardCaches(userId);
      res.json(updated);
    } catch (error: any) {
      console.error("Erro ao atualizar config de follow-up:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração" });
    }
  });

  // ==================== CONTROLE POR CONVERSA ====================

  /**
   * POST /api/followup/conversation/:id/toggle
   * Ativar/Desativar follow-up para uma conversa específica
   */
  app.post("/api/followup/conversation/:id/toggle", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const { active, reason } = req.body;

      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: "active (boolean) é obrigatório" });
      }

      // Verificar se a conversa pertence ao usuário
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { connection: true }
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.connection?.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.status(400).json({
          message: "Follow-up automático não está disponível para grupos.",
        });
      }

      if (active) {
        if (!await isGlobalFollowUpEnabledForUser(userId)) {
          await userFollowUpService.disableFollowUp(id, "Usuario desativou follow-up global");
          invalidateFollowUpDashboardCaches(userId);
          return res.status(409).json({
            success: false,
            active: false,
            message: "O Follow-up Inteligente esta desligado nesta conta.",
          });
        }
        await userFollowUpService.enableFollowUp(id);
      } else {
        await userFollowUpService.disableFollowUp(id, reason || "Desativado pelo usuário");
      }

      invalidateFollowUpDashboardCaches(userId);
      res.json({ success: true, active });
    } catch (error: any) {
      console.error("Erro ao alternar follow-up:", error);
      res.status(500).json({ message: "Erro ao alternar follow-up" });
    }
  });

  /**
   * GET /api/followup/conversation/:id/status
   * Verificar status do follow-up de uma conversa
   */
  app.get("/api/followup/conversation/:id/status", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { connection: true }
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.connection?.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.json({
          active: false,
          stage: 0,
          nextFollowupAt: null,
          disabledReason: "Follow-up automático não está disponível para grupos.",
        });
      }

      if (!await isGlobalFollowUpEnabledForUser(userId)) {
        return res.json({
          active: false,
          stage: conversation.followupStage,
          nextFollowupAt: null,
          disabledReason: "O Follow-up Inteligente esta desligado nesta conta.",
        });
      }

      res.json({
        active: conversation.followupActive,
        stage: conversation.followupStage,
        nextFollowupAt: serializeBrazilWallClockDateTime(conversation.nextFollowupAt),
        disabledReason: conversation.followupDisabledReason
      });
    } catch (error: any) {
      console.error("Erro ao buscar status de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  // ==================== ESTATÍSTICAS E LOGS ====================

  /**
   * GET /api/followup/stats
   * Estatísticas gerais de follow-up do usuário
   */
  app.get("/api/followup/stats", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await memoryCache.getOrCompute(
        `followup:user:stats:${userId}`,
        () => userFollowUpService.getFollowUpStats(userId),
        30000,
      );
      res.json(stats);
    } catch (error: any) {
      console.error("Erro ao buscar estatísticas de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar estatísticas" });
    }
  });

  /**
   * GET /api/followup/analytics
   * Estado diário do orquestrador de saída e anti-ban do usuário
   */
  app.get("/api/followup/analytics", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await memoryCache.getOrCompute(
        `followup:user:analytics:${userId}`,
        () => getOutboundAnalytics(userId),
        20000,
      );
      res.json(analytics);
    } catch (error: any) {
      console.error("Erro ao buscar analytics de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar analytics" });
    }
  });

  /**
   * GET /api/followup/logs
   * Logs de follow-up do usuário
   */
  app.get("/api/followup/logs", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await memoryCache.getOrCompute(
        `followup:user:logs:${userId}:limit:${limit}`,
        () => userFollowUpService.getFollowUpLogs(userId, limit),
        30000,
      );
      res.json(logs);
    } catch (error: any) {
      console.error("Erro ao buscar logs de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar logs" });
    }
  });

  /**
   * GET /api/followup/pending
   * Lista conversas com follow-up pendente
   */
  app.get("/api/followup/pending", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const pending = await memoryCache.getOrCompute(
        `followup:user:pending:${userId}`,
        () => userFollowUpService.getPendingFollowUps(userId),
        30000,
      );
      
      res.json(pending.map(conv => ({
        id: conv.id,
        contactNumber: conv.contactNumber,
        contactName: conv.contactName,
        stage: conv.followupStage,
        nextFollowupAt: serializeBrazilWallClockDateTime(conv.nextFollowupAt),
        lastMessageText: conv.lastMessageText,
        lastMessageTime: conv.lastMessageTime,
        note: conv.followupDisabledReason || null
      })));
    } catch (error: any) {
      console.error("Erro ao buscar follow-ups pendentes:", error);
      res.status(500).json({ message: "Erro ao buscar pendentes" });
    }
  });

  // ==================== AÇÕES MANUAIS ====================

  /**
   * POST /api/followup/conversation/:id/trigger
   * Disparar follow-up manualmente (para testes)
   */
  app.post("/api/followup/conversation/:id/trigger", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const startedAt = new Date(Date.now() - 1000);

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { connection: true }
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.connection?.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.status(400).json({
          success: false,
          message: "Follow-up automático não está disponível para grupos.",
        });
      }

      const config = await db.query.followupConfigs.findFirst({
        where: eq(followupConfigs.userId, userId),
      });
      if (!config?.isEnabled) {
        return res.status(409).json({
          success: false,
          message: "O Follow-up Inteligente está desativado. Ative e salve a configuração antes de enviar agora.",
        });
      }

      const providerStatus = normalizeFollowUpReason(conversation.connection?.providerStatus);
      const connectionReady = Boolean(conversation.connection?.isConnected) ||
        providerStatus === "connected" ||
        providerStatus === "open";
      if (!connectionReady) {
        return res.status(409).json({
          success: false,
          message: "A linha desta conversa ainda não está pronta para envio. Reconecte o WhatsApp e tente novamente.",
        });
      }

      const blockedByCurrentState = buildManualFollowUpBlockedMessage(conversation.followupDisabledReason);
      if (blockedByCurrentState) {
        return res.status(409).json({
          success: false,
          message: blockedByCurrentState,
        });
      }

      // Forçar próximo follow-up para agora
      await db.update(conversations)
        .set({
          followupActive: true,
          nextFollowupAt: getBrazilWallClockNow(),
          followupDisabledReason: null,
        })
        .where(eq(conversations.id, id));

      const cycleResult = await userFollowUpService.runCycleOnce({
        includeRepairs: false,
        onlyUserId: userId,
      });
      const followupLog = await db.query.userFollowupLogs.findFirst({
        where: and(
          eq(userFollowupLogs.userId, userId),
          eq(userFollowupLogs.conversationId, id),
          gte(userFollowupLogs.executedAt, startedAt),
        ),
        orderBy: (logs, { desc }) => [desc(logs.executedAt), desc(logs.id)],
      });

      invalidateFollowUpDashboardCaches(userId);

      if (followupLog?.status === "sent") {
        return res.json({ success: true, message: "Follow-up enviado para esta conversa." });
      }

      if (followupLog?.status === "failed") {
        return res.status(500).json({
          success: false,
          message: buildManualFollowUpLogMessage(followupLog),
        });
      }

      if (followupLog) {
        return res.status(409).json({
          success: false,
          message: buildManualFollowUpLogMessage(followupLog),
        });
      }

      return res.status(409).json({
        success: false,
        message: cycleResult.accepted
          ? "Nenhuma mensagem saiu agora. Confira se o Follow-up Inteligente está ativo e se a conversa está em uma linha conectada."
          : "Já existe uma verificação de follow-up em andamento. Aguarde alguns segundos e tente novamente.",
      });
    } catch (error: any) {
      console.error("Erro ao disparar follow-up:", error);
      res.status(500).json({ message: "Erro ao disparar follow-up" });
    }
  });

  /**
   * POST /api/followup/conversation/:id/reset
   * Resetar ciclo de follow-up
   */
  app.post("/api/followup/conversation/:id/reset", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { connection: true }
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.connection?.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      await userFollowUpService.resetFollowUpCycle(id, "Reset manual pelo usuário");
      invalidateFollowUpDashboardCaches(userId);
      res.json({ success: true, message: "Ciclo de follow-up resetado" });
    } catch (error: any) {
      console.error("Erro ao resetar follow-up:", error);
      res.status(500).json({ message: "Erro ao resetar follow-up" });
    }
  });

  /**
   * POST /api/followup/conversation/:id/schedule
   * Agendar follow-up manual para uma data/hora específica
   */
  app.post("/api/followup/conversation/:id/schedule", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const { scheduledFor, note } = req.body;

      if (!scheduledFor) {
        return res.status(400).json({ message: "scheduledFor é obrigatório" });
      }

      const scheduledDate = parseBrazilWallClockDateTime(scheduledFor);
      if (!scheduledDate || isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "Data inválida" });
      }

      if (scheduledDate <= getBrazilWallClockNow()) {
        return res.status(400).json({ message: "Data deve ser no futuro" });
      }

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { connection: true }
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (conversation.connection?.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.status(400).json({
          message: "Lembrete manual não está disponível para grupos.",
        });
      }

      if (!await isGlobalFollowUpEnabledForUser(userId)) {
        await userFollowUpService.disableFollowUp(id, "Usuario desativou follow-up global");
        invalidateFollowUpDashboardCaches(userId);
        return res.status(409).json({
          success: false,
          message: "O Follow-up Inteligente esta desligado nesta conta.",
        });
      }

      // Agendar follow-up manual
      await userFollowUpService.scheduleManualFollowUp(id, scheduledDate, note);
      invalidateFollowUpDashboardCaches(userId);
      
      res.json({ 
        success: true, 
        message: "Follow-up agendado com sucesso",
        scheduledFor: serializeBrazilWallClockDateTime(scheduledDate)
      });
    } catch (error: any) {
      console.error("Erro ao agendar follow-up:", error);
      res.status(500).json({ message: "Erro ao agendar follow-up" });
    }
  });

  /**
   * POST /api/followup/reorganize
   * Reorganiza todos os follow-ups pendentes do usuário
   * Recalcula as datas baseado na configuração atual
   */
  app.post("/api/followup/reorganize", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`🔄 [FOLLOW-UP] Reorganizando follow-ups para usuário ${userId}`);
      
      const result = await userFollowUpService.reorganizeAllFollowups(userId);
      invalidateFollowUpDashboardCaches(userId);

      res.json({ 
        success: true, 
        message: `Reorganização concluída`,
        reorganized: result.reorganized,
        skipped: result.skipped
      });
    } catch (error: any) {
      console.error("Erro ao reorganizar follow-ups:", error);
      res.status(500).json({ message: "Erro ao reorganizar follow-ups" });
    }
  });

  // ==================== AGENDAMENTO DE MENSAGENS (USER) ====================

  /**
   * POST /api/conversations/:id/schedule-message
   * Agendar mensagem para usuários regulares
   */
  app.post("/api/conversations/:id/schedule-message", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const { id } = req.params;
      const { scheduledFor, text, useAI, note } = req.body;

      if (!scheduledFor) {
        return res.status(400).json({ message: "scheduledFor (data/hora) é obrigatório" });
      }
      if (!text) {
        return res.status(400).json({ message: "text é obrigatório" });
      }

      // Verify conversation ownership
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.status(400).json({
          message: "Use o agendamento da fila de grupos para mensagens em grupos.",
        });
      }

      const parsedScheduledFor = parseBrazilWallClockDateTime(scheduledFor);
      if (!parsedScheduledFor) {
        return res.status(400).json({ message: "Data inválida" });
      }

      // Save to conversationScheduledMessages table
      const log = await db.insert(conversationScheduledMessages).values({
        conversationId: id,
        userId,
        contactNumber: conversation.contactNumber || "",
        text,
        scheduledFor: parsedScheduledFor,
        useAI: useAI || false,
        note: note || null,
        status: 'scheduled',
        createdAt: new Date(),
      }).returning();

      res.json({
        success: true,
        messageId: log[0].id,
        scheduledFor: serializeBrazilWallClockDateTime(log[0].scheduledFor),
        text: log[0].text,
        status: 'scheduled',
        useAI: log[0].useAI,
        note: log[0].note,
        createdAt: log[0].createdAt,
      });
    } catch (error: any) {
      console.error("Erro ao agendar mensagem:", error);
      res.status(500).json({ message: "Erro ao agendar mensagem", error: error.message });
    }
  });

  /**
   * GET /api/conversations/:id/scheduled-messages
   * Buscar mensagens agendadas de uma conversa (usuário regular)
   */
  app.get("/api/conversations/:id/scheduled-messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const { id } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.json([]);
      }

      const messages = await db.query.conversationScheduledMessages.findMany({
        where: and(
          eq(conversationScheduledMessages.conversationId, id),
          eq(conversationScheduledMessages.status, 'scheduled')
        ),
        orderBy: [asc(conversationScheduledMessages.scheduledFor)]
      });

      res.json(messages.map(m => ({
        id: m.id,
        text: m.text,
        scheduledFor: serializeBrazilWallClockDateTime(m.scheduledFor),
        useAI: m.useAI || false,
        note: m.note,
        status: m.status,
        createdAt: m.createdAt,
      })));
    } catch (error: any) {
      console.error("Erro ao buscar mensagens agendadas:", error);
      res.status(500).json({ message: "Erro ao buscar mensagens agendadas" });
    }
  });

  /**
   * DELETE /api/conversations/:id/scheduled-messages/:messageId
   * Cancelar mensagem agendada (usuário regular)
   */
  app.delete("/api/conversations/:id/scheduled-messages/:messageId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const { id, messageId } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (isGroupConversationRecord(conversation)) {
        return res.status(400).json({
          message: "Agendamentos de grupos devem ser gerenciados pela fila de grupos.",
        });
      }

      await db.update(conversationScheduledMessages)
        .set({ status: 'cancelled' })
        .where(and(
          eq(conversationScheduledMessages.id, messageId),
          eq(conversationScheduledMessages.conversationId, id),
          eq(conversationScheduledMessages.userId, userId)
        ));

      res.json({ success: true, message: "Agendamento cancelado" });
    } catch (error: any) {
      console.error("Erro ao cancelar mensagem agendada:", error);
      res.status(500).json({ message: "Erro ao cancelar agendamento" });
    }
  });

  console.log("✅ [FOLLOW-UP] Rotas registradas");
}
