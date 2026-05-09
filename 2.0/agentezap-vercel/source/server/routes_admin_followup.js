"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.registerAdminFollowUpRoutes = registerAdminFollowUpRoutes;
var supabaseAuth_1 = require("./supabaseAuth");
var db_1 = require("./db");
var storage_1 = require("./storage");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var followUpService_1 = require("./followUpService");
var adminFollowupMigrationService_1 = require("./adminFollowupMigrationService");
// ============================================================================
// HELPERS PARA CONFIGURAÇÃO GLOBAL DE FOLLOW-UP (systemConfig)
// ============================================================================
var GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";
var BRAZIL_TIME_ZONE = "America/Sao_Paulo";
var BRAZIL_UTC_OFFSET = "-03:00";
var BRAZIL_NOW_SQL = drizzle_orm_1.sql.raw("(NOW() AT TIME ZONE '".concat(BRAZIL_TIME_ZONE, "')"));
var BRAZIL_DAY_START_SQL = drizzle_orm_1.sql.raw("DATE_TRUNC('day', NOW() AT TIME ZONE '".concat(BRAZIL_TIME_ZONE, "')"));
var BRAZIL_DAY_END_SQL = drizzle_orm_1.sql.raw("DATE_TRUNC('day', NOW() AT TIME ZONE '".concat(BRAZIL_TIME_ZONE, "') + INTERVAL '1 day'"));
var DEFAULT_GLOBAL_FOLLOWUP_CONFIG = {
    id: "global",
    userId: "admin",
    isEnabled: true,
    // Toggle follow-up para não pagantes
    followupNonPayersEnabled: true,
    maxAttempts: 8,
    intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    businessDays: [1, 2, 3, 4, 5],
    respectBusinessHours: true,
    tone: "friendly",
    formalityLevel: 3,
    useEmojis: true,
    importantInfo: [],
    infiniteLoop: true,
    infiniteLoopMinDays: 15, // Periodicidade mínima configurável
    infiniteLoopMaxDays: 30, // Periodicidade máxima configurável
};
function getGlobalFollowupConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var row, saved, _1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db.query.systemConfig.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
                        })];
                case 1:
                    row = _a.sent();
                    if (row === null || row === void 0 ? void 0 : row.valor) {
                        saved = JSON.parse(row.valor);
                        return [2 /*return*/, __assign(__assign({}, DEFAULT_GLOBAL_FOLLOWUP_CONFIG), saved)];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    _1 = _a.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/, DEFAULT_GLOBAL_FOLLOWUP_CONFIG];
            }
        });
    });
}
function saveGlobalFollowupConfig(data) {
    return __awaiter(this, void 0, void 0, function () {
        var merged, valor, existing, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    merged = __assign(__assign({}, DEFAULT_GLOBAL_FOLLOWUP_CONFIG), data);
                    valor = JSON.stringify(merged);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, db_1.db.query.systemConfig.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
                        })];
                case 2:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    return [4 /*yield*/, db_1.db.update(schema_1.systemConfig)
                            .set({ valor: valor, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, db_1.db.insert(schema_1.systemConfig).values({
                        chave: GLOBAL_FOLLOWUP_CONFIG_KEY,
                        valor: valor,
                    })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    err_1 = _a.sent();
                    console.error("[ADMIN FOLLOWUP CONFIG] Erro ao salvar config global:", err_1);
                    throw err_1;
                case 8: return [2 /*return*/, merged];
            }
        });
    });
}
function getBrazilNowDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TIME_ZONE }));
}
function toBrazilDateTimeString(value) {
    if (!value)
        return null;
    var parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        return null;
    }
    var formatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: BRAZIL_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    var parts = formatter.formatToParts(parsed).reduce(function (acc, part) {
        if (part.type !== "literal") {
            acc[part.type] = part.value;
        }
        return acc;
    }, {});
    return "".concat(parts.year, "-").concat(parts.month, "-").concat(parts.day, "T").concat(parts.hour, ":").concat(parts.minute, ":").concat(parts.second).concat(BRAZIL_UTC_OFFSET);
}
function isDueInBrazil(value) {
    var normalized = toBrazilDateTimeString(value);
    if (!normalized) {
        return false;
    }
    return new Date(normalized) <= getBrazilNowDate();
}
// ============================================================================
// ROTAS DE FOLLOW-UP DO ADMIN (CONFIGURAÇÃO GLOBAL)
// ============================================================================
function registerAdminFollowUpRoutes(app) {
    // ==================== CONFIGURAÇÃO GLOBAL ====================
    var _this = this;
    /**
     * GET /api/admin/followup/config
     * Buscar configuração global de follow-up do admin (persiste no banco)
     */
    app.get("/api/admin/followup/config", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var config, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, getGlobalFollowupConfig()];
                case 1:
                    config = _a.sent();
                    res.json(config);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Erro ao buscar config de follow-up do admin:", error_1);
                    res.status(500).json({ message: "Erro ao buscar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * PUT /api/admin/followup/config
     * Atualizar configuração global de follow-up (persiste no banco)
     */
    app.put("/api/admin/followup/config", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, incoming, min, max, saved, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    incoming = req.body;
                    // Validar periodicidade
                    if (incoming.infiniteLoopMinDays !== undefined) {
                        min = Number(incoming.infiniteLoopMinDays);
                        if (isNaN(min) || min < 1 || min > 365) {
                            return [2 /*return*/, res.status(400).json({ message: "infiniteLoopMinDays deve ser entre 1 e 365" })];
                        }
                        incoming.infiniteLoopMinDays = min;
                    }
                    if (incoming.infiniteLoopMaxDays !== undefined) {
                        max = Number(incoming.infiniteLoopMaxDays);
                        if (isNaN(max) || max < 1 || max > 365) {
                            return [2 /*return*/, res.status(400).json({ message: "infiniteLoopMaxDays deve ser entre 1 e 365" })];
                        }
                        incoming.infiniteLoopMaxDays = max;
                    }
                    if (incoming.infiniteLoopMinDays !== undefined &&
                        incoming.infiniteLoopMaxDays !== undefined &&
                        incoming.infiniteLoopMinDays > incoming.infiniteLoopMaxDays) {
                        return [2 /*return*/, res.status(400).json({ message: "infiniteLoopMinDays não pode ser maior que infiniteLoopMaxDays" })];
                    }
                    return [4 /*yield*/, saveGlobalFollowupConfig(incoming)];
                case 1:
                    saved = _b.sent();
                    console.log("[ADMIN] Config de follow-up global atualizada por admin ".concat(adminId));
                    res.json({
                        success: true,
                        message: "Configuração atualizada com sucesso",
                        config: saved,
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _b.sent();
                    console.error("Erro ao atualizar config de follow-up do admin:", error_2);
                    res.status(500).json({ message: "Erro ao atualizar configuração" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== ESTATÍSTICAS GERAIS ====================
    /**
     * GET /api/admin/followup/stats
     * Estatísticas gerais de follow-up de todas as conversas
     */
    app.get("/api/admin/followup/stats", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, _a, statusCounts, conversationStats, nonPayerStats, statsByStatus, _i, _b, row, convRow, nonPayerRow, error_3;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    adminId = (_c = req.session) === null || _c === void 0 ? void 0 : _c.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    return [4 /*yield*/, Promise.all([
                            // Count follow-up logs by status (admin table: followup_logs)
                            db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n          SELECT fl.status, COUNT(*)::int AS count\n          FROM followup_logs fl\n          INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id\n          WHERE ac.admin_id = ", "\n          GROUP BY fl.status\n        "], ["\n          SELECT fl.status, COUNT(*)::int AS count\n          FROM followup_logs fl\n          INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id\n          WHERE ac.admin_id = ", "\n          GROUP BY fl.status\n        "])), adminId)),
                            // Active conversations for pending/scheduled
                            db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n          SELECT\n            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at <= ", " THEN 1 END)::int AS pending,\n            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at >= ", " AND next_followup_at < ", " THEN 1 END)::int AS scheduled_today\n          FROM admin_conversations\n          WHERE admin_id = ", "\n        "], ["\n          SELECT\n            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at <= ", " THEN 1 END)::int AS pending,\n            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at >= ", " AND next_followup_at < ", " THEN 1 END)::int AS scheduled_today\n          FROM admin_conversations\n          WHERE admin_id = ", "\n        "])), BRAZIL_NOW_SQL, BRAZIL_DAY_START_SQL, BRAZIL_DAY_END_SQL, adminId)),
                            // Non-payer stats
                            db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n          SELECT\n            COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid,\n            COUNT(CASE WHEN payment_status = 'unpaid' AND followup_for_non_payers = true THEN 1 END)::int AS unpaid_followups_enabled\n          FROM admin_conversations\n          WHERE admin_id = ", "\n        "], ["\n          SELECT\n            COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid,\n            COUNT(CASE WHEN payment_status = 'unpaid' AND followup_for_non_payers = true THEN 1 END)::int AS unpaid_followups_enabled\n          FROM admin_conversations\n          WHERE admin_id = ", "\n        "])), adminId))
                        ])];
                case 1:
                    _a = _d.sent(), statusCounts = _a[0], conversationStats = _a[1], nonPayerStats = _a[2];
                    statsByStatus = {};
                    for (_i = 0, _b = statusCounts.rows; _i < _b.length; _i++) {
                        row = _b[_i];
                        statsByStatus[row.status] = Number(row.count) || 0;
                    }
                    convRow = conversationStats.rows[0] || {};
                    nonPayerRow = nonPayerStats.rows[0] || {};
                    res.json({
                        totalSent: statsByStatus['sent'] || 0,
                        totalFailed: statsByStatus['failed'] || 0,
                        totalCancelled: statsByStatus['cancelled'] || 0,
                        totalSkipped: statsByStatus['skipped'] || 0,
                        pending: Number(convRow.pending) || 0,
                        scheduledToday: Number(convRow.scheduled_today) || 0,
                        unpaid: Number(nonPayerRow.unpaid) || 0,
                        unpaidFollowupsEnabled: Number(nonPayerRow.unpaid_followups_enabled) || 0,
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _d.sent();
                    console.error("Erro ao buscar estatísticas de follow-up:", error_3);
                    res.status(500).json({ message: "Erro ao buscar estatísticas" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== LOGS DE FOLLOW-UP ====================
    /**
     * GET /api/admin/followup/logs
     * Logs de follow-up de todas as conversas
     */
    app.get("/api/admin/followup/logs", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, limit, status_1, result, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    limit = parseInt(req.query.limit) || 200;
                    status_1 = req.query.status;
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n        SELECT\n          fl.id,\n          fl.conversation_id AS \"conversationId\",\n          fl.contact_number AS \"contactNumber\",\n          ac.contact_name AS \"contactName\",\n          fl.status,\n          fl.message_content AS \"messageContent\",\n          fl.stage,\n          to_char(fl.executed_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') || ", " AS \"executedAt\",\n          fl.error_reason AS \"errorReason\",\n          fl.followup_type AS \"followupType\",\n          fl.payment_status AS \"paymentStatus\",\n          CASE\n            WHEN fl.scheduled_for IS NULL THEN NULL\n            ELSE to_char(fl.scheduled_for, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') || ", "\n          END AS \"scheduledFor\"\n        FROM followup_logs fl\n        INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id\n        WHERE ac.admin_id = ", "\n        ", "\n        ORDER BY fl.executed_at DESC, fl.id DESC\n        LIMIT ", "\n      "], ["\n        SELECT\n          fl.id,\n          fl.conversation_id AS \"conversationId\",\n          fl.contact_number AS \"contactNumber\",\n          ac.contact_name AS \"contactName\",\n          fl.status,\n          fl.message_content AS \"messageContent\",\n          fl.stage,\n          to_char(fl.executed_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') || ", " AS \"executedAt\",\n          fl.error_reason AS \"errorReason\",\n          fl.followup_type AS \"followupType\",\n          fl.payment_status AS \"paymentStatus\",\n          CASE\n            WHEN fl.scheduled_for IS NULL THEN NULL\n            ELSE to_char(fl.scheduled_for, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') || ", "\n          END AS \"scheduledFor\"\n        FROM followup_logs fl\n        INNER JOIN admin_conversations ac ON ac.id = fl.conversation_id\n        WHERE ac.admin_id = ", "\n        ", "\n        ORDER BY fl.executed_at DESC, fl.id DESC\n        LIMIT ", "\n      "])), BRAZIL_UTC_OFFSET, BRAZIL_UTC_OFFSET, adminId, status_1 ? (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["AND fl.status = ", ""], ["AND fl.status = ", ""])), status_1) : (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject([""], [""]))), limit))];
                case 1:
                    result = _b.sent();
                    res.json(result.rows);
                    return [3 /*break*/, 3];
                case 2:
                    error_4 = _b.sent();
                    console.error("Erro ao buscar logs de follow-up:", error_4);
                    res.status(500).json({ message: "Erro ao buscar logs" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== PENDENTES ====================
    /**
     * GET /api/admin/followup/pending
     * Lista conversas com follow-up pendente
     */
    app.get("/api/admin/followup/pending", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, pending, formatted, error_5;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["", " IS NOT NULL"], ["", " IS NOT NULL"])), schema_1.adminConversations.nextFollowupAt), (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " <= ", ""], ["", " <= ", ""])), schema_1.adminConversations.nextFollowupAt, BRAZIL_NOW_SQL)),
                            orderBy: [(0, drizzle_orm_1.asc)(schema_1.adminConversations.nextFollowupAt)],
                            limit: 100
                        })];
                case 1:
                    pending = _b.sent();
                    formatted = pending.map(function (conv) {
                        var _a;
                        return ({
                            id: conv.id,
                            contactNumber: conv.contactNumber || "",
                            contactName: conv.contactName || null,
                            stage: conv.followupStage || 0,
                            nextFollowupAt: toBrazilDateTimeString(conv.nextFollowupAt) || "",
                            lastMessageText: conv.lastMessageText || null,
                            lastMessageTime: toBrazilDateTimeString(conv.lastMessageTime) || null,
                            note: null, // followupDisabledReason not available in adminConversations
                            // 🛡️ FOLLOW-UP FOR NON-PAYERS
                            paymentStatus: conv.paymentStatus || 'pending',
                            followupForNonPayers: (_a = conv.followupForNonPayers) !== null && _a !== void 0 ? _a : true,
                            followupConfig: conv.followupConfig
                        });
                    });
                    res.json(formatted);
                    return [3 /*break*/, 3];
                case 2:
                    error_5 = _b.sent();
                    console.error("Erro ao buscar follow-ups pendentes:", error_5);
                    res.status(500).json({ message: "Erro ao buscar pendentes" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/admin/followup/agenda
     * Lista toda a agenda ativa do admin, incluindo follow-ups futuros e vencidos
     */
    app.get("/api/admin/followup/agenda", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, limit, agenda, formatted, error_6;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    limit = parseInt(req.query.limit) || 500;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.followupActive, true), (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", " IS NOT NULL"], ["", " IS NOT NULL"])), schema_1.adminConversations.nextFollowupAt)),
                            orderBy: [(0, drizzle_orm_1.asc)(schema_1.adminConversations.nextFollowupAt)],
                            limit: limit,
                        })];
                case 1:
                    agenda = _b.sent();
                    formatted = agenda.map(function (conv) {
                        var _a;
                        return ({
                            id: conv.id,
                            conversationId: conv.id,
                            contactNumber: conv.contactNumber || "",
                            contactName: conv.contactName || null,
                            stage: conv.followupStage || 0,
                            nextFollowupAt: toBrazilDateTimeString(conv.nextFollowupAt) || "",
                            status: isDueInBrazil(conv.nextFollowupAt) ? "pending" : "scheduled",
                            paymentStatus: conv.paymentStatus || "pending",
                            followupForNonPayers: (_a = conv.followupForNonPayers) !== null && _a !== void 0 ? _a : true,
                            followupConfig: conv.followupConfig,
                        });
                    });
                    res.json(formatted);
                    return [3 /*break*/, 3];
                case 2:
                    error_6 = _b.sent();
                    console.error("Erro ao buscar agenda de follow-up:", error_6);
                    res.status(500).json({ message: "Erro ao buscar agenda" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ==================== CONTROLE POR CONVERSA ====================
    /**
     * POST /api/admin/followup/conversation/:id/toggle
     * Ativar/Desativar follow-up para uma conversa específica
     */
    app.post("/api/admin/followup/conversation/:id/toggle", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, active, conversation, error_7;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 7, , 8]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    active = req.body.active;
                    if (typeof active !== 'boolean') {
                        return [2 /*return*/, res.status(400).json({ message: "active (boolean) é obrigatório" })];
                    }
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    if (!active) return [3 /*break*/, 4];
                    return [4 /*yield*/, storage_1.storage.toggleAdminConversationFollowup(id, true, {
                            manual: true,
                            resetToStageZero: true,
                        })];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, followUpService_1.followUpService.scheduleInitialFollowUp(id, { allowManualResume: true })];
                case 3:
                    _b.sent();
                    console.log("[ADMIN] Follow-up ATIVADO para conversa ".concat(id));
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, storage_1.storage.toggleAdminConversationFollowup(id, false, {
                        manual: true,
                        resetToStageZero: false,
                    })];
                case 5:
                    _b.sent();
                    console.log("[ADMIN] Follow-up DESATIVADO para conversa ".concat(id));
                    _b.label = 6;
                case 6:
                    res.json({ success: true, active: active });
                    return [3 /*break*/, 8];
                case 7:
                    error_7 = _b.sent();
                    console.error("Erro ao alternar follow-up:", error_7);
                    res.status(500).json({ message: "Erro ao alternar follow-up" });
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/admin/followup/conversation/:id/status
     * Verificar status do follow-up de uma conversa
     */
    app.get("/api/admin/followup/conversation/:id/status", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, conversation, error_8;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _c.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    res.json({
                        active: conversation.followupActive,
                        stage: conversation.followupStage,
                        nextFollowupAt: conversation.nextFollowupAt,
                        disabledReason: null, // followupDisabledReason not available in adminConversations
                        // 🛡️ FOLLOW-UP FOR NON-PAYERS
                        paymentStatus: conversation.paymentStatus || 'pending',
                        followupForNonPayers: (_b = conversation.followupForNonPayers) !== null && _b !== void 0 ? _b : true,
                        followupConfig: conversation.followupConfig
                    });
                    return [3 /*break*/, 3];
                case 2:
                    error_8 = _c.sent();
                    console.error("Erro ao buscar status de follow-up:", error_8);
                    res.status(500).json({ message: "Erro ao buscar status" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/admin/followup/conversation/:id/reset
     * Resetar ciclo de follow-up
     */
    app.post("/api/admin/followup/conversation/:id/reset", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, conversation, error_9;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                            .set({
                            followupActive: true,
                            followupStage: 0,
                            nextFollowupAt: null,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, followUpService_1.followUpService.scheduleInitialFollowUp(id)];
                case 3:
                    _b.sent();
                    console.log("[ADMIN] Ciclo de follow-up resetado para conversa ".concat(id));
                    res.json({ success: true, message: "Ciclo de follow-up resetado" });
                    return [3 /*break*/, 5];
                case 4:
                    error_9 = _b.sent();
                    console.error("Erro ao resetar follow-up:", error_9);
                    res.status(500).json({ message: "Erro ao resetar follow-up" });
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    // ==================== 🛡️ FOLLOW-UP FOR NON-PAYERS ====================
    /**
     * POST /api/admin/followup/conversation/:id/update-payment-status
     * Atualizar status de pagamento de uma conversa
     */
    app.post("/api/admin/followup/conversation/:id/update-payment-status", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, paymentStatus, validStatuses, conversation, error_10;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    paymentStatus = req.body.paymentStatus;
                    validStatuses = ['paid', 'unpaid', 'pending'];
                    if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
                        return [2 /*return*/, res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" })];
                    }
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    // Atualizar status de pagamento
                    return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                            .set({
                            paymentStatus: paymentStatus,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))];
                case 2:
                    // Atualizar status de pagamento
                    _b.sent();
                    console.log("[ADMIN] Status de pagamento atualizado para ".concat(paymentStatus, " em conversa ").concat(id));
                    res.json({
                        success: true,
                        paymentStatus: paymentStatus,
                        message: "Status de pagamento atualizado com sucesso"
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_10 = _b.sent();
                    console.error("Erro ao atualizar status de pagamento:", error_10);
                    res.status(500).json({ message: "Erro ao atualizar status de pagamento" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/admin/followup/conversation/:id/toggle-non-payer-followup
     * Ativar/Desativar follow-up para não pagantes
     */
    app.post("/api/admin/followup/conversation/:id/toggle-non-payer-followup", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, enabled, conversation, error_11;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    enabled = req.body.enabled;
                    if (typeof enabled !== 'boolean') {
                        return [2 /*return*/, res.status(400).json({ message: "enabled (boolean) é obrigatório" })];
                    }
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    // Atualizar toggle de follow-up para não pagantes
                    return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                            .set({
                            followupForNonPayers: enabled,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))];
                case 2:
                    // Atualizar toggle de follow-up para não pagantes
                    _b.sent();
                    console.log("[ADMIN] Follow-up para n\u00E3o pagantes ".concat(enabled ? 'ATIVADO' : 'DESATIVADO', " para conversa ").concat(id));
                    res.json({
                        success: true,
                        followupForNonPayers: enabled,
                        message: "Follow-up para n\u00E3o pagantes ".concat(enabled ? 'ativado' : 'desativado', " com sucesso")
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_11 = _b.sent();
                    console.error("Erro ao alternar follow-up para não pagantes:", error_11);
                    res.status(500).json({ message: "Erro ao alternar follow-up para não pagantes" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/admin/followup/conversation/:id/update-config
     * Atualizar configuração de follow-up para uma conversa
     */
    app.post("/api/admin/followup/conversation/:id/update-config", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, config, conversation, validStatuses, error_12;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    config = req.body;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    validStatuses = ['paid', 'unpaid', 'pending'];
                    if (config.paymentStatus && !validStatuses.includes(config.paymentStatus)) {
                        return [2 /*return*/, res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" })];
                    }
                    // Atualizar configuração
                    return [4 /*yield*/, db_1.db.update(schema_1.adminConversations)
                            .set(__assign(__assign({}, config), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))];
                case 2:
                    // Atualizar configuração
                    _b.sent();
                    console.log("[ADMIN] Configura\u00E7\u00E3o de follow-up atualizada para conversa ".concat(id));
                    res.json({
                        success: true,
                        message: "Configuração de follow-up atualizada com sucesso",
                        config: config
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_12 = _b.sent();
                    console.error("Erro ao atualizar configuração de follow-up:", error_12);
                    res.status(500).json({ message: "Erro ao atualizar configuração de follow-up" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // ==================== AGENDAMENTO DE MENSAGENS COM IA ====================
    /**
     * POST /api/admin/followup/conversation/:id/schedule-message
     * Agendar uma mensagem para ser enviada em uma data específica
     * Suporta texto manual ou gerado com IA
     */
    app.post("/api/admin/followup/conversation/:id/schedule-message", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, _a, scheduledFor, text, useAI, note, conversation, scheduledMessage, log, error_13;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    adminId = (_b = req.session) === null || _b === void 0 ? void 0 : _b.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    _a = req.body, scheduledFor = _a.scheduledFor, text = _a.text, useAI = _a.useAI, note = _a.note;
                    // Validação
                    if (!scheduledFor) {
                        return [2 /*return*/, res.status(400).json({ message: "scheduledFor (data/hora) é obrigatório" })];
                    }
                    if (!text) {
                        return [2 /*return*/, res.status(400).json({ message: "text é obrigatório" })];
                    }
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _c.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    scheduledMessage = {
                        conversationId: id,
                        scheduledFor: new Date(scheduledFor),
                        text: text,
                        useAI: useAI,
                        note: note || null,
                        createdBy: adminId,
                        createdAt: new Date(),
                        status: 'scheduled' // scheduled, sent, failed
                    };
                    return [4 /*yield*/, db_1.db.insert(schema_1.followupLogs).values({
                            conversationId: id,
                            contactNumber: conversation.contactNumber || "",
                            messageContent: text,
                            scheduledFor: new Date(scheduledFor),
                            executedAt: null, // Ainda não executado
                            status: 'scheduled'
                        }).returning()];
                case 2:
                    log = _c.sent();
                    console.log("[ADMIN] Mensagem agendada para conversa ".concat(id, " em ").concat(scheduledFor));
                    console.log("  Texto: ".concat(text.substring(0, 50), "..."));
                    console.log("  IA: ".concat(useAI ? 'sim' : 'não'));
                    res.json({
                        success: true,
                        messageId: log[0].id,
                        scheduledFor: log[0].scheduledFor
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_13 = _c.sent();
                    console.error("Erro ao agendar mensagem:", error_13);
                    res.status(500).json({ message: "Erro ao agendar mensagem" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * GET /api/admin/followup/conversation/:id/scheduled-messages
     * Buscar mensagens agendadas para uma conversa
     */
    app.get("/api/admin/followup/conversation/:id/scheduled-messages", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, id, conversation, messages, error_14;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    id = req.params.id;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _b.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    return [4 /*yield*/, db_1.db.query.followupLogs.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.followupLogs.conversationId, id), (0, drizzle_orm_1.eq)(schema_1.followupLogs.status, 'scheduled')),
                            orderBy: [(0, drizzle_orm_1.asc)(schema_1.followupLogs.scheduledFor)]
                        })];
                case 2:
                    messages = _b.sent();
                    res.json(messages);
                    return [3 /*break*/, 4];
                case 3:
                    error_14 = _b.sent();
                    console.error("Erro ao buscar mensagens agendadas:", error_14);
                    res.status(500).json({ message: "Erro ao buscar mensagens agendadas" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * DELETE /api/admin/followup/conversation/:id/scheduled-messages/:messageId
     * Cancelar mensagem agendada
     */
    app.delete("/api/admin/followup/conversation/:id/scheduled-messages/:messageId", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, _a, id, messageId, conversation, error_15;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 3, , 4]);
                    adminId = (_b = req.session) === null || _b === void 0 ? void 0 : _b.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    _a = req.params, id = _a.id, messageId = _a.messageId;
                    return [4 /*yield*/, db_1.db.query.adminConversations.findFirst({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id), (0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                        })];
                case 1:
                    conversation = _c.sent();
                    if (!conversation) {
                        return [2 /*return*/, res.status(404).json({ message: "Conversa não encontrada" })];
                    }
                    // Atualizar status para cancelled
                    return [4 /*yield*/, db_1.db.update(schema_1.followupLogs)
                            .set({ status: 'cancelled' })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.followupLogs.id, messageId), (0, drizzle_orm_1.eq)(schema_1.followupLogs.conversationId, id)))];
                case 2:
                    // Atualizar status para cancelled
                    _c.sent();
                    console.log("[ADMIN] Mensagem agendada ".concat(messageId, " cancelada"));
                    res.json({ success: true, message: "Mensagem agendada cancelada" });
                    return [3 /*break*/, 4];
                case 3:
                    error_15 = _c.sent();
                    console.error("Erro ao cancelar mensagem agendada:", error_15);
                    res.status(500).json({ message: "Erro ao cancelar mensagem agendada" });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * POST /api/admin/followup/reorganize
     * Recalcula a agenda preservando estágio e baseando-se no último envio já feito
     */
    app.post("/api/admin/followup/reorganize", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, result, error_16;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    adminId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.adminId;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    return [4 /*yield*/, followUpService_1.followUpService.reorganizeAllFollowups(adminId)];
                case 1:
                    result = _b.sent();
                    res.json(__assign({ success: true }, result));
                    return [3 /*break*/, 3];
                case 2:
                    error_16 = _b.sent();
                    console.error("Erro ao reorganizar follow-ups do admin:", error_16);
                    res.status(500).json({ message: "Erro ao reorganizar follow-ups" });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    app.post("/api/admin/followup/migrate-user", supabaseAuth_1.isAdmin, function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var adminId, _a, sourceEmail, sourceUserId, _b, includeLogs, _c, repairFailed, result, logsResult, _d, repairResult, _e, error_17;
        var _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _g.trys.push([0, 8, , 9]);
                    adminId = (_f = req.session) === null || _f === void 0 ? void 0 : _f.adminId;
                    _a = req.body || {}, sourceEmail = _a.sourceEmail, sourceUserId = _a.sourceUserId, _b = _a.includeLogs, includeLogs = _b === void 0 ? true : _b, _c = _a.repairFailed, repairFailed = _c === void 0 ? true : _c;
                    if (!adminId) {
                        return [2 /*return*/, res.status(401).json({ message: "Admin não autenticado" })];
                    }
                    if (!sourceEmail && !sourceUserId) {
                        return [2 /*return*/, res.status(400).json({ message: "sourceEmail ou sourceUserId é obrigatório" })];
                    }
                    return [4 /*yield*/, (0, adminFollowupMigrationService_1.migrateUserFollowupsToAdmin)({
                            adminId: adminId,
                            sourceEmail: sourceEmail,
                            sourceUserId: sourceUserId,
                        })];
                case 1:
                    result = _g.sent();
                    if (!(includeLogs === false)) return [3 /*break*/, 2];
                    _d = null;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, (0, adminFollowupMigrationService_1.migrateUserFollowupLogsToAdmin)({
                        adminId: adminId,
                        sourceEmail: sourceEmail,
                        sourceUserId: sourceUserId,
                    })];
                case 3:
                    _d = _g.sent();
                    _g.label = 4;
                case 4:
                    logsResult = _d;
                    if (!(repairFailed === false)) return [3 /*break*/, 5];
                    _e = null;
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, (0, adminFollowupMigrationService_1.repairAdminFailedFollowupRetries)({ adminId: adminId })];
                case 6:
                    _e = _g.sent();
                    _g.label = 7;
                case 7:
                    repairResult = _e;
                    console.log("[ADMIN FOLLOW-UP] Migra\u00E7\u00E3o conclu\u00EDda para admin ".concat(adminId), { result: result, logsResult: logsResult, repairResult: repairResult });
                    res.json({ success: true, result: result, logsResult: logsResult, repairResult: repairResult });
                    return [3 /*break*/, 9];
                case 8:
                    error_17 = _g.sent();
                    console.error("Erro ao migrar follow-ups para o admin:", error_17);
                    res.status(500).json({ message: (error_17 === null || error_17 === void 0 ? void 0 : error_17.message) || "Erro ao migrar follow-ups" });
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    }); });
    console.log("✅ [ADMIN FOLLOW-UP] Rotas registradas");
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9;
