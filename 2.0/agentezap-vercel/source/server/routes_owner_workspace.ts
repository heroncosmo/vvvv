import type { Express, Response } from "express";
import { isAuthenticated } from "./supabaseAuth";
import { canUserAccessOwnerWorkspace } from "./ownerWorkspaceRegistry";
import {
  cancelOwnerBroadcast,
  createAndStartOwnerBroadcast,
  deleteOwnerScheduledNotification,
  getOwnerBroadcastMessages,
  getOwnerWorkspaceCalendar,
  getOwnerWorkspaceConfig,
  getOwnerWorkspaceHistory,
  getOwnerWorkspaceQueueStatus,
  getOwnerWorkspaceScheduled,
  getOwnerWorkspaceStats,
  processOwnerWorkspaceQueue,
  reorganizeOwnerWorkspaceAgenda,
  resendOwnerScheduledNotification,
  sendOwnerScheduledNotification,
  updateOwnerWorkspaceConfig,
  listOwnerWorkspaceBroadcasts,
} from "./ownerNotificationWorkspaceService";

function getAuthenticatedUserId(req: any): string {
  return String(
    req?.user?.claims?.sub ||
    req?.user?.id ||
    req?.session?.user?.id ||
    "",
  );
}

async function requireOwnerWorkspace(req: any, res: Response, next: () => void) {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allowed = await canUserAccessOwnerWorkspace(userId);
    if (!allowed) {
      return res.status(403).json({ message: "Acesso restrito ao workspace do administrador" });
    }

    req.ownerWorkspaceUserId = userId;
    next();
  } catch (error) {
    console.error("[OWNER WORKSPACE] Falha na autorização:", error);
    res.status(500).json({ message: "Falha ao validar acesso ao workspace" });
  }
}

export function registerOwnerWorkspaceRoutes(app: Express) {
  app.get("/api/owner-workspace/notifications/config", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      const config = await getOwnerWorkspaceConfig(req.ownerWorkspaceUserId);
      res.json(config);
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar config:", error);
      res.status(500).json({ message: "Falha ao buscar configuração" });
    }
  });

  app.put("/api/owner-workspace/notifications/config", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      await updateOwnerWorkspaceConfig(req.ownerWorkspaceUserId, req.body || {});
      res.json({ success: true });
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao salvar config:", error);
      res.status(500).json({ message: "Falha ao salvar configuração" });
    }
  });

  app.get("/api/owner-workspace/notifications/stats", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await getOwnerWorkspaceStats(req.ownerWorkspaceUserId));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar stats:", error);
      res.status(500).json({ message: "Falha ao buscar estatísticas" });
    }
  });

  app.get("/api/owner-workspace/notifications/history", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.limit || 20);
      const type = String(req.query.type || "all");
      const status = String(req.query.status || "all");
      const history = await getOwnerWorkspaceHistory(req.ownerWorkspaceUserId, {
        page,
        pageSize,
        type,
        status,
      });
      res.json(history);
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar histórico:", error);
      res.status(500).json({ message: "Falha ao buscar histórico" });
    }
  });

  app.get("/api/owner-workspace/notifications/scheduled", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const scheduled = await getOwnerWorkspaceScheduled(req.ownerWorkspaceUserId, startDate, endDate);
      res.json(scheduled);
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar agenda:", error);
      res.status(500).json({ message: "Falha ao buscar agenda" });
    }
  });

  app.delete("/api/owner-workspace/notifications/scheduled/:id", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      await deleteOwnerScheduledNotification(req.ownerWorkspaceUserId, String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao excluir agendamento:", error);
      res.status(500).json({ message: "Falha ao excluir agendamento" });
    }
  });

  app.post("/api/owner-workspace/notifications/send/:id", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await sendOwnerScheduledNotification(req.ownerWorkspaceUserId, String(req.params.id)));
    } catch (error: any) {
      console.error("[OWNER WORKSPACE] Erro ao enviar notificação:", error);
      res.status(500).json({ message: error?.message || "Falha ao enviar notificação" });
    }
  });

  app.post("/api/owner-workspace/notifications/resend/:id", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(
        await resendOwnerScheduledNotification(
          req.ownerWorkspaceUserId,
          String(req.params.id),
          req.body?.regenerate === true,
        ),
      );
    } catch (error: any) {
      console.error("[OWNER WORKSPACE] Erro ao reenviar notificação:", error);
      res.status(500).json({ message: error?.message || "Falha ao reenviar notificação" });
    }
  });

  app.get("/api/owner-workspace/notifications/calendar", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      const month = Number(req.query.month || new Date().getMonth() + 1);
      const year = Number(req.query.year || new Date().getFullYear());
      res.json(await getOwnerWorkspaceCalendar(req.ownerWorkspaceUserId, month, year));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar calendário:", error);
      res.status(500).json({ message: "Falha ao buscar calendário" });
    }
  });

  app.post("/api/owner-workspace/notifications/reorganize", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await reorganizeOwnerWorkspaceAgenda(req.ownerWorkspaceUserId));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao reorganizar agenda:", error);
      res.status(500).json({ message: "Falha ao reorganizar agenda" });
    }
  });

  app.post("/api/owner-workspace/notifications/process-queue", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await processOwnerWorkspaceQueue(req.ownerWorkspaceUserId, 50));
    } catch (error: any) {
      console.error("[OWNER WORKSPACE] Erro ao processar fila:", error);
      res.status(500).json({ message: error?.message || "Falha ao processar fila" });
    }
  });

  app.get("/api/owner-workspace/notifications/queue-status", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await getOwnerWorkspaceQueueStatus(req.ownerWorkspaceUserId));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar status da fila:", error);
      res.status(500).json({ message: "Falha ao buscar status da fila" });
    }
  });

  app.get("/api/owner-workspace/broadcasts", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await listOwnerWorkspaceBroadcasts(req.ownerWorkspaceUserId));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao listar broadcasts:", error);
      res.status(500).json({ message: "Falha ao listar broadcasts" });
    }
  });

  app.post("/api/owner-workspace/broadcasts/create-and-start", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      const payload = req.body || {};
      if (!payload.name || !payload.messageTemplate || !payload.targetType) {
        return res.status(400).json({ message: "Nome, mensagem e público são obrigatórios" });
      }

      res.json(await createAndStartOwnerBroadcast(req.ownerWorkspaceUserId, payload));
    } catch (error: any) {
      console.error("[OWNER WORKSPACE] Erro ao criar broadcast:", error);
      res.status(500).json({ message: error?.message || "Falha ao criar broadcast" });
    }
  });

  app.post("/api/owner-workspace/broadcasts/:id/cancel", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      await cancelOwnerBroadcast(req.ownerWorkspaceUserId, String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao cancelar broadcast:", error);
      res.status(500).json({ message: "Falha ao cancelar broadcast" });
    }
  });

  app.get("/api/owner-workspace/broadcasts/:id/messages", isAuthenticated, requireOwnerWorkspace, async (req: any, res) => {
    try {
      res.json(await getOwnerBroadcastMessages(req.ownerWorkspaceUserId, String(req.params.id)));
    } catch (error) {
      console.error("[OWNER WORKSPACE] Erro ao buscar mensagens do broadcast:", error);
      res.status(500).json({ message: "Falha ao buscar mensagens do broadcast" });
    }
  });
}
