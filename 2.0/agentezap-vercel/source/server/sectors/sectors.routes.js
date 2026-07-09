"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSectorRoutes = registerSectorRoutes;
var supabaseAuth_1 = require("../supabaseAuth");
var controller = require("./sectors.controller");
function requireAdmin(req, res, next) {
    var _a, _b, _c, _d;
    var role = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || ((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.role) || ((_d = req.session) === null || _d === void 0 ? void 0 : _d.adminRole);
    if (role !== "admin" && role !== "owner") {
        return res.status(403).json({ error: "Acesso restrito a administradores." });
    }
    next();
}
function registerSectorRoutes(app) {
    console.log("[Sectors] Registrando rotas de setores...");
    app.get("/api/sectors", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listSectors);
    app.get("/api/sectors/agents", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listAdminAgents);
    app.get("/api/sectors/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.getSectorById);
    app.post("/api/sectors", supabaseAuth_1.isAuthenticated, requireAdmin, controller.createSector);
    app.patch("/api/sectors/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.updateSector);
    app.delete("/api/sectors/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.deleteSector);
    // Members
    app.get("/api/sectors/:id/members", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listSectorMembers);
    app.post("/api/sectors/:id/members", supabaseAuth_1.isAuthenticated, requireAdmin, controller.addSectorMember);
    app.patch("/api/sectors/:id/members/:memberId", supabaseAuth_1.isAuthenticated, requireAdmin, controller.updateSectorMember);
    app.delete("/api/sectors/:id/members/:memberId", supabaseAuth_1.isAuthenticated, requireAdmin, controller.removeSectorMember);
    // Routing and reports
    app.post("/api/sectors/route", supabaseAuth_1.isAuthenticated, requireAdmin, controller.routeConversation);
    app.get("/api/sectors/reports/attendance", supabaseAuth_1.isAuthenticated, requireAdmin, controller.getAttendanceReport);
    // Ticket closure
    app.post("/api/sectors/tickets/:conversationId/close", supabaseAuth_1.isAuthenticated, requireAdmin, controller.closeTicket);
    app.post("/api/sectors/tickets/:conversationId/reopen", supabaseAuth_1.isAuthenticated, requireAdmin, controller.reopenTicket);
    // Bulk actions
    app.post("/api/sectors/bulk/toggle-ai", supabaseAuth_1.isAuthenticated, requireAdmin, controller.bulkToggleAI);
    // Scheduled messages
    app.post("/api/sectors/scheduled-messages", supabaseAuth_1.isAuthenticated, requireAdmin, controller.createScheduledMessage);
    app.get("/api/sectors/scheduled-messages", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listScheduledMessages);
    app.delete("/api/sectors/scheduled-messages/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.cancelScheduledMessage);
    // AI generation
    app.post("/api/sectors/ai/generate", supabaseAuth_1.isAuthenticated, requireAdmin, controller.generateAIMessage);
    console.log("[Sectors] Rotas registradas com sucesso!");
}
