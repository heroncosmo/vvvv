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
exports.preWarmUserCaches = preWarmUserCaches;
/**
 * Cache pre-warming module.
 * Extracted to its own file to avoid circular imports between routes.ts and supabaseAuth.ts.
 */
var storage_1 = require("./storage");
var accessEntitlement_1 = require("./accessEntitlement");
/**
 * Pre-warm all dashboard caches for a user (fire-and-forget, non-blocking).
 * Called after successful login to ensure the dashboard loads from warm cache.
 */
function preWarmUserCaches(userId) {
    var _this = this;
    // Run in background - never let this block or fail the login
    (function () { return __awaiter(_this, void 0, void 0, function () {
        var connection, connectionId_1, connKey, err_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, storage_1.storage.getConnectionByUserId(userId)];
                case 1:
                    connection = _a.sent();
                    connectionId_1 = connection === null || connection === void 0 ? void 0 : connection.id;
                    connKey = "api:wa-conn:".concat(userId, ":default");
                    if (!storage_1.memoryCache.has(connKey)) {
                        storage_1.memoryCache.set(connKey, connection ? __assign(__assign({}, connection), { _debugLocalSocket: false }) : null, 30000);
                    }
                    // 2. Fire all independent cache warmers in parallel
                    return [4 /*yield*/, Promise.allSettled([
                            // Stats
                            storage_1.memoryCache.getOrCompute("api:stats:".concat(userId, ":default"), function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a, cs, tm, am;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            if (!connectionId_1)
                                                return [2 /*return*/, { totalConversations: 0, unreadMessages: 0, todayMessages: 0, agentMessages: 0 }];
                                            return [4 /*yield*/, Promise.all([
                                                    storage_1.storage.getConversationStatsCount(connectionId_1),
                                                    storage_1.storage.getTodayMessagesCount(connectionId_1),
                                                    storage_1.storage.getAgentMessagesCount(connectionId_1),
                                                ])];
                                        case 1:
                                            _a = _b.sent(), cs = _a[0], tm = _a[1], am = _a[2];
                                            return [2 /*return*/, { totalConversations: cs.total, unreadMessages: cs.unread, todayMessages: tm, agentMessages: am }];
                                    }
                                });
                            }); }, 60000),
                            // Access entitlement (feeds access-status + usage)
                            (0, accessEntitlement_1.getAccessEntitlement)(userId),
                            // Subscription
                            storage_1.memoryCache.getOrCompute("api:subscription:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, storage_1.storage.getUserSubscription(userId)];
                                        case 1: return [2 /*return*/, (_a.sent()) || null];
                                    }
                                });
                            }); }, 120000),
                            // Agent config
                            storage_1.memoryCache.getOrCompute("api:agent-config:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, storage_1.storage.getAgentConfig(userId)];
                                        case 1: return [2 /*return*/, (_a.sent()) || null];
                                    }
                                });
                            }); }, 120000),
                            // Branding
                            storage_1.memoryCache.getOrCompute("api:branding:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                var user;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, storage_1.storage.getUser(userId)];
                                        case 1:
                                            user = _a.sent();
                                            return [2 /*return*/, { companyName: null, logoUrl: null, faviconUrl: null, primaryColor: null, secondaryColor: null }];
                                    }
                                });
                            }); }, 600000),
                            // Assigned plan
                            storage_1.memoryCache.getOrCompute("api:assigned-plan:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                var user, plan;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, storage_1.storage.getUser(userId)];
                                        case 1:
                                            user = _a.sent();
                                            if (!user || !user.assignedPlanId)
                                                return [2 /*return*/, { hasAssignedPlan: false }];
                                            return [4 /*yield*/, storage_1.storage.getPlan(user.assignedPlanId)];
                                        case 2:
                                            plan = _a.sent();
                                            if (!plan || !plan.ativo)
                                                return [2 /*return*/, { hasAssignedPlan: false }];
                                            return [2 /*return*/, { hasAssignedPlan: true, plan: { id: plan.id, nome: plan.nome, descricao: plan.descricao, valor: plan.valor, periodicidade: plan.periodicidade, tipo: plan.tipo, caracteristicas: plan.caracteristicas } }];
                                    }
                                });
                            }); }, 300000),
                            // Suspension status
                            storage_1.memoryCache.getOrCompute("api:suspension:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                var s;
                                var _a, _b, _c;
                                return __generator(this, function (_d) {
                                    switch (_d.label) {
                                        case 0: return [4 /*yield*/, storage_1.storage.isUserSuspended(userId)];
                                        case 1:
                                            s = _d.sent();
                                            return [2 /*return*/, s.suspended ? { suspended: true, reason: (_a = s.data) === null || _a === void 0 ? void 0 : _a.reason, type: (_b = s.data) === null || _b === void 0 ? void 0 : _b.type, suspendedAt: (_c = s.data) === null || _c === void 0 ? void 0 : _c.suspendedAt } : { suspended: false }];
                                    }
                                });
                            }); }, 300000),
                            // Reseller status
                            storage_1.memoryCache.getOrCompute("api:reseller-status:".concat(userId), function () { return __awaiter(_this, void 0, void 0, function () {
                                var resellerService, _a, hasReseller, reseller;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./resellerService'); })];
                                        case 1:
                                            resellerService = (_b.sent()).resellerService;
                                            return [4 /*yield*/, Promise.all([
                                                    resellerService.hasResellerPlan(userId),
                                                    storage_1.storage.getResellerByUserId(userId),
                                                ])];
                                        case 2:
                                            _a = _b.sent(), hasReseller = _a[0], reseller = _a[1];
                                            return [2 /*return*/, { hasResellerPlan: hasReseller, reseller: reseller || null }];
                                    }
                                });
                            }); }, 300000),
                        ])];
                case 2:
                    // 2. Fire all independent cache warmers in parallel
                    _a.sent();
                    console.log("\uD83D\uDD25 [CACHE] Pre-warmed caches for user ".concat(userId.substring(0, 8), "..."));
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    // Silent fail - pre-warming is best-effort
                    console.error("\u26A0\uFE0F [CACHE] Pre-warm failed for ".concat(userId.substring(0, 8), ":"), err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); })();
}
