"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTicketClosureRoutes = registerTicketClosureRoutes;
var db_1 = require("./db");
var schema_1 = require("../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var storage_1 = require("./storage");
var supabaseAuth_1 = require("./supabaseAuth");
var userFollowUpService_1 = require("./userFollowUpService");
// Helper to get userId from authenticated request
function getUserId(req) {
    var _a, _b, _c;
    return ((_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.claims) === null || _b === void 0 ? void 0 : _b.sub) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id);
}
/**
 * Register ticket closure routes (Fase 4.2)
 * These routes handle closing tickets while preserving history for audit
 */
function registerTicketClosureRoutes(app) {
    var _this = this;
    console.log("🔒 [Fase 4.2] Registrando rotas de encerramento de chamados...");
    // POST - Encerrar chamado (fechar ticket, manter histórico para auditoria)
    app.post("/api/conversations/:conversationId/close-ticket", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var conversationId, userId, reason, conversation, connection, user, userName, followUpModule, userFollowUpService_2, e_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 11, , 12]);
                    conversationId = req.params.conversationId;
                    userId = getUserId(req);
                    reason = (req.body || {}).reason;
                    if (!userId) {
                        return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 1:
                    conversation = _a.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversation not found" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _a.sent();
                    if (!connection || conversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Forbidden" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getUser(userId)];
                case 3:
                    user = _a.sent();
                    userName = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.email) || 'User';
                    // Close the conversation (mark as closed, preserve history)
                    return [4 /*yield*/, storage_1.storage.updateConversation(conversationId, {
                            isClosed: true,
                            closedAt: new Date(),
                            closedBy: userId,
                            closureReason: reason || null,
                            followupActive: false,
                        })];
                case 4:
                    // Close the conversation (mark as closed, preserve history)
                    _a.sent();
                    // Log the closure
                    return [4 /*yield*/, db_1.db.insert(schema_1.ticketClosureLogs).values({
                            conversationId: conversationId,
                            action: 'closed',
                            performedBy: userId,
                            performedByName: userName,
                            reason: reason || null,
                            createdAt: new Date(),
                        })];
                case 5:
                    // Log the closure
                    _a.sent();
                    // Disable agent for this conversation
                    return [4 /*yield*/, storage_1.storage.disableAgentForConversation(conversationId)];
                case 6:
                    // Disable agent for this conversation
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./userFollowUpService"); })];
                case 8:
                    followUpModule = _a.sent();
                    if (followUpModule.cancelFollowUp && typeof followUpModule.cancelFollowUp === 'function') {
                        followUpModule.cancelFollowUp(conversation.contactNumber);
                    }
                    else {
                        userFollowUpService_2 = followUpModule.userFollowUpService;
                        if (userFollowUpService_2 && typeof userFollowUpService_2.cancelFollowUp === 'function') {
                            userFollowUpService_2.cancelFollowUp(conversation.contactNumber);
                        }
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_1 = _a.sent();
                    // Non-fatal: follow-up cancellation failed
                    console.warn('[Ticket Close] Could not cancel follow-up:', e_1.message);
                    return [3 /*break*/, 10];
                case 10:
                    res.json({
                        success: true,
                        message: "Chamado encerrado com sucesso",
                        conversation: {
                            id: conversationId,
                            isClosed: true,
                            closedAt: new Date(),
                            closedBy: userId,
                        }
                    });
                    return [3 /*break*/, 12];
                case 11:
                    error_1 = _a.sent();
                    console.error("Error closing ticket:", error_1);
                    res.status(500).json({ message: "Failed to close ticket" });
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    }); });
    // POST - Reabrir chamado (criar nova conversa com mesmo contato)
    app.post("/api/conversations/:conversationId/reopen-ticket", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var conversationId, userId, reason, oldConversation, connection, user, userName, newConversation, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 11, , 12]);
                    conversationId = req.params.conversationId;
                    userId = getUserId(req);
                    reason = (req.body || {}).reason;
                    if (!userId) {
                        return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 1:
                    oldConversation = _a.sent();
                    if (!oldConversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversation not found" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _a.sent();
                    if (!connection || oldConversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Forbidden" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getUser(userId)];
                case 3:
                    user = _a.sent();
                    userName = (user === null || user === void 0 ? void 0 : user.name) || (user === null || user === void 0 ? void 0 : user.email) || 'User';
                    // Log the reopening of the old conversation
                    return [4 /*yield*/, db_1.db.insert(schema_1.ticketClosureLogs).values({
                            conversationId: conversationId,
                            action: 'reopened',
                            performedBy: userId,
                            performedByName: userName,
                            reason: reason || null,
                            createdAt: new Date(),
                        })];
                case 4:
                    // Log the reopening of the old conversation
                    _a.sent();
                    return [4 /*yield*/, storage_1.storage.getActiveConversationByContactNumber(connection.id, oldConversation.contactNumber)];
                case 5:
                    newConversation = _a.sent();
                    if (!newConversation) return [3 /*break*/, 6];
                    console.log("\u26A0\uFE0F [REOPEN] Conversa ativa j\u00E1 existe para ".concat(oldConversation.contactNumber, " (").concat(newConversation.id, "), reutilizando"));
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, storage_1.storage.createConversation({
                        connectionId: connection.id,
                        contactNumber: oldConversation.contactNumber,
                        remoteJid: oldConversation.remoteJid,
                        jidSuffix: oldConversation.jidSuffix || 's.whatsapp.net',
                        contactName: oldConversation.contactName,
                        contactAvatar: oldConversation.contactAvatar,
                    })];
                case 7:
                    // Create new conversation for fresh context
                    newConversation = _a.sent();
                    _a.label = 8;
                case 8: 
                // Mark new conversation as open and ready
                return [4 /*yield*/, storage_1.storage.updateConversation(newConversation.id, {
                        isClosed: false,
                        followupActive: true,
                        followupStage: 0,
                    })];
                case 9:
                    // Mark new conversation as open and ready
                    _a.sent();
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.enableFollowUp(newConversation.id)];
                case 10:
                    _a.sent();
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
                    return [3 /*break*/, 12];
                case 11:
                    error_2 = _a.sent();
                    console.error("Error reopening ticket:", error_2);
                    res.status(500).json({ message: "Failed to reopen ticket" });
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    }); });
    // GET - Buscar histórico de encerramento de um chamado
    app.get("/api/conversations/:conversationId/closure-logs", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var conversationId, userId, conversation, connection, logs, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    conversationId = req.params.conversationId;
                    userId = getUserId(req);
                    if (!userId) {
                        return [2 /*return*/, res.status(401).json({ message: "Unauthorized" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 1:
                    conversation = _a.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversation not found" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _a.sent();
                    if (!connection || conversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Forbidden" })];
                    }
                    return [4 /*yield*/, db_1.db.select().from(schema_1.ticketClosureLogs)
                            .where((0, drizzle_orm_1.eq)(schema_1.ticketClosureLogs.conversationId, conversationId))
                            .orderBy(schema_1.ticketClosureLogs.createdAt)];
                case 3:
                    logs = _a.sent();
                    res.json({ logs: logs });
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error("Error fetching closure logs:", error_3);
                    res.status(500).json({ message: "Failed to fetch closure logs" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    // Admin routes for managing closed conversations
    // GET - Listar todas as conversas fechadas (admin)
    app.get("/api/admin/closed-conversations", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, closedConversations, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(403).json({ message: "Admin access required" })];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findMany({
                            where: function (conversations) { return (0, drizzle_orm_1.eq)(conversations.isClosed, true); },
                            orderBy: function (conversations) { return [conversations.closedAt, 'desc']; },
                        })];
                case 1:
                    closedConversations = _b.sent();
                    res.json({ conversations: closedConversations });
                    return [3 /*break*/, 3];
                case 2:
                    error_4 = _b.sent();
                    console.error("Error fetching closed conversations:", error_4);
                    res.status(500).json({ message: "Failed to fetch closed conversations" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [Fase 4.2] Rotas de encerramento registradas com sucesso!");
}
