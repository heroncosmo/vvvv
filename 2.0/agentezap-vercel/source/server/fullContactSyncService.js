"use strict";
/**
 * 🔄 SERVIÇO DE SINCRONIZAÇÃO COMPLETA DE CONTATOS - FILA ASSÍNCRONA GLOBAL
 *
 * ⚠️ OTIMIZADO PARA ESCALA - Todos os clientes do sistema usam este serviço!
 *
 * FUNCIONALIDADES:
 * - Sincronização de TODOS os contatos (agenda + conversas)
 * - Fila FIFO global para não sobrecarregar o Supabase
 * - Batch upserts otimizados (máximo 50 contatos por batch)
 * - Rate limiting: 1 sync por vez no sistema inteiro
 * - Cron job automático: 1x por dia às 03:00 (horário de menor uso)
 * - Botão manual "Sincronizar" disponível a qualquer momento
 *
 * OTIMIZAÇÕES PARA SUPABASE:
 * - Egress: Batches pequenos, sem retornar dados desnecessários
 * - Disk IO: Upsert com ON CONFLICT para evitar duplicatas
 * - Connection Pool: Reusa conexões do pool existente
 *
 * @author Agentezap Team
 * @version 2.0.0
 */
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
exports.getFullSyncStatus = getFullSyncStatus;
exports.startFullContactSync = startFullContactSync;
exports.scheduleFullSyncForAllClients = scheduleFullSyncForAllClients;
exports.startDailySyncCron = startDailySyncCron;
exports.getQueueStats = getQueueStats;
var db_1 = require("./db");
var schema_1 = require("../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ============================================
// CONFIGURAÇÕES DE PERFORMANCE
// ============================================
var CONFIG = {
    // Batching
    BATCH_SIZE: 50, // Contatos por batch (otimizado para Supabase)
    DELAY_BETWEEN_BATCHES_MS: 1000, // 1s entre batches para não sobrecarregar
    // Limites
    MAX_CONTACTS_PER_SYNC: 50000, // Máximo de contatos por cliente
    MAX_CONCURRENT_SYNCS: 1, // Apenas 1 sync por vez (evita sobrecarga)
    // Cache
    CACHE_TTL_MS: 30 * 60 * 1000, // 30 minutos de cache
    // Rate Limiting
    MIN_HOURS_BETWEEN_SYNCS: 6, // Mínimo de 6 horas entre syncs do mesmo cliente
    // Cron
    CRON_HOUR_UTC: 6, // 03:00 BRT = 06:00 UTC
};
// ============================================
// ESTADO GLOBAL
// ============================================
var fullSyncStatusMap = new Map();
var globalFullSyncQueue = []; // connectionIds na fila
var activeFullSyncs = 0;
var cronJobStarted = false;
// Cache de contatos já processados
var processedContactsCache = new Map();
// ============================================
// FUNÇÕES PÚBLICAS
// ============================================
/**
 * Obtém status da sincronização completa
 */
function getFullSyncStatus(connectionId) {
    var status = fullSyncStatusMap.get(connectionId);
    if (status) {
        var queuePosition = globalFullSyncQueue.indexOf(connectionId);
        return __assign(__assign({}, status), { queuePosition: queuePosition >= 0 ? queuePosition + 1 : undefined });
    }
    return {
        connectionId: connectionId,
        userId: '',
        status: 'idle',
        progress: 0,
        totalContacts: 0,
        processedContacts: 0,
        contactsFromWhatsapp: 0,
        contactsFromConversations: 0,
    };
}
/**
 * Inicia sincronização COMPLETA de todos os contatos
 * Combina contatos do WhatsApp (contacts.upsert) + conversas
 */
function startFullContactSync(userId_1, connectionId_1) {
    return __awaiter(this, arguments, void 0, function (userId, connectionId, force) {
        var currentStatus, position_1, lastSync, hoursSinceSync, hoursRemaining, position, nextAutoSync, estimatedMinutes;
        if (force === void 0) { force = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n\uD83D\uDCF1 [FULL SYNC] Iniciando sincroniza\u00E7\u00E3o completa para connection ".concat(connectionId));
                    currentStatus = fullSyncStatusMap.get(connectionId);
                    // Verificar se já está rodando
                    if ((currentStatus === null || currentStatus === void 0 ? void 0 : currentStatus.status) === 'running') {
                        console.log("[FULL SYNC] \u23F3 Sincroniza\u00E7\u00E3o j\u00E1 em andamento para ".concat(connectionId));
                        return [2 /*return*/, {
                                message: '⏳ Sincronização já está em andamento. Aguarde até 15 minutos.',
                                status: 'already_running'
                            }];
                    }
                    // Verificar se já está na fila
                    if ((currentStatus === null || currentStatus === void 0 ? void 0 : currentStatus.status) === 'queued') {
                        position_1 = globalFullSyncQueue.indexOf(connectionId) + 1;
                        console.log("[FULL SYNC] \u23F3 Connection ".concat(connectionId, " j\u00E1 est\u00E1 na fila (posi\u00E7\u00E3o ").concat(position_1, ")"));
                        return [2 /*return*/, {
                                message: "\u23F3 Voc\u00EA est\u00E1 na posi\u00E7\u00E3o ".concat(position_1, " da fila. Aguarde sua vez."),
                                status: 'queued',
                                queuePosition: position_1
                            }];
                    }
                    if (!!force) return [3 /*break*/, 2];
                    return [4 /*yield*/, getLastSyncTime(connectionId)];
                case 1:
                    lastSync = _a.sent();
                    if (lastSync) {
                        hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
                        if (hoursSinceSync < CONFIG.MIN_HOURS_BETWEEN_SYNCS) {
                            hoursRemaining = CONFIG.MIN_HOURS_BETWEEN_SYNCS - hoursSinceSync;
                            console.log("[FULL SYNC] \u23F0 Rate limited para ".concat(connectionId, ". Pr\u00F3ximo sync em ").concat(hoursRemaining.toFixed(1), "h"));
                            return [2 /*return*/, {
                                    message: "\u23F0 \u00DAltima sincroniza\u00E7\u00E3o foi h\u00E1 ".concat(hoursSinceSync.toFixed(1), "h. Aguarde mais ").concat(hoursRemaining.toFixed(1), "h ou use o bot\u00E3o \"For\u00E7ar Sincroniza\u00E7\u00E3o\"."),
                                    status: 'rate_limited'
                                }];
                        }
                    }
                    _a.label = 2;
                case 2:
                    // Adicionar à fila
                    if (!globalFullSyncQueue.includes(connectionId)) {
                        globalFullSyncQueue.push(connectionId);
                    }
                    position = globalFullSyncQueue.indexOf(connectionId) + 1;
                    nextAutoSync = getNextAutoSyncTime();
                    // Inicializar status
                    fullSyncStatusMap.set(connectionId, {
                        connectionId: connectionId,
                        userId: userId,
                        status: 'queued',
                        progress: 0,
                        totalContacts: 0,
                        processedContacts: 0,
                        contactsFromWhatsapp: 0,
                        contactsFromConversations: 0,
                        queuePosition: position,
                        nextAutoSyncAt: nextAutoSync,
                    });
                    console.log("[FULL SYNC] \u2705 Connection ".concat(connectionId, " adicionado \u00E0 fila (posi\u00E7\u00E3o ").concat(position, ")"));
                    // Iniciar processamento da fila
                    processFullSyncQueue();
                    if (position === 1 && activeFullSyncs < CONFIG.MAX_CONCURRENT_SYNCS) {
                        return [2 /*return*/, {
                                message: '✅ Sincronização completa iniciada! Aguarde até 15 minutos para todos os contatos aparecerem.',
                                status: 'started'
                            }];
                    }
                    estimatedMinutes = position * 10;
                    return [2 /*return*/, {
                            message: "\u23F3 Voc\u00EA est\u00E1 na posi\u00E7\u00E3o ".concat(position, " da fila. Tempo estimado: ").concat(estimatedMinutes, " minutos."),
                            status: 'queued',
                            queuePosition: position
                        }];
            }
        });
    });
}
/**
 * Agenda sincronização para TODOS os clientes ativos
 * Usado pelo cron job diário
 */
function scheduleFullSyncForAllClients() {
    return __awaiter(this, void 0, void 0, function () {
        var scheduled, skipped, errors, activeConnections, _i, activeConnections_1, conn, status_1, lastSync, hoursSinceSync, err_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n\uD83D\uDD50 [CRON] Iniciando agendamento de sincroniza\u00E7\u00E3o para todos os clientes...");
                    scheduled = 0;
                    skipped = 0;
                    errors = 0;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.whatsappConnections.id,
                            userId: schema_1.whatsappConnections.userId,
                            isConnected: schema_1.whatsappConnections.isConnected,
                        })
                            .from(schema_1.whatsappConnections)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappConnections.isConnected, true))];
                case 2:
                    activeConnections = _a.sent();
                    console.log("[CRON] Encontradas ".concat(activeConnections.length, " conex\u00F5es ativas"));
                    _i = 0, activeConnections_1 = activeConnections;
                    _a.label = 3;
                case 3:
                    if (!(_i < activeConnections_1.length)) return [3 /*break*/, 8];
                    conn = activeConnections_1[_i];
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    status_1 = fullSyncStatusMap.get(conn.id);
                    if ((status_1 === null || status_1 === void 0 ? void 0 : status_1.status) === 'running' || (status_1 === null || status_1 === void 0 ? void 0 : status_1.status) === 'queued') {
                        console.log("[CRON] \u23ED\uFE0F Connection ".concat(conn.id, " j\u00E1 est\u00E1 processando, pulando..."));
                        skipped++;
                        return [3 /*break*/, 7];
                    }
                    return [4 /*yield*/, getLastSyncTime(conn.id)];
                case 5:
                    lastSync = _a.sent();
                    if (lastSync) {
                        hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
                        if (hoursSinceSync < CONFIG.MIN_HOURS_BETWEEN_SYNCS) {
                            console.log("[CRON] \u23ED\uFE0F Connection ".concat(conn.id, " sincronizado recentemente, pulando..."));
                            skipped++;
                            return [3 /*break*/, 7];
                        }
                    }
                    // Adicionar à fila
                    if (!globalFullSyncQueue.includes(conn.id)) {
                        globalFullSyncQueue.push(conn.id);
                        fullSyncStatusMap.set(conn.id, {
                            connectionId: conn.id,
                            userId: conn.userId,
                            status: 'queued',
                            progress: 0,
                            totalContacts: 0,
                            processedContacts: 0,
                            contactsFromWhatsapp: 0,
                            contactsFromConversations: 0,
                            queuePosition: globalFullSyncQueue.length,
                            nextAutoSyncAt: getNextAutoSyncTime(),
                        });
                        scheduled++;
                        console.log("[CRON] \u2705 Connection ".concat(conn.id, " agendado (posi\u00E7\u00E3o ").concat(globalFullSyncQueue.length, ")"));
                    }
                    return [3 /*break*/, 7];
                case 6:
                    err_1 = _a.sent();
                    console.error("[CRON] \u274C Erro ao agendar ".concat(conn.id, ":"), err_1);
                    errors++;
                    return [3 /*break*/, 7];
                case 7:
                    _i++;
                    return [3 /*break*/, 3];
                case 8:
                    // Iniciar processamento da fila
                    if (scheduled > 0) {
                        processFullSyncQueue();
                    }
                    console.log("[CRON] \u2705 Agendamento conclu\u00EDdo: ".concat(scheduled, " agendados, ").concat(skipped, " pulados, ").concat(errors, " erros"));
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _a.sent();
                    console.error("[CRON] \u274C Erro ao buscar conex\u00F5es:", error_1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/, { scheduled: scheduled, skipped: skipped, errors: errors }];
            }
        });
    });
}
/**
 * Inicia o cron job de sincronização diária
 */
function startDailySyncCron() {
    var _this = this;
    if (cronJobStarted) {
        console.log("[CRON] Cron job j\u00E1 est\u00E1 rodando, ignorando...");
        return;
    }
    cronJobStarted = true;
    console.log("\n\uD83D\uDD50 [CRON] Iniciando cron job de sincroniza\u00E7\u00E3o di\u00E1ria (".concat(CONFIG.CRON_HOUR_UTC, ":00 UTC / 03:00 BRT)"));
    // Verificar a cada hora se é hora de rodar
    setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        var now, currentHourUTC, currentMinute;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = new Date();
                    currentHourUTC = now.getUTCHours();
                    currentMinute = now.getUTCMinutes();
                    if (!(currentHourUTC === CONFIG.CRON_HOUR_UTC && currentMinute < 5)) return [3 /*break*/, 2];
                    console.log("\n\uD83D\uDD50 [CRON] Hora de sincroniza\u00E7\u00E3o di\u00E1ria! ".concat(now.toISOString()));
                    return [4 /*yield*/, scheduleFullSyncForAllClients()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); }, 60 * 1000); // Verificar a cada minuto
    console.log("[CRON] \u2705 Cron job iniciado com sucesso");
}
/**
 * Retorna estatísticas da fila
 */
function getQueueStats() {
    return {
        queueLength: globalFullSyncQueue.length,
        activeSyncs: activeFullSyncs,
        connections: __spreadArray([], globalFullSyncQueue, true),
    };
}
// ============================================
// FUNÇÕES INTERNAS
// ============================================
/**
 * Processa a fila global de sincronização
 */
function processFullSyncQueue() {
    return __awaiter(this, void 0, void 0, function () {
        var connectionId, status, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Verificar se pode processar
                    if (activeFullSyncs >= CONFIG.MAX_CONCURRENT_SYNCS || globalFullSyncQueue.length === 0) {
                        return [2 /*return*/];
                    }
                    connectionId = globalFullSyncQueue[0];
                    status = fullSyncStatusMap.get(connectionId);
                    if (!status || status.status !== 'queued') {
                        globalFullSyncQueue.shift();
                        processFullSyncQueue();
                        return [2 /*return*/];
                    }
                    // Marcar como rodando
                    activeFullSyncs++;
                    fullSyncStatusMap.set(connectionId, __assign(__assign({}, status), { status: 'running' }));
                    globalFullSyncQueue.shift();
                    // Atualizar posições na fila
                    globalFullSyncQueue.forEach(function (connId, index) {
                        var s = fullSyncStatusMap.get(connId);
                        if (s) {
                            fullSyncStatusMap.set(connId, __assign(__assign({}, s), { queuePosition: index + 1 }));
                        }
                    });
                    console.log("\n\uD83D\uDE80 [FULL SYNC] Iniciando sincroniza\u00E7\u00E3o para ".concat(connectionId));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, executeFullSync(connectionId, status.userId)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    error_2 = _a.sent();
                    console.error("[FULL SYNC] \u274C Erro ao sincronizar ".concat(connectionId, ":"), error_2);
                    fullSyncStatusMap.set(connectionId, __assign(__assign({}, status), { status: 'error', error: error_2 instanceof Error ? error_2.message : 'Erro desconhecido' }));
                    return [3 /*break*/, 5];
                case 4:
                    activeFullSyncs--;
                    // Processar próximo após delay
                    setTimeout(function () { return processFullSyncQueue(); }, 2000);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Executa a sincronização completa para uma conexão
 */
function executeFullSync(connectionId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var status, processedPhones, whatsappContacts, conversationContacts, allContacts, _i, whatsappContacts_1, contact, _a, conversationContacts_1, contact, existing, contactsToSync, total, i, batch, _b, batch_1, contact, processed, progress, err_2;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    status = fullSyncStatusMap.get(connectionId);
                    console.log("[FULL SYNC] \uD83D\uDCE5 Coletando contatos para ".concat(connectionId, "..."));
                    // Limpar cache antigo para esta conexão
                    processedContactsCache.delete(connectionId);
                    processedPhones = new Set();
                    processedContactsCache.set(connectionId, processedPhones);
                    // 1. BUSCAR CONTATOS JÁ SALVOS DO WHATSAPP (contacts.upsert)
                    console.log("[FULL SYNC] 1\uFE0F\u20E3 Buscando contatos salvos do WhatsApp...");
                    return [4 /*yield*/, getWhatsappContacts(connectionId)];
                case 1:
                    whatsappContacts = _d.sent();
                    console.log("[FULL SYNC]    \u2192 ".concat(whatsappContacts.length, " contatos do WhatsApp"));
                    // 2. BUSCAR CONTATOS DAS CONVERSAS
                    console.log("[FULL SYNC] 2\uFE0F\u20E3 Buscando contatos das conversas...");
                    return [4 /*yield*/, getConversationContacts(connectionId)];
                case 2:
                    conversationContacts = _d.sent();
                    console.log("[FULL SYNC]    \u2192 ".concat(conversationContacts.length, " contatos de conversas"));
                    allContacts = new Map();
                    // Primeiro os contatos do WhatsApp (têm mais dados)
                    for (_i = 0, whatsappContacts_1 = whatsappContacts; _i < whatsappContacts_1.length; _i++) {
                        contact = whatsappContacts_1[_i];
                        if (contact.phone && !allContacts.has(contact.phone)) {
                            allContacts.set(contact.phone, contact);
                        }
                    }
                    // Depois os das conversas (preenche gaps)
                    for (_a = 0, conversationContacts_1 = conversationContacts; _a < conversationContacts_1.length; _a++) {
                        contact = conversationContacts_1[_a];
                        if (contact.phone && !allContacts.has(contact.phone)) {
                            allContacts.set(contact.phone, contact);
                        }
                        else if (contact.phone && !((_c = allContacts.get(contact.phone)) === null || _c === void 0 ? void 0 : _c.name) && contact.name) {
                            existing = allContacts.get(contact.phone);
                            allContacts.set(contact.phone, __assign(__assign({}, existing), { name: contact.name }));
                        }
                    }
                    contactsToSync = Array.from(allContacts.values());
                    total = contactsToSync.length;
                    console.log("[FULL SYNC] \uD83D\uDCCA Total de contatos \u00FAnicos: ".concat(total));
                    // Atualizar status
                    fullSyncStatusMap.set(connectionId, __assign(__assign({}, status), { totalContacts: total, contactsFromWhatsapp: whatsappContacts.length, contactsFromConversations: conversationContacts.length }));
                    if (total === 0) {
                        fullSyncStatusMap.set(connectionId, __assign(__assign({}, status), { status: 'completed', progress: 100, totalContacts: 0, processedContacts: 0, lastSyncAt: new Date(), nextAutoSyncAt: getNextAutoSyncTime() }));
                        console.log("[FULL SYNC] \u2705 Nenhum contato para sincronizar");
                        return [2 /*return*/];
                    }
                    // 4. PROCESSAR EM BATCHES
                    console.log("[FULL SYNC] \uD83D\uDCE4 Salvando contatos em batches de ".concat(CONFIG.BATCH_SIZE, "..."));
                    i = 0;
                    _d.label = 3;
                case 3:
                    if (!(i < contactsToSync.length)) return [3 /*break*/, 10];
                    batch = contactsToSync.slice(i, i + CONFIG.BATCH_SIZE);
                    _d.label = 4;
                case 4:
                    _d.trys.push([4, 8, , 9]);
                    return [4 /*yield*/, saveBatchToDatabase(connectionId, batch)];
                case 5:
                    _d.sent();
                    // Marcar como processados
                    for (_b = 0, batch_1 = batch; _b < batch_1.length; _b++) {
                        contact = batch_1[_b];
                        processedPhones.add(contact.phone);
                    }
                    processed = Math.min(i + CONFIG.BATCH_SIZE, total);
                    progress = Math.round((processed / total) * 100);
                    fullSyncStatusMap.set(connectionId, __assign(__assign({}, fullSyncStatusMap.get(connectionId)), { processedContacts: processed, progress: progress }));
                    // Log a cada 25%
                    if (progress % 25 === 0 || processed === total) {
                        console.log("[FULL SYNC] \uD83D\uDCCA Progresso: ".concat(progress, "% (").concat(processed, "/").concat(total, ")"));
                    }
                    if (!(i + CONFIG.BATCH_SIZE < total)) return [3 /*break*/, 7];
                    return [4 /*yield*/, sleep(CONFIG.DELAY_BETWEEN_BATCHES_MS)];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7: return [3 /*break*/, 9];
                case 8:
                    err_2 = _d.sent();
                    console.error("[FULL SYNC] \u274C Erro no batch ".concat(i, ":"), err_2);
                    return [3 /*break*/, 9];
                case 9:
                    i += CONFIG.BATCH_SIZE;
                    return [3 /*break*/, 3];
                case 10:
                    // 5. FINALIZAR
                    fullSyncStatusMap.set(connectionId, __assign(__assign({}, fullSyncStatusMap.get(connectionId)), { status: 'completed', progress: 100, processedContacts: total, lastSyncAt: new Date(), nextAutoSyncAt: getNextAutoSyncTime() }));
                    console.log("\n\u2705 [FULL SYNC] Conclu\u00EDdo para ".concat(connectionId, "!"));
                    console.log("   \uD83D\uDCCA Total: ".concat(total, " contatos"));
                    console.log("   \uD83D\uDCF1 WhatsApp: ".concat(whatsappContacts.length));
                    console.log("   \uD83D\uDCAC Conversas: ".concat(conversationContacts.length));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca contatos já salvos do WhatsApp (via contacts.upsert)
 */
function getWhatsappContacts(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var contacts, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select({
                            phoneNumber: schema_1.whatsappContacts.phoneNumber,
                            name: schema_1.whatsappContacts.name,
                            lid: schema_1.whatsappContacts.lid,
                        })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId), (0, drizzle_orm_1.isNotNull)(schema_1.whatsappContacts.phoneNumber)))
                            .limit(CONFIG.MAX_CONTACTS_PER_SYNC)];
                case 1:
                    contacts = _a.sent();
                    return [2 /*return*/, contacts
                            .filter(function (c) { return c.phoneNumber && c.phoneNumber.length >= 8; })
                            .map(function (c) { return ({
                            phone: cleanPhoneNumber(c.phoneNumber),
                            name: c.name || '',
                            source: 'whatsapp',
                            lid: c.lid || undefined,
                        }); })];
                case 2:
                    error_3 = _a.sent();
                    console.error("[FULL SYNC] Erro ao buscar contatos WhatsApp:", error_3);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca contatos das conversas
 */
function getConversationContacts(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var convContacts, uniqueContacts, _i, convContacts_1, c, phone, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select({
                            contactNumber: schema_1.conversations.contactNumber,
                            contactName: schema_1.conversations.contactName,
                        })
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.contactNumber), (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " NOT LIKE '%@lid%'"], ["", " NOT LIKE '%@lid%'"])), schema_1.conversations.contactNumber), (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " NOT LIKE '%@g.us%'"], ["", " NOT LIKE '%@g.us%'"])), schema_1.conversations.contactNumber)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.conversations.lastMessageTime))
                            .limit(CONFIG.MAX_CONTACTS_PER_SYNC)];
                case 1:
                    convContacts = _a.sent();
                    uniqueContacts = new Map();
                    for (_i = 0, convContacts_1 = convContacts; _i < convContacts_1.length; _i++) {
                        c = convContacts_1[_i];
                        if (!c.contactNumber)
                            continue;
                        phone = cleanPhoneNumber(c.contactNumber);
                        if (phone && phone.length >= 8 && !uniqueContacts.has(phone)) {
                            uniqueContacts.set(phone, c.contactName || '');
                        }
                    }
                    return [2 /*return*/, Array.from(uniqueContacts.entries()).map(function (_a) {
                            var phone = _a[0], name = _a[1];
                            return ({
                                phone: phone,
                                name: name,
                                source: 'conversation',
                            });
                        })];
                case 2:
                    error_4 = _a.sent();
                    console.error("[FULL SYNC] Erro ao buscar contatos de conversas:", error_4);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Salva batch de contatos no banco de dados
 * Usa UPSERT para evitar duplicatas
 */
function saveBatchToDatabase(connectionId, batch) {
    return __awaiter(this, void 0, void 0, function () {
        var now, values;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (batch.length === 0)
                        return [2 /*return*/];
                    now = new Date();
                    values = batch.map(function (c) { return ({
                        connectionId: connectionId,
                        contactId: "".concat(c.phone, "@s.whatsapp.net"),
                        phoneNumber: c.phone,
                        name: c.name || null,
                        lid: c.lid || null,
                        lastSyncedAt: now,
                        updatedAt: now,
                    }); });
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.whatsappContacts)
                            .values(values)
                            .onConflictDoUpdate({
                            target: [schema_1.whatsappContacts.connectionId, schema_1.whatsappContacts.contactId],
                            set: {
                                name: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["COALESCE(EXCLUDED.name, ", ")"], ["COALESCE(EXCLUDED.name, ", ")"])), schema_1.whatsappContacts.name),
                                lid: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["COALESCE(EXCLUDED.lid, ", ")"], ["COALESCE(EXCLUDED.lid, ", ")"])), schema_1.whatsappContacts.lid),
                                lastSyncedAt: now,
                                updatedAt: now,
                            },
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém última sincronização de uma conexão
 */
function getLastSyncTime(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select({ lastSync: schema_1.whatsappContacts.lastSyncedAt })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappContacts.lastSyncedAt))
                            .limit(1)];
                case 1:
                    result = _c.sent();
                    return [2 /*return*/, ((_b = result[0]) === null || _b === void 0 ? void 0 : _b.lastSync) || null];
                case 2:
                    _a = _c.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Calcula próximo horário de sync automático
 */
function getNextAutoSyncTime() {
    var now = new Date();
    var next = new Date();
    next.setUTCHours(CONFIG.CRON_HOUR_UTC, 0, 0, 0);
    // Se já passou da hora hoje, agendar para amanhã
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}
/**
 * Limpa número de telefone
 */
function cleanPhoneNumber(phone) {
    return phone
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/\D/g, '')
        .trim();
}
/**
 * Helper sleep
 */
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
// Export default
exports.default = {
    startFullContactSync: startFullContactSync,
    getFullSyncStatus: getFullSyncStatus,
    scheduleFullSyncForAllClients: scheduleFullSyncForAllClients,
    startDailySyncCron: startDailySyncCron,
    getQueueStats: getQueueStats,
};
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
