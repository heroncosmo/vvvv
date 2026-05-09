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
exports.storage = exports.DatabaseStorage = exports.dbCircuitBreaker = exports.memoryCache = void 0;
var schema_1 = require("@shared/schema");
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
var mistralClient_1 = require("./mistralClient");
var supabaseAuth_1 = require("./supabaseAuth");
var adminFollowupMigrationService_1 = require("./adminFollowupMigrationService");
var adminConversationAutomationState_1 = require("./adminConversationAutomationState");
var MemoryCache = /** @class */ (function () {
    function MemoryCache() {
        this.cache = new Map();
        this.inflight = new Map();
        this.maxSize = 2000; // Máximo de entradas no cache
    }
    MemoryCache.prototype.set = function (key, data, ttlMs) {
        if (ttlMs === void 0) { ttlMs = 30000; }
        // Limpar cache se estiver muito grande
        if (this.cache.size >= this.maxSize) {
            this.cleanup();
        }
        this.cache.set(key, { data: data, timestamp: Date.now(), ttl: ttlMs });
    };
    MemoryCache.prototype.get = function (key) {
        var entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    };
    /** Check if key exists in cache (distinguishes cached null from cache miss) */
    MemoryCache.prototype.has = function (key) {
        var entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return false;
        }
        return true;
    };
    /**
     * Get-or-compute with thundering herd protection.
     * Only ONE concurrent call per key actually runs computeFn;
     * all others await the same Promise.
     */
    MemoryCache.prototype.getOrCompute = function (key_1, computeFn_1) {
        return __awaiter(this, arguments, void 0, function (key, computeFn, ttlMs) {
            var existing, promise;
            var _this = this;
            if (ttlMs === void 0) { ttlMs = 30000; }
            return __generator(this, function (_a) {
                // 1. Check cache
                if (this.has(key)) {
                    return [2 /*return*/, this.get(key)];
                }
                existing = this.inflight.get(key);
                if (existing)
                    return [2 /*return*/, existing];
                promise = computeFn().then(function (result) {
                    _this.set(key, result, ttlMs);
                    _this.inflight.delete(key);
                    return result;
                }).catch(function (err) {
                    _this.inflight.delete(key);
                    throw err;
                });
                this.inflight.set(key, promise);
                return [2 /*return*/, promise];
            });
        });
    };
    MemoryCache.prototype.invalidate = function (pattern) {
        for (var _i = 0, _a = this.cache.keys(); _i < _a.length; _i++) {
            var key = _a[_i];
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    };
    MemoryCache.prototype.cleanup = function () {
        var _this = this;
        var now = Date.now();
        for (var _i = 0, _a = this.cache.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], entry = _b[1];
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
        // Se ainda estiver grande, remover os mais antigos
        if (this.cache.size >= this.maxSize) {
            var entries = Array.from(this.cache.entries())
                .sort(function (a, b) { return a[1].timestamp - b[1].timestamp; });
            var toRemove = entries.slice(0, Math.floor(this.maxSize / 2));
            toRemove.forEach(function (_a) {
                var key = _a[0];
                return _this.cache.delete(key);
            });
        }
    };
    MemoryCache.prototype.getStats = function () {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: 'n/a',
        };
    };
    return MemoryCache;
}());
exports.memoryCache = new MemoryCache();
function isAudioPlaceholderText(text) {
    var normalized = String(text || "").trim().toLowerCase();
    if (!normalized) {
        return true;
    }
    if (normalized === "audio" ||
        normalized === "áudio" ||
        normalized === "[audio enviado]" ||
        normalized === "[áudio enviado]") {
        return true;
    }
    return (normalized.startsWith("[audio") ||
        normalized.startsWith("[áudio") ||
        normalized.startsWith("🎵") ||
        normalized.startsWith("🎤") ||
        normalized.startsWith("??"));
}
var ensureAdminSetupTablesPromise = null;
function resolveAudioTranscriptionForMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        var audioBuffer, base64Part, audioResponse, arrayBuffer, fetchError_1, transcriptionModel, conversation, connection, transcription;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (params.mediaType !== "audio" || !params.mediaUrl) {
                        return [2 /*return*/, null];
                    }
                    audioBuffer = null;
                    if (!params.mediaUrl.startsWith("data:")) return [3 /*break*/, 1];
                    base64Part = params.mediaUrl.split(",")[1];
                    if (base64Part) {
                        audioBuffer = Buffer.from(base64Part, "base64");
                        console.log("\uD83C\uDFA4 [Storage] \u00C1udio base64 detectado: ".concat(audioBuffer.length, " bytes"));
                    }
                    return [3 /*break*/, 8];
                case 1:
                    if (!(params.mediaUrl.startsWith("http://") || params.mediaUrl.startsWith("https://"))) return [3 /*break*/, 8];
                    console.log("\uD83C\uDFA4 [Storage] Baixando \u00E1udio de URL externa para transcri\u00E7\u00E3o...");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 7, , 8]);
                    return [4 /*yield*/, fetch(params.mediaUrl)];
                case 3:
                    audioResponse = _a.sent();
                    if (!audioResponse.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, audioResponse.arrayBuffer()];
                case 4:
                    arrayBuffer = _a.sent();
                    audioBuffer = Buffer.from(arrayBuffer);
                    console.log("\uD83C\uDFA4 [Storage] \u00C1udio baixado da URL: ".concat(audioBuffer.length, " bytes"));
                    return [3 /*break*/, 6];
                case 5:
                    console.error("\uD83C\uDFA4 [Storage] Erro ao baixar \u00E1udio: HTTP ".concat(audioResponse.status));
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    fetchError_1 = _a.sent();
                    console.error("\uD83C\uDFA4 [Storage] Erro ao fazer fetch do \u00E1udio:", fetchError_1);
                    return [3 /*break*/, 8];
                case 8:
                    if (!audioBuffer || audioBuffer.length === 0) {
                        console.log("\uD83C\uDFA4 [Storage] \u26A0\uFE0F N\u00E3o foi poss\u00EDvel obter buffer do \u00E1udio para transcri\u00E7\u00E3o");
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, params.conversationId))];
                case 9:
                    conversation = (_a.sent())[0];
                    if (!conversation) return [3 /*break*/, 11];
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, conversation.connectionId))];
                case 10:
                    connection = (_a.sent())[0];
                    if (connection === null || connection === void 0 ? void 0 : connection.userId) {
                        transcriptionModel = process.env.MISTRAL_TRANSCRIPTION_MODEL || undefined;
                    }
                    _a.label = 11;
                case 11:
                    console.log("\uD83C\uDFA4 [Storage] Iniciando transcri\u00E7\u00E3o com Mistral...");
                    return [4 /*yield*/, (0, mistralClient_1.transcribeAudioWithMistral)(audioBuffer, {
                            fileName: "whatsapp-audio.ogg",
                            model: transcriptionModel,
                        })];
                case 12:
                    transcription = _a.sent();
                    if (transcription && transcription.length > 0) {
                        console.log("\uD83C\uDFA4 [Storage] \u2705 Transcri\u00E7\u00E3o bem-sucedida: \"".concat(transcription.substring(0, 100), "...\""));
                        return [2 /*return*/, transcription];
                    }
                    console.log("\uD83C\uDFA4 [Storage] \u26A0\uFE0F Transcri\u00E7\u00E3o vazia ou nula");
                    return [2 /*return*/, null];
            }
        });
    });
}
// ============================================
// CIRCUIT BREAKER PARA PROTEÇÃO DO DB
// ============================================
var CircuitBreaker = /** @class */ (function () {
    function CircuitBreaker() {
        this.failures = 0;
        this.lastFailure = 0;
        this.state = 'closed';
        this.threshold = 5; // Número de falhas para abrir
        this.resetTimeout = 30000; // 30 segundos para tentar novamente
    }
    CircuitBreaker.prototype.execute = function (operation, fallback) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.state === 'open') {
                            if (Date.now() - this.lastFailure > this.resetTimeout) {
                                this.state = 'half-open';
                            }
                            else {
                                console.warn('⚡ [Circuit Breaker] Circuito ABERTO - usando fallback');
                                if (fallback !== undefined)
                                    return [2 /*return*/, fallback];
                                throw new Error('Database circuit breaker is open');
                            }
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, operation()];
                    case 2:
                        result = _a.sent();
                        if (this.state === 'half-open') {
                            this.state = 'closed';
                            this.failures = 0;
                            console.log('✅ [Circuit Breaker] Circuito FECHADO - DB recuperado');
                        }
                        return [2 /*return*/, result];
                    case 3:
                        error_1 = _a.sent();
                        this.failures++;
                        this.lastFailure = Date.now();
                        if (this.failures >= this.threshold) {
                            this.state = 'open';
                            console.error("\uD83D\uDD34 [Circuit Breaker] Circuito ABERTO ap\u00F3s ".concat(this.failures, " falhas"));
                        }
                        if (fallback !== undefined)
                            return [2 /*return*/, fallback];
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CircuitBreaker.prototype.isOpen = function () {
        return this.state === 'open';
    };
    CircuitBreaker.prototype.getState = function () {
        return this.state;
    };
    return CircuitBreaker;
}());
exports.dbCircuitBreaker = new CircuitBreaker();
// In-memory storage for campaigns and contact lists
var campaignsStore = new Map();
var contactListsStore = new Map();
var syncedContactsStore = new Map();
function unwrapDbError(error) {
    if (!error || typeof error !== "object")
        return error;
    return error.cause && typeof error.cause === "object" ? error.cause : error;
}
function getDbErrorCode(error) {
    var _a;
    var directCode = error === null || error === void 0 ? void 0 : error.code;
    if (typeof directCode === "string" && directCode.length > 0)
        return directCode;
    var wrappedCode = (_a = error === null || error === void 0 ? void 0 : error.cause) === null || _a === void 0 ? void 0 : _a.code;
    if (typeof wrappedCode === "string" && wrappedCode.length > 0)
        return wrappedCode;
    return undefined;
}
function getDbConstraintName(error) {
    var _a;
    var directConstraint = error === null || error === void 0 ? void 0 : error.constraint;
    if (typeof directConstraint === "string" && directConstraint.length > 0)
        return directConstraint;
    var wrappedConstraint = (_a = error === null || error === void 0 ? void 0 : error.cause) === null || _a === void 0 ? void 0 : _a.constraint;
    if (typeof wrappedConstraint === "string" && wrappedConstraint.length > 0)
        return wrappedConstraint;
    return undefined;
}
function getDbErrorMessage(error) {
    var _a;
    var raw = (error === null || error === void 0 ? void 0 : error.message) || ((_a = error === null || error === void 0 ? void 0 : error.cause) === null || _a === void 0 ? void 0 : _a.message) || "";
    return typeof raw === "string" ? raw : "";
}
function isPendingAiSkippedConstraintError(error) {
    var _a;
    var normalized = unwrapDbError(error);
    var code = getDbErrorCode(normalized);
    var constraint = ((_a = getDbConstraintName(normalized)) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
    var message = getDbErrorMessage(normalized).toLowerCase();
    if (code === "23514")
        return true;
    if (constraint.includes("pending_ai_responses_status_check"))
        return true;
    return (message.includes("pending_ai_responses_status_check") ||
        (message.includes("violates check constraint") && message.includes("pending_ai_responses")));
}
var DatabaseStorage = /** @class */ (function () {
    function DatabaseStorage() {
        this.pendingAiSkippedUnsupported = false;
    }
    // User operations
    DatabaseStorage.prototype.getUser = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id))];
                    case 1:
                        user = (_a.sent())[0];
                        return [2 /*return*/, user];
                }
            });
        });
    };
    DatabaseStorage.prototype.getUserByPhone = function (phone) {
        return __awaiter(this, void 0, void 0, function () {
            var cleanPhone, phoneWithPlus, user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cleanPhone = phone.replace(/\D/g, "");
                        phoneWithPlus = "+" + cleanPhone;
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " = ", " OR ", " = ", " OR REPLACE(", ", '+', '') = ", ""], ["", " = ", " OR ", " = ", " OR REPLACE(", ", '+', '') = ", ""])), schema_1.users.phone, phoneWithPlus, schema_1.users.phone, cleanPhone, schema_1.users.phone, cleanPhone))];
                    case 1:
                        user = (_a.sent())[0];
                        return [2 /*return*/, user];
                }
            });
        });
    };
    DatabaseStorage.prototype.getUserByEmail = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email))
                            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["CASE WHEN COALESCE(", ", '') <> '' OR COALESCE(", ", '') <> '' THEN 1 ELSE 0 END"], ["CASE WHEN COALESCE(", ", '') <> '' OR COALESCE(", ", '') <> '' THEN 1 ELSE 0 END"])), schema_1.users.phone, schema_1.users.whatsappNumber)), (0, drizzle_orm_1.desc)(schema_1.users.updatedAt), (0, drizzle_orm_1.desc)(schema_1.users.createdAt))
                            .limit(1)];
                    case 1:
                        user = (_a.sent())[0];
                        return [2 /*return*/, user];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateUser = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.update(schema_1.users).set(data).where((0, drizzle_orm_1.eq)(schema_1.users.id, id))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id))];
                    case 2:
                        user = (_a.sent())[0];
                        return [2 /*return*/, user];
                }
            });
        });
    };
    DatabaseStorage.prototype.upsertUser = function (userData) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.users)
                            .values(userData)
                            .onConflictDoUpdate({
                            target: schema_1.users.id,
                            set: __assign(__assign({}, userData), { updatedAt: new Date() }),
                        })
                            .returning()];
                    case 1:
                        user = (_a.sent())[0];
                        return [2 /*return*/, user];
                }
            });
        });
    };
    // Delete user and all related data (cascade)
    DatabaseStorage.prototype.deleteUser = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var userConnections, _i, userConnections_1, connection, userConversations, _a, userConversations_1, conv, subscription;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[STORAGE] Deleting user ".concat(id, " and all related data..."));
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.whatsappConnections)
                                .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, id))];
                    case 1:
                        userConnections = _b.sent();
                        _i = 0, userConnections_1 = userConnections;
                        _b.label = 2;
                    case 2:
                        if (!(_i < userConnections_1.length)) return [3 /*break*/, 12];
                        connection = userConnections_1[_i];
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 3:
                        userConversations = _b.sent();
                        _a = 0, userConversations_1 = userConversations;
                        _b.label = 4;
                    case 4:
                        if (!(_a < userConversations_1.length)) return [3 /*break*/, 7];
                        conv = userConversations_1[_a];
                        return [4 /*yield*/, db_1.db.delete(schema_1.messages).where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conv.id))];
                    case 5:
                        _b.sent();
                        _b.label = 6;
                    case 6:
                        _a++;
                        return [3 /*break*/, 4];
                    case 7: return [4 /*yield*/, db_1.db.delete(schema_1.conversations).where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 8:
                        _b.sent();
                        return [4 /*yield*/, db_1.db.delete(schema_1.whatsappContacts).where((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connection.id))];
                    case 9:
                        _b.sent();
                        return [4 /*yield*/, db_1.db.delete(schema_1.whatsappConnections).where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, connection.id))];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11:
                        _i++;
                        return [3 /*break*/, 2];
                    case 12: 
                    // Delete AI agent config
                    return [4 /*yield*/, db_1.db.delete(schema_1.aiAgentConfig).where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, id))];
                    case 13:
                        // Delete AI agent config
                        _b.sent();
                        // Delete business agent config
                        return [4 /*yield*/, db_1.db.delete(schema_1.businessAgentConfigs).where((0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, id))];
                    case 14:
                        // Delete business agent config
                        _b.sent();
                        return [4 /*yield*/, db_1.db.select().from(schema_1.subscriptions).where((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, id))];
                    case 15:
                        subscription = _b.sent();
                        if (!(subscription.length > 0)) return [3 /*break*/, 18];
                        return [4 /*yield*/, db_1.db.delete(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.subscriptionId, subscription[0].id))];
                    case 16:
                        _b.sent();
                        return [4 /*yield*/, db_1.db.delete(schema_1.subscriptions).where((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, id))];
                    case 17:
                        _b.sent();
                        _b.label = 18;
                    case 18: 
                    // Finally delete the user
                    return [4 /*yield*/, db_1.db.delete(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id))];
                    case 19:
                        // Finally delete the user
                        _b.sent();
                        console.log("[STORAGE] User ".concat(id, " and all related data deleted successfully"));
                        return [2 /*return*/];
                }
            });
        });
    };
    // Agent operations
    DatabaseStorage.prototype.getAgents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var agentsList;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agents)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.agents.createdAt))];
                    case 1:
                        agentsList = _a.sent();
                        return [2 /*return*/, agentsList];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAgent = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var agent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agents)
                            .where((0, drizzle_orm_1.eq)(schema_1.agents.id, id))
                            .limit(1)];
                    case 1:
                        agent = (_a.sent())[0];
                        return [2 /*return*/, agent];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAgent = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var agent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.agents)
                            .values(data)
                            .returning()];
                    case 1:
                        agent = (_a.sent())[0];
                        return [2 /*return*/, agent];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAgent = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var agent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.agents)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.agents.id, id))
                            .returning()];
                    case 1:
                        agent = (_a.sent())[0];
                        return [2 /*return*/, agent];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteAgent = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.agents).where((0, drizzle_orm_1.eq)(schema_1.agents.id, id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // WhatsApp connection operations
    // FIX: Priorizar conexão primária/conectada em vez de apenas a mais recente
    // Isso evita que conexões secundárias recém-criadas "roubem" a sessão principal
    DatabaseStorage.prototype.getConnectionByUserId = function (userId, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey;
            var _this = this;
            return __generator(this, function (_a) {
                cacheKey = connectionId
                    ? "connByUser:".concat(userId, ":").concat(connectionId)
                    : "connByUser:".concat(userId);
                return [2 /*return*/, exports.memoryCache.getOrCompute(cacheKey, function () { return __awaiter(_this, void 0, void 0, function () {
                        var specific, primaryConnected, connectedConn, primaryConn, anyConn;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!connectionId) return [3 /*break*/, 2];
                                    return [4 /*yield*/, db_1.db
                                            .select()
                                            .from(schema_1.whatsappConnections)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, connectionId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId)))
                                            .limit(1)];
                                case 1:
                                    specific = (_a.sent())[0];
                                    if (specific)
                                        return [2 /*return*/, specific];
                                    _a.label = 2;
                                case 2: return [4 /*yield*/, db_1.db
                                        .select()
                                        .from(schema_1.whatsappConnections)
                                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isPrimary, true)))
                                        .limit(1)];
                                case 3:
                                    primaryConnected = (_a.sent())[0];
                                    if (primaryConnected)
                                        return [2 /*return*/, primaryConnected];
                                    return [4 /*yield*/, db_1.db
                                            .select()
                                            .from(schema_1.whatsappConnections)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true)))
                                            .orderBy(schema_1.whatsappConnections.createdAt)
                                            .limit(1)];
                                case 4:
                                    connectedConn = (_a.sent())[0];
                                    if (connectedConn)
                                        return [2 /*return*/, connectedConn];
                                    return [4 /*yield*/, db_1.db
                                            .select()
                                            .from(schema_1.whatsappConnections)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isPrimary, true)))
                                            .limit(1)];
                                case 5:
                                    primaryConn = (_a.sent())[0];
                                    if (primaryConn)
                                        return [2 /*return*/, primaryConn];
                                    return [4 /*yield*/, db_1.db
                                            .select()
                                            .from(schema_1.whatsappConnections)
                                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId))
                                            .orderBy(schema_1.whatsappConnections.createdAt)
                                            .limit(1)];
                                case 6:
                                    anyConn = (_a.sent())[0];
                                    return [2 /*return*/, anyConn];
                            }
                        });
                    }); }, 30000)]; // 30s cache
            });
        });
    };
    DatabaseStorage.prototype.getConnectionById = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, connectionId))
                            .limit(1)];
                    case 1:
                        connection = (_a.sent())[0];
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminWhatsappConnection)
                            .limit(1)];
                    case 1:
                        connection = (_a.sent())[0];
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAllConnections = function () {
        return __awaiter(this, void 0, void 0, function () {
            var connections;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () {
                            return db_1.db
                                .select()
                                .from(schema_1.whatsappConnections)
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappConnections.createdAt));
                        })];
                    case 1:
                        connections = _a.sent();
                        return [2 /*return*/, connections];
                }
            });
        });
    };
    // Retorna UMA conexão por userId (a principal/conectada), para uso em
    // restoreExistingSessions e healthCheck — evita duplicatas e loops
    DatabaseStorage.prototype.getPrimaryConnectionPerUser = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allConnections, seen, _i, allConnections_1, conn, existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllConnections()];
                    case 1:
                        allConnections = _a.sent();
                        seen = new Map();
                        for (_i = 0, allConnections_1 = allConnections; _i < allConnections_1.length; _i++) {
                            conn = allConnections_1[_i];
                            if (!conn.userId)
                                continue;
                            existing = seen.get(conn.userId);
                            if (!existing) {
                                seen.set(conn.userId, conn);
                            }
                            else {
                                // Prioridade: conectado > primary > mais antigo
                                if (conn.isConnected && !existing.isConnected) {
                                    seen.set(conn.userId, conn);
                                }
                                else if (!existing.isConnected && !conn.isConnected && conn.isPrimary && !existing.isPrimary) {
                                    seen.set(conn.userId, conn);
                                }
                            }
                        }
                        return [2 /*return*/, Array.from(seen.values())];
                }
            });
        });
    };
    DatabaseStorage.prototype.createConnection = function (connectionData) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.whatsappConnections)
                            .values(connectionData)
                            .returning()];
                    case 1:
                        connection = (_a.sent())[0];
                        exports.memoryCache.invalidate("connByUser:".concat(connection.userId));
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateConnection = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.whatsappConnections)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, id))
                            .returning()];
                    case 1:
                        connection = (_a.sent())[0];
                        exports.memoryCache.invalidate("connByUser:".concat(connection.userId));
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteConnection = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, id))
                            .limit(1)];
                    case 1:
                        connection = (_a.sent())[0];
                        return [4 /*yield*/, db_1.db.delete(schema_1.whatsappConnections).where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, id))];
                    case 2:
                        _a.sent();
                        if (connection === null || connection === void 0 ? void 0 : connection.userId) {
                            exports.memoryCache.invalidate("connByUser:".concat(connection.userId));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Multi-connection: get all connections for a user
    DatabaseStorage.prototype.getConnectionsByUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappConnections.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    // Connection Agents (many-to-many) CRUD
    DatabaseStorage.prototype.getConnectionAgents = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.connectionAgents)
                            .where((0, drizzle_orm_1.eq)(schema_1.connectionAgents.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.connectionAgents.assignedAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAgentConnections = function (agentId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.connectionAgents)
                            .where((0, drizzle_orm_1.eq)(schema_1.connectionAgents.agentId, agentId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.connectionAgents.assignedAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.addConnectionAgent = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var record;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.connectionAgents)
                            .values(data)
                            .onConflictDoUpdate({
                            target: [schema_1.connectionAgents.connectionId, schema_1.connectionAgents.agentId],
                            set: { isActive: (_a = data.isActive) !== null && _a !== void 0 ? _a : true, assignedBy: data.assignedBy },
                        })
                            .returning()];
                    case 1:
                        record = (_b.sent())[0];
                        return [2 /*return*/, record];
                }
            });
        });
    };
    DatabaseStorage.prototype.removeConnectionAgent = function (connectionId, agentId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.connectionAgents).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.connectionAgents.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.connectionAgents.agentId, agentId)))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateConnectionAgent = function (connectionId, agentId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var record;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.connectionAgents)
                            .set(data)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.connectionAgents.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.connectionAgents.agentId, agentId)))
                            .returning()];
                    case 1:
                        record = (_a.sent())[0];
                        return [2 /*return*/, record];
                }
            });
        });
    };
    // Connection Members CRUD
    DatabaseStorage.prototype.getConnectionMembers = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.connectionMembers)
                            .where((0, drizzle_orm_1.eq)(schema_1.connectionMembers.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.connectionMembers.assignedAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.addConnectionMember = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var record;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.connectionMembers)
                            .values(data)
                            .onConflictDoUpdate({
                            target: [schema_1.connectionMembers.connectionId, schema_1.connectionMembers.memberId],
                            set: { canView: data.canView, canRespond: data.canRespond, canManage: data.canManage },
                        })
                            .returning()];
                    case 1:
                        record = (_a.sent())[0];
                        return [2 /*return*/, record];
                }
            });
        });
    };
    DatabaseStorage.prototype.removeConnectionMember = function (connectionId, memberId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.connectionMembers).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.connectionMembers.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.connectionMembers.memberId, memberId)))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateConnectionMember = function (connectionId, memberId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var record;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.connectionMembers)
                            .set(data)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.connectionMembers.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.connectionMembers.memberId, memberId)))
                            .returning()];
                    case 1:
                        record = (_a.sent())[0];
                        return [2 /*return*/, record];
                }
            });
        });
    };
    // Conversation operations
    DatabaseStorage.prototype.getConversationsByConnectionId = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " DESC NULLS LAST"], ["", " DESC NULLS LAST"])), schema_1.conversations.lastMessageTime))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    // 🔥 OTIMIZADO: Retorna apenas COUNT e SUM ao invés de carregar 20k+ rows
    DatabaseStorage.prototype.getConversationStatsCount = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, result, stats;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        cacheKey = "convStats:".concat(connectionId);
                        cached = exports.memoryCache.get(cacheKey);
                        if (cached !== null)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, db_1.db
                                .select({
                                total: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                                unread: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["coalesce(sum(\"unread_count\"), 0)::int"], ["coalesce(sum(\"unread_count\"), 0)::int"]))),
                            })
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId))];
                    case 1:
                        result = _c.sent();
                        stats = { total: ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total) || 0, unread: ((_b = result[0]) === null || _b === void 0 ? void 0 : _b.unread) || 0 };
                        exports.memoryCache.set(cacheKey, stats, 30000); // Cache 30s
                        return [2 /*return*/, stats];
                }
            });
        });
    };
    DatabaseStorage.prototype.getConversationByContactNumber = function (connectionId, contactNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.conversations.contactNumber, contactNumber)))];
                    case 1:
                        conversation = (_a.sent())[0];
                        return [2 /*return*/, conversation];
                }
            });
        });
    };
    // FIX Encerramento: retorna apenas conversas ativas (nao fechadas) pelo numero do contato
    DatabaseStorage.prototype.getActiveConversationByContactNumber = function (connectionId, contactNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.conversations.contactNumber, contactNumber), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.conversations.isClosed, false), (0, drizzle_orm_1.isNull)(schema_1.conversations.isClosed))))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.conversations.updatedAt))
                            .limit(1)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result[0]];
                }
            });
        });
    };
    DatabaseStorage.prototype.getConversation = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                // ⚡ CACHE: Conversation metadata por 30s (ownership check frequente)
                return [2 /*return*/, exports.memoryCache.getOrCompute("conv:".concat(id), function () { return __awaiter(_this, void 0, void 0, function () {
                        var conversation;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, db_1.db
                                        .select()
                                        .from(schema_1.conversations)
                                        .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, id))];
                                case 1:
                                    conversation = (_a.sent())[0];
                                    return [2 /*return*/, conversation];
                            }
                        });
                    }); }, 30000)];
            });
        });
    };
    DatabaseStorage.prototype.invalidateConversationListCaches = function (connectionId) {
        if (!connectionId)
            return;
        exports.memoryCache.invalidate("convWithTags:".concat(connectionId));
        exports.memoryCache.invalidate("convCount:".concat(connectionId));
        exports.memoryCache.invalidate("convStats:".concat(connectionId));
    };
    DatabaseStorage.prototype.createConversation = function (conversationData) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, updated, conversation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(conversationData.connectionId && conversationData.contactNumber)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.getActiveConversationByContactNumber(conversationData.connectionId, conversationData.contactNumber)];
                    case 1:
                        existing = _a.sent();
                        if (!existing) return [3 /*break*/, 3];
                        console.log("\u26A0\uFE0F [STORAGE] Conversa ativa j\u00E1 existe para ".concat(conversationData.contactNumber, " (").concat(existing.id, "), retornando existente em vez de duplicar"));
                        return [4 /*yield*/, this.updateConversation(existing.id, {
                                contactName: conversationData.contactName || existing.contactName,
                                contactAvatar: conversationData.contactAvatar || existing.contactAvatar,
                                lastMessageText: conversationData.lastMessageText || existing.lastMessageText,
                                lastMessageTime: conversationData.lastMessageTime || existing.lastMessageTime,
                            })];
                    case 2:
                        updated = _a.sent();
                        return [2 /*return*/, updated];
                    case 3: return [4 /*yield*/, db_1.db
                            .insert(schema_1.conversations)
                            .values(conversationData)
                            .returning()];
                    case 4:
                        conversation = (_a.sent())[0];
                        this.invalidateConversationListCaches(conversation.connectionId);
                        return [2 /*return*/, conversation];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateConversation = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // ⚡ Invalidar cache da conversa
                        exports.memoryCache.invalidate("conv:".concat(id));
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.conversations)
                                .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, id))
                                .returning()];
                    case 1:
                        conversation = (_a.sent())[0];
                        this.invalidateConversationListCaches(conversation.connectionId);
                        return [2 /*return*/, conversation];
                }
            });
        });
    };
    DatabaseStorage.prototype.getConversationByShareToken = function (shareToken) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.shareToken, shareToken))];
                    case 1:
                        conversation = (_a.sent())[0];
                        return [2 /*return*/, conversation];
                }
            });
        });
    };
    // Message operations - OTIMIZADO para reduzir egress do Supabase
    // ⚡ CRÍTICO: NÃO retorna media_url para economizar egress massivamente!
    // media_url pode ter 50KB-500KB de base64 por mensagem!
    DatabaseStorage.prototype.getMessagesByConversationId = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cacheKey = "messages:".concat(conversationId);
                        cached = exports.memoryCache.get(cacheKey);
                        if (cached)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, db_1.db
                                .select({
                                id: schema_1.messages.id,
                                conversationId: schema_1.messages.conversationId,
                                messageId: schema_1.messages.messageId,
                                fromMe: schema_1.messages.fromMe,
                                text: schema_1.messages.text,
                                timestamp: schema_1.messages.timestamp,
                                status: schema_1.messages.status,
                                isFromAgent: schema_1.messages.isFromAgent,
                                mediaType: schema_1.messages.mediaType,
                                mediaUrl: schema_1.messages.mediaUrl, // ✅ NECESSÁRIO para mostrar player
                                mediaKey: schema_1.messages.mediaKey,
                                directPath: schema_1.messages.directPath,
                                mediaMimeType: schema_1.messages.mediaMimeType,
                                mediaDuration: schema_1.messages.mediaDuration,
                                mediaCaption: schema_1.messages.mediaCaption,
                                createdAt: schema_1.messages.createdAt,
                            })
                                .from(schema_1.messages)
                                .where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId))
                                .orderBy(schema_1.messages.timestamp)];
                    case 1:
                        result = _a.sent();
                        // Cache por 60 segundos (aumentado para reduzir queries)
                        exports.memoryCache.set(cacheKey, result, 60000);
                        return [2 /*return*/, result];
                }
            });
        });
    };
    // Paginação: carrega as N mensagens mais recentes (ou antes de um cursor)
    DatabaseStorage.prototype.getMessagesByConversationIdPaginated = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, limit, before) {
            var fetchLimit, conditions, result, hasMore, page;
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fetchLimit = limit + 1;
                        conditions = [(0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId)];
                        if (before) {
                            conditions.push((0, drizzle_orm_1.lt)(schema_1.messages.timestamp, before));
                        }
                        return [4 /*yield*/, db_1.db
                                .select({
                                id: schema_1.messages.id,
                                conversationId: schema_1.messages.conversationId,
                                messageId: schema_1.messages.messageId,
                                fromMe: schema_1.messages.fromMe,
                                text: schema_1.messages.text,
                                timestamp: schema_1.messages.timestamp,
                                status: schema_1.messages.status,
                                isFromAgent: schema_1.messages.isFromAgent,
                                mediaType: schema_1.messages.mediaType,
                                mediaUrl: schema_1.messages.mediaUrl,
                                mediaKey: schema_1.messages.mediaKey,
                                directPath: schema_1.messages.directPath,
                                mediaMimeType: schema_1.messages.mediaMimeType,
                                mediaDuration: schema_1.messages.mediaDuration,
                                mediaCaption: schema_1.messages.mediaCaption,
                                createdAt: schema_1.messages.createdAt,
                            })
                                .from(schema_1.messages)
                                .where(drizzle_orm_1.and.apply(void 0, conditions))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.messages.timestamp))
                                .limit(fetchLimit)];
                    case 1:
                        result = _a.sent();
                        hasMore = result.length > limit;
                        page = hasMore ? result.slice(0, limit) : result;
                        // Retornar em ordem cronológica (mais antiga primeiro)
                        page.reverse();
                        return [2 /*return*/, { messages: page, hasMore: hasMore }];
                }
            });
        });
    };
    // Busca mensagens mais recentes que uma data (para sync incremental)
    DatabaseStorage.prototype.getMessagesByConversationIdAfter = function (conversationId_1, after_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, after, limit) {
            var result;
            if (limit === void 0) { limit = 500; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.messages.id,
                            conversationId: schema_1.messages.conversationId,
                            messageId: schema_1.messages.messageId,
                            fromMe: schema_1.messages.fromMe,
                            text: schema_1.messages.text,
                            timestamp: schema_1.messages.timestamp,
                            status: schema_1.messages.status,
                            isFromAgent: schema_1.messages.isFromAgent,
                            mediaType: schema_1.messages.mediaType,
                            mediaUrl: schema_1.messages.mediaUrl,
                            mediaKey: schema_1.messages.mediaKey,
                            directPath: schema_1.messages.directPath,
                            mediaMimeType: schema_1.messages.mediaMimeType,
                            mediaDuration: schema_1.messages.mediaDuration,
                            mediaCaption: schema_1.messages.mediaCaption,
                            createdAt: schema_1.messages.createdAt,
                        })
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId), (0, drizzle_orm_1.gt)(schema_1.messages.timestamp, after)))
                            .orderBy(schema_1.messages.timestamp)
                            .limit(limit)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    // Nova função para buscar media_url de uma mensagem específica (lazy loading)
    DatabaseStorage.prototype.getMessageMedia = function (messageId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            mediaUrl: schema_1.messages.mediaUrl,
                            mediaType: schema_1.messages.mediaType
                        })
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.id, messageId))
                            .limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result || null];
                }
            });
        });
    };
    // Atualizar mediaUrl de uma mensagem (usado para re-download de mídia)
    DatabaseStorage.prototype.updateMessageMedia = function (messageId, newMediaUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var msg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.messages)
                            .set({ mediaUrl: newMediaUrl })
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.messageId, messageId))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .select({ conversationId: schema_1.messages.conversationId })
                                .from(schema_1.messages)
                                .where((0, drizzle_orm_1.eq)(schema_1.messages.messageId, messageId))
                                .limit(1)];
                    case 2:
                        msg = (_a.sent())[0];
                        if (msg === null || msg === void 0 ? void 0 : msg.conversationId) {
                            exports.memoryCache.invalidate("messages:".concat(msg.conversationId));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Versão completa com media_url - usar apenas quando REALMENTE necessário
    DatabaseStorage.prototype.getMessagesByConversationIdWithMedia = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, limit) {
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.messages.timestamp))
                            .limit(limit)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateMessage = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var currentMessage, nextMediaType, nextMediaUrl, nextText, conversationId, transcription, error_2, message;
            var _a, _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, this.getMessage(id)];
                    case 1:
                        currentMessage = _g.sent();
                        nextMediaType = (_b = (_a = data.mediaType) !== null && _a !== void 0 ? _a : currentMessage === null || currentMessage === void 0 ? void 0 : currentMessage.mediaType) !== null && _b !== void 0 ? _b : null;
                        nextMediaUrl = (_d = (_c = data.mediaUrl) !== null && _c !== void 0 ? _c : currentMessage === null || currentMessage === void 0 ? void 0 : currentMessage.mediaUrl) !== null && _d !== void 0 ? _d : null;
                        nextText = typeof data.text === "string"
                            ? data.text
                            : (_e = currentMessage === null || currentMessage === void 0 ? void 0 : currentMessage.text) !== null && _e !== void 0 ? _e : null;
                        conversationId = (_f = data.conversationId) !== null && _f !== void 0 ? _f : currentMessage === null || currentMessage === void 0 ? void 0 : currentMessage.conversationId;
                        if (!(conversationId &&
                            nextMediaType === "audio" &&
                            nextMediaUrl &&
                            isAudioPlaceholderText(nextText))) return [3 /*break*/, 5];
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, resolveAudioTranscriptionForMessage({
                                conversationId: conversationId,
                                mediaType: nextMediaType,
                                mediaUrl: nextMediaUrl,
                            })];
                    case 3:
                        transcription = _g.sent();
                        if (transcription) {
                            data.text = transcription;
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _g.sent();
                        console.error("Error transcribing audio message in storage.updateMessage:", error_2);
                        return [3 /*break*/, 5];
                    case 5: return [4 /*yield*/, db_1.db
                            .update(schema_1.messages)
                            .set(data)
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.id, id))
                            .returning()];
                    case 6:
                        message = (_g.sent())[0];
                        // 🔥 Invalidar cache de mensagens da conversa após atualização
                        if (message === null || message === void 0 ? void 0 : message.conversationId) {
                            exports.memoryCache.invalidate("messages:".concat(message.conversationId));
                        }
                        return [2 /*return*/, message];
                }
            });
        });
    };
    DatabaseStorage.prototype.getMessageByMessageId = function (messageId) {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.messageId, messageId))
                            .limit(1)];
                    case 1:
                        message = (_a.sent())[0];
                        return [2 /*return*/, message];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteMessagesByConversationId = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // 🔥 Invalidar cache antes de deletar
                        exports.memoryCache.invalidate("messages:".concat(conversationId));
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.messages)
                                .where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createMessage = function (messageData) {
        return __awaiter(this, void 0, void 0, function () {
            var data, transcription, error_3, imageUrl, analysisPrompt, imageDescription, error_4, message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = __assign({}, messageData);
                        // 🔥 CRÍTICO: Invalidar cache de mensagens da conversa ANTES de inserir
                        // Isso evita o bug onde a verificação de última mensagem retorna dados desatualizados
                        exports.memoryCache.invalidate("messages:".concat(data.conversationId));
                        if (!(data.mediaType === "audio" && data.mediaUrl)) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, resolveAudioTranscriptionForMessage({
                                conversationId: data.conversationId,
                                mediaType: data.mediaType,
                                mediaUrl: data.mediaUrl,
                            })];
                    case 2:
                        transcription = _a.sent();
                        if (transcription) {
                            data.text = transcription;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        console.error("Error transcribing audio message in storage.createMessage:", error_3);
                        return [3 /*break*/, 4];
                    case 4:
                        if (!(data.mediaType === "image" && data.mediaUrl && !data.fromMe)) return [3 /*break*/, 9];
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 8, , 9]);
                        imageUrl = data.mediaUrl;
                        // Se for base64, precisa converter para URL ou usar direto
                        // Mistral aceita tanto URL quanto base64 no formato data:image/...
                        if (imageUrl.startsWith("data:")) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage] Imagem base64 detectada, enviando direto para an\u00E1lise...");
                        }
                        else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage] Imagem URL detectada: ".concat(imageUrl.substring(0, 80), "..."));
                        }
                        else {
                            console.log("\uD83D\uDDBC\uFE0F [Storage] Formato de imagem n\u00E3o reconhecido, pulando an\u00E1lise");
                            imageUrl = "";
                        }
                        if (!imageUrl) return [3 /*break*/, 7];
                        console.log("\uD83D\uDDBC\uFE0F [Storage] Iniciando an\u00E1lise de imagem com Mistral Vision...");
                        analysisPrompt = "Analise esta imagem e descreva em portugu\u00EAs de forma clara e objetiva.\n\nIMPORTANTE:\n- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transfer\u00EAncia, boleto)\n- Se for um PRODUTO: descreva caracter\u00EDsticas visuais, marca se vis\u00EDvel\n- Se for uma D\u00DAVIDA/PERGUNTA: descreva o que a pessoa parece querer saber\n- Se for DOCUMENTO: identifique o tipo e informa\u00E7\u00F5es relevantes\n\nResponda de forma concisa (m\u00E1ximo 3 frases) descrevendo o que voc\u00EA v\u00EA.";
                        return [4 /*yield*/, (0, mistralClient_1.analyzeImageWithMistral)(imageUrl, analysisPrompt)];
                    case 6:
                        imageDescription = _a.sent();
                        if (imageDescription && imageDescription.length > 0) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage] \u2705 An\u00E1lise de imagem bem-sucedida: \"".concat(imageDescription.substring(0, 100), "...\""));
                            // Substituir texto genérico pela descrição da imagem
                            data.text = "[IMAGEM ANALISADA: ".concat(imageDescription, "]");
                        }
                        else {
                            console.log("\uD83D\uDDBC\uFE0F [Storage] \u26A0\uFE0F An\u00E1lise de imagem vazia ou nula");
                            data.text = data.text || "(imagem enviada pelo cliente)";
                        }
                        _a.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_4 = _a.sent();
                        console.error("Error analyzing image message in storage.createMessage:", error_4);
                        // Manter texto original em caso de erro
                        data.text = data.text || "(imagem enviada pelo cliente)";
                        return [3 /*break*/, 9];
                    case 9: return [4 /*yield*/, db_1.db
                            .insert(schema_1.messages)
                            .values(data)
                            .returning()];
                    case 10:
                        message = (_a.sent())[0];
                        return [2 /*return*/, message];
                }
            });
        });
    };
    // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
    // Reduz drasticamente o Egress do Supabase
    DatabaseStorage.prototype.getTodayMessagesCount = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, today, result, count;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cacheKey = "todayMsgCount:".concat(connectionId);
                        cached = exports.memoryCache.get(cacheKey);
                        if (cached !== null)
                            return [2 /*return*/, cached];
                        today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))) })
                                .from(schema_1.messages)
                                .innerJoin(schema_1.conversations, (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, schema_1.conversations.id))
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.gte)(schema_1.messages.timestamp, today)))];
                    case 1:
                        result = _b.sent();
                        count = ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                        exports.memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
                        return [2 /*return*/, count];
                }
            });
        });
    };
    // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
    // Antes: trazia TODAS as mensagens do agente (milhares de rows com media_url grande)
    // Agora: retorna apenas 1 número, reduz Egress em ~99%
    DatabaseStorage.prototype.getAgentMessagesCount = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, result, count;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cacheKey = "agentMsgCount:".concat(connectionId);
                        cached = exports.memoryCache.get(cacheKey);
                        if (cached !== null)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))) })
                                .from(schema_1.messages)
                                .innerJoin(schema_1.conversations, (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, schema_1.conversations.id))
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.messages.isFromAgent, true)))];
                    case 1:
                        result = _b.sent();
                        count = ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                        exports.memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
                        return [2 /*return*/, count];
                }
            });
        });
    };
    // AI Agent operations
    DatabaseStorage.prototype.getAgentConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.aiAgentConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, userId))];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    DatabaseStorage.prototype.upsertAgentConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.aiAgentConfig)
                            .values(__assign({ userId: userId }, data))
                            .onConflictDoUpdate({
                            target: schema_1.aiAgentConfig.userId,
                            set: __assign(__assign({}, data), { updatedAt: new Date() }),
                        })
                            .returning()];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAgentConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.aiAgentConfig)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, userId))
                            .returning()];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    // 🆕 Business Agent Configuration operations (Advanced System)
    DatabaseStorage.prototype.getBusinessAgentConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.businessAgentConfigs)
                            .where((0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId))];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    DatabaseStorage.prototype.upsertBusinessAgentConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.businessAgentConfigs)
                            .values(__assign({ userId: userId }, data))
                            .onConflictDoUpdate({
                            target: schema_1.businessAgentConfigs.userId,
                            set: __assign(__assign({}, data), { updatedAt: new Date() }),
                        })
                            .returning()];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteBusinessAgentConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .delete(schema_1.businessAgentConfigs)
                            .where((0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Verificar se IA está desativada para uma conversa
     *
     * ⚠️ IMPORTANTE: A IA é controlada APENAS pela tabela agent_disabled_conversations
     * Follow-up é controlado SEPARADAMENTE por conversations.followupActive
     * IA e Follow-up são sistemas INDEPENDENTES!
     *
     * IA é desativada quando:
     * 1. Existe entrada em agent_disabled_conversations (pausa temporária quando dono responde)
     *
     * Follow-up é desativado quando:
     * 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
     * 2. Toggle individual na conversa está desativado (conversations.followupActive)
     */
    DatabaseStorage.prototype.isAgentDisabledForConversation = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var disabled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentDisabledConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentDisabledConversations.conversationId, conversationId))];
                    case 1:
                        disabled = (_a.sent())[0];
                        return [2 /*return*/, !!disabled];
                }
            });
        });
    };
    DatabaseStorage.prototype.disableAgentForConversation = function (conversationId, autoReactivateAfterMinutes) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.agentDisabledConversations)
                            .values({
                            conversationId: conversationId,
                            ownerLastReplyAt: new Date(),
                            autoReactivateAfterMinutes: autoReactivateAfterMinutes !== null && autoReactivateAfterMinutes !== void 0 ? autoReactivateAfterMinutes : null,
                            clientHasPendingMessage: false,
                            clientLastMessageAt: null,
                        })
                            .onConflictDoUpdate({
                            target: schema_1.agentDisabledConversations.conversationId,
                            set: {
                                ownerLastReplyAt: new Date(),
                                autoReactivateAfterMinutes: autoReactivateAfterMinutes !== null && autoReactivateAfterMinutes !== void 0 ? autoReactivateAfterMinutes : null,
                                // Reset pending message flag when owner replies again
                                clientHasPendingMessage: false,
                            }
                        })];
                    case 1:
                        _a.sent();
                        // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
                        // A desativação da IA NÃO deve afetar o follow-up
                        // Follow-up só deve ser cancelado quando:
                        // 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
                        // 2. Toggle individual na conversa está desativado (conversations.followupActive)
                        // A IA e o Follow-up são sistemas separados e independentes!
                        console.log("\uD83E\uDD16 [STORAGE] IA desativada para conversa ".concat(conversationId, " (follow-up permanece no estado atual)"));
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.enableAgentForConversation = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // 1. Remover da tabela de pausas temporárias
                    return [4 /*yield*/, db_1.db
                            .delete(schema_1.agentDisabledConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentDisabledConversations.conversationId, conversationId))];
                    case 1:
                        // 1. Remover da tabela de pausas temporárias
                        _a.sent();
                        // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
                        // A reativação da IA NÃO deve afetar o follow-up
                        // Follow-up só deve ser controlado quando:
                        // 1. Toggle global em /followup (followup_configs.is_enabled)
                        // 2. Toggle individual na conversa (conversations.followupActive)
                        // A IA e o Follow-up são sistemas separados e independentes!
                        console.log("\u2705 [STORAGE] IA reativada para conversa ".concat(conversationId, " (follow-up permanece no estado atual)"));
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateDisabledConversationOwnerReply = function (conversationId, autoReactivateAfterMinutes) {
        return __awaiter(this, void 0, void 0, function () {
            var updateData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        updateData = {
                            ownerLastReplyAt: new Date(),
                            clientHasPendingMessage: false, // Reset when owner replies again
                        };
                        if (autoReactivateAfterMinutes !== undefined) {
                            updateData.autoReactivateAfterMinutes = autoReactivateAfterMinutes;
                        }
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.agentDisabledConversations)
                                .set(updateData)
                                .where((0, drizzle_orm_1.eq)(schema_1.agentDisabledConversations.conversationId, conversationId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.markClientPendingMessage = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.agentDisabledConversations)
                            .set({
                            clientHasPendingMessage: true,
                            clientLastMessageAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.agentDisabledConversations.conversationId, conversationId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getConversationsToAutoReactivate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pool, result, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 1:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("\n        SELECT \n          conversation_id as \"conversationId\",\n          client_last_message_at as \"clientLastMessageAt\",\n          client_has_pending_message as \"clientHasPendingMessage\"\n        FROM agent_disabled_conversations\n        WHERE \n          owner_last_reply_at IS NOT NULL\n          AND auto_reactivate_after_minutes IS NOT NULL\n          AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()\n        LIMIT 10\n      ")];
                    case 2:
                        result = _a.sent();
                        return [2 /*return*/, result.rows.map(function (r) { return ({
                                conversationId: r.conversationId,
                                clientLastMessageAt: r.clientLastMessageAt ? new Date(r.clientLastMessageAt) : null,
                                clientHasPendingMessage: r.clientHasPendingMessage === true,
                            }); })];
                    case 3:
                        error_5 = _a.sent();
                        console.error("\u274C [STORAGE] Erro em getConversationsToAutoReactivate:", error_5);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🔥 OTIMIZAÇÃO: Verifica rapidamente se há conversas para reativar
     * Usa EXISTS que é muito mais leve que SELECT * para verificação
     * 🐛 FIX CRÍTICO: NÃO usar COALESCE! Quando auto_reactivate_after_minutes é NULL,
     * significa "NUNCA reativar automaticamente" - essas conversas NÃO devem ser consideradas!
     */
    DatabaseStorage.prototype.hasConversationsToAutoReactivate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pool, result, error_6;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 1:
                        pool = (_b.sent()).pool;
                        return [4 /*yield*/, pool.query("\n        SELECT EXISTS (\n          SELECT 1 FROM agent_disabled_conversations\n          WHERE \n            owner_last_reply_at IS NOT NULL\n            AND auto_reactivate_after_minutes IS NOT NULL\n            AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()\n          LIMIT 1\n        ) as has_pending\n      ")];
                    case 2:
                        result = _b.sent();
                        return [2 /*return*/, ((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.has_pending) === true];
                    case 3:
                        error_6 = _b.sent();
                        console.error("\u274C [STORAGE] Erro em hasConversationsToAutoReactivate:", error_6);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🔥 OTIMIZAÇÃO: Conta conversas com timers ativos (para ajuste dinâmico de intervalo)
     * 🐛 FIX: Contar APENAS conversas que têm auto_reactivate_after_minutes configurado
     * Conversas com NULL não devem ser contadas pois nunca serão reativadas automaticamente
     */
    DatabaseStorage.prototype.countActiveAutoReactivateTimers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var pool, result, error_7;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 1:
                        pool = (_b.sent()).pool;
                        return [4 /*yield*/, pool.query("\n        SELECT COUNT(*) as count \n        FROM agent_disabled_conversations\n        WHERE auto_reactivate_after_minutes IS NOT NULL\n      ")];
                    case 2:
                        result = _b.sent();
                        return [2 /*return*/, parseInt(((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || '0', 10)];
                    case 3:
                        error_7 = _b.sent();
                        console.error("\u274C [STORAGE] Erro em countActiveAutoReactivateTimers:", error_7);
                        return [2 /*return*/, 0];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getDisabledConversationDetails = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            ownerLastReplyAt: schema_1.agentDisabledConversations.ownerLastReplyAt,
                            autoReactivateAfterMinutes: schema_1.agentDisabledConversations.autoReactivateAfterMinutes,
                            clientHasPendingMessage: schema_1.agentDisabledConversations.clientHasPendingMessage,
                        })
                            .from(schema_1.agentDisabledConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentDisabledConversations.conversationId, conversationId))];
                    case 1:
                        result = (_b.sent())[0];
                        if (!result)
                            return [2 /*return*/, null];
                        return [2 /*return*/, {
                                ownerLastReplyAt: result.ownerLastReplyAt,
                                autoReactivateAfterMinutes: result.autoReactivateAfterMinutes,
                                clientHasPendingMessage: (_a = result.clientHasPendingMessage) !== null && _a !== void 0 ? _a : false,
                            }];
                }
            });
        });
    };
    // Plan operations
    DatabaseStorage.prototype.getAllPlans = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return db_1.db.select().from(schema_1.plans).orderBy(schema_1.plans.ordem); })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getActivePlans = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.plans)
                            .where((0, drizzle_orm_1.eq)(schema_1.plans.ativo, true))
                            .orderBy(schema_1.plans.ordem)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPlan = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var plan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.id, id))];
                    case 1:
                        plan = (_a.sent())[0];
                        return [2 /*return*/, plan];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPlanBySlug = function (slug) {
        return __awaiter(this, void 0, void 0, function () {
            var plan, error_8, pool, result, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.linkSlug, slug))];
                    case 1:
                        plan = (_a.sent())[0];
                        return [2 /*return*/, plan];
                    case 2:
                        error_8 = _a.sent();
                        console.error("Error in getPlanBySlug:", error_8);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("SELECT * FROM plans WHERE link_slug = $1", [slug])];
                    case 4:
                        result = _a.sent();
                        if (result.rows.length === 0)
                            return [2 /*return*/, undefined];
                        row = result.rows[0];
                        return [2 /*return*/, {
                                id: row.id,
                                nome: row.nome,
                                valor: row.valor,
                                tipo: row.tipo,
                                features: row.features,
                                ativo: row.ativo,
                                ordem: row.ordem,
                                codigoPersonalizado: row.codigo_personalizado,
                                valorPrimeiraCobranca: row.valor_primeira_cobranca,
                                linkSlug: row.link_slug,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createPlan = function (planData) {
        return __awaiter(this, void 0, void 0, function () {
            var plan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.plans).values(planData).returning()];
                    case 1:
                        plan = (_a.sent())[0];
                        return [2 /*return*/, plan];
                }
            });
        });
    };
    DatabaseStorage.prototype.updatePlan = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var plan;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.plans)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.plans.id, id))
                            .returning()];
                    case 1:
                        plan = (_a.sent())[0];
                        return [2 /*return*/, plan];
                }
            });
        });
    };
    DatabaseStorage.prototype.deletePlan = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.id, id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // Coupon operations
    DatabaseStorage.prototype.getCouponByCode = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var coupon, error_9, pool, result, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db.select().from(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.code, code.toUpperCase()))];
                    case 1:
                        coupon = (_a.sent())[0];
                        return [2 /*return*/, coupon];
                    case 2:
                        error_9 = _a.sent();
                        console.error("Error in getCouponByCode with Drizzle, trying raw query:", error_9);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("SELECT * FROM coupons WHERE UPPER(code) = $1", [code.toUpperCase()])];
                    case 4:
                        result = _a.sent();
                        if (result.rows.length === 0)
                            return [2 /*return*/, undefined];
                        row = result.rows[0];
                        return [2 /*return*/, {
                                id: row.id,
                                code: row.code,
                                discountType: row.discount_type,
                                discountValue: row.discount_value,
                                finalPrice: row.final_price,
                                isActive: row.is_active,
                                maxUses: row.max_uses,
                                currentUses: row.current_uses,
                                applicablePlans: row.applicable_plans,
                                validFrom: row.valid_from,
                                validUntil: row.valid_until,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAllCoupons = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_10, pool, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db.select().from(schema_1.coupons).orderBy((0, drizzle_orm_1.desc)(schema_1.coupons.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_10 = _a.sent();
                        console.error("Error in getAllCoupons with Drizzle, trying raw query:", error_10);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("SELECT * FROM coupons ORDER BY created_at DESC")];
                    case 4:
                        result = _a.sent();
                        return [2 /*return*/, result.rows.map(function (row) { return ({
                                id: row.id,
                                code: row.code,
                                discountType: row.discount_type,
                                discountValue: row.discount_value,
                                finalPrice: row.final_price,
                                isActive: row.is_active,
                                maxUses: row.max_uses,
                                currentUses: row.current_uses,
                                applicablePlans: row.applicable_plans,
                                validFrom: row.valid_from,
                                validUntil: row.valid_until,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at
                            }); })];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createCoupon = function (couponData) {
        return __awaiter(this, void 0, void 0, function () {
            var coupon, error_11, pool, result, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db.insert(schema_1.coupons).values(__assign(__assign({}, couponData), { code: couponData.code.toUpperCase() })).returning()];
                    case 1:
                        coupon = (_a.sent())[0];
                        return [2 /*return*/, coupon];
                    case 2:
                        error_11 = _a.sent();
                        console.error("Error in createCoupon with Drizzle, trying raw query:", error_11);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("\n        INSERT INTO coupons (code, discount_type, discount_value, final_price, is_active, max_uses, current_uses, applicable_plans, valid_until)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)\n        RETURNING *\n      ", [
                                couponData.code.toUpperCase(),
                                couponData.discountType || 'fixed_price',
                                couponData.discountValue || '0',
                                couponData.finalPrice,
                                couponData.isActive !== false,
                                couponData.maxUses || null,
                                couponData.currentUses || 0,
                                couponData.applicablePlans ? JSON.stringify(couponData.applicablePlans) : null,
                                couponData.validUntil || null
                            ])];
                    case 4:
                        result = _a.sent();
                        row = result.rows[0];
                        return [2 /*return*/, {
                                id: row.id,
                                code: row.code,
                                discountType: row.discount_type,
                                discountValue: row.discount_value,
                                finalPrice: row.final_price,
                                isActive: row.is_active,
                                maxUses: row.max_uses,
                                currentUses: row.current_uses,
                                applicablePlans: row.applicable_plans,
                                validFrom: row.valid_from,
                                validUntil: row.valid_until,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateCoupon = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var updateData, coupon, error_12, pool, setClauses, values, paramIndex, result, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        updateData = __assign(__assign({}, data), { updatedAt: new Date() });
                        if (data.code) {
                            updateData.code = data.code.toUpperCase();
                        }
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.coupons)
                                .set(updateData)
                                .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id))
                                .returning()];
                    case 1:
                        coupon = (_a.sent())[0];
                        return [2 /*return*/, coupon];
                    case 2:
                        error_12 = _a.sent();
                        console.error("Error in updateCoupon with Drizzle, trying raw query:", error_12);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        setClauses = [];
                        values = [];
                        paramIndex = 1;
                        if (data.code !== undefined) {
                            setClauses.push("code = $".concat(paramIndex++));
                            values.push(data.code.toUpperCase());
                        }
                        if (data.finalPrice !== undefined) {
                            setClauses.push("final_price = $".concat(paramIndex++));
                            values.push(data.finalPrice);
                        }
                        if (data.isActive !== undefined) {
                            setClauses.push("is_active = $".concat(paramIndex++));
                            values.push(data.isActive);
                        }
                        if (data.maxUses !== undefined) {
                            setClauses.push("max_uses = $".concat(paramIndex++));
                            values.push(data.maxUses);
                        }
                        if (data.validUntil !== undefined) {
                            setClauses.push("valid_until = $".concat(paramIndex++));
                            values.push(data.validUntil);
                        }
                        if (data.applicablePlans !== undefined) {
                            setClauses.push("applicable_plans = $".concat(paramIndex++));
                            values.push(data.applicablePlans ? JSON.stringify(data.applicablePlans) : null);
                        }
                        setClauses.push("updated_at = $".concat(paramIndex++));
                        values.push(new Date());
                        values.push(id);
                        return [4 /*yield*/, pool.query("\n        UPDATE coupons SET ".concat(setClauses.join(', '), " WHERE id = $").concat(paramIndex, "\n        RETURNING *\n      "), values)];
                    case 4:
                        result = _a.sent();
                        row = result.rows[0];
                        return [2 /*return*/, {
                                id: row.id,
                                code: row.code,
                                discountType: row.discount_type,
                                discountValue: row.discount_value,
                                finalPrice: row.final_price,
                                isActive: row.is_active,
                                maxUses: row.max_uses,
                                currentUses: row.current_uses,
                                applicablePlans: row.applicable_plans,
                                validFrom: row.valid_from,
                                validUntil: row.valid_until,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteCoupon = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var error_13, pool;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db.delete(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 2:
                        error_13 = _a.sent();
                        console.error("Error in deleteCoupon with Drizzle, trying raw query:", error_13);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("DELETE FROM coupons WHERE id = $1", [id])];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.incrementCouponUsage = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var error_14, pool;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 5]);
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.coupons)
                                .set({ currentUses: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.coupons.currentUses), updatedAt: new Date() })
                                .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 2:
                        error_14 = _a.sent();
                        console.error("Error in incrementCouponUsage with Drizzle, trying raw query:", error_14);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                    case 3:
                        pool = (_a.sent()).pool;
                        return [4 /*yield*/, pool.query("UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1", [id])];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // Subscription operations
    DatabaseStorage.prototype.getSubscription = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.subscriptions)
                            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.subscriptions.planId, schema_1.plans.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.id, id))
                            .limit(1)];
                    case 1:
                        result = _a.sent();
                        if (result.length === 0)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, __assign(__assign({}, result[0].subscriptions), { plan: result[0].plans })];
                }
            });
        });
    };
    DatabaseStorage.prototype.getUserSubscription = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var activeResult, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.subscriptions)
                            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.subscriptions.planId, schema_1.plans.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, userId), (0, drizzle_orm_1.eq)(schema_1.subscriptions.status, "active")))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.subscriptions.createdAt))
                            .limit(1)];
                    case 1:
                        activeResult = _a.sent();
                        if (activeResult.length > 0) {
                            return [2 /*return*/, __assign(__assign({}, activeResult[0].subscriptions), { plan: activeResult[0].plans })];
                        }
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.subscriptions)
                                .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.subscriptions.planId, schema_1.plans.id))
                                .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, userId))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.subscriptions.createdAt))
                                .limit(1)];
                    case 2:
                        result = _a.sent();
                        if (result.length === 0)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, __assign(__assign({}, result[0].subscriptions), { plan: result[0].plans })];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAllSubscriptions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () {
                            return db_1.db
                                .select()
                                .from(schema_1.subscriptions)
                                .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.subscriptions.planId, schema_1.plans.id))
                                .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, schema_1.users.id))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.subscriptions.createdAt));
                        })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.map(function (row) { return (__assign(__assign({}, row.subscriptions), { plan: row.plans, user: row.users })); })];
                }
            });
        });
    };
    DatabaseStorage.prototype.createSubscription = function (subscriptionData) {
        return __awaiter(this, void 0, void 0, function () {
            var subscription;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.subscriptions)
                            .values(subscriptionData)
                            .returning()];
                    case 1:
                        subscription = (_a.sent())[0];
                        return [2 /*return*/, subscription];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateSubscription = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var subscription;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.subscriptions)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.id, id))
                            .returning()];
                    case 1:
                        subscription = (_a.sent())[0];
                        return [2 /*return*/, subscription];
                }
            });
        });
    };
    // Payment operations
    DatabaseStorage.prototype.getPayment = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.payments).where((0, drizzle_orm_1.eq)(schema_1.payments.id, id))];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPaymentBySubscriptionId = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.payments)
                            .where((0, drizzle_orm_1.eq)(schema_1.payments.subscriptionId, subscriptionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt))
                            .limit(1)];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPendingPayments = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.payments)
                            .innerJoin(schema_1.subscriptions, (0, drizzle_orm_1.eq)(schema_1.payments.subscriptionId, schema_1.subscriptions.id))
                            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.subscriptions.planId, schema_1.plans.id))
                            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, schema_1.users.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.payments.status, "pending"))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.payments.createdAt))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.map(function (row) { return (__assign(__assign({}, row.payments), { subscription: __assign(__assign({}, row.subscriptions), { user: row.users, plan: row.plans }) })); })];
                }
            });
        });
    };
    DatabaseStorage.prototype.createPayment = function (paymentData) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.payments).values(paymentData).returning()];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.updatePayment = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.payments)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.payments.id, id))
                            .returning()];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    // Payment History operations (MercadoPago, etc)
    DatabaseStorage.prototype.createPaymentHistory = function (paymentData) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.paymentHistory).values(paymentData).returning()];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPaymentHistory = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.paymentHistory).where((0, drizzle_orm_1.eq)(schema_1.paymentHistory.id, id))];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPaymentHistoryByMpPaymentId = function (mpPaymentId) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.paymentHistory).where((0, drizzle_orm_1.eq)(schema_1.paymentHistory.mpPaymentId, mpPaymentId))];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPaymentHistoryBySubscription = function (subscriptionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.paymentHistory)
                            .where((0, drizzle_orm_1.eq)(schema_1.paymentHistory.subscriptionId, subscriptionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentHistory.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPaymentHistoryByUser = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.paymentHistory)
                            .where((0, drizzle_orm_1.eq)(schema_1.paymentHistory.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentHistory.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAllPaymentHistory = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.paymentHistory)
                            .leftJoin(schema_1.subscriptions, (0, drizzle_orm_1.eq)(schema_1.paymentHistory.subscriptionId, schema_1.subscriptions.id))
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.paymentHistory.userId, schema_1.users.id))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentHistory.createdAt))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.map(function (row) { return (__assign(__assign({}, row.payment_history), { subscription: row.subscriptions || undefined, user: row.users || undefined })); })];
                }
            });
        });
    };
    DatabaseStorage.prototype.updatePaymentHistory = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var payment;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.paymentHistory)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.paymentHistory.id, id))
                            .returning()];
                    case 1:
                        payment = (_a.sent())[0];
                        return [2 /*return*/, payment];
                }
            });
        });
    };
    // System config operations
    DatabaseStorage.prototype.getSystemConfig = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, key))];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    DatabaseStorage.prototype.getSystemConfigs = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            var configs, result, _i, configs_1, config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.inArray)(schema_1.systemConfig.chave, keys))];
                    case 1:
                        configs = _a.sent();
                        result = new Map();
                        for (_i = 0, configs_1 = configs; _i < configs_1.length; _i++) {
                            config = configs_1[_i];
                            if (config.valor !== null) {
                                result.set(config.chave, config.valor);
                            }
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateSystemConfig = function (key, value) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.systemConfig)
                            .values({ chave: key, valor: value })
                            .onConflictDoUpdate({
                            target: schema_1.systemConfig.chave,
                            set: { valor: value, updatedAt: new Date() },
                        })
                            .returning()];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    // Admin operations
    DatabaseStorage.prototype.getAdminByEmail = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var admin;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.admins)
                            .where((0, drizzle_orm_1.eq)(schema_1.admins.email, email))];
                    case 1:
                        admin = (_a.sent())[0];
                        return [2 /*return*/, admin];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAllAdmins = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return db_1.db.select().from(schema_1.admins); })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    // Admin WhatsApp connection operations
    DatabaseStorage.prototype.getAdminWhatsappConnection = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminWhatsappConnection)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminWhatsappConnection.adminId, adminId))];
                    case 1:
                        connection = (_a.sent())[0];
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminWhatsappConnection = function (connection) {
        return __awaiter(this, void 0, void 0, function () {
            var created;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.adminWhatsappConnection)
                            .values(connection)
                            .returning()];
                    case 1:
                        created = (_a.sent())[0];
                        return [2 /*return*/, created];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminWhatsappConnection = function (adminId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var updated;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.adminWhatsappConnection)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.adminWhatsappConnection.adminId, adminId))
                            .returning()];
                    case 1:
                        updated = (_a.sent())[0];
                        return [2 /*return*/, updated];
                }
            });
        });
    };
    // Admin stats
    DatabaseStorage.prototype.getAllUsers = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, db_1.withRetry)(function () { return db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)); })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getTotalRevenue = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({ total: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["COALESCE(SUM(CAST(", " AS NUMERIC)), 0)"], ["COALESCE(SUM(CAST(", " AS NUMERIC)), 0)"])), schema_1.payments.valor) })
                            .from(schema_1.payments)
                            .where((0, drizzle_orm_1.eq)(schema_1.payments.status, "paid"))];
                    case 1:
                        result = _b.sent();
                        return [2 /*return*/, Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total) || 0)];
                }
            });
        });
    };
    // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
    DatabaseStorage.prototype.getActiveSubscriptionsCount = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))) })
                            .from(schema_1.subscriptions)
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.status, "active"))];
                    case 1:
                        result = _b.sent();
                        return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
                }
            });
        });
    };
    // ======================================================================
    // WhatsApp Contacts Operations (FIX LID 2025)
    // Persistent storage for @lid → phoneNumber mappings
    // ======================================================================
    /**
     * Upsert (Insert or Update) a WhatsApp contact
     * Uses ON CONFLICT to avoid duplicates and update existing records
     */
    DatabaseStorage.prototype.upsertContact = function (contact) {
        return __awaiter(this, void 0, void 0, function () {
            var upserted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.whatsappContacts)
                            .values(__assign(__assign({}, contact), { lastSyncedAt: new Date(), updatedAt: new Date() }))
                            .onConflictDoUpdate({
                            target: [schema_1.whatsappContacts.connectionId, schema_1.whatsappContacts.contactId],
                            set: {
                                lid: contact.lid,
                                phoneNumber: contact.phoneNumber,
                                name: contact.name,
                                imgUrl: contact.imgUrl,
                                lastSyncedAt: new Date(),
                                updatedAt: new Date(),
                            },
                        })
                            .returning()];
                    case 1:
                        upserted = (_a.sent())[0];
                        console.log("[DB] Upserted contact: ".concat(contact.contactId).concat(contact.phoneNumber ? " (phoneNumber: ".concat(contact.phoneNumber, ")") : ""));
                        return [2 /*return*/, upserted];
                }
            });
        });
    };
    /**
     * Batch upsert multiple contacts at once (more efficient than individual inserts)
     * Used during initial sync when Baileys emits many contacts.upsert events
     */
    DatabaseStorage.prototype.batchUpsertContacts = function (contacts) {
        return __awaiter(this, void 0, void 0, function () {
            var now, contactsWithTimestamps, CHUNK_SIZE, i, chunk;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (contacts.length === 0)
                            return [2 /*return*/];
                        now = new Date();
                        contactsWithTimestamps = contacts.map(function (c) { return (__assign(__assign({}, c), { lastSyncedAt: now, updatedAt: now })); });
                        CHUNK_SIZE = 200;
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < contactsWithTimestamps.length)) return [3 /*break*/, 4];
                        chunk = contactsWithTimestamps.slice(i, i + CHUNK_SIZE);
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.whatsappContacts)
                                .values(chunk)
                                .onConflictDoUpdate({
                                target: [schema_1.whatsappContacts.connectionId, schema_1.whatsappContacts.contactId],
                                set: {
                                    lid: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["EXCLUDED.lid"], ["EXCLUDED.lid"]))),
                                    phoneNumber: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["EXCLUDED.phone_number"], ["EXCLUDED.phone_number"]))),
                                    name: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["EXCLUDED.name"], ["EXCLUDED.name"]))),
                                    imgUrl: (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["EXCLUDED.img_url"], ["EXCLUDED.img_url"]))),
                                    lastSyncedAt: now,
                                    updatedAt: now,
                                },
                            })];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i += CHUNK_SIZE;
                        return [3 /*break*/, 1];
                    case 4:
                        console.log("[DB] Batch upserted ".concat(contacts.length, " contacts"));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get contact by LID (primary use case for @lid resolution)
     * Query: SELECT * FROM whatsapp_contacts WHERE lid = ? AND connection_id = ?
     */
    DatabaseStorage.prototype.getContactByLid = function (lid, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var contact;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.lid, lid), (0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId)))
                            .limit(1)];
                    case 1:
                        contact = (_a.sent())[0];
                        if (contact) {
                            console.log("[DB] Contact found by LID: ".concat(lid, " \u2192 ").concat(contact.phoneNumber || "no phone"));
                        }
                        return [2 /*return*/, contact];
                }
            });
        });
    };
    /**
     * Get contact by contactId (general lookup)
     * Query: SELECT * FROM whatsapp_contacts WHERE contact_id = ? AND connection_id = ?
     */
    DatabaseStorage.prototype.getContactById = function (contactId, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var contact;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId)))
                            .limit(1)];
                    case 1:
                        contact = (_a.sent())[0];
                        return [2 /*return*/, contact];
                }
            });
        });
    };
    /**
     * Get all contacts for a specific connection (cache warming)
     * Used when restoring session to pre-populate in-memory cache
     */
    DatabaseStorage.prototype.getContactsByConnectionId = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var contacts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappContacts.lastSyncedAt))];
                    case 1:
                        contacts = _a.sent();
                        console.log("[DB] Loaded ".concat(contacts.length, " contacts for connection ").concat(connectionId));
                        return [2 /*return*/, contacts];
                }
            });
        });
    };
    /**
     * Delete contacts from inactive connections (data retention policy)
     * Should be run periodically (e.g., daily cron job)
     * Query: DELETE FROM whatsapp_contacts WHERE connection_id IN (...)
     */
    DatabaseStorage.prototype.deleteOldContacts = function () {
        return __awaiter(this, arguments, void 0, function (daysOld) {
            var cutoffDate, inactiveConnections, connectionIds, deleted;
            if (daysOld === void 0) { daysOld = 90; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cutoffDate = new Date();
                        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
                        return [4 /*yield*/, db_1.db
                                .select({ id: schema_1.whatsappConnections.id })
                                .from(schema_1.whatsappConnections)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, false), (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.whatsappConnections.updatedAt, cutoffDate)))];
                    case 1:
                        inactiveConnections = _a.sent();
                        if (inactiveConnections.length === 0) {
                            console.log("[DB] No inactive connections older than ".concat(daysOld, " days"));
                            return [2 /*return*/, 0];
                        }
                        connectionIds = inactiveConnections.map(function (c) { return c.id; });
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.whatsappContacts)
                                .where((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["", " = ANY(", ")"], ["", " = ANY(", ")"])), schema_1.whatsappContacts.connectionId, connectionIds))];
                    case 2:
                        deleted = _a.sent();
                        console.log("[DB] Deleted contacts from ".concat(connectionIds.length, " inactive connections (").concat(daysOld, "+ days old)"));
                        return [2 /*return*/, deleted.rowCount || 0];
                }
            });
        });
    };
    // ==================== CAMPAIGN OPERATIONS (In-Memory) ====================
    DatabaseStorage.prototype.getCampaigns = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, campaignsStore.get(userId) || []];
            });
        });
    };
    DatabaseStorage.prototype.getCampaign = function (userId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var campaigns;
            return __generator(this, function (_a) {
                campaigns = campaignsStore.get(userId) || [];
                return [2 /*return*/, campaigns.find(function (c) { return c.id === id; })];
            });
        });
    };
    DatabaseStorage.prototype.createCampaign = function (campaign) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, campaigns, newCampaign;
            return __generator(this, function (_a) {
                userId = campaign.userId;
                campaigns = campaignsStore.get(userId) || [];
                newCampaign = __assign(__assign({}, campaign), { id: campaign.id || "campaign_".concat(Date.now()), createdAt: new Date(), updatedAt: new Date() });
                campaigns.push(newCampaign);
                campaignsStore.set(userId, campaigns);
                return [2 /*return*/, newCampaign];
            });
        });
    };
    DatabaseStorage.prototype.updateCampaign = function (userId, id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var campaigns, index;
            return __generator(this, function (_a) {
                campaigns = campaignsStore.get(userId) || [];
                index = campaigns.findIndex(function (c) { return c.id === id; });
                if (index !== -1) {
                    campaigns[index] = __assign(__assign(__assign({}, campaigns[index]), data), { updatedAt: new Date() });
                    campaignsStore.set(userId, campaigns);
                    return [2 /*return*/, campaigns[index]];
                }
                return [2 /*return*/, null];
            });
        });
    };
    DatabaseStorage.prototype.deleteCampaign = function (userId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var campaigns, filtered;
            return __generator(this, function (_a) {
                campaigns = campaignsStore.get(userId) || [];
                filtered = campaigns.filter(function (c) { return c.id !== id; });
                campaignsStore.set(userId, filtered);
                return [2 /*return*/];
            });
        });
    };
    // ==================== CONTACT LIST OPERATIONS (Supabase/PostgreSQL) ====================
    DatabaseStorage.prototype.getContactLists = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.contactLists)
                                .where((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.contactLists.createdAt))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_15 = _a.sent();
                        console.error("[CONTACT_LISTS] Error fetching lists:", error_15);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getContactList = function (userId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.contactLists)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId), (0, drizzle_orm_1.eq)(schema_1.contactLists.id, id)))
                                .limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                    case 2:
                        error_16 = _a.sent();
                        console.error("[CONTACT_LISTS] Error fetching list:", error_16);
                        return [2 /*return*/, undefined];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createContactList = function (list) {
        return __awaiter(this, void 0, void 0, function () {
            var contactsArray, result, error_17;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        contactsArray = list.contacts || [];
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.contactLists)
                                .values({
                                userId: list.userId,
                                name: list.name,
                                description: list.description || null,
                                contacts: contactsArray,
                                contactCount: contactsArray.length,
                            })
                                .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                    case 2:
                        error_17 = _a.sent();
                        console.error("[CONTACT_LISTS] Error creating list:", error_17);
                        throw error_17;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateContactList = function (userId, id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var updateData, result, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        updateData = {
                            updatedAt: new Date(),
                        };
                        if (data.name !== undefined)
                            updateData.name = data.name;
                        if (data.description !== undefined)
                            updateData.description = data.description;
                        if (data.contacts !== undefined) {
                            updateData.contacts = data.contacts;
                            updateData.contactCount = data.contacts.length;
                        }
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.contactLists)
                                .set(updateData)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId), (0, drizzle_orm_1.eq)(schema_1.contactLists.id, id)))
                                .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                    case 2:
                        error_18 = _a.sent();
                        console.error("[CONTACT_LISTS] Error updating list:", error_18);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteContactList = function (userId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var error_19;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.contactLists)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId), (0, drizzle_orm_1.eq)(schema_1.contactLists.id, id)))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_19 = _a.sent();
                        console.error("[CONTACT_LISTS] Error deleting list:", error_19);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.addContactsToList = function (userId, listId, contacts) {
        return __awaiter(this, void 0, void 0, function () {
            var list, existingContacts, existingPhones_1, newContacts, mergedContacts, result, error_20;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.contactLists)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId), (0, drizzle_orm_1.eq)(schema_1.contactLists.id, listId)))
                                .limit(1)];
                    case 1:
                        list = (_a.sent())[0];
                        if (!list) {
                            return [2 /*return*/, { success: false, message: "Lista não encontrada" }];
                        }
                        existingContacts = list.contacts || [];
                        existingPhones_1 = new Set(existingContacts.map(function (c) { return c.phone; }));
                        newContacts = contacts.filter(function (c) { return !existingPhones_1.has(c.phone); });
                        mergedContacts = __spreadArray(__spreadArray([], existingContacts, true), newContacts, true);
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.contactLists)
                                .set({
                                contacts: mergedContacts,
                                contactCount: mergedContacts.length,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.contactLists.id, listId))
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, {
                                success: true,
                                totalContacts: mergedContacts.length,
                                addedCount: newContacts.length
                            }];
                    case 3:
                        error_20 = _a.sent();
                        console.error("[CONTACT_LISTS] Error adding contacts:", error_20);
                        return [2 /*return*/, { success: false }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.removeContactFromList = function (userId, listId, phone) {
        return __awaiter(this, void 0, void 0, function () {
            var list, existingContacts, filteredContacts, result, error_21;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.contactLists)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactLists.userId, userId), (0, drizzle_orm_1.eq)(schema_1.contactLists.id, listId)))
                                .limit(1)];
                    case 1:
                        list = (_a.sent())[0];
                        if (!list) {
                            return [2 /*return*/, { success: false, message: "Lista não encontrada" }];
                        }
                        existingContacts = list.contacts || [];
                        filteredContacts = existingContacts.filter(function (c) { return c.phone !== phone; });
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.contactLists)
                                .set({
                                contacts: filteredContacts,
                                contactCount: filteredContacts.length,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.contactLists.id, listId))
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, { success: true, totalContacts: filteredContacts.length }];
                    case 3:
                        error_21 = _a.sent();
                        console.error("[CONTACT_LISTS] Error removing contact:", error_21);
                        return [2 /*return*/, { success: false }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getSyncedContacts = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, syncedContactsStore.get(userId) || []];
            });
        });
    };
    DatabaseStorage.prototype.saveSyncedContacts = function (userId, contacts) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, merged, _loop_1, _i, contacts_1, contact;
            return __generator(this, function (_a) {
                existing = syncedContactsStore.get(userId) || [];
                merged = __spreadArray([], existing, true);
                _loop_1 = function (contact) {
                    var existingIndex = merged.findIndex(function (c) { return c.phone === contact.phone; });
                    if (existingIndex === -1) {
                        merged.push(contact);
                    }
                    else {
                        merged[existingIndex] = __assign(__assign({}, merged[existingIndex]), contact);
                    }
                };
                for (_i = 0, contacts_1 = contacts; _i < contacts_1.length; _i++) {
                    contact = contacts_1[_i];
                    _loop_1(contact);
                }
                syncedContactsStore.set(userId, merged);
                return [2 /*return*/];
            });
        });
    };
    DatabaseStorage.prototype.getUserActiveConnection = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId), (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappConnections.createdAt))
                            .limit(1)];
                    case 1:
                        connection = (_a.sent())[0];
                        return [2 /*return*/, connection];
                }
            });
        });
    };
    // ========================================================================
    // ADMIN CONVERSATIONS - Conversas do WhatsApp do admin com clientes
    // ========================================================================
    DatabaseStorage.prototype.ensureAdminSetupTables = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!ensureAdminSetupTablesPromise) {
                            ensureAdminSetupTablesPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["\n          CREATE TABLE IF NOT EXISTS admin_setup_requests (\n            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),\n            conversation_id varchar NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,\n            admin_id varchar NOT NULL REFERENCES admins(id) ON DELETE CASCADE,\n            status varchar(50) NOT NULL DEFAULT 'open',\n            request_mode varchar(50) NOT NULL DEFAULT 'assisted_setup',\n            analysis_status varchar(50) NOT NULL DEFAULT 'pending',\n            approval_status varchar(50) NOT NULL DEFAULT 'pending',\n            execution_status varchar(50) NOT NULL DEFAULT 'pending',\n            locked_customer_handoff boolean NOT NULL DEFAULT true,\n            linked_user_id varchar,\n            draft_user_id varchar,\n            created_test_token text,\n            created_autologin_token text,\n            created_by_ai boolean NOT NULL DEFAULT true,\n            approved_by_admin varchar,\n            approved_at timestamp,\n            completed_at timestamp,\n            last_error text,\n            conversation_facts jsonb NOT NULL DEFAULT '{}'::jsonb,\n            suggested_plan jsonb NOT NULL DEFAULT '{}'::jsonb,\n            refined_plan jsonb NOT NULL DEFAULT '{}'::jsonb,\n            execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,\n            created_at timestamp NOT NULL DEFAULT now(),\n            updated_at timestamp NOT NULL DEFAULT now()\n          )\n        "], ["\n          CREATE TABLE IF NOT EXISTS admin_setup_requests (\n            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),\n            conversation_id varchar NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,\n            admin_id varchar NOT NULL REFERENCES admins(id) ON DELETE CASCADE,\n            status varchar(50) NOT NULL DEFAULT 'open',\n            request_mode varchar(50) NOT NULL DEFAULT 'assisted_setup',\n            analysis_status varchar(50) NOT NULL DEFAULT 'pending',\n            approval_status varchar(50) NOT NULL DEFAULT 'pending',\n            execution_status varchar(50) NOT NULL DEFAULT 'pending',\n            locked_customer_handoff boolean NOT NULL DEFAULT true,\n            linked_user_id varchar,\n            draft_user_id varchar,\n            created_test_token text,\n            created_autologin_token text,\n            created_by_ai boolean NOT NULL DEFAULT true,\n            approved_by_admin varchar,\n            approved_at timestamp,\n            completed_at timestamp,\n            last_error text,\n            conversation_facts jsonb NOT NULL DEFAULT '{}'::jsonb,\n            suggested_plan jsonb NOT NULL DEFAULT '{}'::jsonb,\n            refined_plan jsonb NOT NULL DEFAULT '{}'::jsonb,\n            execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,\n            created_at timestamp NOT NULL DEFAULT now(),\n            updated_at timestamp NOT NULL DEFAULT now()\n          )\n        "]))))];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_setup_requests_conversation ON admin_setup_requests(conversation_id)"], ["CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_setup_requests_conversation ON admin_setup_requests(conversation_id)"]))))];
                                        case 2:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["CREATE INDEX IF NOT EXISTS idx_admin_setup_requests_admin ON admin_setup_requests(admin_id)"], ["CREATE INDEX IF NOT EXISTS idx_admin_setup_requests_admin ON admin_setup_requests(admin_id)"]))))];
                                        case 3:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["CREATE INDEX IF NOT EXISTS idx_admin_setup_requests_status ON admin_setup_requests(status)"], ["CREATE INDEX IF NOT EXISTS idx_admin_setup_requests_status ON admin_setup_requests(status)"]))))];
                                        case 4:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["\n          CREATE TABLE IF NOT EXISTS admin_setup_request_messages (\n            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),\n            request_id varchar NOT NULL REFERENCES admin_setup_requests(id) ON DELETE CASCADE,\n            role varchar(20) NOT NULL,\n            message_type varchar(30) NOT NULL DEFAULT 'chat',\n            content text NOT NULL,\n            plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,\n            metadata jsonb NOT NULL DEFAULT '{}'::jsonb,\n            created_by varchar,\n            created_at timestamp NOT NULL DEFAULT now()\n          )\n        "], ["\n          CREATE TABLE IF NOT EXISTS admin_setup_request_messages (\n            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),\n            request_id varchar NOT NULL REFERENCES admin_setup_requests(id) ON DELETE CASCADE,\n            role varchar(20) NOT NULL,\n            message_type varchar(30) NOT NULL DEFAULT 'chat',\n            content text NOT NULL,\n            plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,\n            metadata jsonb NOT NULL DEFAULT '{}'::jsonb,\n            created_by varchar,\n            created_at timestamp NOT NULL DEFAULT now()\n          )\n        "]))))];
                                        case 5:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["CREATE INDEX IF NOT EXISTS idx_admin_setup_request_messages_request ON admin_setup_request_messages(request_id)"], ["CREATE INDEX IF NOT EXISTS idx_admin_setup_request_messages_request ON admin_setup_request_messages(request_id)"]))))];
                                        case 6:
                                            _a.sent();
                                            return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["CREATE INDEX IF NOT EXISTS idx_admin_setup_request_messages_created ON admin_setup_request_messages(created_at)"], ["CREATE INDEX IF NOT EXISTS idx_admin_setup_request_messages_created ON admin_setup_request_messages(created_at)"]))))];
                                        case 7:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })().catch(function (error) {
                                ensureAdminSetupTablesPromise = null;
                                throw error;
                            });
                        }
                        return [4 /*yield*/, ensureAdminSetupTablesPromise];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminConversations = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.adminConversations.lastMessageTime))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminConversation = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    // Busca conversa do admin pelo número de telefone (sistema single-admin)
    DatabaseStorage.prototype.getAdminConversationByPhone = function (contactNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, contactNumber))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminConversationByContact = function (adminId, contactNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminConversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminConversations.adminId, adminId), (0, drizzle_orm_1.eq)(schema_1.adminConversations.contactNumber, contactNumber)))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminConversation = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var globalFollowupConfig, _a, result;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = adminFollowupMigrationService_1.normalizeAdminFollowupConfig;
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 1:
                        globalFollowupConfig = _a.apply(void 0, [_c.sent()]);
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.adminConversations)
                                .values({
                                adminId: data.adminId,
                                contactNumber: data.contactNumber,
                                remoteJid: data.remoteJid,
                                contactName: data.contactName,
                                contactAvatar: data.contactAvatar,
                                isAgentEnabled: (_b = data.isAgentEnabled) !== null && _b !== void 0 ? _b : true,
                                unreadCount: 0,
                                followupActive: false,
                                followupStage: 0,
                                nextFollowupAt: null,
                                followupConfig: globalFollowupConfig,
                            })
                                .returning()];
                    case 2:
                        result = (_c.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminConversation = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.adminConversations)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getOrCreateAdminConversation = function (adminId, contactNumber, remoteJid, contactName, contactAvatar) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation, updates, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.getAdminConversationByContact(adminId, contactNumber)];
                    case 1:
                        conversation = _c.sent();
                        if (!!conversation) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.createAdminConversation({
                                adminId: adminId,
                                contactNumber: contactNumber,
                                remoteJid: remoteJid,
                                contactName: contactName,
                                contactAvatar: contactAvatar,
                            })];
                    case 2:
                        conversation = _c.sent();
                        return [3 /*break*/, 7];
                    case 3:
                        if (!(contactName || contactAvatar || (0, adminFollowupMigrationService_1.isLegacyAdminFollowupConfig)(conversation.followupConfig))) return [3 /*break*/, 7];
                        updates = {};
                        if (contactName && conversation.contactName !== contactName)
                            updates.contactName = contactName;
                        if (contactAvatar && conversation.contactAvatar !== contactAvatar)
                            updates.contactAvatar = contactAvatar;
                        if (!(0, adminFollowupMigrationService_1.isLegacyAdminFollowupConfig)(conversation.followupConfig)) return [3 /*break*/, 5];
                        _a = updates;
                        _b = adminFollowupMigrationService_1.normalizeAdminFollowupConfig;
                        return [4 /*yield*/, (0, adminFollowupMigrationService_1.getAdminFollowupGlobalConfig)()];
                    case 4:
                        _a.followupConfig = _b.apply(void 0, [_c.sent()]);
                        _c.label = 5;
                    case 5:
                        if (!(Object.keys(updates).length > 0)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.updateAdminConversation(conversation.id, updates)];
                    case 6:
                        conversation = _c.sent();
                        _c.label = 7;
                    case 7: return [2 /*return*/, conversation];
                }
            });
        });
    };
    // Admin Messages
    DatabaseStorage.prototype.getAdminMessages = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminMessages)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, conversationId))
                            .orderBy(schema_1.adminMessages.timestamp)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminMessageByMessageId = function (messageId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminMessages)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminMessages.messageId, messageId))
                            .limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminSetupRequestByConversationId = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.adminSetupRequests)
                                .where((0, drizzle_orm_1.eq)(schema_1.adminSetupRequests.conversationId, conversationId))
                                .limit(1)];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminSetupRequest = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.adminSetupRequests)
                                .where((0, drizzle_orm_1.eq)(schema_1.adminSetupRequests.id, id))
                                .limit(1)];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminSetupRequest = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.adminSetupRequests)
                                .values(data)
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminSetupRequest = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.adminSetupRequests)
                                .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                                .where((0, drizzle_orm_1.eq)(schema_1.adminSetupRequests.id, id))
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.upsertAdminSetupRequestByConversation = function (conversationId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.getAdminSetupRequestByConversationId(conversationId)];
                    case 2:
                        existing = _a.sent();
                        if (!existing) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.updateAdminSetupRequest(existing.id, data)];
                    case 3: return [2 /*return*/, (_a.sent())];
                    case 4: return [2 /*return*/, this.createAdminSetupRequest(data)];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminSetupRequestMessages = function (requestId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.adminSetupRequestMessages)
                                .where((0, drizzle_orm_1.eq)(schema_1.adminSetupRequestMessages.requestId, requestId))
                                .orderBy((0, drizzle_orm_1.asc)(schema_1.adminSetupRequestMessages.createdAt))];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminSetupRequestMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureAdminSetupTables()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.adminSetupRequestMessages)
                                .values(data)
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var messageData, audioBuffer, origem, base64Part, audioResponse, arrayBuffer, fetchError_2, transcription, error_22, imageUrl, analysisPrompt, imageDescription, error_23, result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        messageData = __assign({}, data);
                        if (!(messageData.mediaType === "audio" && messageData.mediaUrl)) return [3 /*break*/, 14];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 13, , 14]);
                        audioBuffer = null;
                        origem = messageData.fromMe ? "dono" : "cliente";
                        if (!messageData.mediaUrl.startsWith("data:")) return [3 /*break*/, 2];
                        base64Part = messageData.mediaUrl.split(",")[1];
                        if (base64Part) {
                            audioBuffer = Buffer.from(base64Part, "base64");
                            console.log("\uD83C\uDFA4 [Storage Admin] \u00C1udio base64 do ".concat(origem, ": ").concat(audioBuffer.length, " bytes"));
                        }
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(messageData.mediaUrl.startsWith("http://") || messageData.mediaUrl.startsWith("https://"))) return [3 /*break*/, 9];
                        console.log("\uD83C\uDFA4 [Storage Admin] Baixando \u00E1udio do ".concat(origem, " de URL externa..."));
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 8, , 9]);
                        return [4 /*yield*/, fetch(messageData.mediaUrl)];
                    case 4:
                        audioResponse = _b.sent();
                        if (!audioResponse.ok) return [3 /*break*/, 6];
                        return [4 /*yield*/, audioResponse.arrayBuffer()];
                    case 5:
                        arrayBuffer = _b.sent();
                        audioBuffer = Buffer.from(arrayBuffer);
                        console.log("\uD83C\uDFA4 [Storage Admin] \u00C1udio do ".concat(origem, " baixado: ").concat(audioBuffer.length, " bytes"));
                        return [3 /*break*/, 7];
                    case 6:
                        console.error("\uD83C\uDFA4 [Storage Admin] Erro ao baixar \u00E1udio: HTTP ".concat(audioResponse.status));
                        _b.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        fetchError_2 = _b.sent();
                        console.error("\uD83C\uDFA4 [Storage Admin] Erro ao fazer fetch do \u00E1udio:", fetchError_2);
                        return [3 /*break*/, 9];
                    case 9:
                        if (!(audioBuffer && audioBuffer.length > 0)) return [3 /*break*/, 11];
                        console.log("\uD83C\uDFA4 [Storage Admin] Transcrevendo \u00E1udio do ".concat(origem, " (").concat(audioBuffer.length, " bytes)..."));
                        return [4 /*yield*/, (0, mistralClient_1.transcribeAudioWithMistral)(audioBuffer, {
                                fileName: "whatsapp-audio-".concat(origem, ".ogg"),
                            })];
                    case 10:
                        transcription = _b.sent();
                        if (transcription && transcription.length > 0) {
                            console.log("\uD83C\uDFA4 [Storage Admin] \u2705 Transcri\u00E7\u00E3o do ".concat(origem, ": ").concat(transcription.substring(0, 100), "..."));
                            messageData.text = transcription;
                        }
                        else {
                            console.log("\uD83C\uDFA4 [Storage Admin] \u26A0\uFE0F Transcri\u00E7\u00E3o vazia para \u00E1udio do ".concat(origem));
                        }
                        return [3 /*break*/, 12];
                    case 11:
                        console.log("\uD83C\uDFA4 [Storage Admin] \u26A0\uFE0F N\u00E3o foi poss\u00EDvel obter buffer do \u00E1udio do ".concat(origem));
                        _b.label = 12;
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_22 = _b.sent();
                        console.error("[Storage Admin] Erro ao transcrever áudio:", error_22);
                        return [3 /*break*/, 14];
                    case 14:
                        if (!(messageData.mediaType === "image" && messageData.mediaUrl)) return [3 /*break*/, 19];
                        _b.label = 15;
                    case 15:
                        _b.trys.push([15, 18, , 19]);
                        imageUrl = messageData.mediaUrl;
                        if (imageUrl.startsWith("data:")) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage Admin] Imagem base64 detectada, enviando direto para an\u00E1lise...");
                        }
                        else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage Admin] Imagem URL detectada: ".concat(imageUrl.substring(0, 80), "..."));
                        }
                        else {
                            console.log("\uD83D\uDDBC\uFE0F [Storage Admin] Formato de imagem n\u00E3o reconhecido, pulando an\u00E1lise");
                            imageUrl = "";
                        }
                        if (!imageUrl) return [3 /*break*/, 17];
                        console.log("\uD83D\uDDBC\uFE0F [Storage Admin] Iniciando an\u00E1lise de imagem com Mistral Vision...");
                        analysisPrompt = "Analise esta imagem e descreva em portugu\u00EAs de forma clara e objetiva.\n\nIMPORTANTE:\n- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transfer\u00EAncia, boleto)\n- Se for um PRODUTO: descreva caracter\u00EDsticas visuais, marca se vis\u00EDvel\n- Se for uma D\u00DAVIDA/PERGUNTA: descreva o que a pessoa parece querer saber\n- Se for DOCUMENTO: identifique o tipo e informa\u00E7\u00F5es relevantes\n\nResponda de forma concisa (m\u00E1ximo 3 frases) descrevendo o que voc\u00EA v\u00EA.";
                        return [4 /*yield*/, (0, mistralClient_1.analyzeImageWithMistral)(imageUrl, analysisPrompt)];
                    case 16:
                        imageDescription = _b.sent();
                        if (imageDescription && imageDescription.length > 0) {
                            console.log("\uD83D\uDDBC\uFE0F [Storage Admin] \u2705 An\u00E1lise de imagem bem-sucedida: \"".concat(imageDescription.substring(0, 100), "...\""));
                            messageData.text = "[IMAGEM ANALISADA: ".concat(imageDescription, "]");
                        }
                        else {
                            console.log("\uD83D\uDDBC\uFE0F [Storage Admin] \u26A0\uFE0F An\u00E1lise de imagem vazia ou nula");
                            messageData.text = messageData.text || "(imagem enviada pelo cliente)";
                        }
                        _b.label = 17;
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        error_23 = _b.sent();
                        console.error("[Storage Admin] Erro ao analisar imagem:", error_23);
                        messageData.text = messageData.text || "(imagem enviada pelo cliente)";
                        return [3 /*break*/, 19];
                    case 19: return [4 /*yield*/, db_1.db
                            .insert(schema_1.adminMessages)
                            .values({
                            conversationId: messageData.conversationId,
                            messageId: messageData.messageId,
                            fromMe: messageData.fromMe,
                            text: messageData.text,
                            timestamp: messageData.timestamp,
                            status: messageData.status,
                            isFromAgent: (_a = messageData.isFromAgent) !== null && _a !== void 0 ? _a : false,
                            mediaType: messageData.mediaType,
                            mediaUrl: messageData.mediaUrl,
                            mediaMimeType: messageData.mediaMimeType,
                            mediaCaption: messageData.mediaCaption,
                        })
                            .returning()];
                    case 20:
                        result = (_b.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminMessage = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.adminMessages)
                            .set(data)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminMessages.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.toggleAdminConversationAgent = function (conversationId, enabled, options) {
        return __awaiter(this, void 0, void 0, function () {
            var current, nextContextState, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAdminConversation(conversationId)];
                    case 1:
                        current = _a.sent();
                        nextContextState = __assign({}, ((current === null || current === void 0 ? void 0 : current.contextState) || {}));
                        if ((options === null || options === void 0 ? void 0 : options.manual) === true) {
                            nextContextState.manualAgentPause = !enabled;
                            nextContextState.manualAgentPauseUpdatedAt = new Date().toISOString();
                        }
                        else if (enabled && nextContextState.manualAgentPause !== true) {
                            delete nextContextState.manualAgentPause;
                            delete nextContextState.manualAgentPauseUpdatedAt;
                        }
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.adminConversations)
                                .set({
                                isAgentEnabled: enabled,
                                contextState: nextContextState,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.toggleAdminConversationFollowup = function (conversationId, active, options) {
        return __awaiter(this, void 0, void 0, function () {
            var current, nextContextState, shouldReactivateAgent, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAdminConversation(conversationId)];
                    case 1:
                        current = _a.sent();
                        if (!current)
                            return [2 /*return*/, undefined];
                        nextContextState = __assign({}, ((current === null || current === void 0 ? void 0 : current.contextState) || {}));
                        if ((options === null || options === void 0 ? void 0 : options.manual) === true) {
                            nextContextState.manualFollowupPause = !active;
                            nextContextState.manualFollowupPauseUpdatedAt = new Date().toISOString();
                        }
                        else if (active && !(0, adminConversationAutomationState_1.isAdminConversationFollowupManuallyPaused)(current)) {
                            delete nextContextState.manualFollowupPause;
                            delete nextContextState.manualFollowupPauseUpdatedAt;
                        }
                        shouldReactivateAgent = active &&
                            !(0, adminConversationAutomationState_1.isAdminConversationManuallyPaused)(current) &&
                            current.isAgentEnabled !== true;
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.adminConversations)
                                .set({
                                followupActive: active,
                                nextFollowupAt: null,
                                followupStage: active && (options === null || options === void 0 ? void 0 : options.resetToStageZero) !== false ? 0 : current.followupStage,
                                isAgentEnabled: shouldReactivateAgent ? true : current.isAgentEnabled,
                                contextState: nextContextState,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))
                                .returning()];
                    case 2:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.clearAdminConversationMessages = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .delete(schema_1.adminMessages)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, conversationId))];
                    case 1:
                        result = _a.sent();
                        // Resetar o estado da conversa para um novo atendimento, sem excluir a conta
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.adminConversations)
                                .set({
                                lastMessageText: null,
                                lastMessageTime: null,
                                unreadCount: 0,
                                isAgentEnabled: true,
                                followupActive: true,
                                followupStage: 0,
                                nextFollowupAt: null,
                                paymentStatus: "pending",
                                updatedAt: new Date()
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))];
                    case 2:
                        // Resetar o estado da conversa para um novo atendimento, sem excluir a conta
                        _a.sent();
                        console.log("\uD83D\uDDD1\uFE0F [STORAGE] Mensagens da conversa ".concat(conversationId, " limpas"));
                        return [2 /*return*/, result.rowCount || 0];
                }
            });
        });
    };
    DatabaseStorage.prototype.isAdminAgentEnabledForConversation = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({ isAgentEnabled: schema_1.adminConversations.isAgentEnabled })
                            .from(schema_1.adminConversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, conversationId))];
                    case 1:
                        conversation = (_b.sent())[0];
                        return [2 /*return*/, (_a = conversation === null || conversation === void 0 ? void 0 : conversation.isAgentEnabled) !== null && _a !== void 0 ? _a : true];
                }
            });
        });
    };
    // =============================================================================
    // ADMIN AGENT MEDIA - Persistência de mídias do admin agent
    // =============================================================================
    DatabaseStorage.prototype.getAllAdminMedia = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminAgentMedia)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.adminId, adminId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.adminAgentMedia.displayOrder), (0, drizzle_orm_1.desc)(schema_1.adminAgentMedia.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getActiveAdminMedia = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminAgentMedia)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.isActive, true))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.adminAgentMedia.displayOrder), (0, drizzle_orm_1.desc)(schema_1.adminAgentMedia.createdAt))];
                    case 1: 
                    // Sistema single-admin: busca de qualquer admin se não especificar
                    return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminMediaById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.adminAgentMedia)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.id, id))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminMediaByName = function (adminId, name) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedName, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        normalizedName = name.toUpperCase().replace(/\s+/g, '_');
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.adminAgentMedia)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.name, normalizedName), (0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.isActive, true)))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminMedia = function (mediaData) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.adminAgentMedia)
                            .values(__assign(__assign({}, mediaData), { name: mediaData.name.toUpperCase().replace(/\s+/g, '_') }))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminMedia = function (id, mediaData) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.adminAgentMedia)
                            .set(__assign(__assign({}, mediaData), { name: mediaData.name ? mediaData.name.toUpperCase().replace(/\s+/g, '_') : undefined, updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteAdminMedia = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .delete(schema_1.adminAgentMedia)
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.id, id))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rowCount > 0];
                }
            });
        });
    };
    DatabaseStorage.prototype.toggleAdminMediaActive = function (id, isActive) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.adminAgentMedia)
                            .set({ isActive: isActive, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.adminAgentMedia.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    // =============================================================================
    // MEDIA FLOWS - Sequencia de midias por agente
    // =============================================================================
    DatabaseStorage.prototype.getMediaFlows = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.mediaFlows)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.mediaFlows.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.getMediaFlow = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.mediaFlows)
                            .where((0, drizzle_orm_1.eq)(schema_1.mediaFlows.id, id))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.createMediaFlow = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.mediaFlows)
                            .values(data)
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateMediaFlow = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.mediaFlows)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.mediaFlows.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteMediaFlow = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.mediaFlows).where((0, drizzle_orm_1.eq)(schema_1.mediaFlows.id, id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getMediaFlowItems = function (flowId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.mediaFlowItems)
                            .where((0, drizzle_orm_1.eq)(schema_1.mediaFlowItems.flowId, flowId))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.mediaFlowItems.displayOrder), (0, drizzle_orm_1.asc)(schema_1.mediaFlowItems.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DatabaseStorage.prototype.createMediaFlowItem = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.mediaFlowItems)
                            .values(data)
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateMediaFlowItem = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.mediaFlowItems)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.mediaFlowItems.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteMediaFlowItem = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.mediaFlowItems).where((0, drizzle_orm_1.eq)(schema_1.mediaFlowItems.id, id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.reorderMediaFlowItems = function (flowId, orderedIds) {
        return __awaiter(this, void 0, void 0, function () {
            var index;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        index = 0;
                        _a.label = 1;
                    case 1:
                        if (!(index < orderedIds.length)) return [3 /*break*/, 4];
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.mediaFlowItems)
                                .set({ displayOrder: index, updatedAt: new Date() })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.mediaFlowItems.flowId, flowId), (0, drizzle_orm_1.eq)(schema_1.mediaFlowItems.id, orderedIds[index])))];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        index++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reset completo de um cliente pelo número de telefone
     * Exclui: conversa admin, mensagens admin, sessão em memória, user (se existir)
     * Usado para testes - permite testar como cliente novo
     */
    DatabaseStorage.prototype.resetClientByPhone = function (phoneNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var result, normalizePhone, cleanPhone, authEmails, adminConv, messagesResult, user, allUsers, agentResult, businessAgentResult, mediaResult, connection, userConversations, _i, userConversations_2, conv, subscription, structuredTables, _a, structuredTables_1, tableName, structuredCleanupError_1, message, tagRows, tagIds, teamMemberRows, teamMemberIds, attemptedAuthIds, deleteByIdError, _b, data, error, authUsers, _c, authUsers_1, authUser, authEmail, deleteError, authCleanupError_1, error_24;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        result = {
                            conversationDeleted: false,
                            messagesDeleted: 0,
                            userDeleted: false,
                            connectionDeleted: false,
                            subscriptionDeleted: false,
                            agentConfigDeleted: false,
                            businessAgentConfigDeleted: false,
                            mediaDeleted: 0,
                        };
                        normalizePhone = function (value) { return String(value || "").replace(/\D/g, ""); };
                        cleanPhone = normalizePhone(phoneNumber);
                        authEmails = new Set([
                            "".concat(cleanPhone, "@agentezap.online"),
                            "".concat(cleanPhone, "@agentezap.com"),
                            "".concat(cleanPhone, "@agentezap.temp"),
                        ]
                            .map(function (value) { return value.toLowerCase(); })
                            .filter(Boolean));
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Iniciando reset para ".concat(phoneNumber, " -> ").concat(cleanPhone, "..."));
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 74, , 75]);
                        return [4 /*yield*/, this.getAdminConversationByPhone(cleanPhone)];
                    case 2:
                        adminConv = _d.sent();
                        if (!adminConv) return [3 /*break*/, 5];
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.adminMessages)
                                .where((0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, adminConv.id))];
                    case 3:
                        messagesResult = _d.sent();
                        result.messagesDeleted = messagesResult.rowCount || 0;
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] ".concat(result.messagesDeleted, " mensagens admin exclu\u00EDdas"));
                        // Deletar a conversa
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.adminConversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, adminConv.id))];
                    case 4:
                        // Deletar a conversa
                        _d.sent();
                        result.conversationDeleted = true;
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Conversa admin exclu\u00EDda");
                        _d.label = 5;
                    case 5: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone))];
                    case 6:
                        user = (_d.sent())[0];
                        if (!!user) return [3 /*break*/, 8];
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users)];
                    case 7:
                        allUsers = _d.sent();
                        user = allUsers.find(function (candidate) { return normalizePhone(candidate.phone) === cleanPhone; });
                        _d.label = 8;
                    case 8:
                        if (!user) return [3 /*break*/, 62];
                        if (user.email) {
                            authEmails.add(String(user.email).toLowerCase());
                        }
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.aiAgentConfig)
                                .where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, user.id))];
                    case 9:
                        agentResult = _d.sent();
                        result.agentConfigDeleted = (agentResult.rowCount || 0) > 0;
                        if (result.agentConfigDeleted) {
                            console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Config do agente exclu\u00EDda");
                        }
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.businessAgentConfigs)
                                .where((0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, user.id))];
                    case 10:
                        businessAgentResult = _d.sent();
                        result.businessAgentConfigDeleted = (businessAgentResult.rowCount || 0) > 0;
                        if (result.businessAgentConfigDeleted) {
                            console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Config estruturada do agente exclu\u00EDda");
                        }
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.agentMediaLibrary)
                                .where((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, user.id))];
                    case 11:
                        mediaResult = _d.sent();
                        result.mediaDeleted = mediaResult.rowCount || 0;
                        if (result.mediaDeleted > 0) {
                            console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] ".concat(result.mediaDeleted, " m\u00EDdias do agente exclu\u00EDdas"));
                        }
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.whatsappConnections)
                                .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, user.id))];
                    case 12:
                        connection = (_d.sent())[0];
                        if (!connection) return [3 /*break*/, 20];
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 13:
                        userConversations = _d.sent();
                        _i = 0, userConversations_2 = userConversations;
                        _d.label = 14;
                    case 14:
                        if (!(_i < userConversations_2.length)) return [3 /*break*/, 17];
                        conv = userConversations_2[_i];
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.messages)
                                .where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conv.id))];
                    case 15:
                        _d.sent();
                        _d.label = 16;
                    case 16:
                        _i++;
                        return [3 /*break*/, 14];
                    case 17: 
                    // Deletar conversas do usuário
                    return [4 /*yield*/, db_1.db
                            .delete(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 18:
                        // Deletar conversas do usuário
                        _d.sent();
                        // Deletar conexão
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.whatsappConnections)
                                .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, connection.id))];
                    case 19:
                        // Deletar conexão
                        _d.sent();
                        result.connectionDeleted = true;
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Conex\u00E3o WhatsApp exclu\u00EDda");
                        _d.label = 20;
                    case 20: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.subscriptions)
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, user.id))];
                    case 21:
                        subscription = (_d.sent())[0];
                        if (!subscription) return [3 /*break*/, 24];
                        // Deletar pagamentos
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.payments)
                                .where((0, drizzle_orm_1.eq)(schema_1.payments.subscriptionId, subscription.id))];
                    case 22:
                        // Deletar pagamentos
                        _d.sent();
                        // Deletar subscription
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.subscriptions)
                                .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.id, subscription.id))];
                    case 23:
                        // Deletar subscription
                        _d.sent();
                        result.subscriptionDeleted = true;
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Subscription exclu\u00EDda");
                        _d.label = 24;
                    case 24: 
                    // Limpar referências extras que apontam para users.id
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["delete from admin_notification_logs where user_id = ", ""], ["delete from admin_notification_logs where user_id = ", ""])), user.id))];
                    case 25:
                        // Limpar referências extras que apontam para users.id
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["delete from audio_config where user_id = ", ""], ["delete from audio_config where user_id = ", ""])), user.id))];
                    case 26:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["delete from daily_usage where user_id = ", ""], ["delete from daily_usage where user_id = ", ""])), user.id))];
                    case 27:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["delete from products_config where user_id = ", ""], ["delete from products_config where user_id = ", ""])), user.id))];
                    case 28:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["delete from appointments where user_id = ", ""], ["delete from appointments where user_id = ", ""])), user.id))];
                    case 29:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["delete from scheduling_exceptions where user_id = ", ""], ["delete from scheduling_exceptions where user_id = ", ""])), user.id))];
                    case 30:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["delete from google_calendar_tokens where user_id = ", ""], ["delete from google_calendar_tokens where user_id = ", ""])), user.id))];
                    case 31:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["delete from professional_services\n              where professional_id in (select id from scheduling_professionals where user_id = ", ")\n                 or service_id in (select id from scheduling_services where user_id = ", ")"], ["delete from professional_services\n              where professional_id in (select id from scheduling_professionals where user_id = ", ")\n                 or service_id in (select id from scheduling_services where user_id = ", ")"])), user.id, user.id))];
                    case 32:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["delete from scheduling_professionals where user_id = ", ""], ["delete from scheduling_professionals where user_id = ", ""])), user.id))];
                    case 33:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["delete from scheduling_services where user_id = ", ""], ["delete from scheduling_services where user_id = ", ""])), user.id))];
                    case 34:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["delete from scheduling_config where user_id = ", ""], ["delete from scheduling_config where user_id = ", ""])), user.id))];
                    case 35:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["delete from order_items\n              where order_id in (select id from delivery_orders where user_id = ", ")"], ["delete from order_items\n              where order_id in (select id from delivery_orders where user_id = ", ")"])), user.id))];
                    case 36:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["delete from delivery_orders where user_id = ", ""], ["delete from delivery_orders where user_id = ", ""])), user.id))];
                    case 37:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["delete from delivery_carts where user_id = ", ""], ["delete from delivery_carts where user_id = ", ""])), user.id))];
                    case 38:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["delete from menu_items where user_id = ", ""], ["delete from menu_items where user_id = ", ""])), user.id))];
                    case 39:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["delete from menu_categories where user_id = ", ""], ["delete from menu_categories where user_id = ", ""])), user.id))];
                    case 40:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject(["delete from scheduled_status where user_id = ", ""], ["delete from scheduled_status where user_id = ", ""])), user.id))];
                    case 41:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["delete from status_rotation_items\n              where rotation_id in (select id from status_rotation where user_id = ", ")"], ["delete from status_rotation_items\n              where rotation_id in (select id from status_rotation where user_id = ", ")"])), user.id))];
                    case 42:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject(["delete from status_rotation where user_id = ", ""], ["delete from status_rotation where user_id = ", ""])), user.id))];
                    case 43:
                        _d.sent();
                        structuredTables = ["salon_config", "delivery_config", "admin_test_tokens"];
                        _a = 0, structuredTables_1 = structuredTables;
                        _d.label = 44;
                    case 44:
                        if (!(_a < structuredTables_1.length)) return [3 /*break*/, 49];
                        tableName = structuredTables_1[_a];
                        _d.label = 45;
                    case 45:
                        _d.trys.push([45, 47, , 48]);
                        return [4 /*yield*/, db_1.db.execute(drizzle_orm_1.sql.raw("delete from ".concat(tableName, " where user_id = '").concat(user.id, "'")))];
                    case 46:
                        _d.sent();
                        return [3 /*break*/, 48];
                    case 47:
                        structuredCleanupError_1 = _d.sent();
                        message = String((structuredCleanupError_1 === null || structuredCleanupError_1 === void 0 ? void 0 : structuredCleanupError_1.message) || "");
                        if (!/does not exist/i.test(message) &&
                            !/relation .* does not exist/i.test(message)) {
                            console.warn("\u26A0\uFE0F [RESET CLIENT] Falha ao limpar ".concat(tableName, ": ").concat(message));
                        }
                        return [3 /*break*/, 48];
                    case 48:
                        _a++;
                        return [3 /*break*/, 44];
                    case 49: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["select id from tags where user_id = ", ""], ["select id from tags where user_id = ", ""])), user.id))];
                    case 50:
                        tagRows = _d.sent();
                        tagIds = Array.from(new Set(((tagRows === null || tagRows === void 0 ? void 0 : tagRows.rows) || [])
                            .map(function (row) { return row === null || row === void 0 ? void 0 : row.id; })
                            .filter(function (value) { return typeof value === "string" && value.length > 0; })));
                        if (!(tagIds.length > 0)) return [3 /*break*/, 52];
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["delete from conversation_tags where tag_id in (", ")"], ["delete from conversation_tags where tag_id in (", ")"])), drizzle_orm_1.sql.join(tagIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject([", "], [", "]))))))];
                    case 51:
                        _d.sent();
                        _d.label = 52;
                    case 52: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["delete from tags where user_id = ", ""], ["delete from tags where user_id = ", ""])), user.id))];
                    case 53:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["select id from team_members where owner_id = ", ""], ["select id from team_members where owner_id = ", ""])), user.id))];
                    case 54:
                        teamMemberRows = _d.sent();
                        teamMemberIds = Array.from(new Set(((teamMemberRows === null || teamMemberRows === void 0 ? void 0 : teamMemberRows.rows) || [])
                            .map(function (row) { return row === null || row === void 0 ? void 0 : row.id; })
                            .filter(function (value) { return typeof value === "string" && value.length > 0; })));
                        if (!(teamMemberIds.length > 0)) return [3 /*break*/, 59];
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["delete from connection_members where member_id in (", ")"], ["delete from connection_members where member_id in (", ")"])), drizzle_orm_1.sql.join(teamMemberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject([", "], [", "]))))))];
                    case 55:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["delete from routing_logs where assigned_to_member_id in (", ")"], ["delete from routing_logs where assigned_to_member_id in (", ")"])), drizzle_orm_1.sql.join(teamMemberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject([", "], [", "]))))))];
                    case 56:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject(["delete from sector_members where member_id in (", ")"], ["delete from sector_members where member_id in (", ")"])), drizzle_orm_1.sql.join(teamMemberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject([", "], [", "]))))))];
                    case 57:
                        _d.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject(["delete from team_member_sessions where member_id in (", ")"], ["delete from team_member_sessions where member_id in (", ")"])), drizzle_orm_1.sql.join(teamMemberIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject([", "], [", "]))))))];
                    case 58:
                        _d.sent();
                        _d.label = 59;
                    case 59: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["delete from team_members where owner_id = ", ""], ["delete from team_members where owner_id = ", ""])), user.id))];
                    case 60:
                        _d.sent();
                        // Finalmente, deletar o usuário
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.users)
                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id))];
                    case 61:
                        // Finalmente, deletar o usuário
                        _d.sent();
                        result.userDeleted = true;
                        console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Usu\u00E1rio exclu\u00EDdo");
                        _d.label = 62;
                    case 62:
                        if (!(authEmails.size > 0)) return [3 /*break*/, 73];
                        _d.label = 63;
                    case 63:
                        _d.trys.push([63, 72, , 73]);
                        attemptedAuthIds = new Set();
                        if (!(user === null || user === void 0 ? void 0 : user.id)) return [3 /*break*/, 65];
                        attemptedAuthIds.add(String(user.id));
                        return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.deleteUser(String(user.id))];
                    case 64:
                        deleteByIdError = (_d.sent()).error;
                        if (deleteByIdError) {
                            console.warn("\u26A0\uFE0F [RESET CLIENT] Falha ao excluir Auth por user.id ".concat(user.id, ": ").concat(deleteByIdError.message));
                        }
                        else {
                            console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Usu\u00E1rio Auth exclu\u00EDdo por user.id: ".concat(user.id));
                        }
                        _d.label = 65;
                    case 65: return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.listUsers()];
                    case 66:
                        _b = _d.sent(), data = _b.data, error = _b.error;
                        if (!error) return [3 /*break*/, 67];
                        console.warn("\u26A0\uFE0F [RESET CLIENT] Falha ao listar usu\u00E1rios no Auth: ".concat(error.message));
                        return [3 /*break*/, 71];
                    case 67:
                        authUsers = Array.isArray(data === null || data === void 0 ? void 0 : data.users) ? data.users : [];
                        _c = 0, authUsers_1 = authUsers;
                        _d.label = 68;
                    case 68:
                        if (!(_c < authUsers_1.length)) return [3 /*break*/, 71];
                        authUser = authUsers_1[_c];
                        if (attemptedAuthIds.has(String((authUser === null || authUser === void 0 ? void 0 : authUser.id) || "")))
                            return [3 /*break*/, 70];
                        authEmail = String((authUser === null || authUser === void 0 ? void 0 : authUser.email) || "").toLowerCase();
                        if (!authEmail || !authEmails.has(authEmail))
                            return [3 /*break*/, 70];
                        return [4 /*yield*/, supabaseAuth_1.supabase.auth.admin.deleteUser(authUser.id)];
                    case 69:
                        deleteError = (_d.sent()).error;
                        if (deleteError) {
                            console.warn("\u26A0\uFE0F [RESET CLIENT] Falha ao excluir Auth ".concat(authEmail, ": ").concat(deleteError.message));
                        }
                        else {
                            console.log("\uD83D\uDDD1\uFE0F [RESET CLIENT] Usu\u00E1rio Auth exclu\u00EDdo: ".concat(authEmail));
                        }
                        _d.label = 70;
                    case 70:
                        _c++;
                        return [3 /*break*/, 68];
                    case 71: return [3 /*break*/, 73];
                    case 72:
                        authCleanupError_1 = _d.sent();
                        console.warn("\u26A0\uFE0F [RESET CLIENT] Erro ao limpar Auth do Supabase:", authCleanupError_1);
                        return [3 /*break*/, 73];
                    case 73:
                        console.log("\u2705 [RESET CLIENT] Reset completo para ".concat(phoneNumber), result);
                        return [2 /*return*/, result];
                    case 74:
                        error_24 = _d.sent();
                        console.error("\u274C [RESET CLIENT] Erro ao resetar cliente:", error_24);
                        throw error_24;
                    case 75: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reset SEGURO de conta de teste com validações rigorosas.
     * Em fluxos administrativos, pode receber forceAnyAccount para
     * remover qualquer conta vinculada ao telefone.
     */
    DatabaseStorage.prototype.resetTestAccountSafely = function (phoneNumber, options) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizePhone_1, cleanPhone_1, forceAnyAccount, user, allUsers, adminConv, userEmail, managedEmails, connection, hasRealConversations, subscription, hasPayments, createdAtDate, accountAge, daysOld, result, error_25;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 19, , 20]);
                        normalizePhone_1 = function (value) { return String(value || "").replace(/\D/g, ""); };
                        cleanPhone_1 = normalizePhone_1(phoneNumber);
                        forceAnyAccount = (options === null || options === void 0 ? void 0 : options.forceAnyAccount) === true;
                        console.log("\uD83D\uDD0D [SAFE RESET] Verificando seguranca para ".concat(phoneNumber, " -> ").concat(cleanPhone_1, "... modo=").concat(forceAnyAccount ? "FORCED" : "SAFE"));
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.users)
                                .where((0, drizzle_orm_1.eq)(schema_1.users.phone, cleanPhone_1))];
                    case 1:
                        user = (_a.sent())[0];
                        if (!!user) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users)];
                    case 2:
                        allUsers = _a.sent();
                        user = allUsers.find(function (u) { return normalizePhone_1(u.phone) === cleanPhone_1; });
                        _a.label = 3;
                    case 3:
                        if (!!user) return [3 /*break*/, 8];
                        console.log("\u26A0\uFE0F [SAFE RESET] Nenhum usuario encontrado para ".concat(cleanPhone_1));
                        return [4 /*yield*/, this.getAdminConversationByPhone(cleanPhone_1)];
                    case 4:
                        adminConv = _a.sent();
                        if (!adminConv) return [3 /*break*/, 7];
                        return [4 /*yield*/, db_1.db.delete(schema_1.adminMessages).where((0, drizzle_orm_1.eq)(schema_1.adminMessages.conversationId, adminConv.id))];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, db_1.db.delete(schema_1.adminConversations).where((0, drizzle_orm_1.eq)(schema_1.adminConversations.id, adminConv.id))];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7: return [2 /*return*/, {
                            success: true,
                            result: { userDeleted: false, conversationDeleted: !!adminConv }
                        }];
                    case 8:
                        // 2. VALIDAÇÕES DE SEGURANÇA
                        // Validacao 1: conta precisa ser gerada automaticamente para esse telefone
                        if (!forceAnyAccount) {
                            userEmail = String(user.email || "").toLowerCase().trim();
                            managedEmails = new Set([
                                "".concat(cleanPhone_1, "@agentezap.online"),
                                "".concat(cleanPhone_1, "@agentezap.com"),
                                "".concat(cleanPhone_1, "@agentezap.temp"),
                            ]);
                            if (!managedEmails.has(userEmail)) {
                                return [2 /*return*/, {
                                        success: false,
                                        error: "\u26D4 Conta nao elegivel para reset seguro. Email atual: ".concat(user.email || "nao definido", "."),
                                    }];
                            }
                        }
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.whatsappConnections)
                                .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, user.id))];
                    case 9:
                        connection = (_a.sent())[0];
                        if (!(connection && connection.isConnected)) return [3 /*break*/, 11];
                        console.log("\u26A0\uFE0F [SAFE RESET] Usu\u00E1rio tem WhatsApp conectado. Desconectando for\u00E7adamente para permitir reset...");
                        // Desconectar WhatsApp antes de deletar
                        return [4 /*yield*/, db_1.db
                                .update(schema_1.whatsappConnections)
                                .set({ isConnected: false, qrCode: null })
                                .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.id, connection.id))];
                    case 10:
                        // Desconectar WhatsApp antes de deletar
                        _a.sent();
                        _a.label = 11;
                    case 11:
                        if (!connection) return [3 /*break*/, 14];
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 12:
                        hasRealConversations = (_a.sent())[0];
                        if (!(hasRealConversations && Number(hasRealConversations.count) > 0)) return [3 /*break*/, 14];
                        console.log("\u26A0\uFE0F [SAFE RESET] Usu\u00E1rio tem conversas reais (".concat(hasRealConversations.count, "). Apagando conversas para permitir reset..."));
                        // Apagar conversas reais para permitir reset
                        return [4 /*yield*/, db_1.db
                                .delete(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connection.id))];
                    case 13:
                        // Apagar conversas reais para permitir reset
                        _a.sent();
                        _a.label = 14;
                    case 14: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.subscriptions)
                            .where((0, drizzle_orm_1.eq)(schema_1.subscriptions.userId, user.id))];
                    case 15:
                        subscription = (_a.sent())[0];
                        if (!forceAnyAccount &&
                            subscription &&
                            subscription.status !== 'trialing' &&
                            subscription.status !== 'inactive') {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "\u26D4 Usu\u00E1rio tem assinatura ativa (".concat(subscription.status, ")! N\u00E3o pode deletar conta com pagamento ativo.")
                                }];
                        }
                        if (!(!forceAnyAccount && subscription)) return [3 /*break*/, 17];
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                .from(schema_1.payments)
                                .where((0, drizzle_orm_1.eq)(schema_1.payments.subscriptionId, subscription.id))];
                    case 16:
                        hasPayments = (_a.sent())[0];
                        if (hasPayments && Number(hasPayments.count) > 0) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: '⛔ Usuário tem pagamentos registrados! Não pode deletar conta com histórico financeiro.'
                                }];
                        }
                        _a.label = 17;
                    case 17:
                        createdAtDate = user.createdAt ? new Date(user.createdAt) : new Date();
                        accountAge = Date.now() - createdAtDate.getTime();
                        daysOld = accountAge / (1000 * 60 * 60 * 24);
                        if (!forceAnyAccount && daysOld > 30) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: "\u26D4 Conta tem mais de 30 dias (".concat(Math.floor(daysOld), " dias). Muito antiga para reset autom\u00E1tico.")
                                }];
                        }
                        // ✅ TODAS AS VALIDAÇÕES PASSARAM - SAFE TO DELETE
                        console.log("\u2705 [SAFE RESET] ".concat(forceAnyAccount ? "Reset forcado autorizado" : "Validacoes OK", " para ").concat(cleanPhone_1, ". Procedendo com reset..."));
                        return [4 /*yield*/, this.resetClientByPhone(cleanPhone_1)];
                    case 18:
                        result = _a.sent();
                        return [2 /*return*/, {
                                success: true,
                                result: result
                            }];
                    case 19:
                        error_25 = _a.sent();
                        console.error("\u274C [SAFE RESET] Erro ao resetar:", error_25);
                        return [2 /*return*/, {
                                success: false,
                                error: "Erro t\u00E9cnico: ".concat(error_25.message)
                            }];
                    case 20: return [2 /*return*/];
                }
            });
        });
    };
    // ==================== QUICK REPLIES / RESPOSTAS RÁPIDAS ====================
    DatabaseStorage.prototype.getQuickReplies = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [2 /*return*/, db_1.db
                                .select()
                                .from(adminQuickReplies)
                                .where((0, drizzle_orm_1.eq)(adminQuickReplies.adminId, adminId))
                                .orderBy(adminQuickReplies.createdAt)];
                }
            });
        });
    };
    DatabaseStorage.prototype.getQuickReply = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(adminQuickReplies)
                                .where((0, drizzle_orm_1.eq)(adminQuickReplies.id, id))];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.createQuickReply = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .insert(adminQuickReplies)
                                .values(data)
                                .returning()];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateQuickReply = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .update(adminQuickReplies)
                                .set(data)
                                .where((0, drizzle_orm_1.eq)(adminQuickReplies.id, id))
                                .returning()];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteQuickReply = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .delete(adminQuickReplies)
                                .where((0, drizzle_orm_1.eq)(adminQuickReplies.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.incrementQuickReplyUsage = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var adminQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        adminQuickReplies = (_a.sent()).adminQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .update(adminQuickReplies)
                                .set({
                                usageCount: (0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), adminQuickReplies.usageCount),
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(adminQuickReplies.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== USER QUICK REPLIES / RESPOSTAS RÁPIDAS USUÁRIOS ====================
    DatabaseStorage.prototype.getUserQuickReplies = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [2 /*return*/, db_1.db
                                .select()
                                .from(userQuickReplies)
                                .where((0, drizzle_orm_1.eq)(userQuickReplies.userId, userId))
                                .orderBy(userQuickReplies.createdAt)];
                }
            });
        });
    };
    DatabaseStorage.prototype.getUserQuickReply = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(userQuickReplies)
                                .where((0, drizzle_orm_1.eq)(userQuickReplies.id, id))];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.createUserQuickReply = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .insert(userQuickReplies)
                                .values(data)
                                .returning()];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateUserQuickReply = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies, reply;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .update(userQuickReplies)
                                .set(data)
                                .where((0, drizzle_orm_1.eq)(userQuickReplies.id, id))
                                .returning()];
                    case 2:
                        reply = (_a.sent())[0];
                        return [2 /*return*/, reply];
                }
            });
        });
    };
    DatabaseStorage.prototype.deleteUserQuickReply = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .delete(userQuickReplies)
                                .where((0, drizzle_orm_1.eq)(userQuickReplies.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.incrementUserQuickReplyUsage = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var userQuickReplies;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        userQuickReplies = (_a.sent()).userQuickReplies;
                        return [4 /*yield*/, db_1.db
                                .update(userQuickReplies)
                                .set({
                                usageCount: (0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), userQuickReplies.usageCount),
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(userQuickReplies.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== EXCLUSION LIST / LISTA DE EXCLUSÃO ====================
    /**
     * Normaliza um número de telefone brasileiro para comparação
     * Retorna array com todas as variações possíveis do número
     * Ex: 5517991956944 -> ['5517991956944', '17991956944', '991956944']
     */
    DatabaseStorage.prototype.normalizePhoneForComparison = function (phoneNumber) {
        var cleanNumber = phoneNumber.replace(/\D/g, "");
        var variations = [cleanNumber];
        // Se começa com 55 (Brasil), adicionar versão sem 55
        if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
            variations.push(cleanNumber.substring(2)); // Remove 55
        }
        // Se não começa com 55, adicionar versão com 55
        if (!cleanNumber.startsWith('55') && cleanNumber.length >= 10) {
            variations.push('55' + cleanNumber);
        }
        // Para números com DDD (2 dígitos) + número (8 ou 9 dígitos)
        // Adicionar versão apenas com número local (sem DDD)
        if (cleanNumber.length >= 10 && cleanNumber.length <= 11) {
            variations.push(cleanNumber.substring(2)); // Remove DDD
        }
        // Se já é número com código do país, adicionar sem código do país e sem DDD
        if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
            var withoutCountry = cleanNumber.substring(2);
            if (withoutCountry.length >= 10) {
                variations.push(withoutCountry.substring(2)); // Apenas número local
            }
        }
        console.log("\uD83D\uDCDE [EXCLUSION] Normalizando n\u00FAmero ".concat(phoneNumber, " -> varia\u00E7\u00F5es: [").concat(variations.join(', '), "]"));
        return __spreadArray([], new Set(variations), true); // Remove duplicados
    };
    /**
     * Verifica se um número está na lista de exclusão de um usuário
     * @param userId ID do usuário
     * @param phoneNumber Número de telefone (apenas dígitos)
     * @returns true se o número está excluído e ativo
     */
    DatabaseStorage.prototype.isNumberExcluded = function (userId, phoneNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, exclusionList, exclusionConfig, or, config, numberVariations, items, isExcluded;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        _a = _c.sent(), exclusionList = _a.exclusionList, exclusionConfig = _a.exclusionConfig;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                    case 2:
                        or = (_c.sent()).or;
                        return [4 /*yield*/, this.getExclusionConfig(userId)];
                    case 3:
                        config = _c.sent();
                        if (config && config.isEnabled === false) {
                            console.log("\uD83D\uDEAB [EXCLUSION] Lista de exclus\u00E3o DESATIVADA explicitamente para usu\u00E1rio ".concat(userId));
                            return [2 /*return*/, false];
                        }
                        // Se config não existe ou isEnabled é true/undefined, continuar com a verificação
                        console.log("\uD83D\uDD0D [EXCLUSION] Verificando lista de exclus\u00E3o para usu\u00E1rio ".concat(userId, " (config=").concat(config ? 'exists' : 'default', ", isEnabled=").concat((_b = config === null || config === void 0 ? void 0 : config.isEnabled) !== null && _b !== void 0 ? _b : 'default=true', ")"));
                        numberVariations = this.normalizePhoneForComparison(phoneNumber);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(exclusionList)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(exclusionList.userId, userId), (0, drizzle_orm_1.eq)(exclusionList.isActive, true), or.apply(void 0, numberVariations.map(function (num) { return (0, drizzle_orm_1.eq)(exclusionList.phoneNumber, num); }))))];
                    case 4:
                        items = _c.sent();
                        isExcluded = items.length > 0;
                        console.log("\uD83D\uDCDE [EXCLUSION] Verificando ".concat(phoneNumber, " (varia\u00E7\u00F5es: ").concat(numberVariations.join(', '), ") -> ").concat(isExcluded ? '🚫 EXCLUÍDO' : '✅ Permitido'));
                        return [2 /*return*/, isExcluded];
                }
            });
        });
    };
    /**
     * Verifica se um número está excluído de follow-up
     * @param userId ID do usuário
     * @param phoneNumber Número de telefone (apenas dígitos)
     * @returns true se o número está excluído de follow-up
     */
    DatabaseStorage.prototype.isNumberExcludedFromFollowup = function (userId, phoneNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList, or, config, numberVariations, items, isExcluded;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_c.sent()).exclusionList;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("drizzle-orm"); })];
                    case 2:
                        or = (_c.sent()).or;
                        return [4 /*yield*/, this.getExclusionConfig(userId)];
                    case 3:
                        config = _c.sent();
                        // Se config existe e isEnabled é explicitamente false, desativar
                        if (config && config.isEnabled === false) {
                            console.log("\uD83D\uDEAB [EXCLUSION] Lista de exclus\u00E3o DESATIVADA explicitamente para usu\u00E1rio ".concat(userId));
                            return [2 /*return*/, false];
                        }
                        // Se config existe e followupExclusionEnabled é explicitamente false, desativar follow-up exclusion
                        if (config && config.followupExclusionEnabled === false) {
                            console.log("\uD83D\uDEAB [EXCLUSION] Exclus\u00E3o de follow-up DESATIVADA explicitamente para usu\u00E1rio ".concat(userId));
                            return [2 /*return*/, false];
                        }
                        // Se config não existe ou ambas as flags são true/undefined, continuar com a verificação
                        console.log("\uD83D\uDD0D [EXCLUSION-FOLLOWUP] Verificando lista de exclus\u00E3o para usu\u00E1rio ".concat(userId, " (config=").concat(config ? 'exists' : 'default', ", isEnabled=").concat((_a = config === null || config === void 0 ? void 0 : config.isEnabled) !== null && _a !== void 0 ? _a : 'default=true', ", followupExclusionEnabled=").concat((_b = config === null || config === void 0 ? void 0 : config.followupExclusionEnabled) !== null && _b !== void 0 ? _b : 'default=true', ")"));
                        numberVariations = this.normalizePhoneForComparison(phoneNumber);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(exclusionList)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(exclusionList.userId, userId), (0, drizzle_orm_1.eq)(exclusionList.isActive, true), (0, drizzle_orm_1.eq)(exclusionList.excludeFromFollowup, true), or.apply(void 0, numberVariations.map(function (num) { return (0, drizzle_orm_1.eq)(exclusionList.phoneNumber, num); }))))];
                    case 4:
                        items = _c.sent();
                        isExcluded = items.length > 0;
                        console.log("\uD83D\uDCDE [EXCLUSION-FOLLOWUP] Verificando ".concat(phoneNumber, " -> ").concat(isExcluded ? '🚫 EXCLUÍDO DE FOLLOW-UP' : '✅ Follow-up permitido'));
                        return [2 /*return*/, isExcluded];
                }
            });
        });
    };
    /**
     * Obtém configuração de exclusão do usuário
     */
    DatabaseStorage.prototype.getExclusionConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionConfig, config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionConfig = (_a.sent()).exclusionConfig;
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(exclusionConfig)
                                .where((0, drizzle_orm_1.eq)(exclusionConfig.userId, userId))];
                    case 2:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Cria ou atualiza configuração de exclusão do usuário
     */
    DatabaseStorage.prototype.upsertExclusionConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionConfig, existing, config, config;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionConfig = (_c.sent()).exclusionConfig;
                        return [4 /*yield*/, this.getExclusionConfig(userId)];
                    case 2:
                        existing = _c.sent();
                        if (!existing) return [3 /*break*/, 4];
                        return [4 /*yield*/, db_1.db
                                .update(exclusionConfig)
                                .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                                .where((0, drizzle_orm_1.eq)(exclusionConfig.userId, userId))
                                .returning()];
                    case 3:
                        config = (_c.sent())[0];
                        return [2 /*return*/, config];
                    case 4: return [4 /*yield*/, db_1.db
                            .insert(exclusionConfig)
                            .values({
                            userId: userId,
                            isEnabled: (_a = data.isEnabled) !== null && _a !== void 0 ? _a : true,
                            followupExclusionEnabled: (_b = data.followupExclusionEnabled) !== null && _b !== void 0 ? _b : true,
                        })
                            .returning()];
                    case 5:
                        config = (_c.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Obtém todos os números da lista de exclusão do usuário
     */
    DatabaseStorage.prototype.getExclusionList = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [2 /*return*/, db_1.db
                                .select()
                                .from(exclusionList)
                                .where((0, drizzle_orm_1.eq)(exclusionList.userId, userId))
                                .orderBy((0, drizzle_orm_1.desc)(exclusionList.createdAt))];
                }
            });
        });
    };
    /**
     * Obtém um item da lista de exclusão por ID
     */
    DatabaseStorage.prototype.getExclusionListItem = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList, item;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(exclusionList)
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, id))];
                    case 2:
                        item = (_a.sent())[0];
                        return [2 /*return*/, item];
                }
            });
        });
    };
    /**
     * Adiciona um número à lista de exclusão
     */
    DatabaseStorage.prototype.addToExclusionList = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList, cleanNumber, existing, item_1, item;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_e.sent()).exclusionList;
                        cleanNumber = data.phoneNumber.replace(/\D/g, "");
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(exclusionList)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(exclusionList.userId, data.userId), (0, drizzle_orm_1.eq)(exclusionList.phoneNumber, cleanNumber)))];
                    case 2:
                        existing = _e.sent();
                        if (!(existing.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, db_1.db
                                .update(exclusionList)
                                .set({
                                contactName: data.contactName,
                                reason: data.reason,
                                excludeFromFollowup: (_a = data.excludeFromFollowup) !== null && _a !== void 0 ? _a : true,
                                isActive: (_b = data.isActive) !== null && _b !== void 0 ? _b : true,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, existing[0].id))
                                .returning()];
                    case 3:
                        item_1 = (_e.sent())[0];
                        return [2 /*return*/, item_1];
                    case 4: return [4 /*yield*/, db_1.db
                            .insert(exclusionList)
                            .values({
                            userId: data.userId,
                            phoneNumber: cleanNumber,
                            contactName: data.contactName,
                            reason: data.reason,
                            excludeFromFollowup: (_c = data.excludeFromFollowup) !== null && _c !== void 0 ? _c : true,
                            isActive: (_d = data.isActive) !== null && _d !== void 0 ? _d : true,
                        })
                            .returning()];
                    case 5:
                        item = (_e.sent())[0];
                        return [2 /*return*/, item];
                }
            });
        });
    };
    /**
     * Atualiza um item da lista de exclusão
     */
    DatabaseStorage.prototype.updateExclusionListItem = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList, item;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [4 /*yield*/, db_1.db
                                .update(exclusionList)
                                .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, id))
                                .returning()];
                    case 2:
                        item = (_a.sent())[0];
                        return [2 /*return*/, item];
                }
            });
        });
    };
    /**
     * Remove um número da lista de exclusão (soft delete - desativa)
     */
    DatabaseStorage.prototype.removeFromExclusionList = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [4 /*yield*/, db_1.db
                                .update(exclusionList)
                                .set({
                                isActive: false,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Remove permanentemente um número da lista de exclusão
     */
    DatabaseStorage.prototype.deleteFromExclusionList = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [4 /*yield*/, db_1.db
                                .delete(exclusionList)
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, id))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reativa um número na lista de exclusão
     */
    DatabaseStorage.prototype.reactivateExclusionListItem = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var exclusionList, item;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        exclusionList = (_a.sent()).exclusionList;
                        return [4 /*yield*/, db_1.db
                                .update(exclusionList)
                                .set({
                                isActive: true,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(exclusionList.id, id))
                                .returning()];
                    case 2:
                        item = (_a.sent())[0];
                        return [2 /*return*/, item];
                }
            });
        });
    };
    // =============================================================================
    // DAILY USAGE TRACKING - Rastreamento de uso diário para limites free
    // =============================================================================
    /**
     * Obtém ou cria o registro de uso diário para um usuário
     */
    DatabaseStorage.prototype.getDailyUsage = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var dailyUsage, today, existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        dailyUsage = (_a.sent()).dailyUsage;
                        today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(dailyUsage)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(dailyUsage.userId, userId), (0, drizzle_orm_1.eq)(dailyUsage.usageDate, today)))];
                    case 2:
                        existing = (_a.sent())[0];
                        if (existing) {
                            return [2 /*return*/, {
                                    promptEditsCount: existing.promptEditsCount,
                                    simulatorMessagesCount: existing.simulatorMessagesCount,
                                }];
                        }
                        return [2 /*return*/, { promptEditsCount: 0, simulatorMessagesCount: 0 }];
                }
            });
        });
    };
    /**
     * Incrementa o contador de edições de prompt do dia
     */
    DatabaseStorage.prototype.incrementPromptEdits = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var dailyUsage, today, updated, newRecord;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        dailyUsage = (_a.sent()).dailyUsage;
                        today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return [4 /*yield*/, db_1.db
                                .update(dailyUsage)
                                .set({
                                promptEditsCount: (0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), dailyUsage.promptEditsCount),
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(dailyUsage.userId, userId), (0, drizzle_orm_1.eq)(dailyUsage.usageDate, today)))
                                .returning()];
                    case 2:
                        updated = _a.sent();
                        if (updated.length > 0) {
                            return [2 /*return*/, updated[0].promptEditsCount];
                        }
                        return [4 /*yield*/, db_1.db
                                .insert(dailyUsage)
                                .values({
                                userId: userId,
                                usageDate: today,
                                promptEditsCount: 1,
                                simulatorMessagesCount: 0,
                            })
                                .returning()];
                    case 3:
                        newRecord = (_a.sent())[0];
                        return [2 /*return*/, newRecord.promptEditsCount];
                }
            });
        });
    };
    /**
     * Incrementa o contador de mensagens do simulador do dia
     */
    DatabaseStorage.prototype.incrementSimulatorMessages = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var dailyUsage, today, updated, newRecord;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("@shared/schema"); })];
                    case 1:
                        dailyUsage = (_a.sent()).dailyUsage;
                        today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return [4 /*yield*/, db_1.db
                                .update(dailyUsage)
                                .set({
                                simulatorMessagesCount: (0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), dailyUsage.simulatorMessagesCount),
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(dailyUsage.userId, userId), (0, drizzle_orm_1.eq)(dailyUsage.usageDate, today)))
                                .returning()];
                    case 2:
                        updated = _a.sent();
                        if (updated.length > 0) {
                            return [2 /*return*/, updated[0].simulatorMessagesCount];
                        }
                        return [4 /*yield*/, db_1.db
                                .insert(dailyUsage)
                                .values({
                                userId: userId,
                                usageDate: today,
                                promptEditsCount: 0,
                                simulatorMessagesCount: 1,
                            })
                                .returning()];
                    case 3:
                        newRecord = (_a.sent())[0];
                        return [2 /*return*/, newRecord.simulatorMessagesCount];
                }
            });
        });
    };
    // ============================================================================
    // TAGS / ETIQUETAS - CRUD Operations
    // ============================================================================
    /**
     * Obtém todas as tags de um usuário
     */
    DatabaseStorage.prototype.getTagsByUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.tags)
                            .where((0, drizzle_orm_1.eq)(schema_1.tags.userId, userId))
                            .orderBy(schema_1.tags.position, schema_1.tags.name)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Obtém uma tag por ID
     */
    DatabaseStorage.prototype.getTag = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var tag;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.tags)
                            .where((0, drizzle_orm_1.eq)(schema_1.tags.id, id))];
                    case 1:
                        tag = (_a.sent())[0];
                        return [2 /*return*/, tag];
                }
            });
        });
    };
    /**
     * Cria uma nova tag
     */
    DatabaseStorage.prototype.createTag = function (tagData) {
        return __awaiter(this, void 0, void 0, function () {
            var newTag;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.tags)
                            .values(tagData)
                            .returning()];
                    case 1:
                        newTag = (_a.sent())[0];
                        return [2 /*return*/, newTag];
                }
            });
        });
    };
    /**
     * Atualiza uma tag existente
     */
    DatabaseStorage.prototype.updateTag = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var updated;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.tags)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.tags.id, id))
                            .returning()];
                    case 1:
                        updated = (_a.sent())[0];
                        return [2 /*return*/, updated];
                }
            });
        });
    };
    /**
     * Deleta uma tag e remove todas as associações
     */
    DatabaseStorage.prototype.deleteTag = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.tags).where((0, drizzle_orm_1.eq)(schema_1.tags.id, id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria tags padrão do WhatsApp Business para um usuário
     */
    DatabaseStorage.prototype.createDefaultTags = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var defaultTags, createdTags, _i, defaultTags_1, tagData, newTag, error_26;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        defaultTags = [
                            { name: "Novo cliente", color: "#22c55e", icon: "user-plus", position: 0, isDefault: true },
                            { name: "Novo pedido", color: "#eab308", icon: "shopping-bag", position: 1, isDefault: true },
                            { name: "Pagamento pendente", color: "#f97316", icon: "clock", position: 2, isDefault: true },
                            { name: "Pago", color: "#3b82f6", icon: "check-circle", position: 3, isDefault: true },
                            { name: "Pedido finalizado", color: "#ef4444", icon: "package", position: 4, isDefault: true },
                            { name: "VIP", color: "#a855f7", icon: "star", position: 5, isDefault: true },
                        ];
                        createdTags = [];
                        _i = 0, defaultTags_1 = defaultTags;
                        _a.label = 1;
                    case 1:
                        if (!(_i < defaultTags_1.length)) return [3 /*break*/, 6];
                        tagData = defaultTags_1[_i];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.tags)
                                .values(__assign(__assign({}, tagData), { userId: userId }))
                                .onConflictDoNothing()
                                .returning()];
                    case 3:
                        newTag = (_a.sent())[0];
                        if (newTag)
                            createdTags.push(newTag);
                        return [3 /*break*/, 5];
                    case 4:
                        error_26 = _a.sent();
                        // Ignora duplicatas
                        console.log("Tag \"".concat(tagData.name, "\" j\u00E1 existe para o usu\u00E1rio"));
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/, createdTags];
                }
            });
        });
    };
    // ============================================================================
    // CONVERSATION TAGS - Associação de Tags a Conversas
    // ============================================================================
    /**
     * Obtém todas as tags de uma conversa
     */
    DatabaseStorage.prototype.getConversationTags = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            tag: schema_1.tags,
                        })
                            .from(schema_1.conversationTags)
                            .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, schema_1.tags.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.conversationTags.conversationId, conversationId))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.map(function (r) { return r.tag; })];
                }
            });
        });
    };
    /**
     * 🔥 OTIMIZADO: Batch - obtém tags para múltiplas conversas em 1 query (evita N+1)
     */
    DatabaseStorage.prototype.getTagsForConversations = function (conversationIds) {
        return __awaiter(this, void 0, void 0, function () {
            var allTags, tagsByConversation, _i, allTags_1, _a, conversationId, tag;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (conversationIds.length === 0)
                            return [2 /*return*/, new Map()];
                        return [4 /*yield*/, db_1.db
                                .select({
                                conversationId: schema_1.conversationTags.conversationId,
                                tag: schema_1.tags,
                            })
                                .from(schema_1.conversationTags)
                                .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, schema_1.tags.id))
                                .where((0, drizzle_orm_1.inArray)(schema_1.conversationTags.conversationId, conversationIds))];
                    case 1:
                        allTags = _b.sent();
                        tagsByConversation = new Map();
                        for (_i = 0, allTags_1 = allTags; _i < allTags_1.length; _i++) {
                            _a = allTags_1[_i], conversationId = _a.conversationId, tag = _a.tag;
                            if (!tagsByConversation.has(conversationId)) {
                                tagsByConversation.set(conversationId, []);
                            }
                            tagsByConversation.get(conversationId).push(tag);
                        }
                        return [2 /*return*/, tagsByConversation];
                }
            });
        });
    };
    /**
     * Obtém conversas filtradas por tag
     */
    DatabaseStorage.prototype.getConversationsByTag = function (tagId, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            conversation: schema_1.conversations,
                        })
                            .from(schema_1.conversationTags)
                            .innerJoin(schema_1.conversations, (0, drizzle_orm_1.eq)(schema_1.conversationTags.conversationId, schema_1.conversations.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, tagId), (0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId)))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject(["", " DESC NULLS LAST"], ["", " DESC NULLS LAST"])), schema_1.conversations.lastMessageTime))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.map(function (r) { return r.conversation; })];
                }
            });
        });
    };
    /**
     * Adiciona uma tag a uma conversa
     */
    DatabaseStorage.prototype.addTagToConversation = function (conversationId, tagId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .insert(schema_1.conversationTags)
                            .values({ conversationId: conversationId, tagId: tagId })
                            .onConflictDoNothing()
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Remove uma tag de uma conversa
     */
    DatabaseStorage.prototype.removeTagFromConversation = function (conversationId, tagId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .delete(schema_1.conversationTags)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversationTags.conversationId, conversationId), (0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, tagId)))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Atualiza todas as tags de uma conversa (substitui as existentes)
     */
    DatabaseStorage.prototype.setConversationTags = function (conversationId, tagIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Remove todas as tags existentes
                    return [4 /*yield*/, db_1.db
                            .delete(schema_1.conversationTags)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversationTags.conversationId, conversationId))];
                    case 1:
                        // Remove todas as tags existentes
                        _a.sent();
                        if (!(tagIds.length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.conversationTags)
                                .values(tagIds.map(function (tagId) { return ({ conversationId: conversationId, tagId: tagId }); }))
                                .onConflictDoNothing()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Adiciona tags a várias conversas (mantém tags existentes).
     */
    DatabaseStorage.prototype.addTagsToConversations = function (conversationIds, tagIds) {
        return __awaiter(this, void 0, void 0, function () {
            var values;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (conversationIds.length === 0 || tagIds.length === 0)
                            return [2 /*return*/];
                        values = conversationIds.flatMap(function (conversationId) {
                            return tagIds.map(function (tagId) { return ({ conversationId: conversationId, tagId: tagId }); });
                        });
                        return [4 /*yield*/, db_1.db
                                .insert(schema_1.conversationTags)
                                .values(values)
                                .onConflictDoNothing()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Obtém conversas com suas tags para um connectionId
     * 🔥 OTIMIZADO: Cache de 15s para evitar queries repetidas em polling
     */
    DatabaseStorage.prototype.getConversationsWithTags = function (connectionId, limit, offset) {
        return __awaiter(this, void 0, void 0, function () {
            var isFirstPage, cacheKey, cached, cacheKey, cached, countCacheKey, total, countResult, query, allConversations, conversationIds, allTags, tagsByConversation, _i, allTags_2, _a, conversationId, tag, data, result, cacheKey, cacheKey;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        isFirstPage = limit != null && (!offset || offset === 0);
                        if (limit == null) {
                            cacheKey = "convWithTags:".concat(connectionId);
                            cached = exports.memoryCache.get(cacheKey);
                            if (cached !== null)
                                return [2 /*return*/, cached];
                        }
                        else if (isFirstPage) {
                            cacheKey = "convWithTags:".concat(connectionId, ":page0:").concat(limit);
                            cached = exports.memoryCache.get(cacheKey);
                            if (cached !== null)
                                return [2 /*return*/, cached];
                        }
                        countCacheKey = "convCount:".concat(connectionId);
                        total = exports.memoryCache.get(countCacheKey);
                        if (!(total === null)) return [3 /*break*/, 2];
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId))];
                    case 1:
                        countResult = _c.sent();
                        total = Number(((_b = countResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
                        exports.memoryCache.set(countCacheKey, total, 30000); // Cache 30s
                        _c.label = 2;
                    case 2:
                        query = db_1.db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["", " DESC NULLS LAST"], ["", " DESC NULLS LAST"])), schema_1.conversations.lastMessageTime));
                        if (limit != null) {
                            query = query.limit(limit);
                        }
                        if (offset != null && offset > 0) {
                            query = query.offset(offset);
                        }
                        return [4 /*yield*/, query];
                    case 3:
                        allConversations = _c.sent();
                        conversationIds = allConversations.map(function (c) { return c.id; });
                        if (conversationIds.length === 0) {
                            return [2 /*return*/, { data: [], total: total }];
                        }
                        return [4 /*yield*/, db_1.db
                                .select({
                                conversationId: schema_1.conversationTags.conversationId,
                                tag: schema_1.tags,
                            })
                                .from(schema_1.conversationTags)
                                .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, schema_1.tags.id))
                                .where((0, drizzle_orm_1.inArray)(schema_1.conversationTags.conversationId, conversationIds))];
                    case 4:
                        allTags = _c.sent();
                        tagsByConversation = new Map();
                        for (_i = 0, allTags_2 = allTags; _i < allTags_2.length; _i++) {
                            _a = allTags_2[_i], conversationId = _a.conversationId, tag = _a.tag;
                            if (!tagsByConversation.has(conversationId)) {
                                tagsByConversation.set(conversationId, []);
                            }
                            tagsByConversation.get(conversationId).push(tag);
                        }
                        data = allConversations.map(function (conv) { return (__assign(__assign({}, conv), { tags: tagsByConversation.get(conv.id) || [] })); });
                        result = { data: data, total: total };
                        if (limit == null) {
                            cacheKey = "convWithTags:".concat(connectionId);
                            exports.memoryCache.set(cacheKey, result, 15000); // Cache 15s
                        }
                        else if (isFirstPage) {
                            cacheKey = "convWithTags:".concat(connectionId, ":page0:").concat(limit);
                            exports.memoryCache.set(cacheKey, result, 10000); // Cache 10s para primeira página
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * searchConversations — Parte 9: Busca por contato (nome/número) e por conteúdo de mensagens
     * Retorna conversas que correspondem ao termo, com o trecho de mensagem mais relevante (snippet).
     */
    DatabaseStorage.prototype.searchConversations = function (connectionId_1, query_1) {
        return __awaiter(this, arguments, void 0, function (connectionId, query, limit) {
            var term, likeTerm, byContact, byMessage, seen, merged, _i, byContact_1, c, _loop_2, _a, byMessage_1, row, topResults, convIds, allTagRows, tagsByConv, _b, allTagRows_1, _c, conversationId, tag;
            if (limit === void 0) { limit = 30; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!query || query.trim().length < 2)
                            return [2 /*return*/, []];
                        term = query.trim().toLowerCase();
                        likeTerm = "%".concat(term, "%");
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject(["lower(", ") like ", ""], ["lower(", ") like ", ""])), schema_1.conversations.contactName, likeTerm), (0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["lower(", ") like ", ""], ["lower(", ") like ", ""])), schema_1.conversations.contactNumber, likeTerm))))
                                .orderBy((0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject(["", " DESC NULLS LAST"], ["", " DESC NULLS LAST"])), schema_1.conversations.lastMessageTime))
                                .limit(limit)];
                    case 1:
                        byContact = _d.sent();
                        return [4 /*yield*/, db_1.db
                                .select({
                                conv: schema_1.conversations,
                                msgText: schema_1.messages.text,
                                msgFromMe: schema_1.messages.fromMe,
                                msgTime: schema_1.messages.timestamp,
                            })
                                .from(schema_1.messages)
                                .innerJoin(schema_1.conversations, (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, schema_1.conversations.id))
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["lower(", ") like ", ""], ["lower(", ") like ", ""])), schema_1.messages.text, likeTerm)))
                                .orderBy((0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["", " DESC"], ["", " DESC"])), schema_1.messages.timestamp))
                                .limit(limit * 3)];
                    case 2:
                        byMessage = _d.sent();
                        seen = new Set();
                        merged = [];
                        for (_i = 0, byContact_1 = byContact; _i < byContact_1.length; _i++) {
                            c = byContact_1[_i];
                            if (!seen.has(c.id)) {
                                seen.add(c.id);
                                merged.push(__assign(__assign({}, c), { snippet: null }));
                            }
                        }
                        _loop_2 = function (row) {
                            var conv = row.conv;
                            if (!seen.has(conv.id)) {
                                seen.add(conv.id);
                                merged.push(__assign(__assign({}, conv), { snippet: row.msgText, snippetFromMe: row.msgFromMe }));
                            }
                            else {
                                // Já está na lista (por contato); adiciona snippet se ainda não tem
                                var existing = merged.find(function (m) { return m.id === conv.id; });
                                if (existing && !existing.snippet) {
                                    existing.snippet = row.msgText;
                                    existing.snippetFromMe = row.msgFromMe;
                                }
                            }
                        };
                        for (_a = 0, byMessage_1 = byMessage; _a < byMessage_1.length; _a++) {
                            row = byMessage_1[_a];
                            _loop_2(row);
                        }
                        topResults = merged.slice(0, limit);
                        if (topResults.length === 0)
                            return [2 /*return*/, []];
                        convIds = topResults.map(function (c) { return c.id; });
                        return [4 /*yield*/, db_1.db
                                .select({ conversationId: schema_1.conversationTags.conversationId, tag: schema_1.tags })
                                .from(schema_1.conversationTags)
                                .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.conversationTags.tagId, schema_1.tags.id))
                                .where((0, drizzle_orm_1.inArray)(schema_1.conversationTags.conversationId, convIds))];
                    case 3:
                        allTagRows = _d.sent();
                        tagsByConv = new Map();
                        for (_b = 0, allTagRows_1 = allTagRows; _b < allTagRows_1.length; _b++) {
                            _c = allTagRows_1[_b], conversationId = _c.conversationId, tag = _c.tag;
                            if (!tagsByConv.has(conversationId))
                                tagsByConv.set(conversationId, []);
                            tagsByConv.get(conversationId).push(tag);
                        }
                        return [2 /*return*/, topResults.map(function (c) { return (__assign(__assign({}, c), { tags: tagsByConv.get(c.id) || [] })); })];
                }
            });
        });
    };
    // ============================================
    // RESELLER FUNCTIONS - Sistema de Revenda White-Label
    // ============================================
    /**
     * Cria um novo revendedor
     */
    DatabaseStorage.prototype.createReseller = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.resellers).values(data).returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém revendedor por ID
     */
    DatabaseStorage.prototype.getReseller = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém revendedor pelo ID do usuário
     */
    DatabaseStorage.prototype.getResellerByUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.userId, userId)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém revendedor pelo domínio customizado
     */
    DatabaseStorage.prototype.getResellerByDomain = function (domain) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.customDomain, domain)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém revendedor pelo subdomínio
     */
    DatabaseStorage.prototype.getResellerBySubdomain = function (subdomain) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.subdomain, subdomain)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Atualiza revendedor
     */
    DatabaseStorage.prototype.updateReseller = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellers)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.resellers.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém revendedor por ID
     */
    DatabaseStorage.prototype.getResellerById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Lista todos os revendedores (admin)
     */
    DatabaseStorage.prototype.getAllResellers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allResellers, results, _i, allResellers_1, reseller, user, clientCountResult;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).orderBy((0, drizzle_orm_1.desc)(schema_1.resellers.createdAt))];
                    case 1:
                        allResellers = _b.sent();
                        results = [];
                        _i = 0, allResellers_1 = allResellers;
                        _b.label = 2;
                    case 2:
                        if (!(_i < allResellers_1.length)) return [3 /*break*/, 6];
                        reseller = allResellers_1[_i];
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, reseller.userId)).limit(1)];
                    case 3:
                        user = (_b.sent())[0];
                        return [4 /*yield*/, db_1.db
                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                .from(schema_1.resellerClients)
                                .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.resellerId, reseller.id))];
                    case 4:
                        clientCountResult = _b.sent();
                        results.push(__assign(__assign({}, reseller), { user: user || null, clientCount: Number(((_a = clientCountResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) }));
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 2];
                    case 6: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Verifica se subdomínio está disponível
     */
    DatabaseStorage.prototype.isSubdomainAvailable = function (subdomain) {
        return __awaiter(this, void 0, void 0, function () {
            var existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.subdomain, subdomain)).limit(1)];
                    case 1:
                        existing = (_a.sent())[0];
                        return [2 /*return*/, !existing];
                }
            });
        });
    };
    /**
     * Verifica se domínio está disponível
     */
    DatabaseStorage.prototype.isDomainAvailable = function (domain) {
        return __awaiter(this, void 0, void 0, function () {
            var existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellers).where((0, drizzle_orm_1.eq)(schema_1.resellers.customDomain, domain)).limit(1)];
                    case 1:
                        existing = (_a.sent())[0];
                        return [2 /*return*/, !existing];
                }
            });
        });
    };
    // ============================================
    // RESELLER CLIENTS FUNCTIONS
    // ============================================
    /**
     * Cria um novo cliente do revendedor
     */
    DatabaseStorage.prototype.createResellerClient = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.resellerClients).values(data).returning()];
                    case 1:
                        result = (_a.sent())[0];
                        // Atualizar o reseller_id do usuário
                        return [4 /*yield*/, db_1.db.update(schema_1.users).set({ resellerId: data.resellerId }).where((0, drizzle_orm_1.eq)(schema_1.users.id, data.userId))];
                    case 2:
                        // Atualizar o reseller_id do usuário
                        _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém cliente do revendedor por ID
     */
    DatabaseStorage.prototype.getResellerClient = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellerClients).where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém cliente do revendedor por ID (número)
     */
    DatabaseStorage.prototype.getResellerClientById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellerClients).where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém cliente do revendedor pelo ID do usuário
     */
    DatabaseStorage.prototype.getResellerClientByUserId = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellerClients).where((0, drizzle_orm_1.eq)(schema_1.resellerClients.userId, userId)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Lista clientes de um revendedor
     */
    DatabaseStorage.prototype.getResellerClients = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var clients, results, _i, clients_1, client, user, payments_1, firstPaymentDate, lastPaymentDate, isOverdue, monthsInSystem;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.resellerClients)
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.resellerId, resellerId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.resellerClients.createdAt))];
                    case 1:
                        clients = _a.sent();
                        results = [];
                        _i = 0, clients_1 = clients;
                        _a.label = 2;
                    case 2:
                        if (!(_i < clients_1.length)) return [3 /*break*/, 6];
                        client = clients_1[_i];
                        return [4 /*yield*/, db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, client.userId)).limit(1)];
                    case 3:
                        user = (_a.sent())[0];
                        return [4 /*yield*/, db_1.db
                                .select()
                                .from(schema_1.resellerPayments)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerPayments.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerPayments.resellerClientId, client.id), (0, drizzle_orm_1.eq)(schema_1.resellerPayments.status, 'paid')))
                                .orderBy(schema_1.resellerPayments.paidAt)];
                    case 4:
                        payments_1 = _a.sent();
                        firstPaymentDate = payments_1.length > 0 && payments_1[0].paidAt ? payments_1[0].paidAt : null;
                        lastPaymentDate = payments_1.length > 0 && payments_1[payments_1.length - 1].paidAt ? payments_1[payments_1.length - 1].paidAt : null;
                        isOverdue = !client.isFreeClient &&
                            client.nextPaymentDate !== null &&
                            new Date(client.nextPaymentDate) < new Date();
                        monthsInSystem = payments_1.length;
                        results.push(__assign(__assign({}, client), { user: user || null, firstPaymentDate: firstPaymentDate, lastPaymentDate: lastPaymentDate, isOverdue: isOverdue, monthsInSystem: monthsInSystem }));
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 2];
                    case 6: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Atualiza cliente do revendedor
     */
    DatabaseStorage.prototype.updateResellerClient = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerClients)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Suspende cliente do revendedor
     */
    DatabaseStorage.prototype.suspendResellerClient = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerClients)
                            .set({ status: "suspended", suspendedAt: new Date(), updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Reativa cliente do revendedor
     */
    DatabaseStorage.prototype.reactivateResellerClient = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerClients)
                            .set({ status: "active", suspendedAt: null, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Cancela cliente do revendedor
     */
    DatabaseStorage.prototype.cancelResellerClient = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerClients)
                            .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Conta clientes ativos de um revendedor
     */
    DatabaseStorage.prototype.countActiveResellerClients = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_77 || (templateObject_77 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.resellerClients)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerClients.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerClients.status, "active")))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, Number((result === null || result === void 0 ? void 0 : result.count) || 0)];
                }
            });
        });
    };
    /**
     * Conta clientes gratuitos de um revendedor (máximo 1)
     */
    DatabaseStorage.prototype.countFreeResellerClients = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_78 || (templateObject_78 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.resellerClients)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerClients.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerClients.isFreeClient, true)))];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, Number((result === null || result === void 0 ? void 0 : result.count) || 0)];
                }
            });
        });
    };
    // ============================================
    // RESELLER PAYMENTS FUNCTIONS
    // ============================================
    /**
     * Cria um novo pagamento do revendedor
     */
    DatabaseStorage.prototype.createResellerPayment = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.resellerPayments).values(data).returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém pagamento do revendedor por ID
     */
    DatabaseStorage.prototype.getResellerPayment = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellerPayments).where((0, drizzle_orm_1.eq)(schema_1.resellerPayments.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Lista pagamentos de um revendedor
     */
    DatabaseStorage.prototype.getResellerPayments = function (resellerId_1) {
        return __awaiter(this, arguments, void 0, function (resellerId, limit) {
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                return [2 /*return*/, db_1.db
                        .select()
                        .from(schema_1.resellerPayments)
                        .where((0, drizzle_orm_1.eq)(schema_1.resellerPayments.resellerId, resellerId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.resellerPayments.createdAt))
                        .limit(limit)];
            });
        });
    };
    /**
     * Atualiza pagamento do revendedor
     */
    DatabaseStorage.prototype.updateResellerPayment = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerPayments)
                            .set(data)
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerPayments.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém métricas do revendedor
     */
    DatabaseStorage.prototype.getResellerDashboardMetrics = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            var clientStats, stats, _i, clientStats_1, _a, status_1, count, countNum, totalRevenueResult, startOfMonth, monthlyRevenueResult, reseller, costPerClient, monthlyPrice, monthlyCost, monthlyRevenue;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            status: schema_1.resellerClients.status,
                            count: (0, drizzle_orm_1.sql)(templateObject_79 || (templateObject_79 = __makeTemplateObject(["count(*)"], ["count(*)"]))),
                        })
                            .from(schema_1.resellerClients)
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerClients.resellerId, resellerId))
                            .groupBy(schema_1.resellerClients.status)];
                    case 1:
                        clientStats = _b.sent();
                        stats = {
                            totalClients: 0,
                            activeClients: 0,
                            suspendedClients: 0,
                            cancelledClients: 0,
                        };
                        for (_i = 0, clientStats_1 = clientStats; _i < clientStats_1.length; _i++) {
                            _a = clientStats_1[_i], status_1 = _a.status, count = _a.count;
                            countNum = Number(count);
                            stats.totalClients += countNum;
                            if (status_1 === "active")
                                stats.activeClients = countNum;
                            if (status_1 === "suspended")
                                stats.suspendedClients = countNum;
                            if (status_1 === "cancelled")
                                stats.cancelledClients = countNum;
                        }
                        return [4 /*yield*/, db_1.db
                                .select({ total: (0, drizzle_orm_1.sql)(templateObject_80 || (templateObject_80 = __makeTemplateObject(["COALESCE(SUM(amount), 0)"], ["COALESCE(SUM(amount), 0)"]))) })
                                .from(schema_1.resellerPayments)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerPayments.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerPayments.status, "approved")))];
                    case 2:
                        totalRevenueResult = (_b.sent())[0];
                        startOfMonth = new Date();
                        startOfMonth.setDate(1);
                        startOfMonth.setHours(0, 0, 0, 0);
                        return [4 /*yield*/, db_1.db
                                .select({ total: (0, drizzle_orm_1.sql)(templateObject_81 || (templateObject_81 = __makeTemplateObject(["COALESCE(SUM(amount), 0)"], ["COALESCE(SUM(amount), 0)"]))) })
                                .from(schema_1.resellerPayments)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerPayments.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerPayments.status, "approved"), (0, drizzle_orm_1.gte)(schema_1.resellerPayments.createdAt, startOfMonth)))];
                    case 3:
                        monthlyRevenueResult = (_b.sent())[0];
                        return [4 /*yield*/, this.getReseller(resellerId)];
                    case 4:
                        reseller = _b.sent();
                        costPerClient = Number((reseller === null || reseller === void 0 ? void 0 : reseller.costPerClient) || 49.99);
                        monthlyPrice = Number((reseller === null || reseller === void 0 ? void 0 : reseller.clientMonthlyPrice) || 99.99);
                        monthlyCost = stats.activeClients * costPerClient;
                        monthlyRevenue = stats.activeClients * monthlyPrice;
                        return [2 /*return*/, __assign(__assign({}, stats), { totalRevenue: Number((totalRevenueResult === null || totalRevenueResult === void 0 ? void 0 : totalRevenueResult.total) || 0), monthlyRevenue: monthlyRevenue, monthlyCost: monthlyCost, monthlyProfit: monthlyRevenue - monthlyCost })];
                }
            });
        });
    };
    // ============================================
    // RESELLER INVOICES FUNCTIONS (Flow 2: Reseller -> System)
    // ============================================
    /**
     * Cria uma nova fatura do revendedor para o sistema
     */
    DatabaseStorage.prototype.createResellerInvoice = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.resellerInvoices).values(data).returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém fatura do revendedor por ID
     */
    DatabaseStorage.prototype.getResellerInvoice = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.resellerInvoices).where((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.id, id)).limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Lista faturas de um revendedor
     */
    DatabaseStorage.prototype.getResellerInvoices = function (resellerId_1) {
        return __awaiter(this, arguments, void 0, function (resellerId, limit) {
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                return [2 /*return*/, db_1.db
                        .select()
                        .from(schema_1.resellerInvoices)
                        .where((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.resellerId, resellerId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.resellerInvoices.createdAt))
                        .limit(limit)];
            });
        });
    };
    /**
     * Obtém fatura por mês de referência
     */
    DatabaseStorage.prototype.getResellerInvoiceByMonth = function (resellerId, referenceMonth) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.resellerInvoices)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.resellerId, resellerId), (0, drizzle_orm_1.eq)(schema_1.resellerInvoices.referenceMonth, referenceMonth)))
                            .limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Atualiza fatura do revendedor
     */
    DatabaseStorage.prototype.updateResellerInvoice = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.resellerInvoices)
                            .set(data)
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.id, id))
                            .returning()];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém faturas pendentes ou vencidas de um revendedor
     */
    DatabaseStorage.prototype.getResellerPendingInvoices = function (resellerId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db_1.db
                        .select()
                        .from(schema_1.resellerInvoices)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.resellerId, resellerId), (0, drizzle_orm_1.sql)(templateObject_82 || (templateObject_82 = __makeTemplateObject(["", " IN ('pending', 'overdue')"], ["", " IN ('pending', 'overdue')"])), schema_1.resellerInvoices.status)))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.resellerInvoices.dueDate))];
            });
        });
    };
    /**
     * Cria fatura com itens (transacional)
     */
    DatabaseStorage.prototype.createResellerInvoiceWithItems = function (invoice, items) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var newInvoice, itemsWithId;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .insert(schema_1.resellerInvoices)
                                            .values(invoice)
                                            .returning()];
                                    case 1:
                                        newInvoice = (_a.sent())[0];
                                        if (!(items.length > 0)) return [3 /*break*/, 3];
                                        itemsWithId = items.map(function (item) { return (__assign(__assign({}, item), { invoiceId: newInvoice.id })); });
                                        return [4 /*yield*/, tx.insert(schema_1.resellerInvoiceItems).values(itemsWithId)];
                                    case 2:
                                        _a.sent();
                                        _a.label = 3;
                                    case 3: return [2 /*return*/, newInvoice];
                                }
                            });
                        }); })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Obtém fatura pelo ID do Mercado Pago
     */
    DatabaseStorage.prototype.getResellerInvoiceByMpPaymentId = function (mpPaymentId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.resellerInvoices)
                            .where((0, drizzle_orm_1.eq)(schema_1.resellerInvoices.mpPaymentId, mpPaymentId))
                            .limit(1)];
                    case 1:
                        result = (_a.sent())[0];
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Obtém itens de uma fatura
     */
    DatabaseStorage.prototype.getResellerInvoiceItems = function (invoiceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, db_1.db
                        .select()
                        .from(schema_1.resellerInvoiceItems)
                        .where((0, drizzle_orm_1.eq)(schema_1.resellerInvoiceItems.invoiceId, invoiceId))];
            });
        });
    };
    // ============================================================================
    // SISTEMA DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
    // ============================================================================
    /**
     * Verifica se um usuário está suspenso por violação de políticas
     */
    DatabaseStorage.prototype.isUserSuspended = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select({
                            suspendedAt: schema_1.users.suspendedAt,
                            suspensionReason: schema_1.users.suspensionReason,
                            suspensionType: schema_1.users.suspensionType,
                            refundedAt: schema_1.users.refundedAt,
                            refundAmount: schema_1.users.refundAmount,
                        }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                    case 1:
                        user = (_a.sent())[0];
                        if (!user || !user.suspendedAt) {
                            return [2 /*return*/, { suspended: false }];
                        }
                        return [2 /*return*/, {
                                suspended: true,
                                data: {
                                    reason: user.suspensionReason,
                                    type: user.suspensionType,
                                    suspendedAt: user.suspendedAt,
                                    refundedAt: user.refundedAt,
                                    refundAmount: user.refundAmount ? parseFloat(user.refundAmount) : null,
                                }
                            }];
                }
            });
        });
    };
    /**
     * Suspende um usuário por violação de políticas
     */
    DatabaseStorage.prototype.suspendUser = function (userId, violationType, reason, adminId, evidence, refundAmount) {
        return __awaiter(this, void 0, void 0, function () {
            var now, agentConfig;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = new Date();
                        // 1. Atualizar usuário com status de suspenso
                        return [4 /*yield*/, db_1.db.update(schema_1.users).set({
                                suspendedAt: now,
                                suspensionReason: reason,
                                suspensionType: violationType,
                                refundedAt: refundAmount ? now : null,
                                refundAmount: refundAmount ? refundAmount.toString() : null,
                                updatedAt: now,
                            }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                    case 1:
                        // 1. Atualizar usuário com status de suspenso
                        _a.sent();
                        // 2. Registrar violação na tabela policy_violations
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_83 || (templateObject_83 = __makeTemplateObject(["\n      INSERT INTO policy_violations (user_id, violation_type, description, status, resulted_in_suspension, admin_id, evidence, internal_notes)\n      VALUES (", ", ", ", ", ", 'confirmed', true, ", ", ", ", ", ")\n    "], ["\n      INSERT INTO policy_violations (user_id, violation_type, description, status, resulted_in_suspension, admin_id, evidence, internal_notes)\n      VALUES (", ", ", ", ", ", 'confirmed', true, ", ", ", ", ", ")\n    "])), userId, violationType, reason, adminId || null, JSON.stringify(evidence || []), 'Suspensão aplicada em ' + now.toISOString()))];
                    case 2:
                        // 2. Registrar violação na tabela policy_violations
                        _a.sent();
                        return [4 /*yield*/, db_1.db.select().from(schema_1.aiAgentConfig).where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, userId))];
                    case 3:
                        agentConfig = (_a.sent())[0];
                        if (!agentConfig) return [3 /*break*/, 5];
                        return [4 /*yield*/, db_1.db.update(schema_1.aiAgentConfig).set({ isActive: false }).where((0, drizzle_orm_1.eq)(schema_1.aiAgentConfig.userId, userId))];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        console.log("\uD83D\uDEAB [SUSPENSION] Usu\u00E1rio ".concat(userId, " suspenso por ").concat(violationType, ": ").concat(reason));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Obtém todos os usuários suspensos (para admin)
     */
    DatabaseStorage.prototype.getSuspendedUsers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_84 || (templateObject_84 = __makeTemplateObject(["\n      SELECT \n        u.id,\n        u.email,\n        u.name,\n        u.phone,\n        u.suspended_at as \"suspendedAt\",\n        u.suspension_reason as \"suspensionReason\",\n        u.suspension_type as \"suspensionType\",\n        u.refunded_at as \"refundedAt\",\n        u.refund_amount as \"refundAmount\",\n        pv.description as \"violationDescription\",\n        pv.evidence,\n        pv.created_at as \"violationDate\"\n      FROM users u\n      LEFT JOIN policy_violations pv ON pv.user_id = u.id AND pv.resulted_in_suspension = true\n      WHERE u.suspended_at IS NOT NULL\n      ORDER BY u.suspended_at DESC\n    "], ["\n      SELECT \n        u.id,\n        u.email,\n        u.name,\n        u.phone,\n        u.suspended_at as \"suspendedAt\",\n        u.suspension_reason as \"suspensionReason\",\n        u.suspension_type as \"suspensionType\",\n        u.refunded_at as \"refundedAt\",\n        u.refund_amount as \"refundAmount\",\n        pv.description as \"violationDescription\",\n        pv.evidence,\n        pv.created_at as \"violationDate\"\n      FROM users u\n      LEFT JOIN policy_violations pv ON pv.user_id = u.id AND pv.resulted_in_suspension = true\n      WHERE u.suspended_at IS NOT NULL\n      ORDER BY u.suspended_at DESC\n    "]))))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows];
                }
            });
        });
    };
    /**
     * Remove suspensão de um usuário (para admin reverter se necessário)
     */
    DatabaseStorage.prototype.unsuspendUser = function (userId, adminNote) {
        return __awaiter(this, void 0, void 0, function () {
            var revertNote;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.update(schema_1.users).set({
                            suspendedAt: null,
                            suspensionReason: null,
                            suspensionType: null,
                            updatedAt: new Date(),
                        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                    case 1:
                        _a.sent();
                        revertNote = "\nRevertido: ".concat(adminNote || 'Sem motivo especificado', " em ").concat(new Date().toISOString());
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_85 || (templateObject_85 = __makeTemplateObject(["\n      UPDATE policy_violations\n      SET status = 'dismissed', \n          internal_notes = COALESCE(internal_notes, '') || ", ",\n          updated_at = now()\n      WHERE user_id = ", " AND resulted_in_suspension = true\n    "], ["\n      UPDATE policy_violations\n      SET status = 'dismissed', \n          internal_notes = COALESCE(internal_notes, '') || ", ",\n          updated_at = now()\n      WHERE user_id = ", " AND resulted_in_suspension = true\n    "])), revertNote, userId))];
                    case 2:
                        _a.sent();
                        console.log("\u2705 [SUSPENSION] Suspens\u00E3o removida do usu\u00E1rio ".concat(userId));
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== TEAM MEMBERS ====================
    /**
     * Buscar todos os membros de um dono
     */
    DatabaseStorage.prototype.getTeamMembers = function (ownerId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.teamMembers).where((0, drizzle_orm_1.eq)(schema_1.teamMembers.ownerId, ownerId)).orderBy((0, drizzle_orm_1.desc)(schema_1.teamMembers.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Buscar membro por ID
     */
    DatabaseStorage.prototype.getTeamMember = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var member;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.teamMembers).where((0, drizzle_orm_1.eq)(schema_1.teamMembers.id, id))];
                    case 1:
                        member = (_a.sent())[0];
                        return [2 /*return*/, member];
                }
            });
        });
    };
    /**
     * Buscar membro por email (dentro do mesmo dono)
     */
    DatabaseStorage.prototype.getTeamMemberByEmail = function (ownerId, email) {
        return __awaiter(this, void 0, void 0, function () {
            var member;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.teamMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.teamMembers.ownerId, ownerId), (0, drizzle_orm_1.eq)(schema_1.teamMembers.email, email)))];
                    case 1:
                        member = (_a.sent())[0];
                        return [2 /*return*/, member];
                }
            });
        });
    };
    /**
     * Buscar membro por email (global - para login)
     */
    DatabaseStorage.prototype.getTeamMemberByEmailGlobal = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var member;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.teamMembers).where((0, drizzle_orm_1.eq)(schema_1.teamMembers.email, email))];
                    case 1:
                        member = (_a.sent())[0];
                        return [2 /*return*/, member];
                }
            });
        });
    };
    /**
     * Criar novo membro
     */
    DatabaseStorage.prototype.createTeamMember = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var member;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.teamMembers).values(__assign(__assign({}, data), { createdAt: new Date(), updatedAt: new Date() })).returning()];
                    case 1:
                        member = (_a.sent())[0];
                        return [2 /*return*/, member];
                }
            });
        });
    };
    /**
     * Atualizar membro
     */
    DatabaseStorage.prototype.updateTeamMember = function (id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var member;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.update(schema_1.teamMembers)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.teamMembers.id, id))
                            .returning()];
                    case 1:
                        member = (_a.sent())[0];
                        return [2 /*return*/, member];
                }
            });
        });
    };
    /**
     * Excluir membro
     */
    DatabaseStorage.prototype.deleteTeamMember = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Deletar sessões primeiro
                    return [4 /*yield*/, db_1.db.delete(schema_1.teamMemberSessions).where((0, drizzle_orm_1.eq)(schema_1.teamMemberSessions.memberId, id))];
                    case 1:
                        // Deletar sessões primeiro
                        _a.sent();
                        // Deletar membro
                        return [4 /*yield*/, db_1.db.delete(schema_1.teamMembers).where((0, drizzle_orm_1.eq)(schema_1.teamMembers.id, id))];
                    case 2:
                        // Deletar membro
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== TEAM MEMBER SESSIONS ====================
    /**
     * Criar sessão de membro
     */
    DatabaseStorage.prototype.createTeamMemberSession = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.teamMemberSessions).values(__assign(__assign({}, data), { createdAt: new Date() })).returning()];
                    case 1:
                        session = (_a.sent())[0];
                        return [2 /*return*/, session];
                }
            });
        });
    };
    /**
     * Buscar sessão por token
     */
    DatabaseStorage.prototype.getTeamMemberSession = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.teamMemberSessions).where((0, drizzle_orm_1.eq)(schema_1.teamMemberSessions.token, token))];
                    case 1:
                        session = (_a.sent())[0];
                        return [2 /*return*/, session];
                }
            });
        });
    };
    /**
     * Deletar sessão por token
     */
    DatabaseStorage.prototype.deleteTeamMemberSession = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.teamMemberSessions).where((0, drizzle_orm_1.eq)(schema_1.teamMemberSessions.token, token))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Limpar sessões expiradas
     */
    DatabaseStorage.prototype.cleanExpiredTeamMemberSessions = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.delete(schema_1.teamMemberSessions).where((0, drizzle_orm_1.lte)(schema_1.teamMemberSessions.expiresAt, new Date()))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== AUDIO CONFIG (TTS) ====================
    /**
     * Buscar configuração de áudio do usuário
     */
    DatabaseStorage.prototype.getAudioConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.audioConfig).where((0, drizzle_orm_1.eq)(schema_1.audioConfig.userId, userId))];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Criar configuração de áudio padrão
     * NOTA: Por padrão, TTS começa DESATIVADO - usuário precisa ativar manualmente via toggle
     */
    DatabaseStorage.prototype.createAudioConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.insert(schema_1.audioConfig).values({
                            userId: userId,
                            isEnabled: false, // DESATIVADO por padrão - ativar via toggle
                            voiceType: "female",
                            responseMode: "audio_text",
                            speed: "1.00",
                        }).returning()];
                    case 1:
                        config = (_a.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Atualizar configuração de áudio
     */
    DatabaseStorage.prototype.updateAudioConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, config_1, config;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, this.getAudioConfig(userId)];
                    case 1:
                        existing = _e.sent();
                        if (!!existing) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.insert(schema_1.audioConfig).values({
                                userId: userId,
                                isEnabled: (_a = data.isEnabled) !== null && _a !== void 0 ? _a : false, // DESATIVADO por padrão
                                voiceType: (_b = data.voiceType) !== null && _b !== void 0 ? _b : "female",
                                responseMode: (_c = data.responseMode) !== null && _c !== void 0 ? _c : "audio_text",
                                speed: (_d = data.speed) !== null && _d !== void 0 ? _d : "1.00",
                            }).returning()];
                    case 2:
                        config_1 = (_e.sent())[0];
                        return [2 /*return*/, config_1];
                    case 3: return [4 /*yield*/, db_1.db.update(schema_1.audioConfig)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.eq)(schema_1.audioConfig.userId, userId))
                            .returning()];
                    case 4:
                        config = (_e.sent())[0];
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Buscar contador de mensagens de áudio do dia
     */
    DatabaseStorage.prototype.getAudioMessageCounter = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var today, counter;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        today = new Date().toISOString().split('T')[0];
                        return [4 /*yield*/, db_1.db.select().from(schema_1.audioMessageCounter)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.audioMessageCounter.userId, userId), (0, drizzle_orm_1.eq)(schema_1.audioMessageCounter.date, today)))];
                    case 1:
                        counter = (_a.sent())[0];
                        return [2 /*return*/, counter];
                }
            });
        });
    };
    /**
     * Incrementar contador de mensagens de áudio
     * Retorna o novo contador ou undefined se limite atingido
     */
    DatabaseStorage.prototype.incrementAudioMessageCounter = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var today, counter, newCounter, updated;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        today = new Date().toISOString().split('T')[0];
                        return [4 /*yield*/, this.getAudioMessageCounter(userId)];
                    case 1:
                        counter = _a.sent();
                        if (!!counter) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.insert(schema_1.audioMessageCounter).values({
                                userId: userId,
                                date: today,
                                count: 1,
                                dailyLimit: 30,
                            }).returning()];
                    case 2:
                        newCounter = (_a.sent())[0];
                        return [2 /*return*/, { count: 1, limit: 30, canSend: true }];
                    case 3:
                        // Verificar se pode enviar mais
                        if (counter.count >= counter.dailyLimit) {
                            return [2 /*return*/, { count: counter.count, limit: counter.dailyLimit, canSend: false }];
                        }
                        return [4 /*yield*/, db_1.db.update(schema_1.audioMessageCounter)
                                .set({ count: counter.count + 1, updatedAt: new Date() })
                                .where((0, drizzle_orm_1.eq)(schema_1.audioMessageCounter.id, counter.id))
                                .returning()];
                    case 4:
                        updated = (_a.sent())[0];
                        return [2 /*return*/, { count: updated.count, limit: updated.dailyLimit, canSend: true }];
                }
            });
        });
    };
    /**
     * Verificar se usuário pode enviar mais áudios hoje
     */
    DatabaseStorage.prototype.canSendAudio = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config, counter, remaining;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAudioConfig(userId)];
                    case 1:
                        config = _a.sent();
                        if (!!config) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.createAudioConfig(userId)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        // Se TTS está desabilitado
                        if (config && !config.isEnabled) {
                            return [2 /*return*/, { canSend: false, remaining: 0, limit: 30 }];
                        }
                        return [4 /*yield*/, this.getAudioMessageCounter(userId)];
                    case 4:
                        counter = _a.sent();
                        if (!counter) {
                            return [2 /*return*/, { canSend: true, remaining: 30, limit: 30 }];
                        }
                        remaining = Math.max(0, counter.dailyLimit - counter.count);
                        return [2 /*return*/, { canSend: remaining > 0, remaining: remaining, limit: counter.dailyLimit }];
                }
            });
        });
    };
    // ========================================================================
    // Admin Notification operations
    // ========================================================================
    DatabaseStorage.prototype.getAdminNotificationConfig = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_27;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_86 || (templateObject_86 = __makeTemplateObject(["\n        SELECT * FROM admin_notification_config WHERE admin_id = ", " LIMIT 1\n      "], ["\n        SELECT * FROM admin_notification_config WHERE admin_id = ", " LIMIT 1\n      "])), adminId))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows[0]];
                    case 2:
                        error_27 = _a.sent();
                        console.error('Error getting admin notification config:', error_27);
                        return [2 /*return*/, undefined];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminNotificationConfig = function (adminId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, paymentDays, overdueDays, businessDays, welcomeVariationsArray, welcomeVariationsSQL, currentConfig, disabledTypesByModule, _i, disabledTypesByModule_1, moduleConfig, _a, _b, notificationType, error_28;
            var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
            return __generator(this, function (_2) {
                switch (_2.label) {
                    case 0:
                        _2.trys.push([0, 13, , 14]);
                        return [4 /*yield*/, this.getAdminNotificationConfig(adminId)];
                    case 1:
                        existing = _2.sent();
                        paymentDays = data.paymentReminderDaysBefore || [7, 3, 1];
                        overdueDays = data.overdueReminderDaysAfter || [1, 3, 7, 14];
                        businessDays = data.businessDays || [1, 2, 3, 4, 5];
                        welcomeVariationsArray = [];
                        if (Array.isArray(data.welcomeMessageVariations)) {
                            welcomeVariationsArray = data.welcomeMessageVariations.map(function (v) {
                                return typeof v === 'string' ? v : String(v);
                            }).filter(function (v) { return v && v.trim(); });
                        }
                        welcomeVariationsSQL = welcomeVariationsArray.length > 0
                            ? "ARRAY[".concat(welcomeVariationsArray.map(function (v) { return "'".concat(v.replace(/'/g, "''"), "'"); }).join(','), "]::text[]")
                            : "ARRAY[]::text[]";
                        if (!!existing) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_87 || (templateObject_87 = __makeTemplateObject(["\n          INSERT INTO admin_notification_config (\n            admin_id, \n            payment_reminder_enabled, \n            payment_reminder_days_before,\n            payment_reminder_message_template,\n            payment_reminder_ai_enabled,\n            payment_reminder_ai_prompt,\n            overdue_reminder_enabled,\n            overdue_reminder_days_after,\n            overdue_reminder_message_template,\n            overdue_reminder_ai_enabled,\n            overdue_reminder_ai_prompt,\n            periodic_checkin_enabled,\n            periodic_checkin_min_days,\n            periodic_checkin_max_days,\n            periodic_checkin_message_template,\n            checkin_ai_enabled,\n            checkin_ai_prompt,\n            broadcast_enabled,\n            broadcast_antibot_variation,\n            broadcast_ai_variation,\n            broadcast_min_interval_seconds,\n            broadcast_max_interval_seconds,\n            disconnected_alert_enabled,\n            disconnected_alert_hours,\n            disconnected_alert_message_template,\n            disconnected_ai_enabled,\n            disconnected_ai_prompt,\n            ai_variation_enabled,\n            ai_variation_prompt,\n            business_hours_start,\n            business_hours_end,\n            business_days,\n            respect_business_hours,\n            welcome_message_enabled,\n            welcome_message_variations,\n            welcome_message_ai_enabled,\n            welcome_message_ai_prompt\n          ) VALUES (\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", "\n          )\n        "], ["\n          INSERT INTO admin_notification_config (\n            admin_id, \n            payment_reminder_enabled, \n            payment_reminder_days_before,\n            payment_reminder_message_template,\n            payment_reminder_ai_enabled,\n            payment_reminder_ai_prompt,\n            overdue_reminder_enabled,\n            overdue_reminder_days_after,\n            overdue_reminder_message_template,\n            overdue_reminder_ai_enabled,\n            overdue_reminder_ai_prompt,\n            periodic_checkin_enabled,\n            periodic_checkin_min_days,\n            periodic_checkin_max_days,\n            periodic_checkin_message_template,\n            checkin_ai_enabled,\n            checkin_ai_prompt,\n            broadcast_enabled,\n            broadcast_antibot_variation,\n            broadcast_ai_variation,\n            broadcast_min_interval_seconds,\n            broadcast_max_interval_seconds,\n            disconnected_alert_enabled,\n            disconnected_alert_hours,\n            disconnected_alert_message_template,\n            disconnected_ai_enabled,\n            disconnected_ai_prompt,\n            ai_variation_enabled,\n            ai_variation_prompt,\n            business_hours_start,\n            business_hours_end,\n            business_days,\n            respect_business_hours,\n            welcome_message_enabled,\n            welcome_message_variations,\n            welcome_message_ai_enabled,\n            welcome_message_ai_prompt\n          ) VALUES (\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ARRAY[", "]::integer[],\n            ", ",\n            ", ",\n            ", ",\n            ", ",\n            ", "\n          )\n        "])), adminId, (_c = data.paymentReminderEnabled) !== null && _c !== void 0 ? _c : true, drizzle_orm_1.sql.raw(paymentDays.join(',')), data.paymentReminderMessageTemplate || '', (_d = data.paymentReminderAiEnabled) !== null && _d !== void 0 ? _d : true, data.paymentReminderAiPrompt || 'Reescreva esta mensagem de lembrete de pagamento de forma natural e personalizada.', (_e = data.overdueReminderEnabled) !== null && _e !== void 0 ? _e : true, drizzle_orm_1.sql.raw(overdueDays.join(',')), data.overdueReminderMessageTemplate || '', (_f = data.overdueReminderAiEnabled) !== null && _f !== void 0 ? _f : true, data.overdueReminderAiPrompt || 'Reescreva esta mensagem de cobrança de forma educada e empática.', (_g = data.periodicCheckinEnabled) !== null && _g !== void 0 ? _g : true, (_h = data.periodicCheckinMinDays) !== null && _h !== void 0 ? _h : 7, (_j = data.periodicCheckinMaxDays) !== null && _j !== void 0 ? _j : 15, data.periodicCheckinMessageTemplate || '', (_k = data.checkinAiEnabled) !== null && _k !== void 0 ? _k : true, data.checkinAiPrompt || 'Reescreva esta mensagem de check-in de forma calorosa e natural.', (_l = data.broadcastEnabled) !== null && _l !== void 0 ? _l : true, (_m = data.broadcastAntibotVariation) !== null && _m !== void 0 ? _m : true, (_o = data.broadcastAiVariation) !== null && _o !== void 0 ? _o : true, (_p = data.broadcastMinIntervalSeconds) !== null && _p !== void 0 ? _p : 3, (_q = data.broadcastMaxIntervalSeconds) !== null && _q !== void 0 ? _q : 10, (_r = data.disconnectedAlertEnabled) !== null && _r !== void 0 ? _r : true, (_s = data.disconnectedAlertHours) !== null && _s !== void 0 ? _s : 2, data.disconnectedAlertMessageTemplate || '', (_t = data.disconnectedAiEnabled) !== null && _t !== void 0 ? _t : true, data.disconnectedAiPrompt || 'Reescreva esta mensagem de alerta de desconexão de forma prestativa e profissional.', (_u = data.aiVariationEnabled) !== null && _u !== void 0 ? _u : true, data.aiVariationPrompt || '', data.businessHoursStart || '09:00', data.businessHoursEnd || '18:00', drizzle_orm_1.sql.raw(businessDays.join(',')), (_v = data.respectBusinessHours) !== null && _v !== void 0 ? _v : true, (_w = data.welcomeMessageEnabled) !== null && _w !== void 0 ? _w : true, drizzle_orm_1.sql.raw(welcomeVariationsSQL), (_x = data.welcomeMessageAiEnabled) !== null && _x !== void 0 ? _x : true, data.welcomeMessageAiPrompt || 'Gere uma mensagem de boas-vindas calorosa e profissional para um cliente que acabou de iniciar uma conversa no WhatsApp. Use o nome do cliente se disponível. Seja breve, amigável e mostre disposição para ajudar.'))];
                    case 2:
                        _2.sent();
                        return [3 /*break*/, 5];
                    case 3: 
                    // Para UPDATE, reutilizar welcomeVariationsSQL já construído acima
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_88 || (templateObject_88 = __makeTemplateObject(["\n          UPDATE admin_notification_config SET\n            payment_reminder_enabled = ", ",\n            payment_reminder_days_before = ARRAY[", "]::integer[],\n            payment_reminder_message_template = ", ",\n            payment_reminder_ai_enabled = ", ",\n            payment_reminder_ai_prompt = ", ",\n            overdue_reminder_enabled = ", ",\n            overdue_reminder_days_after = ARRAY[", "]::integer[],\n            overdue_reminder_message_template = ", ",\n            overdue_reminder_ai_enabled = ", ",\n            overdue_reminder_ai_prompt = ", ",\n            periodic_checkin_enabled = ", ",\n            periodic_checkin_min_days = ", ",\n            periodic_checkin_max_days = ", ",\n            periodic_checkin_message_template = ", ",\n            checkin_ai_enabled = ", ",\n            checkin_ai_prompt = ", ",\n            broadcast_enabled = ", ",\n            broadcast_antibot_variation = ", ",\n            broadcast_ai_variation = ", ",\n            broadcast_min_interval_seconds = ", ",\n            broadcast_max_interval_seconds = ", ",\n            disconnected_alert_enabled = ", ",\n            disconnected_alert_hours = ", ",\n            disconnected_alert_message_template = ", ",\n            disconnected_ai_enabled = ", ",\n            disconnected_ai_prompt = ", ",\n            ai_variation_enabled = ", ",\n            ai_variation_prompt = ", ",\n            business_hours_start = ", ",\n            business_hours_end = ", ",\n            business_days = ARRAY[", "]::integer[],\n            respect_business_hours = ", ",\n            welcome_message_enabled = ", ",\n            welcome_message_variations = ", ",\n            welcome_message_ai_enabled = ", ",\n            welcome_message_ai_prompt = ", ",\n            updated_at = now()\n          WHERE admin_id = ", "\n        "], ["\n          UPDATE admin_notification_config SET\n            payment_reminder_enabled = ", ",\n            payment_reminder_days_before = ARRAY[", "]::integer[],\n            payment_reminder_message_template = ", ",\n            payment_reminder_ai_enabled = ", ",\n            payment_reminder_ai_prompt = ", ",\n            overdue_reminder_enabled = ", ",\n            overdue_reminder_days_after = ARRAY[", "]::integer[],\n            overdue_reminder_message_template = ", ",\n            overdue_reminder_ai_enabled = ", ",\n            overdue_reminder_ai_prompt = ", ",\n            periodic_checkin_enabled = ", ",\n            periodic_checkin_min_days = ", ",\n            periodic_checkin_max_days = ", ",\n            periodic_checkin_message_template = ", ",\n            checkin_ai_enabled = ", ",\n            checkin_ai_prompt = ", ",\n            broadcast_enabled = ", ",\n            broadcast_antibot_variation = ", ",\n            broadcast_ai_variation = ", ",\n            broadcast_min_interval_seconds = ", ",\n            broadcast_max_interval_seconds = ", ",\n            disconnected_alert_enabled = ", ",\n            disconnected_alert_hours = ", ",\n            disconnected_alert_message_template = ", ",\n            disconnected_ai_enabled = ", ",\n            disconnected_ai_prompt = ", ",\n            ai_variation_enabled = ", ",\n            ai_variation_prompt = ", ",\n            business_hours_start = ", ",\n            business_hours_end = ", ",\n            business_days = ARRAY[", "]::integer[],\n            respect_business_hours = ", ",\n            welcome_message_enabled = ", ",\n            welcome_message_variations = ", ",\n            welcome_message_ai_enabled = ", ",\n            welcome_message_ai_prompt = ", ",\n            updated_at = now()\n          WHERE admin_id = ", "\n        "])), data.paymentReminderEnabled, drizzle_orm_1.sql.raw(paymentDays.join(',')), data.paymentReminderMessageTemplate, (_y = data.paymentReminderAiEnabled) !== null && _y !== void 0 ? _y : true, data.paymentReminderAiPrompt || '', data.overdueReminderEnabled, drizzle_orm_1.sql.raw(overdueDays.join(',')), data.overdueReminderMessageTemplate, (_z = data.overdueReminderAiEnabled) !== null && _z !== void 0 ? _z : true, data.overdueReminderAiPrompt || '', data.periodicCheckinEnabled, data.periodicCheckinMinDays, data.periodicCheckinMaxDays, data.periodicCheckinMessageTemplate, (_0 = data.checkinAiEnabled) !== null && _0 !== void 0 ? _0 : true, data.checkinAiPrompt || '', data.broadcastEnabled, data.broadcastAntibotVariation, data.broadcastAiVariation, data.broadcastMinIntervalSeconds, data.broadcastMaxIntervalSeconds, data.disconnectedAlertEnabled, data.disconnectedAlertHours, data.disconnectedAlertMessageTemplate, (_1 = data.disconnectedAiEnabled) !== null && _1 !== void 0 ? _1 : true, data.disconnectedAiPrompt || '', data.aiVariationEnabled, data.aiVariationPrompt, data.businessHoursStart, data.businessHoursEnd, drizzle_orm_1.sql.raw(businessDays.join(',')), data.respectBusinessHours, data.welcomeMessageEnabled, drizzle_orm_1.sql.raw(welcomeVariationsSQL), data.welcomeMessageAiEnabled, data.welcomeMessageAiPrompt, adminId))];
                    case 4:
                        // Para UPDATE, reutilizar welcomeVariationsSQL já construído acima
                        _2.sent();
                        _2.label = 5;
                    case 5: return [4 /*yield*/, this.getAdminNotificationConfig(adminId)];
                    case 6:
                        currentConfig = _2.sent();
                        if (!currentConfig) return [3 /*break*/, 12];
                        disabledTypesByModule = [
                            {
                                enabled: currentConfig.payment_reminder_enabled === true,
                                types: ['payment_reminder'],
                                moduleName: 'payment_reminder',
                            },
                            {
                                enabled: currentConfig.overdue_reminder_enabled === true,
                                types: ['overdue_reminder'],
                                moduleName: 'overdue_reminder',
                            },
                            {
                                enabled: currentConfig.periodic_checkin_enabled === true,
                                types: ['checkin', 'periodic_checkin'],
                                moduleName: 'checkin',
                            },
                            {
                                enabled: currentConfig.disconnected_alert_enabled === true,
                                types: ['disconnected', 'disconnected_alert'],
                                moduleName: 'disconnected',
                            },
                        ];
                        _i = 0, disabledTypesByModule_1 = disabledTypesByModule;
                        _2.label = 7;
                    case 7:
                        if (!(_i < disabledTypesByModule_1.length)) return [3 /*break*/, 12];
                        moduleConfig = disabledTypesByModule_1[_i];
                        if (moduleConfig.enabled)
                            return [3 /*break*/, 11];
                        _a = 0, _b = moduleConfig.types;
                        _2.label = 8;
                    case 8:
                        if (!(_a < _b.length)) return [3 /*break*/, 11];
                        notificationType = _b[_a];
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_89 || (templateObject_89 = __makeTemplateObject(["\n              UPDATE scheduled_notifications\n              SET\n                status = 'cancelled',\n                updated_at = NOW(),\n                error_message = COALESCE(\n                  NULLIF(error_message, ''),\n                  ", "\n                )\n              WHERE admin_id = ", "\n                AND status = 'pending'\n                AND notification_type = ", "\n            "], ["\n              UPDATE scheduled_notifications\n              SET\n                status = 'cancelled',\n                updated_at = NOW(),\n                error_message = COALESCE(\n                  NULLIF(error_message, ''),\n                  ", "\n                )\n              WHERE admin_id = ", "\n                AND status = 'pending'\n                AND notification_type = ", "\n            "])), "Cancelado automaticamente: m\u00F3dulo ".concat(moduleConfig.moduleName, " desativado"), adminId, notificationType))];
                    case 9:
                        _2.sent();
                        _2.label = 10;
                    case 10:
                        _a++;
                        return [3 /*break*/, 8];
                    case 11:
                        _i++;
                        return [3 /*break*/, 7];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_28 = _2.sent();
                        console.error('Error updating admin notification config:', error_28);
                        throw error_28;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminBroadcasts = function (adminId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_29;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_90 || (templateObject_90 = __makeTemplateObject(["\n        SELECT * FROM admin_broadcasts \n        WHERE admin_id = ", "\n        ORDER BY created_at DESC\n        LIMIT 50\n      "], ["\n        SELECT * FROM admin_broadcasts \n        WHERE admin_id = ", "\n        ORDER BY created_at DESC\n        LIMIT 50\n      "])), adminId))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows];
                    case 2:
                        error_29 = _a.sent();
                        console.error('Error getting admin broadcasts:', error_29);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getRunningAdminBroadcasts = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_30;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_91 || (templateObject_91 = __makeTemplateObject(["\n        SELECT * FROM admin_broadcasts\n        WHERE status = 'sending'\n        ORDER BY updated_at ASC\n      "], ["\n        SELECT * FROM admin_broadcasts\n        WHERE status = 'sending'\n        ORDER BY updated_at ASC\n      "]))))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_30 = _a.sent();
                        console.error('Error getting running admin broadcasts:', error_30);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getAdminBroadcast = function (adminId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_31;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_92 || (templateObject_92 = __makeTemplateObject(["\n        SELECT * FROM admin_broadcasts \n        WHERE admin_id = ", " AND id = ", "\n        LIMIT 1\n      "], ["\n        SELECT * FROM admin_broadcasts \n        WHERE admin_id = ", " AND id = ", "\n        LIMIT 1\n      "])), adminId, id))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows[0]];
                    case 2:
                        error_31 = _a.sent();
                        console.error('Error getting admin broadcast:', error_31);
                        return [2 /*return*/, undefined];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminBroadcast = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var id, error_32;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = "broadcast_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_93 || (templateObject_93 = __makeTemplateObject(["\n        INSERT INTO admin_broadcasts (\n          id, admin_id, name, message_template, target_type, \n          target_filter, ai_variation, antibot_enabled, status,\n          total_recipients, sent_count, failed_count\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ",\n          ", ", ", ", ", ",\n          ", ", ", ", ", "\n        )\n      "], ["\n        INSERT INTO admin_broadcasts (\n          id, admin_id, name, message_template, target_type, \n          target_filter, ai_variation, antibot_enabled, status,\n          total_recipients, sent_count, failed_count\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ",\n          ", ", ", ", ", ",\n          ", ", ", ", ", "\n        )\n      "])), id, data.adminId, data.name, data.messageTemplate, data.targetType, JSON.stringify(data.targetFilter || {}), data.aiVariation, data.antibotEnabled, data.status, data.totalRecipients, data.sentCount, data.failedCount))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, id];
                    case 2:
                        error_32 = _a.sent();
                        console.error('Error creating admin broadcast:', error_32);
                        throw error_32;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updateAdminBroadcast = function (adminId, id, data) {
        return __awaiter(this, void 0, void 0, function () {
            var error_33;
            var _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 11, , 12]);
                        if (!(data.targetFilter !== undefined || data.totalRecipients !== undefined)) return [3 /*break*/, 2];
                        // Snapshot/materialization update for legacy campaigns
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_94 || (templateObject_94 = __makeTemplateObject(["UPDATE admin_broadcasts SET \n          target_filter = ", ",\n          total_recipients = ", ",\n          updated_at = now()\n          WHERE admin_id = ", " AND id = ", ""], ["UPDATE admin_broadcasts SET \n          target_filter = ", ",\n          total_recipients = ", ",\n          updated_at = now()\n          WHERE admin_id = ", " AND id = ", ""])), JSON.stringify(data.targetFilter || {}), (_a = data.totalRecipients) !== null && _a !== void 0 ? _a : 0, adminId, id))];
                    case 1:
                        // Snapshot/materialization update for legacy campaigns
                        _f.sent();
                        return [3 /*break*/, 10];
                    case 2:
                        if (!(data.status !== undefined && data.completedAt !== undefined)) return [3 /*break*/, 4];
                        // Final completion update (status + counts + completedAt)
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_95 || (templateObject_95 = __makeTemplateObject(["UPDATE admin_broadcasts SET \n          status = ", ", \n          sent_count = ", ", \n          failed_count = ", ", \n          completed_at = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""], ["UPDATE admin_broadcasts SET \n          status = ", ", \n          sent_count = ", ", \n          failed_count = ", ", \n          completed_at = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""])), data.status, (_b = data.sentCount) !== null && _b !== void 0 ? _b : 0, (_c = data.failedCount) !== null && _c !== void 0 ? _c : 0, data.completedAt, adminId, id))];
                    case 3:
                        // Final completion update (status + counts + completedAt)
                        _f.sent();
                        return [3 /*break*/, 10];
                    case 4:
                        if (!(data.status !== undefined && data.startedAt !== undefined)) return [3 /*break*/, 6];
                        // Start update (status + startedAt)
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_96 || (templateObject_96 = __makeTemplateObject(["UPDATE admin_broadcasts SET \n          status = ", ", \n          started_at = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""], ["UPDATE admin_broadcasts SET \n          status = ", ", \n          started_at = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""])), data.status, data.startedAt, adminId, id))];
                    case 5:
                        // Start update (status + startedAt)
                        _f.sent();
                        return [3 /*break*/, 10];
                    case 6:
                        if (!(data.status !== undefined)) return [3 /*break*/, 8];
                        // Status-only update
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_97 || (templateObject_97 = __makeTemplateObject(["UPDATE admin_broadcasts SET \n          status = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""], ["UPDATE admin_broadcasts SET \n          status = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""])), data.status, adminId, id))];
                    case 7:
                        // Status-only update
                        _f.sent();
                        return [3 /*break*/, 10];
                    case 8:
                        if (!(data.sentCount !== undefined || data.failedCount !== undefined)) return [3 /*break*/, 10];
                        // Progress update (counts only)
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_98 || (templateObject_98 = __makeTemplateObject(["UPDATE admin_broadcasts SET \n          sent_count = ", ", \n          failed_count = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""], ["UPDATE admin_broadcasts SET \n          sent_count = ", ", \n          failed_count = ", ", \n          updated_at = now() \n          WHERE admin_id = ", " AND id = ", ""])), (_d = data.sentCount) !== null && _d !== void 0 ? _d : 0, (_e = data.failedCount) !== null && _e !== void 0 ? _e : 0, adminId, id))];
                    case 9:
                        // Progress update (counts only)
                        _f.sent();
                        _f.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        error_33 = _f.sent();
                        console.error('Error updating admin broadcast:', error_33);
                        throw error_33;
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.cancelAdminBroadcast = function (adminId, id) {
        return __awaiter(this, void 0, void 0, function () {
            var error_34;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_99 || (templateObject_99 = __makeTemplateObject(["\n        UPDATE admin_broadcasts \n        SET status = 'cancelled', updated_at = now()\n        WHERE admin_id = ", " AND id = ", "\n      "], ["\n        UPDATE admin_broadcasts \n        SET status = 'cancelled', updated_at = now()\n        WHERE admin_id = ", " AND id = ", "\n      "])), adminId, id))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_34 = _a.sent();
                        console.error('Error cancelling admin broadcast:', error_34);
                        throw error_34;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createAdminNotificationLog = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var id, error_35;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = "log_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_100 || (templateObject_100 = __makeTemplateObject(["\n        INSERT INTO admin_notification_logs (\n          id, admin_id, user_id, notification_type,\n          recipient_phone, recipient_name, message_sent,\n          message_original, status, metadata\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ", ", ",\n          ", ", ", ",\n          ", "\n        )\n      "], ["\n        INSERT INTO admin_notification_logs (\n          id, admin_id, user_id, notification_type,\n          recipient_phone, recipient_name, message_sent,\n          message_original, status, metadata\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ", ", ",\n          ", ", ", ",\n          ", "\n        )\n      "])), id, data.adminId, data.userId, data.notificationType, data.recipientPhone, data.recipientName, data.messageSent, data.messageOriginal, data.status || 'pending', JSON.stringify(data.metadata || {})))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, id];
                    case 2:
                        error_35 = _a.sent();
                        console.error('Error creating admin notification log:', error_35);
                        throw error_35;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // BROADCAST MESSAGE LOGS
    // ============================================================
    DatabaseStorage.prototype.ensureBroadcastMessagesTable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_36;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_101 || (templateObject_101 = __makeTemplateObject(["\n        CREATE TABLE IF NOT EXISTS admin_broadcast_messages (\n          id TEXT PRIMARY KEY,\n          broadcast_id TEXT NOT NULL,\n          admin_id TEXT NOT NULL,\n          user_id TEXT,\n          recipient_phone TEXT NOT NULL,\n          recipient_name TEXT NOT NULL DEFAULT 'Cliente',\n          message_original TEXT,\n          message_sent TEXT NOT NULL,\n          ai_varied BOOLEAN DEFAULT false,\n          status TEXT DEFAULT 'sent',\n          error_message TEXT,\n          sent_at TIMESTAMP DEFAULT now()\n        )\n      "], ["\n        CREATE TABLE IF NOT EXISTS admin_broadcast_messages (\n          id TEXT PRIMARY KEY,\n          broadcast_id TEXT NOT NULL,\n          admin_id TEXT NOT NULL,\n          user_id TEXT,\n          recipient_phone TEXT NOT NULL,\n          recipient_name TEXT NOT NULL DEFAULT 'Cliente',\n          message_original TEXT,\n          message_sent TEXT NOT NULL,\n          ai_varied BOOLEAN DEFAULT false,\n          status TEXT DEFAULT 'sent',\n          error_message TEXT,\n          sent_at TIMESTAMP DEFAULT now()\n        )\n      "]))))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_102 || (templateObject_102 = __makeTemplateObject(["\n        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id \n        ON admin_broadcast_messages(broadcast_id)\n      "], ["\n        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id \n        ON admin_broadcast_messages(broadcast_id)\n      "]))))];
                    case 2:
                        _a.sent();
                        console.log('✅ [DB] Tabela admin_broadcast_messages garantida');
                        return [3 /*break*/, 4];
                    case 3:
                        error_36 = _a.sent();
                        console.error('Error ensuring broadcast_messages table:', error_36);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.createBroadcastMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var id, error_37;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        id = "bm_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_103 || (templateObject_103 = __makeTemplateObject(["\n        INSERT INTO admin_broadcast_messages (\n          id, broadcast_id, admin_id, user_id,\n          recipient_phone, recipient_name,\n          message_original, message_sent,\n          ai_varied, status, error_message, sent_at\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ",\n          ", ", ", ",\n          ", ", ", ", ", ", now()\n        )\n      "], ["\n        INSERT INTO admin_broadcast_messages (\n          id, broadcast_id, admin_id, user_id,\n          recipient_phone, recipient_name,\n          message_original, message_sent,\n          ai_varied, status, error_message, sent_at\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", ", ",\n          ", ", ", ",\n          ", ", ", ", ", ", now()\n        )\n      "])), id, data.broadcastId, data.adminId, data.userId || null, data.recipientPhone, data.recipientName, data.messageOriginal, data.messageSent, data.aiVaried, data.status, data.errorMessage || null))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, id];
                    case 2:
                        error_37 = _a.sent();
                        console.error('Error creating broadcast message log:', error_37);
                        return [2 /*return*/, ''];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getBroadcastMessages = function (broadcastId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_38;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_104 || (templateObject_104 = __makeTemplateObject(["\n        SELECT * FROM admin_broadcast_messages \n        WHERE broadcast_id = ", "\n        ORDER BY sent_at ASC\n      "], ["\n        SELECT * FROM admin_broadcast_messages \n        WHERE broadcast_id = ", "\n        ORDER BY sent_at ASC\n      "])), broadcastId))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_38 = _a.sent();
                        console.error('Error getting broadcast messages:', error_38);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // FOLLOW-UP PARA NÃO PAGANTES
    // ============================================================
    /**
     * Busca configuração de follow-up para não pagantes
     */
    DatabaseStorage.prototype.getNotapayerFollowupConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_39;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_105 || (templateObject_105 = __makeTemplateObject(["\n        SELECT * FROM followup_configs WHERE id = 1 LIMIT 1\n      "], ["\n        SELECT * FROM followup_configs WHERE id = 1 LIMIT 1\n      "]))))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows[0]];
                    case 2:
                        error_39 = _a.sent();
                        console.error('Error getting notapayer followup config:', error_39);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Atualiza configuração de follow-up para não pagantes
     */
    DatabaseStorage.prototype.updateNotapayerFollowupConfig = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, error_40;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
            return __generator(this, function (_s) {
                switch (_s.label) {
                    case 0:
                        _s.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, this.getNotapayerFollowupConfig()];
                    case 1:
                        existing = _s.sent();
                        if (!!existing) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_106 || (templateObject_106 = __makeTemplateObject(["\n          INSERT INTO followup_configs (\n            id, is_enabled, active_days, max_attempts,\n            message_template, tone, use_emojis, active_days_start, active_days_end\n          ) VALUES (\n            1, ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", "\n          )\n        "], ["\n          INSERT INTO followup_configs (\n            id, is_enabled, active_days, max_attempts,\n            message_template, tone, use_emojis, active_days_start, active_days_end\n          ) VALUES (\n            1, ", ", ", ", ", ",\n            ", ", ", ",\n            ", ", ", ", ", "\n          )\n        "])), (_a = data.isEnabled) !== null && _a !== void 0 ? _a : false, (_b = data.activeDays) !== null && _b !== void 0 ? _b : 3, (_c = data.maxAttempts) !== null && _c !== void 0 ? _c : 3, (_d = data.messageTemplate) !== null && _d !== void 0 ? _d : 'Olá! Seu plano expirou. Quer renovar?', (_e = data.tone) !== null && _e !== void 0 ? _e : 'friendly', (_f = data.useEmojis) !== null && _f !== void 0 ? _f : true, (_g = data.activeDaysStart) !== null && _g !== void 0 ? _g : 1, (_h = data.activeDaysEnd) !== null && _h !== void 0 ? _h : 7))];
                    case 2:
                        _s.sent();
                        return [2 /*return*/, data];
                    case 3: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_107 || (templateObject_107 = __makeTemplateObject(["\n        UPDATE followup_configs SET\n          is_enabled = ", ",\n          active_days = ", ",\n          max_attempts = ", ",\n          message_template = ", ",\n          tone = ", ",\n          use_emojis = ", ",\n          active_days_start = ", ",\n          active_days_end = ", ",\n          updated_at = NOW()\n        WHERE id = 1\n      "], ["\n        UPDATE followup_configs SET\n          is_enabled = ", ",\n          active_days = ", ",\n          max_attempts = ", ",\n          message_template = ", ",\n          tone = ", ",\n          use_emojis = ", ",\n          active_days_start = ", ",\n          active_days_end = ", ",\n          updated_at = NOW()\n        WHERE id = 1\n      "])), (_j = data.isEnabled) !== null && _j !== void 0 ? _j : existing.is_enabled, (_k = data.activeDays) !== null && _k !== void 0 ? _k : existing.active_days, (_l = data.maxAttempts) !== null && _l !== void 0 ? _l : existing.max_attempts, (_m = data.messageTemplate) !== null && _m !== void 0 ? _m : existing.message_template, (_o = data.tone) !== null && _o !== void 0 ? _o : existing.tone, (_p = data.useEmojis) !== null && _p !== void 0 ? _p : existing.use_emojis, (_q = data.activeDaysStart) !== null && _q !== void 0 ? _q : existing.active_days_start, (_r = data.activeDaysEnd) !== null && _r !== void 0 ? _r : existing.active_days_end))];
                    case 4:
                        _s.sent();
                        return [2 /*return*/, data];
                    case 5:
                        error_40 = _s.sent();
                        console.error('Error updating notapayer followup config:', error_40);
                        throw error_40;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Busca tentativas de follow-up para um usuário
     */
    DatabaseStorage.prototype.getNotapayerFollowupAttempts = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_41;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_108 || (templateObject_108 = __makeTemplateObject(["\n        SELECT * FROM followup_attempts\n        WHERE user_id = ", "\n        ORDER BY sent_at DESC\n        LIMIT 20\n      "], ["\n        SELECT * FROM followup_attempts\n        WHERE user_id = ", "\n        ORDER BY sent_at DESC\n        LIMIT 20\n      "])), userId))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_41 = _a.sent();
                        console.error('Error getting notapayer followup attempts:', error_41);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Busca histórico completo de follow-ups
     */
    DatabaseStorage.prototype.getNotapayerFollowupHistory = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var result, error_42;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_109 || (templateObject_109 = __makeTemplateObject(["\n        SELECT * FROM followup_attempts\n        ORDER BY sent_at DESC\n        LIMIT ", "\n      "], ["\n        SELECT * FROM followup_attempts\n        ORDER BY sent_at DESC\n        LIMIT ", "\n      "])), limit))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_42 = _a.sent();
                        console.error('Error getting notapayer followup history:', error_42);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cria registro de tentativa de follow-up
     */
    DatabaseStorage.prototype.createNotapayerFollowupAttempt = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var error_43;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_110 || (templateObject_110 = __makeTemplateObject(["\n        INSERT INTO followup_attempts (user_id, subscription_id, message, sent_at, status)\n        VALUES (", ", ", ", ", ", ", ", ", ")\n      "], ["\n        INSERT INTO followup_attempts (user_id, subscription_id, message, sent_at, status)\n        VALUES (", ", ", ", ", ", ", ", ", ")\n      "])), data.userId, data.subscriptionId, data.message, data.sentAt.toISOString(), data.status))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_43 = _a.sent();
                        console.error('Error creating notapayer followup attempt:', error_43);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Lista não pagantes elegíveis para follow-up
     */
    DatabaseStorage.prototype.getNotapayerFollowupList = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var now_1, activeDaysStart_1, activeDaysEnd_1, result, subscriptions_1, eligible, error_44;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        now_1 = new Date();
                        activeDaysStart_1 = config.active_days_start || 1;
                        activeDaysEnd_1 = config.active_days_end || 7;
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_111 || (templateObject_111 = __makeTemplateObject(["\n        SELECT\n          s.id as subscription_id,\n          s.user_id,\n          u.name as user_name,\n          u.email as user_email,\n          u.whatsapp_number as phone,\n          p.name as plan_name,\n          p.price as plan_price,\n          s.expires_at as expires_at,\n          s.cancelled_at as cancelled_at\n        FROM subscriptions s\n        JOIN users u ON u.id = s.user_id\n        JOIN plans p ON p.id = s.plan_id\n        WHERE s.cancelled_at IS NULL\n          AND s.expires_at <= ", "\n          AND s.status = 'expired'\n        ORDER BY s.expires_at DESC\n      "], ["\n        SELECT\n          s.id as subscription_id,\n          s.user_id,\n          u.name as user_name,\n          u.email as user_email,\n          u.whatsapp_number as phone,\n          p.name as plan_name,\n          p.price as plan_price,\n          s.expires_at as expires_at,\n          s.cancelled_at as cancelled_at\n        FROM subscriptions s\n        JOIN users u ON u.id = s.user_id\n        JOIN plans p ON p.id = s.plan_id\n        WHERE s.cancelled_at IS NULL\n          AND s.expires_at <= ", "\n          AND s.status = 'expired'\n        ORDER BY s.expires_at DESC\n      "])), now_1))];
                    case 1:
                        result = _a.sent();
                        subscriptions_1 = result.rows || [];
                        eligible = subscriptions_1.filter(function (sub) {
                            var daysSinceExpiry = Math.floor((now_1.getTime() - new Date(sub.expires_at).getTime()) / (1000 * 60 * 60 * 24));
                            return daysSinceExpiry >= activeDaysStart_1 && daysSinceExpiry <= activeDaysEnd_1;
                        });
                        return [4 /*yield*/, Promise.all(eligible.map(function (sub) { return __awaiter(_this, void 0, void 0, function () {
                                var attempts;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getNotapayerFollowupAttempts(sub.user_id)];
                                        case 1:
                                            attempts = _a.sent();
                                            return [2 /*return*/, __assign(__assign({}, sub), { daysSinceExpiry: Math.floor((now_1.getTime() - new Date(sub.expires_at).getTime()) / (1000 * 60 * 60 * 24)), attempts: attempts.length, lastAttempt: attempts[0] })];
                                    }
                                });
                            }); }))];
                    case 2: 
                    // Adicionar contagem de tentativas
                    return [2 /*return*/, _a.sent()];
                    case 3:
                        error_44 = _a.sent();
                        console.error('Error getting notapayer followup list:', error_44);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // FOLLOW-UP CONFIGURATION (GLOBAL)
    // ============================================================
    /**
     * Get global follow-up configuration
     * GET /api/followup/config
     */
    DatabaseStorage.prototype.getFollowupConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_45;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_112 || (templateObject_112 = __makeTemplateObject(["\n        SELECT * FROM followup_configs WHERE id = 'global'\n      "], ["\n        SELECT * FROM followup_configs WHERE id = 'global'\n      "]))))];
                    case 1:
                        result = _a.sent();
                        if (result.rows && result.rows.length > 0) {
                            return [2 /*return*/, result.rows[0]];
                        }
                        return [2 /*return*/, null];
                    case 2:
                        error_45 = _a.sent();
                        console.error('Error getting followup config:', error_45);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update global follow-up configuration
     * PUT /api/followup/config
     */
    DatabaseStorage.prototype.updateFollowupConfig = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, error_46;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
            return __generator(this, function (_0) {
                switch (_0.label) {
                    case 0:
                        _0.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, this.getFollowupConfig()];
                    case 1:
                        existing = _0.sent();
                        if (!!existing) return [3 /*break*/, 3];
                        // Create new config
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_113 || (templateObject_113 = __makeTemplateObject(["\n          INSERT INTO followup_configs (\n            id, is_enabled, max_attempts, intervals_minutes,\n            infinite_loop, infinite_loop_min_days, infinite_loop_max_days,\n            respect_business_hours, business_hours_start, business_hours_end,\n            business_days, use_emojis, tone\n          ) VALUES (\n            'global', ", ", ", ",\n            ", ",\n            ", ", ", ", ", ",\n            ", ", ", ", ", ",\n            ", ",\n            ", ", ", "\n          )\n        "], ["\n          INSERT INTO followup_configs (\n            id, is_enabled, max_attempts, intervals_minutes,\n            infinite_loop, infinite_loop_min_days, infinite_loop_max_days,\n            respect_business_hours, business_hours_start, business_hours_end,\n            business_days, use_emojis, tone\n          ) VALUES (\n            'global', ", ", ", ",\n            ", ",\n            ", ", ", ", ", ",\n            ", ", ", ", ", ",\n            ", ",\n            ", ", ", "\n          )\n        "])), (_a = data.isEnabled) !== null && _a !== void 0 ? _a : true, (_b = data.maxAttempts) !== null && _b !== void 0 ? _b : 8, JSON.stringify((_c = data.intervalsMinutes) !== null && _c !== void 0 ? _c : [10, 30, 180, 1440]), (_d = data.infiniteLoop) !== null && _d !== void 0 ? _d : true, (_e = data.infiniteLoopMinDays) !== null && _e !== void 0 ? _e : 15, (_f = data.infiniteLoopMaxDays) !== null && _f !== void 0 ? _f : 30, (_g = data.respectBusinessHours) !== null && _g !== void 0 ? _g : true, (_h = data.businessHoursStart) !== null && _h !== void 0 ? _h : '09:00', (_j = data.businessHoursEnd) !== null && _j !== void 0 ? _j : '18:00', JSON.stringify((_k = data.businessDays) !== null && _k !== void 0 ? _k : [1, 2, 3, 4, 5]), (_l = data.useEmojis) !== null && _l !== void 0 ? _l : true, (_m = data.tone) !== null && _m !== void 0 ? _m : 'friendly'))];
                    case 2:
                        // Create new config
                        _0.sent();
                        return [2 /*return*/, data];
                    case 3: 
                    // Update existing config
                    return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_114 || (templateObject_114 = __makeTemplateObject(["\n        UPDATE followup_configs SET\n          is_enabled = ", ",\n          max_attempts = ", ",\n          intervals_minutes = ", ",\n          infinite_loop = ", ",\n          infinite_loop_min_days = ", ",\n          infinite_loop_max_days = ", ",\n          respect_business_hours = ", ",\n          business_hours_start = ", ",\n          business_hours_end = ", ",\n          business_days = ", ",\n          use_emojis = ", ",\n          tone = ", ",\n          updated_at = NOW()\n        WHERE id = 'global'\n      "], ["\n        UPDATE followup_configs SET\n          is_enabled = ", ",\n          max_attempts = ", ",\n          intervals_minutes = ", ",\n          infinite_loop = ", ",\n          infinite_loop_min_days = ", ",\n          infinite_loop_max_days = ", ",\n          respect_business_hours = ", ",\n          business_hours_start = ", ",\n          business_hours_end = ", ",\n          business_days = ", ",\n          use_emojis = ", ",\n          tone = ", ",\n          updated_at = NOW()\n        WHERE id = 'global'\n      "])), (_o = data.isEnabled) !== null && _o !== void 0 ? _o : existing.is_enabled, (_p = data.maxAttempts) !== null && _p !== void 0 ? _p : existing.max_attempts, JSON.stringify((_q = data.intervalsMinutes) !== null && _q !== void 0 ? _q : existing.intervals_minutes), (_r = data.infiniteLoop) !== null && _r !== void 0 ? _r : existing.infinite_loop, (_s = data.infiniteLoopMinDays) !== null && _s !== void 0 ? _s : existing.infinite_loop_min_days, (_t = data.infiniteLoopMaxDays) !== null && _t !== void 0 ? _t : existing.infinite_loop_max_days, (_u = data.respectBusinessHours) !== null && _u !== void 0 ? _u : existing.respect_business_hours, (_v = data.businessHoursStart) !== null && _v !== void 0 ? _v : existing.business_hours_start, (_w = data.businessHoursEnd) !== null && _w !== void 0 ? _w : existing.business_hours_end, JSON.stringify((_x = data.businessDays) !== null && _x !== void 0 ? _x : existing.business_days), (_y = data.useEmojis) !== null && _y !== void 0 ? _y : existing.use_emojis, (_z = data.tone) !== null && _z !== void 0 ? _z : existing.tone))];
                    case 4:
                        // Update existing config
                        _0.sent();
                        return [2 /*return*/, data];
                    case 5:
                        error_46 = _0.sent();
                        console.error('Error updating followup config:', error_46);
                        throw error_46;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get follow-up history logs
     * GET /api/followup/logs
     */
    DatabaseStorage.prototype.getFollowupLogs = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var result, error_47;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_115 || (templateObject_115 = __makeTemplateObject(["\n        SELECT * FROM followup_logs\n        ORDER BY executed_at DESC\n        LIMIT ", "\n      "], ["\n        SELECT * FROM followup_logs\n        ORDER BY executed_at DESC\n        LIMIT ", "\n      "])), limit))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_47 = _a.sent();
                        console.error('Error getting followup logs:', error_47);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get follow-up pending events
     * GET /api/followup/pending
     */
    DatabaseStorage.prototype.getFollowupPendingEvents = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_48;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_116 || (templateObject_116 = __makeTemplateObject(["\n        SELECT\n          a.id,\n          a.contact_number,\n          a.contact_name,\n          a.followup_stage,\n          a.next_followup_at,\n          a.followup_active\n        FROM admin_conversations a\n        WHERE a.followup_active = true\n          AND a.next_followup_at <= (NOW() AT TIME ZONE 'America/Sao_Paulo')\n        ORDER BY a.next_followup_at ASC\n        LIMIT 50\n      "], ["\n        SELECT\n          a.id,\n          a.contact_number,\n          a.contact_name,\n          a.followup_stage,\n          a.next_followup_at,\n          a.followup_active\n        FROM admin_conversations a\n        WHERE a.followup_active = true\n          AND a.next_followup_at <= (NOW() AT TIME ZONE 'America/Sao_Paulo')\n        ORDER BY a.next_followup_at ASC\n        LIMIT 50\n      "]))))];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows || []];
                    case 2:
                        error_48 = _a.sent();
                        console.error('Error getting followup pending events:', error_48);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get follow-up statistics
     * GET /api/followup/stats
     */
    DatabaseStorage.prototype.getFollowupStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, oneDayAgo, result, row, error_49;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        now = new Date();
                        oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_117 || (templateObject_117 = __makeTemplateObject(["\n        SELECT\n          COUNT(*) FILTER (WHERE status = 'sent') as total_sent,\n          COUNT(*) FILTER (WHERE status = 'failed') as total_failed,\n          COUNT(*) FILTER (WHERE status = 'cancelled') as total_cancelled,\n          COUNT(*) FILTER (WHERE status = 'skipped') as total_skipped,\n          COUNT(*) FILTER (WHERE status = 'pending') as pending,\n          COUNT(*) FILTER (WHERE DATE(executed_at) = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')) as scheduled_today\n        FROM followup_logs\n        WHERE executed_at >= ", "\n      "], ["\n        SELECT\n          COUNT(*) FILTER (WHERE status = 'sent') as total_sent,\n          COUNT(*) FILTER (WHERE status = 'failed') as total_failed,\n          COUNT(*) FILTER (WHERE status = 'cancelled') as total_cancelled,\n          COUNT(*) FILTER (WHERE status = 'skipped') as total_skipped,\n          COUNT(*) FILTER (WHERE status = 'pending') as pending,\n          COUNT(*) FILTER (WHERE DATE(executed_at) = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')) as scheduled_today\n        FROM followup_logs\n        WHERE executed_at >= ", "\n      "])), oneDayAgo.toISOString()))];
                    case 1:
                        result = _a.sent();
                        row = result.rows[0];
                        return [2 /*return*/, {
                                totalSent: row.total_sent || 0,
                                totalFailed: row.total_failed || 0,
                                totalCancelled: row.total_cancelled || 0,
                                totalSkipped: row.total_skipped || 0,
                                pending: row.pending || 0,
                                scheduledToday: row.scheduled_today || 0,
                            }];
                    case 2:
                        error_49 = _a.sent();
                        console.error('Error getting followup stats:', error_49);
                        return [2 /*return*/, {
                                totalSent: 0,
                                totalFailed: 0,
                                totalCancelled: 0,
                                totalSkipped: 0,
                                pending: 0,
                                scheduledToday: 0,
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // PENDING AI RESPONSES - Persistent Timers
    // ============================================================
    DatabaseStorage.prototype.savePendingAIResponse = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var error_50;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_118 || (templateObject_118 = __makeTemplateObject(["\n        INSERT INTO pending_ai_responses (\n          conversation_id, user_id, contact_number, jid_suffix,\n          messages, scheduled_at, execute_at, status\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", NOW(), ", ", 'pending'\n        )\n        ON CONFLICT (conversation_id) DO UPDATE SET\n          messages = ", ",\n          execute_at = ", ",\n          status = 'pending',\n          updated_at = NOW()\n      "], ["\n        INSERT INTO pending_ai_responses (\n          conversation_id, user_id, contact_number, jid_suffix,\n          messages, scheduled_at, execute_at, status\n        ) VALUES (\n          ", ", ", ", ", ", ", ",\n          ", ", NOW(), ", ", 'pending'\n        )\n        ON CONFLICT (conversation_id) DO UPDATE SET\n          messages = ", ",\n          execute_at = ", ",\n          status = 'pending',\n          updated_at = NOW()\n      "])), data.conversationId, data.userId, data.contactNumber, data.jidSuffix, JSON.stringify(data.messages), data.executeAt.toISOString(), JSON.stringify(data.messages), data.executeAt.toISOString()))];
                    case 1:
                        _a.sent();
                        console.log("\uD83D\uDCBE [PERSISTENT TIMER] Salvo para ".concat(data.contactNumber, " - executa \u00E0s ").concat(data.executeAt.toISOString()));
                        return [3 /*break*/, 3];
                    case 2:
                        error_50 = _a.sent();
                        console.error('Error saving pending AI response:', error_50);
                        throw error_50;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPendingAIResponse = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, row, error_51;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_119 || (templateObject_119 = __makeTemplateObject(["\n        SELECT id, conversation_id, user_id, contact_number, jid_suffix,\n               messages, execute_at, status\n        FROM pending_ai_responses\n        WHERE conversation_id = ", " AND status = 'pending'\n      "], ["\n        SELECT id, conversation_id, user_id, contact_number, jid_suffix,\n               messages, execute_at, status\n        FROM pending_ai_responses\n        WHERE conversation_id = ", " AND status = 'pending'\n      "])), conversationId))];
                    case 1:
                        result = _a.sent();
                        if (result.rows && result.rows.length > 0) {
                            row = result.rows[0];
                            return [2 /*return*/, {
                                    id: row.id,
                                    conversationId: row.conversation_id,
                                    userId: row.user_id,
                                    contactNumber: row.contact_number,
                                    jidSuffix: row.jid_suffix,
                                    messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
                                    executeAt: new Date(row.execute_at),
                                    status: row.status
                                }];
                        }
                        return [2 /*return*/, null];
                    case 2:
                        error_51 = _a.sent();
                        console.error('Error getting pending AI response:', error_51);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.updatePendingAIResponseMessages = function (conversationId, messages, executeAt) {
        return __awaiter(this, void 0, void 0, function () {
            var error_52;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_120 || (templateObject_120 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET messages = ", ",\n            execute_at = ", ",\n            updated_at = NOW()\n        WHERE conversation_id = ", " AND status = 'pending'\n      "], ["\n        UPDATE pending_ai_responses\n        SET messages = ", ",\n            execute_at = ", ",\n            updated_at = NOW()\n        WHERE conversation_id = ", " AND status = 'pending'\n      "])), JSON.stringify(messages), executeAt.toISOString(), conversationId))];
                    case 1:
                        _a.sent();
                        console.log("\uD83D\uDCDD [PERSISTENT TIMER] Atualizado para conversation ".concat(conversationId, " - ").concat(messages.length, " msgs"));
                        return [3 /*break*/, 3];
                    case 2:
                        error_52 = _a.sent();
                        console.error('Error updating pending AI response messages:', error_52);
                        throw error_52;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.deletePendingAIResponse = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var error_53;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_121 || (templateObject_121 = __makeTemplateObject(["\n        DELETE FROM pending_ai_responses\n        WHERE conversation_id = ", "\n      "], ["\n        DELETE FROM pending_ai_responses\n        WHERE conversation_id = ", "\n      "])), conversationId))];
                    case 1:
                        _a.sent();
                        console.log("\uD83D\uDDD1\uFE0F [PERSISTENT TIMER] Removido para conversation ".concat(conversationId));
                        return [3 /*break*/, 3];
                    case 2:
                        error_53 = _a.sent();
                        console.error('Error deleting pending AI response:', error_53);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getPendingAIResponsesForRestore = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_54;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_122 || (templateObject_122 = __makeTemplateObject(["\n        SELECT \n          p.id,\n          p.conversation_id,\n          p.user_id,\n          c.connection_id,\n          p.contact_number,\n          p.jid_suffix,\n          p.messages,\n          p.execute_at,\n          p.scheduled_at\n        FROM pending_ai_responses p\n        LEFT JOIN conversations c ON c.id = p.conversation_id\n        WHERE p.status = 'pending'\n        ORDER BY p.execute_at ASC\n        LIMIT 200\n      "], ["\n        SELECT \n          p.id,\n          p.conversation_id,\n          p.user_id,\n          c.connection_id,\n          p.contact_number,\n          p.jid_suffix,\n          p.messages,\n          p.execute_at,\n          p.scheduled_at\n        FROM pending_ai_responses p\n        LEFT JOIN conversations c ON c.id = p.conversation_id\n        WHERE p.status = 'pending'\n        ORDER BY p.execute_at ASC\n        LIMIT 200\n      "]))))];
                    case 1:
                        result = _a.sent();
                        if (result.rows && result.rows.length > 0) {
                            return [2 /*return*/, result.rows.map(function (row) { return ({
                                    id: row.id,
                                    conversationId: row.conversation_id,
                                    userId: row.user_id,
                                    connectionId: row.connection_id || undefined,
                                    contactNumber: row.contact_number,
                                    jidSuffix: row.jid_suffix,
                                    messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
                                    executeAt: new Date(row.execute_at),
                                    scheduledAt: new Date(row.scheduled_at)
                                }); })];
                        }
                        return [2 /*return*/, []];
                    case 2:
                        error_54 = _a.sent();
                        console.error('Error getting pending AI responses for restore:', error_54);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.markPendingAIResponseCompleted = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var error_55;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_123 || (templateObject_123 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET status = 'completed',\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "], ["\n        UPDATE pending_ai_responses\n        SET status = 'completed',\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "])), conversationId))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_55 = _a.sent();
                        console.error('Error marking pending AI response as completed:', error_55);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.markPendingAIResponseFailed = function (conversationId, reason, lastError) {
        return __awaiter(this, void 0, void 0, function () {
            var error_56;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log("\u26A0\uFE0F [DB] Marcando timer como FAILED: ".concat(conversationId, " - Raz\u00E3o: ").concat(reason));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_124 || (templateObject_124 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET status = 'failed',\n            failure_reason = ", ",\n            last_error = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "], ["\n        UPDATE pending_ai_responses\n        SET status = 'failed',\n            failure_reason = ", ",\n            last_error = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "])), reason, lastError || null, conversationId))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_56 = _a.sent();
                        console.error('Error marking pending AI response as failed:', error_56);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.markPendingAIResponseSkipped = function (conversationId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var markAsCompletedFallback, error_57, errorCode, constraint, fallbackError_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        markAsCompletedFallback = function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_125 || (templateObject_125 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET status = 'completed',\n            failure_reason = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "], ["\n        UPDATE pending_ai_responses\n        SET status = 'completed',\n            failure_reason = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "])), "skipped:".concat(reason), conversationId))];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 10]);
                        if (!this.pendingAiSkippedUnsupported) return [3 /*break*/, 3];
                        return [4 /*yield*/, markAsCompletedFallback()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                    case 3:
                        console.log("\u23ED\uFE0F [DB] Marcando timer como SKIPPED: ".concat(conversationId, " - Raz\u00E3o: ").concat(reason));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_126 || (templateObject_126 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET status = 'skipped',\n            failure_reason = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "], ["\n        UPDATE pending_ai_responses\n        SET status = 'skipped',\n            failure_reason = ", ",\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "])), reason, conversationId))];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 10];
                    case 5:
                        error_57 = _a.sent();
                        if (!isPendingAiSkippedConstraintError(error_57)) return [3 /*break*/, 9];
                        this.pendingAiSkippedUnsupported = true;
                        errorCode = getDbErrorCode(error_57) || "unknown";
                        constraint = getDbConstraintName(error_57) || "unknown";
                        console.warn("\u26A0\uFE0F [DB] status='skipped' n\u00E3o permitido (code=".concat(errorCode, ", constraint=").concat(constraint, "). Convertendo para completed (conversation=").concat(conversationId, ", reason=").concat(reason, ")."));
                        _a.label = 6;
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, markAsCompletedFallback()];
                    case 7:
                        _a.sent();
                        return [2 /*return*/];
                    case 8:
                        fallbackError_1 = _a.sent();
                        console.error('Error marking pending AI response as completed fallback:', fallbackError_1);
                        return [2 /*return*/];
                    case 9:
                        console.error('Error marking pending AI response as skipped:', error_57);
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.resetPendingAIResponseForRetry = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, delaySec) {
            var error_58;
            if (delaySec === void 0) { delaySec = 30; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log("\uD83D\uDD04 [DB] Resetando timer para retry em ".concat(delaySec, "s: ").concat(conversationId));
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_127 || (templateObject_127 = __makeTemplateObject(["\n        UPDATE pending_ai_responses\n        SET status = 'pending',\n            scheduled_at = NOW(),\n            execute_at = NOW() + (", " || ' seconds')::interval,\n            retry_count = COALESCE(retry_count, 0) + 1,\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "], ["\n        UPDATE pending_ai_responses\n        SET status = 'pending',\n            scheduled_at = NOW(),\n            execute_at = NOW() + (", " || ' seconds')::interval,\n            retry_count = COALESCE(retry_count, 0) + 1,\n            last_attempt_at = NOW(),\n            updated_at = NOW()\n        WHERE conversation_id = ", "\n      "])), delaySec, conversationId))];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_58 = _a.sent();
                        console.error('Error resetting pending AI response for retry:', error_58);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // 🔄 AUTO-RECUPERAÇÃO: Busca timers "failed" com razões transitórias que podem ser retentados
    DatabaseStorage.prototype.getFailedTransientTimers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_59;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_128 || (templateObject_128 = __makeTemplateObject(["\n        SELECT p.conversation_id, p.user_id, p.contact_number, p.jid_suffix, p.messages,\n               p.failure_reason, COALESCE(p.retry_count, 0) as retry_count\n        FROM pending_ai_responses p\n        INNER JOIN whatsapp_connections c ON c.user_id = p.user_id::text\n          AND c.is_connected = true AND c.ai_enabled = true\n        WHERE p.status = 'failed'\n          AND p.updated_at > NOW() - INTERVAL '2 hours'\n          AND (\n            p.failure_reason LIKE 'connection_closed_max_retries_%'\n            OR p.failure_reason LIKE 'send_failed_max_retries_%'\n            OR p.failure_reason = 'session_unavailable_offline'\n          )\n          AND COALESCE(p.retry_count, 0) < 20\n        ORDER BY p.updated_at ASC\n        LIMIT 15\n      "], ["\n        SELECT p.conversation_id, p.user_id, p.contact_number, p.jid_suffix, p.messages,\n               p.failure_reason, COALESCE(p.retry_count, 0) as retry_count\n        FROM pending_ai_responses p\n        INNER JOIN whatsapp_connections c ON c.user_id = p.user_id::text\n          AND c.is_connected = true AND c.ai_enabled = true\n        WHERE p.status = 'failed'\n          AND p.updated_at > NOW() - INTERVAL '2 hours'\n          AND (\n            p.failure_reason LIKE 'connection_closed_max_retries_%'\n            OR p.failure_reason LIKE 'send_failed_max_retries_%'\n            OR p.failure_reason = 'session_unavailable_offline'\n          )\n          AND COALESCE(p.retry_count, 0) < 20\n        ORDER BY p.updated_at ASC\n        LIMIT 15\n      "]))))];
                    case 1:
                        result = _a.sent();
                        if (result.rows && result.rows.length > 0) {
                            return [2 /*return*/, result.rows.map(function (row) { return ({
                                    conversationId: row.conversation_id,
                                    userId: row.user_id,
                                    contactNumber: row.contact_number,
                                    jidSuffix: row.jid_suffix || 's.whatsapp.net',
                                    messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : (row.messages || []),
                                    failureReason: row.failure_reason,
                                    retryCount: Number(row.retry_count) || 0,
                                }); })];
                        }
                        return [2 /*return*/, []];
                    case 2:
                        error_59 = _a.sent();
                        console.error('Error getting failed transient timers:', error_59);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // 🚨 AUTO-RECUPERAÇÃO: Busca timers "completed" que na verdade não receberam resposta
    // Isso captura casos onde o timer foi marcado completed mas a resposta falhou
    // Idempotency helper for AI timers: cheap DB check to avoid re-sending when a reply already exists.
    DatabaseStorage.prototype.getConversationLastMessageTimes = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, row, error_60;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_129 || (templateObject_129 = __makeTemplateObject(["\n        SELECT\n          MAX(timestamp) FILTER (WHERE from_me = false) AS last_customer_at,\n          MAX(timestamp) FILTER (WHERE from_me = true AND is_from_agent = true) AS last_agent_at,\n          MAX(timestamp) FILTER (WHERE from_me = true AND COALESCE(is_from_agent, false) = false) AS last_owner_at\n        FROM messages\n        WHERE conversation_id = ", "\n      "], ["\n        SELECT\n          MAX(timestamp) FILTER (WHERE from_me = false) AS last_customer_at,\n          MAX(timestamp) FILTER (WHERE from_me = true AND is_from_agent = true) AS last_agent_at,\n          MAX(timestamp) FILTER (WHERE from_me = true AND COALESCE(is_from_agent, false) = false) AS last_owner_at\n        FROM messages\n        WHERE conversation_id = ", "\n      "])), conversationId))];
                    case 1:
                        result = _b.sent();
                        row = (_a = result.rows) === null || _a === void 0 ? void 0 : _a[0];
                        return [2 /*return*/, {
                                lastCustomerAt: (row === null || row === void 0 ? void 0 : row.last_customer_at) ? new Date(row.last_customer_at) : null,
                                lastAgentAt: (row === null || row === void 0 ? void 0 : row.last_agent_at) ? new Date(row.last_agent_at) : null,
                                lastOwnerAt: (row === null || row === void 0 ? void 0 : row.last_owner_at) ? new Date(row.last_owner_at) : null,
                            }];
                    case 2:
                        error_60 = _b.sent();
                        console.error('Error getting conversation last message times:', error_60);
                        return [2 /*return*/, { lastCustomerAt: null, lastAgentAt: null, lastOwnerAt: null }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    DatabaseStorage.prototype.getCompletedTimersWithoutResponse = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_61;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_130 || (templateObject_130 = __makeTemplateObject(["\n        SELECT \n          p.conversation_id,\n          p.user_id,\n          p.contact_number,\n          p.jid_suffix,\n          p.messages\n        FROM pending_ai_responses p\n        JOIN conversations c ON c.id = p.conversation_id\n        WHERE p.status = 'completed'\n          AND p.updated_at > NOW() - INTERVAL '2 hours'\n          AND (\n            -- \u00DAltima msg do cliente > \u00FAltima resposta da IA\n            (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = false)\n            >\n            COALESCE(\n              (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = true AND m.is_from_agent = true),\n              '1970-01-01'\n            )\n          )\n        ORDER BY p.updated_at DESC\n        LIMIT 20\n      "], ["\n        SELECT \n          p.conversation_id,\n          p.user_id,\n          p.contact_number,\n          p.jid_suffix,\n          p.messages\n        FROM pending_ai_responses p\n        JOIN conversations c ON c.id = p.conversation_id\n        WHERE p.status = 'completed'\n          AND p.updated_at > NOW() - INTERVAL '2 hours'\n          AND (\n            -- \u00DAltima msg do cliente > \u00FAltima resposta da IA\n            (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = false)\n            >\n            COALESCE(\n              (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = true AND m.is_from_agent = true),\n              '1970-01-01'\n            )\n          )\n        ORDER BY p.updated_at DESC\n        LIMIT 20\n      "]))))];
                    case 1:
                        result = _a.sent();
                        if (result.rows && result.rows.length > 0) {
                            console.log("\uD83D\uDEA8 [AUTO-RECOVERY] Encontrados ".concat(result.rows.length, " timers \"completed\" sem resposta real"));
                            return [2 /*return*/, result.rows.map(function (row) { return ({
                                    conversationId: row.conversation_id,
                                    userId: row.user_id,
                                    contactNumber: row.contact_number,
                                    jidSuffix: row.jid_suffix || 's.whatsapp.net',
                                    messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages
                                }); })];
                        }
                        return [2 /*return*/, []];
                    case 2:
                        error_61 = _a.sent();
                        console.error('Error getting completed timers without response:', error_61);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return DatabaseStorage;
}());
exports.DatabaseStorage = DatabaseStorage;
exports.storage = new DatabaseStorage();
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76, templateObject_77, templateObject_78, templateObject_79, templateObject_80, templateObject_81, templateObject_82, templateObject_83, templateObject_84, templateObject_85, templateObject_86, templateObject_87, templateObject_88, templateObject_89, templateObject_90, templateObject_91, templateObject_92, templateObject_93, templateObject_94, templateObject_95, templateObject_96, templateObject_97, templateObject_98, templateObject_99, templateObject_100, templateObject_101, templateObject_102, templateObject_103, templateObject_104, templateObject_105, templateObject_106, templateObject_107, templateObject_108, templateObject_109, templateObject_110, templateObject_111, templateObject_112, templateObject_113, templateObject_114, templateObject_115, templateObject_116, templateObject_117, templateObject_118, templateObject_119, templateObject_120, templateObject_121, templateObject_122, templateObject_123, templateObject_124, templateObject_125, templateObject_126, templateObject_127, templateObject_128, templateObject_129, templateObject_130;
