import type { Express } from "express";
import { isAuthenticated } from "../supabaseAuth";
import * as controller from "./sectors.controller";

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role || req.session?.user?.role || req.session?.adminRole;
  if (role !== "admin" && role !== "owner") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
}

export function registerSectorRoutes(app: Express): void {
  console.log("[Sectors] Registrando rotas de setores...");

  app.get("/api/sectors", isAuthenticated, requireAdmin, controller.listSectors);
  app.get("/api/sectors/agents", isAuthenticated, requireAdmin, controller.listAdminAgents);
  app.get("/api/sectors/:id", isAuthenticated, requireAdmin, controller.getSectorById);
  app.post("/api/sectors", isAuthenticated, requireAdmin, controller.createSector);
  app.patch("/api/sectors/:id", isAuthenticated, requireAdmin, controller.updateSector);
  app.delete("/api/sectors/:id", isAuthenticated, requireAdmin, controller.deleteSector);

  // Members
  app.get("/api/sectors/:id/members", isAuthenticated, requireAdmin, controller.listSectorMembers);
  app.post("/api/sectors/:id/members", isAuthenticated, requireAdmin, controller.addSectorMember);
  app.patch("/api/sectors/:id/members/:memberId", isAuthenticated, requireAdmin, controller.updateSectorMember);
  app.delete("/api/sectors/:id/members/:memberId", isAuthenticated, requireAdmin, controller.removeSectorMember);

  // Routing and reports
  app.post("/api/sectors/route", isAuthenticated, requireAdmin, controller.routeConversation);
  app.get("/api/sectors/reports/attendance", isAuthenticated, requireAdmin, controller.getAttendanceReport);

  // Ticket closure
  app.post("/api/sectors/tickets/:conversationId/close", isAuthenticated, requireAdmin, controller.closeTicket);
  app.post("/api/sectors/tickets/:conversationId/reopen", isAuthenticated, requireAdmin, controller.reopenTicket);

  // Bulk actions
  app.post("/api/sectors/bulk/toggle-ai", isAuthenticated, requireAdmin, controller.bulkToggleAI);

  // Scheduled messages
  app.post("/api/sectors/scheduled-messages", isAuthenticated, requireAdmin, controller.createScheduledMessage);
  app.get("/api/sectors/scheduled-messages", isAuthenticated, requireAdmin, controller.listScheduledMessages);
  app.delete("/api/sectors/scheduled-messages/:id", isAuthenticated, requireAdmin, controller.cancelScheduledMessage);

  // AI generation
  app.post("/api/sectors/ai/generate", isAuthenticated, requireAdmin, controller.generateAIMessage);

  console.log("[Sectors] Rotas registradas com sucesso!");
}
