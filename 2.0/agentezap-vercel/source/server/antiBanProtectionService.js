"use strict";
/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║              🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP v5.0 - SIMPLES E EFICAZ              ║
 * ╠══════════════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                                      ║
 * ║  📋 FUNCIONALIDADES PRINCIPAIS:                                                      ║
 * ║                                                                                      ║
 * ║  1. Delay entre mensagens (3-8 segundos) - variável para parecer humano             ║
 * ║  2. Detectar quando o DONO envia mensagem manual - contar no delay                  ║
 * ║  3. Sistema de LOTES: após 10 mensagens, pausa de 1 minuto                          ║
 * ║  4. Simulação de digitação ("composing") antes de cada mensagem                     ║
 * ║  5. Logs detalhados para monitoramento                                              ║
 * ║                                                                                      ║
 * ║  ❌ SEM rate limiting absurdo (10 msgs/hora é ridículo para negócios)               ║
 * ║  ❌ SEM limites diários que atrapalham o atendimento                                ║
 * ║                                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
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
exports.antiBanProtectionService = exports.groupMetadataCache = exports.ANTI_BAN_CONFIG_V4 = exports.ANTI_BAN_CONFIG = void 0;
exports.simulateTyping = simulateTyping;
// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES ANTI-BANIMENTO v5.0 - REALISTAS E FUNCIONAIS
// ═══════════════════════════════════════════════════════════════════════════════
exports.ANTI_BAN_CONFIG = {
    // ═══════════════════════════════════════════════════════════════════════════
    // DELAYS ENTRE MENSAGENS (valores realistas - 5 a 15 segundos)
    // ═══════════════════════════════════════════════════════════════════════════
    MIN_DELAY_MS: 5000, // 5 segundos mínimo
    MAX_DELAY_MS: 15000, // 15 segundos máximo
    // Delay após mensagem manual do DONO
    OWNER_MESSAGE_DELAY_MS: 5000, // 5 segundos após dono enviar manualmente
    // ═══════════════════════════════════════════════════════════════════════════
    // SISTEMA DE LOTES - Pausa após 10 mensagens consecutivas
    // ═══════════════════════════════════════════════════════════════════════════
    BATCH_SIZE: 10, // Após 10 envios consecutivos
    BATCH_PAUSE_MS: 60000, // Pausa de 1 MINUTO (60 segundos)
    // ═══════════════════════════════════════════════════════════════════════════
    // DIGITANDO (typing indicator) - Simula digitação antes de enviar
    // ═══════════════════════════════════════════════════════════════════════════
    TYPING_ENABLED: true, // Habilitar simulação de digitação
    TYPING_MIN_MS: 1500, // 1.5 segundos mínimo digitando
    TYPING_MAX_MS: 4000, // 4 segundos máximo digitando
    TYPING_CHARS_PER_SECOND: 35, // Velocidade simulada de digitação
};
// Para compatibilidade com código existente
exports.ANTI_BAN_CONFIG_V4 = exports.ANTI_BAN_CONFIG;
// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL - PROTEÇÃO ANTI-BAN SIMPLIFICADA
// ═══════════════════════════════════════════════════════════════════════════════
var AntiBanProtectionService = /** @class */ (function () {
    function AntiBanProtectionService() {
        this.channelStats = new Map();
        console.log('🛡️ [ANTI-BAN v5.0] Sistema SIMPLIFICADO inicializado');
        console.log("   \uD83D\uDCCA Delay entre msgs: ".concat(exports.ANTI_BAN_CONFIG.MIN_DELAY_MS / 1000, "-").concat(exports.ANTI_BAN_CONFIG.MAX_DELAY_MS / 1000, "s"));
        console.log("   \uD83D\uDCCA Ap\u00F3s msg do dono: +".concat(exports.ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS / 1000, "s"));
        console.log("   \uD83D\uDCCA Lote: ".concat(exports.ANTI_BAN_CONFIG.BATCH_SIZE, " msgs \u2192 pausa ").concat(exports.ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1000, "s"));
    }
    // ═══════════════════════════════════════════════════════════════════════════
    //  OBTER STATS DO CANAL
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.getChannelStats = function (userId) {
        if (!this.channelStats.has(userId)) {
            this.channelStats.set(userId, {
                userId: userId,
                consecutiveMessages: 0,
                lastMessageAt: 0,
                lastOwnerMessageAt: 0,
                lastOwnerMessageContact: null,
                isPaused: false,
                pauseEndAt: 0,
            });
        }
        return this.channelStats.get(userId);
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  REGISTRAR MENSAGEM MANUAL DO DONO
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.registerOwnerManualMessage = function (userId, contactNumber, _messageType) {
        var stats = this.getChannelStats(userId);
        var now = Date.now();
        // Atualizar stats
        stats.lastOwnerMessageAt = now;
        stats.lastOwnerMessageContact = contactNumber;
        // Mensagem manual do dono "reinicia" o contador de lote
        // (ele está ativamente conversando, então o padrão é mais humano)
        stats.consecutiveMessages = 0;
        console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \uD83D\uDC64 Mensagem MANUAL do DONO detectada");
        console.log("   \uD83D\uDCF1 Contato: ".concat(contactNumber));
        console.log("   \uD83D\uDD04 Contador de lote reiniciado");
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  CALCULAR DELAY ANTES DE ENVIAR
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.calculateDelay = function (userId, contactNumber) {
        var stats = this.getChannelStats(userId);
        var now = Date.now();
        // Verificar se está em pausa de lote
        if (stats.isPaused && now < stats.pauseEndAt) {
            var remainingPause = stats.pauseEndAt - now;
            console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \u23F8\uFE0F Canal em PAUSA de lote por mais ".concat(Math.ceil(remainingPause / 1000), "s"));
            return remainingPause;
        }
        else if (stats.isPaused) {
            // Pausa acabou
            stats.isPaused = false;
            stats.consecutiveMessages = 0;
            console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \u25B6\uFE0F Pausa de lote FINALIZADA - retomando");
        }
        // Delay base aleatório (3-8 segundos)
        var delay = this.randomBetween(exports.ANTI_BAN_CONFIG.MIN_DELAY_MS, exports.ANTI_BAN_CONFIG.MAX_DELAY_MS);
        // Se o dono enviou mensagem recentemente para este contato, adicionar delay extra
        var timeSinceOwnerMessage = now - stats.lastOwnerMessageAt;
        if (timeSinceOwnerMessage < exports.ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS &&
            stats.lastOwnerMessageContact === contactNumber) {
            var extraDelay = exports.ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS - timeSinceOwnerMessage;
            delay += extraDelay;
            console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \uD83D\uDC64 Dono enviou msg h\u00E1 ".concat(Math.ceil(timeSinceOwnerMessage / 1000), "s - delay extra: ").concat(Math.ceil(extraDelay / 1000), "s"));
        }
        // Verificar tempo desde última mensagem
        var timeSinceLastMessage = now - stats.lastMessageAt;
        if (timeSinceLastMessage < delay) {
            delay = Math.max(delay - timeSinceLastMessage, exports.ANTI_BAN_CONFIG.MIN_DELAY_MS);
        }
        return delay;
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  REGISTRAR ENVIO DE MENSAGEM
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.registerMessageSent = function (userId, contactNumber) {
        var stats = this.getChannelStats(userId);
        var now = Date.now();
        // Atualizar stats
        stats.lastMessageAt = now;
        stats.consecutiveMessages++;
        // Verificar se atingiu o limite de lote
        if (stats.consecutiveMessages >= exports.ANTI_BAN_CONFIG.BATCH_SIZE) {
            stats.isPaused = true;
            stats.pauseEndAt = now + exports.ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
            console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \uD83D\uDCE6 LOTE DE ".concat(exports.ANTI_BAN_CONFIG.BATCH_SIZE, " MSGS ATINGIDO"));
            console.log("   \u23F8\uFE0F Iniciando pausa de ".concat(exports.ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1000, " segundos (1 minuto)"));
            return {
                shouldPause: true,
                pauseDuration: exports.ANTI_BAN_CONFIG.BATCH_PAUSE_MS,
            };
        }
        console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \u2705 Msg enviada - Lote: ".concat(stats.consecutiveMessages, "/").concat(exports.ANTI_BAN_CONFIG.BATCH_SIZE));
        return { shouldPause: false, pauseDuration: 0 };
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  VERIFICAR SE PODE ENVIAR
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.canSendMessage = function (userId) {
        var stats = this.getChannelStats(userId);
        var now = Date.now();
        // Verificar se está em pausa de lote
        if (stats.isPaused && now < stats.pauseEndAt) {
            var waitMs = stats.pauseEndAt - now;
            return {
                canSend: false,
                waitMs: waitMs,
                reason: "Pausa de lote (".concat(Math.ceil(waitMs / 1000), "s restantes)"),
            };
        }
        return { canSend: true, waitMs: 0, reason: 'OK' };
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  CALCULAR DURAÇÃO DA DIGITAÇÃO
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.calculateTypingDuration = function (messageLength) {
        // Calcular tempo baseado no tamanho da mensagem
        var typingTime = (messageLength / exports.ANTI_BAN_CONFIG.TYPING_CHARS_PER_SECOND) * 1000;
        // Limitar entre min e max
        return Math.min(Math.max(typingTime, exports.ANTI_BAN_CONFIG.TYPING_MIN_MS), exports.ANTI_BAN_CONFIG.TYPING_MAX_MS);
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.randomBetween = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    // ═══════════════════════════════════════════════════════════════════════════
    //  OBTER ESTATÍSTICAS
    // ═══════════════════════════════════════════════════════════════════════════
    AntiBanProtectionService.prototype.getStats = function (userId) {
        var stats = this.getChannelStats(userId);
        var now = Date.now();
        return {
            consecutiveMessages: stats.consecutiveMessages,
            isPaused: stats.isPaused && now < stats.pauseEndAt,
            pauseRemainingMs: stats.isPaused ? Math.max(0, stats.pauseEndAt - now) : 0,
        };
    };
    // Método para resetar contador (útil quando há interação do cliente)
    AntiBanProtectionService.prototype.resetBatchCounter = function (userId) {
        var stats = this.getChannelStats(userId);
        stats.consecutiveMessages = 0;
        console.log("\uD83D\uDEE1\uFE0F [ANTI-BAN v5.0] \uD83D\uDD04 Contador de lote resetado para ".concat(userId.substring(0, 8), "..."));
    };
    return AntiBanProtectionService;
}());
var GroupMetadataCache = /** @class */ (function () {
    function GroupMetadataCache() {
        this.cache = new Map();
        this.TTL_MS = 30 * 60 * 1000; // 30 minutos
    }
    GroupMetadataCache.prototype.set = function (groupId, metadata) {
        this.cache.set(groupId, __assign(__assign({}, metadata), { fetchedAt: Date.now() }));
        console.log("\uD83D\uDCE6 [GROUP-CACHE] Metadados cacheados para grupo ".concat(groupId.substring(0, 20), "..."));
    };
    GroupMetadataCache.prototype.get = function (groupId) {
        var cached = this.cache.get(groupId);
        if (!cached)
            return null;
        // Verificar se expirou
        if (Date.now() - cached.fetchedAt > this.TTL_MS) {
            this.cache.delete(groupId);
            return null;
        }
        return cached;
    };
    GroupMetadataCache.prototype.has = function (groupId) {
        var cached = this.get(groupId);
        return cached !== null;
    };
    GroupMetadataCache.prototype.delete = function (groupId) {
        this.cache.delete(groupId);
    };
    GroupMetadataCache.prototype.clear = function () {
        this.cache.clear();
    };
    // Limpar entradas expiradas periodicamente
    GroupMetadataCache.prototype.cleanup = function () {
        var _this = this;
        var now = Date.now();
        var keysToDelete = [];
        this.cache.forEach(function (value, key) {
            if (now - value.fetchedAt > _this.TTL_MS) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(function (key) { return _this.cache.delete(key); });
    };
    return GroupMetadataCache;
}());
exports.groupMetadataCache = new GroupMetadataCache();
// Limpar cache a cada 10 minutos
setInterval(function () { return exports.groupMetadataCache.cleanup(); }, 10 * 60 * 1000);
// ═══════════════════════════════════════════════════════════════════════════════
//  ⌨️ SIMULADOR DE DIGITAÇÃO (typing indicator)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Envia indicador de "digitando" antes de uma mensagem
 * @param socket - Socket do Baileys
 * @param jid - ID do chat
 * @param messageLength - Tamanho da mensagem (para calcular duração)
 */
function simulateTyping(socket_1, jid_1) {
    return __awaiter(this, arguments, void 0, function (socket, jid, messageLength) {
        var duration_1, error_1;
        if (messageLength === void 0) { messageLength = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!exports.ANTI_BAN_CONFIG.TYPING_ENABLED || !socket)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    duration_1 = exports.antiBanProtectionService.calculateTypingDuration(messageLength);
                    // Enviar "composing" (digitando)
                    return [4 /*yield*/, socket.sendPresenceUpdate('composing', jid)];
                case 2:
                    // Enviar "composing" (digitando)
                    _a.sent();
                    // Aguardar o tempo calculado
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, duration_1); })];
                case 3:
                    // Aguardar o tempo calculado
                    _a.sent();
                    // Enviar "paused" (parou de digitar)
                    return [4 /*yield*/, socket.sendPresenceUpdate('paused', jid)];
                case 4:
                    // Enviar "paused" (parou de digitar)
                    _a.sent();
                    console.log("\u2328\uFE0F [TYPING] Simula\u00E7\u00E3o de digita\u00E7\u00E3o: ".concat(Math.ceil(duration_1 / 1000), "s para ").concat(jid.substring(0, 15), "..."));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    // Erro de typing não deve bloquear envio
                    console.warn("\u26A0\uFE0F [TYPING] Erro ao simular digita\u00E7\u00E3o:", error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
exports.antiBanProtectionService = new AntiBanProtectionService();
exports.default = exports.antiBanProtectionService;
