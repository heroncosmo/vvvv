"use strict";
/**
 * 📱 SERVIÇO DE SINCRONIZAÇÃO DE CONTATOS EM BACKGROUND
 *
 * ⚠️ OTIMIZADO PARA ESCALA - Todos os clientes usam este sistema!
 *
 * OTIMIZAÇÕES:
 * - Máximo 1 sincronização por vez no servidor inteiro
 * - Lotes MUITO pequenos (3 contatos por vez)
 * - Delay GRANDE entre lotes (3 segundos)
 * - Cache em memória para evitar queries repetidas
 * - Limite de 500 contatos por sync (paginar se precisar de mais)
 *
 * REGRA: Somente contatos que JÁ CONVERSARAM (clientes reais)
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
exports.getSyncStatus = getSyncStatus;
exports.startBackgroundSync = startBackgroundSync;
exports.getSyncedContactsFromDB = getSyncedContactsFromDB;
exports.getSyncedContactsCount = getSyncedContactsCount;
exports.hasSyncedBefore = hasSyncedBefore;
var storage_1 = require("./storage");
var db_1 = require("./db");
var schema_1 = require("../shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
// ============================================
// CONFIGURAÇÕES DE PERFORMANCE
// ============================================
var CONFIG = {
    BATCH_SIZE: 10, // Contatos por lote 
    DELAY_BETWEEN_BATCHES: 500, // 500ms entre lotes
    MAX_CONTACTS_PER_SYNC: 2000, // Limite de contatos por sync (2k)
    MAX_CONCURRENT_SYNCS: 2, // 2 syncs por vez no servidor
    CACHE_TTL_MS: 5 * 60 * 1000, // Cache de 5 minutos
};
// Map de status por usuário
var syncStatusMap = new Map();
// Fila GLOBAL de sincronização (todos os usuários)
var globalSyncQueue = [];
var activeSyncs = 0;
// Cache de contagem de contatos (conexãoId:search => contagem + timestamp)
var countCache = new Map();
// Cache de contatos já no banco (evita queries repetidas)
var contactExistsCache = new Map();
/**
 * Limpa cache antigo
 */
function cleanOldCache() {
    var now = Date.now();
    for (var _i = 0, _a = contactExistsCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        if (now - value.timestamp > CONFIG.CACHE_TTL_MS) {
            contactExistsCache.delete(key);
        }
    }
}
/**
 * Obtém o status atual da sincronização
 */
function getSyncStatus(userId) {
    var status = syncStatusMap.get(userId);
    if (status) {
        // Atualizar posição na fila
        var queuePosition = globalSyncQueue.indexOf(userId);
        return __assign(__assign({}, status), { queuePosition: queuePosition >= 0 ? queuePosition + 1 : undefined });
    }
    return {
        userId: userId,
        connectionId: '',
        status: 'idle',
        progress: 0,
        totalContacts: 0,
        processedContacts: 0,
    };
}
/**
 * Inicia sincronização em background
 * Retorna imediatamente com mensagem para o usuário
 */
function startBackgroundSync(userId, connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var currentStatus, position_1, hasSynced, recentContacts, hoursSinceSync, position;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    currentStatus = syncStatusMap.get(userId);
                    // Se já está rodando ou na fila, não adiciona novamente
                    if ((currentStatus === null || currentStatus === void 0 ? void 0 : currentStatus.status) === 'running') {
                        return [2 /*return*/, {
                                message: '⏳ Sincronização já está em andamento. Aguarde até 10 minutos.',
                                status: 'already_running'
                            }];
                    }
                    if ((currentStatus === null || currentStatus === void 0 ? void 0 : currentStatus.status) === 'queued') {
                        position_1 = globalSyncQueue.indexOf(userId) + 1;
                        return [2 /*return*/, {
                                message: "\u23F3 Voc\u00EA est\u00E1 na posi\u00E7\u00E3o ".concat(position_1, " da fila. Aguarde sua vez."),
                                status: 'queued'
                            }];
                    }
                    return [4 /*yield*/, hasSyncedBefore(connectionId)];
                case 1:
                    hasSynced = _b.sent();
                    if (!hasSynced) return [3 /*break*/, 3];
                    return [4 /*yield*/, db_1.db
                            .select({ lastSync: schema_1.whatsappContacts.lastSyncedAt })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappContacts.lastSyncedAt))
                            .limit(1)];
                case 2:
                    recentContacts = _b.sent();
                    if ((_a = recentContacts[0]) === null || _a === void 0 ? void 0 : _a.lastSync) {
                        hoursSinceSync = (Date.now() - recentContacts[0].lastSync.getTime()) / (1000 * 60 * 60);
                        if (hoursSinceSync < 1) {
                            return [2 /*return*/, {
                                    message: '✅ Contatos já estão atualizados! Última sincronização há menos de 1 hora.',
                                    status: 'already_running'
                                }];
                        }
                    }
                    _b.label = 3;
                case 3:
                    // Adiciona à fila
                    if (!globalSyncQueue.includes(userId)) {
                        globalSyncQueue.push(userId);
                    }
                    position = globalSyncQueue.indexOf(userId) + 1;
                    // Inicializa status como "na fila"
                    syncStatusMap.set(userId, {
                        userId: userId,
                        connectionId: connectionId,
                        status: 'queued',
                        progress: 0,
                        totalContacts: 0,
                        processedContacts: 0,
                        queuePosition: position,
                    });
                    // Inicia processamento da fila se não estiver no limite
                    processGlobalQueue();
                    if (position === 1 && activeSyncs < CONFIG.MAX_CONCURRENT_SYNCS) {
                        return [2 /*return*/, {
                                message: '✅ Sincronização iniciada! Os contatos aparecerão em até 10 minutos.',
                                status: 'started'
                            }];
                    }
                    return [2 /*return*/, {
                            message: "\u23F3 Voc\u00EA est\u00E1 na posi\u00E7\u00E3o ".concat(position, " da fila. Aguarde sua vez (estimativa: ").concat(position * 5, " minutos)."),
                            status: 'queued'
                        }];
            }
        });
    });
}
/**
 * Processa a fila GLOBAL de sincronização
 * Apenas 1 sync por vez para não sobrecarregar
 */
function processGlobalQueue() {
    return __awaiter(this, void 0, void 0, function () {
        var userId, status, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Se já tem sync ativa, não inicia outra
                    if (activeSyncs >= CONFIG.MAX_CONCURRENT_SYNCS || globalSyncQueue.length === 0) {
                        return [2 /*return*/];
                    }
                    userId = globalSyncQueue[0];
                    status = syncStatusMap.get(userId);
                    if (!status || status.status !== 'queued') {
                        globalSyncQueue.shift();
                        processGlobalQueue();
                        return [2 /*return*/];
                    }
                    // Marca como rodando
                    activeSyncs++;
                    syncStatusMap.set(userId, __assign(__assign({}, status), { status: 'running' }));
                    globalSyncQueue.shift();
                    // Atualiza posições na fila para os outros
                    globalSyncQueue.forEach(function (uid, index) {
                        var s = syncStatusMap.get(uid);
                        if (s) {
                            syncStatusMap.set(uid, __assign(__assign({}, s), { queuePosition: index + 1 }));
                        }
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, syncContactsForUser(userId, status.connectionId)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _a.sent();
                    console.error("[SYNC ERROR] Falha ao sincronizar para ".concat(userId, ":"), error_1);
                    syncStatusMap.set(userId, __assign(__assign({}, status), { status: 'error', error: error_1 instanceof Error ? error_1.message : 'Erro desconhecido' }));
                    return [3 /*break*/, 5];
                case 4:
                    activeSyncs--;
                    // Processa próximo da fila
                    setTimeout(function () { return processGlobalQueue(); }, 1000);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Sincroniza contatos de um usuário em lotes MUITO pequenos
 * REGRA: Somente contatos que já conversaram (têm conversas)
 */
function syncContactsForUser(userId, connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var status, allConversations, uniqueContacts, _i, allConversations_1, conv, phone, contactsArray, i, batch, _a, batch_1, contact, cacheKey, cached, existing, err_1, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("[SYNC] \uD83D\uDE80 Iniciando sincroniza\u00E7\u00E3o para user ".concat(userId));
                    status = syncStatusMap.get(userId);
                    // Limpar cache antigo
                    cleanOldCache();
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 16, , 17]);
                    return [4 /*yield*/, db_1.db
                            .select({
                            contactNumber: schema_1.conversations.contactNumber,
                            contactName: schema_1.conversations.contactName,
                        })
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.connectionId, connectionId), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.contactNumber), (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " NOT LIKE '%@lid%'"], ["", " NOT LIKE '%@lid%'"])), schema_1.conversations.contactNumber), (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " NOT LIKE '%@g.us%'"], ["", " NOT LIKE '%@g.us%'" // Ignorar grupos
                        ])), schema_1.conversations.contactNumber)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.conversations.lastMessageTime))
                            .limit(CONFIG.MAX_CONTACTS_PER_SYNC)];
                case 2:
                    allConversations = _b.sent();
                    console.log("[SYNC] Encontradas ".concat(allConversations.length, " conversas (limite: ").concat(CONFIG.MAX_CONTACTS_PER_SYNC, ")"));
                    if (allConversations.length === 0) {
                        syncStatusMap.set(userId, __assign(__assign({}, status), { status: 'completed', progress: 100, totalContacts: 0, processedContacts: 0, lastSyncAt: new Date() }));
                        return [2 /*return*/];
                    }
                    uniqueContacts = new Map();
                    for (_i = 0, allConversations_1 = allConversations; _i < allConversations_1.length; _i++) {
                        conv = allConversations_1[_i];
                        if (!conv.contactNumber)
                            continue;
                        phone = conv.contactNumber
                            .replace('@s.whatsapp.net', '')
                            .replace('@c.us', '')
                            .trim();
                        if (!phone || phone.includes('@') || phone.length < 8)
                            continue;
                        if (!uniqueContacts.has(phone)) {
                            uniqueContacts.set(phone, conv.contactName || '');
                        }
                    }
                    contactsArray = Array.from(uniqueContacts.entries()).map(function (_a) {
                        var phone = _a[0], name = _a[1];
                        return ({ phone: phone, name: name });
                    });
                    console.log("[SYNC] ".concat(contactsArray.length, " contatos \u00FAnicos para processar"));
                    // Atualizar total
                    status.totalContacts = contactsArray.length;
                    syncStatusMap.set(userId, __assign({}, status));
                    i = 0;
                    _b.label = 3;
                case 3:
                    if (!(i < contactsArray.length)) return [3 /*break*/, 15];
                    batch = contactsArray.slice(i, i + CONFIG.BATCH_SIZE);
                    _a = 0, batch_1 = batch;
                    _b.label = 4;
                case 4:
                    if (!(_a < batch_1.length)) return [3 /*break*/, 12];
                    contact = batch_1[_a];
                    cacheKey = "".concat(connectionId, ":").concat(contact.phone);
                    cached = contactExistsCache.get(cacheKey);
                    // Se está no cache e existe, pula
                    if (cached && cached.exists && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
                        return [3 /*break*/, 11];
                    }
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 10, , 11]);
                    return [4 /*yield*/, db_1.db
                            .select({ id: schema_1.whatsappContacts.id })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId), (0, drizzle_orm_1.eq)(schema_1.whatsappContacts.phoneNumber, contact.phone)))
                            .limit(1)];
                case 6:
                    existing = _b.sent();
                    if (!(existing.length === 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, storage_1.storage.upsertContact({
                            connectionId: connectionId,
                            contactId: "".concat(contact.phone, "@s.whatsapp.net"),
                            phoneNumber: contact.phone,
                            name: contact.name || null,
                            imgUrl: null,
                            lid: null,
                        })];
                case 7:
                    _b.sent();
                    contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
                    return [3 /*break*/, 9];
                case 8:
                    // Já existe - cachear
                    contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
                    _b.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    err_1 = _b.sent();
                    // Ignora erros individuais, continua
                    console.error("[SYNC] Erro ao processar ".concat(contact.phone, ":"), err_1);
                    return [3 /*break*/, 11];
                case 11:
                    _a++;
                    return [3 /*break*/, 4];
                case 12:
                    // Atualizar progresso
                    status.processedContacts = Math.min(i + CONFIG.BATCH_SIZE, contactsArray.length);
                    status.progress = Math.round((status.processedContacts / contactsArray.length) * 100);
                    syncStatusMap.set(userId, __assign({}, status));
                    // Log a cada 20%
                    if (status.progress % 20 === 0) {
                        console.log("[SYNC] Progresso: ".concat(status.progress, "%"));
                    }
                    if (!(i + CONFIG.BATCH_SIZE < contactsArray.length)) return [3 /*break*/, 14];
                    return [4 /*yield*/, sleep(CONFIG.DELAY_BETWEEN_BATCHES)];
                case 13:
                    _b.sent();
                    _b.label = 14;
                case 14:
                    i += CONFIG.BATCH_SIZE;
                    return [3 /*break*/, 3];
                case 15:
                    // 3. Marcar como concluído
                    syncStatusMap.set(userId, __assign(__assign({}, status), { status: 'completed', progress: 100, processedContacts: contactsArray.length, lastSyncAt: new Date() }));
                    console.log("[SYNC] \u2705 Conclu\u00EDdo! ".concat(contactsArray.length, " contatos."));
                    return [3 /*break*/, 17];
                case 16:
                    error_2 = _b.sent();
                    console.error("[SYNC] \u274C Erro:", error_2);
                    syncStatusMap.set(userId, __assign(__assign({}, status), { status: 'error', error: error_2 instanceof Error ? error_2.message : 'Erro desconhecido' }));
                    return [3 /*break*/, 17];
                case 17: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca contatos sincronizados do banco de dados com paginação e busca
 * RÁPIDO: Direto do banco, sem processar nada
 *
 * FIX 2025: Agora busca TODOS os contatos e extrai número do contact_id
 * quando phone_number não está preenchido (ex: "553199999999@s.whatsapp.net")
 */
function getSyncedContactsFromDB(connectionId_1) {
    return __awaiter(this, arguments, void 0, function (connectionId, page, limit, search) {
        var effectiveLimit, offset, baseConditions, whereClause, searchTerm, cacheKey, total, cached, countResult, dbContacts, contacts, totalPages, error_3;
        var _a;
        if (page === void 0) { page = 1; }
        if (limit === void 0) { limit = 50; }
        if (search === void 0) { search = ""; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    effectiveLimit = Math.min(limit, 50);
                    offset = (page - 1) * effectiveLimit;
                    baseConditions = [
                        (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " = ", ""], ["", " = ", ""])), schema_1.whatsappContacts.connectionId, connectionId),
                        (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " NOT LIKE '%@g.us%'"], ["", " NOT LIKE '%@g.us%'"])), schema_1.whatsappContacts.contactId),
                        (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["(", " LIKE '%@s.whatsapp.net' OR ", " LIKE '%@c.us')"], ["(", " LIKE '%@s.whatsapp.net' OR ", " LIKE '%@c.us')"])), schema_1.whatsappContacts.contactId, schema_1.whatsappContacts.contactId),
                    ];
                    whereClause = drizzle_orm_1.and.apply(void 0, baseConditions);
                    if (search && search.trim()) {
                        searchTerm = "%".concat(search.trim(), "%");
                        whereClause = drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["(", " ILIKE ", " OR ", " LIKE ", ")"], ["(", " ILIKE ", " OR ", " LIKE ", ")"])), schema_1.whatsappContacts.name, searchTerm, schema_1.whatsappContacts.phoneNumber, searchTerm)], false));
                    }
                    cacheKey = "".concat(connectionId, ":").concat(search);
                    total = 0;
                    cached = countCache.get(cacheKey);
                    if (!(cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS)) return [3 /*break*/, 1];
                    total = cached.count;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, db_1.db
                        .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))) })
                        .from(schema_1.whatsappContacts)
                        .where(whereClause)];
                case 2:
                    countResult = _b.sent();
                    total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    // Salvar no cache
                    countCache.set(cacheKey, { count: total, timestamp: Date.now() });
                    _b.label = 3;
                case 3: return [4 /*yield*/, db_1.db
                        .select({
                        id: schema_1.whatsappContacts.id,
                        contactId: schema_1.whatsappContacts.contactId,
                        phoneNumber: schema_1.whatsappContacts.phoneNumber,
                        name: schema_1.whatsappContacts.name,
                        lastSyncedAt: schema_1.whatsappContacts.lastSyncedAt,
                    })
                        .from(schema_1.whatsappContacts)
                        .where(whereClause)
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.whatsappContacts.lastSyncedAt))
                        .limit(effectiveLimit)
                        .offset(offset)];
                case 4:
                    dbContacts = _b.sent();
                    contacts = dbContacts.map(function (c) {
                        // Tentar usar phoneNumber, se não tiver, extrair do contactId
                        var phone = c.phoneNumber || '';
                        if (!phone && c.contactId) {
                            // Extrair número do formato "553199999999@s.whatsapp.net" ou "553199999999@c.us"
                            var match = c.contactId.match(/^(\d+)@/);
                            if (match) {
                                phone = match[1];
                            }
                        }
                        // Pular contatos sem número válido
                        if (!phone || phone.length < 8) {
                            return null;
                        }
                        return {
                            id: c.id,
                            name: c.name || '',
                            phone: phone,
                            pushName: c.name || undefined,
                            hasResponded: true,
                            conversationCount: 1,
                            isGroup: false,
                            lastSeen: c.lastSyncedAt || undefined,
                        };
                    }).filter(Boolean);
                    totalPages = Math.ceil(total / effectiveLimit);
                    console.log("[SYNC] P\u00E1gina ".concat(page, "/").concat(totalPages, ": Retornando ").concat(contacts.length, " contatos ") +
                        "(search: \"".concat(search, "\", total: ").concat(total, ")"));
                    return [2 /*return*/, { contacts: contacts, total: total, page: page, totalPages: totalPages }];
                case 5:
                    error_3 = _b.sent();
                    console.error('[SYNC] Erro ao buscar contatos:', error_3);
                    return [2 /*return*/, { contacts: [], total: 0, page: 1, totalPages: 0 }];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Retorna a contagem de contatos sincronizados
 * Usa cache com TTL para não sobrecarregar o banco
 */
function getSyncedContactsCount(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var cacheKey, cached, countResult, total, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    cacheKey = "".concat(connectionId, ":");
                    cached = countCache.get(cacheKey);
                    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
                        return [2 /*return*/, { total: cached.count }];
                    }
                    return [4 /*yield*/, db_1.db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))) })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId), (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", " NOT LIKE '%@g.us%'"], ["", " NOT LIKE '%@g.us%'"])), schema_1.whatsappContacts.contactId), (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["(", " LIKE '%@s.whatsapp.net' OR ", " LIKE '%@c.us')"], ["(", " LIKE '%@s.whatsapp.net' OR ", " LIKE '%@c.us')"])), schema_1.whatsappContacts.contactId, schema_1.whatsappContacts.contactId)))];
                case 1:
                    countResult = _b.sent();
                    total = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    // Salvar no cache
                    countCache.set(cacheKey, { count: total, timestamp: Date.now() });
                    console.log("[SYNC] Contagem total para ".concat(connectionId, ": ").concat(total, " contatos"));
                    return [2 /*return*/, { total: total }];
                case 2:
                    error_4 = _b.sent();
                    console.error('[SYNC] Erro ao contar contatos:', error_4);
                    return [2 /*return*/, { total: 0 }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica se a sincronização inicial já foi feita
 */
function hasSyncedBefore(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select({ id: schema_1.whatsappContacts.id })
                            .from(schema_1.whatsappContacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.whatsappContacts.connectionId, connectionId))
                            .limit(1)];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, result.length > 0];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Helper
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
exports.default = {
    getSyncStatus: getSyncStatus,
    startBackgroundSync: startBackgroundSync,
    getSyncedContactsFromDB: getSyncedContactsFromDB,
    getSyncedContactsCount: getSyncedContactsCount,
    hasSyncedBefore: hasSyncedBefore,
};
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10;
