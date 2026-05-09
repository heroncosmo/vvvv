"use strict";
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
exports.getTicketReports = exports.routeTicket = exports.markAdminRead = exports.sendAdminMessage = exports.listAdminTicketMessages = exports.updateAdminTicketStatus = exports.updateAdminTicket = exports.getAdminTicketById = exports.listAdminTickets = exports.markUserRead = exports.sendUserMessage = exports.listUserTicketMessages = exports.deleteUserTicket = exports.updateUserTicket = exports.getUserTicketById = exports.listUserTickets = exports.createTicket = void 0;
var service = require("./tickets.service");
// Convert snake_case DB rows to camelCase for frontend
function toCamel(str) {
    return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
}
function camelizeObj(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj))
        return obj.map(camelizeObj);
    if (typeof obj !== 'object')
        return obj;
    var result = {};
    for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        result[toCamel(key)] = (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date))
            ? camelizeObj(value)
            : Array.isArray(value) ? value.map(camelizeObj) : value;
    }
    return result;
}
var asyncHandler = function (fn) { return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
}; };
function isAdminRequest(req) {
    var _a, _b, _c, _d;
    var role = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || ((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.role) || ((_d = req.session) === null || _d === void 0 ? void 0 : _d.adminRole);
    return role === "admin" || role === "owner";
}
// User Controllers
exports.createTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, subject, description, priority, ticket;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, subject = _a.subject, description = _a.description, priority = _a.priority;
                if (!subject || subject.trim().length < 3) {
                    return [2 /*return*/, res.status(400).json({ message: 'Assunto deve ter pelo menos 3 caracteres.' })];
                }
                return [4 /*yield*/, service.createTicket({
                        userId: req.user.id,
                        subject: subject,
                        description: description,
                        priority: priority || 'medium'
                    })];
            case 1:
                ticket = _b.sent();
                res.status(201).json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.listUserTickets = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var page, limit, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                page = parseInt(req.query.page) || 1;
                limit = parseInt(req.query.limit) || 20;
                return [4 /*yield*/, service.listUserTickets(req.user.id, page, limit)];
            case 1:
                data = _a.sent();
                res.json(__assign(__assign({}, data), { items: camelizeObj(data.items) }));
                return [2 /*return*/];
        }
    });
}); });
exports.getUserTicketById = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ticket;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.getUserTicketById(parseInt(req.params.id), req.user.id)];
            case 1:
                ticket = _a.sent();
                if (!ticket)
                    return [2 /*return*/, res.status(404).json({ message: 'Ticket não encontrado.' })];
                res.json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.updateUserTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ticket;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.updateUserTicket(parseInt(req.params.id), req.user.id, req.body)];
            case 1:
                ticket = _a.sent();
                res.json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.deleteUserTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.deleteUserTicket(parseInt(req.params.id), req.user.id)];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
exports.listUserTicketMessages = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var messages;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.listMessagesForUser(parseInt(req.params.id), req.user.id)];
            case 1:
                messages = _a.sent();
                res.json({ items: camelizeObj(messages) });
                return [2 /*return*/];
        }
    });
}); });
exports.sendUserMessage = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var body, files, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                body = String(req.body.body || '');
                files = req.files || [];
                if (!body.trim() && files.length === 0) {
                    return [2 /*return*/, res.status(400).json({ message: 'Mensagem vazia. Envie texto ou imagem.' })];
                }
                return [4 /*yield*/, service.sendUserMessage({
                        userId: req.user.id,
                        ticketId: parseInt(req.params.id),
                        body: body,
                        files: files
                    })];
            case 1:
                message = _a.sent();
                res.status(201).json({ message: camelizeObj(message) });
                return [2 /*return*/];
        }
    });
}); });
exports.markUserRead = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.markReadByUser(parseInt(req.params.id), req.user.id)];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
// Admin Controllers
exports.listAdminTickets = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var filters, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                filters = {
                    status: req.query.status,
                    priority: req.query.priority,
                    assignedAdminId: req.query.assignedAdminId ? req.query.assignedAdminId : undefined,
                    page: parseInt(req.query.page) || 1,
                    limit: parseInt(req.query.limit) || 20
                };
                return [4 /*yield*/, service.listAdminTickets(filters)];
            case 1:
                data = _a.sent();
                res.json(__assign(__assign({}, data), { items: camelizeObj(data.items) }));
                return [2 /*return*/];
        }
    });
}); });
exports.getAdminTicketById = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ticket;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.getAdminTicketById(parseInt(req.params.id))];
            case 1:
                ticket = _a.sent();
                if (!ticket)
                    return [2 /*return*/, res.status(404).json({ message: 'Ticket não encontrado.' })];
                res.json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.updateAdminTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ticket;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.updateAdminTicket(parseInt(req.params.id), req.user.id, req.body)];
            case 1:
                ticket = _a.sent();
                res.json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.updateAdminTicketStatus = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var status, ticket;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                status = req.body.status;
                if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
                    return [2 /*return*/, res.status(400).json({ message: 'Status inválido.' })];
                }
                return [4 /*yield*/, service.updateTicketStatus(parseInt(req.params.id), status)];
            case 1:
                ticket = _a.sent();
                res.json({ ticket: camelizeObj(ticket) });
                return [2 /*return*/];
        }
    });
}); });
exports.listAdminTicketMessages = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var messages;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.listMessagesForAdmin(parseInt(req.params.id))];
            case 1:
                messages = _a.sent();
                res.json({ items: camelizeObj(messages) });
                return [2 /*return*/];
        }
    });
}); });
exports.sendAdminMessage = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var body, files, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                body = String(req.body.body || '');
                files = req.files || [];
                if (!body.trim() && files.length === 0) {
                    return [2 /*return*/, res.status(400).json({ message: 'Mensagem vazia.' })];
                }
                return [4 /*yield*/, service.sendAdminMessage({
                        adminId: req.user.id,
                        ticketId: parseInt(req.params.id),
                        body: body,
                        files: files
                    })];
            case 1:
                message = _a.sent();
                res.status(201).json({ message: camelizeObj(message) });
                return [2 /*return*/];
        }
    });
}); });
exports.markAdminRead = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.markReadByAdmin(parseInt(req.params.id))];
            case 1:
                _a.sent();
                res.status(204).send();
                return [2 /*return*/];
        }
    });
}); });
exports.routeTicket = asyncHandler(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, ticketId, subject, description, text, apply, result;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body || {}, ticketId = _a.ticketId, subject = _a.subject, description = _a.description, text = _a.text;
                apply = Boolean(ticketId) && isAdminRequest(req);
                return [4 /*yield*/, service.routeTicket({
                        ticketId: ticketId ? Number(ticketId) : undefined,
                        subject: subject,
                        description: description,
                        text: text,
                        apply: apply,
                    })];
            case 1:
                result = _b.sent();
                res.json(camelizeObj(result));
                return [2 /*return*/];
        }
    });
}); });
exports.getTicketReports = asyncHandler(function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, service.getTicketReports()];
            case 1:
                data = _a.sent();
                res.json(camelizeObj(data));
                return [2 /*return*/];
        }
    });
}); });
