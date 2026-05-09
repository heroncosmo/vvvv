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
exports.registerFollowUpRoutes = registerFollowUpRoutes;
var supabaseAuth_1 = require("./supabaseAuth");
var userFollowUpService_1 = require("./userFollowUpService");
var schema_1 = require("@shared/schema");
var db_1 = require("./db");
var schema_2 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var storage_1 = require("./storage");
// ============================================================================
// ROTAS DO FOLLOW-UP INTELIGENTE
// ============================================================================
function registerFollowUpRoutes(app) {
    // ==================== CONFIGURAÇÃO ====================
    var _this = this;
    /**
     * GET /api/followup/config
     * Buscar configuração de follow-up do usuário
     */
    app.get("/api/followup/config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, config, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.getFollowupConfig(userId)];
                case 1:
                    config = _a.sent();
                    res.json(config);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Erro ao buscar config de follow-up:", error_1);
                    res.status(500).json({ message: "Erro ao buscar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * PUT /api/followup/config
     * Atualizar configuração de follow-up
     */
    app.put("/api/followup/config", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, validationResult, updated, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    validationResult = schema_1.followupConfigSchema.partial().safeParse(req.body);
                    if (!validationResult.success) {
                        return [2 /*return*/, res.status(400).json({
                                message: "Dados inválidos",
                                errors: validationResult.error.errors
                            })];
                    }
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.updateFollowupConfig(userId, req.body)];
                case 1:
                    updated = _a.sent();
                    res.json(updated);
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error("Erro ao atualizar config de follow-up:", error_2);
                    res.status(500).json({ message: "Erro ao atualizar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== CONTROLE POR CONVERSA ====================
    /**
     * POST /api/followup/conversation/:id/toggle
     * Ativar/Desativar follow-up para uma conversa específica
     */
    app.post("/api/followup/conversation/:id/toggle", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, active, reason, conversation, error_3;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    userId = req.user.claims.sub;
                    id = req.params.id;
                    _a = req.body, active = _a.active, reason = _a.reason;
                    if (typeof active !== 'boolean') {
                        return [2 /*return*/, res.status(400).json({ message: "active (boolean) é obrigatório" })];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id),
                            with: { connection: true }
                        })];
                case 1:
                    conversation = _c.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (((_b = conversation.connection) === null || _b === void 0 ? void 0 : _b.userId) !== userId) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    if (!active) return [3 /*break*/, 3];
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.enableFollowUp(id)];
                case 2:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, userFollowUpService_1.userFollowUpService.disableFollowUp(id, reason || "Desativado pelo usuário")];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5:
                    res.json({ success: true, active: active });
                    return [3 /*break*/, 7];
                case 6:
                    error_3 = _c.sent();
                    console.error("Erro ao alternar follow-up:", error_3);
                    res.status(500).json({ message: "Erro ao alternar follow-up" });
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/followup/conversation/:id/status
     * Verificar status do follow-up de uma conversa
     */
    app.get("/api/followup/conversation/:id/status", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, conversation, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id),
                            with: { connection: true }
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (((_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId) !== userId) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    res.json({
                        active: conversation.followupActive,
                        stage: conversation.followupStage,
                        nextFollowupAt: conversation.nextFollowupAt,
                        disabledReason: conversation.followupDisabledReason
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_4 = _b.sent();
                    console.error("Erro ao buscar status de follow-up:", error_4);
                    res.status(500).json({ message: "Erro ao buscar status" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== ESTATÍSTICAS E LOGS ====================
    /**
     * GET /api/followup/stats
     * Estatísticas gerais de follow-up do usuário
     */
    app.get("/api/followup/stats", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, stats, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.getFollowUpStats(userId)];
                case 1:
                    stats = _a.sent();
                    res.json(stats);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _a.sent();
                    console.error("Erro ao buscar estatísticas de follow-up:", error_5);
                    res.status(500).json({ message: "Erro ao buscar estatísticas" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/followup/logs
     * Logs de follow-up do usuário
     */
    app.get("/api/followup/logs", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, limit, logs, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    limit = parseInt(req.query.limit) || 50;
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.getFollowUpLogs(userId, limit)];
                case 1:
                    logs = _a.sent();
                    res.json(logs);
                    return [3 /*break*/, 3];
                case 2:
                    error_6 = _a.sent();
                    console.error("Erro ao buscar logs de follow-up:", error_6);
                    res.status(500).json({ message: "Erro ao buscar logs" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/followup/pending
     * Lista conversas com follow-up pendente
     */
    app.get("/api/followup/pending", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, pending, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.getPendingFollowUps(userId)];
                case 1:
                    pending = _a.sent();
                    res.json(pending.map(function (conv) { return ({
                        id: conv.id,
                        contactNumber: conv.contactNumber,
                        contactName: conv.contactName,
                        stage: conv.followupStage,
                        nextFollowupAt: conv.nextFollowupAt,
                        lastMessageText: conv.lastMessageText,
                        lastMessageTime: conv.lastMessageTime,
                        note: conv.followupDisabledReason || null
                    }); }));
                    return [3 /*break*/, 3];
                case 2:
                    error_7 = _a.sent();
                    console.error("Erro ao buscar follow-ups pendentes:", error_7);
                    res.status(500).json({ message: "Erro ao buscar pendentes" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== AÇÕES MANUAIS ====================
    /**
     * POST /api/followup/conversation/:id/trigger
     * Disparar follow-up manualmente (para testes)
     */
    app.post("/api/followup/conversation/:id/trigger", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, conversation, error_8;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    userId = req.user.claims.sub;
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id),
                            with: { connection: true }
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (((_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId) !== userId) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    // Forçar próximo follow-up para agora
                    return [4 /*yield*/, db_1.db.update(schema_2.conversations)
                            .set({ nextFollowupAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_2.conversations.id, id))];
                case 2:
                    // Forçar próximo follow-up para agora
                    _b.sent();
                    res.json({ success: true, message: "Follow-up será processado em breve" });
                    return [3 /*break*/, 4];
                case 3:
                    error_8 = _b.sent();
                    console.error("Erro ao disparar follow-up:", error_8);
                    res.status(500).json({ message: "Erro ao disparar follow-up" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/followup/conversation/:id/reset
     * Resetar ciclo de follow-up
     */
    app.post("/api/followup/conversation/:id/reset", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, conversation, error_9;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    userId = req.user.claims.sub;
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id),
                            with: { connection: true }
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (((_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId) !== userId) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.resetFollowUpCycle(id, "Reset manual pelo usuário")];
                case 2:
                    _b.sent();
                    res.json({ success: true, message: "Ciclo de follow-up resetado" });
                    return [3 /*break*/, 4];
                case 3:
                    error_9 = _b.sent();
                    console.error("Erro ao resetar follow-up:", error_9);
                    res.status(500).json({ message: "Erro ao resetar follow-up" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/followup/conversation/:id/schedule
     * Agendar follow-up manual para uma data/hora específica
     */
    app.post("/api/followup/conversation/:id/schedule", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, scheduledFor, note, scheduledDate, conversation, error_10;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    userId = req.user.claims.sub;
                    id = req.params.id;
                    _a = req.body, scheduledFor = _a.scheduledFor, note = _a.note;
                    if (!scheduledFor) {
                        return [2 /*return*/, res.status(400).json({ message: "scheduledFor é obrigatório" })];
                    }
                    scheduledDate = new Date(scheduledFor);
                    if (isNaN(scheduledDate.getTime())) {
                        return [2 /*return*/, res.status(400).json({ message: "Data inválida" })];
                    }
                    if (scheduledDate <= new Date()) {
                        return [2 /*return*/, res.status(400).json({ message: "Data deve ser no futuro" })];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id),
                            with: { connection: true }
                        })];
                case 1:
                    conversation = _c.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (((_b = conversation.connection) === null || _b === void 0 ? void 0 : _b.userId) !== userId) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    // Agendar follow-up manual
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.scheduleManualFollowUp(id, scheduledDate, note)];
                case 2:
                    // Agendar follow-up manual
                    _c.sent();
                    res.json({
                        success: true,
                        message: "Follow-up agendado com sucesso",
                        scheduledFor: scheduledDate.toISOString()
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_10 = _c.sent();
                    console.error("Erro ao agendar follow-up:", error_10);
                    res.status(500).json({ message: "Erro ao agendar follow-up" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/followup/reorganize
     * Reorganiza todos os follow-ups pendentes do usuário
     * Recalcula as datas baseado na configuração atual
     */
    app.post("/api/followup/reorganize", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, result, error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    userId = req.user.claims.sub;
                    console.log("\uD83D\uDD04 [FOLLOW-UP] Reorganizando follow-ups para usu\u00E1rio ".concat(userId));
                    return [4 /*yield*/, userFollowUpService_1.userFollowUpService.reorganizeAllFollowups(userId)];
                case 1:
                    result = _a.sent();
                    res.json({
                        success: true,
                        message: "Reorganiza\u00E7\u00E3o conclu\u00EDda",
                        reorganized: result.reorganized,
                        skipped: result.skipped
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_11 = _a.sent();
                    console.error("Erro ao reorganizar follow-ups:", error_11);
                    res.status(500).json({ message: "Erro ao reorganizar follow-ups" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== AGENDAMENTO DE MENSAGENS (USER) ====================
    /**
     * POST /api/conversations/:id/schedule-message
     * Agendar mensagem para usuários regulares
     */
    app.post("/api/conversations/:id/schedule-message", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, _a, scheduledFor, text, useAI, note, conversation, connection, log, error_12;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 4, , 5]);
                    userId = ((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.claims) === null || _c === void 0 ? void 0 : _c.sub) || ((_d = req.user) === null || _d === void 0 ? void 0 : _d.id);
                    id = req.params.id;
                    _a = req.body, scheduledFor = _a.scheduledFor, text = _a.text, useAI = _a.useAI, note = _a.note;
                    if (!scheduledFor) {
                        return [2 /*return*/, res.status(400).json({ message: "scheduledFor (data/hora) é obrigatório" })];
                    }
                    if (!text) {
                        return [2 /*return*/, res.status(400).json({ message: "text é obrigatório" })];
                    }
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id)
                        })];
                case 1:
                    conversation = _e.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _e.sent();
                    if (!connection || conversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    return [4 /*yield*/, db_1.db.insert(schema_2.conversationScheduledMessages).values({
                            conversationId: id,
                            userId: userId,
                            contactNumber: conversation.contactNumber || "",
                            text: text,
                            scheduledFor: new Date(scheduledFor),
                            useAI: useAI || false,
                            note: note || null,
                            status: 'scheduled',
                            createdAt: new Date(),
                        }).returning()];
                case 3:
                    log = _e.sent();
                    res.json({
                        success: true,
                        messageId: log[0].id,
                        scheduledFor: log[0].scheduledFor,
                        text: log[0].text,
                        status: 'scheduled',
                        useAI: log[0].useAI,
                        note: log[0].note,
                        createdAt: log[0].createdAt,
                    });
                    return [3 /*break*/, 5];
                case 4:
                    error_12 = _e.sent();
                    console.error("Erro ao agendar mensagem:", error_12);
                    res.status(500).json({ message: "Erro ao agendar mensagem", error: error_12.message });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/conversations/:id/scheduled-messages
     * Buscar mensagens agendadas de uma conversa (usuário regular)
     */
    app.get("/api/conversations/:id/scheduled-messages", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, id, conversation, connection, messages, error_13;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 4, , 5]);
                    userId = ((_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.claims) === null || _b === void 0 ? void 0 : _b.sub) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id);
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id)
                        })];
                case 1:
                    conversation = _d.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _d.sent();
                    if (!connection || conversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    return [4 /*yield*/, db_1.db.query.conversationScheduledMessages.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_2.conversationScheduledMessages.conversationId, id), (0, drizzle_orm_1.eq)(schema_2.conversationScheduledMessages.status, 'scheduled')),
                            orderBy: [(0, drizzle_orm_1.asc)(schema_2.conversationScheduledMessages.scheduledFor)]
                        })];
                case 3:
                    messages = _d.sent();
                    res.json(messages.map(function (m) { return ({
                        id: m.id,
                        text: m.text,
                        scheduledFor: m.scheduledFor,
                        useAI: m.useAI || false,
                        note: m.note,
                        status: m.status,
                        createdAt: m.createdAt,
                    }); }));
                    return [3 /*break*/, 5];
                case 4:
                    error_13 = _d.sent();
                    console.error("Erro ao buscar mensagens agendadas:", error_13);
                    res.status(500).json({ message: "Erro ao buscar mensagens agendadas" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    /**
     * DELETE /api/conversations/:id/scheduled-messages/:messageId
     * Cancelar mensagem agendada (usuário regular)
     */
    app.delete("/api/conversations/:id/scheduled-messages/:messageId", supabaseAuth_1.isAuthenticated, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId, _a, id, messageId, conversation, connection, error_14;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 4, , 5]);
                    userId = ((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.claims) === null || _c === void 0 ? void 0 : _c.sub) || ((_d = req.user) === null || _d === void 0 ? void 0 : _d.id);
                    _a = req.params, id = _a.id, messageId = _a.messageId;
                    return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_2.conversations.id, id)
                        })];
                case 1:
                    conversation = _e.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 2:
                    connection = _e.sent();
                    if (!connection || conversation.connectionId !== connection.id) {
                        return [2 /*return*/, res.status(403).json({ message: "Acesso negado" })];
                    }
                    return [4 /*yield*/, db_1.db.update(schema_2.conversationScheduledMessages)
                            .set({ status: 'cancelled' })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_2.conversationScheduledMessages.id, messageId), (0, drizzle_orm_1.eq)(schema_2.conversationScheduledMessages.conversationId, id), (0, drizzle_orm_1.eq)(schema_2.conversationScheduledMessages.userId, userId)))];
                case 3:
                    _e.sent();
                    res.json({ success: true, message: "Agendamento cancelado" });
                    return [3 /*break*/, 5];
                case 4:
                    error_14 = _e.sent();
                    console.error("Erro ao cancelar mensagem agendada:", error_14);
                    res.status(500).json({ message: "Erro ao cancelar agendamento" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [FOLLOW-UP] Rotas registradas");
}
