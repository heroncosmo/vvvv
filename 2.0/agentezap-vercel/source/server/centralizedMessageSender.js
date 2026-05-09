"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🚀 CENTRALIZED MESSAGE SENDER v3.0 - POLL-BASED BUTTONS
 *  Sistema unificado para envio de TODAS as mensagens
 *  TODOS os sistemas DEVEM usar este serviço para enviar mensagens!
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sistemas que DEVEM usar este serviço:
 * - ✅ Follow-up automático
 * - ✅ Notificador inteligente
 * - ✅ Mensagem manual (admin)
 * - ✅ Conversas normais
 * - ✅ Delivery
 * - ✅ Catálogo
 * - ✅ Agendamento
 * - ✅ AI Agent
 * - ✅ Broadcast
 * - ✅ Recovery
 * - ✅ Media (imagens, vídeos, áudios)
 *
 * NUNCA faça socket.sendMessage() diretamente! Use este serviço.
 *
 * v3.0 - NOVA IMPLEMENTAÇÃO COM ENQUETES/POLLS:
 * - Usa ENQUETES (polls) do WhatsApp para simular botões
 * - FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
 * - As enquetes aparecem como opções clicáveis
 * - Usuário vota na enquete = seleciona opção
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
exports.centralizedMessageSender = void 0;
exports.getPollMapping = getPollMapping;
exports.getButtonIdFromPollVote = getButtonIdFromPollVote;
var antiBanProtectionService_1 = require("./antiBanProtectionService");
// ═══════════════════════════════════════════════════════════════════════════════
//  🎛️ CONFIGURAÇÃO DE MENU NUMÉRICO
// ═══════════════════════════════════════════════════════════════════════════════
// DESABILITADO: Agora usamos TEXTO COM NÚMEROS para melhor compatibilidade
// O cliente digita o número ou escreve o que quer
var USE_POLLS_FOR_BUTTONS = false;
// Enviar texto antes explicando as opções
var SEND_CONTEXT_BEFORE_POLL = false;
// Mapa global de polls: pollMsgId -> PollMapping
var pollMappings = new Map();
// Limpar polls antigos (mais de 1 hora)
setInterval(function () {
    var oneHourAgo = Date.now() - (60 * 60 * 1000);
    var entries = Array.from(pollMappings.entries());
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var _a = entries_1[_i], msgId = _a[0], mapping = _a[1];
        if (mapping.createdAt < oneHourAgo) {
            pollMappings.delete(msgId);
        }
    }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos
// Exportar função para buscar mapping
function getPollMapping(pollMsgId) {
    return pollMappings.get(pollMsgId);
}
// Exportar função para obter ID do botão pelo texto votado
function getButtonIdFromPollVote(pollMsgId, votedText) {
    var _a;
    var mapping = pollMappings.get(pollMsgId);
    if (!mapping)
        return null;
    // Encontrar o botão cujo título corresponde ao texto votado
    var button = mapping.buttons.find(function (btn) {
        var _a;
        var btnTitle = ((_a = btn.reply) === null || _a === void 0 ? void 0 : _a.title) || btn.title || '';
        return btnTitle.toLowerCase() === votedText.toLowerCase();
    });
    if (button) {
        return ((_a = button.reply) === null || _a === void 0 ? void 0 : _a.id) || button.id || votedText;
    }
    return votedText; // Retorna o próprio texto se não encontrar
}
// ═══════════════════════════════════════════════════════════════════════════════
//  🎯 CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
var CentralizedMessageSender = /** @class */ (function () {
    function CentralizedMessageSender() {
        this.stats = new Map();
        this.processing = new Map();
        this.queues = new Map();
        console.log('🚀 [CENTRALIZED-SENDER v3.0] Sistema com ENQUETES inicializado');
        console.log("   \uD83D\uDDF3\uFE0F Polls: ".concat(USE_POLLS_FOR_BUTTONS ? 'ATIVADO' : 'DESATIVADO'));
        console.log("   \u23F1\uFE0F Delays: ".concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.MIN_DELAY_MS / 1000, "s - ").concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.MAX_DELAY_MS / 1000, "s"));
        console.log("   \u2328\uFE0F Typing: ".concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.TYPING_ENABLED ? 'ATIVADO' : 'DESATIVADO'));
        console.log("   \uD83D\uDCE6 Batch: ".concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_SIZE, " msgs, pausa ").concat(antiBanProtectionService_1.ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1000, "s"));
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  🗳️ REGISTRO DE POLL MAPPING
    // ═══════════════════════════════════════════════════════════════════════════
    CentralizedMessageSender.prototype.registerPollMapping = function (pollMsgId, jid, buttons) {
        pollMappings.set(pollMsgId, {
            pollMsgId: pollMsgId,
            jid: jid,
            buttons: buttons,
            createdAt: Date.now()
        });
        console.log("\uD83D\uDDF3\uFE0F [POLL-MAPPING] Registrado poll ".concat(pollMsgId.substring(0, 10), "... com ").concat(buttons.length, " op\u00E7\u00F5es"));
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  📤 MÉTODO PRINCIPAL DE ENVIO
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Envia uma mensagem através do sistema anti-ban
     * ESTE É O ÚNICO MÉTODO QUE DEVE SER USADO PARA ENVIAR MENSAGENS
     */
    CentralizedMessageSender.prototype.sendMessage = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, jid, content, socket, origin, _a, priority;
            return __generator(this, function (_b) {
                userId = options.userId, jid = options.jid, content = options.content, socket = options.socket, origin = options.origin, _a = options.priority, priority = _a === void 0 ? 'normal' : _a;
                // Validações
                if (!socket) {
                    console.error("\u274C [CENTRALIZED-SENDER] Socket n\u00E3o fornecido para ".concat(origin));
                    return [2 /*return*/, { success: false, error: 'Socket não disponível' }];
                }
                if (!jid) {
                    console.error("\u274C [CENTRALIZED-SENDER] JID n\u00E3o fornecido para ".concat(origin));
                    return [2 /*return*/, { success: false, error: 'JID não fornecido' }];
                }
                // Log de entrada
                console.log("\uD83D\uDCE5 [CENTRALIZED-SENDER] Nova mensagem de [".concat(origin, "] para ").concat(jid.substring(0, 15), "..."));
                // Mensagens urgentes (do dono) têm delay menor
                if (options.isOwnerInitiated || priority === 'urgent') {
                    return [2 /*return*/, this.sendImmediateWithMinimalDelay(options)];
                }
                // Adicionar à fila e processar
                return [2 /*return*/, this.enqueueAndProcess(options)];
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  🔥 ENVIO IMEDIATO (para mensagens do dono)
    // ═══════════════════════════════════════════════════════════════════════════
    CentralizedMessageSender.prototype.sendImmediateWithMinimalDelay = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var userId, jid, content, socket, origin, quotedMessage, skipTyping, delay_1, result, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        userId = options.userId, jid = options.jid, content = options.content, socket = options.socket, origin = options.origin, quotedMessage = options.quotedMessage, skipTyping = options.skipTyping;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 6, , 7]);
                        delay_1 = antiBanProtectionService_1.ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS;
                        console.log("\u26A1 [CENTRALIZED-SENDER] Envio priorit\u00E1rio de [".concat(origin, "] - delay ").concat(delay_1 / 1000, "s"));
                        if (!(!skipTyping && antiBanProtectionService_1.ANTI_BAN_CONFIG.TYPING_ENABLED)) return [3 /*break*/, 3];
                        return [4 /*yield*/, (0, antiBanProtectionService_1.simulateTyping)(socket, jid, this.getMessageLength(content))];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, socket.sendMessage(jid, content, {
                                quoted: quotedMessage,
                            })];
                    case 5:
                        result = _b.sent();
                        this.recordSent(userId, origin, true);
                        return [2 /*return*/, {
                                success: true,
                                messageId: ((_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id) || undefined,
                                waitedMs: delay_1,
                            }];
                    case 6:
                        error_1 = _b.sent();
                        console.error("\u274C [CENTRALIZED-SENDER] Erro no envio priorit\u00E1rio:", error_1);
                        this.recordSent(userId, origin, false);
                        return [2 /*return*/, {
                                success: false,
                                error: error_1 instanceof Error ? error_1.message : 'Erro desconhecido',
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  📋 SISTEMA DE FILA
    // ═══════════════════════════════════════════════════════════════════════════
    CentralizedMessageSender.prototype.enqueueAndProcess = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var userId;
            var _this = this;
            return __generator(this, function (_a) {
                userId = options.userId;
                return [2 /*return*/, new Promise(function (resolve) {
                        // Obter ou criar fila para este usuário
                        if (!_this.queues.has(userId)) {
                            _this.queues.set(userId, []);
                        }
                        var queue = _this.queues.get(userId);
                        // Adicionar à fila
                        queue.push({
                            options: options,
                            resolve: resolve,
                            queuedAt: Date.now(),
                        });
                        console.log("\uD83D\uDCCB [CENTRALIZED-SENDER] Mensagem enfileirada. Fila de ".concat(userId.substring(0, 8), ": ").concat(queue.length, " msgs"));
                        // Iniciar processamento se não estiver rodando
                        if (!_this.processing.get(userId)) {
                            _this.processQueue(userId);
                        }
                    })];
            });
        });
    };
    CentralizedMessageSender.prototype.processQueue = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var queue, _loop_1, this_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.processing.get(userId))
                            return [2 /*return*/];
                        this.processing.set(userId, true);
                        queue = this.queues.get(userId) || [];
                        console.log("\uD83D\uDD04 [CENTRALIZED-SENDER] Iniciando processamento da fila de ".concat(userId.substring(0, 8), "..."));
                        _loop_1 = function () {
                            var item, options, resolve, jid, content, socket, origin_1, quotedMessage, skipTyping, contactNumber, delay_2, result, error_2;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        item = queue.shift();
                                        options = item.options, resolve = item.resolve;
                                        jid = options.jid, content = options.content, socket = options.socket, origin_1 = options.origin, quotedMessage = options.quotedMessage, skipTyping = options.skipTyping;
                                        _c.label = 1;
                                    case 1:
                                        _c.trys.push([1, 6, , 7]);
                                        contactNumber = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
                                        delay_2 = antiBanProtectionService_1.antiBanProtectionService.calculateDelay(userId, contactNumber);
                                        console.log("\u23F1\uFE0F [CENTRALIZED-SENDER] Aguardando ".concat(Math.ceil(delay_2 / 1000), "s antes de enviar [").concat(origin_1, "]..."));
                                        if (!(!skipTyping && antiBanProtectionService_1.ANTI_BAN_CONFIG.TYPING_ENABLED)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, (0, antiBanProtectionService_1.simulateTyping)(socket, jid, this_1.getMessageLength(content))];
                                    case 2:
                                        _c.sent();
                                        _c.label = 3;
                                    case 3: 
                                    // 3. Aguardar delay
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, delay_2); })];
                                    case 4:
                                        // 3. Aguardar delay
                                        _c.sent();
                                        return [4 /*yield*/, socket.sendMessage(jid, content, {
                                                quoted: quotedMessage,
                                            })];
                                    case 5:
                                        result = _c.sent();
                                        // 5. Registrar envio no anti-ban
                                        antiBanProtectionService_1.antiBanProtectionService.registerMessageSent(userId, contactNumber);
                                        this_1.recordSent(userId, origin_1, true);
                                        console.log("\u2705 [CENTRALIZED-SENDER] Mensagem enviada [".concat(origin_1, "] \u2192 ").concat(jid.substring(0, 15), "..."));
                                        resolve({
                                            success: true,
                                            messageId: ((_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id) || undefined,
                                            waitedMs: delay_2,
                                        });
                                        return [3 /*break*/, 7];
                                    case 6:
                                        error_2 = _c.sent();
                                        console.error("\u274C [CENTRALIZED-SENDER] Erro ao enviar [".concat(origin_1, "]:"), error_2);
                                        this_1.recordSent(userId, origin_1, false);
                                        resolve({
                                            success: false,
                                            error: error_2 instanceof Error ? error_2.message : 'Erro desconhecido',
                                        });
                                        return [3 /*break*/, 7];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _b.label = 1;
                    case 1:
                        if (!(queue.length > 0)) return [3 /*break*/, 3];
                        return [5 /*yield**/, _loop_1()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 1];
                    case 3:
                        this.processing.set(userId, false);
                        console.log("\u2705 [CENTRALIZED-SENDER] Fila de ".concat(userId.substring(0, 8), " processada"));
                        return [2 /*return*/];
                }
            });
        });
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  🛠️ MÉTODOS AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════════
    CentralizedMessageSender.prototype.isGroupJid = function (jid) {
        return jid.endsWith('@g.us');
    };
    CentralizedMessageSender.prototype.getMessageLength = function (content) {
        if ('text' in content && typeof content.text === 'string') {
            return content.text.length;
        }
        if ('caption' in content && typeof content.caption === 'string') {
            return content.caption.length;
        }
        return 100; // Default para mídia
    };
    CentralizedMessageSender.prototype.recordSent = function (userId, origin, success) {
        if (!this.stats.has(userId)) {
            this.stats.set(userId, {
                totalSent: 0,
                totalFailed: 0,
                byOrigin: {},
                lastSentAt: 0,
            });
        }
        var stats = this.stats.get(userId);
        if (success) {
            stats.totalSent++;
        }
        else {
            stats.totalFailed++;
        }
        stats.byOrigin[origin] = (stats.byOrigin[origin] || 0) + 1;
        stats.lastSentAt = Date.now();
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  📊 ESTATÍSTICAS
    // ═══════════════════════════════════════════════════════════════════════════
    CentralizedMessageSender.prototype.getStats = function (userId) {
        return this.stats.get(userId) || null;
    };
    CentralizedMessageSender.prototype.getQueueSize = function (userId) {
        var _a;
        return ((_a = this.queues.get(userId)) === null || _a === void 0 ? void 0 : _a.length) || 0;
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  ⚡ MÉTODOS DE CONVENIÊNCIA
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Envia mensagem de texto
     */
    CentralizedMessageSender.prototype.sendText = function (userId, jid, text, socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: { text: text }, socket: socket, origin: origin }, options))];
            });
        });
    };
    /**
     * Envia imagem
     */
    CentralizedMessageSender.prototype.sendImage = function (userId, jid, image, caption, socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                content = typeof image === 'string'
                    ? { image: { url: image }, caption: caption }
                    : { image: image, caption: caption };
                return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
            });
        });
    };
    /**
     * Envia vídeo
     */
    CentralizedMessageSender.prototype.sendVideo = function (userId, jid, video, caption, socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                content = typeof video === 'string'
                    ? { video: { url: video }, caption: caption }
                    : { video: video, caption: caption };
                return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
            });
        });
    };
    /**
     * Envia áudio
     */
    CentralizedMessageSender.prototype.sendAudio = function (userId, jid, audio, ptt, socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                content = typeof audio === 'string'
                    ? { audio: { url: audio }, ptt: ptt }
                    : { audio: audio, ptt: ptt };
                return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
            });
        });
    };
    /**
     * Envia documento
     */
    CentralizedMessageSender.prototype.sendDocument = function (userId, jid, document, filename, mimetype, socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                content = typeof document === 'string'
                    ? { document: { url: document }, fileName: filename, mimetype: mimetype }
                    : { document: document, fileName: filename, mimetype: mimetype };
                return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
            });
        });
    };
    /**
     * Envia botões usando ENQUETES (polls) do WhatsApp
     * @param payload - Pode ser objeto completo {body, buttons, header?, footer?} ou text simples
     *
     * v3.0: Usa ENQUETES para simular botões interativos
     * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
     */
    CentralizedMessageSender.prototype.sendButtons = function (userId, jid, payload, // Aceita payload completo ou text simples
    socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var contextText, contactNumber, canSendResult, delay_3, pollOptions, pollName, pollResult, pollError_1, formattedText, content;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        // Se payload é string simples, enviar como texto
                        if (typeof payload === 'string') {
                            return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: { text: payload }, socket: socket, origin: origin }, options))];
                        }
                        // Se não tem body ou buttons, enviar como está
                        if (!payload.body || !((_a = payload.buttons) === null || _a === void 0 ? void 0 : _a.length)) {
                            return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: payload, socket: socket, origin: origin }, options))];
                        }
                        if (!USE_POLLS_FOR_BUTTONS) return [3 /*break*/, 8];
                        _k.label = 1;
                    case 1:
                        _k.trys.push([1, 7, , 8]);
                        console.log("\uD83D\uDDF3\uFE0F [POLL-BUTTONS] Enviando ".concat(payload.buttons.length, " op\u00E7\u00F5es como enquete para ").concat(jid.substring(0, 15), "..."));
                        if (!SEND_CONTEXT_BEFORE_POLL) return [3 /*break*/, 5];
                        contextText = payload.body;
                        if ((_b = payload.footer) === null || _b === void 0 ? void 0 : _b.text) {
                            contextText += "\n\n".concat(payload.footer.text);
                        }
                        contactNumber = jid.replace(/@.*$/, '');
                        canSendResult = antiBanProtectionService_1.antiBanProtectionService.canSendMessage(userId);
                        if (!canSendResult.canSend) return [3 /*break*/, 5];
                        delay_3 = antiBanProtectionService_1.antiBanProtectionService.calculateDelay(userId, contactNumber);
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, delay_3); })];
                    case 2:
                        _k.sent();
                        // Enviar texto de contexto
                        return [4 /*yield*/, socket.sendMessage(jid, { text: contextText })];
                    case 3:
                        // Enviar texto de contexto
                        _k.sent();
                        antiBanProtectionService_1.antiBanProtectionService.registerMessageSent(userId, contactNumber);
                        console.log("\uD83D\uDCDD [POLL-BUTTONS] Texto de contexto enviado");
                        // Pequeno delay antes da enquete
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 500); })];
                    case 4:
                        // Pequeno delay antes da enquete
                        _k.sent();
                        _k.label = 5;
                    case 5:
                        pollOptions = payload.buttons.map(function (btn) { var _a; return ((_a = btn.reply) === null || _a === void 0 ? void 0 : _a.title) || btn.title || "Op\u00E7\u00E3o"; });
                        pollName = ((_c = payload.header) === null || _c === void 0 ? void 0 : _c.text) || 'Selecione uma opção:';
                        return [4 /*yield*/, socket.sendMessage(jid, {
                                poll: {
                                    name: pollName,
                                    values: pollOptions,
                                    selectableCount: 1 // Usuário só pode votar em UMA opção
                                }
                            })];
                    case 6:
                        pollResult = _k.sent();
                        console.log("\u2705 [POLL-BUTTONS] Enquete enviada com sucesso! ID: ".concat((_d = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _d === void 0 ? void 0 : _d.id));
                        // Registrar mapeamento do poll para depois capturar o voto
                        if ((_e = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _e === void 0 ? void 0 : _e.id) {
                            this.registerPollMapping(pollResult.key.id, jid, payload.buttons);
                        }
                        this.recordSent(userId, origin, true);
                        return [2 /*return*/, {
                                success: true,
                                messageId: ((_f = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _f === void 0 ? void 0 : _f.id) || undefined,
                                waitedMs: 500,
                            }];
                    case 7:
                        pollError_1 = _k.sent();
                        console.error("\u26A0\uFE0F [POLL-BUTTONS] Falha ao enviar enquete, usando fallback texto:", pollError_1);
                        return [3 /*break*/, 8];
                    case 8:
                        formattedText = payload.body;
                        // Adicionar footer se existir
                        if ((_g = payload.footer) === null || _g === void 0 ? void 0 : _g.text) {
                            formattedText += "\n\n".concat(payload.footer.text);
                        }
                        // Adicionar botões como menu numérico
                        if (payload.buttons && payload.buttons.length > 0) {
                            formattedText += '\n\n*📋 Escolha uma opção:*\n';
                            payload.buttons.forEach(function (btn, index) {
                                var _a;
                                var number = index + 1;
                                var title = ((_a = btn.reply) === null || _a === void 0 ? void 0 : _a.title) || btn.title || "Op\u00E7\u00E3o ".concat(number);
                                formattedText += "\n*".concat(number, ".* ").concat(title);
                            });
                            formattedText += '\n\n_👆 Digite o número ou escreva sua escolha_';
                        }
                        console.log("\uD83D\uDD22 [MENU-NUMERICO] Enviando ".concat(((_h = payload.buttons) === null || _h === void 0 ? void 0 : _h.length) || 0, " op\u00E7\u00F5es como texto numerado"));
                        content = { text: formattedText };
                        console.log("\uD83D\uDCF1 [BUTTONS\u2192TEXT] Enviando ".concat(((_j = payload.buttons) === null || _j === void 0 ? void 0 : _j.length) || 0, " bot\u00F5es como texto para ").concat(jid.substring(0, 15), "..."));
                        return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
                }
            });
        });
    };
    /**
     * Envia lista usando ENQUETES (polls) do WhatsApp
     * @param payload - Pode ser objeto completo {body, buttonText, sections, header?, footer?} ou text simples
     *
     * v3.0: Usa ENQUETES para simular listas interativas
     * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
     */
    CentralizedMessageSender.prototype.sendList = function (userId, jid, payload, // Aceita payload completo ou parâmetros individuais
    socket, origin, options) {
        return __awaiter(this, void 0, void 0, function () {
            var totalItems_1, contextText, contactNumber, canSendResult, delay_4, allItems, buttonMappings, _i, _a, section, _b, _c, row, pollOptions, limitedMappings, pollName, pollResult, pollError_2, formattedText, itemIndex_1, content, totalItems;
            var _d, _e, _f, _g, _h, _j, _k, _l;
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        // Se payload é string simples, enviar como texto
                        if (typeof payload === 'string') {
                            return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: { text: payload }, socket: socket, origin: origin }, options))];
                        }
                        // Se não tem body ou sections, enviar como está
                        if (!payload.body || !((_d = payload.sections) === null || _d === void 0 ? void 0 : _d.length)) {
                            return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: payload, socket: socket, origin: origin }, options))];
                        }
                        if (!USE_POLLS_FOR_BUTTONS) return [3 /*break*/, 8];
                        _m.label = 1;
                    case 1:
                        _m.trys.push([1, 7, , 8]);
                        totalItems_1 = payload.sections.reduce(function (acc, s) { var _a; return acc + (((_a = s.rows) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
                        console.log("\uD83D\uDDF3\uFE0F [POLL-LIST] Enviando lista com ".concat(totalItems_1, " itens como enquete para ").concat(jid.substring(0, 15), "..."));
                        if (!SEND_CONTEXT_BEFORE_POLL) return [3 /*break*/, 5];
                        contextText = payload.body;
                        if ((_e = payload.footer) === null || _e === void 0 ? void 0 : _e.text) {
                            contextText += "\n\n".concat(payload.footer.text);
                        }
                        contactNumber = jid.replace(/@.*$/, '');
                        canSendResult = antiBanProtectionService_1.antiBanProtectionService.canSendMessage(userId);
                        if (!canSendResult.canSend) return [3 /*break*/, 5];
                        delay_4 = antiBanProtectionService_1.antiBanProtectionService.calculateDelay(userId, contactNumber);
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, delay_4); })];
                    case 2:
                        _m.sent();
                        // Enviar texto de contexto
                        return [4 /*yield*/, socket.sendMessage(jid, { text: contextText })];
                    case 3:
                        // Enviar texto de contexto
                        _m.sent();
                        antiBanProtectionService_1.antiBanProtectionService.registerMessageSent(userId, contactNumber);
                        console.log("\uD83D\uDCDD [POLL-LIST] Texto de contexto enviado");
                        // Pequeno delay antes da enquete
                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 500); })];
                    case 4:
                        // Pequeno delay antes da enquete
                        _m.sent();
                        _m.label = 5;
                    case 5:
                        allItems = [];
                        buttonMappings = [];
                        for (_i = 0, _a = payload.sections; _i < _a.length; _i++) {
                            section = _a[_i];
                            for (_b = 0, _c = (section.rows || []); _b < _c.length; _b++) {
                                row = _c[_b];
                                allItems.push(row.title || 'Opção');
                                buttonMappings.push({
                                    reply: { id: row.id, title: row.title },
                                    id: row.id,
                                    title: row.title
                                });
                            }
                        }
                        pollOptions = allItems.slice(0, 12);
                        limitedMappings = buttonMappings.slice(0, 12);
                        pollName = ((_f = payload.header) === null || _f === void 0 ? void 0 : _f.text) || payload.buttonText || 'Selecione uma opção:';
                        return [4 /*yield*/, socket.sendMessage(jid, {
                                poll: {
                                    name: pollName,
                                    values: pollOptions,
                                    selectableCount: 1 // Usuário só pode votar em UMA opção
                                }
                            })];
                    case 6:
                        pollResult = _m.sent();
                        console.log("\u2705 [POLL-LIST] Enquete enviada com sucesso! ID: ".concat((_g = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _g === void 0 ? void 0 : _g.id));
                        // Registrar mapeamento do poll para depois capturar o voto
                        if ((_h = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _h === void 0 ? void 0 : _h.id) {
                            this.registerPollMapping(pollResult.key.id, jid, limitedMappings);
                        }
                        this.recordSent(userId, origin, true);
                        return [2 /*return*/, {
                                success: true,
                                messageId: ((_j = pollResult === null || pollResult === void 0 ? void 0 : pollResult.key) === null || _j === void 0 ? void 0 : _j.id) || undefined,
                                waitedMs: 500,
                            }];
                    case 7:
                        pollError_2 = _m.sent();
                        console.error("\u26A0\uFE0F [POLL-LIST] Falha ao enviar enquete, usando fallback texto:", pollError_2);
                        return [3 /*break*/, 8];
                    case 8:
                        formattedText = payload.body;
                        // Adicionar footer se existir
                        if ((_k = payload.footer) === null || _k === void 0 ? void 0 : _k.text) {
                            formattedText += "\n\n".concat(payload.footer.text);
                        }
                        // Adicionar seções e itens como menu numérico
                        if (payload.sections && payload.sections.length > 0) {
                            itemIndex_1 = 1;
                            payload.sections.forEach(function (section) {
                                if (section.title) {
                                    formattedText += "\n\n*\uD83D\uDCC2 ".concat(section.title, "*");
                                }
                                if (section.rows && section.rows.length > 0) {
                                    section.rows.forEach(function (row) {
                                        formattedText += "\n*".concat(itemIndex_1, ".* ").concat(row.title);
                                        if (row.description) {
                                            formattedText += "\n   _".concat(row.description, "_");
                                        }
                                        itemIndex_1++;
                                    });
                                }
                            });
                            formattedText += '\n\n_👆 Digite o número ou escreva sua escolha_';
                        }
                        content = { text: formattedText };
                        totalItems = ((_l = payload.sections) === null || _l === void 0 ? void 0 : _l.reduce(function (acc, s) { var _a; return acc + (((_a = s.rows) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0)) || 0;
                        console.log("\uD83D\uDCCB [LIST\u2192TEXT] Enviando lista com ".concat(totalItems, " itens como texto para ").concat(jid.substring(0, 15), "..."));
                        return [2 /*return*/, this.sendMessage(__assign({ userId: userId, jid: jid, content: content, socket: socket, origin: origin }, options))];
                }
            });
        });
    };
    /**
     * Reseta contador de batch (quando cliente interage)
     */
    CentralizedMessageSender.prototype.resetBatchCounter = function (userId) {
        antiBanProtectionService_1.antiBanProtectionService.resetBatchCounter(userId);
    };
    return CentralizedMessageSender;
}());
// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
exports.centralizedMessageSender = new CentralizedMessageSender();
exports.default = exports.centralizedMessageSender;
