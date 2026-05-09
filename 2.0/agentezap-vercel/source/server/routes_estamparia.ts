import type { Express, Request, Response } from "express";

import { isMemberRequest } from "./conversationAccess";
import {
  generateEstampariaRequestArt,
  getEstampariaProfileConfig,
  getEstampariaRequestById,
  listEstampariaRequests,
  resolveMimeTypeFromMediaUrl,
  updateEstampariaProfileConfig,
  updateEstampariaRequest,
} from "./estampariaService";
import { storage } from "./storage";
import { isAuthenticated } from "./supabaseAuth";
import { sendWhatsAppMediaFromUser } from "./whatsappSender";

function getUserId(req: any): string {
  return req.user?.claims?.sub || req.user?.id;
}

export function registerEstampariaRoutes(app: Express) {
  app.get("/api/estamparia/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });
      const profile = await getEstampariaProfileConfig(getUserId(req));
      return res.json({ profile });
    } catch (error) {
      console.error("[ESTAMPARIA] Error fetching profile:", error);
      return res.status(500).json({ message: "Falha ao carregar perfil da estamparia" });
    }
  });

  app.patch("/api/estamparia/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const updated = await updateEstampariaProfileConfig(getUserId(req), {
        isActive: req.body?.isActive === true,
      });

      if (!updated) return res.status(404).json({ message: "Perfil de estamparia não encontrado" });
      return res.json({ profile: updated });
    } catch (error) {
      console.error("[ESTAMPARIA] Error updating profile:", error);
      return res.status(500).json({ message: "Falha ao atualizar perfil da estamparia" });
    }
  });

  app.get("/api/estamparia/requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const userId = getUserId(req);
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "all";
      const day = typeof req.query.day === "string" ? req.query.day.trim() : "all";
      const scopedConnectionId =
        typeof req.query.connectionId === "string" && req.query.connectionId.trim().length > 0
          ? req.query.connectionId.trim()
          : undefined;
      const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) || "50", 10) || 50, 200));
      const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10) || 0);

      const selectedConnections = scopedConnectionId
        ? [await storage.getConnectionByUserId(userId, scopedConnectionId)].filter(Boolean)
        : await storage.getConnectionsByUserId(userId);

      if (selectedConnections.length === 0) {
        return res.json({ data: [], total: 0, hasMore: false, offset, limit });
      }

      const result = await listEstampariaRequests({
        userId,
        connectionIds: selectedConnections.map((connection: any) => connection.id),
        query,
        status,
        day,
        limit,
        offset,
      });

      return res.json(result);
    } catch (error) {
      console.error("[ESTAMPARIA] Error fetching requests:", error);
      return res.status(500).json({ message: "Falha ao carregar solicitações" });
    }
  });

  app.get("/api/estamparia/requests/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const request = await getEstampariaRequestById(req.params.id, getUserId(req));
      if (!request) return res.status(404).json({ message: "Solicitação não encontrada" });
      return res.json({ request });
    } catch (error) {
      console.error("[ESTAMPARIA] Error fetching request by id:", error);
      return res.status(500).json({ message: "Falha ao carregar solicitação" });
    }
  });

  app.patch("/api/estamparia/requests/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const updated = await updateEstampariaRequest(req.params.id, getUserId(req), {
        status: req.body?.status,
        reviewerNotes: req.body?.reviewerNotes,
        customerFeedback: req.body?.customerFeedback,
        customerApprovalCaption: req.body?.customerApprovalCaption,
        reviewerArtUrl: req.body?.reviewerArtUrl,
        currentArtUrl: req.body?.currentArtUrl,
        currentArtSource: req.body?.currentArtSource,
        requestTitle: req.body?.requestTitle,
        briefingSummary: req.body?.briefingSummary,
        artDirectionPrompt: req.body?.artDirectionPrompt,
      });

      if (!updated) return res.status(404).json({ message: "Solicitação não encontrada" });
      return res.json({ request: updated });
    } catch (error) {
      console.error("[ESTAMPARIA] Error updating request:", error);
      return res.status(500).json({ message: "Falha ao atualizar solicitação" });
    }
  });

  app.post("/api/estamparia/requests/:id/generate-art", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const request = await generateEstampariaRequestArt({
        requestId: req.params.id,
        userId: getUserId(req),
      });

      if (!request) return res.status(404).json({ message: "Solicitação não encontrada" });
      return res.json({ request });
    } catch (error: any) {
      console.error("[ESTAMPARIA] Error generating art:", error);
      return res.status(500).json({ message: error?.message || "Falha ao gerar arte com IA" });
    }
  });

  app.post("/api/estamparia/requests/:id/send-to-customer", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (isMemberRequest(req)) return res.status(403).json({ message: "Acesso negado" });

      const userId = getUserId(req);
      const request = await getEstampariaRequestById(req.params.id, userId);
      if (!request) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (!request.currentArtUrl) {
        return res.status(400).json({ message: "Ainda não existe arte atual para enviar ao cliente" });
      }

      const caption =
        String(req.body?.caption || "").trim() ||
        request.customerApprovalCaption ||
        "Segue a arte para sua aprovação. Se quiser ajustes, me fale o que mudar.";

      const sent = await sendWhatsAppMediaFromUser(
        userId,
        request.contactNumber,
        request.currentArtUrl,
        caption,
        resolveMimeTypeFromMediaUrl(request.currentArtUrl),
        "estamparia_module",
        { conversationId: request.conversationId },
      );

      if (!sent) return res.status(500).json({ message: "Falha ao enviar a arte ao cliente" });

      const updated = await updateEstampariaRequest(req.params.id, userId, {
        status: "awaiting_customer",
        customerApprovalCaption: caption,
        sentToCustomer: true,
      });

      return res.json({ success: true, request: updated });
    } catch (error: any) {
      console.error("[ESTAMPARIA] Error sending art to customer:", error);
      return res.status(500).json({ message: error?.message || "Falha ao enviar a arte ao cliente" });
    }
  });
}
