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
exports.isRedisAvailable = isRedisAvailable;
exports.getDistributedKeyRemainingMs = getDistributedKeyRemainingMs;
exports.tryAcquireDistributedLock = tryAcquireDistributedLock;
exports.refreshDistributedLock = refreshDistributedLock;
exports.releaseDistributedLock = releaseDistributedLock;
exports.setDistributedExpiringKey = setDistributedExpiringKey;
exports.clearDistributedKey = clearDistributedKey;
var crypto_1 = require("crypto");
var redis_1 = require("redis");
var REDIS_CONNECT_TIMEOUT_MS = Math.max(Number(process.env.WA_REDIS_CONNECT_TIMEOUT_MS || 5000), 1000);
var REDIS_RETRY_BASE_MS = Math.max(Number(process.env.WA_REDIS_RETRY_BASE_MS || 500), 100);
var REDIS_RETRY_MAX_MS = Math.max(Number(process.env.WA_REDIS_RETRY_MAX_MS || 5000), REDIS_RETRY_BASE_MS);
var REDIS_DISABLED = process.env.WA_REDIS_DISABLED === "true";
function resolveRedisUrl() {
    var candidate = process.env.REDIS_URL ||
        process.env.REDIS_PRIVATE_URL ||
        process.env.REDIS_PUBLIC_URL ||
        process.env.RAILWAY_REDIS_URL ||
        process.env.UPSTASH_REDIS_URL ||
        undefined;
    if (!candidate) {
        return undefined;
    }
    if (!/^redis(s)?:\/\//i.test(candidate)) {
        console.warn("[WA REDIS] Ignoring invalid redis URL. Expected redis:// or rediss://");
        return undefined;
    }
    return candidate;
}
var REDIS_URL = resolveRedisUrl();
var redisClient = null;
var redisInitPromise = null;
var missingRedisLogged = false;
var redisErrorLoggedAt = 0;
var RELEASE_LOCK_SCRIPT = "\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  return redis.call('DEL', KEYS[1])\nelse\n  return 0\nend\n";
var REFRESH_LOCK_SCRIPT = "\nif redis.call('GET', KEYS[1]) == ARGV[1] then\n  return redis.call('PEXPIRE', KEYS[1], ARGV[2])\nelse\n  return 0\nend\n";
function logRedisError(message, error) {
    var now = Date.now();
    if (now - redisErrorLoggedAt < 15000) {
        return;
    }
    redisErrorLoggedAt = now;
    if (error) {
        console.warn("[WA REDIS] ".concat(message, ":"), error);
    }
    else {
        console.warn("[WA REDIS] ".concat(message));
    }
}
function getValidTtl(ttlMs) {
    return Math.max(Math.floor(ttlMs), 1000);
}
function isRedisAvailable() {
    return !REDIS_DISABLED && !!REDIS_URL;
}
function getRedisClient() {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            if (!isRedisAvailable()) {
                if (!missingRedisLogged) {
                    missingRedisLogged = true;
                    if (REDIS_DISABLED) {
                        console.log("[WA REDIS] Distributed coordination disabled by WA_REDIS_DISABLED=true");
                    }
                    else {
                        console.log("[WA REDIS] REDIS_URL not configured. Using local-only coordination.");
                    }
                }
                return [2 /*return*/, null];
            }
            if (redisClient === null || redisClient === void 0 ? void 0 : redisClient.isOpen) {
                return [2 /*return*/, redisClient];
            }
            if (redisInitPromise) {
                return [2 /*return*/, redisInitPromise];
            }
            redisInitPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                var client, error_1, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            client = (0, redis_1.createClient)({
                                url: REDIS_URL,
                                socket: {
                                    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
                                    reconnectStrategy: function (retries) {
                                        var delay = REDIS_RETRY_BASE_MS * Math.max(retries, 1);
                                        return Math.min(delay, REDIS_RETRY_MAX_MS);
                                    },
                                },
                            });
                            client.on("error", function (err) {
                                logRedisError("Redis client error", err);
                            });
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, 9, 10]);
                            return [4 /*yield*/, client.connect()];
                        case 2:
                            _b.sent();
                            redisClient = client;
                            console.log("[WA REDIS] Connected.");
                            return [2 /*return*/, client];
                        case 3:
                            error_1 = _b.sent();
                            logRedisError("Failed to connect to Redis", error_1);
                            _b.label = 4;
                        case 4:
                            _b.trys.push([4, 7, , 8]);
                            if (!client.isOpen) return [3 /*break*/, 6];
                            return [4 /*yield*/, client.quit()];
                        case 5:
                            _b.sent();
                            _b.label = 6;
                        case 6: return [3 /*break*/, 8];
                        case 7:
                            _a = _b.sent();
                            return [3 /*break*/, 8];
                        case 8: return [2 /*return*/, null];
                        case 9:
                            redisInitPromise = null;
                            return [7 /*endfinally*/];
                        case 10: return [2 /*return*/];
                    }
                });
            }); })();
            return [2 /*return*/, redisInitPromise];
        });
    });
}
function getDistributedKeyRemainingMs(key) {
    return __awaiter(this, void 0, void 0, function () {
        var client, ttl, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client)
                        return [2 /*return*/, 0];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.pTTL(key)];
                case 3:
                    ttl = _a.sent();
                    return [2 /*return*/, ttl > 0 ? ttl : 0];
                case 4:
                    error_2 = _a.sent();
                    logRedisError("Failed to read TTL for key ".concat(key), error_2);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function tryAcquireDistributedLock(key, ttlMs) {
    return __awaiter(this, void 0, void 0, function () {
        var client, ttl, token, result, remainingMs, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client) {
                        return [2 /*return*/, { status: "unavailable" }];
                    }
                    ttl = getValidTtl(ttlMs);
                    token = (0, crypto_1.randomUUID)();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, client.set(key, token, {
                            NX: true,
                            PX: ttl,
                        })];
                case 3:
                    result = _a.sent();
                    if (!(result !== "OK")) return [3 /*break*/, 5];
                    return [4 /*yield*/, getDistributedKeyRemainingMs(key)];
                case 4:
                    remainingMs = _a.sent();
                    return [2 /*return*/, { status: "busy", remainingMs: remainingMs }];
                case 5: return [2 /*return*/, {
                        status: "acquired",
                        lock: {
                            key: key,
                            token: token,
                            acquiredAt: Date.now(),
                            ttlMs: ttl,
                        },
                    }];
                case 6:
                    error_3 = _a.sent();
                    logRedisError("Failed to acquire lock ".concat(key), error_3);
                    return [2 /*return*/, { status: "unavailable" }];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function refreshDistributedLock(lock, ttlMs) {
    return __awaiter(this, void 0, void 0, function () {
        var client, ttl, result, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client)
                        return [2 /*return*/, false];
                    ttl = getValidTtl(ttlMs);
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.eval(REFRESH_LOCK_SCRIPT, {
                            keys: [lock.key],
                            arguments: [lock.token, String(ttl)],
                        })];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Number(result) === 1];
                case 4:
                    error_4 = _a.sent();
                    logRedisError("Failed to refresh lock ".concat(lock.key), error_4);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function releaseDistributedLock(lock) {
    return __awaiter(this, void 0, void 0, function () {
        var client, result, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.eval(RELEASE_LOCK_SCRIPT, {
                            keys: [lock.key],
                            arguments: [lock.token],
                        })];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Number(result) === 1];
                case 4:
                    error_5 = _a.sent();
                    logRedisError("Failed to release lock ".concat(lock.key), error_5);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function setDistributedExpiringKey(key, value, ttlMs) {
    return __awaiter(this, void 0, void 0, function () {
        var client, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.set(key, value, { PX: getValidTtl(ttlMs) })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _a.sent();
                    logRedisError("Failed to set expiring key ".concat(key), error_6);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function clearDistributedKey(key) {
    return __awaiter(this, void 0, void 0, function () {
        var client, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getRedisClient()];
                case 1:
                    client = _a.sent();
                    if (!client)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.del(key)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_7 = _a.sent();
                    logRedisError("Failed to clear key ".concat(key), error_7);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
