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
exports.getPublicAppUrl = getPublicAppUrl;
exports.buildPublicDestinationUrl = buildPublicDestinationUrl;
exports.generateAutologinLink = generateAutologinLink;
exports.generateAutologinLinkWithRetry = generateAutologinLinkWithRetry;
var db_1 = require("./db");
function normalizeBaseUrl(value) {
    var baseUrl = String(value || 'https://agentezap.online').trim() || 'https://agentezap.online';
    while (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }
    return baseUrl;
}
function normalizeDestination(destination) {
    var trimmed = String(destination || '/conexao').trim() || '/conexao';
    return trimmed.startsWith('/') ? trimmed : "/".concat(trimmed);
}
function getPublicAppUrl() {
    return normalizeBaseUrl(process.env.APP_URL || 'https://agentezap.online');
}
function buildPublicDestinationUrl(destination) {
    if (destination === void 0) { destination = '/conexao'; }
    return "".concat(getPublicAppUrl()).concat(normalizeDestination(destination));
}
/**
 * Gera link de auto-login com redirecionamento configurável.
 * @param userId - ID do usuário Supabase
 * @param destination - Caminho de destino: '/conexao' (default) ou '/plans'
 * @returns URL completa com token de auto-login
 */
function generateAutologinLink(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, destination) {
        var token, expiresAt, normalizedDestination;
        if (destination === void 0) { destination = '/conexao'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    token = crypto.randomUUID();
                    expiresAt = new Date(Date.now() + 60 * 60 * 1000);
                    normalizedDestination = normalizeDestination(destination);
                    return [4 /*yield*/, db_1.pool.query("INSERT INTO admin_autologin_tokens (token, user_id, expires_at, redirect_to) VALUES ($1, $2, $3, $4)", [token, userId, expiresAt, normalizedDestination])];
                case 1:
                    _a.sent();
                    return [2 /*return*/, "".concat(buildPublicDestinationUrl(normalizedDestination), "?token=").concat(token)];
            }
        });
    });
}
function generateAutologinLinkWithRetry(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, destination, maxAttempts) {
        var lastError, _loop_1, attempt, state_1;
        if (destination === void 0) { destination = '/conexao'; }
        if (maxAttempts === void 0) { maxAttempts = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _loop_1 = function (attempt) {
                        var _b, error_1;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _c.trys.push([0, 2, , 4]);
                                    _b = {};
                                    return [4 /*yield*/, generateAutologinLink(userId, destination)];
                                case 1: return [2 /*return*/, (_b.value = _c.sent(), _b)];
                                case 2:
                                    error_1 = _c.sent();
                                    lastError = error_1;
                                    if (attempt >= maxAttempts) {
                                        return [2 /*return*/, "break"];
                                    }
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, attempt * 400); })];
                                case 3:
                                    _c.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= maxAttempts)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    if (state_1 === "break")
                        return [3 /*break*/, 4];
                    _a.label = 3;
                case 3:
                    attempt += 1;
                    return [3 /*break*/, 1];
                case 4: throw lastError instanceof Error ? lastError : new Error(String(lastError || 'autologin_failed'));
            }
        });
    });
}
