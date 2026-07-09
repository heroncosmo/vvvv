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
exports.listSectors = listSectors;
exports.getSectorById = getSectorById;
exports.createSector = createSector;
exports.updateSector = updateSector;
exports.deleteSector = deleteSector;
exports.listAdminAgents = listAdminAgents;
exports.listSectorMembers = listSectorMembers;
exports.addSectorMember = addSectorMember;
exports.removeSectorMember = removeSectorMember;
exports.updateSectorMember = updateSectorMember;
exports.routeConversation = routeConversation;
exports.getAttendanceReport = getAttendanceReport;
exports.closeTicket = closeTicket;
exports.reopenTicket = reopenTicket;
exports.bulkToggleAI = bulkToggleAI;
exports.createScheduledMessage = createScheduledMessage;
exports.listScheduledMessages = listScheduledMessages;
exports.cancelScheduledMessage = cancelScheduledMessage;
exports.generateAIMessage = generateAIMessage;
var db_1 = require("../db");
function queryResult(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var result;
        var _a;
        if (params === void 0) { params = []; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db_1.pool.query(text, params)];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, {
                            rows: result.rows,
                            rowCount: (_a = result.rowCount) !== null && _a !== void 0 ? _a : 0,
                        }];
            }
        });
    });
}
function queryRows(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var result;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryResult(text, params)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows];
            }
        });
    });
}
function queryOne(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var rows;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryRows(text, params)];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows[0] || null];
            }
        });
    });
}
function normalizeText(input) {
    return String(input || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function normalizeKeywords(keywords) {
    var seen = new Set();
    for (var _i = 0, _a = keywords || []; _i < _a.length; _i++) {
        var keyword = _a[_i];
        var normalized = normalizeText(keyword);
        if (normalized)
            seen.add(normalized);
    }
    return Array.from(seen);
}
function detectIntentBySector(message, sector) {
    var normalizedMessage = normalizeText(message);
    var messageTokens = normalizedMessage.split(/\s+/).filter(Boolean);
    var keywordSet = new Set(normalizeKeywords(sector.keywords || []));
    var matches = [];
    for (var _i = 0, keywordSet_1 = keywordSet; _i < keywordSet_1.length; _i++) {
        var keyword = keywordSet_1[_i];
        if (!keyword)
            continue;
        if (normalizedMessage.includes(keyword)) {
            matches.push(keyword);
            continue;
        }
        // Match por token exato (evita falso negativo para palavras curtas)
        if (messageTokens.includes(keyword)) {
            matches.push(keyword);
        }
    }
    var score = matches.length === 0
        ? 0
        : Math.min(0.97, 0.55 + (matches.length * 0.1));
    return { score: score, matches: matches };
}
function listSectors() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryRows("SELECT s.*, a.email as auto_assign_agent_email\n     FROM sectors s\n     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text\n     ORDER BY s.name ASC")];
        });
    });
}
function getSectorById(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryOne("SELECT s.*, a.email as auto_assign_agent_email\n     FROM sectors s\n     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text\n     WHERE s.id::text = $1::text", [id])];
        });
    });
}
function createSector(input) {
    return __awaiter(this, void 0, void 0, function () {
        var keywords, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    keywords = normalizeKeywords(input.keywords || []);
                    return [4 /*yield*/, queryOne("INSERT INTO sectors (name, description, keywords, auto_assign_agent_id)\n     VALUES ($1, $2, $3, $4)\n     RETURNING *", [
                            input.name.trim(),
                            ((_a = input.description) === null || _a === void 0 ? void 0 : _a.trim()) || null,
                            keywords,
                            input.autoAssignAgentId || null,
                        ])];
                case 1:
                    result = _b.sent();
                    if (!result)
                        throw new Error("Falha ao criar setor.");
                    return [2 /*return*/, result];
            }
        });
    });
}
function updateSector(id, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var allowed, updates, values, idx, _i, allowed_1, key, col, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allowed = ["name", "description", "keywords", "autoAssignAgentId"];
                    updates = [];
                    values = [id];
                    idx = 2;
                    for (_i = 0, allowed_1 = allowed; _i < allowed_1.length; _i++) {
                        key = allowed_1[_i];
                        if (payload[key] !== undefined) {
                            col = key === "autoAssignAgentId" ? "auto_assign_agent_id" : key;
                            if (key === "keywords") {
                                updates.push("".concat(col, " = $").concat(idx));
                                values.push(normalizeKeywords(payload[key] || []));
                            }
                            else if (key === "name") {
                                updates.push("".concat(col, " = $").concat(idx));
                                values.push(String(payload[key]).trim());
                            }
                            else if (key === "description") {
                                updates.push("".concat(col, " = $").concat(idx));
                                values.push(payload[key] ? String(payload[key]).trim() : null);
                            }
                            else {
                                updates.push("".concat(col, " = $").concat(idx));
                                values.push(payload[key]);
                            }
                            idx++;
                        }
                    }
                    if (updates.length === 0)
                        throw new Error("Nenhum campo para atualizar.");
                    return [4 /*yield*/, queryOne("UPDATE sectors SET ".concat(updates.join(", "), ", updated_at = NOW() WHERE id::text = $1::text RETURNING *"), values)];
                case 1:
                    result = _a.sent();
                    if (!result)
                        throw new Error("Setor nao encontrado.");
                    return [2 /*return*/, result];
            }
        });
    });
}
function deleteSector(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryRows("DELETE FROM sectors WHERE id::text = $1::text", [id])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function listAdminAgents() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryRows("SELECT id::text as id, email, role\n     FROM admins\n     ORDER BY email ASC")];
        });
    });
}
// Sector Members
function listSectorMembers(sectorId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryRows("SELECT\n      sm.id::text as id,\n      sm.sector_id::text,\n      sm.member_id::text,\n      tm.email as member_email,\n      tm.name as member_name,\n      tm.role as member_role,\n      tm.is_active as member_is_active,\n      sm.is_primary,\n      sm.can_receive_tickets,\n      sm.max_open_tickets,\n      COALESCE(oc.open_count, 0)::int as current_open_tickets,\n      sm.assigned_by,\n      sm.assigned_at\n     FROM sector_members sm\n     JOIN team_members tm ON tm.id::text = sm.member_id::text\n     LEFT JOIN (\n       SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count\n       FROM conversations\n       WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false\n       GROUP BY assigned_to_member_id\n     ) oc ON oc.member_id = sm.member_id::text\n     WHERE sm.sector_id::text = $1::text\n     ORDER BY sm.is_primary DESC, COALESCE(oc.open_count, 0) ASC, sm.assigned_at ASC", [sectorId])];
        });
    });
}
function addSectorMember(sectorId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var result, member;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!input.isPrimary) return [3 /*break*/, 2];
                    return [4 /*yield*/, queryRows("UPDATE sector_members SET is_primary = false WHERE sector_id::text = $1::text", [sectorId])];
                case 1:
                    _e.sent();
                    _e.label = 2;
                case 2: return [4 /*yield*/, queryOne("INSERT INTO sector_members (sector_id, member_id, is_primary, can_receive_tickets, max_open_tickets, assigned_by)\n     VALUES ($1, $2, $3, $4, $5, $6)\n     ON CONFLICT (sector_id, member_id)\n     DO UPDATE SET\n       is_primary = EXCLUDED.is_primary,\n       can_receive_tickets = EXCLUDED.can_receive_tickets,\n       max_open_tickets = EXCLUDED.max_open_tickets,\n       assigned_by = EXCLUDED.assigned_by,\n       assigned_at = NOW()\n     RETURNING id::text", [
                        sectorId,
                        input.memberId,
                        (_a = input.isPrimary) !== null && _a !== void 0 ? _a : false,
                        (_b = input.canReceiveTickets) !== null && _b !== void 0 ? _b : true,
                        (_c = input.maxOpenTickets) !== null && _c !== void 0 ? _c : 10,
                        (_d = input.assignedBy) !== null && _d !== void 0 ? _d : null,
                    ])];
                case 3:
                    result = _e.sent();
                    if (!result)
                        throw new Error("Falha ao adicionar membro ao setor.");
                    return [4 /*yield*/, queryOne("SELECT\n      sm.id::text as id,\n      sm.sector_id::text,\n      sm.member_id::text,\n      tm.email as member_email,\n      tm.name as member_name,\n      tm.role as member_role,\n      tm.is_active as member_is_active,\n      sm.is_primary,\n      sm.can_receive_tickets,\n      sm.max_open_tickets,\n      sm.current_open_tickets,\n      sm.assigned_by,\n      sm.assigned_at\n     FROM sector_members sm\n     JOIN team_members tm ON tm.id::text = sm.member_id::text\n     WHERE sm.id::text = $1::text", [result.id])];
                case 4:
                    member = _e.sent();
                    return [2 /*return*/, member];
            }
        });
    });
}
function removeSectorMember(sectorId, memberId) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryResult("DELETE FROM sector_members WHERE sector_id::text = $1::text AND member_id::text = $2::text", [sectorId, memberId])];
                case 1:
                    result = _a.sent();
                    if (result.rowCount === 0)
                        throw new Error("Membro não encontrado no setor.");
                    return [2 /*return*/];
            }
        });
    });
}
function updateSectorMember(sectorId, memberId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var updates, values, idx, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    updates = [];
                    values = [sectorId, memberId];
                    idx = 3;
                    if (!(input.isPrimary !== undefined)) return [3 /*break*/, 3];
                    if (!input.isPrimary) return [3 /*break*/, 2];
                    return [4 /*yield*/, queryRows("UPDATE sector_members SET is_primary = false WHERE sector_id::text = $1::text", [sectorId])];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    updates.push("is_primary = $".concat(idx));
                    values.push(input.isPrimary);
                    idx++;
                    _a.label = 3;
                case 3:
                    if (input.canReceiveTickets !== undefined) {
                        updates.push("can_receive_tickets = $".concat(idx));
                        values.push(input.canReceiveTickets);
                        idx++;
                    }
                    if (input.maxOpenTickets !== undefined) {
                        updates.push("max_open_tickets = $".concat(idx));
                        values.push(input.maxOpenTickets);
                        idx++;
                    }
                    if (updates.length === 0)
                        throw new Error("Nenhum campo para atualizar.");
                    return [4 /*yield*/, queryOne("UPDATE sector_members\n     SET ".concat(updates.join(", "), "\n     WHERE sector_id::text = $1::text AND member_id::text = $2::text\n     RETURNING id::text"), values)];
                case 4:
                    result = _a.sent();
                    if (!result)
                        throw new Error("Membro não encontrado.");
                    return [2 /*return*/, queryOne("SELECT\n      sm.id::text as id,\n      sm.sector_id::text,\n      sm.member_id::text,\n      tm.email as member_email,\n      tm.name as member_name,\n      tm.role as member_role,\n      tm.is_active as member_is_active,\n      sm.is_primary,\n      sm.can_receive_tickets,\n      sm.max_open_tickets,\n      sm.current_open_tickets,\n      sm.assigned_by,\n      sm.assigned_at\n     FROM sector_members sm\n     JOIN team_members tm ON tm.id::text = sm.member_id::text\n     WHERE sm.id::text = $1::text", [result.id])];
            }
        });
    });
}
// Routing
function routeConversation(conversationId, messageText) {
    return __awaiter(this, void 0, void 0, function () {
        var sectors, selectedSector, bestConfidence, bestReason, _i, sectors_1, sector, _a, score, matches, pickMemberFromSector, assignedMember, fallbackSector, intent;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, queryRows("SELECT * FROM sectors ORDER BY name ASC")];
                case 1:
                    sectors = _b.sent();
                    if (sectors.length === 0) {
                        throw new Error("Nenhum setor configurado.");
                    }
                    selectedSector = null;
                    bestConfidence = 0;
                    bestReason = "";
                    for (_i = 0, sectors_1 = sectors; _i < sectors_1.length; _i++) {
                        sector = sectors_1[_i];
                        _a = detectIntentBySector(messageText, { name: sector.name, keywords: sector.keywords || [] }), score = _a.score, matches = _a.matches;
                        if (score > bestConfidence) {
                            bestConfidence = score;
                            selectedSector = sector;
                            bestReason = matches.length
                                ? "Match por inten\u00E7\u00E3o (".concat(matches.length, " keyword(s): ").concat(matches.slice(0, 5).join(", "), ")")
                                : "Sem match";
                        }
                    }
                    if (!(!selectedSector || bestConfidence <= 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, queryOne("SELECT s.*\n       FROM sectors s\n       JOIN sector_members sm ON sm.sector_id::text = s.id::text\n       JOIN team_members tm ON tm.id::text = sm.member_id::text\n       WHERE sm.can_receive_tickets = true AND tm.is_active = true\n       GROUP BY s.id\n       ORDER BY s.name ASC\n       LIMIT 1")];
                case 2:
                    selectedSector = _b.sent();
                    bestConfidence = 0.35;
                    bestReason = "Fallback por disponibilidade";
                    _b.label = 3;
                case 3:
                    if (!selectedSector) {
                        throw new Error("Nenhum setor disponível para roteamento.");
                    }
                    pickMemberFromSector = function (sectorId) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, queryOne("SELECT\n      sm.member_id::text,\n      tm.name as member_name,\n      COALESCE(loads.open_count, 0)::int as current_load,\n      COALESCE(sm.max_open_tickets, 10)::int as max_open_tickets\n     FROM sector_members sm\n     JOIN team_members tm ON tm.id::text = sm.member_id::text\n     LEFT JOIN (\n       SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count\n       FROM conversations\n       WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false\n       GROUP BY assigned_to_member_id\n     ) loads ON loads.member_id = sm.member_id::text\n     WHERE sm.sector_id::text = $1::text\n       AND sm.can_receive_tickets = true\n       AND tm.is_active = true\n       AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)\n     ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC, sm.assigned_at ASC\n     LIMIT 1", [sectorId])];
                        });
                    }); };
                    return [4 /*yield*/, pickMemberFromSector(selectedSector.id)];
                case 4:
                    assignedMember = _b.sent();
                    if (!!assignedMember) return [3 /*break*/, 7];
                    return [4 /*yield*/, queryOne("SELECT s.*\n       FROM sectors s\n       JOIN sector_members sm ON sm.sector_id::text = s.id::text\n       JOIN team_members tm ON tm.id::text = sm.member_id::text\n       LEFT JOIN (\n         SELECT assigned_to_member_id::text as member_id, COUNT(*)::int as open_count\n         FROM conversations\n         WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false\n         GROUP BY assigned_to_member_id\n       ) loads ON loads.member_id = sm.member_id::text\n       WHERE sm.can_receive_tickets = true\n         AND tm.is_active = true\n         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)\n       GROUP BY s.id\n       ORDER BY s.name ASC\n       LIMIT 1")];
                case 5:
                    fallbackSector = _b.sent();
                    if (!fallbackSector) {
                        throw new Error("Setor \"".concat(selectedSector.name, "\" sem membros ativos/dispon\u00EDveis e sem fallback global."));
                    }
                    selectedSector = fallbackSector;
                    return [4 /*yield*/, pickMemberFromSector(selectedSector.id)];
                case 6:
                    assignedMember = _b.sent();
                    bestReason = "".concat(bestReason, " | Fallback para setor com membro dispon\u00EDvel");
                    bestConfidence = Math.min(bestConfidence, 0.5);
                    _b.label = 7;
                case 7:
                    if (!assignedMember) {
                        throw new Error("Setor \"".concat(selectedSector.name, "\" n\u00E3o possui membros ativos/dispon\u00EDveis."));
                    }
                    intent = normalizeText(messageText).split(/\s+/).slice(0, 4).join("_") || "geral";
                    return [4 /*yield*/, queryRows("UPDATE conversations\n     SET sector_id = $1,\n         assigned_to_member_id = $2,\n         routing_intent = $3,\n         routing_confidence = $4,\n         routing_at = NOW(),\n         updated_at = NOW()\n     WHERE id::text = $5::text", [selectedSector.id, assignedMember.member_id, intent, bestConfidence, conversationId])];
                case 8:
                    _b.sent();
                    return [4 /*yield*/, queryRows("INSERT INTO routing_logs (\n      conversation_id,\n      message_text,\n      detected_intent,\n      matched_sector_id,\n      confidence_score,\n      assigned_to_member_id,\n      routing_method\n    ) VALUES ($1, $2, $3, $4, $5, $6, $7)", [conversationId, messageText, intent, selectedSector.id, bestConfidence, assignedMember.member_id, "intent+fallback"])];
                case 9:
                    _b.sent();
                    return [2 /*return*/, {
                            sectorId: selectedSector.id,
                            sectorName: selectedSector.name,
                            assignedMemberId: assignedMember.member_id,
                            assignedMemberName: assignedMember.member_name,
                            method: "intent+fallback",
                            confidence: bestConfidence,
                            reason: bestReason,
                        }];
            }
        });
    });
}
// Reports
function getAttendanceReport(startDate, endDate) {
    return __awaiter(this, void 0, void 0, function () {
        var summary, bySectorRaw, byMemberRaw;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryOne("SELECT\n      COUNT(*)::int as total_conversations,\n      COUNT(CASE WHEN COALESCE(c.is_closed, false) = false THEN 1 END)::int as open_conversations,\n      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_conversations\n     FROM conversations c\n     WHERE c.routing_at IS NOT NULL\n       AND c.routing_at::date BETWEEN $1::date AND $2::date", [startDate, endDate])];
                case 1:
                    summary = _a.sent();
                    return [4 /*yield*/, queryRows("SELECT\n      s.id::text as sector_id,\n      s.name as sector_name,\n      COUNT(c.id)::int as assigned_count,\n      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,\n      AVG(\n        CASE\n          WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL\n          THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at))\n          ELSE NULL\n        END\n      ) as avg_open_time_seconds\n     FROM sectors s\n     LEFT JOIN conversations c\n       ON c.sector_id::text = s.id::text\n       AND c.routing_at::date BETWEEN $1::date AND $2::date\n     GROUP BY s.id, s.name\n     ORDER BY assigned_count DESC, s.name ASC", [startDate, endDate])];
                case 2:
                    bySectorRaw = _a.sent();
                    return [4 /*yield*/, queryRows("SELECT\n      tm.id::text as member_id,\n      tm.email as member_email,\n      tm.name as member_name,\n      COUNT(c.id)::int as assigned_count,\n      COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,\n      AVG(\n        CASE\n          WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL\n          THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at))\n          ELSE NULL\n        END\n      ) as avg_open_time_seconds\n     FROM team_members tm\n     LEFT JOIN conversations c\n       ON c.assigned_to_member_id::text = tm.id::text\n       AND c.routing_at::date BETWEEN $1::date AND $2::date\n     GROUP BY tm.id, tm.email, tm.name\n     ORDER BY assigned_count DESC, tm.name ASC", [startDate, endDate])];
                case 3:
                    byMemberRaw = _a.sent();
                    return [2 /*return*/, {
                            totalConversations: Number((summary === null || summary === void 0 ? void 0 : summary.total_conversations) || 0),
                            totalOpen: Number((summary === null || summary === void 0 ? void 0 : summary.open_conversations) || 0),
                            totalClosed: Number((summary === null || summary === void 0 ? void 0 : summary.closed_conversations) || 0),
                            bySector: bySectorRaw.map(function (row) { return ({
                                sectorId: row.sector_id,
                                sectorName: row.sector_name,
                                assignedCount: Number(row.assigned_count || 0),
                                closedCount: Number(row.closed_count || 0),
                                avgOpenTime: Number(row.avg_open_time_seconds || 0),
                            }); }),
                            byMember: byMemberRaw.map(function (row) { return ({
                                memberId: row.member_id,
                                memberEmail: row.member_email,
                                memberName: row.member_name,
                                assignedCount: Number(row.assigned_count || 0),
                                closedCount: Number(row.closed_count || 0),
                                avgOpenTime: Number(row.avg_open_time_seconds || 0),
                            }); }),
                        }];
            }
        });
    });
}
// Ticket closure
function closeTicket(conversationId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryOne("SELECT id::text, COALESCE(is_closed, false) as is_closed FROM conversations WHERE id::text = $1::text", [conversationId])];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        throw new Error("Conversa não encontrada.");
                    if (existing.is_closed)
                        throw new Error("Conversa já está fechada.");
                    return [4 /*yield*/, queryOne("UPDATE conversations\n     SET is_closed = true,\n         closed_at = NOW(),\n         closed_by = $1,\n         closure_reason = $2,\n         updated_at = NOW()\n     WHERE id::text = $3::text\n     RETURNING *", [input.closedBy, input.reason || null, conversationId])];
                case 2:
                    result = _a.sent();
                    return [4 /*yield*/, queryRows("INSERT INTO ticket_closure_logs (conversation_id, action, performed_by, performed_by_name, reason)\n     VALUES ($1, 'closed', $2, $3, $4)", [conversationId, input.closedBy || "system", input.closedByName || "Sistema", input.reason || null])];
                case 3:
                    _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
function reopenTicket(conversationId, input) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryOne("SELECT id::text, COALESCE(is_closed, false) as is_closed FROM conversations WHERE id::text = $1::text", [conversationId])];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        throw new Error("Conversa não encontrada.");
                    if (!existing.is_closed)
                        throw new Error("Conversa já está aberta.");
                    return [4 /*yield*/, queryOne("UPDATE conversations\n     SET is_closed = false,\n         closed_at = NULL,\n         closed_by = NULL,\n         closure_reason = NULL,\n         updated_at = NOW()\n     WHERE id::text = $1::text\n     RETURNING *", [conversationId])];
                case 2:
                    result = _a.sent();
                    return [4 /*yield*/, queryRows("INSERT INTO ticket_closure_logs (conversation_id, action, performed_by, performed_by_name)\n     VALUES ($1, 'reopened', $2, $3)", [conversationId, input.reopenedBy || "system", input.reopenedByName || "Sistema"])];
                case 3:
                    _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
// Bulk actions
function bulkToggleAI(conversationIds, disable, input) {
    return __awaiter(this, void 0, void 0, function () {
        var updated, _i, conversationIds_1, conversationId, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    updated = [];
                    _i = 0, conversationIds_1 = conversationIds;
                    _a.label = 1;
                case 1:
                    if (!(_i < conversationIds_1.length)) return [3 /*break*/, 6];
                    conversationId = conversationIds_1[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, queryRows("UPDATE conversations\n         SET followup_active = $1,\n             followup_disabled_reason = $2,\n             updated_at = NOW()\n         WHERE id::text = $3::text", [!disable, disable ? "IA desativada por ".concat(input.performedByName) : null, conversationId])];
                case 3:
                    _a.sent();
                    updated.push({ conversationId: conversationId, success: true });
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    updated.push({
                        conversationId: conversationId,
                        success: false,
                        error: error_1.message,
                    });
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [4 /*yield*/, queryRows("INSERT INTO bulk_actions_log (action_type, performed_by, performed_by_name, affected_conversations, conversation_ids, details)\n     VALUES ($1, $2, $3, $4, $5, $6)", [disable ? "disable_ai" : "enable_ai", input.performedBy || "system", input.performedByName || "Sistema", conversationIds.length, conversationIds, JSON.stringify({ disable: disable })])];
                case 7:
                    _a.sent();
                    return [2 /*return*/, {
                            count: conversationIds.length,
                            updated: updated,
                        }];
            }
        });
    });
}
// Scheduled messages
function createScheduledMessage(input) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryOne("SELECT connection_id::text FROM conversations WHERE id::text = $1::text", [input.conversationId])];
                case 1:
                    conversation = _a.sent();
                    if (!(conversation === null || conversation === void 0 ? void 0 : conversation.connection_id)) {
                        throw new Error("Conversa inválida para agendamento (connection_id não encontrado).");
                    }
                    return [4 /*yield*/, queryOne("INSERT INTO scheduled_messages (\n      conversation_id,\n      connection_id,\n      message_text,\n      message_type,\n      ai_prompt,\n      scheduled_at,\n      timezone,\n      created_by,\n      created_by_name\n    )\n    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)\n    RETURNING *", [
                            input.conversationId,
                            conversation.connection_id,
                            input.messageText,
                            input.messageType || "text",
                            input.aiPrompt || null,
                            input.scheduledAt,
                            input.timezone || "America/Sao_Paulo",
                            input.createdBy,
                            input.createdByName,
                        ])];
                case 2:
                    result = _a.sent();
                    if (!result)
                        throw new Error("Falha ao criar mensagem agendada.");
                    return [2 /*return*/, result];
            }
        });
    });
}
function listScheduledMessages(input) {
    return __awaiter(this, void 0, void 0, function () {
        var params, where, sql;
        return __generator(this, function (_a) {
            params = [];
            where = ["1=1"];
            if (input.conversationId) {
                params.push(input.conversationId);
                where.push("conversation_id::text = $".concat(params.length, "::text"));
            }
            if (input.status) {
                params.push(input.status);
                where.push("status = $".concat(params.length));
            }
            sql = "SELECT * FROM scheduled_messages WHERE ".concat(where.join(" AND "), " ORDER BY scheduled_at ASC");
            return [2 /*return*/, queryRows(sql, params)];
        });
    });
}
function cancelScheduledMessage(id) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, queryResult("UPDATE scheduled_messages SET status = 'cancelled', updated_at = NOW() WHERE id::text = $1::text", [id])];
                case 1:
                    result = _a.sent();
                    if (result.rowCount === 0)
                        throw new Error("Mensagem agendada não encontrada.");
                    return [2 /*return*/];
            }
        });
    });
}
// AI message generation
function generateAIMessage(prompt, _conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, {
                    message: "AI: ".concat(prompt),
                    aiGenerated: true,
                }];
        });
    });
}
