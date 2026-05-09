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
exports.getAccessEntitlement = getAccessEntitlement;
exports.invalidateEntitlementCache = invalidateEntitlementCache;
var storage_1 = require("./storage");
var ENTITLEMENT_CACHE_TTL = 30000; // 30 seconds
// In-flight request deduplication (thundering herd protection)
var _inflightEntitlements = new Map();
function getAccessEntitlement(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var cacheKey, cached, inflight, promise;
        return __generator(this, function (_a) {
            cacheKey = "entitlement:".concat(userId);
            cached = storage_1.memoryCache.get(cacheKey);
            if (cached)
                return [2 /*return*/, cached];
            inflight = _inflightEntitlements.get(userId);
            if (inflight)
                return [2 /*return*/, inflight];
            promise = _computeEntitlement(userId).then(function (result) {
                storage_1.memoryCache.set(cacheKey, result, ENTITLEMENT_CACHE_TTL);
                _inflightEntitlements.delete(userId);
                return result;
            }).catch(function (err) {
                _inflightEntitlements.delete(userId);
                throw err;
            });
            _inflightEntitlements.set(userId, promise);
            return [2 /*return*/, promise];
        });
    });
}
/** Invalidate entitlement cache for a user (call after subscription/plan changes) */
function invalidateEntitlementCache(userId) {
    storage_1.memoryCache.invalidate("entitlement:".concat(userId));
}
function _computeEntitlement(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, subscription, resellerClient, now, subscriptionIsActive, subscriptionExpiredByDataFim, saasHasActive, reseller, e_1, paidUntil, expired, nextPayment, daysOverdue, expired;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        storage_1.storage.getUserSubscription(userId),
                        storage_1.storage.getResellerClientByUserId(userId),
                    ])];
                case 1:
                    _a = _f.sent(), subscription = _a[0], resellerClient = _a[1];
                    now = new Date();
                    subscriptionIsActive = (subscription === null || subscription === void 0 ? void 0 : subscription.status) === 'active';
                    subscriptionExpiredByDataFim = (subscription === null || subscription === void 0 ? void 0 : subscription.dataFim)
                        ? new Date(subscription.dataFim) < now
                        : false;
                    saasHasActive = subscriptionIsActive && !subscriptionExpiredByDataFim;
                    if (!resellerClient) return [3 /*break*/, 6];
                    reseller = null;
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, storage_1.storage.getReseller(resellerClient.resellerId)];
                case 3:
                    reseller = _f.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _f.sent();
                    return [3 /*break*/, 5];
                case 5:
                    // Cascading block: reseller itself is blocked
                    if ((reseller === null || reseller === void 0 ? void 0 : reseller.resellerStatus) === 'blocked') {
                        return [2 /*return*/, {
                                hasActiveSubscription: false,
                                isExpired: true,
                                source: 'reseller',
                                planName: 'Plano Revenda',
                            }];
                    }
                    // Free client of reseller is always active (unless reseller blocked - handled above)
                    if (resellerClient.isFreeClient) {
                        return [2 /*return*/, {
                                hasActiveSubscription: true,
                                isExpired: false,
                                source: 'reseller',
                                planName: 'Plano Revenda',
                            }];
                    }
                    // Reseller client with suspended/cancelled/blocked status
                    if (resellerClient.status === 'suspended' ||
                        resellerClient.status === 'cancelled' ||
                        resellerClient.status === 'blocked') {
                        return [2 /*return*/, {
                                hasActiveSubscription: false,
                                isExpired: true,
                                source: 'reseller',
                                planName: 'Plano Revenda',
                            }];
                    }
                    // Reseller client with active status - check payment dates
                    if (resellerClient.status === 'active') {
                        // PRIORITY: Check saasPaidUntil (granular payments)
                        if (resellerClient.saasPaidUntil) {
                            paidUntil = new Date(resellerClient.saasPaidUntil);
                            expired = now > paidUntil;
                            return [2 /*return*/, {
                                    hasActiveSubscription: !expired,
                                    isExpired: expired,
                                    source: 'reseller',
                                    planName: 'Plano Revenda',
                                }];
                        }
                        // FALLBACK: Check nextPaymentDate with 5-day tolerance
                        if (resellerClient.nextPaymentDate) {
                            nextPayment = new Date(resellerClient.nextPaymentDate);
                            daysOverdue = Math.floor((now.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24));
                            expired = daysOverdue > 5;
                            return [2 /*return*/, {
                                    hasActiveSubscription: !expired,
                                    isExpired: expired,
                                    source: 'reseller',
                                    planName: 'Plano Revenda',
                                }];
                        }
                        // No payment date info - permissive fallback (same spirit as /api/access-status)
                        return [2 /*return*/, {
                                hasActiveSubscription: true,
                                isExpired: false,
                                source: 'reseller',
                                planName: 'Plano Revenda',
                            }];
                    }
                    _f.label = 6;
                case 6:
                    // ---- SaaS only (no reseller) ----
                    if (saasHasActive) {
                        return [2 /*return*/, {
                                hasActiveSubscription: true,
                                isExpired: false,
                                source: 'saas',
                                planName: (_c = (_b = subscription === null || subscription === void 0 ? void 0 : subscription.plan) === null || _b === void 0 ? void 0 : _b.nome) !== null && _c !== void 0 ? _c : null,
                            }];
                    }
                    // Subscription exists but is expired or inactive
                    if (subscription) {
                        return [2 /*return*/, {
                                hasActiveSubscription: false,
                                isExpired: true,
                                source: 'saas',
                                planName: (_e = (_d = subscription === null || subscription === void 0 ? void 0 : subscription.plan) === null || _d === void 0 ? void 0 : _d.nome) !== null && _e !== void 0 ? _e : null,
                            }];
                    }
                    // No subscription at all, no reseller - free/trial user
                    return [2 /*return*/, {
                            hasActiveSubscription: false,
                            isExpired: false,
                            source: 'none',
                            planName: null,
                        }];
            }
        });
    });
}
