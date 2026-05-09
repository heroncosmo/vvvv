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
exports.registerNotapayersRoutes = registerNotapayersRoutes;
var middleware_1 = require("./middleware");
var storage_1 = require("./storage");
var db_1 = require("./db");
var zod_1 = require("zod");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ============================================================================
// ROUTES PARA FOLLOW-UP DE NÃO PAGANTES
// ============================================================================
function registerNotapayersRoutes(app) {
    // ==================== CONFIGURAÇÃO ====================
    var _this = this;
    /**
     * GET /api/admin/notapayers/followup-config
     * Retorna configuração atual de follow-up para não pagantes
     */
    app.get("/api/admin/notapayers/followup-config", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var config, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.storage.getNotapayerFollowupConfig()];
                case 1:
                    config = _a.sent();
                    res.json({
                        success: true,
                        config: config || {
                            isEnabled: false,
                            activeDays: 3, // Dias após expiração
                            maxAttempts: 3,
                            messageTemplate: "Olá! Seu plano expirou. Quer renovar?",
                            tone: "friendly",
                            useEmojis: true,
                            activeDaysStart: 1,
                            activeDaysEnd: 7,
                        }
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Erro ao buscar configuração:", error_1);
                    res.status(500).json({ success: false, message: "Erro ao buscar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * PUT /api/admin/notapayers/followup-config
     * Atualiza configuração de follow-up para não pagantes
     */
    app.put("/api/admin/notapayers/followup-config", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var schema, parsed, config, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    schema = zod_1.z.object({
                        isEnabled: zod_1.z.boolean().optional(),
                        activeDays: zod_1.z.number().optional(),
                        maxAttempts: zod_1.z.number().optional(),
                        messageTemplate: zod_1.z.string().optional(),
                        tone: zod_1.z.enum(["friendly", "professional", "urgent"]).optional(),
                        useEmojis: zod_1.z.boolean().optional(),
                        activeDaysStart: zod_1.z.number().optional(),
                        activeDaysEnd: zod_1.z.number().optional(),
                    });
                    parsed = schema.safeParse(req.body);
                    if (!parsed.success) {
                        return [2 /*return*/, res.status(400).json({
                                success: false,
                                message: "Dados inválidos",
                                errors: parsed.error.errors
                            })];
                    }
                    return [4 /*yield*/, storage_1.storage.updateNotapayerFollowupConfig(parsed.data)];
                case 1:
                    config = _a.sent();
                    res.json({
                        success: true,
                        config: config,
                        message: "Configuração atualizada com sucesso"
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error("Erro ao atualizar configuração:", error_2);
                    res.status(500).json({ success: false, message: "Erro ao atualizar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== LISTA DE NÃO PAGANTES ====================
    /**
     * GET /api/admin/notapayers/list
     * Lista não pagantes elegíveis para follow-up
     */
    app.get("/api/admin/notapayers/list", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var config, now_1, activeDaysStart_1, activeDaysEnd_1, inactiveSubscriptions, eligibleSubscriptions, listWithAttempts, error_3;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, storage_1.storage.getNotapayerFollowupConfig()];
                case 1:
                    config = _a.sent();
                    if (!config || !config.isEnabled) {
                        return [2 /*return*/, res.json({
                                success: true,
                                data: [],
                                message: "Follow-up para não pagantes está desativado"
                            })];
                    }
                    now_1 = new Date();
                    activeDaysStart_1 = config.activeDaysStart || 1;
                    activeDaysEnd_1 = config.activeDaysEnd || 7;
                    return [4 /*yield*/, db_1.db.query.subscriptions.findMany({
                            where: function (subs, _a) {
                                var and = _a.and, lte = _a.lte, or = _a.or, eq = _a.eq;
                                return and(or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')), lte(subs.dataFim, now_1));
                            },
                            with: {
                                user: true,
                                plan: true,
                            }
                        })];
                case 2:
                    inactiveSubscriptions = _a.sent();
                    eligibleSubscriptions = inactiveSubscriptions.filter(function (sub) {
                        var dataFim = sub.dataFim ? new Date(sub.dataFim) : null;
                        if (!dataFim)
                            return false;
                        var daysSinceExpiry = (now_1.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24);
                        return daysSinceExpiry >= activeDaysStart_1 && daysSinceExpiry <= activeDaysEnd_1;
                    });
                    return [4 /*yield*/, Promise.all(eligibleSubscriptions.map(function (sub) { return __awaiter(_this, void 0, void 0, function () {
                            var attempts, dataFim;
                            var _a, _b, _c, _d, _e, _f;
                            return __generator(this, function (_g) {
                                switch (_g.label) {
                                    case 0: return [4 /*yield*/, storage_1.storage.getNotapayerFollowupAttempts(sub.userId)];
                                    case 1:
                                        attempts = _g.sent();
                                        dataFim = sub.dataFim ? new Date(sub.dataFim) : null;
                                        return [2 /*return*/, {
                                                id: sub.id,
                                                userId: sub.userId,
                                                userName: ((_a = sub.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = sub.user) === null || _b === void 0 ? void 0 : _b.nome) || "Desconhecido",
                                                userEmail: ((_c = sub.user) === null || _c === void 0 ? void 0 : _c.email) || "",
                                                phone: ((_d = sub.user) === null || _d === void 0 ? void 0 : _d.whatsappNumber) || "",
                                                planName: ((_e = sub.plan) === null || _e === void 0 ? void 0 : _e.nome) || "Plano",
                                                planPrice: ((_f = sub.plan) === null || _f === void 0 ? void 0 : _f.valor) || "0",
                                                expiresAt: sub.dataFim,
                                                daysSinceExpiry: dataFim ? Math.floor((now_1.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24)) : 0,
                                                attempts: attempts.length,
                                                lastAttempt: attempts[attempts.length - 1] || null,
                                            }];
                                }
                            });
                        }); }))];
                case 3:
                    listWithAttempts = _a.sent();
                    res.json({
                        success: true,
                        data: listWithAttempts,
                        total: listWithAttempts.length,
                    });
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error("Erro ao listar não pagantes:", error_3);
                    res.status(500).json({ success: false, message: "Erro ao listar não pagantes" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    // ==================== ENVIAR FOLLOW-UP ====================
    /**
     * POST /api/admin/notapayers/send-followup/:userId
     * Envia follow-up manual para um não pagante específico
     */
    app.post("/api/admin/notapayers/send-followup/:userId", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_1, user, inactiveSub, config, message, connection, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    userId_1 = req.params.userId;
                    return [4 /*yield*/, storage_1.storage.getUser(userId_1)];
                case 1:
                    user = _a.sent();
                    if (!user) {
                        return [2 /*return*/, res.status(404).json({ success: false, message: "Usuário não encontrado" })];
                    }
                    return [4 /*yield*/, db_1.db.query.subscriptions.findFirst({
                            where: function (subs, _a) {
                                var and = _a.and, lte = _a.lte, or = _a.or, eq = _a.eq;
                                return and(eq(subs.userId, userId_1), or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')), lte(subs.dataFim, new Date()));
                            }
                        })];
                case 2:
                    inactiveSub = _a.sent();
                    if (!inactiveSub) {
                        return [2 /*return*/, res.status(404).json({
                                success: false,
                                message: "Usuário não tem assinatura inativa"
                            })];
                    }
                    return [4 /*yield*/, storage_1.storage.getNotapayerFollowupConfig()];
                case 3:
                    config = _a.sent();
                    if (!config) {
                        return [2 /*return*/, res.status(500).json({
                                success: false,
                                message: "Configuração de follow-up não encontrada"
                            })];
                    }
                    message = config.messageTemplate.replace(/{userName}/g, user.name || "cliente");
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId_1)];
                case 4:
                    connection = _a.sent();
                    if (!connection) {
                        return [2 /*return*/, res.status(404).json({
                                success: false,
                                message: "WhatsApp não conectado para este usuário"
                            })];
                    }
                    // Aqui você usaria o serviço de envio de WhatsApp real
                    // Por enquanto, vamos apenas registrar no log
                    console.log("[NOTAPAYER-FOLLOWUP] Enviando para ".concat(user.whatsappNumber, ": ").concat(message));
                    // Registrar tentativa
                    return [4 /*yield*/, storage_1.storage.createNotapayerFollowupAttempt({
                            userId: userId_1,
                            subscriptionId: inactiveSub.id,
                            message: message,
                            sentAt: new Date(),
                            status: "sent",
                        })];
                case 5:
                    // Registrar tentativa
                    _a.sent();
                    res.json({
                        success: true,
                        message: "Follow-up enviado com sucesso",
                        user: {
                            id: user.id,
                            name: user.name,
                            phone: user.whatsappNumber,
                        },
                        sentMessage: message,
                    });
                    return [3 /*break*/, 7];
                case 6:
                    error_4 = _a.sent();
                    console.error("Erro ao enviar follow-up:", error_4);
                    res.status(500).json({ success: false, message: "Erro ao enviar follow-up" });
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // ==================== HISTÓRICO ====================
    /**
     * GET /api/admin/notapayers/history
     * Lista histórico de follow-ups enviados
     */
    app.get("/api/admin/notapayers/history", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var limit, attempts, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    limit = parseInt(req.query.limit) || 100;
                    return [4 /*yield*/, storage_1.storage.getNotapayerFollowupHistory(limit)];
                case 1:
                    attempts = _a.sent();
                    res.json({
                        success: true,
                        data: attempts,
                        total: attempts.length,
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _a.sent();
                    console.error("Erro ao buscar histórico:", error_5);
                    res.status(500).json({ success: false, message: "Erro ao buscar histórico" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== REATIVAR ASSINATURA ====================
    /**
     * POST /api/admin/notapayers/resubscribe/:userId
     * Reativa assinatura de não pagante (opcional)
     */
    app.post("/api/admin/notapayers/resubscribe/:userId", middleware_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var userId_2, user, inactiveSub, updatedSub, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    userId_2 = req.params.userId;
                    return [4 /*yield*/, storage_1.storage.getUser(userId_2)];
                case 1:
                    user = _a.sent();
                    if (!user) {
                        return [2 /*return*/, res.status(404).json({ success: false, message: "Usuário não encontrado" })];
                    }
                    return [4 /*yield*/, db_1.db.query.subscriptions.findFirst({
                            where: function (subs, _a) {
                                var and = _a.and, lte = _a.lte, or = _a.or, eq = _a.eq;
                                return and(eq(subs.userId, userId_2), or(eq(subs.status, 'expired'), eq(subs.status, 'cancelled')), lte(subs.dataFim, new Date()));
                            }
                        })];
                case 2:
                    inactiveSub = _a.sent();
                    if (!inactiveSub) {
                        return [2 /*return*/, res.status(404).json({
                                success: false,
                                message: "Usuário não tem assinatura inativa"
                            })];
                    }
                    return [4 /*yield*/, db_1.db.update(schema_1.subscriptions)
                            .set({
                            status: "active",
                            dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.id, inactiveSub.id))
                            .returning()];
                case 3:
                    updatedSub = _a.sent();
                    res.json({
                        success: true,
                        message: "Assinatura reativada com sucesso",
                        subscription: updatedSub[0],
                    });
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _a.sent();
                    console.error("Erro ao reativar assinatura:", error_6);
                    res.status(500).json({ success: false, message: "Erro ao reativar assinatura" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [NOTAPAYERS] Rotas de follow-up para não pagantes registradas");
}
