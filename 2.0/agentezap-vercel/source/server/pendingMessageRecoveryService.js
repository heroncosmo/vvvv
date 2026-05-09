"use strict";
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 SISTEMA DE RECUPERAÇÃO DE MENSAGENS PENDENTES                            ║
 * ║                                                                              ║
 * ║  Este serviço resolve o problema de mensagens perdidas quando:              ║
 * ║  - Servidor está atualizando no Railway                                      ║
 * ║  - Conexão WhatsApp está instável (reconnecting)                            ║
 * ║  - Mensagens chegam mostrando "Carregando..." no WhatsApp                   ║
 * ║                                                                              ║
 * ║  FLUXO:                                                                       ║
 * ║  1. Mensagem chega do Baileys → salva IMEDIATAMENTE na pending_incoming     ║
 * ║  2. Tenta processar normalmente                                              ║
 * ║  3. Se falhar → permanece na fila pending                                    ║
 * ║  4. Quando conexão estabiliza → reprocessa pendentes                        ║
 * ║                                                                              ║
 * ║  CLIENTES AFETADOS:                                                           ║
 * ║  - jefersonlv26@gmail.com                                                    ║
 * ║  - marcelomarquesterapeuta@gmail.com                                         ║
 * ║  - rodrigo4@gmail.com                                                        ║
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
exports.pendingMessageRecoveryService = void 0;
exports.registerMessageProcessor = registerMessageProcessor;
exports.saveIncomingMessage = saveIncomingMessage;
exports.markMessageAsProcessed = markMessageAsProcessed;
exports.markMessageAsFailed = markMessageAsFailed;
exports.startMessageRecovery = startMessageRecovery;
exports.logConnectionDisconnection = logConnectionDisconnection;
exports.getRecoveryStats = getRecoveryStats;
exports.getRecoveryStatsForUser = getRecoveryStatsForUser;
var crypto_1 = require("crypto");
var supabaseService_1 = require("./supabaseService");
// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES (BASEADO EM MELHORES PRÁTICAS AWS/MICROSOFT)
// ═══════════════════════════════════════════════════════════════════════════════
// Referência: AWS Architecture Blog - Exponential Backoff And Jitter
// https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
// ═══════════════════════════════════════════════════════════════════════════════
var CONFIG = {
    // Máximo de tentativas antes de marcar como failed
    MAX_PROCESS_ATTEMPTS: 3,
    // ════════════════════════════════════════════════════════════════════════════
    // EXPONENTIAL BACKOFF COM JITTER (Padrão AWS/Microsoft)
    // ════════════════════════════════════════════════════════════════════════════
    // Em vez de delay fixo, usamos backoff exponencial com jitter para:
    // 1. Evitar "thundering herd" - múltiplos clientes retentando ao mesmo tempo
    // 2. Reduzir carga no servidor em casos de falha massiva
    // 3. Melhorar taxa de sucesso geral (AWS relata redução de 50% no trabalho)
    // ════════════════════════════════════════════════════════════════════════════
    // Delay base entre mensagens (ms)
    BASE_DELAY_MS: 1000,
    // Delay máximo (cap) para exponential backoff (ms)
    MAX_DELAY_MS: 32000,
    // Jitter máximo como percentual do delay (0.0 a 1.0)
    // AWS recomenda "Full Jitter": random between 0 and calculated_delay
    JITTER_FACTOR: 1.0,
    // ════════════════════════════════════════════════════════════════════════════
    // CIRCUIT BREAKER (Padrão Microsoft)
    // ════════════════════════════════════════════════════════════════════════════
    // Se muitas falhas consecutivas, para de tentar temporariamente
    // ════════════════════════════════════════════════════════════════════════════
    // Número de falhas consecutivas para abrir circuit breaker
    CIRCUIT_BREAKER_THRESHOLD: 5,
    // Tempo que circuit breaker fica aberto antes de tentar novamente (ms)
    CIRCUIT_BREAKER_RESET_MS: 60000, // 1 minuto
    // Máximo de mensagens a processar por ciclo
    MAX_MESSAGES_PER_CYCLE: 50,
    // Intervalo de limpeza de expirados (ms)
    CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // 30 minutos
    // Delay após conexão para iniciar recovery (dar tempo para estabilizar)
    POST_CONNECT_DELAY_MS: 15000, // 15 segundos
};
// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
var PendingMessageRecoveryService = /** @class */ (function () {
    function PendingMessageRecoveryService() {
        var _this = this;
        this.initialized = false;
        this.processingScopes = new Set(); // Evita processamento paralelo por conexão
        // Callback para processar mensagens (será registrado pelo whatsapp.ts)
        this.messageProcessor = null;
        // ════════════════════════════════════════════════════════════════════════════
        // CIRCUIT BREAKER STATE (Padrão Microsoft para falhas longas)
        // ════════════════════════════════════════════════════════════════════════════
        this.circuitBreaker = {
            consecutiveFailures: 0,
            isOpen: false,
            lastFailureTime: 0,
            openedAt: 0,
        };
        // Stats
        this.stats = {
            totalSaved: 0,
            totalRecovered: 0,
            totalFailed: 0,
            totalSkipped: 0,
            lastCleanup: Date.now(),
            circuitBreakerTrips: 0,
        };
        this.supabase = (0, supabaseService_1.createSupabaseServiceClient)();
        console.log('🚨 [RECOVERY] PendingMessageRecoveryService inicializado');
        // Iniciar limpeza periódica
        setInterval(function () { return _this.cleanupExpired(); }, CONFIG.CLEANUP_INTERVAL_MS);
        this.initialized = true;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  REGISTRO DO PROCESSADOR
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Registra o callback que será usado para processar mensagens pendentes
     * Este método deve ser chamado pelo whatsapp.ts na inicialização
     */
    PendingMessageRecoveryService.prototype.registerMessageProcessor = function (processor) {
        this.messageProcessor = processor;
        console.log('🚨 [RECOVERY] Message processor registrado');
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  SALVAR MENSAGEM PENDENTE
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * 🚨 PONTO CRÍTICO: Salva mensagem IMEDIATAMENTE ao receber do Baileys
     * Deve ser chamado ANTES de qualquer processamento
     */
    PendingMessageRecoveryService.prototype.saveIncomingMessage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, connectionId, waMessage, messageContent, _a, messageType, remoteJid, messageId, ts, base, hash, contactNumber, _b, data, error, err_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        userId = params.userId, connectionId = params.connectionId, waMessage = params.waMessage, messageContent = params.messageContent, _a = params.messageType, messageType = _a === void 0 ? 'text' : _a;
                        remoteJid = waMessage.key.remoteJid;
                        if (!remoteJid) {
                            console.log('?? [RECOVERY] Mensagem sem remoteJid, ignorando save');
                            return [2 /*return*/, { id: '', isDuplicate: false }];
                        }
                        messageId = waMessage.key.id;
                        if (!messageId) {
                            ts = Number(waMessage === null || waMessage === void 0 ? void 0 : waMessage.messageTimestamp) || 0;
                            base = "".concat(remoteJid, "|").concat(ts, "|").concat(messageType, "|").concat(messageContent || '');
                            hash = (0, crypto_1.createHash)('sha1').update(base).digest('hex').slice(0, 16);
                            messageId = "noid_".concat(hash);
                        }
                        contactNumber = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .upsert({
                                user_id: userId,
                                connection_id: connectionId,
                                whatsapp_message_id: messageId,
                                remote_jid: remoteJid,
                                contact_number: contactNumber,
                                push_name: waMessage.pushName || null,
                                message_content: messageContent,
                                message_type: messageType,
                                raw_message: this.sanitizeMessageForStorage(waMessage),
                                status: 'pending',
                                process_attempts: 0,
                                received_at: new Date().toISOString(),
                                expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h
                            }, {
                                onConflict: 'whatsapp_message_id',
                                ignoreDuplicates: true, // Não atualizar se já existe
                            })
                                .select('id')
                                .maybeSingle()];
                    case 2:
                        _b = _c.sent(), data = _b.data, error = _b.error;
                        if (error) {
                            // Erro 23505 = duplicata (constraint violation) - é esperado e OK
                            if (error.code === '23505' || error.code === 'PGRST116') {
                                console.log("\uD83D\uDEA8 [RECOVERY] Mensagem ".concat(messageId, " j\u00E1 existe (duplicata, code=").concat(error.code, ")"));
                                this.stats.totalSkipped++;
                                return [2 /*return*/, { id: '', isDuplicate: true }];
                            }
                            console.error('🚨 [RECOVERY] Erro ao salvar mensagem pendente:', error);
                            return [2 /*return*/, { id: '', isDuplicate: false }];
                        }
                        this.stats.totalSaved++;
                        console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Mensagem salva: ".concat(messageId, " | Contato: ").concat(contactNumber));
                        return [2 /*return*/, { id: (data === null || data === void 0 ? void 0 : data.id) || '', isDuplicate: false }];
                    case 3:
                        err_1 = _c.sent();
                        console.error('🚨 [RECOVERY] Exceção ao salvar mensagem:', err_1);
                        return [2 /*return*/, { id: '', isDuplicate: false }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Marca mensagem como processada com sucesso
     */
    PendingMessageRecoveryService.prototype.markAsProcessed = function (whatsappMessageId) {
        return __awaiter(this, void 0, void 0, function () {
            var err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .update({
                                status: 'processed',
                                processed_at: new Date().toISOString(),
                            })
                                .eq('whatsapp_message_id', whatsappMessageId)];
                    case 1:
                        _a.sent();
                        console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Mensagem ".concat(whatsappMessageId, " marcada como processada"));
                        return [3 /*break*/, 3];
                    case 2:
                        err_2 = _a.sent();
                        console.error('🚨 [RECOVERY] Erro ao marcar processada:', err_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Marca mensagem como falha
     */
    PendingMessageRecoveryService.prototype.markAsFailed = function (whatsappMessageId, errorMessage) {
        return __awaiter(this, void 0, void 0, function () {
            var data, attempts, newStatus, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .select('process_attempts')
                                .eq('whatsapp_message_id', whatsappMessageId)
                                .maybeSingle()];
                    case 1:
                        data = (_a.sent()).data;
                        attempts = ((data === null || data === void 0 ? void 0 : data.process_attempts) || 0) + 1;
                        newStatus = attempts >= CONFIG.MAX_PROCESS_ATTEMPTS ? 'failed' : 'pending';
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .update({
                                status: newStatus,
                                process_attempts: attempts,
                                last_attempt_at: new Date().toISOString(),
                                error_message: errorMessage,
                            })
                                .eq('whatsapp_message_id', whatsappMessageId)];
                    case 2:
                        _a.sent();
                        if (newStatus === 'failed') {
                            this.stats.totalFailed++;
                        }
                        console.log("\uD83D\uDEA8 [RECOVERY] Mensagem ".concat(whatsappMessageId, " falhou (tentativa ").concat(attempts, "/").concat(CONFIG.MAX_PROCESS_ATTEMPTS, ")"));
                        return [3 /*break*/, 4];
                    case 3:
                        err_3 = _a.sent();
                        console.error('🚨 [RECOVERY] Erro ao marcar falha:', err_3);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  RECUPERAÇÃO DE MENSAGENS PENDENTES
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * 🚨 Inicia recuperação de mensagens após conexão estabilizar
     * Deve ser chamado após conn === 'open' no whatsapp.ts
     */
    PendingMessageRecoveryService.prototype.startRecoveryForUser = function (userId, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var scopeKey;
            var _this = this;
            return __generator(this, function (_a) {
                scopeKey = "".concat(userId, ":").concat(connectionId);
                if (this.processingScopes.has(scopeKey)) {
                    console.log("\uD83D\uDEA8 [RECOVERY] Usu\u00E1rio ".concat(userId, " j\u00E1 em processamento de recovery"));
                    return [2 /*return*/];
                }
                // Aguardar estabilização da conexão
                console.log("\uD83D\uDEA8 [RECOVERY] Aguardando ".concat(CONFIG.POST_CONNECT_DELAY_MS / 1000, "s para estabilizar conex\u00E3o..."));
                setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, this.processRecoveryForUser(userId, connectionId)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }, CONFIG.POST_CONNECT_DELAY_MS);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Processa mensagens pendentes de um usuário
     */
    PendingMessageRecoveryService.prototype.processRecoveryForUser = function (userId, connectionId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, scopeKey, _a, pendingMessages, error, consecutiveFailuresInCycle, i, pending, waMessage, err_4, errorMsg, delay, err_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        result = {
                            success: false,
                            messagesProcessed: 0,
                            messagesFailed: 0,
                            messagesSkipped: 0,
                            errors: [],
                        };
                        scopeKey = "".concat(userId, ":").concat(connectionId);
                        if (!this.messageProcessor) {
                            console.error('🚨 [RECOVERY] Message processor não registrado!');
                            result.errors.push('Message processor não registrado');
                            return [2 /*return*/, result];
                        }
                        this.processingScopes.add(scopeKey);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 19, 20, 21]);
                        console.log("\n\uD83D\uDEA8 ========================================");
                        console.log("\uD83D\uDEA8 [RECOVERY] Iniciando recupera\u00E7\u00E3o para usu\u00E1rio: ".concat(userId.substring(0, 8), "..."));
                        console.log("\uD83D\uDEA8 ========================================\n");
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .select('*')
                                .eq('user_id', userId)
                                .eq('connection_id', connectionId)
                                .eq('status', 'pending')
                                .lt('process_attempts', CONFIG.MAX_PROCESS_ATTEMPTS)
                                .order('received_at', { ascending: true })
                                .limit(CONFIG.MAX_MESSAGES_PER_CYCLE)];
                    case 2:
                        _a = _b.sent(), pendingMessages = _a.data, error = _a.error;
                        if (error) {
                            console.error('🚨 [RECOVERY] Erro ao buscar pendentes:', error);
                            result.errors.push(error.message);
                            return [2 /*return*/, result];
                        }
                        if (!(!pendingMessages || pendingMessages.length === 0)) return [3 /*break*/, 4];
                        console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Nenhuma mensagem pendente para ".concat(userId.substring(0, 8), "..."));
                        result.success = true;
                        // Log de health
                        return [4 /*yield*/, this.logConnectionHealth({
                                user_id: userId,
                                connection_id: connectionId,
                                event_type: 'connected',
                                event_details: { no_pending_messages: true },
                                messages_pending: 0,
                                messages_recovered: 0,
                            })];
                    case 3:
                        // Log de health
                        _b.sent();
                        return [2 /*return*/, result];
                    case 4:
                        console.log("\uD83D\uDEA8 [RECOVERY] \uD83D\uDCE5 ".concat(pendingMessages.length, " mensagens pendentes encontradas!"));
                        console.log("\uD83D\uDEA8 [RECOVERY] Usando Exponential Backoff com Jitter (AWS Best Practice)");
                        consecutiveFailuresInCycle = 0;
                        i = 0;
                        _b.label = 5;
                    case 5:
                        if (!(i < pendingMessages.length)) return [3 /*break*/, 17];
                        pending = pendingMessages[i];
                        // ════════════════════════════════════════════════════════════════════
                        // CIRCUIT BREAKER CHECK
                        // ════════════════════════════════════════════════════════════════════
                        if (!this.checkCircuitBreaker()) {
                            console.log("\uD83D\uDEA8 [RECOVERY] \u26D4 Circuit breaker aberto, parando processamento");
                            result.errors.push('Circuit breaker aberto - muitas falhas consecutivas');
                            return [3 /*break*/, 17];
                        }
                        _b.label = 6;
                    case 6:
                        _b.trys.push([6, 12, , 14]);
                        // Marcar como em processamento
                        return [4 /*yield*/, this.supabase
                                .from('pending_incoming_messages')
                                .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
                                .eq('id', pending.id)];
                    case 7:
                        // Marcar como em processamento
                        _b.sent();
                        waMessage = pending.raw_message;
                        if (!!waMessage) return [3 /*break*/, 9];
                        console.log("\uD83D\uDEA8 [RECOVERY] Mensagem ".concat(pending.whatsapp_message_id, " sem raw_message, pulando"));
                        result.messagesSkipped++;
                        return [4 /*yield*/, this.markAsProcessed(pending.whatsapp_message_id)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 16];
                    case 9:
                        console.log("\uD83D\uDEA8 [RECOVERY] \uD83D\uDD04 [".concat(i + 1, "/").concat(pendingMessages.length, "] Processando: ").concat(pending.contact_number, " - \"").concat((pending.message_content || '').substring(0, 30), "...\""));
                        // Processar usando o callback registrado
                        return [4 /*yield*/, this.messageProcessor(userId, pending.connection_id || connectionId, waMessage)];
                    case 10:
                        // Processar usando o callback registrado
                        _b.sent();
                        // Marcar como sucesso
                        return [4 /*yield*/, this.markAsProcessed(pending.whatsapp_message_id)];
                    case 11:
                        // Marcar como sucesso
                        _b.sent();
                        result.messagesProcessed++;
                        this.stats.totalRecovered++;
                        consecutiveFailuresInCycle = 0; // Reset local counter
                        // Reset circuit breaker on success
                        this.onProcessingSuccess();
                        console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Mensagem recuperada com sucesso!");
                        return [3 /*break*/, 14];
                    case 12:
                        err_4 = _b.sent();
                        errorMsg = err_4 instanceof Error ? err_4.message : 'Erro desconhecido';
                        console.error("\uD83D\uDEA8 [RECOVERY] \u274C Erro ao processar ".concat(pending.whatsapp_message_id, ":"), errorMsg);
                        return [4 /*yield*/, this.markAsFailed(pending.whatsapp_message_id, errorMsg)];
                    case 13:
                        _b.sent();
                        result.messagesFailed++;
                        result.errors.push(errorMsg);
                        consecutiveFailuresInCycle++;
                        // Update circuit breaker
                        this.onProcessingFailure();
                        return [3 /*break*/, 14];
                    case 14:
                        delay = this.calculateBackoffWithJitter(consecutiveFailuresInCycle);
                        console.log("\uD83D\uDEA8 [RECOVERY] \u23F1\uFE0F Delay: ".concat(delay, "ms (backoff level: ").concat(consecutiveFailuresInCycle, ")"));
                        return [4 /*yield*/, this.sleep(delay)];
                    case 15:
                        _b.sent();
                        _b.label = 16;
                    case 16:
                        i++;
                        return [3 /*break*/, 5];
                    case 17:
                        result.success = true;
                        // Log de health
                        return [4 /*yield*/, this.logConnectionHealth({
                                user_id: userId,
                                connection_id: connectionId,
                                event_type: 'messages_recovered',
                                event_details: {
                                    total_pending: pendingMessages.length,
                                    processed: result.messagesProcessed,
                                    failed: result.messagesFailed,
                                    skipped: result.messagesSkipped,
                                },
                                messages_pending: pendingMessages.length,
                                messages_recovered: result.messagesProcessed,
                            })];
                    case 18:
                        // Log de health
                        _b.sent();
                        console.log("\n\uD83D\uDEA8 ========================================");
                        console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Recupera\u00E7\u00E3o conclu\u00EDda para ".concat(userId.substring(0, 8), "..."));
                        console.log("\uD83D\uDEA8   \u2022 Processadas: ".concat(result.messagesProcessed));
                        console.log("\uD83D\uDEA8   \u2022 Falhas: ".concat(result.messagesFailed));
                        console.log("\uD83D\uDEA8   \u2022 Puladas: ".concat(result.messagesSkipped));
                        console.log("\uD83D\uDEA8 ========================================\n");
                        return [3 /*break*/, 21];
                    case 19:
                        err_5 = _b.sent();
                        console.error('🚨 [RECOVERY] Erro geral na recuperação:', err_5);
                        result.errors.push(err_5 instanceof Error ? err_5.message : 'Erro geral');
                        return [3 /*break*/, 21];
                    case 20:
                        this.processingScopes.delete(scopeKey);
                        return [7 /*endfinally*/];
                    case 21: return [2 /*return*/, result];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  LOG DE SAÚDE DA CONEXÃO
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Registra evento de saúde da conexão
     */
    PendingMessageRecoveryService.prototype.logConnectionHealth = function (event) {
        return __awaiter(this, void 0, void 0, function () {
            var err_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.supabase
                                .from('connection_health_log')
                                .insert(event)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        err_6 = _a.sent();
                        console.error('🚨 [RECOVERY] Erro ao logar health:', err_6);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Registra desconexão
     */
    PendingMessageRecoveryService.prototype.logDisconnection = function (userId, connectionId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var count;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.supabase
                            .from('pending_incoming_messages')
                            .select('*', { count: 'exact', head: true })
                            .eq('user_id', userId)
                            .eq('connection_id', connectionId)
                            .eq('status', 'pending')];
                    case 1:
                        count = (_a.sent()).count;
                        return [4 /*yield*/, this.logConnectionHealth({
                                user_id: userId,
                                connection_id: connectionId,
                                event_type: 'disconnected',
                                event_details: { reason: reason },
                                messages_pending: count || 0,
                            })];
                    case 2:
                        _a.sent();
                        console.log("\uD83D\uDEA8 [RECOVERY] \uD83D\uDCE1 Desconex\u00E3o registrada - ".concat(count || 0, " mensagens pendentes"));
                        return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  ESTATÍSTICAS E MANUTENÇÃO
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Retorna estatísticas do serviço (incluindo circuit breaker)
     */
    PendingMessageRecoveryService.prototype.getStats = function () {
        // Determinar status do circuit breaker
        var circuitBreakerStatus = 'CLOSED';
        if (this.circuitBreaker.isOpen) {
            var timeSinceOpened = Date.now() - this.circuitBreaker.openedAt;
            if (timeSinceOpened >= CONFIG.CIRCUIT_BREAKER_RESET_MS) {
                circuitBreakerStatus = 'HALF_OPEN';
            }
            else {
                circuitBreakerStatus = 'OPEN';
            }
        }
        return __assign(__assign({}, this.stats), { usersProcessing: this.processingScopes.size, lastCleanup: new Date(this.stats.lastCleanup).toISOString(), circuitBreakerStatus: circuitBreakerStatus, consecutiveFailures: this.circuitBreaker.consecutiveFailures });
    };
    /**
     * Busca estatísticas por usuário
     */
    PendingMessageRecoveryService.prototype.getStatsForUser = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.supabase
                            .from('pending_messages_stats')
                            .select('*')
                            .eq('user_id', userId)
                            .maybeSingle()];
                    case 1:
                        data = (_a.sent()).data;
                        return [2 /*return*/, {
                                pending: (data === null || data === void 0 ? void 0 : data.pending_count) || 0,
                                processed: (data === null || data === void 0 ? void 0 : data.processed_count) || 0,
                                failed: (data === null || data === void 0 ? void 0 : data.failed_count) || 0,
                                oldest_pending: (data === null || data === void 0 ? void 0 : data.oldest_pending) || null,
                            }];
                }
            });
        });
    };
    /**
     * Limpa mensagens expiradas
     */
    PendingMessageRecoveryService.prototype.cleanupExpired = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, err_7;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.supabase.rpc('cleanup_expired_pending_messages')];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error) {
                            console.error('🚨 [RECOVERY] Erro ao limpar expiradas:', error);
                            return [2 /*return*/];
                        }
                        this.stats.lastCleanup = Date.now();
                        if (data && data > 0) {
                            console.log("\uD83D\uDEA8 [RECOVERY] \uD83E\uDDF9 ".concat(data, " mensagens expiradas removidas"));
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        err_7 = _b.sent();
                        console.error('🚨 [RECOVERY] Exceção na limpeza:', err_7);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * ════════════════════════════════════════════════════════════════════════════
     * EXPONENTIAL BACKOFF COM FULL JITTER (AWS Best Practice)
     * ════════════════════════════════════════════════════════════════════════════
     *
     * Fórmula: sleep = random_between(0, min(cap, base * 2 ^ attempt))
     *
     * Por que usar jitter?
     * - Sem jitter: todos os clientes retentam ao mesmo tempo → sobrecarga
     * - Com "Full Jitter": cada cliente retenta em momento diferente
     * - AWS relata redução de ~50% no trabalho total do cliente
     *
     * Referência: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
     * ════════════════════════════════════════════════════════════════════════════
     */
    PendingMessageRecoveryService.prototype.calculateBackoffWithJitter = function (attempt) {
        // Exponential backoff: base * 2^attempt
        var exponentialDelay = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt);
        // Cap no máximo configurado
        var cappedDelay = Math.min(exponentialDelay, CONFIG.MAX_DELAY_MS);
        // Full Jitter: random between 0 and cappedDelay
        // Isso distribui os retries uniformemente no tempo
        var jitteredDelay = Math.random() * cappedDelay * CONFIG.JITTER_FACTOR;
        return Math.floor(jitteredDelay);
    };
    /**
     * ════════════════════════════════════════════════════════════════════════════
     * CIRCUIT BREAKER (Microsoft Best Practice)
     * ════════════════════════════════════════════════════════════════════════════
     *
     * Estados:
     * - CLOSED: Operação normal, contando falhas
     * - OPEN: Muitas falhas consecutivas, rejeitando requisições
     * - HALF-OPEN: Testando se o serviço voltou (após timeout)
     *
     * Por que usar circuit breaker?
     * - Evita sobrecarregar um serviço que está falhando
     * - Permite recuperação mais rápida do sistema
     * - Fornece feedback rápido em vez de timeout lento
     *
     * Referência: Microsoft Azure Architecture Docs - Circuit Breaker Pattern
     * ════════════════════════════════════════════════════════════════════════════
     */
    PendingMessageRecoveryService.prototype.checkCircuitBreaker = function () {
        // Se não está aberto, permitir
        if (!this.circuitBreaker.isOpen) {
            return true;
        }
        // Verificar se passou tempo suficiente para tentar novamente (half-open)
        var timeSinceOpened = Date.now() - this.circuitBreaker.openedAt;
        if (timeSinceOpened >= CONFIG.CIRCUIT_BREAKER_RESET_MS) {
            console.log("\uD83D\uDEA8 [RECOVERY] \uD83D\uDD0C Circuit Breaker: Tentando half-open ap\u00F3s ".concat(timeSinceOpened / 1000, "s"));
            return true; // Half-open: permite uma tentativa
        }
        console.log("\uD83D\uDEA8 [RECOVERY] \u26D4 Circuit Breaker ABERTO - ".concat((CONFIG.CIRCUIT_BREAKER_RESET_MS - timeSinceOpened) / 1000, "s restantes"));
        return false;
    };
    PendingMessageRecoveryService.prototype.onProcessingSuccess = function () {
        // Reset circuit breaker on success
        if (this.circuitBreaker.consecutiveFailures > 0) {
            console.log("\uD83D\uDEA8 [RECOVERY] \u2705 Circuit Breaker: Reset ap\u00F3s sucesso");
        }
        this.circuitBreaker.consecutiveFailures = 0;
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.openedAt = 0;
    };
    PendingMessageRecoveryService.prototype.onProcessingFailure = function () {
        this.circuitBreaker.consecutiveFailures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        // Verificar se deve abrir circuit breaker
        if (this.circuitBreaker.consecutiveFailures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
            if (!this.circuitBreaker.isOpen) {
                this.circuitBreaker.isOpen = true;
                this.circuitBreaker.openedAt = Date.now();
                this.stats.circuitBreakerTrips++;
                console.log("\uD83D\uDEA8 [RECOVERY] \u26D4 Circuit Breaker ABERTO ap\u00F3s ".concat(this.circuitBreaker.consecutiveFailures, " falhas consecutivas!"));
            }
        }
    };
    /**
     * Sanitiza mensagem para armazenamento (remove dados binários grandes)
     */
    PendingMessageRecoveryService.prototype.sanitizeMessageForStorage = function (waMessage) {
        try {
            // Clonar para não modificar original
            var clone_1 = JSON.parse(JSON.stringify(waMessage));
            // Remover conteúdo binário de mídia (muito grande)
            if (clone_1.message) {
                // Preservar estrutura mas limitar tamanho de jpegThumbnail
                ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'].forEach(function (type) {
                    var _a;
                    if (clone_1.message[type]) {
                        // Manter metadados mas remover thumbnail se for muito grande
                        if (((_a = clone_1.message[type].jpegThumbnail) === null || _a === void 0 ? void 0 : _a.length) > 1000) {
                            clone_1.message[type].jpegThumbnail = '[THUMBNAIL_REMOVED]';
                        }
                    }
                });
            }
            return clone_1;
        }
        catch (err) {
            // Se falhar parse, retornar objeto mínimo
            return {
                key: waMessage.key,
                pushName: waMessage.pushName,
                messageTimestamp: waMessage.messageTimestamp,
            };
        }
    };
    /**
     * Sleep helper
     */
    PendingMessageRecoveryService.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    return PendingMessageRecoveryService;
}());
// ═══════════════════════════════════════════════════════════════════════════════
//  INSTÂNCIA SINGLETON E EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
exports.pendingMessageRecoveryService = new PendingMessageRecoveryService();
// Funções de conveniência
function registerMessageProcessor(processor) {
    exports.pendingMessageRecoveryService.registerMessageProcessor(processor);
}
function saveIncomingMessage(params) {
    return exports.pendingMessageRecoveryService.saveIncomingMessage(params);
}
function markMessageAsProcessed(whatsappMessageId) {
    return exports.pendingMessageRecoveryService.markAsProcessed(whatsappMessageId);
}
function markMessageAsFailed(whatsappMessageId, error) {
    return exports.pendingMessageRecoveryService.markAsFailed(whatsappMessageId, error);
}
function startMessageRecovery(userId, connectionId) {
    return exports.pendingMessageRecoveryService.startRecoveryForUser(userId, connectionId);
}
function logConnectionDisconnection(userId, connectionId, reason) {
    return exports.pendingMessageRecoveryService.logDisconnection(userId, connectionId, reason);
}
function getRecoveryStats() {
    return exports.pendingMessageRecoveryService.getStats();
}
function getRecoveryStatsForUser(userId) {
    return exports.pendingMessageRecoveryService.getStatsForUser(userId);
}
exports.default = exports.pendingMessageRecoveryService;
