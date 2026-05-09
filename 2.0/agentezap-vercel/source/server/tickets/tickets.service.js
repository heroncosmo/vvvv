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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTicket = createTicket;
exports.listUserTickets = listUserTickets;
exports.getUserTicketById = getUserTicketById;
exports.updateUserTicket = updateUserTicket;
exports.deleteUserTicket = deleteUserTicket;
exports.listMessagesForUser = listMessagesForUser;
exports.sendUserMessage = sendUserMessage;
exports.markReadByUser = markReadByUser;
exports.listAdminTickets = listAdminTickets;
exports.getAdminTicketById = getAdminTicketById;
exports.updateAdminTicket = updateAdminTicket;
exports.updateTicketStatus = updateTicketStatus;
exports.listMessagesForAdmin = listMessagesForAdmin;
exports.sendAdminMessage = sendAdminMessage;
exports.markReadByAdmin = markReadByAdmin;
exports.routeTicket = routeTicket;
exports.getTicketReports = getTicketReports;
var path_1 = require("path");
var crypto_1 = require("crypto");
var db_1 = require("../db");
var supabaseAuth_1 = require("../supabaseAuth");
var BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';
// Upload helper — Supabase Storage
function uploadImageBuffer(buffer, originalName, mimeType) {
    return __awaiter(this, void 0, void 0, function () {
        var sha256, ext, key, error, urlData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sha256 = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
                    ext = path_1.default.extname(originalName) || '.png';
                    key = "tickets/".concat(Date.now(), "-").concat(crypto_1.default.randomBytes(8).toString('hex')).concat(ext);
                    return [4 /*yield*/, supabaseAuth_1.supabase.storage.from(BUCKET).upload(key, buffer, {
                            contentType: mimeType,
                            upsert: false,
                            cacheControl: '3600',
                        })];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw new Error("Supabase Storage upload failed: ".concat(error.message));
                    urlData = supabaseAuth_1.supabase.storage.from(BUCKET).getPublicUrl(key).data;
                    return [2 /*return*/, {
                            provider: 'supabase',
                            key: key,
                            url: urlData.publicUrl,
                            sha256: sha256
                        }];
            }
        });
    });
}
// Helper: execute raw SQL via pool (since ticket tables aren't in Drizzle schema)
function query(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var result;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.pool.query(text, params)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows];
            }
        });
    });
}
function queryOne(text_1) {
    return __awaiter(this, arguments, void 0, function (text, params) {
        var result;
        if (params === void 0) { params = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.pool.query(text, params)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows[0] || null];
            }
        });
    });
}
function normalizeText(input) {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
function normalizeKeywords(keywords) {
    var seen = new Set();
    for (var _i = 0, keywords_1 = keywords; _i < keywords_1.length; _i++) {
        var keyword = keywords_1[_i];
        var normalized = normalizeText(keyword);
        if (normalized) {
            seen.add(normalized);
        }
    }
    return Array.from(seen);
}
function fetchSectorsForRouting(client) {
    return __awaiter(this, void 0, void 0, function () {
        var sqlText, result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    sqlText = "SELECT id, name, keywords, auto_assign_agent_id FROM sectors";
                    if (!client) return [3 /*break*/, 2];
                    return [4 /*yield*/, client.query(sqlText)];
                case 1:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, db_1.pool.query(sqlText)];
                case 3:
                    _a = _b.sent();
                    _b.label = 4;
                case 4:
                    result = _a;
                    return [2 /*return*/, (result.rows || [])];
            }
        });
    });
}
function findBestSector(text, sectors) {
    var normalizedText = normalizeText(text);
    if (!normalizedText || sectors.length === 0)
        return null;
    var best = null;
    for (var _i = 0, sectors_1 = sectors; _i < sectors_1.length; _i++) {
        var sector = sectors_1[_i];
        var keywords = normalizeKeywords(sector.keywords || []);
        if (keywords.length === 0)
            continue;
        var matches = keywords.filter(function (keyword) { return normalizedText.includes(keyword); });
        if (matches.length === 0)
            continue;
        if (!best || matches.length > best.matches.length) {
            best = { sector: sector, matches: matches };
            continue;
        }
        if (best && matches.length === best.matches.length) {
            var currentScore = keywords.join(' ').length;
            var bestScore = normalizeKeywords(best.sector.keywords || []).join(' ').length;
            if (currentScore > bestScore) {
                best = { sector: sector, matches: matches };
            }
        }
    }
    return best;
}
// Transaction helper using pool directly
function withTransaction(fn) {
    return __awaiter(this, void 0, void 0, function () {
        var client, result, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, 8, 9]);
                    return [4 /*yield*/, client.query('BEGIN')];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, fn(client)];
                case 4:
                    result = _a.sent();
                    return [4 /*yield*/, client.query('COMMIT')];
                case 5:
                    _a.sent();
                    return [2 /*return*/, result];
                case 6:
                    e_1 = _a.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 7:
                    _a.sent();
                    throw e_1;
                case 8:
                    client.release();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
// Create ticket
function createTicket(input) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, withTransaction(function (client) { return __awaiter(_this, void 0, void 0, function () {
                    var ticketResult, ticket, routingText, sectors, best, updateResult;
                    var _a, _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0: return [4 /*yield*/, client.query("INSERT INTO tickets (user_id, subject, description, priority, status)\n       VALUES ($1, $2, $3, $4, 'open')\n       RETURNING *", [input.userId, input.subject.trim(), ((_a = input.description) === null || _a === void 0 ? void 0 : _a.trim()) || null, input.priority])];
                            case 1:
                                ticketResult = _c.sent();
                                ticket = ticketResult.rows[0];
                                if (!((_b = input.description) === null || _b === void 0 ? void 0 : _b.trim())) return [3 /*break*/, 3];
                                return [4 /*yield*/, client.query("INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body)\n         VALUES ($1, 'user', $2, $3)", [ticket.id, input.userId, input.description.trim()])];
                            case 2:
                                _c.sent();
                                _c.label = 3;
                            case 3:
                                routingText = "".concat(input.subject || '', " ").concat(input.description || '').trim();
                                if (!routingText) return [3 /*break*/, 6];
                                return [4 /*yield*/, fetchSectorsForRouting(client)];
                            case 4:
                                sectors = _c.sent();
                                best = findBestSector(routingText, sectors);
                                if (!best) return [3 /*break*/, 6];
                                return [4 /*yield*/, client.query("UPDATE tickets\n           SET sector_id = $2,\n               assigned_admin_id = CASE WHEN $3 IS NOT NULL THEN $3 ELSE assigned_admin_id END,\n               updated_at = NOW()\n           WHERE id = $1\n           RETURNING *", [ticket.id, best.sector.id, best.sector.auto_assign_agent_id])];
                            case 5:
                                updateResult = _c.sent();
                                ticket = updateResult.rows[0] || ticket;
                                _c.label = 6;
                            case 6: return [2 /*return*/, ticket];
                        }
                    });
                }); })];
        });
    });
}
// List user tickets
function listUserTickets(userId, page, limit) {
    return __awaiter(this, void 0, void 0, function () {
        var offset, _a, items, totalRow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    offset = (page - 1) * limit;
                    return [4 /*yield*/, Promise.all([
                            query("SELECT t.*, u.name as user_name\n       FROM tickets t\n       JOIN users u ON u.id = t.user_id::text\n       WHERE t.user_id = $1 AND t.deleted_at IS NULL\n       ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC\n       LIMIT $2 OFFSET $3", [userId, limit, offset]),
                            queryOne("SELECT COUNT(*) as count FROM tickets WHERE user_id = $1 AND deleted_at IS NULL", [userId])
                        ])];
                case 1:
                    _a = _b.sent(), items = _a[0], totalRow = _a[1];
                    return [2 /*return*/, { items: items, total: parseInt((totalRow === null || totalRow === void 0 ? void 0 : totalRow.count) || '0'), page: page, limit: limit }];
            }
        });
    });
}
// Get user ticket
function getUserTicketById(ticketId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryOne("SELECT t.*, u.name as user_name\n     FROM tickets t\n     JOIN users u ON u.id = t.user_id::text\n     WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL", [ticketId, userId])];
        });
    });
}
// Update user ticket
function updateUserTicket(ticketId, userId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var allowed, updates, values, idx, _i, allowed_1, key, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allowed = ['subject', 'description', 'priority'];
                    updates = [];
                    values = [ticketId];
                    idx = 2;
                    for (_i = 0, allowed_1 = allowed; _i < allowed_1.length; _i++) {
                        key = allowed_1[_i];
                        if (payload[key] !== undefined) {
                            updates.push("".concat(key, " = $").concat(idx));
                            values.push(payload[key]);
                            idx++;
                        }
                    }
                    updates.push("updated_at = NOW()");
                    values.push(userId);
                    return [4 /*yield*/, queryOne("UPDATE tickets SET ".concat(updates.join(', '), " WHERE id = $1 AND user_id = $").concat(idx, " AND deleted_at IS NULL RETURNING *"), values)];
                case 1:
                    result = _a.sent();
                    if (!result)
                        throw new Error('Ticket não encontrado.');
                    return [2 /*return*/, result];
            }
        });
    });
}
// Delete user ticket
function deleteUserTicket(ticketId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, query("UPDATE tickets SET deleted_at = NOW() WHERE id = $1 AND user_id = $2", [ticketId, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// List messages for user
function listMessagesForUser(ticketId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, msgIds, allAttachments, attachMap, _i, allAttachments_1, att, _a, messages_1, msg, _b, messages_2, msg;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, query("SELECT tm.* FROM ticket_messages tm\n     JOIN tickets t ON t.id = tm.ticket_id\n     WHERE tm.ticket_id = $1 AND t.user_id = $2 AND tm.deleted_at IS NULL\n     ORDER BY tm.created_at ASC", [ticketId, userId])];
                case 1:
                    messages = _c.sent();
                    msgIds = messages.map(function (m) { return m.id; });
                    if (!(msgIds.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, query("SELECT * FROM ticket_attachments WHERE message_id = ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY created_at ASC", [msgIds])];
                case 2:
                    allAttachments = _c.sent();
                    attachMap = new Map();
                    for (_i = 0, allAttachments_1 = allAttachments; _i < allAttachments_1.length; _i++) {
                        att = allAttachments_1[_i];
                        if (!attachMap.has(att.message_id))
                            attachMap.set(att.message_id, []);
                        attachMap.get(att.message_id).push(att);
                    }
                    for (_a = 0, messages_1 = messages; _a < messages_1.length; _a++) {
                        msg = messages_1[_a];
                        msg.attachments = attachMap.get(msg.id) || [];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    for (_b = 0, messages_2 = messages; _b < messages_2.length; _b++) {
                        msg = messages_2[_b];
                        msg.attachments = [];
                    }
                    _c.label = 4;
                case 4: return [2 /*return*/, messages];
            }
        });
    });
}
// Send user message
function sendUserMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            if (params.body.trim().length === 0 && params.files.length === 0) {
                throw new Error('Mensagem vazia.');
            }
            return [2 /*return*/, withTransaction(function (client) { return __awaiter(_this, void 0, void 0, function () {
                    var ticketResult, ticket, msgResult, msg, _i, _a, f, uploaded, statusUpdate;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, client.query("SELECT * FROM tickets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [params.ticketId, params.userId])];
                            case 1:
                                ticketResult = _b.sent();
                                ticket = ticketResult.rows[0];
                                if (!ticket)
                                    throw new Error('Ticket não encontrado.');
                                return [4 /*yield*/, client.query("INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body, has_attachments)\n       VALUES ($1, 'user', $2, $3, $4) RETURNING *", [params.ticketId, params.userId, params.body.trim() || '[imagem]', params.files.length > 0])];
                            case 2:
                                msgResult = _b.sent();
                                msg = msgResult.rows[0];
                                _i = 0, _a = params.files;
                                _b.label = 3;
                            case 3:
                                if (!(_i < _a.length)) return [3 /*break*/, 7];
                                f = _a[_i];
                                return [4 /*yield*/, uploadImageBuffer(f.buffer, f.originalname, f.mimetype)];
                            case 4:
                                uploaded = _b.sent();
                                return [4 /*yield*/, client.query("INSERT INTO ticket_attachments\n         (ticket_id, message_id, kind, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256)\n         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9)", [params.ticketId, msg.id, f.originalname, f.mimetype, f.size, uploaded.provider, uploaded.key, uploaded.url, uploaded.sha256])];
                            case 5:
                                _b.sent();
                                _b.label = 6;
                            case 6:
                                _i++;
                                return [3 /*break*/, 3];
                            case 7:
                                statusUpdate = ['resolved', 'closed'].includes(ticket.status) ? ", status = 'open'" : '';
                                return [4 /*yield*/, client.query("UPDATE tickets SET last_message_at = NOW(), unread_count_admin = COALESCE(unread_count_admin, 0) + 1, updated_at = NOW()".concat(statusUpdate, " WHERE id = $1"), [params.ticketId])];
                            case 8:
                                _b.sent();
                                return [2 /*return*/, msg];
                        }
                    });
                }); })];
        });
    });
}
// Mark read by user
function markReadByUser(ticketId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, query("UPDATE tickets SET unread_count_user = 0 WHERE id = $1 AND user_id = $2", [ticketId, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Admin functions
function listAdminTickets(filters) {
    return __awaiter(this, void 0, void 0, function () {
        var offset, where, params, idx, _a, items, totalRow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    offset = (filters.page - 1) * filters.limit;
                    where = 'WHERE t.deleted_at IS NULL';
                    params = [];
                    idx = 1;
                    if (filters.status) {
                        where += " AND t.status = $".concat(idx++);
                        params.push(filters.status);
                    }
                    if (filters.priority) {
                        where += " AND t.priority = $".concat(idx++);
                        params.push(filters.priority);
                    }
                    if (filters.assignedAdminId !== undefined) {
                        where += " AND t.assigned_admin_id = $".concat(idx++);
                        params.push(filters.assignedAdminId);
                    }
                    return [4 /*yield*/, Promise.all([
                            query("SELECT t.*, u.name as user_name, a.email as admin_name\n       FROM tickets t\n       JOIN users u ON u.id = t.user_id::text\n       LEFT JOIN admins a ON a.id::text = t.assigned_admin_id::text\n       ".concat(where, "\n       ORDER BY\n         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,\n         t.last_message_at DESC NULLS LAST\n       LIMIT $").concat(idx++, " OFFSET $").concat(idx++), __spreadArray(__spreadArray([], params, true), [filters.limit, offset], false)),
                            queryOne("SELECT COUNT(*) as count FROM tickets t ".concat(where), params)
                        ])];
                case 1:
                    _a = _b.sent(), items = _a[0], totalRow = _a[1];
                    return [2 /*return*/, { items: items, total: parseInt((totalRow === null || totalRow === void 0 ? void 0 : totalRow.count) || '0'), page: filters.page, limit: filters.limit }];
            }
        });
    });
}
function getAdminTicketById(ticketId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, queryOne("SELECT t.*, u.name as user_name, a.email as admin_name\n     FROM tickets t\n     JOIN users u ON u.id = t.user_id::text\n     LEFT JOIN admins a ON a.id::text = t.assigned_admin_id::text\n     WHERE t.id = $1 AND t.deleted_at IS NULL", [ticketId])];
        });
    });
}
function updateAdminTicket(ticketId, adminId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var allowed, updates, values, idx, _i, allowed_2, key, col, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allowed = ['assignedAdminId', 'priority', 'subject', 'description', 'sectorId'];
                    updates = [];
                    values = [ticketId];
                    idx = 2;
                    for (_i = 0, allowed_2 = allowed; _i < allowed_2.length; _i++) {
                        key = allowed_2[_i];
                        if (payload[key] !== undefined) {
                            col = key === 'assignedAdminId' ? 'assigned_admin_id' : key === 'sectorId' ? 'sector_id' : key;
                            updates.push("".concat(col, " = $").concat(idx));
                            values.push(payload[key]);
                            idx++;
                        }
                    }
                    updates.push("updated_at = NOW()");
                    return [4 /*yield*/, queryOne("UPDATE tickets SET ".concat(updates.join(', '), " WHERE id = $1 AND deleted_at IS NULL RETURNING *"), values)];
                case 1:
                    result = _a.sent();
                    if (!result)
                        throw new Error('Ticket não encontrado.');
                    return [2 /*return*/, result];
            }
        });
    });
}
function updateTicketStatus(ticketId, status) {
    return __awaiter(this, void 0, void 0, function () {
        var updates, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    updates = ["status = $2", "updated_at = NOW()"];
                    if (status === 'resolved')
                        updates.push("resolved_at = NOW()");
                    else if (status === 'closed')
                        updates.push("closed_at = NOW()");
                    else {
                        updates.push("resolved_at = NULL");
                        updates.push("closed_at = NULL");
                    }
                    return [4 /*yield*/, queryOne("UPDATE tickets SET ".concat(updates.join(', '), " WHERE id = $1 AND deleted_at IS NULL RETURNING *"), [ticketId, status])];
                case 1:
                    result = _a.sent();
                    if (!result)
                        throw new Error('Ticket não encontrado.');
                    return [2 /*return*/, result];
            }
        });
    });
}
function listMessagesForAdmin(ticketId) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, msgIds, allAttachments, attachMap, _i, allAttachments_2, att, _a, messages_3, msg, _b, messages_4, msg;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, query("SELECT * FROM ticket_messages WHERE ticket_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC", [ticketId])];
                case 1:
                    messages = _c.sent();
                    msgIds = messages.map(function (m) { return m.id; });
                    if (!(msgIds.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, query("SELECT * FROM ticket_attachments WHERE message_id = ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY created_at ASC", [msgIds])];
                case 2:
                    allAttachments = _c.sent();
                    attachMap = new Map();
                    for (_i = 0, allAttachments_2 = allAttachments; _i < allAttachments_2.length; _i++) {
                        att = allAttachments_2[_i];
                        if (!attachMap.has(att.message_id))
                            attachMap.set(att.message_id, []);
                        attachMap.get(att.message_id).push(att);
                    }
                    for (_a = 0, messages_3 = messages; _a < messages_3.length; _a++) {
                        msg = messages_3[_a];
                        msg.attachments = attachMap.get(msg.id) || [];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    for (_b = 0, messages_4 = messages; _b < messages_4.length; _b++) {
                        msg = messages_4[_b];
                        msg.attachments = [];
                    }
                    _c.label = 4;
                case 4: return [2 /*return*/, messages];
            }
        });
    });
}
function sendAdminMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            if (params.body.trim().length === 0 && params.files.length === 0) {
                throw new Error('Mensagem vazia.');
            }
            return [2 /*return*/, withTransaction(function (client) { return __awaiter(_this, void 0, void 0, function () {
                    var ticketResult, msgResult, msg, _i, _a, f, uploaded;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, client.query("SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL", [params.ticketId])];
                            case 1:
                                ticketResult = _b.sent();
                                if (!ticketResult.rows[0])
                                    throw new Error('Ticket não encontrado.');
                                return [4 /*yield*/, client.query("INSERT INTO ticket_messages (ticket_id, sender_type, sender_admin_id, body, has_attachments)\n       VALUES ($1, 'admin', $2, $3, $4) RETURNING *", [params.ticketId, params.adminId, params.body.trim() || '[imagem]', params.files.length > 0])];
                            case 2:
                                msgResult = _b.sent();
                                msg = msgResult.rows[0];
                                _i = 0, _a = params.files;
                                _b.label = 3;
                            case 3:
                                if (!(_i < _a.length)) return [3 /*break*/, 7];
                                f = _a[_i];
                                return [4 /*yield*/, uploadImageBuffer(f.buffer, f.originalname, f.mimetype)];
                            case 4:
                                uploaded = _b.sent();
                                return [4 /*yield*/, client.query("INSERT INTO ticket_attachments\n         (ticket_id, message_id, kind, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256)\n         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9)", [params.ticketId, msg.id, f.originalname, f.mimetype, f.size, uploaded.provider, uploaded.key, uploaded.url, uploaded.sha256])];
                            case 5:
                                _b.sent();
                                _b.label = 6;
                            case 6:
                                _i++;
                                return [3 /*break*/, 3];
                            case 7: 
                            // Update last_message_at and unread counter for user
                            return [4 /*yield*/, client.query("UPDATE tickets SET last_message_at = NOW(), unread_count_user = COALESCE(unread_count_user, 0) + 1, updated_at = NOW() WHERE id = $1", [params.ticketId])];
                            case 8:
                                // Update last_message_at and unread counter for user
                                _b.sent();
                                return [2 /*return*/, msg];
                        }
                    });
                }); })];
        });
    });
}
function markReadByAdmin(ticketId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, query("UPDATE tickets SET unread_count_admin = 0 WHERE id = $1", [ticketId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function routeTicket(params) {
    return __awaiter(this, void 0, void 0, function () {
        var routingText, ticket, sectors, best, applied;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    routingText = "".concat(params.subject || '', " ").concat(params.description || '', " ").concat(params.text || '').trim();
                    if (!(!routingText && params.ticketId)) return [3 /*break*/, 2];
                    return [4 /*yield*/, queryOne("SELECT subject, description FROM tickets WHERE id = $1 AND deleted_at IS NULL", [params.ticketId])];
                case 1:
                    ticket = _a.sent();
                    if (ticket) {
                        routingText = "".concat(ticket.subject || '', " ").concat(ticket.description || '').trim();
                    }
                    _a.label = 2;
                case 2:
                    if (!routingText) {
                        return [2 /*return*/, { matched: false, sector: null, matchedKeywords: [], applied: false }];
                    }
                    return [4 /*yield*/, fetchSectorsForRouting()];
                case 3:
                    sectors = _a.sent();
                    best = findBestSector(routingText, sectors);
                    if (!best) {
                        return [2 /*return*/, { matched: false, sector: null, matchedKeywords: [], applied: false }];
                    }
                    applied = false;
                    if (!(params.ticketId && params.apply)) return [3 /*break*/, 5];
                    return [4 /*yield*/, query("UPDATE tickets\n       SET sector_id = $2,\n           assigned_admin_id = CASE WHEN $3 IS NOT NULL AND assigned_admin_id IS NULL THEN $3 ELSE assigned_admin_id END,\n           updated_at = NOW()\n       WHERE id = $1 AND deleted_at IS NULL", [params.ticketId, best.sector.id, best.sector.auto_assign_agent_id])];
                case 4:
                    _a.sent();
                    applied = true;
                    _a.label = 5;
                case 5: return [2 /*return*/, {
                        matched: true,
                        sector: best.sector,
                        matchedKeywords: best.matches,
                        applied: applied
                    }];
            }
        });
    });
}
function getTicketReports() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, sectorRows, unassignedRow, avgRow, trendRows, agentRows, ticketsBySector, averageFirstResponseMinutes, trendMap, _i, trendRows_1, row, key, responseTimeTrend, today, i, day, key, activeAgents;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        query("SELECT s.id as sector_id, s.name as sector_name, COUNT(t.id) as tickets\n       FROM sectors s\n       LEFT JOIN tickets t ON t.sector_id = s.id AND t.deleted_at IS NULL\n       GROUP BY s.id, s.name\n       ORDER BY tickets DESC, s.name ASC"),
                        queryOne("SELECT COUNT(*) as tickets\n       FROM tickets\n       WHERE sector_id IS NULL AND deleted_at IS NULL"),
                        queryOne("SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) as minutes\n       FROM tickets\n       WHERE first_response_at IS NOT NULL AND deleted_at IS NULL"),
                        query("SELECT date_trunc('day', created_at) as day,\n              AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) as minutes\n       FROM tickets\n       WHERE first_response_at IS NOT NULL\n         AND created_at >= NOW() - INTERVAL '14 days'\n         AND deleted_at IS NULL\n       GROUP BY day\n       ORDER BY day ASC"),
                        query("SELECT a.id as agent_id, a.email as agent_email, COUNT(t.id) as tickets\n       FROM admins a\n       JOIN tickets t ON t.assigned_admin_id::text = a.id::text\n       WHERE t.deleted_at IS NULL AND t.status IN ('open', 'in_progress')\n       GROUP BY a.id, a.email\n       ORDER BY tickets DESC, a.email ASC"),
                    ])];
                case 1:
                    _a = _c.sent(), sectorRows = _a[0], unassignedRow = _a[1], avgRow = _a[2], trendRows = _a[3], agentRows = _a[4];
                    ticketsBySector = sectorRows.map(function (row) { return ({
                        sectorId: row.sector_id,
                        sectorName: row.sector_name,
                        tickets: parseInt(row.tickets || '0', 10),
                    }); });
                    if (unassignedRow) {
                        ticketsBySector.push({
                            sectorId: null,
                            sectorName: 'Sem setor',
                            tickets: parseInt(unassignedRow.tickets || '0', 10),
                        });
                    }
                    averageFirstResponseMinutes = (avgRow === null || avgRow === void 0 ? void 0 : avgRow.minutes) ? parseFloat(avgRow.minutes) : 0;
                    trendMap = new Map();
                    for (_i = 0, trendRows_1 = trendRows; _i < trendRows_1.length; _i++) {
                        row = trendRows_1[_i];
                        key = row.day.toISOString().slice(0, 10);
                        trendMap.set(key, row.minutes ? parseFloat(row.minutes) : 0);
                    }
                    responseTimeTrend = [];
                    today = new Date();
                    today.setHours(0, 0, 0, 0);
                    for (i = 13; i >= 0; i -= 1) {
                        day = new Date(today);
                        day.setDate(today.getDate() - i);
                        key = day.toISOString().slice(0, 10);
                        responseTimeTrend.push({
                            date: key,
                            minutes: (_b = trendMap.get(key)) !== null && _b !== void 0 ? _b : 0,
                        });
                    }
                    activeAgents = agentRows.map(function (row) { return ({
                        agentId: row.agent_id,
                        agentEmail: row.agent_email,
                        tickets: parseInt(row.tickets || '0', 10),
                    }); });
                    return [2 /*return*/, {
                            ticketsBySector: ticketsBySector,
                            averageFirstResponseMinutes: averageFirstResponseMinutes,
                            responseTimeTrend: responseTimeTrend,
                            activeAgents: activeAgents,
                            activeAgentsCount: activeAgents.length,
                        }];
            }
        });
    });
}
