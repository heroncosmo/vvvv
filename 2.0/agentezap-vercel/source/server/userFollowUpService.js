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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.userFollowUpService = exports.UserFollowUpService = void 0;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var llm_1 = require("./llm");
var storage_1 = require("./storage");
var whatsapp_1 = require("./whatsapp");
// ============================================================================
// � VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
// ============================================================================
function checkUserSuspensionForFollowUp(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var suspensionStatus, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.storage.isUserSuspended(userId)];
                case 1:
                    suspensionStatus = _a.sent();
                    if (suspensionStatus.suspended) {
                        console.log("\uD83D\uDEAB [USER-FOLLOW-UP] Usu\u00E1rio ".concat(userId, " est\u00E1 SUSPENSO - Follow-up desativado"));
                        return [2 /*return*/, true];
                    }
                    return [2 /*return*/, false];
                case 2:
                    error_1 = _a.sent();
                    console.error("\u26A0\uFE0F [USER-FOLLOW-UP] Erro ao verificar suspens\u00E3o do usu\u00E1rio ".concat(userId, ":"), error_1);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
// Cache de configurações de follow-up por usuário
var followupConfigCache = new Map();
// Cache de configurações de agente por usuário
var agentConfigCache = new Map();
// Cache global da chave Mistral
var mistralKeyCache = null;
// 🔒 ANTI-DUPLICAÇÃO: Cache de mensagens enviadas recentemente
// Armazena hash das mensagens enviadas por conversa nos últimos 30 minutos
var sentMessagesCache = new Map();
// 🔒 ANTI-DUPLICAÇÃO: Set de conversas sendo processadas agora
// Evita que a mesma conversa seja processada em paralelo
var conversationsBeingProcessed = new Set();
// Limpar cache de mensagens enviadas a cada 10 minutos
setInterval(function () {
    var now = Date.now();
    var THIRTY_MINUTES = 30 * 60 * 1000;
    for (var _i = 0, _a = sentMessagesCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], convId = _b[0], messages_1 = _b[1];
        var filtered = messages_1.filter(function (m) { return now - m.timestamp < THIRTY_MINUTES; });
        if (filtered.length === 0) {
            sentMessagesCache.delete(convId);
        }
        else {
            sentMessagesCache.set(convId, filtered);
        }
    }
}, 10 * 60 * 1000);
/**
 * Gera hash simples de uma mensagem para detectar duplicatas
 */
function generateMessageHash(message) {
    var normalized = message.toLowerCase()
        .replace(/[^a-záéíóúàèìòùâêîôûãõ\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Hash simples baseado em soma de caracteres
    var hash = 0;
    for (var i = 0; i < normalized.length; i++) {
        hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}
/**
 * Verifica se uma mensagem similar já foi enviada recentemente
 */
function wasMessageRecentlySent(conversationId, message) {
    var cache = sentMessagesCache.get(conversationId);
    if (!cache || cache.length === 0)
        return false;
    var newHash = generateMessageHash(message);
    return cache.some(function (m) { return m.hash === newHash; });
}
/**
 * Registra uma mensagem como enviada
 */
function registerSentMessage(conversationId, message) {
    var hash = generateMessageHash(message);
    var existing = sentMessagesCache.get(conversationId) || [];
    existing.push({ hash: hash, timestamp: Date.now() });
    // Manter apenas últimas 20 mensagens no cache
    if (existing.length > 20) {
        existing.shift();
    }
    sentMessagesCache.set(conversationId, existing);
}
// Limpar caches expirados periodicamente
setInterval(function () {
    var now = Date.now();
    for (var _i = 0, _a = followupConfigCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], entry = _b[1];
        if (now - entry.timestamp > CACHE_TTL_MS) {
            followupConfigCache.delete(key);
        }
    }
    for (var _c = 0, _d = agentConfigCache.entries(); _c < _d.length; _c++) {
        var _e = _d[_c], key = _e[0], entry = _e[1];
        if (now - entry.timestamp > CACHE_TTL_MS) {
            agentConfigCache.delete(key);
        }
    }
    if (mistralKeyCache && now - mistralKeyCache.timestamp > CACHE_TTL_MS) {
        mistralKeyCache = null;
    }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos
/**
 * Verifica se um usuário específico tem conexão WhatsApp ativa em memória
 * 🚀 OTIMIZADO: Não faz query no DB, apenas verifica memória
 *
 * IMPORTANTE: Baileys usa socket.user para indicar conexão ativa (não socket.ws.readyState)
 */
function isUserConnectionActive(userId, preferredConnectionId) {
    var _a;
    var sessions = (0, whatsapp_1.getSessions)();
    if (preferredConnectionId) {
        var preferred = sessions.get(preferredConnectionId);
        if (!preferred || preferred.userId !== userId)
            return false;
        return preferred.isOpen === true && ((_a = preferred.socket) === null || _a === void 0 ? void 0 : _a.user) !== undefined;
    }
    var candidates = Array.from(sessions.values()).filter(function (s) { return s.userId === userId; });
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var session = candidates_1[_i];
        if (!(session === null || session === void 0 ? void 0 : session.socket) || session.socket.user === undefined)
            continue;
        if (session.isOpen === true)
            return true;
    }
    return false;
}
// ============================================================================
// FOLLOW-UP INTELIGENTE PARA USUÁRIOS
// Serviço que gerencia follow-ups automáticos para cada agente de usuário
// ============================================================================
// Intervalos padrão em minutos
var DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];
/**
 * Adiciona segundos aleatórios a uma data para parecer mais humano
 * Evita que todos os follow-ups sejam no mesmo segundo (parece robô)
 */
function addRandomSeconds(date) {
    var randomSeconds = Math.floor(Math.random() * 45) + 5; // Entre 5 e 50 segundos
    return new Date(date.getTime() + randomSeconds * 1000);
}
/**
 * Validação básica de segurança - só rejeita casos extremos
 * A IA deve fazer o trabalho principal de gerar mensagens corretas
 */
function validateMessage(message) {
    if (!message || message.trim().length < 10) {
        console.warn("\u26A0\uFE0F [FOLLOW-UP] Mensagem muito curta ou vazia");
        return false;
    }
    // Verificar se a mensagem está EXATAMENTE duplicada (mesma string 2x)
    var trimmed = message.trim();
    var halfLen = Math.floor(trimmed.length / 2);
    if (halfLen > 30) {
        var firstHalf = trimmed.substring(0, halfLen).trim();
        var secondHalf = trimmed.substring(halfLen).trim();
        if (firstHalf === secondHalf) {
            console.warn("\u26A0\uFE0F [FOLLOW-UP] Mensagem exatamente duplicada detectada");
            return false;
        }
    }
    return true;
}
var UserFollowUpService = /** @class */ (function () {
    function UserFollowUpService() {
        this.checkInterval = null;
        this.isRunning = false;
        // 🔧 FIX: Guard contra ciclos sobrepostos (timer overlap pode spammar leads)
        this.isProcessingCycle = false;
        this.onFollowUpReady = null;
    }
    UserFollowUpService.prototype.start = function () {
        var _this = this;
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log("🚀 [USER-FOLLOW-UP] Serviço iniciado");
        // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
        this.checkInterval = setInterval(function () { return _this.processFollowUps(); }, 5 * 60 * 1000);
        // Aguardar 60s antes da primeira execução para não sobrecarregar na inicialização
        setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.repairMissingSchedules()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.processFollowUps()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 60 * 1000);
    };
    UserFollowUpService.prototype.stop = function () {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log("🛑 [USER-FOLLOW-UP] Serviço parado");
    };
    UserFollowUpService.prototype.registerCallback = function (callback) {
        this.onFollowUpReady = callback;
        console.log("📲 [USER-FOLLOW-UP] Callback registrado");
    };
    /**
     * Processa todas as conversas pendentes de follow-up
     */
    UserFollowUpService.prototype.processFollowUps = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, pendingConversations, seenConversationScopes, uniqueConversations, sorted, _i, sorted_1, conv, scopeKey, _a, uniqueConversations_1, conv, error_2;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        // 🔧 FIX: Guard contra ciclos sobrepostos
                        if (this.isProcessingCycle) {
                            console.log("⏭️ [USER-FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
                            return [2 /*return*/];
                        }
                        this.isProcessingCycle = true;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 12, 13, 14]);
                        now = new Date();
                        return [4 /*yield*/, db_1.db.query.conversations.findMany({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.nextFollowupAt), (0, drizzle_orm_1.lte)(schema_1.conversations.nextFollowupAt, now)),
                                with: {
                                    connection: {
                                        with: {
                                            user: true
                                        }
                                    }
                                }
                            })];
                    case 2:
                        pendingConversations = _c.sent();
                        if (pendingConversations.length > 0) {
                            console.log("\uD83D\uDD0D [USER-FOLLOW-UP] Encontradas ".concat(pendingConversations.length, " conversas para processar"));
                        }
                        seenConversationScopes = new Set();
                        uniqueConversations = [];
                        sorted = __spreadArray([], pendingConversations, true).sort(function (a, b) {
                            var aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                            var bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                            return bTime - aTime;
                        });
                        _i = 0, sorted_1 = sorted;
                        _c.label = 3;
                    case 3:
                        if (!(_i < sorted_1.length)) return [3 /*break*/, 7];
                        conv = sorted_1[_i];
                        scopeKey = "".concat(conv.connectionId || ((_b = conv.connection) === null || _b === void 0 ? void 0 : _b.id) || 'unknown', ":").concat(conv.contactNumber);
                        if (!!seenConversationScopes.has(scopeKey)) return [3 /*break*/, 4];
                        seenConversationScopes.add(scopeKey);
                        uniqueConversations.push(conv);
                        return [3 /*break*/, 6];
                    case 4:
                        // Conversa duplicada no mesmo escopo (conexão+número) - desativar para evitar spam
                        console.log("\uD83D\uDD27 [USER-FOLLOW-UP] Desativando followup DUPLICADO no escopo ".concat(scopeKey, " (conv ").concat(conv.id, ")"));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ followupActive: false, nextFollowupAt: null, followupDisabledReason: 'Duplicado na mesma conexão - outra conversa ativa' })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conv.id))];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 3];
                    case 7:
                        if (uniqueConversations.length !== pendingConversations.length) {
                            console.log("\uD83D\uDD27 [USER-FOLLOW-UP] Deduplica\u00E7\u00E3o: ".concat(pendingConversations.length, " \u2192 ").concat(uniqueConversations.length, " conversas \u00FAnicas"));
                        }
                        _a = 0, uniqueConversations_1 = uniqueConversations;
                        _c.label = 8;
                    case 8:
                        if (!(_a < uniqueConversations_1.length)) return [3 /*break*/, 11];
                        conv = uniqueConversations_1[_a];
                        return [4 /*yield*/, this.executeFollowUp(conv)];
                    case 9:
                        _c.sent();
                        _c.label = 10;
                    case 10:
                        _a++;
                        return [3 /*break*/, 8];
                    case 11: return [3 /*break*/, 14];
                    case 12:
                        error_2 = _c.sent();
                        console.error("❌ [USER-FOLLOW-UP] Erro ao processar follow-ups:", error_2);
                        return [3 /*break*/, 14];
                    case 13:
                        this.isProcessingCycle = false;
                        return [7 /*endfinally*/];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Executa follow-up para uma conversa específica
     */
    UserFollowUpService.prototype.executeFollowUp = function (conversation) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, e_1, currentConv, isSuspended, preferredConnectionId, existingNext, tenMinFromNow, retryDate, recentMsg, ageMs, cooldownMs, nextDate, cooldownErr_1, isExcludedFromFollowup, config, nextBusinessTime, decision, regenerationAttempts, MAX_REGENERATION_ATTEMPTS, nextDate, scheduleDate, nextDate, recheck, nextDate, nextDate, safetyDate, result, isConnectionError, retryDate, retryDate, retryDate, error_3;
            var _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        userId = (_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId;
                        if (!!userId) return [3 /*break*/, 5];
                        // 🔧 FIX: Desativar follow-up para conversas órfãs (sem conexão/userId válido)
                        // Evita log spam repetitivo a cada 5 minutos para conversas que nunca serão processadas
                        console.warn("\u26A0\uFE0F [USER-FOLLOW-UP] Conversa ".concat(conversation.id, " sem userId - desativando follow-up (conex\u00E3o removida)"));
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ followupActive: false, nextFollowupAt: null, followupDisabledReason: 'Conexão removida - sem userId' })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 2:
                        _f.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _f.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                    case 5: return [4 /*yield*/, db_1.db.select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))
                            .limit(1)];
                    case 6:
                        currentConv = (_f.sent())[0];
                        if (!currentConv || !currentConv.followupActive) {
                            console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para conversa ".concat(conversation.contactNumber, " - cancelando envio"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, checkUserSuspensionForFollowUp(userId)];
                    case 7:
                        isSuspended = _f.sent();
                        if (!isSuspended) return [3 /*break*/, 9];
                        console.log("\uD83D\uDEAB [USER-FOLLOW-UP] Usu\u00E1rio ".concat(userId, " est\u00E1 SUSPENSO - desativando follow-up da conversa"));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Conta suspensa por violação de políticas")];
                    case 8:
                        _f.sent();
                        return [2 /*return*/];
                    case 9:
                        preferredConnectionId = conversation.connectionId || ((_b = conversation.connection) === null || _b === void 0 ? void 0 : _b.id);
                        if (!!isUserConnectionActive(userId, preferredConnectionId)) return [3 /*break*/, 15];
                        existingNext = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
                        tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000);
                        if (!(existingNext && existingNext > tenMinFromNow)) return [3 /*break*/, 12];
                        if (!(conversation.followupDisabledReason !== '🔄 Aguardando conexão WhatsApp...')) return [3 /*break*/, 11];
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ followupDisabledReason: '🔄 Aguardando conexão WhatsApp...' })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 10:
                        _f.sent();
                        console.log("\u23F8\uFE0F [USER-FOLLOW-UP] Usu\u00E1rio ".concat(userId, " sem conex\u00E3o - marcando ").concat(conversation.contactNumber, " (preservando agenda: ").concat(existingNext.toLocaleString(), ")"));
                        _f.label = 11;
                    case 11: return [3 /*break*/, 14];
                    case 12:
                        retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                nextFollowupAt: retryDate,
                                followupDisabledReason: '🔄 Aguardando conexão WhatsApp...'
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 13:
                        _f.sent();
                        if (conversation.followupDisabledReason !== '🔄 Aguardando conexão WhatsApp...') {
                            console.log("\u23F8\uFE0F [USER-FOLLOW-UP] Usu\u00E1rio ".concat(userId, " sem conex\u00E3o ativa - reagendando ").concat(conversation.contactNumber, " para ").concat(retryDate.toLocaleString()));
                        }
                        _f.label = 14;
                    case 14: return [2 /*return*/];
                    case 15:
                        // 🔒 ANTI-DUPLICAÇÃO: Verificar se esta conversa já está sendo processada
                        if (conversationsBeingProcessed.has(conversation.id)) {
                            console.log("\u23F3 [USER-FOLLOW-UP] Conversa ".concat(conversation.contactNumber, " j\u00E1 est\u00E1 sendo processada - ignorando"));
                            return [2 /*return*/];
                        }
                        // Marcar como em processamento
                        conversationsBeingProcessed.add(conversation.id);
                        console.log("\uD83D\uDC49 [USER-FOLLOW-UP] Processando ".concat(conversation.contactNumber, " (Est\u00E1gio ").concat(conversation.followupStage, ")"));
                        _f.label = 16;
                    case 16:
                        _f.trys.push([16, 68, 69, 70]);
                        _f.label = 17;
                    case 17:
                        _f.trys.push([17, 21, , 22]);
                        return [4 /*yield*/, db_1.db.query.messages.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversation.id),
                                orderBy: function (msgs, _a) {
                                    var desc = _a.desc;
                                    return [desc(msgs.timestamp)];
                                },
                            })];
                    case 18:
                        recentMsg = _f.sent();
                        if (!(recentMsg === null || recentMsg === void 0 ? void 0 : recentMsg.timestamp)) return [3 /*break*/, 20];
                        ageMs = Date.now() - new Date(recentMsg.timestamp).getTime();
                        cooldownMs = 10 * 60 * 1000;
                        if (!(Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs)) return [3 /*break*/, 20];
                        console.log("\uD83E\uDDCA [USER-FOLLOW-UP] Cooldown ativo (".concat(Math.round(ageMs / 1000), "s desde \u00FAltima msg) para ").concat(conversation.contactNumber, ", reagendando"));
                        nextDate = addRandomSeconds(new Date(new Date(recentMsg.timestamp).getTime() + cooldownMs));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ nextFollowupAt: nextDate })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 19:
                        _f.sent();
                        return [2 /*return*/];
                    case 20: return [3 /*break*/, 22];
                    case 21:
                        cooldownErr_1 = _f.sent();
                        console.warn('⚠️ [USER-FOLLOW-UP] Falha ao checar cooldown, continuando:', cooldownErr_1);
                        return [3 /*break*/, 22];
                    case 22: return [4 /*yield*/, storage_1.storage.isNumberExcludedFromFollowup(userId, conversation.contactNumber)];
                    case 23:
                        isExcludedFromFollowup = _f.sent();
                        if (!isExcludedFromFollowup) return [3 /*break*/, 25];
                        console.log("\uD83D\uDEAB [USER-FOLLOW-UP] N\u00FAmero ".concat(conversation.contactNumber, " est\u00E1 na LISTA DE EXCLUS\u00C3O - n\u00E3o enviar follow-up"));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Número na lista de exclusão")];
                    case 24:
                        _f.sent();
                        return [2 /*return*/];
                    case 25: return [4 /*yield*/, this.getFollowupConfig(userId)];
                    case 26:
                        config = _f.sent();
                        if (!(!config || !config.isEnabled)) return [3 /*break*/, 28];
                        console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up desativado para usu\u00E1rio ".concat(userId));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Usuário desativou follow-up")];
                    case 27:
                        _f.sent();
                        return [2 /*return*/];
                    case 28:
                        if (!(config.respectBusinessHours && !this.isBusinessHours(config))) return [3 /*break*/, 30];
                        console.log("\u23F0 [USER-FOLLOW-UP] Fora do hor\u00E1rio comercial para ".concat(conversation.contactNumber));
                        nextBusinessTime = this.getNextBusinessTime(config);
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, nextBusinessTime)];
                    case 29:
                        _f.sent();
                        return [2 /*return*/];
                    case 30: return [4 /*yield*/, this.analyzeWithAI(conversation, config)];
                    case 31:
                        decision = _f.sent();
                        regenerationAttempts = 0;
                        MAX_REGENERATION_ATTEMPTS = 3;
                        _f.label = 32;
                    case 32:
                        if (!(decision.action === 'wait' &&
                            regenerationAttempts < MAX_REGENERATION_ATTEMPTS &&
                            (decision.reason.includes('repetida') ||
                                decision.reason.includes('similar') ||
                                decision.reason.includes('repetitiva') ||
                                decision.reason.includes('igual')))) return [3 /*break*/, 34];
                        regenerationAttempts++;
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] Tentativa ".concat(regenerationAttempts, "/").concat(MAX_REGENERATION_ATTEMPTS, " de regenerar mensagem para ").concat(conversation.contactNumber));
                        console.log("   Motivo da regenera\u00E7\u00E3o: ".concat(decision.reason));
                        return [4 /*yield*/, this.analyzeWithAI(conversation, config, regenerationAttempts)];
                    case 33:
                        // Chamar IA novamente com contexto de regeneração
                        decision = _f.sent();
                        // Se conseguiu gerar mensagem diferente, sair do loop
                        if (decision.action === 'send' && decision.message) {
                            console.log("\u2705 [USER-FOLLOW-UP] Regenera\u00E7\u00E3o ".concat(regenerationAttempts, " bem sucedida!"));
                            return [3 /*break*/, 34];
                        }
                        return [3 /*break*/, 32];
                    case 34:
                        if (!(regenerationAttempts >= MAX_REGENERATION_ATTEMPTS && decision.action === 'wait')) return [3 /*break*/, 37];
                        console.warn("\u26A0\uFE0F [USER-FOLLOW-UP] Ap\u00F3s ".concat(MAX_REGENERATION_ATTEMPTS, " tentativas, n\u00E3o conseguiu gerar mensagem \u00FAnica para ").concat(conversation.contactNumber));
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'skipped', null, decision, "Ap\u00F3s ".concat(regenerationAttempts, " tentativas: ").concat(decision.reason))];
                    case 35:
                        _f.sent();
                        nextDate = addRandomSeconds(new Date(Date.now() + 12 * 60 * 60 * 1000));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, nextDate)];
                    case 36:
                        _f.sent();
                        return [2 /*return*/];
                    case 37:
                        if (!(decision.action === 'abort')) return [3 /*break*/, 40];
                        console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Abortado pela IA para ".concat(conversation.contactNumber, ": ").concat(decision.reason));
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, decision.reason)];
                    case 38:
                        _f.sent();
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'cancelled', null, decision, decision.reason)];
                    case 39:
                        _f.sent();
                        return [2 /*return*/];
                    case 40:
                        if (!(decision.action === 'schedule' && decision.scheduleDate)) return [3 /*break*/, 44];
                        scheduleDate = new Date(decision.scheduleDate);
                        console.log("\uD83D\uDCC5 [USER-FOLLOW-UP] Cliente pediu para retornar em ".concat(scheduleDate.toLocaleDateString('pt-BR'), ": ").concat(decision.reason));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, scheduleDate)];
                    case 41:
                        _f.sent();
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'skipped', null, decision, "Reagendado para ".concat(scheduleDate.toLocaleDateString('pt-BR'), " conforme combinado"))];
                    case 42:
                        _f.sent();
                        // Atualizar motivo visível
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ followupDisabledReason: "\uD83D\uDCC5 Combinado retornar em ".concat(scheduleDate.toLocaleDateString('pt-BR')) })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 43:
                        // Atualizar motivo visível
                        _f.sent();
                        return [2 /*return*/];
                    case 44:
                        if (!(decision.action === 'wait')) return [3 /*break*/, 47];
                        console.log("\u23F3 [USER-FOLLOW-UP] IA sugeriu esperar para ".concat(conversation.contactNumber, ": ").concat(decision.reason));
                        nextDate = addRandomSeconds(new Date(Date.now() + 24 * 60 * 60 * 1000));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, nextDate)];
                    case 45:
                        _f.sent();
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason)];
                    case 46:
                        _f.sent();
                        return [2 /*return*/];
                    case 47:
                        if (!(decision.action === 'send' && decision.message)) return [3 /*break*/, 67];
                        return [4 /*yield*/, db_1.db.select()
                                .from(schema_1.conversations)
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))
                                .limit(1)];
                    case 48:
                        recheck = (_f.sent())[0];
                        if (!recheck || !recheck.followupActive) {
                            console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up foi DESATIVADO durante processamento para ".concat(conversation.contactNumber, " - cancelando envio"));
                            return [2 /*return*/];
                        }
                        if (!wasMessageRecentlySent(conversation.id, decision.message)) return [3 /*break*/, 51];
                        console.warn("\uD83D\uDD12 [USER-FOLLOW-UP] Mensagem DUPLICADA detectada para ".concat(conversation.contactNumber, " - N\u00C3O enviando"));
                        nextDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, nextDate)];
                    case 49:
                        _f.sent();
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem duplicada bloqueada')];
                    case 50:
                        _f.sent();
                        return [2 /*return*/];
                    case 51:
                        if (!!validateMessage(decision.message)) return [3 /*break*/, 54];
                        console.warn("\u26A0\uFE0F [USER-FOLLOW-UP] Mensagem inv\u00E1lida para ".concat(conversation.contactNumber, ", reagendando"));
                        nextDate = addRandomSeconds(new Date(Date.now() + 30 * 60 * 1000));
                        return [4 /*yield*/, this.scheduleNextFollowUp(conversation.id, nextDate)];
                    case 52:
                        _f.sent();
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem inválida')];
                    case 53:
                        _f.sent();
                        return [2 /*return*/];
                    case 54:
                        if (!(this.onFollowUpReady && conversation.remoteJid)) return [3 /*break*/, 65];
                        console.log("\uD83D\uDCE4 [USER-FOLLOW-UP] Disparando follow-up para ".concat(conversation.contactNumber));
                        safetyDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ nextFollowupAt: safetyDate })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 55:
                        _f.sent();
                        return [4 /*yield*/, this.onFollowUpReady(userId, conversation.id, conversation.contactNumber, conversation.remoteJid, decision.message, // Mensagem da IA (já deve estar correta)
                            conversation.followupStage || 0)];
                    case 56:
                        result = _f.sent();
                        if (!result.success) return [3 /*break*/, 59];
                        // ✅ Registrar mensagem enviada no cache anti-duplicação
                        registerSentMessage(conversation.id, decision.message);
                        // Sucesso: Logar e agendar próximo estágio
                        return [4 /*yield*/, this.logFollowUp(conversation, userId, 'sent', decision.message, decision, null)];
                    case 57:
                        // Sucesso: Logar e agendar próximo estágio
                        _f.sent();
                        return [4 /*yield*/, this.advanceToNextStage(conversation, config)];
                    case 58:
                        _f.sent();
                        // ⚠️ IMPORTANTE: NÃO reativamos a IA automaticamente após follow-up!
                        // Follow-up e IA são sistemas INDEPENDENTES:
                        // - Se o usuário desativou a IA, ela deve permanecer desativada
                        // - O follow-up pode continuar funcionando mesmo com IA desativada
                        // - A IA só deve ser reativada quando o usuário ativar manualmente
                        console.log("\u2705 [USER-FOLLOW-UP] Follow-up enviado para ".concat(conversation.contactNumber, " (IA permanece no estado atual)"));
                        return [3 /*break*/, 64];
                    case 59:
                        isConnectionError = ((_c = result.error) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('not connected')) ||
                            ((_d = result.error) === null || _d === void 0 ? void 0 : _d.toLowerCase().includes('connection')) ||
                            ((_e = result.error) === null || _e === void 0 ? void 0 : _e.toLowerCase().includes('socket'));
                        if (!isConnectionError) return [3 /*break*/, 61];
                        // Erro de conexão: reagendar silenciosamente para tentar em 2 minutos
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] WhatsApp desconectado, reagendando em 2 minutos: ".concat(result.error));
                        retryDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                nextFollowupAt: retryDate,
                                followupDisabledReason: "\uD83D\uDD04 Aguardando conex\u00E3o WhatsApp..."
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 60:
                        _f.sent();
                        return [3 /*break*/, 64];
                    case 61: 
                    // Outro tipo de erro: logar como falha
                    return [4 /*yield*/, this.logFollowUp(conversation, userId, 'failed', decision.message, decision, result.error)];
                    case 62:
                        // Outro tipo de erro: logar como falha
                        _f.sent();
                        retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                nextFollowupAt: retryDate,
                                followupDisabledReason: "\u26A0\uFE0F Erro: ".concat(result.error)
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 63:
                        _f.sent();
                        _f.label = 64;
                    case 64: return [3 /*break*/, 67];
                    case 65:
                        console.warn("⚠️ [USER-FOLLOW-UP] Callback não registrado ou remoteJid ausente");
                        retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({ nextFollowupAt: retryDate })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 66:
                        _f.sent();
                        _f.label = 67;
                    case 67: return [3 /*break*/, 70];
                    case 68:
                        error_3 = _f.sent();
                        console.error("\u274C [USER-FOLLOW-UP] Erro ao executar para ".concat(conversation.contactNumber, ":"), error_3);
                        return [3 /*break*/, 70];
                    case 69:
                        // 🔓 ANTI-DUPLICAÇÃO: Liberar lock da conversa
                        conversationsBeingProcessed.delete(conversation.id);
                        return [7 /*endfinally*/];
                    case 70: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Busca ou cria configuração de follow-up para o usuário (COM CACHE)
     */
    UserFollowUpService.prototype.getFollowupConfig = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, config, newConfig;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cached = followupConfigCache.get(userId);
                        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                            return [2 /*return*/, cached.data];
                        }
                        return [4 /*yield*/, db_1.db.query.followupConfigs.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.followupConfigs.userId, userId)
                            })];
                    case 1:
                        config = _a.sent();
                        if (!!config) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.insert(schema_1.followupConfigs).values({
                                userId: userId,
                                isEnabled: false,
                                maxAttempts: 8,
                                intervalsMinutes: DEFAULT_INTERVALS,
                                businessHoursStart: "09:00",
                                businessHoursEnd: "18:00",
                                businessDays: [1, 2, 3, 4, 5],
                                respectBusinessHours: true,
                                tone: "consultivo",
                                formalityLevel: 5,
                                useEmojis: true,
                                importantInfo: [],
                                infiniteLoop: true,
                                infiniteLoopMinDays: 15,
                                infiniteLoopMaxDays: 30,
                            }).returning()];
                    case 2:
                        newConfig = (_a.sent())[0];
                        config = newConfig;
                        _a.label = 3;
                    case 3:
                        // 🚀 Salvar no cache
                        followupConfigCache.set(userId, { data: config, timestamp: Date.now() });
                        return [2 /*return*/, config];
                }
            });
        });
    };
    /**
     * Atualiza configuração de follow-up (invalida cache)
     */
    UserFollowUpService.prototype.updateFollowupConfig = function (userId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, id, _, createdAt, updatedAt, cleanData, existing, result, updated, created, userConnections, connectionIds, _i, connectionIds_1, connId, err_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // 🚀 Invalidar cache ao atualizar
                        followupConfigCache.delete(userId);
                        _a = data, id = _a.id, _ = _a.userId, createdAt = _a.createdAt, updatedAt = _a.updatedAt, cleanData = __rest(_a, ["id", "userId", "createdAt", "updatedAt"]);
                        return [4 /*yield*/, db_1.db.query.followupConfigs.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.followupConfigs.userId, userId)
                            })];
                    case 1:
                        existing = _b.sent();
                        if (!existing) return [3 /*break*/, 3];
                        return [4 /*yield*/, db_1.db.update(schema_1.followupConfigs)
                                .set(__assign(__assign({}, cleanData), { updatedAt: new Date() }))
                                .where((0, drizzle_orm_1.eq)(schema_1.followupConfigs.userId, userId))
                                .returning()];
                    case 2:
                        updated = (_b.sent())[0];
                        // 🚀 Atualizar cache
                        followupConfigCache.set(userId, { data: updated, timestamp: Date.now() });
                        result = updated;
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, db_1.db.insert(schema_1.followupConfigs)
                            .values(__assign({ userId: userId }, cleanData))
                            .returning()];
                    case 4:
                        created = (_b.sent())[0];
                        // 🚀 Salvar no cache
                        followupConfigCache.set(userId, { data: created, timestamp: Date.now() });
                        result = created;
                        _b.label = 5;
                    case 5:
                        if (!(cleanData.isEnabled === false)) return [3 /*break*/, 14];
                        console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up GLOBAL desativado pelo usu\u00E1rio ".concat(userId, ". Desativando TODAS as conversas ativas..."));
                        _b.label = 6;
                    case 6:
                        _b.trys.push([6, 13, , 14]);
                        return [4 /*yield*/, db_1.db.query.whatsappConnections.findMany({
                                where: (0, drizzle_orm_1.eq)(schema_1.whatsappConnections.userId, userId)
                            })];
                    case 7:
                        userConnections = _b.sent();
                        connectionIds = userConnections.map(function (c) { return c.id; });
                        if (!(connectionIds.length > 0)) return [3 /*break*/, 12];
                        _i = 0, connectionIds_1 = connectionIds;
                        _b.label = 8;
                    case 8:
                        if (!(_i < connectionIds_1.length)) return [3 /*break*/, 11];
                        connId = connectionIds_1[_i];
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupActive: false,
                                nextFollowupAt: null,
                                followupDisabledReason: 'Usuário desativou follow-up global'
                            })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connId), (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true)))];
                    case 9:
                        _b.sent();
                        _b.label = 10;
                    case 10:
                        _i++;
                        return [3 /*break*/, 8];
                    case 11:
                        console.log("\u2705 [USER-FOLLOW-UP] Todas as conversas ativas do usu\u00E1rio ".concat(userId, " foram desativadas."));
                        _b.label = 12;
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        err_1 = _b.sent();
                        console.error("\u274C [USER-FOLLOW-UP] Erro ao desativar conversas ativas:", err_1);
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Usa IA para analisar se deve enviar follow-up e qual mensagem
     * VERSÃO MELHORADA: Lê contexto completo, entende o negócio, evita repetições
     * @param regenerationAttempt - Número da tentativa de regeneração (0 = primeira vez)
     */
    UserFollowUpService.prototype.analyzeWithAI = function (conversation_1, config_1) {
        return __awaiter(this, arguments, void 0, function (conversation, config, regenerationAttempt) {
            var recentMessages, userId, businessContext, agentName, companyName, businessConfig, products, productsList, e_2, historyFormatted, lastClientMessage, lastOurMessage, lastClientTime, lastOurTime, now, brazilNow, todayStr, dayOfWeek, dayNames, todayName, minutesSinceClient, minutesSinceOur, lastMessageWasOurs, clientName, ourLastMessages, clientFeedback, hasNegativeFeedback, clientIrritadoPhrases, isClientIrritado, lastClientText, toneMap, lastTopics, offeredDemo, offeredPrice, askedQuestion, lastOurMessageToday, conversedToday, regenerationContext, prompt, mistral, response, rawContent, content, jsonStr, parsed, scheduleDate, message_1, isSimilar, sameStructure, hasExactPhrase, keyPhrases, msgLower, _loop_1, _i, keyPhrases_1, phrase, state_1, e_3;
            var _this = this;
            var _a, _b, _c, _d, _e, _f;
            if (regenerationAttempt === void 0) { regenerationAttempt = 0; }
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.messages.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversation.id),
                            orderBy: function (messages, _a) {
                                var desc = _a.desc;
                                return [desc(messages.timestamp)];
                            },
                            limit: 40 // Aumentado para 40 mensagens para contexto completo
                        })];
                    case 1:
                        recentMessages = _g.sent();
                        userId = (_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId;
                        businessContext = "";
                        agentName = "";
                        companyName = "";
                        if (!userId) return [3 /*break*/, 5];
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, db_1.db.query.businessAgentConfigs.findFirst({
                                where: (0, drizzle_orm_1.eq)(schema_1.businessAgentConfigs.userId, userId)
                            })];
                    case 3:
                        businessConfig = _g.sent();
                        if (businessConfig) {
                            agentName = businessConfig.agentName || "";
                            companyName = businessConfig.companyName || "";
                            products = businessConfig.productsServices || [];
                            productsList = Array.isArray(products) && products.length > 0
                                ? products.map(function (p) { return "- ".concat(p.name, ": ").concat(p.description || '', " ").concat(p.price ? "(".concat(p.price, ")") : ''); }).join('\n')
                                : '';
                            businessContext = "\nSOBRE O NEG\u00D3CIO:\n- Empresa: ".concat(companyName || 'Não informado', "\n- Agente: ").concat(agentName || 'Assistente', "\n- Cargo: ").concat(businessConfig.agentRole || 'Assistente Virtual', "\n- Descri\u00E7\u00E3o: ").concat(businessConfig.companyDescription || 'Não informada', "\n").concat(productsList ? "\nPRODUTOS/SERVI\u00C7OS:\n".concat(productsList) : '', "\n");
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        e_2 = _g.sent();
                        console.warn("Erro ao buscar business config:", e_2);
                        return [3 /*break*/, 5];
                    case 5:
                        historyFormatted = recentMessages
                            .reverse()
                            .map(function (m) {
                            var content = m.text || '';
                            // Se é mídia sem texto, indicar de forma natural
                            if (!content && m.mediaType) {
                                if (m.mediaType === 'audio')
                                    content = '(cliente enviou um áudio)';
                                else if (m.mediaType === 'image')
                                    content = '(cliente enviou uma imagem)';
                                else if (m.mediaType === 'video')
                                    content = '(cliente enviou um vídeo)';
                                else if (m.mediaType === 'document')
                                    content = '(cliente enviou um documento)';
                                else
                                    content = '(cliente enviou uma mídia)';
                            }
                            // Limpar a palavra "Áudio" que pode ter ficado
                            content = content.replace(/\s*Áudio\s*$/gi, '').trim();
                            content = content.replace(/\s*Audio\s*$/gi, '').trim();
                            return {
                                de: m.fromMe ? "NÓS" : "CLIENTE",
                                mensagem: content,
                                hora: m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
                            };
                        });
                        lastClientMessage = recentMessages.find(function (m) { return !m.fromMe; });
                        lastOurMessage = recentMessages.find(function (m) { return m.fromMe; });
                        lastClientTime = (lastClientMessage === null || lastClientMessage === void 0 ? void 0 : lastClientMessage.timestamp) ? new Date(lastClientMessage.timestamp) : null;
                        lastOurTime = (lastOurMessage === null || lastOurMessage === void 0 ? void 0 : lastOurMessage.timestamp) ? new Date(lastOurMessage.timestamp) : null;
                        now = new Date();
                        brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                        todayStr = brazilNow.toLocaleDateString('pt-BR');
                        dayOfWeek = brazilNow.getDay();
                        dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                        todayName = dayNames[dayOfWeek];
                        minutesSinceClient = lastClientTime
                            ? Math.floor((now.getTime() - lastClientTime.getTime()) / (1000 * 60))
                            : 9999;
                        minutesSinceOur = lastOurTime
                            ? Math.floor((now.getTime() - lastOurTime.getTime()) / (1000 * 60))
                            : 9999;
                        lastMessageWasOurs = lastOurTime && lastClientTime ? lastOurTime > lastClientTime : !!lastOurTime;
                        clientName = conversation.contactName || '';
                        ourLastMessages = recentMessages
                            .filter(function (m) { return m.fromMe && m.text; })
                            .slice(0, 5)
                            .map(function (m) { var _a; return (_a = m.text) === null || _a === void 0 ? void 0 : _a.replace(/\s*Áudio\s*$/gi, '').trim(); });
                        clientFeedback = recentMessages
                            .filter(function (m) { return !m.fromMe && m.text; })
                            .map(function (m) { var _a; return ((_a = m.text) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || ''; })
                            .join(' ');
                        hasNegativeFeedback = clientFeedback.includes('repetiu') ||
                            clientFeedback.includes('repetindo') ||
                            clientFeedback.includes('sem ler') ||
                            clientFeedback.includes('não leu') ||
                            clientFeedback.includes('lendo') ||
                            clientFeedback.includes('mesmo texto') ||
                            clientFeedback.includes('já disse') ||
                            clientFeedback.includes('já falei');
                        clientIrritadoPhrases = [
                            'para de mandar', 'pare de mandar', 'para de enviar', 'pare de enviar',
                            'não manda mais', 'não mande mais', 'não envia mais', 'não envie mais',
                            'chega de mensagem', 'para com isso', 'pare com isso',
                            'me deixa em paz', 'deixa em paz', 'saco cheio', 'encheu o saco',
                            'irritado', 'irritada', 'p*rra', 'porra', 'caralho', 'merda',
                            'não quero mais', 'não quero saber', 'desiste', 'desista',
                            'bloquear', 'vou bloquear', 'vou te bloquear',
                            'spam', 'isso é spam', 'tá spamando', 'spamando',
                            'para de insistir', 'pare de insistir', 'já disse não', 'já falei não',
                            'não me manda', 'não me mande', 'não me envia', 'não me envie',
                            'cansa', 'cansado', 'cansada', 'chato', 'chata', 'chatice',
                            'que saco', 'que droga', 'pqp', 'vsf', 'vai se',
                            'não enche', 'não encha', 'me esquece', 'esquece de mim',
                            'some daqui', 'sai fora', 'vai embora',
                            'número errado', 'engano', 'não te conheço', 'quem é você'
                        ];
                        isClientIrritado = clientIrritadoPhrases.some(function (phrase) {
                            return clientFeedback.includes(phrase);
                        });
                        // 🔴 Se cliente está irritado, desativar follow-up IMEDIATAMENTE
                        if (isClientIrritado) {
                            console.log("\uD83D\uDD34 [USER-FOLLOW-UP] CLIENTE IRRITADO detectado para ".concat(conversation.contactNumber, "!"));
                            console.log("   Frase detectada no hist\u00F3rico: \"".concat(clientFeedback.slice(0, 200), "...\""));
                            return [2 /*return*/, {
                                    action: 'abort',
                                    reason: 'Cliente demonstrou irritação/desejo de não receber mais mensagens - follow-up desativado automaticamente'
                                }];
                        }
                        lastClientText = ((_b = lastClientMessage === null || lastClientMessage === void 0 ? void 0 : lastClientMessage.text) === null || _b === void 0 ? void 0 : _b.replace(/\s*Áudio\s*$/gi, '').trim()) || '';
                        toneMap = {
                            'consultivo': 'consultivo e prestativo',
                            'vendedor': 'vendedor persuasivo mas sutil',
                            'humano': 'casual e amigável',
                            'técnico': 'profissional e direto'
                        };
                        lastTopics = historyFormatted.slice(-5).map(function (h) { return h.mensagem; }).join(' ');
                        offeredDemo = ourLastMessages.some(function (m) { return (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('demo')) || (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('vídeo')) || (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('teste')); });
                        offeredPrice = ourLastMessages.some(function (m) { return (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('99')) || (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('199')) || (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('preço')) || (m === null || m === void 0 ? void 0 : m.toLowerCase().includes('plano')); });
                        askedQuestion = (_c = ourLastMessages[0]) === null || _c === void 0 ? void 0 : _c.includes('?');
                        lastOurMessageToday = recentMessages.find(function (m) {
                            if (!m.fromMe || !m.timestamp)
                                return false;
                            var msgDate = new Date(m.timestamp);
                            var msgDay = msgDate.toLocaleDateString('pt-BR');
                            return msgDay === todayStr;
                        });
                        conversedToday = !!lastOurMessageToday;
                        regenerationContext = regenerationAttempt > 0 ? "\n\n\uD83D\uDD34\uD83D\uDD34\uD83D\uDD34 **ATEN\u00C7\u00C3O CR\u00CDTICA - TENTATIVA ".concat(regenerationAttempt, " DE REGENERA\u00C7\u00C3O** \uD83D\uDD34\uD83D\uDD34\uD83D\uDD34\nA mensagem que voc\u00EA gerou na tentativa anterior FOI REJEITADA por ser muito similar \u00E0s mensagens anteriores.\nVOC\u00CA PRECISA SER COMPLETAMENTE DIFERENTE AGORA!\n\nREGRAS EXTRAS PARA REGENERA\u00C7\u00C3O:\n1. Use uma ABORDAGEM TOTALMENTE DIFERENTE (se perguntou antes, agora ofere\u00E7a algo; se ofereceu, agora pergunte)\n2. N\u00C3O use NENHUMA das frases das mensagens anteriores\n3. Seja mais CURTO e DIRETO (m\u00E1ximo 1-2 frases)\n4. Tente um \u00C2NGULO NOVO: benef\u00EDcio diferente, informa\u00E7\u00E3o nova, pergunta criativa\n5. Se est\u00E1gio > 2, tente algo mais criativo como compartilhar um case, estat\u00EDstica interessante, ou novidade\n\nEXEMPLOS DE VARIA\u00C7\u00C3O (use como inspira\u00E7\u00E3o, n\u00E3o copie):\n- Est\u00E1gio 1: \"Ficou alguma d\u00FAvida sobre o que conversamos?\"\n- Est\u00E1gio 2: \"Conseguiu dar uma olhada naquilo?\"  \n- Est\u00E1gio 3: \"Surgiu algo novo aqui que pode te interessar...\"\n- Est\u00E1gio 4: \"T\u00F4 terminando o expediente, quer que eu te mande mais info amanh\u00E3?\"\n") : '';
                        prompt = "## \uD83D\uDCCC O QUE \u00C9 FOLLOW-UP INTELIGENTE\n\nFOLLOW-UP = AQUECER O LEAD de forma NATURAL, como se fosse um amigo ou vendedor experiente retomando contato.\n\n\uD83C\uDFAF **OBJETIVO**: Fazer o cliente RESPONDER sem parecer insistente ou rob\u00F3tico.\n\n---\n\n## \uD83C\uDFAF SUA IDENTIDADE\n- Voc\u00EA \u00E9: ".concat(agentName || 'Assistente Virtual', " da ").concat(companyName || 'empresa', "\n").concat(businessContext, "\n\n## \uD83D\uDCC5 MOMENTO ATUAL\n- Data: ").concat(todayStr, " (").concat(todayName, ")  \n- Hora: ").concat(brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), "\n- J\u00E1 conversamos HOJE: **").concat(conversedToday ? 'SIM - NÃO cumprimentar de novo!' : 'NÃO', "**\n\n## \uD83D\uDC64 CLIENTE: ").concat(clientName || 'Não identificado', "\n\n## \u23F0 AN\u00C1LISE TEMPORAL\n- CLIENTE respondeu h\u00E1: **").concat(minutesSinceClient, " minutos** (").concat(Math.floor(minutesSinceClient / 60), "h ").concat(minutesSinceClient % 60, "min)\n- N\u00D3S enviamos h\u00E1: **").concat(minutesSinceOur, " minutos**\n- Quem falou por \u00DALTIMO: **").concat(lastMessageWasOurs ? '⚠️ NÓS (cliente não respondeu)' : '🟢 CLIENTE', "**\n- Est\u00E1gio: ").concat(conversation.followupStage || 0, "\n").concat(hasNegativeFeedback ? '\n⛔ **ALERTA**: Cliente reclamou de repetições!' : '', "\n").concat(regenerationContext, "\n\n## \uD83D\uDCAC HIST\u00D3RICO DA CONVERSA (LEIA COM ATEN\u00C7\u00C3O!)\n").concat(historyFormatted.map(function (h) { return "[".concat(h.hora, "] ").concat(h.de, ": ").concat(h.mensagem); }).join('\n'), "\n\n## \uD83D\uDEAB MENSAGENS ANTERIORES (EVITE COMPLETAMENTE!)\n").concat(ourLastMessages.length > 0 ? ourLastMessages.map(function (m, i) { return "".concat(i + 1, ". \"").concat(m, "\""); }).join('\n') : '(nenhuma)', "\n\n## \uD83D\uDCCA CONTEXTO\n- \u00DAltima fala do cliente: \"").concat(lastClientText, "\"\n- Oferecemos demo/teste: ").concat(offeredDemo ? 'SIM' : 'NÃO', "\n- Falamos de pre\u00E7o: ").concat(offeredPrice ? 'SIM' : 'NÃO', "\n\n---\n\n## \uD83C\uDFAF REGRAS DE DECIS\u00C3O\n\n### SEND - Enviar quando:\n- Cliente parou de responder h\u00E1 mais de 2 horas\n- Temos algo NOVO para falar\n- Conversa n\u00E3o teve fechamento negativo\n\n### WAIT - Esperar quando:\n- Cliente respondeu h\u00E1 menos de 2 horas\n- N\u00F3s enviamos h\u00E1 menos de 2 horas sem resposta\n- N\u00E3o temos nada novo para agregar\n\n### ABORT - Cancelar quando:\n- Cliente disse N\u00C3O claramente\n- Cliente demonstrou irrita\u00E7\u00E3o\n- Cliente pediu para parar de enviar mensagens\n\n---\n\n## \u270D\uFE0F COMO ESCREVER A MENSAGEM\n\n\u26D4 **PROIBIDO** (NUNCA FA\u00C7A):\n").concat(conversedToday ? '- NUNCA use "Oi", "Olá", "Bom dia/tarde/noite" - JÁ CONVERSAMOS HOJE!' : '', "\n- NUNCA repita mensagens anteriores (nem com palavras diferentes)\n- NUNCA use frases gen\u00E9ricas como \"passo a passo\", \"entendi\", \"fico \u00E0 disposi\u00E7\u00E3o\"\n- NUNCA se apresente de novo (sem \"sou X da empresa Y\")\n- NUNCA seja rob\u00F3tico ou formal demais\n\n\u2705 **OBRIGAT\u00D3RIO** (SEMPRE FA\u00C7A):\n- Continue o ASSUNTO da conversa naturalmente\n- Seja CURTO (1-2 frases no m\u00E1ximo)\n- Pare\u00E7a HUMANO, como um amigo/vendedor real\n- Traga VALOR NOVO ou pergunta DIFERENTE\n- Use o NOME do cliente se souber\n\n\uD83C\uDF1F **EXEMPLOS DE MENSAGENS BOAS** (adapte ao contexto):\n- \"E a\u00ED [nome], conseguiu pensar sobre aquilo?\"\n- \"Vi que ficou uma d\u00FAvida sobre X, quer que eu explique melhor?\"\n- \"Surgiu uma novidade aqui que achei sua cara...\"\n- \"Opa, tava aqui pensando no seu caso...\"\n- \"[nome], r\u00E1pido: ainda faz sentido aquilo pra voc\u00EA?\"\n\n**Tom**: ").concat(toneMap[config.tone] || 'casual e amigável', "\n**Emojis**: ").concat(config.useEmojis ? 'Pode usar 1 emoji no máximo' : 'NÃO use emojis', "\n\n---\n\n## \uD83D\uDCCB RESPONDA APENAS EM JSON:\n{\"action\":\"send|wait|abort|schedule\",\"reason\":\"motivo curto\",\"message\":\"texto (s\u00F3 se send)\",\"scheduleDate\":\"YYYY-MM-DDTHH:MM (s\u00F3 se schedule)\"}");
                        _g.label = 6;
                    case 6:
                        _g.trys.push([6, 9, , 10]);
                        return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                    case 7:
                        mistral = _g.sent();
                        return [4 /*yield*/, mistral.chat.complete({
                                messages: [{ role: "user", content: prompt }],
                                temperature: 0.8 // Mais criatividade para variar mensagens
                            })];
                    case 8:
                        response = _g.sent();
                        rawContent = ((_f = (_e = (_d = response.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.content) || "";
                        content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
                        jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
                        parsed = JSON.parse(jsonStr);
                        // 🔧 NOVA VERIFICAÇÃO: Se quem falou por último foi o CLIENTE, não é follow-up!
                        // Follow-up é para retomar conversa quando CLIENTE não respondeu
                        if (!lastMessageWasOurs && minutesSinceClient < 120) {
                            console.log("\u23F8\uFE0F [FOLLOW-UP] Cliente respondeu h\u00E1 ".concat(minutesSinceClient, "min e foi o \u00FAltimo a falar - aguardando NOSSA resposta normal, n\u00E3o follow-up"));
                            return [2 /*return*/, { action: 'wait', reason: 'Cliente foi o último a falar - aguardar resposta normal da IA, não follow-up' }];
                        }
                        // Se action é schedule, validar a data
                        if (parsed.action === 'schedule' && parsed.scheduleDate) {
                            scheduleDate = new Date(parsed.scheduleDate);
                            if (isNaN(scheduleDate.getTime())) {
                                console.warn("\u26A0\uFE0F [FOLLOW-UP] Data inv\u00E1lida retornada pela IA: ".concat(parsed.scheduleDate));
                                return [2 /*return*/, { action: 'wait', reason: 'Data de agendamento inválida' }];
                            }
                            // Se a data é no passado, ajustar para o futuro
                            if (scheduleDate < now) {
                                scheduleDate.setDate(scheduleDate.getDate() + 7);
                            }
                            return [2 /*return*/, {
                                    action: 'schedule',
                                    reason: parsed.reason || 'Cliente combinou data',
                                    scheduleDate: scheduleDate.toISOString(),
                                    context: parsed.strategy
                                }];
                        }
                        message_1 = parsed.message;
                        if (message_1) {
                            // Remover colchetes e conteúdo problemático
                            message_1 = message_1.replace(/\[.*?\]/g, '').trim();
                            // Remover opções com barra
                            message_1 = message_1.replace(/\b\w+\/\w+(\/\w+)*/g, '').trim();
                            // Remover "Áudio" do final
                            message_1 = message_1.replace(/\s*Áudio\s*$/gi, '').trim();
                            message_1 = message_1.replace(/\s*Audio\s*$/gi, '').trim();
                            // 🔧 FIX 2026-02-26: Remover padrões de traços que parecem IA/GPT
                            // Traços consecutivos (---, -----, etc)
                            message_1 = message_1.replace(/\-{2,}/g, '');
                            // Bullet dash no início de linha: "- item" → "• item"  
                            message_1 = message_1.replace(/^[\s]*-\s+/gm, '• ');
                            // Em-dash como separador: " — " → ", "
                            message_1 = message_1.replace(/\s*—\s*/g, ', ');
                            // En-dash como separador: " – " → ", "
                            message_1 = message_1.replace(/\s*–\s*/g, ', ');
                            // Traço isolado como separador: " - " → ", " (cuidado com palavras compostas)
                            message_1 = message_1.replace(/(?<=[a-záéíóúàâêôãõ\s])\s+-\s+(?=[a-záéíóúàâêôãõA-Z])/g, ', ');
                            // Separadores como ━━━, ═══, ─── 
                            message_1 = message_1.replace(/^[\s]*[━═─_*]{3,}[\s]*$/gm, '');
                            // Limpar vírgulas duplicadas e espaços extras
                            message_1 = message_1.replace(/,\s*,/g, ',');
                            message_1 = message_1.replace(/^\s*,\s*/gm, '');
                            // Limpar espaços duplos
                            message_1 = message_1.replace(/\s+/g, ' ').trim();
                            isSimilar = ourLastMessages.some(function (prev) {
                                if (!prev)
                                    return false;
                                var similarity = _this.calculateTextSimilarity(message_1, prev);
                                console.log("\uD83D\uDCCA Similaridade com msg anterior: ".concat((similarity * 100).toFixed(1), "%"));
                                return similarity > 0.6; // 60% similar = muito parecido (MAIS RESTRITIVO)
                            });
                            if (isSimilar) {
                                console.warn("\u26A0\uFE0F [FOLLOW-UP] Mensagem SIMILAR detectada (>60%) - N\u00C3O ENVIANDO");
                                return [2 /*return*/, { action: 'wait', reason: 'Mensagem muito similar à anterior - evitando repetição' }];
                            }
                            sameStructure = ourLastMessages.some(function (prev) {
                                if (!prev)
                                    return false;
                                // Se começa igual (primeiras 30 chars) ou termina igual (últimas 30 chars)
                                var msgStart = message_1.substring(0, 30).toLowerCase();
                                var msgEnd = message_1.substring(Math.max(0, message_1.length - 30)).toLowerCase();
                                var prevStart = prev.substring(0, 30).toLowerCase();
                                var prevEnd = prev.substring(Math.max(0, prev.length - 30)).toLowerCase();
                                var startSame = msgStart === prevStart && msgStart.length > 12;
                                var endSame = msgEnd === prevEnd && msgEnd.length > 12;
                                if (startSame || endSame) {
                                    console.log("\uD83D\uDCCA Estrutura similar: in\u00EDcio=".concat(startSame, ", fim=").concat(endSame));
                                }
                                return startSame || endSame;
                            });
                            if (sameStructure) {
                                console.warn("\u26A0\uFE0F [FOLLOW-UP] Estrutura REPETITIVA - N\u00C3O ENVIANDO");
                                return [2 /*return*/, { action: 'wait', reason: 'Estrutura de mensagem repetitiva - evitando irritar cliente' }];
                            }
                            hasExactPhrase = ourLastMessages.some(function (prev) {
                                if (!prev || prev.length < 20)
                                    return false;
                                // Dividir em frases e verificar se alguma é igual
                                var prevPhrases = prev.split(/[.!?]/).filter(function (p) { return p.trim().length > 12; });
                                var newPhrases = message_1.split(/[.!?]/).filter(function (p) { return p.trim().length > 12; });
                                return newPhrases.some(function (np) {
                                    return prevPhrases.some(function (pp) {
                                        return np.trim().toLowerCase() === pp.trim().toLowerCase();
                                    });
                                });
                            });
                            if (hasExactPhrase) {
                                console.warn("\u26A0\uFE0F [FOLLOW-UP] Frase EXATA repetida - N\u00C3O ENVIANDO");
                                return [2 /*return*/, { action: 'wait', reason: 'Contém frase exatamente igual a anterior' }];
                            }
                            keyPhrases = ['entendi', 'vamos resolver', 'passo a passo', 'fico feliz', 'estou à disposição'];
                            msgLower = message_1.toLowerCase();
                            _loop_1 = function (phrase) {
                                var usedBefore = ourLastMessages.some(function (prev) { return prev === null || prev === void 0 ? void 0 : prev.toLowerCase().includes(phrase); });
                                if (usedBefore && msgLower.includes(phrase)) {
                                    console.warn("\u26A0\uFE0F [FOLLOW-UP] Frase \"".concat(phrase, "\" j\u00E1 usada antes - N\u00C3O ENVIANDO"));
                                    return { value: { action: 'wait', reason: "Frase \"".concat(phrase, "\" repetida - gerar mensagem diferente") } };
                                }
                            };
                            for (_i = 0, keyPhrases_1 = keyPhrases; _i < keyPhrases_1.length; _i++) {
                                phrase = keyPhrases_1[_i];
                                state_1 = _loop_1(phrase);
                                if (typeof state_1 === "object")
                                    return [2 /*return*/, state_1.value];
                            }
                        }
                        return [2 /*return*/, {
                                action: parsed.action || 'wait',
                                reason: parsed.reason || 'Decisão da IA',
                                message: message_1,
                                context: parsed.strategy
                            }];
                    case 9:
                        e_3 = _g.sent();
                        console.error("Erro na análise de IA:", e_3);
                        return [2 /*return*/, { action: 'wait', reason: "Erro na análise de IA" }];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Calcula similaridade entre dois textos (0 a 1)
     */
    UserFollowUpService.prototype.calculateTextSimilarity = function (text1, text2) {
        var words1 = text1.toLowerCase().split(/\s+/);
        var words2 = text2.toLowerCase().split(/\s+/);
        if (words1.length === 0 || words2.length === 0)
            return 0;
        var matches = 0;
        for (var _i = 0, words1_1 = words1; _i < words1_1.length; _i++) {
            var word = words1_1[_i];
            if (word.length > 3 && words2.includes(word))
                matches++;
        }
        return matches / Math.max(words1.length, words2.length);
    };
    /**
     * Verifica se está em horário comercial (timezone Brasil)
     */
    UserFollowUpService.prototype.isBusinessHours = function (config) {
        // Usar timezone do Brasil
        var now = new Date();
        var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        var currentDay = brazilTime.getDay(); // 0 = domingo
        var currentHour = brazilTime.getHours();
        var currentMin = brazilTime.getMinutes();
        var currentTime = "".concat(currentHour.toString().padStart(2, '0'), ":").concat(currentMin.toString().padStart(2, '0'));
        var businessDays = config.businessDays || [1, 2, 3, 4, 5];
        if (!businessDays.includes(currentDay)) {
            console.log("\u23F0 [FOLLOW-UP] Dia ".concat(currentDay, " n\u00E3o est\u00E1 nos dias \u00FAteis ").concat(JSON.stringify(businessDays)));
            return false;
        }
        var start = String(config.businessHoursStart || "09:00").slice(0, 5);
        var end = String(config.businessHoursEnd || "18:00").slice(0, 5);
        var isOpen = currentTime >= start && currentTime <= end;
        console.log("\u23F0 [FOLLOW-UP] Hor\u00E1rio atual: ".concat(currentTime, ", Hor\u00E1rio comercial: ").concat(start, "-").concat(end, ", Aberto: ").concat(isOpen));
        return isOpen;
    };
    /**
     * Calcula próximo horário comercial disponível (timezone Brasil)
     */
    UserFollowUpService.prototype.getNextBusinessTime = function (config) {
        var now = new Date();
        var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        var businessDays = config.businessDays || [1, 2, 3, 4, 5];
        var start = String(config.businessHoursStart || "09:00").slice(0, 5);
        var _a = start.split(':').map(Number), startHour = _a[0], startMin = _a[1];
        // Próximo dia útil às 9h
        var next = new Date(brazilTime);
        next.setHours(startHour, startMin, 0, 0);
        // Se já passou do horário de início hoje, ir para amanhã
        if (brazilTime >= next) {
            next.setDate(next.getDate() + 1);
        }
        // Avançar até encontrar um dia útil
        while (!businessDays.includes(next.getDay())) {
            next.setDate(next.getDate() + 1);
        }
        console.log("\uD83D\uDCC5 [FOLLOW-UP] Pr\u00F3ximo hor\u00E1rio comercial: ".concat(next.toLocaleString('pt-BR')));
        return next;
    };
    UserFollowUpService.prototype.alignDateToBusinessWindow = function (candidate, config) {
        if (!(config === null || config === void 0 ? void 0 : config.respectBusinessHours)) {
            return candidate;
        }
        var businessDays = config.businessDays || [1, 2, 3, 4, 5];
        var start = String(config.businessHoursStart || "09:00").slice(0, 5);
        var end = String(config.businessHoursEnd || "18:00").slice(0, 5);
        var _a = start.split(':').map(Number), startHour = _a[0], startMin = _a[1];
        var _b = end.split(':').map(Number), endHour = _b[0], endMin = _b[1];
        var startMinutes = startHour * 60 + startMin;
        var endMinutes = endHour * 60 + endMin;
        var next = new Date(candidate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        while (true) {
            var day = next.getDay();
            var currentMinutes = next.getHours() * 60 + next.getMinutes();
            var isAllowedDay = businessDays.includes(day);
            var isAllowedTime = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
            if (isAllowedDay && isAllowedTime) {
                return next;
            }
            next.setHours(startHour, startMin, 0, 0);
            if (!isAllowedDay || currentMinutes > endMinutes) {
                next.setDate(next.getDate() + 1);
            }
            while (!businessDays.includes(next.getDay())) {
                next.setDate(next.getDate() + 1);
            }
        }
    };
    UserFollowUpService.prototype.buildMissingScheduleDate = function (conversation, config, now) {
        if (now === void 0) { now = new Date(); }
        var intervals = (config === null || config === void 0 ? void 0 : config.intervalsMinutes) || DEFAULT_INTERVALS;
        var currentStage = Math.max(0, Number(conversation.followupStage || 0));
        var baseTimestamp = conversation.lastMessageTime || conversation.createdAt || now;
        var baseDate = new Date(baseTimestamp);
        var candidate;
        if (currentStage >= intervals.length) {
            if (!(config === null || config === void 0 ? void 0 : config.infiniteLoop)) {
                return null;
            }
            var minDays = config.infiniteLoopMinDays || 15;
            var maxDays = config.infiniteLoopMaxDays || 30;
            var randomDays = Math.floor(Math.random() * (maxDays - minDays + 1) + minDays);
            candidate = new Date(baseDate.getTime() + randomDays * 24 * 60 * 60 * 1000);
        }
        else {
            var delayMinutes = intervals[currentStage] || intervals[0] || 10;
            candidate = new Date(baseDate.getTime() + delayMinutes * 60 * 1000);
        }
        if (candidate < now) {
            candidate = new Date(now.getTime() + 60 * 1000);
        }
        return addRandomSeconds(this.alignDateToBusinessWindow(candidate, config));
    };
    UserFollowUpService.prototype.repairMissingSchedules = function () {
        return __awaiter(this, arguments, void 0, function (limit, onlyUserId) {
            var activeConversations, missingSchedules, repaired, disabled, skipped, _i, missingSchedules_1, conversation, userId, config, nextDate;
            var _a;
            if (limit === void 0) { limit = 50000; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.conversations.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true),
                            with: {
                                connection: {
                                    with: {
                                        user: true,
                                    }
                                }
                            },
                            limit: limit
                        })];
                    case 1:
                        activeConversations = _b.sent();
                        missingSchedules = activeConversations.filter(function (conversation) {
                            var _a;
                            if (conversation.nextFollowupAt)
                                return false;
                            var userId = (_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId;
                            if (onlyUserId && userId !== onlyUserId)
                                return false;
                            return true;
                        });
                        repaired = 0;
                        disabled = 0;
                        skipped = 0;
                        _i = 0, missingSchedules_1 = missingSchedules;
                        _b.label = 2;
                    case 2:
                        if (!(_i < missingSchedules_1.length)) return [3 /*break*/, 12];
                        conversation = missingSchedules_1[_i];
                        userId = (_a = conversation.connection) === null || _a === void 0 ? void 0 : _a.userId;
                        if (!!userId) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Conexao removida - sem userId")];
                    case 3:
                        _b.sent();
                        disabled += 1;
                        return [3 /*break*/, 11];
                    case 4: return [4 /*yield*/, this.getFollowupConfig(userId)];
                    case 5:
                        config = _b.sent();
                        if (!!(config === null || config === void 0 ? void 0 : config.isEnabled)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Usuario desativou follow-up global")];
                    case 6:
                        _b.sent();
                        disabled += 1;
                        return [3 /*break*/, 11];
                    case 7:
                        nextDate = this.buildMissingScheduleDate(conversation, config);
                        if (!!nextDate) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.disableFollowUp(conversation.id, "Sequencia completa")];
                    case 8:
                        _b.sent();
                        disabled += 1;
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                            .set({
                            nextFollowupAt: nextDate,
                            followupDisabledReason: null,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 10:
                        _b.sent();
                        repaired += 1;
                        _b.label = 11;
                    case 11:
                        _i++;
                        return [3 /*break*/, 2];
                    case 12: return [2 /*return*/, {
                            scanned: missingSchedules.length,
                            repaired: repaired,
                            disabled: disabled,
                            skipped: skipped,
                        }];
                }
            });
        });
    };
    /**
     * Avança para o próximo estágio de follow-up
     */
    UserFollowUpService.prototype.advanceToNextStage = function (conversation, config) {
        return __awaiter(this, void 0, void 0, function () {
            var currentStage, nextStage, intervals, nextDate, minDays, maxDays, randomDays, delayMinutes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        currentStage = conversation.followupStage || 0;
                        nextStage = currentStage + 1;
                        intervals = config.intervalsMinutes || DEFAULT_INTERVALS;
                        if (!(nextStage >= intervals.length)) return [3 /*break*/, 4];
                        if (!config.infiniteLoop) return [3 /*break*/, 1];
                        minDays = config.infiniteLoopMinDays || 15;
                        maxDays = config.infiniteLoopMaxDays || 30;
                        randomDays = Math.floor(Math.random() * (maxDays - minDays + 1) + minDays);
                        nextDate = addRandomSeconds(new Date(Date.now() + randomDays * 24 * 60 * 60 * 1000));
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] Loop infinito: pr\u00F3ximo em ".concat(randomDays, " dias"));
                        return [3 /*break*/, 3];
                    case 1: 
                    // Desativar follow-up
                    return [4 /*yield*/, this.disableFollowUp(conversation.id, "Sequência completa")];
                    case 2:
                        // Desativar follow-up
                        _a.sent();
                        return [2 /*return*/];
                    case 3: return [3 /*break*/, 5];
                    case 4:
                        delayMinutes = intervals[nextStage];
                        nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
                        console.log("\u23F0 [USER-FOLLOW-UP] Est\u00E1gio ".concat(currentStage, " \u2192 ").concat(nextStage, ", intervalo: ").concat(delayMinutes, " minutos"));
                        _a.label = 5;
                    case 5: 
                    // 🔧 FIX 2026-02-25: SEMPRE limpar followupDisabledReason ao avançar estágio.
                    // Sem isso, uma reason stale de 'Aguardando conexão' pode fazer clearConnectionWaitingStatus
                    // SOBRESCREVER nextFollowupAt com now+2min após PM2 restart, causando follow-ups em rajada.
                    return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                            .set({
                            followupStage: nextStage,
                            nextFollowupAt: nextDate,
                            followupDisabledReason: null
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 6:
                        // 🔧 FIX 2026-02-25: SEMPRE limpar followupDisabledReason ao avançar estágio.
                        // Sem isso, uma reason stale de 'Aguardando conexão' pode fazer clearConnectionWaitingStatus
                        // SOBRESCREVER nextFollowupAt com now+2min após PM2 restart, causando follow-ups em rajada.
                        _a.sent();
                        console.log("\uD83D\uDCC5 [USER-FOLLOW-UP] Pr\u00F3ximo follow-up agendado para ".concat(nextDate.toLocaleString(), " (stage ").concat(nextStage, ", reason limpa)"));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Agenda próximo follow-up para uma data específica
     */
    UserFollowUpService.prototype.scheduleNextFollowUp = function (conversationId, date) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                            .set({ nextFollowupAt: date })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Desativa follow-up para uma conversa
     */
    UserFollowUpService.prototype.disableFollowUp = function (conversationId_1) {
        return __awaiter(this, arguments, void 0, function (conversationId, reason) {
            if (reason === void 0) { reason = "Desativado"; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Desativando para conversa ".concat(conversationId, ". Motivo: ").concat(reason));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupActive: false,
                                nextFollowupAt: null,
                                followupDisabledReason: reason
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Ativa follow-up para uma conversa
     * 🔧 FIX CRÍTICO: NÃO resetar se follow-up já está ativo!
     * Apenas ativar se estava desativado. Isso evita que o agent response
     * resete o timer a cada mensagem, criando loop de spam.
     */
    UserFollowUpService.prototype.enableFollowUp = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation, userId, config, reason, isManuallyDisabled, intervals, delayMinutes, nextDate;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId),
                            with: { connection: true }
                        })];
                    case 1:
                        conversation = _b.sent();
                        if (!((_a = conversation === null || conversation === void 0 ? void 0 : conversation.connection) === null || _a === void 0 ? void 0 : _a.userId)) {
                            console.log("\u26A0\uFE0F [USER-FOLLOW-UP] N\u00E3o foi poss\u00EDvel ativar follow-up: userId n\u00E3o encontrado");
                            return [2 /*return*/];
                        }
                        userId = conversation.connection.userId;
                        return [4 /*yield*/, this.getFollowupConfig(userId)];
                    case 2:
                        config = _b.sent();
                        // 🔧 FIX CRÍTICO 2026-02-26: Verificar config GLOBAL antes de qualquer re-ativação!
                        // Se o usuário desativou o follow-up globalmente na página /followup,
                        // NUNCA reativar automaticamente, independente do motivo de desativação.
                        if (!(config === null || config === void 0 ? void 0 : config.isEnabled)) {
                            console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up GLOBAL desabilitado para usu\u00E1rio ".concat(userId, ". N\u00C3O reativando conversa ").concat(conversationId, "."));
                            return [2 /*return*/];
                        }
                        // 🔧 FIX CRÍTICO: Se follow-up JÁ está ativo, NÃO resetar!
                        // Isso evita que cada resposta do agente resete o timer para 10 min,
                        // criando um loop infinito de follow-ups a cada 10 minutos.
                        if (conversation.followupActive && conversation.nextFollowupAt) {
                            console.log("\u2139\uFE0F [USER-FOLLOW-UP] Follow-up j\u00E1 ativo para ".concat(conversationId, " (stage=").concat(conversation.followupStage, ", next=").concat(conversation.nextFollowupAt, "). N\u00C3O resetando."));
                            return [2 /*return*/];
                        }
                        // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
                        // Follow-up pode ser ativado/desativado independentemente do estado da IA
                        // A IA e o Follow-up são sistemas separados e independentes!
                        // 
                        // Follow-up é controlado por:
                        // 1. Toggle global em /followup (followup_configs.is_enabled)
                        // 2. Toggle individual na conversa (conversations.followupActive)
                        //
                        // A desativação da IA (isAgentEnabled) NÃO deve afetar o follow-up!
                        // 🔧 FIX BUG REATIVAÇÃO 2026-02-26: Se foi desativado MANUALMENTE pelo usuário OU pelo sistema,
                        // NÃO reativar automaticamente. Checar múltiplos padrões de motivo de desativação.
                        if (conversation.followupDisabledReason) {
                            reason = conversation.followupDisabledReason;
                            isManuallyDisabled = reason.includes('Desativado pelo usuário') ||
                                reason.includes('Usuário desativou') ||
                                reason.includes('Desativado manualmente') ||
                                reason.includes('Conta suspensa') ||
                                reason.includes('lista de exclusão') ||
                                reason.includes('Sequência completa') ||
                                reason.includes('Conexão removida');
                            if (isManuallyDisabled) {
                                console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para ".concat(conversationId, ". Motivo: ").concat(reason, ". N\u00C3O reativando automaticamente."));
                                return [2 /*return*/];
                            }
                        }
                        intervals = (config === null || config === void 0 ? void 0 : config.intervalsMinutes) || DEFAULT_INTERVALS;
                        delayMinutes = intervals[0] || 10;
                        nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupActive: true,
                                followupStage: 0,
                                nextFollowupAt: nextDate,
                                followupDisabledReason: null
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                    case 3:
                        _b.sent();
                        console.log("\u2705 [USER-FOLLOW-UP] Ativado para conversa ".concat(conversationId));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reseta o ciclo quando o cliente responde
     * TÉCNICA DE FOLLOW-UP: Quando cliente responde, NÃO incomodar imediatamente.
     * Esperar um tempo maior (2h) para dar espaço à conversa fluir naturalmente.
     * Se o cliente está ATIVO conversando, não faz sentido mandar follow-up.
     */
    UserFollowUpService.prototype.resetFollowUpCycle = function (conversationId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var conversation, userId, config, disableReason, isIntentionallyDisabled, delayMinutes, twoHoursFromNow, currentStage, existingNext;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.conversations.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId),
                            with: { connection: true }
                        })];
                    case 1:
                        conversation = _b.sent();
                        if (!((_a = conversation === null || conversation === void 0 ? void 0 : conversation.connection) === null || _a === void 0 ? void 0 : _a.userId)) {
                            console.log("\u26A0\uFE0F [USER-FOLLOW-UP] N\u00E3o foi poss\u00EDvel resetar follow-up: userId n\u00E3o encontrado");
                            return [2 /*return*/];
                        }
                        userId = conversation.connection.userId;
                        return [4 /*yield*/, this.getFollowupConfig(userId)];
                    case 2:
                        config = _b.sent();
                        // 🔧 FIX CRÍTICO 2026-02-26: Verificar config GLOBAL ANTES de tudo!
                        // Se o usuário desativou o follow-up globalmente na página /followup,
                        // NUNCA resetar/reativar automaticamente.
                        if (!(config === null || config === void 0 ? void 0 : config.isEnabled)) {
                            console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up GLOBAL desativado para usu\u00E1rio ".concat(userId, ". N\u00C3O resetando ciclo para ").concat(conversationId, "."));
                            return [2 /*return*/];
                        }
                        // 🔧 FIX CRÍTICO: NÃO reativar se foi desativado MANUALMENTE pelo usuário
                        // Checar tanto followupActive quanto followupDisabledReason
                        if (!conversation.followupActive) {
                            console.log("\u2139\uFE0F [USER-FOLLOW-UP] Follow-up estava desativado para ".concat(conversationId, ", n\u00E3o resetando automaticamente"));
                            return [2 /*return*/];
                        }
                        // 🔧 FIX BUG REATIVAÇÃO 2026-02-26: Se existe motivo de desativação que indica desativação intencional,
                        // NUNCA reativar automaticamente. Checar TODOS os padrões possíveis.
                        if (conversation.followupDisabledReason) {
                            disableReason = conversation.followupDisabledReason;
                            isIntentionallyDisabled = disableReason.includes('Desativado pelo usuário') ||
                                disableReason.includes('Usuário desativou') ||
                                disableReason.includes('Desativado manualmente') ||
                                disableReason.includes('Conta suspensa') ||
                                disableReason.includes('lista de exclusão') ||
                                disableReason.includes('Sequência completa') ||
                                disableReason.includes('Conexão removida');
                            if (isIntentionallyDisabled) {
                                console.log("\uD83D\uDED1 [USER-FOLLOW-UP] Follow-up DESATIVADO intencionalmente para ".concat(conversationId, ". Motivo: ").concat(disableReason, ". N\u00C3O resetando."));
                                return [2 /*return*/];
                            }
                        }
                        delayMinutes = 120;
                        twoHoursFromNow = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
                        currentStage = conversation.followupStage || 0;
                        existingNext = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
                        if (existingNext && existingNext > twoHoursFromNow) {
                            console.log("\u2139\uFE0F [USER-FOLLOW-UP] ".concat(reason || 'Cliente respondeu', ". Follow-up j\u00E1 agendado para ").concat(existingNext.toLocaleString(), " (> 2h). Mantendo agendamento existente para ").concat(conversationId, " (stage ").concat(currentStage, ")."));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupActive: true,
                                // 🔧 MANTER estágio atual - NÃO resetar para 0!
                                // followupStage permanece inalterado (não incluído no set)
                                nextFollowupAt: twoHoursFromNow,
                                followupDisabledReason: null
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                    case 3:
                        _b.sent();
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] ".concat(reason || 'Cliente respondeu', ". Ciclo pausado por 2h para ").concat(conversationId, " (stage ").concat(currentStage, " mantido, dar espa\u00E7o \u00E0 conversa)"));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Agenda um follow-up manual para uma data/hora específica
     */
    UserFollowUpService.prototype.scheduleManualFollowUp = function (conversationId, scheduledFor, note) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                            .set({
                            followupActive: true,
                            followupStage: -1, // -1 indica agendamento manual
                            nextFollowupAt: scheduledFor,
                            followupDisabledReason: note ? "\uD83D\uDCC5 Agendado: ".concat(note) : '📅 Agendamento manual'
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                    case 1:
                        _a.sent();
                        console.log("\uD83D\uDCC5 [USER-FOLLOW-UP] Agendamento manual criado para ".concat(conversationId, ": ").concat(scheduledFor.toLocaleString()));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Log de follow-up
     */
    UserFollowUpService.prototype.logFollowUp = function (conversation, userId, status, messageContent, aiDecision, errorReason) {
        return __awaiter(this, void 0, void 0, function () {
            var error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.insert(schema_1.userFollowupLogs).values({
                                conversationId: conversation.id,
                                userId: userId,
                                contactNumber: conversation.contactNumber,
                                status: status,
                                messageContent: messageContent,
                                aiDecision: aiDecision,
                                stage: conversation.followupStage || 0,
                                errorReason: errorReason
                            })];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_4 = _a.sent();
                        console.error("Erro ao logar follow-up:", error_4);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Busca logs de follow-up
     */
    UserFollowUpService.prototype.getFollowUpLogs = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit) {
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.userFollowupLogs.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.userFollowupLogs.userId, userId),
                            orderBy: function (logs, _a) {
                                var desc = _a.desc;
                                return [desc(logs.executedAt)];
                            },
                            limit: limit
                        })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Estatísticas de follow-up do usuário
     */
    UserFollowUpService.prototype.getFollowUpStats = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var logs, pendingConversations, userPending;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.userFollowupLogs.findMany({
                            where: (0, drizzle_orm_1.eq)(schema_1.userFollowupLogs.userId, userId)
                        })];
                    case 1:
                        logs = _a.sent();
                        return [4 /*yield*/, db_1.db.query.conversations.findMany({
                                where: (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true),
                                with: {
                                    connection: true
                                }
                            })];
                    case 2:
                        pendingConversations = _a.sent();
                        userPending = pendingConversations.filter(function (c) { var _a; return ((_a = c.connection) === null || _a === void 0 ? void 0 : _a.userId) === userId; });
                        return [2 /*return*/, {
                                totalSent: logs.filter(function (l) { return l.status === 'sent'; }).length,
                                totalFailed: logs.filter(function (l) { return l.status === 'failed'; }).length,
                                totalCancelled: logs.filter(function (l) { return l.status === 'cancelled'; }).length,
                                totalSkipped: logs.filter(function (l) { return l.status === 'skipped'; }).length,
                                pending: userPending.length,
                                scheduledToday: userPending.filter(function (c) {
                                    if (!c.nextFollowupAt)
                                        return false;
                                    var today = new Date();
                                    var scheduled = new Date(c.nextFollowupAt);
                                    return scheduled.toDateString() === today.toDateString();
                                }).length
                            }];
                }
            });
        });
    };
    /**
     * Lista conversas com follow-up ativo do usuário
     */
    UserFollowUpService.prototype.getPendingFollowUps = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var allPending;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db_1.db.query.conversations.findMany({
                            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.nextFollowupAt)),
                            with: {
                                connection: true
                            },
                            orderBy: function (conv, _a) {
                                var asc = _a.asc;
                                return [asc(conv.nextFollowupAt)];
                            }
                        })];
                    case 1:
                        allPending = _a.sent();
                        return [2 /*return*/, allPending.filter(function (c) { var _a; return ((_a = c.connection) === null || _a === void 0 ? void 0 : _a.userId) === userId; })];
                }
            });
        });
    };
    /**
     * Reorganiza todos os follow-ups pendentes de um usuário
     * Recalcula as datas baseado na configuração atual (horários, dias úteis, etc.)
     */
    UserFollowUpService.prototype.reorganizeAllFollowups = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var config, pendingConversations, userConversations, reorganized, skipped, repairResult, intervals, now, _i, userConversations_1, conversation, stage, delayMinutes, baseDate, newDate, nextBusinessTime, brazilTime, day, hours, minutes, currentMinutes, businessDays, _a, startHour, startMin, _b, endHour, endMin, startMinutes, endMinutes, nextBusinessTime, error_5;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] Reorganizando todos os follow-ups para usu\u00E1rio ".concat(userId));
                        return [4 /*yield*/, this.getFollowupConfig(userId)];
                    case 1:
                        config = _c.sent();
                        if (!config || !config.isEnabled) {
                            console.log("\u26A0\uFE0F [USER-FOLLOW-UP] Follow-up desabilitado para usu\u00E1rio ".concat(userId));
                            return [2 /*return*/, { reorganized: 0, skipped: 0 }];
                        }
                        return [4 /*yield*/, db_1.db.query.conversations.findMany({
                                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.nextFollowupAt)),
                                with: {
                                    connection: true
                                }
                            })];
                    case 2:
                        pendingConversations = _c.sent();
                        userConversations = pendingConversations.filter(function (c) { var _a; return ((_a = c.connection) === null || _a === void 0 ? void 0 : _a.userId) === userId; });
                        reorganized = 0;
                        skipped = 0;
                        return [4 /*yield*/, this.repairMissingSchedules(50000, userId)];
                    case 3:
                        repairResult = _c.sent();
                        intervals = config.intervalsMinutes || DEFAULT_INTERVALS;
                        now = new Date();
                        _i = 0, userConversations_1 = userConversations;
                        _c.label = 4;
                    case 4:
                        if (!(_i < userConversations_1.length)) return [3 /*break*/, 9];
                        conversation = userConversations_1[_i];
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 7, , 8]);
                        if (!conversation.nextFollowupAt) {
                            return [3 /*break*/, 8];
                        }
                        stage = conversation.followupStage || 0;
                        delayMinutes = intervals[stage] || intervals[intervals.length - 1] || 10;
                        baseDate = conversation.lastMessageTime
                            ? new Date(conversation.lastMessageTime)
                            : now;
                        newDate = new Date(baseDate.getTime() + delayMinutes * 60 * 1000);
                        // Se a nova data já passou, usar a partir de agora
                        if (newDate < now) {
                            newDate = new Date(now.getTime() + 1 * 60 * 1000); // 1 minuto a partir de agora
                        }
                        // Verificar horário comercial e ajustar se necessário
                        if (!this.isBusinessHours(config)) {
                            nextBusinessTime = this.getNextBusinessTime(config);
                            if (nextBusinessTime && nextBusinessTime > newDate) {
                                newDate = nextBusinessTime;
                            }
                        }
                        else {
                            brazilTime = new Date(newDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                            day = brazilTime.getDay();
                            hours = brazilTime.getHours();
                            minutes = brazilTime.getMinutes();
                            currentMinutes = hours * 60 + minutes;
                            businessDays = config.businessDays || [1, 2, 3, 4, 5];
                            _a = (config.businessHoursStart || '09:00').split(':').map(Number), startHour = _a[0], startMin = _a[1];
                            _b = (config.businessHoursEnd || '18:00').split(':').map(Number), endHour = _b[0], endMin = _b[1];
                            startMinutes = startHour * 60 + startMin;
                            endMinutes = endHour * 60 + endMin;
                            if (!businessDays.includes(day) || currentMinutes < startMinutes || currentMinutes >= endMinutes) {
                                nextBusinessTime = this.getNextBusinessTime(config);
                                if (nextBusinessTime) {
                                    newDate = nextBusinessTime;
                                }
                            }
                        }
                        // Adicionar segundos aleatórios para parecer mais humano
                        newDate = addRandomSeconds(this.alignDateToBusinessWindow(newDate, config));
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                nextFollowupAt: newDate,
                                followupDisabledReason: null
                            })
                                .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversation.id))];
                    case 6:
                        _c.sent();
                        reorganized++;
                        console.log("\u2705 [USER-FOLLOW-UP] Reorganizado: ".concat(conversation.contactNumber, " -> ").concat(newDate.toISOString()));
                        return [3 /*break*/, 8];
                    case 7:
                        error_5 = _c.sent();
                        console.error("\u274C [USER-FOLLOW-UP] Erro ao reorganizar ".concat(conversation.id, ":"), error_5);
                        skipped++;
                        return [3 /*break*/, 8];
                    case 8:
                        _i++;
                        return [3 /*break*/, 4];
                    case 9:
                        console.log("\uD83D\uDD04 [USER-FOLLOW-UP] Reorganiza\u00E7\u00E3o conclu\u00EDda: ".concat(reorganized, " reorganizados, ").concat(skipped, " ignorados"));
                        return [2 /*return*/, { reorganized: reorganized + repairResult.repaired, skipped: skipped + repairResult.disabled + repairResult.skipped }];
                }
            });
        });
    };
    /**
     * Limpa o status de "aguardando conexão" para todas as conversas de uma conexão específica
     * Chamado quando o WhatsApp reconecta para permitir que os follow-ups sejam processados novamente
     *
     * 🚀 OTIMIZADO: Faz apenas 1 UPDATE direto sem SELECT prévio
     */
    UserFollowUpService.prototype.clearConnectionWaitingStatus = function (connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var nextDate, futureThreshold, result, futureClean, count, futureCount, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        nextDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
                        futureThreshold = new Date(Date.now() + 10 * 60 * 1000);
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupDisabledReason: null,
                                nextFollowupAt: nextDate
                            })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.eq)(schema_1.conversations.followupDisabledReason, '🔄 Aguardando conexão WhatsApp...'), (0, drizzle_orm_1.lte)(schema_1.conversations.nextFollowupAt, futureThreshold)))
                                .returning({ id: schema_1.conversations.id })];
                    case 1:
                        result = _a.sent();
                        return [4 /*yield*/, db_1.db.update(schema_1.conversations)
                                .set({
                                followupDisabledReason: null
                            })
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.conversations.followupActive, true), (0, drizzle_orm_1.eq)(schema_1.conversations.followupDisabledReason, '🔄 Aguardando conexão WhatsApp...')))
                                .returning({ id: schema_1.conversations.id })];
                    case 2:
                        futureClean = _a.sent();
                        count = result.length;
                        futureCount = futureClean.length;
                        if (count > 0 || futureCount > 0) {
                            console.log("\uD83D\uDD04 [USER-FOLLOW-UP] ".concat(count, " conversas reativadas (now+2min) + ").concat(futureCount, " limpas (mantendo agenda) para conex\u00E3o ").concat(connectionId));
                        }
                        return [2 /*return*/, count];
                    case 3:
                        error_6 = _a.sent();
                        console.error("\u274C [USER-FOLLOW-UP] Erro ao limpar status de aguardo:", error_6);
                        return [2 /*return*/, 0];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return UserFollowUpService;
}());
exports.UserFollowUpService = UserFollowUpService;
// Singleton
exports.userFollowUpService = new UserFollowUpService();
