import { Express, Request, Response } from "express";
import { db } from "./db";
import { ticketClosureLogs } from "../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { isAuthenticated } from "./supabaseAuth";
import { userFollowUpService } from "./userFollowUpService";
import { assertConversationAccess } from "./conversationAccess";
import { cancelPendingAIResponseForConversation } from "./whatsapp";

// Helper to get userId from authenticated request
function getUserId(req: any): string {
  return req.user?.claims?.sub || req.user?.id;
}

/**
 * Register ticket closure routes (Fase 4.2)
 * These routes handle closing tickets while preserving history for audit
 */
export function registerTicketClosureRoutes(app: Express): void {
  console.log("🔒 [Fase 4.2] Registrando rotas de encerramento de chamados...");

  // POST - Encerrar chamado (fechar ticket, manter histórico para auditoria)
  app.post("/api/conversations/:conversationId/close-ticket", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);
      const { reason } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const access = await assertConversationAccess(req, res, conversationId, {
        requireSendPermission: true,
      });
      if (!access) {
        return;
      }
      const { conversation } = access;

      // Get user info for audit log
      const user = await storage.getUser(userId);
      const userName = user?.name || user?.email || 'User';

      // Close the conversation (mark as closed, preserve history)
      await storage.updateConversation(conversationId, {
        isClosed: true,
        isArchived: true,
        closedAt: new Date(),
        closedBy: userId,
        closureReason: reason || null,
        followupActive: false,
        followupStage: 0,
        nextFollowupAt: null,
        followupDisabledReason: "Conversa encerrada pelo atendente.",
        orchestrationMode: "ai" as any,
        assignedToMemberId: null,
        handoffReason: "Atendimento encerrado.",
        handedOffAt: new Date(),
        handedOffBy: userId,
      });

      // Log the closure
      await db.insert(ticketClosureLogs).values({
        conversationId,
        action: 'closed',
        performedBy: userId,
        performedByName: userName,
        reason: reason || null,
        createdAt: new Date(),
      });

      // Reativa a IA para o próximo atendimento automaticamente.
      await storage.enableAgentForConversation(conversationId);

      await cancelPendingAIResponseForConversation(
        conversationId,
        "conversation_closed",
      );

      // Cancel any pending follow-ups (graceful - ignore if function not available)
      try {
        const followUpModule = await import("./userFollowUpService");
        if (followUpModule.cancelFollowUp && typeof followUpModule.cancelFollowUp === 'function') {
          followUpModule.cancelFollowUp(conversation.contactNumber);
        } else {
          // Use service method to cancel follow-up if available
          const { userFollowUpService } = followUpModule;
          if (userFollowUpService && typeof userFollowUpService.cancelFollowUp === 'function') {
            userFollowUpService.cancelFollowUp(conversation.contactNumber);
          }
        }
      } catch(e) {
        // Non-fatal: follow-up cancellation failed
        console.warn('[Ticket Close] Could not cancel follow-up:', e.message);
      }

      res.json({ 
        success: true, 
        message: "Chamado encerrado internamente",
        conversation: {
          id: conversationId,
          isClosed: true,
          isArchived: true,
          closedAt: new Date(),
          closedBy: userId,
        }
      });
    } catch (error) {
      console.error("Error closing ticket:", error);
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  app.post("/api/conversations/:conversationId/clear-history", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const access = await assertConversationAccess(req, res, conversationId, {
        requireSendPermission: true,
      });
      if (!access) {
        return;
      }

      const { conversation } = access;

      if (conversation.isClosed) {
        return res.status(400).json({
          message: "Conversa encerrada não pode ser limpa. Use um novo atendimento.",
        });
      }

      await cancelPendingAIResponseForConversation(
        conversationId,
        "conversation_cleared",
      );
      await storage.deletePendingAIResponse(conversationId);
      await storage.clearConversationOperationalHistory(conversationId);

      res.json({
        success: true,
        message: "Histórico operacional limpo com sucesso.",
        conversation: {
          id: conversationId,
          isClosed: false,
          lastMessageText: null,
          lastMessageTime: null,
          unreadCount: 0,
        },
      });
    } catch (error) {
      console.error("Error clearing conversation history:", error);
      res.status(500).json({ message: "Failed to clear conversation history" });
    }
  });

  // POST - Reabrir chamado (criar nova conversa com mesmo contato)
  app.post("/api/conversations/:conversationId/reopen-ticket", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);
      const { reason } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const access = await assertConversationAccess(req, res, conversationId, {
        requireSendPermission: true,
      });
      if (!access) {
        return;
      }
      const { conversation: oldConversation, connection } = access;

      // Get user info for audit log
      const user = await storage.getUser(userId);
      const userName = user?.name || user?.email || 'User';

      // Log the reopening of the old conversation
      await db.insert(ticketClosureLogs).values({
        conversationId,
        action: 'reopened',
        performedBy: userId,
        performedByName: userName,
        reason: reason || null,
        createdAt: new Date(),
      });

      // FIX DUPLICATAS: Verificar se já existe conversa ativa para este contato antes de criar nova
      let newConversation = await storage.getActiveConversationByContactNumber(
        connection.id,
        oldConversation.contactNumber
      );

      if (newConversation) {
        console.log(`⚠️ [REOPEN] Conversa ativa já existe para ${oldConversation.contactNumber} (${newConversation.id}), reutilizando`);
      } else {
        // Create new conversation for fresh context
        newConversation = await storage.createConversation({
          connectionId: connection.id,
          contactNumber: oldConversation.contactNumber,
          remoteJid: oldConversation.remoteJid,
          jidSuffix: oldConversation.jidSuffix || 's.whatsapp.net',
          contactName: oldConversation.contactName,
          contactAvatar: oldConversation.contactAvatar,
        });
      }

      // Mark new conversation as open and ready
      await storage.updateConversation(newConversation.id, {
        isClosed: false,
        followupActive: true,
        followupStage: 0,
        orchestrationMode: "ai" as any,
        assignedToMemberId: null,
        handoffReason: "Conversa reaberta e devolvida para a IA.",
        handedOffAt: new Date(),
        handedOffBy: userId,
      });

      await userFollowUpService.enableFollowUp(newConversation.id);

      res.json({ 
        success: true, 
        message: "Novo chamado criado com sucesso",
        conversation: {
          id: newConversation.id,
          contactNumber: newConversation.contactNumber,
          contactName: newConversation.contactName,
          isClosed: false,
          previousConversationId: conversationId,
        }
      });
    } catch (error) {
      console.error("Error reopening ticket:", error);
      res.status(500).json({ message: "Failed to reopen ticket" });
    }
  });

  // GET - Buscar histórico de encerramento de um chamado
  app.get("/api/conversations/:conversationId/closure-logs", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const access = await assertConversationAccess(req, res, conversationId, {
        requireViewPermission: true,
      });
      if (!access) {
        return;
      }

      // Get closure logs
      const logs = await db.select().from(ticketClosureLogs)
        .where(eq(ticketClosureLogs.conversationId, conversationId))
        .orderBy(ticketClosureLogs.createdAt);

      res.json({ logs });
    } catch (error) {
      console.error("Error fetching closure logs:", error);
      res.status(500).json({ message: "Failed to fetch closure logs" });
    }
  });

  // Admin routes for managing closed conversations
  
  // GET - Listar todas as conversas fechadas (admin)
  app.get("/api/admin/closed-conversations", async (req: any, res) => {
    try {
      const adminId = req.session?.adminId;
      if (!adminId) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const closedConversations = await db.query.conversations.findMany({
        where: (conversations: any) => eq(conversations.isClosed, true),
        orderBy: (conversations: any) => [conversations.closedAt, 'desc'],
      });

      res.json({ conversations: closedConversations });
    } catch (error) {
      console.error("Error fetching closed conversations:", error);
      res.status(500).json({ message: "Failed to fetch closed conversations" });
    }
  });

  console.log("✅ [Fase 4.2] Rotas de encerramento registradas com sucesso!");
}
