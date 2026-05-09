"use strict";
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP v5.1                    ║
 * ║                                                                              ║
 * ║  Sistema SIMPLIFICADO e FUNCIONAL anti-banimento:                           ║
 * ║                                                                              ║
 * ║  1. Fila de mensagens POR CANAL WHATSAPP (cada cliente SaaS tem sua fila)   ║
 * ║  2. Delay REALISTA de 5-15 segundos entre mensagens                         ║
 * ║  3. Sistema de LOTES: após 10 mensagens, pausa de 1 MINUTO                  ║
 * ║  4. Detecta mensagem manual do DONO e conta no delay                        ║
 * ║  5. Simulação de digitação antes de cada mensagem (TYPING INDICATOR)        ║
 * ║  6. DEDUPLICAÇÃO - Nunca reenvia após instabilidade                         ║
 * ║  7. Cache de metadados de grupos (evita rate limit)                         ║
 * ║                                                                              ║
 * ║  ❌ SEM rate limiting absurdo (10 msgs/hora era ridículo)                   ║
 * ║  ❌ SEM safe mode desnecessário                                             ║
 * ║  ❌ SEM limites diários que atrapalham negócios                             ║
 * ║                                                                              ║
 * ║  IMPORTANTE: Cada canal WhatsApp (cliente SaaS) tem sua própria fila!       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
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
exports.messageQueueService = void 0;
var messageDeduplicationService_1 = require("./messageDeduplicationService");
var antiBanProtectionService_1 = require("./antiBanProtectionService");
// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CLASSE PRINCIPAL DO SERVIÇO DE FILA (SIMPLIFICADO v5.0)
// ═══════════════════════════════════════════════════════════════════════════════
var MessageQueueService = /** @class */ (function () {
    function MessageQueueService() {
        var _this = this;
        // Mapa de filas: userId -> estado da fila daquele WhatsApp
        this.queues = new Map();
        // Serializa execuções diretas (executeWithDelay) por canal para evitar bursts concorrentes
        this.directExecutionChains = new Map();
        // Callback para enviar mensagem real (injetado pelo whatsapp.ts)
        this.sendCallback = null;
        console.log('🛡️ [ANTI-BLOCK v5.0] MessageQueueService SIMPLIFICADO iniciado');
        console.log("   \uD83D\uDCCA Config: ".concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS / 1000, "-").concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.MAX_DELAY_MS / 1000, "s delay, ").concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_SIZE, " msgs/lote, ").concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1000, "s pausa"));
        // Limpar filas vazias a cada 5 minutos
        setInterval(function () { return _this.cleanupEmptyQueues(); }, 5 * 60 * 1000);
    }
    /**
     * Registra o callback para envio real de mensagens
     * Deve ser chamado pelo whatsapp.ts após inicialização
     */
    MessageQueueService.prototype.registerSendCallback = function (callback) {
        this.sendCallback = callback;
        console.log('🛡️ [ANTI-BLOCK] Callback de envio registrado');
    };
    /**
     * Adiciona mensagem à fila do WhatsApp específico
     * Retorna uma Promise que resolve quando a mensagem for enviada
     */
    MessageQueueService.prototype.enqueue = function (userId, jid, text, options) {
        return __awaiter(this, void 0, void 0, function () {
            var state, messageId;
            var _this = this;
            return __generator(this, function (_a) {
                // Inicializar fila do usuário se não existir
                if (!this.queues.has(userId)) {
                    this.queues.set(userId, {
                        queue: [],
                        isProcessing: false,
                        lastSentAt: Date.now(),
                        totalSent: 0,
                        totalErrors: 0,
                    });
                    console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] Nova fila criada para ".concat(userId.substring(0, 8), "..."));
                }
                state = this.queues.get(userId);
                messageId = "".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var queuedMessage = {
                            id: messageId,
                            jid: jid,
                            text: text,
                            originalText: text,
                            options: options,
                            priority: (options === null || options === void 0 ? void 0 : options.priority) || 'normal',
                            addedAt: Date.now(),
                            resolve: resolve,
                            reject: reject,
                        };
                        // Inserir na posição correta baseado em prioridade
                        _this.insertByPriority(state.queue, queuedMessage);
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] Mensagem enfileirada para ".concat(userId.substring(0, 8), "..."));
                        console.log("   \uD83D\uDCCA Fila: ".concat(state.queue.length, " | Prioridade: ").concat((options === null || options === void 0 ? void 0 : options.priority) || 'normal'));
                        console.log("   \uD83D\uDCDD Texto: \"".concat(text.substring(0, 50), "...\""));
                        // Iniciar processamento se não estiver rodando
                        if (!state.isProcessing) {
                            _this.processQueue(userId);
                        }
                    })];
            });
        });
    };
    /**
     * Insere mensagem na fila respeitando prioridade
     * high > normal > low
     */
    MessageQueueService.prototype.insertByPriority = function (queue, message) {
        var priorityOrder = { high: 0, normal: 1, low: 2 };
        var msgPriority = priorityOrder[message.priority];
        // Encontrar posição correta
        var insertIndex = queue.length;
        for (var i = 0; i < queue.length; i++) {
            if (priorityOrder[queue[i].priority] > msgPriority) {
                insertIndex = i;
                break;
            }
        }
        queue.splice(insertIndex, 0, message);
    };
    /**
     * Processa a fila de um canal WhatsApp específico
     * v5.1 SIMPLIFICADO: Delay 5-15s + pausa 1 min após 10 msgs
     */
    MessageQueueService.prototype.processQueue = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var state, message, contactNumber, canSendCheck, delay, now, timeSinceLastSent, remainingDelay, result, batchResult, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.queues.get(userId);
                        if (!state || state.isProcessing)
                            return [2 /*return*/];
                        state.isProcessing = true;
                        _a.label = 1;
                    case 1:
                        if (!(state.queue.length > 0)) return [3 /*break*/, 10];
                        message = state.queue.shift();
                        contactNumber = message.jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 8, , 9]);
                        canSendCheck = antiBanProtectionService_1.antiBanProtectionService.canSendMessage(userId);
                        if (!!canSendCheck.canSend) return [3 /*break*/, 4];
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u23F8\uFE0F ".concat(canSendCheck.reason));
                        // Colocar mensagem de volta na fila
                        state.queue.unshift(message);
                        // Aguardar
                        return [4 /*yield*/, this.sleep(canSendCheck.waitMs)];
                    case 3:
                        // Aguardar
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 4:
                        delay = antiBanProtectionService_1.antiBanProtectionService.calculateDelay(userId, contactNumber);
                        now = Date.now();
                        timeSinceLastSent = now - state.lastSentAt;
                        remainingDelay = Math.max(0, delay - timeSinceLastSent);
                        if (!(remainingDelay > 0)) return [3 /*break*/, 6];
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u23F3 Aguardando ".concat((remainingDelay / 1000).toFixed(1), "s antes de enviar..."));
                        return [4 /*yield*/, this.sleep(remainingDelay)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [4 /*yield*/, this.sendMessage(userId, message)];
                    case 7:
                        result = _a.sent();
                        state.lastSentAt = Date.now();
                        state.totalSent++;
                        batchResult = antiBanProtectionService_1.antiBanProtectionService.registerMessageSent(userId, contactNumber);
                        if (batchResult.shouldPause) {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \uD83D\uDCE6 Iniciando pausa de ".concat(batchResult.pauseDuration / 1000, "s (1 minuto)"));
                        }
                        message.resolve(result);
                        return [3 /*break*/, 9];
                    case 8:
                        error_1 = _a.sent();
                        state.totalErrors++;
                        console.error("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u274C Erro ao enviar:", error_1.message);
                        message.reject(error_1);
                        return [3 /*break*/, 9];
                    case 9: return [3 /*break*/, 1];
                    case 10:
                        state.isProcessing = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Envia mensagem real usando o callback registrado
     * 🆕 AGORA COM VERIFICAÇÃO DE DEDUPLICAÇÃO ANTES DO ENVIO!
     */
    MessageQueueService.prototype.sendMessage = function (userId, message) {
        return __awaiter(this, void 0, void 0, function () {
            var contactNumber, conversationId, messageType, source, canSend, messageId;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!this.sendCallback) {
                            throw new Error('Send callback not registered');
                        }
                        contactNumber = message.jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
                        conversationId = ((_a = message.options) === null || _a === void 0 ? void 0 : _a.conversationId) || "".concat(userId, ":").concat(contactNumber);
                        messageType = ((_b = message.options) === null || _b === void 0 ? void 0 : _b.messageType) || 'ai_response';
                        source = ((_c = message.options) === null || _c === void 0 ? void 0 : _c.source) || 'queue';
                        return [4 /*yield*/, (0, messageDeduplicationService_1.canSendMessage)({
                                userId: userId,
                                conversationId: conversationId,
                                contactNumber: contactNumber,
                                content: message.text,
                                messageType: messageType,
                                source: source
                            })];
                    case 1:
                        canSend = _d.sent();
                        if (!canSend) {
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK] \uD83D\uDEAB MENSAGEM BLOQUEADA POR DEDUPLICA\u00C7\u00C3O!");
                            console.log("   \uD83D\uDCE7 Para: ".concat(message.jid.substring(0, 15), "..."));
                            console.log("   \uD83D\uDCDD Texto: ".concat(message.text.substring(0, 50), "..."));
                            console.log("   \u26A0\uFE0F Esta mensagem j\u00E1 foi enviada anteriormente (prote\u00E7\u00E3o anti-reenvio)");
                            // Retornar sucesso SEM enviar - a mensagem já foi processada antes
                            return [2 /*return*/, {
                                    success: true,
                                    messageId: 'DEDUPLICATED_BLOCKED',
                                    variedText: undefined,
                                }];
                        }
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK] \uD83D\uDCE4 Enviando mensagem para ".concat(message.jid.substring(0, 15), "..."));
                        return [4 /*yield*/, this.sendCallback(userId, message.jid, message.text, message.options)];
                    case 2:
                        messageId = _d.sent();
                        return [2 /*return*/, {
                                success: true,
                                messageId: messageId || undefined,
                                variedText: message.text !== message.originalText ? message.text : undefined,
                            }];
                }
            });
        });
    };
    /**
     * Gera delay aleatório entre MIN e MAX
     */
    MessageQueueService.prototype.getRandomDelay = function () {
        return antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS +
            Math.random() * (antiBanProtectionService_1.ANTI_BAN_CONFIG.MAX_DELAY_MS - antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS);
    };
    /**
     * Sleep helper
     */
    MessageQueueService.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    /**
     * Limpa filas vazias para liberar memória
     */
    MessageQueueService.prototype.cleanupEmptyQueues = function () {
        var now = Date.now();
        var IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
        var entries = Array.from(this.queues.entries());
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
            var _a = entries_1[_i], userId = _a[0], state = _a[1];
            if (state.queue.length === 0 && !state.isProcessing) {
                // Verificar se última mensagem foi há mais de 30 min
                if (now - state.lastSentAt > IDLE_TIMEOUT_MS) {
                    this.queues.delete(userId);
                    console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] Fila removida por inatividade: ".concat(userId.substring(0, 8), "..."));
                }
            }
        }
    };
    /**
     * Retorna estatísticas do serviço
     */
    MessageQueueService.prototype.getStats = function () {
        var stats = {
            version: 'v5.0-SIMPLES',
            totalQueues: this.queues.size,
            config: {
                minDelayMs: antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS,
                maxDelayMs: antiBanProtectionService_1.ANTI_BAN_CONFIG.MAX_DELAY_MS,
                batchSize: antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_SIZE,
                batchPauseMs: antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_PAUSE_MS,
            },
            queues: {},
        };
        var entries = Array.from(this.queues.entries());
        for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
            var _a = entries_2[_i], userId = _a[0], state = _a[1];
            var antiBanStats = antiBanProtectionService_1.antiBanProtectionService.getStats(userId);
            stats.queues[userId.substring(0, 8)] = {
                queueLength: state.queue.length,
                isProcessing: state.isProcessing,
                totalSent: state.totalSent,
                totalErrors: state.totalErrors,
                lastSentAt: state.lastSentAt ? new Date(state.lastSentAt).toISOString() : null,
                // Stats do serviço anti-ban
                batchCount: antiBanStats.consecutiveMessages,
                isPaused: antiBanStats.isPaused,
                pauseRemainingMs: antiBanStats.pauseRemainingMs,
            };
        }
        return stats;
    };
    /**
     * Força limpeza de todas as filas (para shutdown)
     */
    MessageQueueService.prototype.clearAllQueues = function () {
        var entries = Array.from(this.queues.entries());
        for (var _i = 0, entries_3 = entries; _i < entries_3.length; _i++) {
            var _a = entries_3[_i], userId = _a[0], state = _a[1];
            // Rejeitar todas as mensagens pendentes
            for (var _b = 0, _c = state.queue; _b < _c.length; _b++) {
                var msg = _c[_b];
                msg.reject(new Error('Queue cleared'));
            }
            state.queue = [];
        }
        this.queues.clear();
        console.log('🛡️ [ANTI-BLOCK v5.0] Todas as filas limpas');
    };
    /**
     * Limpa a fila de um usuário específico
     */
    MessageQueueService.prototype.clearUserQueue = function (userId) {
        var state = this.queues.get(userId);
        if (!state) {
            console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] Nenhuma fila encontrada para ".concat(userId.substring(0, 8), "..."));
            return { cleared: 0, wasPending: false };
        }
        var queueSize = state.queue.length;
        var wasPending = state.isProcessing;
        // Rejeitar todas as mensagens pendentes
        for (var _i = 0, _a = state.queue; _i < _a.length; _i++) {
            var msg = _a[_i];
            msg.reject(new Error('Queue cleared'));
        }
        state.queue = [];
        state.isProcessing = false;
        // Resetar contador de lote no serviço anti-ban
        antiBanProtectionService_1.antiBanProtectionService.resetBatchCounter(userId);
        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u2705 Fila do usu\u00E1rio ".concat(userId.substring(0, 8), "... limpa: ").concat(queueSize, " mensagens removidas"));
        return { cleared: queueSize, wasPending: wasPending };
    };
    /**
     * Obtém tamanho da fila de um usuário específico
     */
    MessageQueueService.prototype.getQueueSize = function (userId) {
        var _a;
        return ((_a = this.queues.get(userId)) === null || _a === void 0 ? void 0 : _a.queue.length) || 0;
    };
    /**
     * Verifica se um WhatsApp pode enviar mensagem agora
     */
    MessageQueueService.prototype.canSendNow = function (userId) {
        var state = this.queues.get(userId);
        if (!state) {
            return { canSend: true, waitMs: 0 };
        }
        // Verificar no serviço anti-ban
        var antiBanCheck = antiBanProtectionService_1.antiBanProtectionService.canSendMessage(userId);
        if (!antiBanCheck.canSend) {
            return {
                canSend: false,
                waitMs: antiBanCheck.waitMs,
                reason: antiBanCheck.reason
            };
        }
        var timeSinceLastSent = Date.now() - state.lastSentAt;
        var waitMs = Math.max(0, antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS - timeSinceLastSent);
        return {
            canSend: waitMs === 0 && state.queue.length === 0,
            waitMs: waitMs,
        };
    };
    /**
     * Aguarda vez na fila para enviar mídia ou outros tipos
     */
    MessageQueueService.prototype.waitForTurn = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, description) {
            var state, antiBanCheck, contactNumber, delay, timeSinceLastSent, remainingDelay;
            if (description === void 0) { description = 'mídia'; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        state = this.queues.get(userId);
                        if (!state) {
                            state = {
                                queue: [],
                                isProcessing: false,
                                lastSentAt: Date.now(),
                                totalSent: 0,
                                totalErrors: 0,
                            };
                            this.queues.set(userId, state);
                            console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] Nova fila criada para m\u00EDdia: ".concat(userId.substring(0, 8), "..."));
                        }
                        antiBanCheck = antiBanProtectionService_1.antiBanProtectionService.canSendMessage(userId);
                        if (!!antiBanCheck.canSend) return [3 /*break*/, 2];
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u23F8\uFE0F ".concat(antiBanCheck.reason, " - aguardando ").concat(Math.ceil(antiBanCheck.waitMs / 1000), "s"));
                        return [4 /*yield*/, this.sleep(antiBanCheck.waitMs)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!(state.isProcessing || state.queue.length > 0)) return [3 /*break*/, 4];
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u23F3 Aguardando fila de texto terminar antes de enviar ".concat(description, "..."));
                        return [4 /*yield*/, this.sleep(1000)];
                    case 3:
                        _a.sent();
                        state = this.queues.get(userId);
                        return [3 /*break*/, 2];
                    case 4:
                        contactNumber = 'media';
                        delay = antiBanProtectionService_1.antiBanProtectionService.calculateDelay(userId, contactNumber);
                        timeSinceLastSent = Date.now() - state.lastSentAt;
                        remainingDelay = Math.max(0, delay - timeSinceLastSent);
                        if (!(remainingDelay > 0)) return [3 /*break*/, 6];
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \uD83C\uDFB5 Aguardando ".concat((remainingDelay / 1000).toFixed(1), "s antes de enviar ").concat(description));
                        return [4 /*yield*/, this.sleep(remainingDelay)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        // Registrar envio no serviço anti-ban
                        antiBanProtectionService_1.antiBanProtectionService.registerMessageSent(userId, contactNumber);
                        state.lastSentAt = Date.now();
                        state.totalSent++;
                        console.log("\uD83D\uDEE1\uFE0F [ANTI-BLOCK v5.0] \u2705 Liberado para enviar ".concat(description));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Notifica que um envio de mídia foi concluído
     */
    MessageQueueService.prototype.markMediaSent = function (userId) {
        var state = this.queues.get(userId);
        if (state) {
            state.lastSentAt = Date.now();
        }
    };
    /**
     * Executa qualquer função de envio respeitando a fila
     */
    MessageQueueService.prototype.executeWithDelay = function (userId, description, sendFn) {
        return __awaiter(this, void 0, void 0, function () {
            var previous, release, current, chain, result, error_2, latest;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        previous = this.directExecutionChains.get(userId) || Promise.resolve();
                        current = new Promise(function (resolve) {
                            release = resolve;
                        });
                        chain = previous
                            .catch(function () { return undefined; })
                            .then(function () { return current; });
                        this.directExecutionChains.set(userId, chain);
                        return [4 /*yield*/, previous.catch(function () { return undefined; })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 8, 9]);
                        return [4 /*yield*/, this.waitForTurn(userId, description)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, sendFn()];
                    case 5:
                        result = _a.sent();
                        this.markMediaSent(userId);
                        return [2 /*return*/, result];
                    case 6:
                        error_2 = _a.sent();
                        this.markMediaSent(userId);
                        throw error_2;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        release();
                        latest = this.directExecutionChains.get(userId);
                        if (latest === chain) {
                            this.directExecutionChains.delete(userId);
                        }
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return MessageQueueService;
}());
// Singleton exportado
exports.messageQueueService = new MessageQueueService();
