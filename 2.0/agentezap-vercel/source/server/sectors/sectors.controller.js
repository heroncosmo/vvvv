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
exports.generateAIMessage = exports.cancelScheduledMessage = exports.listScheduledMessages = exports.createScheduledMessage = exports.bulkToggleAI = exports.reopenTicket = exports.closeTicket = exports.getAttendanceReport = exports.routeConversation = exports.updateSectorMember = exports.removeSectorMember = exports.addSectorMember = exports.listSectorMembers = exports.listAdminAgents = exports.deleteSector = exports.updateSector = exports.createSector = exports.getSectorById = exports.listSectors = void 0;
var service = require("./sectors.service");
// Convert snake_case DB rows to camelCase for frontend
function toCamel(str) {
    return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
}
function camelizeObj(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj))
        return obj.map(camelizeObj);
    if (typeof obj !== "object")
        return obj;
    var result = {};
    for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        result[toCamel(key)] =
            value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
                ? camelizeObj(value)
                : Array.isArray(value)
                    ? value.map(camelizeObj)
                    : value;
    }
    return result;
}
var asyncHandler = function (fn) { return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
}; };
// Sector CRUD
exports.listSectors = asyncHandler(function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sectors;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.listSectors()];
            case 1:
                sectors = _a.sent();
                res.json({ items: camelizeObj(sectors) });
                return [2 /*return*/];
        }
    });
}); });
exports.getSectorById = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sector;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.getSectorById(req.params.id)];
            case 1:
                sector = _a.sent();
                if (!sector)
                    return [2 /*return*/, res.status(404).json({ message: "Setor nao encontrado." })];
                res.json({ sector: camelizeObj(sector) });
                return [2 /*return*/];
        }
    });
}); });
exports.createSector = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, description, keywords, autoAssignAgentId, normalizedKeywords, sector;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, name = _a.name, description = _a.description, keywords = _a.keywords, autoAssignAgentId = _a.autoAssignAgentId;
                if (!name || String(name).trim().length < 2) {
                    return [2 /*return*/, res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." })];
                }
                normalizedKeywords = Array.isArray(keywords)
                    ? keywords
                    : typeof keywords === "string"
                        ? keywords.split(",").map(function (k) { return k.trim(); }).filter(Boolean)
                        : [];
                return [4 /*yield*/, service.createSector({
                        name: name,
                        description: description,
                        keywords: normalizedKeywords,
                        autoAssignAgentId: autoAssignAgentId || null,
                    })];
            case 1:
                sector = _b.sent();
                res.status(201).json({ sector: camelizeObj(sector) });
                return [2 /*return*/];
        }
    });
}); });
exports.updateSector = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, description, keywords, autoAssignAgentId, normalizedKeywords, sector;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, name = _a.name, description = _a.description, keywords = _a.keywords, autoAssignAgentId = _a.autoAssignAgentId;
                if (name !== undefined && String(name).trim().length < 2) {
                    return [2 /*return*/, res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." })];
                }
                normalizedKeywords = Array.isArray(keywords)
                    ? keywords
                    : typeof keywords === "string"
                        ? keywords.split(",").map(function (k) { return k.trim(); }).filter(Boolean)
                        : undefined;
                return [4 /*yield*/, service.updateSector(req.params.id, {
                        name: name,
                        description: description,
                        keywords: normalizedKeywords,
                        autoAssignAgentId: autoAssignAgentId,
                    })];
            case 1:
                sector = _b.sent();
                res.json({ sector: camelizeObj(sector) });
                return [2 /*return*/];
        }
    });
}); });
exports.deleteSector = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.deleteSector(req.params.id)];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
// Admin Agents
exports.listAdminAgents = asyncHandler(function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var agents;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.listAdminAgents()];
            case 1:
                agents = _a.sent();
                res.json({ items: camelizeObj(agents) });
                return [2 /*return*/];
        }
    });
}); });
// Sector Members
exports.listSectorMembers = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var members;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.listSectorMembers(req.params.id)];
            case 1:
                members = _a.sent();
                res.json({ items: camelizeObj(members) });
                return [2 /*return*/];
        }
    });
}); });
exports.addSectorMember = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, memberId, isPrimary, canReceiveTickets, maxOpenTickets, member;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = req.body || {}, memberId = _a.memberId, isPrimary = _a.isPrimary, canReceiveTickets = _a.canReceiveTickets, maxOpenTickets = _a.maxOpenTickets;
                if (!memberId) {
                    return [2 /*return*/, res.status(400).json({ message: "ID do membro é obrigatório." })];
                }
                return [4 /*yield*/, service.addSectorMember(req.params.id, {
                        memberId: memberId,
                        isPrimary: isPrimary !== null && isPrimary !== void 0 ? isPrimary : false,
                        canReceiveTickets: canReceiveTickets !== null && canReceiveTickets !== void 0 ? canReceiveTickets : true,
                        maxOpenTickets: maxOpenTickets !== null && maxOpenTickets !== void 0 ? maxOpenTickets : 10,
                        assignedBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || ((_d = (_c = req.session) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.id),
                    })];
            case 1:
                member = _e.sent();
                res.status(201).json({ member: camelizeObj(member) });
                return [2 /*return*/];
        }
    });
}); });
exports.removeSectorMember = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.removeSectorMember(req.params.id, req.params.memberId)];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
exports.updateSectorMember = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, isPrimary, canReceiveTickets, maxOpenTickets, member;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, isPrimary = _a.isPrimary, canReceiveTickets = _a.canReceiveTickets, maxOpenTickets = _a.maxOpenTickets;
                return [4 /*yield*/, service.updateSectorMember(req.params.id, req.params.memberId, {
                        isPrimary: isPrimary,
                        canReceiveTickets: canReceiveTickets,
                        maxOpenTickets: maxOpenTickets,
                    })];
            case 1:
                member = _b.sent();
                res.json({ member: camelizeObj(member) });
                return [2 /*return*/];
        }
    });
}); });
// Routing
exports.routeConversation = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, conversationId, messageText, result;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, conversationId = _a.conversationId, messageText = _a.messageText;
                if (!conversationId || !messageText) {
                    return [2 /*return*/, res.status(400).json({ message: "conversationId e messageText são obrigatórios." })];
                }
                return [4 /*yield*/, service.routeConversation(conversationId, messageText)];
            case 1:
                result = _b.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
// Reports
exports.getAttendanceReport = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, startDate, endDate, report;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.query, startDate = _a.startDate, endDate = _a.endDate;
                return [4 /*yield*/, service.getAttendanceReport(startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], endDate || new Date().toISOString().split('T')[0])];
            case 1:
                report = _b.sent();
                res.json(camelizeObj(report));
                return [2 /*return*/];
        }
    });
}); });
// Ticket closure
exports.closeTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var reason, userId, userName, result;
    var _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                reason = (req.body || {}).reason;
                userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
                userName = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || ((_f = (_e = req.session) === null || _e === void 0 ? void 0 : _e.user) === null || _f === void 0 ? void 0 : _f.name) || 'Sistema';
                return [4 /*yield*/, service.closeTicket(req.params.conversationId, {
                        closedBy: userId,
                        closedByName: userName,
                        reason: reason,
                    })];
            case 1:
                result = _g.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
exports.reopenTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, userName, result;
    var _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
                userName = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || ((_f = (_e = req.session) === null || _e === void 0 ? void 0 : _e.user) === null || _f === void 0 ? void 0 : _f.name) || 'Sistema';
                return [4 /*yield*/, service.reopenTicket(req.params.conversationId, {
                        reopenedBy: userId,
                        reopenedByName: userName,
                    })];
            case 1:
                result = _g.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
// Bulk actions
exports.bulkToggleAI = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, conversationIds, disable, userId, userName, result;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                _a = req.body || {}, conversationIds = _a.conversationIds, disable = _a.disable;
                if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
                    return [2 /*return*/, res.status(400).json({ message: "Lista de conversas é obrigatória." })];
                }
                userId = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || ((_d = (_c = req.session) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.id);
                userName = ((_e = req.user) === null || _e === void 0 ? void 0 : _e.name) || ((_g = (_f = req.session) === null || _f === void 0 ? void 0 : _f.user) === null || _g === void 0 ? void 0 : _g.name) || 'Sistema';
                return [4 /*yield*/, service.bulkToggleAI(conversationIds, disable, {
                        performedBy: userId,
                        performedByName: userName,
                    })];
            case 1:
                result = _h.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
// Scheduled messages
exports.createScheduledMessage = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, conversationId, messageText, messageType, aiPrompt, scheduledAt, timezone, userId, userName, message;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                _a = req.body || {}, conversationId = _a.conversationId, messageText = _a.messageText, messageType = _a.messageType, aiPrompt = _a.aiPrompt, scheduledAt = _a.scheduledAt, timezone = _a.timezone;
                if (!conversationId || !messageText || !scheduledAt) {
                    return [2 /*return*/, res.status(400).json({ message: "conversationId, messageText e scheduledAt são obrigatórios." })];
                }
                userId = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || ((_d = (_c = req.session) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.id);
                userName = ((_e = req.user) === null || _e === void 0 ? void 0 : _e.name) || ((_g = (_f = req.session) === null || _f === void 0 ? void 0 : _f.user) === null || _g === void 0 ? void 0 : _g.name) || 'Sistema';
                return [4 /*yield*/, service.createScheduledMessage({
                        conversationId: conversationId,
                        messageText: messageText,
                        messageType: messageType || 'text',
                        aiPrompt: aiPrompt,
                        scheduledAt: scheduledAt,
                        timezone: timezone || 'America/Sao_Paulo',
                        createdBy: userId,
                        createdByName: userName,
                    })];
            case 1:
                message = _h.sent();
                res.status(201).json({ message: camelizeObj(message) });
                return [2 /*return*/];
        }
    });
}); });
exports.listScheduledMessages = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, conversationId, status, messages;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.query, conversationId = _a.conversationId, status = _a.status;
                return [4 /*yield*/, service.listScheduledMessages({
                        conversationId: conversationId,
                        status: status,
                    })];
            case 1:
                messages = _b.sent();
                res.json({ items: camelizeObj(messages) });
                return [2 /*return*/];
        }
    });
}); });
exports.cancelScheduledMessage = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.cancelScheduledMessage(req.params.id)];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
// AI message generation
exports.generateAIMessage = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, prompt, conversationId, result;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, prompt = _a.prompt, conversationId = _a.conversationId;
                if (!prompt) {
                    return [2 /*return*/, res.status(400).json({ message: "Prompt é obrigatório." })];
                }
                return [4 /*yield*/, service.generateAIMessage(prompt, conversationId)];
            case 1:
                result = _b.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
