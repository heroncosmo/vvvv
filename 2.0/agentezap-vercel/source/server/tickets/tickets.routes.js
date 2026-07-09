"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTicketRoutes = registerTicketRoutes;
var multer_1 = require("multer");
var supabaseAuth_1 = require("../supabaseAuth");
var controller = require("./tickets.controller");
var upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 4 },
    fileFilter: function (_req, file, cb) {
        var ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
        cb(ok ? null : new Error("Formato inválido. Apenas PNG/JPEG/WEBP."), ok);
    }
});
function requireAdmin(req, res, next) {
    var _a, _b, _c, _d;
    var role = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || ((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.role) || ((_d = req.session) === null || _d === void 0 ? void 0 : _d.adminRole);
    if (role !== "admin" && role !== "owner") {
        return res.status(403).json({ error: "Acesso restrito a administradores." });
    }
    next();
}
function registerTicketRoutes(app) {
    console.log("🎫 [Tickets] Registrando rotas de chamados...");
    // User routes
    app.get("/api/tickets", supabaseAuth_1.isAuthenticated, controller.listUserTickets);
    app.post("/api/tickets", supabaseAuth_1.isAuthenticated, controller.createTicket);
    app.get("/api/tickets/:id", supabaseAuth_1.isAuthenticated, controller.getUserTicketById);
    app.patch("/api/tickets/:id", supabaseAuth_1.isAuthenticated, controller.updateUserTicket);
    app.delete("/api/tickets/:id", supabaseAuth_1.isAuthenticated, controller.deleteUserTicket);
    app.get("/api/tickets/:id/messages", supabaseAuth_1.isAuthenticated, controller.listUserTicketMessages);
    app.post("/api/tickets/:id/messages", supabaseAuth_1.isAuthenticated, upload.array("attachments", 4), controller.sendUserMessage);
    app.post("/api/tickets/:id/read", supabaseAuth_1.isAuthenticated, controller.markUserRead);
    app.post("/api/tickets/route", supabaseAuth_1.isAuthenticated, controller.routeTicket);
    // Admin routes
    app.get("/api/admin/tickets", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listAdminTickets);
    app.get("/api/admin/tickets/reports", supabaseAuth_1.isAuthenticated, requireAdmin, controller.getTicketReports);
    app.get("/api/admin/tickets/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.getAdminTicketById);
    app.patch("/api/admin/tickets/:id", supabaseAuth_1.isAuthenticated, requireAdmin, controller.updateAdminTicket);
    app.patch("/api/admin/tickets/:id/status", supabaseAuth_1.isAuthenticated, requireAdmin, controller.updateAdminTicketStatus);
    app.get("/api/admin/tickets/:id/messages", supabaseAuth_1.isAuthenticated, requireAdmin, controller.listAdminTicketMessages);
    app.post("/api/admin/tickets/:id/messages", supabaseAuth_1.isAuthenticated, requireAdmin, upload.array("attachments", 4), controller.sendAdminMessage);
    app.post("/api/admin/tickets/:id/read", supabaseAuth_1.isAuthenticated, requireAdmin, controller.markAdminRead);
    console.log("✅ [Tickets] Rotas registradas com sucesso!");
}
// v2 - Railway build compatible
