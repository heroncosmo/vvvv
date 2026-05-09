"use strict";
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║           🛡️ SISTEMA ANTI-REENVIO - DEDUPLICAÇÃO DE MENSAGENS              ║
 * ║                                                                              ║
 * ║  Este serviço GARANTE que mensagens NUNCA sejam reenviadas, mesmo após:     ║
 * ║  - Instabilidade na conexão WhatsApp (conecta/desconecta)                   ║
 * ║  - Restart do servidor Railway                                               ║
 * ║  - Reconexão após desconexão temporária                                     ║
 * ║  - Crash e recovery do sistema                                               ║
 * ║                                                                              ║
 * ║  ARQUITETURA:                                                                ║
 * ║  1. Cache em memória (rápido, mas perde no restart)                         ║
 * ║  2. Persistência no Supabase (sobrevive restart)                            ║
 * ║  3. Verificação dupla: memória primeiro, banco depois                       ║
 * ║                                                                              ║
 * ║  USO: TODOS os pontos de envio DEVEM chamar este serviço antes de enviar!   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
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
exports.messageDeduplicationService = void 0;
exports.canSendMessage = canSendMessage;
exports.canProcessIncomingMessage = canProcessIncomingMessage;
exports.isIncomingMessageProcessed = isIncomingMessageProcessed;
exports.markIncomingMessageProcessed = markIncomingMessageProcessed;
exports.getDeduplicationStats = getDeduplicationStats;
var crypto_1 = require("crypto");
var supabaseService_1 = require("./supabaseService");
// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
var CONFIG = {
    // Cache em memória
    MEMORY_CACHE_TTL_MS: 2 * 60 * 60 * 1000, // 2 horas em memória
    MEMORY_CACHE_MAX_SIZE: 50000, // Máximo de registros em memória
    // Banco de dados
    DB_EXPIRY_HOURS: 48, // 48 horas no banco
    // Deduplicação
    SAME_MESSAGE_WINDOW_MS: 60 * 1000, // 60 segundos - janela para considerar "mesma mensagem"
    SIMILAR_MESSAGE_WINDOW_MS: 5 * 60 * 1000, // 5 minutos - janela para mensagens similares
    // Cleanup
    CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // Limpar cache a cada 30 minutos
};
// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
var MessageDeduplicationService = /** @class */ (function () {
    function MessageDeduplicationService() {
        var _this = this;
        // Cache em memória para mensagens enviadas (rápido)
        this.outgoingCache = new Map();
        // Cache em memória para mensagens recebidas (evita reprocessamento)
        this.incomingCache = new Map();
        // Estatísticas
        this.stats = {
            outgoingBlocked: 0,
            outgoingAllowed: 0,
            incomingBlocked: 0,
            incomingAllowed: 0,
            dbErrors: 0,
            lastCleanup: Date.now(),
        };
        // Flag de inicialização
        this.initialized = false;
        this.supabase = (0, supabaseService_1.createSupabaseServiceClient)();
        console.log('🛡️ [ANTI-REENVIO] MessageDeduplicationService inicializado');
        // Iniciar cleanup periódico
        setInterval(function () { return _this.cleanupExpiredCache(); }, CONFIG.CLEANUP_INTERVAL_MS);
        // Limpar banco a cada 6 horas
        setInterval(function () { return _this.cleanupDatabase(); }, 6 * 60 * 60 * 1000);
        this.initialized = true;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  FUNÇÕES DE HASH
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Gera hash MD5 de uma string
     */
    MessageDeduplicationService.prototype.generateHash = function (text) {
        return crypto_1.default.createHash('md5').update(text).digest('hex').substring(0, 16);
    };
    /**
     * Gera chave única de deduplicação para mensagens enviadas
     * Formato: {userId}:{contactNumber}:{contentHash}:{timestamp_bucket}
     */
    MessageDeduplicationService.prototype.generateOutgoingDedupKey = function (userId, contactNumber, content, windowMs) {
        if (windowMs === void 0) { windowMs = CONFIG.SAME_MESSAGE_WINDOW_MS; }
        var contentHash = this.generateHash(content);
        var timestampBucket = Math.floor(Date.now() / windowMs);
        return "out:".concat(userId, ":").concat(contactNumber, ":").concat(contentHash, ":").concat(timestampBucket);
    };
    /**
     * Gera chave para verificar mensagens similares (janela maior)
     */
    MessageDeduplicationService.prototype.generateSimilarMessageKey = function (userId, contactNumber, content) {
        var contentHash = this.generateHash(content);
        var timestampBucket = Math.floor(Date.now() / CONFIG.SIMILAR_MESSAGE_WINDOW_MS);
        return "similar:".concat(userId, ":").concat(contactNumber, ":").concat(contentHash, ":").concat(timestampBucket);
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  VERIFICAÇÃO DE MENSAGENS ENVIADAS (OUTGOING)
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * 🛡️ VERIFICAÇÃO PRINCIPAL - Checa se pode enviar uma mensagem
     *
     * Retorna TRUE se pode enviar, FALSE se é duplicata
     *
     * IMPORTANTE: Esta função DEVE ser chamada ANTES de qualquer envio!
     */
    MessageDeduplicationService.prototype.canSendMessage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, contactNumber, content, conversationId, _a, messageType, _b, source, dedupKey, similarKey, contentHash, _c, existing, error, err_1;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        userId = params.userId, contactNumber = params.contactNumber, content = params.content, conversationId = params.conversationId, _a = params.messageType, messageType = _a === void 0 ? 'unknown' : _a, _b = params.source, source = _b === void 0 ? 'unknown' : _b;
                        dedupKey = this.generateOutgoingDedupKey(userId, contactNumber, content);
                        similarKey = this.generateSimilarMessageKey(userId, contactNumber, content);
                        contentHash = this.generateHash(content);
                        // 1️⃣ VERIFICAÇÃO RÁPIDA: Cache em memória
                        if (this.outgoingCache.has(dedupKey)) {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] \u274C BLOQUEADO (cache mem\u00F3ria): ".concat(contactNumber, " - \"").concat(content.substring(0, 30), "...\""));
                            console.log("   \uD83D\uDCCD Source: ".concat(source, " | Type: ").concat(messageType));
                            this.stats.outgoingBlocked++;
                            return [2 /*return*/, false];
                        }
                        // Verificar mensagem similar também
                        if (this.outgoingCache.has(similarKey)) {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] \u274C BLOQUEADO (similar em 5min): ".concat(contactNumber, " - \"").concat(content.substring(0, 30), "...\""));
                            this.stats.outgoingBlocked++;
                            return [2 /*return*/, false];
                        }
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.supabase
                                .from('message_deduplication')
                                .select('id')
                                .eq('dedup_key', dedupKey)
                                .single()];
                    case 2:
                        _c = _d.sent(), existing = _c.data, error = _c.error;
                        if (existing) {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] \u274C BLOQUEADO (banco): ".concat(contactNumber, " - \"").concat(content.substring(0, 30), "...\""));
                            console.log("   \uD83D\uDCCD Source: ".concat(source, " | Type: ").concat(messageType));
                            this.stats.outgoingBlocked++;
                            // Adicionar ao cache em memória para próxima verificação ser mais rápida
                            this.addToOutgoingCache(dedupKey, {
                                dedupKey: dedupKey,
                                userId: userId,
                                conversationId: conversationId,
                                contactNumber: contactNumber,
                                messageType: messageType,
                                source: source,
                                contentHash: contentHash,
                                createdAt: Date.now(),
                            });
                            return [2 /*return*/, false];
                        }
                        if (error && error.code !== 'PGRST116') {
                            // PGRST116 = not found (esperado quando não existe)
                            console.error('🛡️ [ANTI-REENVIO] Erro ao verificar banco:', error);
                            this.stats.dbErrors++;
                            // Em caso de erro de banco, permitir envio mas logar
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _d.sent();
                        console.error('🛡️ [ANTI-REENVIO] Exceção ao verificar banco:', err_1);
                        this.stats.dbErrors++;
                        return [3 /*break*/, 4];
                    case 4: 
                    // ✅ PODE ENVIAR - Registrar para evitar reenvio futuro
                    return [4 /*yield*/, this.registerOutgoingMessage({
                            userId: userId,
                            contactNumber: contactNumber,
                            content: content,
                            conversationId: conversationId,
                            messageType: messageType,
                            source: source,
                        })];
                    case 5:
                        // ✅ PODE ENVIAR - Registrar para evitar reenvio futuro
                        _d.sent();
                        this.stats.outgoingAllowed++;
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Registra uma mensagem como enviada (cache + banco)
     */
    MessageDeduplicationService.prototype.registerOutgoingMessage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, contactNumber, content, conversationId, messageType, source, dedupKey, similarKey, contentHash, record;
            var _this = this;
            return __generator(this, function (_a) {
                userId = params.userId, contactNumber = params.contactNumber, content = params.content, conversationId = params.conversationId, messageType = params.messageType, source = params.source;
                dedupKey = this.generateOutgoingDedupKey(userId, contactNumber, content);
                similarKey = this.generateSimilarMessageKey(userId, contactNumber, content);
                contentHash = this.generateHash(content);
                record = {
                    dedupKey: dedupKey,
                    userId: userId,
                    conversationId: conversationId,
                    contactNumber: contactNumber,
                    messageType: messageType,
                    source: source,
                    contentHash: contentHash,
                    createdAt: Date.now(),
                };
                // 1️⃣ Adicionar ao cache em memória
                this.addToOutgoingCache(dedupKey, record);
                this.addToOutgoingCache(similarKey, __assign(__assign({}, record), { dedupKey: similarKey }));
                // 2️⃣ Persistir no banco (async, não bloqueia)
                this.persistOutgoingMessage(record).catch(function (err) {
                    console.error('🛡️ [ANTI-REENVIO] Erro ao persistir no banco:', err);
                    _this.stats.dbErrors++;
                });
                return [2 /*return*/];
            });
        });
    };
    /**
     * Adiciona registro ao cache com limite de tamanho
     */
    MessageDeduplicationService.prototype.addToOutgoingCache = function (key, record) {
        var _this = this;
        // Verificar limite de tamanho
        if (this.outgoingCache.size >= CONFIG.MEMORY_CACHE_MAX_SIZE) {
            // Remover entradas mais antigas (10% do cache)
            var toRemove = Math.floor(CONFIG.MEMORY_CACHE_MAX_SIZE * 0.1);
            var keys = Array.from(this.outgoingCache.keys()).slice(0, toRemove);
            keys.forEach(function (k) { return _this.outgoingCache.delete(k); });
            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] Cache cheio, removidas ".concat(toRemove, " entradas antigas"));
        }
        this.outgoingCache.set(key, record);
    };
    /**
     * Persiste mensagem no banco Supabase
     */
    MessageDeduplicationService.prototype.persistOutgoingMessage = function (record) {
        return __awaiter(this, void 0, void 0, function () {
            var expiresAt;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        expiresAt = new Date(Date.now() + CONFIG.DB_EXPIRY_HOURS * 60 * 60 * 1000);
                        return [4 /*yield*/, this.supabase
                                .from('message_deduplication')
                                .upsert({
                                dedup_key: record.dedupKey,
                                user_id: record.userId,
                                conversation_id: record.conversationId,
                                contact_number: record.contactNumber,
                                message_type: record.messageType,
                                source: record.source,
                                content_hash: record.contentHash,
                                created_at: new Date(record.createdAt).toISOString(),
                                expires_at: expiresAt.toISOString(),
                            }, {
                                onConflict: 'dedup_key',
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  VERIFICAÇÃO DE MENSAGENS RECEBIDAS (INCOMING)
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * 🛡️ Verifica se uma mensagem recebida já foi processada
     *
     * Retorna TRUE se pode processar, FALSE se já foi processada
     */
    MessageDeduplicationService.prototype.checkIncomingMessageProcessed = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var whatsappMessageId, userId, contactNumber, conversationId, existing, err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        whatsappMessageId = params.whatsappMessageId, userId = params.userId, contactNumber = params.contactNumber, conversationId = params.conversationId;
                        // 1) Cache em memoria
                        if (this.incomingCache.has(whatsappMessageId)) {
                            return [2 /*return*/, { processed: true, source: "cache" }];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.supabase
                                .from('incoming_message_log')
                                .select('id')
                                .eq('whatsapp_message_id', whatsappMessageId)
                                .single()];
                    case 2:
                        existing = (_a.sent()).data;
                        if (existing) {
                            // Adicionar ao cache para proxima verificacao ser mais rapida
                            this.incomingCache.set(whatsappMessageId, {
                                whatsappMessageId: whatsappMessageId,
                                userId: userId,
                                contactNumber: contactNumber,
                                conversationId: conversationId,
                                processed: true,
                                receivedAt: Date.now(),
                            });
                            return [2 /*return*/, { processed: true, source: "db" }];
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        err_2 = _a.sent();
                        // Ignorar erros de banco para nao bloquear mensagens legitimas
                        console.error('??????? [ANTI-REENVIO] Erro ao verificar incoming:', err_2);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, { processed: false, source: "none" }];
                }
            });
        });
    };
    /**
     * ??????? Verifica se uma mensagem recebida ja foi processada
     *
     * Retorna TRUE se pode processar, FALSE se ja foi processada
     */
    MessageDeduplicationService.prototype.canProcessIncomingMessage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var whatsappMessageId, userId, contactNumber, conversationId, check;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        whatsappMessageId = params.whatsappMessageId, userId = params.userId, contactNumber = params.contactNumber, conversationId = params.conversationId;
                        return [4 /*yield*/, this.checkIncomingMessageProcessed({
                                whatsappMessageId: whatsappMessageId,
                                userId: userId,
                                contactNumber: contactNumber,
                                conversationId: conversationId,
                            })];
                    case 1:
                        check = _a.sent();
                        if (check.processed) {
                            if (check.source === "cache") {
                                console.log("??????? [ANTI-REENVIO] ??? Mensagem ja processada (cache): ".concat(whatsappMessageId));
                            }
                            else {
                                console.log("??????? [ANTI-REENVIO] ??? Mensagem ja processada (banco): ".concat(whatsappMessageId));
                            }
                            this.stats.incomingBlocked++;
                            return [2 /*return*/, false];
                        }
                        // Pode processar: registrar para evitar reprocessamento (apenas para caminho legacy)
                        return [4 /*yield*/, this.registerIncomingMessage({
                                whatsappMessageId: whatsappMessageId,
                                userId: userId,
                                contactNumber: contactNumber,
                                conversationId: conversationId,
                            })];
                    case 2:
                        // Pode processar: registrar para evitar reprocessamento (apenas para caminho legacy)
                        _a.sent();
                        this.stats.incomingAllowed++;
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * ??????? Check-only: TRUE se ja foi processada (nao registra).
     */
    MessageDeduplicationService.prototype.isIncomingMessageProcessed = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var check;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkIncomingMessageProcessed(params)];
                    case 1:
                        check = _a.sent();
                        return [2 /*return*/, check.processed];
                }
            });
        });
    };
    /**
     * Registra uma mensagem recebida como processada
     */
    MessageDeduplicationService.prototype.registerIncomingMessage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var whatsappMessageId, userId, contactNumber, conversationId, expiresAt;
            return __generator(this, function (_a) {
                whatsappMessageId = params.whatsappMessageId, userId = params.userId, contactNumber = params.contactNumber, conversationId = params.conversationId;
                // 1️⃣ Adicionar ao cache em memória
                this.incomingCache.set(whatsappMessageId, {
                    whatsappMessageId: whatsappMessageId,
                    userId: userId,
                    contactNumber: contactNumber,
                    conversationId: conversationId,
                    processed: true,
                    receivedAt: Date.now(),
                });
                expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                this.supabase
                    .from('incoming_message_log')
                    .upsert({
                    whatsapp_message_id: whatsappMessageId,
                    user_id: userId,
                    contact_number: contactNumber,
                    conversation_id: conversationId,
                    processed: true,
                    processed_at: new Date().toISOString(),
                    received_at: new Date().toISOString(),
                    expires_at: expiresAt.toISOString(),
                }, {
                    onConflict: 'whatsapp_message_id',
                })
                    .then(function (_a) {
                    var error = _a.error;
                    if (error) {
                        console.error('🛡️ [ANTI-REENVIO] Erro ao persistir incoming:', error);
                    }
                });
                return [2 /*return*/];
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  LIMPEZA E MANUTENÇÃO
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Limpa registros expirados do cache em memória
     */
    MessageDeduplicationService.prototype.cleanupExpiredCache = function () {
        var _this = this;
        var now = Date.now();
        var expiryTime = now - CONFIG.MEMORY_CACHE_TTL_MS;
        var cleaned = 0;
        var keysToDelete = [];
        // Limpar cache de saída
        this.outgoingCache.forEach(function (record, key) {
            if (record.createdAt < expiryTime) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(function (key) {
            _this.outgoingCache.delete(key);
            cleaned++;
        });
        // Limpar cache de entrada
        var incomingKeysToDelete = [];
        this.incomingCache.forEach(function (record, key) {
            if (record.receivedAt < expiryTime) {
                incomingKeysToDelete.push(key);
            }
        });
        incomingKeysToDelete.forEach(function (key) {
            _this.incomingCache.delete(key);
            cleaned++;
        });
        if (cleaned > 0) {
            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] Limpeza de cache: ".concat(cleaned, " registros removidos"));
        }
        this.stats.lastCleanup = now;
    };
    /**
     * Limpa registros expirados do banco de dados
     */
    MessageDeduplicationService.prototype.cleanupDatabase = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, err_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.supabase.rpc('cleanup_expired_deduplication')];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error) {
                            console.error('🛡️ [ANTI-REENVIO] Erro ao limpar banco:', error);
                        }
                        else {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] Limpeza de banco conclu\u00EDda: ".concat(data || 0, " registros removidos"));
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        err_3 = _b.sent();
                        console.error('🛡️ [ANTI-REENVIO] Exceção ao limpar banco:', err_3);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  ESTATÍSTICAS E DEBUG
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Retorna estatísticas do serviço
     */
    MessageDeduplicationService.prototype.getStats = function () {
        return __assign(__assign({ outgoingCacheSize: this.outgoingCache.size, incomingCacheSize: this.incomingCache.size }, this.stats), { lastCleanup: new Date(this.stats.lastCleanup).toISOString() });
    };
    /**
     * Força limpeza de todos os caches (usar com cuidado!)
     */
    MessageDeduplicationService.prototype.clearAllCaches = function () {
        this.outgoingCache.clear();
        this.incomingCache.clear();
        console.log('🛡️ [ANTI-REENVIO] ⚠️ Todos os caches foram limpos!');
    };
    /**
     * Remove registros de um usuário específico dos caches
     */
    MessageDeduplicationService.prototype.clearUserCache = function (userId) {
        var _this = this;
        var removed = 0;
        var keysToDelete = [];
        this.outgoingCache.forEach(function (record, key) {
            if (record.userId === userId) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(function (key) {
            _this.outgoingCache.delete(key);
            removed++;
        });
        var incomingKeysToDelete = [];
        this.incomingCache.forEach(function (record, key) {
            if (record.userId === userId) {
                incomingKeysToDelete.push(key);
            }
        });
        incomingKeysToDelete.forEach(function (key) {
            _this.incomingCache.delete(key);
            removed++;
        });
        console.log("\uD83D\uDEE1\uFE0F [ANTI-REENVIO] Cache do usu\u00E1rio ".concat(userId.substring(0, 8), "... limpo: ").concat(removed, " registros"));
    };
    return MessageDeduplicationService;
}());
// ═══════════════════════════════════════════════════════════════════════════════
//  INSTÂNCIA SINGLETON E EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
// Instância única do serviço
exports.messageDeduplicationService = new MessageDeduplicationService();
// Funções de conveniência para uso direto
function canSendMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, exports.messageDeduplicationService.canSendMessage(params)];
        });
    });
}
function canProcessIncomingMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, exports.messageDeduplicationService.canProcessIncomingMessage(params)];
        });
    });
}
function isIncomingMessageProcessed(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, exports.messageDeduplicationService.isIncomingMessageProcessed(params)];
        });
    });
}
function markIncomingMessageProcessed(params) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, exports.messageDeduplicationService.registerIncomingMessage(params)];
        });
    });
}
function getDeduplicationStats() {
    return exports.messageDeduplicationService.getStats();
}
exports.default = exports.messageDeduplicationService;
