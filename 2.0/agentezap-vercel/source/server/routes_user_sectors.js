"use strict";
/**
 * User Sectors Routes - Parte 4
 * Gerenciamento de setores para o DONO do SaaS (usuário normal, não admin).
 *
 * IMPORTANTE: Rotas com path fixo DEVEM vir ANTES de rotas com parâmetros (/:id).
 * Ordem:
 *   1. GET  /api/user/sectors          → listar todos
 *   2. GET  /api/user/sectors/reports  → relatórios (ANTES de /:id)
 *   3. GET  /api/user/sectors/conversations (ANTES de /:id)
 *   4. GET  /api/user/team-members-available
 *   5. POST /api/user/sectors          → criar
 *   6. POST /api/user/sectors/route    → roteamento
 *   7. POST /api/user/sectors/transfer → encaminhamento
 *   8. GET  /api/user/sectors/:id      → detalhe (DEPOIS dos paths fixos)
 *   9. PATCH /api/user/sectors/:id     → atualizar
 *  10. DELETE /api/user/sectors/:id    → deletar
 *  11. Rotas de membros /:id/members
 *  12. GET /api/member/sectors/my
 */
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
exports.registerUserSectorRoutes = registerUserSectorRoutes;
var db_1 = require("./db");
var supabaseAuth_1 = require("./supabaseAuth");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getUserId(req) {
    var _a, _b, _c;
    return ((_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.claims) === null || _b === void 0 ? void 0 : _b.sub) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id);
}
function asyncHandler(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res)).catch(next);
    };
}
function q(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var r;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.pool.query(text, params)];
                case 1:
                    r = _a.sent();
                    return [2 /*return*/, r.rows];
            }
        });
    });
}
function qOne(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var rows;
        var _a;
        if (params === void 0) { params = []; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, q(text, params)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function normText(s) {
    return String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function normKeywords(kws) {
    var seen = new Set();
    for (var _i = 0, _a = kws || []; _i < _a.length; _i++) {
        var k = _a[_i];
        var n = normText(k);
        if (n)
            seen.add(n);
    }
    return Array.from(seen);
}
// Verifica se é o dono (tem claims.sub = userId e NÃO é membro de equipe)
function requireOwner(req, res, next) {
    var _a;
    var userId = getUserId(req);
    if (!userId)
        return res.status(403).json({ error: "Acesso negado." });
    // Membros de equipe autenticados via Bearer token do membro NÃO devem acessar rotas de dono
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.isMember) === true)
        return res.status(403).json({ error: "Acesso restrito ao dono da conta." });
    next();
}
// Detecta intenção para roteamento por keyword
function detectIntent(msg, sector) {
    var normMsg = normText(msg);
    var tokens = normMsg.split(/\s+/).filter(Boolean);
    var kws = new Set(normKeywords(sector.keywords || []));
    var matches = [];
    for (var _i = 0, kws_1 = kws; _i < kws_1.length; _i++) {
        var kw = kws_1[_i];
        if (!kw)
            continue;
        if (normMsg.includes(kw) || tokens.includes(kw)) {
            matches.push(kw);
        }
    }
    var score = matches.length === 0 ? 0 : Math.min(0.97, 0.55 + matches.length * 0.1);
    return { score: score, matches: matches };
}
// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
function registerUserSectorRoutes(app) {
    var _this = this;
    console.log("[UserSectors] Registrando rotas de setores para usuário normal...");
    // ============================================================
    // 1. GET /api/user/sectors - Listar setores do usuário dono
    // ============================================================
    app.get("/api/user/sectors", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, sectors;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, q("SELECT s.*, \n              (SELECT COUNT(*)::int FROM sector_members sm WHERE sm.sector_id = s.id AND sm.owner_id = $1) as member_count\n       FROM sectors s\n       WHERE s.owner_id = $1\n       ORDER BY s.name ASC", [ownerId])];
                case 1:
                    sectors = _a.sent();
                    res.json({ items: sectors });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 2. GET /api/user/sectors/reports - Relatórios (ANTES de /:id!)
    // ============================================================
    app.get("/api/user/sectors/reports", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, startDate, endDate, summary, bySector, byMember;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                    endDate = req.query.endDate || new Date().toISOString().split("T")[0];
                    return [4 /*yield*/, qOne("SELECT\n         COUNT(c.id)::int as total_conversations,\n         COUNT(CASE WHEN COALESCE(c.is_closed, false) = false THEN 1 END)::int as open_conversations,\n         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_conversations\n       FROM conversations c\n       JOIN whatsapp_connections wc ON wc.id = c.connection_id\n       WHERE wc.user_id = $1\n         AND c.routing_at IS NOT NULL\n         AND c.routing_at::date BETWEEN $2::date AND $3::date", [ownerId, startDate, endDate])];
                case 1:
                    summary = _a.sent();
                    return [4 /*yield*/, q("SELECT\n         s.id as sector_id,\n         s.name as sector_name,\n         COUNT(c.id)::int as assigned_count,\n         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,\n         ROUND(AVG(\n           CASE WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL\n                THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600\n                ELSE NULL END\n         )::numeric, 2) as avg_hours\n       FROM sectors s\n       LEFT JOIN conversations c ON c.sector_id = s.id\n         AND c.routing_at::date BETWEEN $2::date AND $3::date\n       WHERE s.owner_id = $1\n       GROUP BY s.id, s.name\n       ORDER BY assigned_count DESC, s.name ASC", [ownerId, startDate, endDate])];
                case 2:
                    bySector = _a.sent();
                    return [4 /*yield*/, q("SELECT\n         tm.id as member_id,\n         tm.name as member_name,\n         tm.email as member_email,\n         COUNT(c.id)::int as assigned_count,\n         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,\n         ROUND(AVG(\n           CASE WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL\n                THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600\n                ELSE NULL END\n         )::numeric, 2) as avg_hours\n       FROM team_members tm\n       LEFT JOIN conversations c ON c.assigned_to_member_id = tm.id\n         AND c.routing_at::date BETWEEN $2::date AND $3::date\n       WHERE tm.owner_id = $1\n       GROUP BY tm.id, tm.name, tm.email\n       ORDER BY assigned_count DESC, tm.name ASC", [ownerId, startDate, endDate])];
                case 3:
                    byMember = _a.sent();
                    res.json({
                        period: { startDate: startDate, endDate: endDate },
                        totalConversations: (summary === null || summary === void 0 ? void 0 : summary.total_conversations) || 0,
                        totalOpen: (summary === null || summary === void 0 ? void 0 : summary.open_conversations) || 0,
                        totalClosed: (summary === null || summary === void 0 ? void 0 : summary.closed_conversations) || 0,
                        bySector: (bySector || []).map(function (r) { return ({
                            sectorId: r.sector_id,
                            sectorName: r.sector_name,
                            assignedCount: r.assigned_count,
                            closedCount: r.closed_count,
                            avgHours: r.avg_hours != null ? Number(r.avg_hours) : null,
                        }); }),
                        byMember: (byMember || []).map(function (r) { return ({
                            memberId: r.member_id,
                            memberName: r.member_name,
                            memberEmail: r.member_email,
                            assignedCount: r.assigned_count,
                            closedCount: r.closed_count,
                            avgHours: r.avg_hours != null ? Number(r.avg_hours) : null,
                        }); }),
                    });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 3. GET /api/user/sectors/conversations - Filtro por setor (ANTES de /:id!)
    // ============================================================
    app.get("/api/user/sectors/conversations", supabaseAuth_1.isAuthenticated, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, sectorId, convs_1, convs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    sectorId = req.query.sectorId;
                    if (!sectorId) return [3 /*break*/, 2];
                    return [4 /*yield*/, q("SELECT c.* FROM conversations c\n         JOIN whatsapp_connections wc ON wc.id = c.connection_id\n         WHERE wc.user_id = $1 AND c.sector_id = $2\n         ORDER BY c.updated_at DESC", [ownerId, sectorId])];
                case 1:
                    convs_1 = _a.sent();
                    return [2 /*return*/, res.json({ items: convs_1 })];
                case 2: return [4 /*yield*/, q("SELECT c.* FROM conversations c\n       JOIN whatsapp_connections wc ON wc.id = c.connection_id\n       WHERE wc.user_id = $1\n       ORDER BY c.updated_at DESC LIMIT 200", [ownerId])];
                case 3:
                    convs = _a.sent();
                    res.json({ items: convs });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 4. GET /api/user/team-members-available - Membros para vincular
    // ============================================================
    app.get("/api/user/team-members-available", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, members;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, q("SELECT id, name, email, role, is_active FROM team_members WHERE owner_id = $1 ORDER BY name ASC", [ownerId])];
                case 1:
                    members = _a.sent();
                    res.json({ items: members });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 5. POST /api/user/sectors - Criar setor
    // ============================================================
    app.post("/api/user/sectors", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, name, description, keywords, kws, existing, sector;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, name = _a.name, description = _a.description, keywords = _a.keywords;
                    if (!name || String(name).trim().length < 2) {
                        return [2 /*return*/, res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." })];
                    }
                    kws = normKeywords(Array.isArray(keywords)
                        ? keywords
                        : typeof keywords === "string"
                            ? keywords.split(",").map(function (k) { return k.trim(); }).filter(Boolean)
                            : []);
                    return [4 /*yield*/, qOne("SELECT id FROM sectors WHERE name = $1 AND owner_id = $2", [name.trim(), ownerId])];
                case 1:
                    existing = _b.sent();
                    if (existing)
                        return [2 /*return*/, res.status(400).json({ error: "Já existe um setor com este nome." })];
                    return [4 /*yield*/, qOne("INSERT INTO sectors (name, description, keywords, owner_id)\n       VALUES ($1, $2, $3, $4) RETURNING *", [name.trim(), (description === null || description === void 0 ? void 0 : description.trim()) || null, kws, ownerId])];
                case 2:
                    sector = _b.sent();
                    res.status(201).json({ sector: sector });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 6. POST /api/user/sectors/route - Roteamento por intenção (ANTES de /:id)
    // ============================================================
    app.post("/api/user/sectors/route", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, conversationId, messageText, conv, sectors, selected, bestScore, bestReason, _i, sectors_1, sec, _b, score, matches, member, intent, _1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, conversationId = _a.conversationId, messageText = _a.messageText;
                    if (!conversationId || !messageText) {
                        return [2 /*return*/, res.status(400).json({ error: "conversationId e messageText são obrigatórios." })];
                    }
                    return [4 /*yield*/, qOne("SELECT c.id, c.connection_id FROM conversations c\n       JOIN whatsapp_connections wc ON wc.id = c.connection_id\n       WHERE c.id = $1 AND wc.user_id = $2", [conversationId, ownerId])];
                case 1:
                    conv = _c.sent();
                    if (!conv)
                        return [2 /*return*/, res.status(404).json({ error: "Conversa não encontrada." })];
                    return [4 /*yield*/, q("SELECT * FROM sectors WHERE owner_id = $1 ORDER BY name ASC", [ownerId])];
                case 2:
                    sectors = _c.sent();
                    if (sectors.length === 0)
                        return [2 /*return*/, res.status(400).json({ error: "Nenhum setor configurado." })];
                    selected = null;
                    bestScore = 0;
                    bestReason = "";
                    for (_i = 0, sectors_1 = sectors; _i < sectors_1.length; _i++) {
                        sec = sectors_1[_i];
                        _b = detectIntent(messageText, sec), score = _b.score, matches = _b.matches;
                        if (score > bestScore) {
                            bestScore = score;
                            selected = sec;
                            bestReason = matches.length ? "Match por keywords: ".concat(matches.slice(0, 5).join(", ")) : "Sem match";
                        }
                    }
                    if (!(!selected || bestScore <= 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, qOne("SELECT s.* FROM sectors s\n         JOIN sector_members sm ON sm.sector_id = s.id AND sm.owner_id = $1\n         JOIN team_members tm ON tm.id = sm.member_id\n         WHERE s.owner_id = $1 AND sm.can_receive_tickets = true AND tm.is_active = true\n         GROUP BY s.id ORDER BY s.name ASC LIMIT 1", [ownerId])];
                case 3:
                    selected = _c.sent();
                    bestScore = 0.35;
                    bestReason = "Fallback por disponibilidade";
                    _c.label = 4;
                case 4:
                    if (!selected)
                        return [2 /*return*/, res.status(400).json({ error: "Nenhum setor disponível para roteamento." })];
                    return [4 /*yield*/, qOne("SELECT sm.member_id, tm.name as member_name,\n              COALESCE(loads.open_count, 0) as current_load,\n              COALESCE(sm.max_open_tickets, 10) as max_open_tickets\n       FROM sector_members sm\n       JOIN team_members tm ON tm.id = sm.member_id\n       LEFT JOIN (\n         SELECT assigned_to_member_id as mid, COUNT(*) as open_count\n         FROM conversations WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false\n         GROUP BY assigned_to_member_id\n       ) loads ON loads.mid = sm.member_id\n       WHERE sm.sector_id = $1 AND sm.owner_id = $2\n         AND sm.can_receive_tickets = true AND tm.is_active = true\n         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)\n       ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC LIMIT 1", [selected.id, ownerId])];
                case 5:
                    member = _c.sent();
                    intent = normText(messageText).split(/\s+/).slice(0, 4).join("_") || "geral";
                    return [4 /*yield*/, db_1.pool.query("UPDATE conversations SET\n         sector_id = $1,\n         assigned_to_member_id = $2,\n         routing_intent = $3,\n         routing_confidence = $4,\n         routing_at = NOW(),\n         updated_at = NOW()\n       WHERE id = $5", [selected.id, (member === null || member === void 0 ? void 0 : member.member_id) || null, intent, bestScore, conversationId])];
                case 6:
                    _c.sent();
                    _c.label = 7;
                case 7:
                    _c.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, db_1.pool.query("INSERT INTO routing_logs (conversation_id, message_text, detected_intent, matched_sector_id, confidence_score, assigned_to_member_id, routing_method)\n         VALUES ($1, $2, $3, $4, $5, $6, $7)", [conversationId, messageText, intent, selected.id, bestScore, (member === null || member === void 0 ? void 0 : member.member_id) || null, "intent+fallback"])];
                case 8:
                    _c.sent();
                    return [3 /*break*/, 10];
                case 9:
                    _1 = _c.sent();
                    return [3 /*break*/, 10];
                case 10:
                    res.json({
                        sectorId: selected.id,
                        sectorName: selected.name,
                        assignedMemberId: (member === null || member === void 0 ? void 0 : member.member_id) || null,
                        assignedMemberName: (member === null || member === void 0 ? void 0 : member.member_name) || null,
                        confidence: bestScore,
                        reason: bestReason,
                    });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 7. POST /api/user/sectors/transfer - Encaminhamento (ANTES de /:id)
    // ============================================================
    app.post("/api/user/sectors/transfer", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, conversationId, targetSectorId, reason, targetSector, conv, member;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, conversationId = _a.conversationId, targetSectorId = _a.targetSectorId, reason = _a.reason;
                    if (!conversationId || !targetSectorId) {
                        return [2 /*return*/, res.status(400).json({ error: "conversationId e targetSectorId são obrigatórios." })];
                    }
                    return [4 /*yield*/, qOne("SELECT * FROM sectors WHERE id = $1 AND owner_id = $2", [targetSectorId, ownerId])];
                case 1:
                    targetSector = _b.sent();
                    if (!targetSector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor destino não encontrado." })];
                    return [4 /*yield*/, qOne("SELECT c.id FROM conversations c\n       JOIN whatsapp_connections wc ON wc.id = c.connection_id\n       WHERE c.id = $1 AND wc.user_id = $2", [conversationId, ownerId])];
                case 2:
                    conv = _b.sent();
                    if (!conv)
                        return [2 /*return*/, res.status(404).json({ error: "Conversa não encontrada." })];
                    return [4 /*yield*/, qOne("SELECT sm.member_id, tm.name as member_name\n       FROM sector_members sm\n       JOIN team_members tm ON tm.id = sm.member_id\n       LEFT JOIN (\n         SELECT assigned_to_member_id as mid, COUNT(*) as open_count\n         FROM conversations WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false\n         GROUP BY assigned_to_member_id\n       ) loads ON loads.mid = sm.member_id\n       WHERE sm.sector_id = $1 AND sm.owner_id = $2\n         AND sm.can_receive_tickets = true AND tm.is_active = true\n         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)\n       ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC LIMIT 1", [targetSectorId, ownerId])];
                case 3:
                    member = _b.sent();
                    return [4 /*yield*/, db_1.pool.query("UPDATE conversations SET\n         sector_id = $1,\n         assigned_to_member_id = $2,\n         routing_at = NOW(),\n         routing_intent = 'transfer',\n         updated_at = NOW()\n       WHERE id = $3", [targetSectorId, (member === null || member === void 0 ? void 0 : member.member_id) || null, conversationId])];
                case 4:
                    _b.sent();
                    res.json({
                        success: true,
                        sectorId: targetSector.id,
                        sectorName: targetSector.name,
                        assignedMemberId: (member === null || member === void 0 ? void 0 : member.member_id) || null,
                        assignedMemberName: (member === null || member === void 0 ? void 0 : member.member_name) || null,
                        reason: reason || "Encaminhamento manual",
                    });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 8. GET /api/user/sectors/:id - Detalhe (DEPOIS dos paths fixos!)
    // ============================================================
    app.get("/api/user/sectors/:id", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, sector;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, qOne("SELECT * FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _a.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    res.json({ sector: sector });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 9. PATCH /api/user/sectors/:id - Atualizar setor
    // ============================================================
    app.patch("/api/user/sectors/:id", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, name, description, keywords, sector, updates, values, idx, kws, updated;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, name = _a.name, description = _a.description, keywords = _a.keywords;
                    return [4 /*yield*/, qOne("SELECT * FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _b.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    updates = [];
                    values = [req.params.id, ownerId];
                    idx = 3;
                    if (name !== undefined) {
                        if (String(name).trim().length < 2)
                            return [2 /*return*/, res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." })];
                        updates.push("name = $".concat(idx++));
                        values.push(name.trim());
                    }
                    if (description !== undefined) {
                        updates.push("description = $".concat(idx++));
                        values.push((description === null || description === void 0 ? void 0 : description.trim()) || null);
                    }
                    if (keywords !== undefined) {
                        kws = normKeywords(Array.isArray(keywords) ? keywords : String(keywords).split(",").map(function (k) { return k.trim(); }).filter(Boolean));
                        updates.push("keywords = $".concat(idx++));
                        values.push(kws);
                    }
                    if (updates.length === 0)
                        return [2 /*return*/, res.status(400).json({ error: "Nenhum campo para atualizar." })];
                    updates.push("updated_at = NOW()");
                    return [4 /*yield*/, qOne("UPDATE sectors SET ".concat(updates.join(", "), " WHERE id = $1 AND owner_id = $2 RETURNING *"), values)];
                case 2:
                    updated = _b.sent();
                    res.json({ sector: updated });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 10. DELETE /api/user/sectors/:id - Deletar setor
    // ============================================================
    app.delete("/api/user/sectors/:id", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, db_1.pool.query("DELETE FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    r = _a.sent();
                    if (r.rowCount === 0)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    res.status(204).send();
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 11. Membros de Setor
    // ============================================================
    // GET /api/user/sectors/:id/members - Listar membros do setor
    app.get("/api/user/sectors/:id/members", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, sector, members;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, qOne("SELECT id FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _a.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    return [4 /*yield*/, q("SELECT\n          sm.id,\n          sm.sector_id,\n          sm.member_id,\n          sm.is_primary,\n          sm.can_receive_tickets,\n          sm.max_open_tickets,\n          COALESCE(sm.current_open_tickets, 0) as current_open_tickets,\n          sm.assigned_at,\n          sm.assigned_by,\n          tm.name as member_name,\n          tm.email as member_email,\n          tm.role as member_role,\n          tm.is_active as member_is_active\n       FROM sector_members sm\n       JOIN team_members tm ON tm.id = sm.member_id\n       WHERE sm.sector_id = $1 AND sm.owner_id = $2\n       ORDER BY sm.is_primary DESC, tm.name ASC", [req.params.id, ownerId])];
                case 2:
                    members = _a.sent();
                    res.json({ items: members });
                    return [2 /*return*/];
            }
        });
    }); }));
    // POST /api/user/sectors/:id/members - Vincular membro ao setor
    app.post("/api/user/sectors/:id/members", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, memberId, isPrimary, canReceiveTickets, maxOpenTickets, sector, member, added;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, memberId = _a.memberId, isPrimary = _a.isPrimary, canReceiveTickets = _a.canReceiveTickets, maxOpenTickets = _a.maxOpenTickets;
                    if (!memberId)
                        return [2 /*return*/, res.status(400).json({ error: "memberId é obrigatório." })];
                    return [4 /*yield*/, qOne("SELECT id FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _b.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    return [4 /*yield*/, qOne("SELECT id FROM team_members WHERE id = $1 AND owner_id = $2", [memberId, ownerId])];
                case 2:
                    member = _b.sent();
                    if (!member)
                        return [2 /*return*/, res.status(404).json({ error: "Membro não encontrado." })];
                    if (!isPrimary) return [3 /*break*/, 4];
                    return [4 /*yield*/, db_1.pool.query("UPDATE sector_members SET is_primary = false WHERE sector_id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4: return [4 /*yield*/, db_1.pool.query("INSERT INTO sector_members (sector_id, member_id, owner_id, is_primary, can_receive_tickets, max_open_tickets, assigned_by, assigned_at)\n       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())\n       ON CONFLICT (sector_id, member_id) DO UPDATE SET\n         is_primary = EXCLUDED.is_primary,\n         can_receive_tickets = EXCLUDED.can_receive_tickets,\n         max_open_tickets = EXCLUDED.max_open_tickets,\n         assigned_by = EXCLUDED.assigned_by,\n         assigned_at = NOW()", [req.params.id, memberId, ownerId, isPrimary !== null && isPrimary !== void 0 ? isPrimary : false, canReceiveTickets !== null && canReceiveTickets !== void 0 ? canReceiveTickets : true, maxOpenTickets !== null && maxOpenTickets !== void 0 ? maxOpenTickets : 10, getUserId(req)])];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, qOne("SELECT sm.*, tm.name as member_name, tm.email as member_email, tm.role as member_role, tm.is_active as member_is_active\n       FROM sector_members sm JOIN team_members tm ON tm.id = sm.member_id\n       WHERE sm.sector_id = $1 AND sm.member_id = $2 AND sm.owner_id = $3", [req.params.id, memberId, ownerId])];
                case 6:
                    added = _b.sent();
                    res.status(201).json({ member: added });
                    return [2 /*return*/];
            }
        });
    }); }));
    // DELETE /api/user/sectors/:id/members/:memberId - Desvincular membro
    app.delete("/api/user/sectors/:id/members/:memberId", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, sector, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerId = getUserId(req);
                    return [4 /*yield*/, qOne("SELECT id FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _a.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    return [4 /*yield*/, db_1.pool.query("DELETE FROM sector_members WHERE sector_id = $1 AND member_id = $2 AND owner_id = $3", [req.params.id, req.params.memberId, ownerId])];
                case 2:
                    r = _a.sent();
                    if (r.rowCount === 0)
                        return [2 /*return*/, res.status(404).json({ error: "Membro não encontrado no setor." })];
                    res.status(204).send();
                    return [2 /*return*/];
            }
        });
    }); }));
    // PATCH /api/user/sectors/:id/members/:memberId - Atualizar config do membro no setor
    app.patch("/api/user/sectors/:id/members/:memberId", supabaseAuth_1.isAuthenticated, requireOwner, asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var ownerId, _a, isPrimary, canReceiveTickets, maxOpenTickets, sector, updates, values, idx, updated;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ownerId = getUserId(req);
                    _a = req.body || {}, isPrimary = _a.isPrimary, canReceiveTickets = _a.canReceiveTickets, maxOpenTickets = _a.maxOpenTickets;
                    return [4 /*yield*/, qOne("SELECT id FROM sectors WHERE id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 1:
                    sector = _b.sent();
                    if (!sector)
                        return [2 /*return*/, res.status(404).json({ error: "Setor não encontrado." })];
                    if (!isPrimary) return [3 /*break*/, 3];
                    return [4 /*yield*/, db_1.pool.query("UPDATE sector_members SET is_primary = false WHERE sector_id = $1 AND owner_id = $2", [req.params.id, ownerId])];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    updates = [];
                    values = [req.params.id, req.params.memberId, ownerId];
                    idx = 4;
                    if (isPrimary !== undefined) {
                        updates.push("is_primary = $".concat(idx++));
                        values.push(isPrimary);
                    }
                    if (canReceiveTickets !== undefined) {
                        updates.push("can_receive_tickets = $".concat(idx++));
                        values.push(canReceiveTickets);
                    }
                    if (maxOpenTickets !== undefined) {
                        updates.push("max_open_tickets = $".concat(idx++));
                        values.push(maxOpenTickets);
                    }
                    if (updates.length === 0)
                        return [2 /*return*/, res.status(400).json({ error: "Nenhum campo para atualizar." })];
                    return [4 /*yield*/, db_1.pool.query("UPDATE sector_members SET ".concat(updates.join(", "), " WHERE sector_id = $1 AND member_id = $2 AND owner_id = $3"), values)];
                case 4:
                    _b.sent();
                    return [4 /*yield*/, qOne("SELECT sm.*, tm.name as member_name, tm.email as member_email, tm.role as member_role, tm.is_active as member_is_active\n       FROM sector_members sm JOIN team_members tm ON tm.id = sm.member_id\n       WHERE sm.sector_id = $1 AND sm.member_id = $2 AND sm.owner_id = $3", [req.params.id, req.params.memberId, ownerId])];
                case 5:
                    updated = _b.sent();
                    res.json({ member: updated });
                    return [2 /*return*/];
            }
        });
    }); }));
    // ============================================================
    // 12. GET /api/member/sectors/my - Setor(es) do membro logado
    // ============================================================
    app.get("/api/member/sectors/my", asyncHandler(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var token, session, sectors;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    token = req.headers["x-member-token"] || req.query.memberToken;
                    if (!token)
                        return [2 /*return*/, res.status(401).json({ error: "Token de membro necessário." })];
                    return [4 /*yield*/, qOne("SELECT tms.member_id, tm.owner_id \n       FROM team_member_sessions tms \n       JOIN team_members tm ON tm.id = tms.member_id\n       WHERE tms.token = $1 AND tms.expires_at > NOW()", [token])];
                case 1:
                    session = _a.sent();
                    if (!session)
                        return [2 /*return*/, res.status(401).json({ error: "Sessão inválida ou expirada." })];
                    return [4 /*yield*/, q("SELECT s.id, s.name, s.description, sm.is_primary, sm.can_receive_tickets\n       FROM sectors s\n       JOIN sector_members sm ON sm.sector_id = s.id\n       WHERE sm.member_id = $1 AND sm.owner_id = $2\n       ORDER BY s.name ASC", [session.member_id, session.owner_id])];
                case 2:
                    sectors = _a.sent();
                    res.json({ items: sectors });
                    return [2 /*return*/];
            }
        });
    }); }));
    console.log("[UserSectors] Rotas registradas com sucesso!");
}
