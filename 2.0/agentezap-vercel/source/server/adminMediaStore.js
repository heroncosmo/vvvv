"use strict";
/**
 * 📁 STORE DE MÍDIAS DO ADMIN AGENT
 * Gerencia as mídias disponíveis para o agente admin usar nas respostas
 * IMPORTANTE: As mídias agora são persistidas no banco de dados Supabase
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
exports.parseAdminMediaTags = exports.generateAdminMediaPromptBlock = exports.defaultTriggers = exports.getAdminMediaByName = void 0;
exports.getAdminMediaList = getAdminMediaList;
exports.getAdminMediasByPattern = getAdminMediasByPattern;
exports.addAdminMedia = addAdminMedia;
exports.updateAdminMedia = updateAdminMedia;
exports.deleteAdminMedia = deleteAdminMedia;
exports.hasAdminMedia = hasAdminMedia;
exports.getAdminMediaById = getAdminMediaById;
exports.getAdminMediaCount = getAdminMediaCount;
exports.forceReloadCache = forceReloadCache;
exports.getActiveTriggers = getActiveTriggers;
exports.getSmartTriggers = getSmartTriggers;
exports.setMockAdminMediaStore = setMockAdminMediaStore;
var storage_1 = require("./storage");
var mediaService_1 = require("./mediaService");
// Cache em memória para performance (recarregado do banco)
var adminMediaCache = new Map();
var lastCacheUpdate = new Map();
var CACHE_TTL = 60000; // 1 minuto
var BASE_MEDIA_SOURCE_EMAIL = "rodrigo4@gmail.com";
var baseAdminMediaCache = [];
var lastBaseMediaUpdate = 0;
function mapBaseMediaToAdminMedia(baseUserId, media) {
    var _a, _b;
    return {
        id: "base:".concat(media.id),
        adminId: baseUserId,
        name: media.name,
        mediaType: media.mediaType,
        storageUrl: media.storageUrl,
        fileName: media.fileName || undefined,
        fileSize: media.fileSize || undefined,
        mimeType: media.mimeType || undefined,
        durationSeconds: media.durationSeconds || undefined,
        description: media.description || "",
        whenToUse: media.whenToUse || undefined,
        caption: media.caption || undefined,
        transcription: media.transcription || undefined,
        isActive: media.isActive !== false,
        sendAlone: media.sendAlone === true,
        displayOrder: media.displayOrder || 0,
        createdAt: ((_b = (_a = media.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date().toISOString(),
    };
}
function getBaseAdminMedia() {
    return __awaiter(this, void 0, void 0, function () {
        var now, baseUser_1, baseMedia, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    if (lastBaseMediaUpdate > 0 && now - lastBaseMediaUpdate < CACHE_TTL) {
                        return [2 /*return*/, baseAdminMediaCache];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, storage_1.storage.getUserByEmail(BASE_MEDIA_SOURCE_EMAIL)];
                case 2:
                    baseUser_1 = _a.sent();
                    if (!(baseUser_1 === null || baseUser_1 === void 0 ? void 0 : baseUser_1.id)) {
                        baseAdminMediaCache = [];
                        lastBaseMediaUpdate = now;
                        return [2 /*return*/, baseAdminMediaCache];
                    }
                    return [4 /*yield*/, (0, mediaService_1.getAgentMediaLibrary)(baseUser_1.id)];
                case 3:
                    baseMedia = _a.sent();
                    baseAdminMediaCache = baseMedia
                        .filter(function (media) { return media.isActive !== false; })
                        .map(function (media) { return mapBaseMediaToAdminMedia(baseUser_1.id, media); });
                    lastBaseMediaUpdate = now;
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("📁 [AdminMediaStore] Erro ao carregar base de mídias do Rodrigo 4:", error_1);
                    baseAdminMediaCache = [];
                    lastBaseMediaUpdate = now;
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, baseAdminMediaCache];
            }
        });
    });
}
function mergeAdminMediaWithBase(primaryMedia, baseMedia) {
    var merged = new Map();
    for (var _i = 0, baseMedia_1 = baseMedia; _i < baseMedia_1.length; _i++) {
        var media = baseMedia_1[_i];
        var key = media.name.toUpperCase();
        if (!merged.has(key)) {
            merged.set(key, media);
        }
    }
    for (var _a = 0, primaryMedia_1 = primaryMedia; _a < primaryMedia_1.length; _a++) {
        var media = primaryMedia_1[_a];
        var key = media.name.toUpperCase();
        merged.set(key, media);
    }
    return Array.from(merged.values()).sort(function (a, b) {
        if (a.displayOrder !== b.displayOrder) {
            return b.displayOrder - a.displayOrder;
        }
        return a.name.localeCompare(b.name);
    });
}
/**
 * Recarrega o cache do banco de dados
 */
function reloadCache(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var now, cacheKey, lastUpdate, mediaList, _i, mediaList_1, media, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    now = Date.now();
                    cacheKey = adminId || 'default';
                    lastUpdate = lastCacheUpdate.get(cacheKey) || 0;
                    // Se cache ainda é válido, não recarregar
                    if (now - lastUpdate < CACHE_TTL && adminMediaCache.size > 0) {
                        return [2 /*return*/];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, storage_1.storage.getActiveAdminMedia()];
                case 2:
                    mediaList = _b.sent();
                    for (_i = 0, mediaList_1 = mediaList; _i < mediaList_1.length; _i++) {
                        media = mediaList_1[_i];
                        adminMediaCache.set(media.id, {
                            id: media.id,
                            adminId: media.adminId,
                            name: media.name,
                            mediaType: media.mediaType,
                            storageUrl: media.storageUrl,
                            fileName: media.fileName || undefined,
                            fileSize: media.fileSize || undefined,
                            mimeType: media.mimeType || undefined,
                            durationSeconds: media.durationSeconds || undefined,
                            description: media.description,
                            whenToUse: media.whenToUse || undefined,
                            caption: media.caption || undefined,
                            transcription: media.transcription || undefined,
                            isActive: media.isActive,
                            sendAlone: media.sendAlone,
                            displayOrder: media.displayOrder,
                            createdAt: ((_a = media.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                        });
                    }
                    lastCacheUpdate.set(cacheKey, now);
                    console.log("\uD83D\uDCC1 [AdminMediaStore] Cache recarregado: ".concat(mediaList.length, " m\u00EDdias"));
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _b.sent();
                    console.error("📁 [AdminMediaStore] Erro ao recarregar cache:", error_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém todas as mídias ativas do admin (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 */
function getAdminMediaList(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var directMedia, baseMedia;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, reloadCache(adminId)];
                case 1:
                    _a.sent();
                    directMedia = Array.from(adminMediaCache.values()).filter(function (m) { return m.isActive; });
                    return [4 /*yield*/, getBaseAdminMedia()];
                case 2:
                    baseMedia = _a.sent();
                    return [2 /*return*/, mergeAdminMediaWithBase(directMedia, baseMedia)];
            }
        });
    });
}
/**
 * Obtém uma mídia por nome (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 * @param name - Nome da mídia
 */
var getAdminMediaByName = function (adminId, name) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedName, values, _i, values_1, media;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    normalizedName = name.toUpperCase().replace(/\s+/g, '_');
                    return [4 /*yield*/, getAdminMediaList(adminId)];
                case 1:
                    values = _a.sent();
                    for (_i = 0, values_1 = values; _i < values_1.length; _i++) {
                        media = values_1[_i];
                        if (media.name.toUpperCase() === normalizedName && media.isActive) {
                            return [2 /*return*/, media];
                        }
                    }
                    return [2 /*return*/, undefined];
            }
        });
    });
};
exports.getAdminMediaByName = getAdminMediaByName;
/**
 * Obtém mídias que correspondem a um padrão de nome
 */
function getAdminMediasByPattern(adminId, pattern) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedPattern, results, values, _i, values_2, media;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, reloadCache(adminId)];
                case 1:
                    _a.sent();
                    normalizedPattern = pattern.toUpperCase().replace(/\s+/g, '_');
                    results = [];
                    values = Array.from(adminMediaCache.values());
                    for (_i = 0, values_2 = values; _i < values_2.length; _i++) {
                        media = values_2[_i];
                        if (media.adminId === adminId && media.isActive && media.name.toUpperCase().includes(normalizedPattern)) {
                            results.push(media);
                        }
                    }
                    return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Adiciona uma mídia ao store e banco de dados
 */
function addAdminMedia(media) {
    return __awaiter(this, void 0, void 0, function () {
        var saved, adminMedia;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, storage_1.storage.createAdminMedia(media)];
                case 1:
                    saved = _b.sent();
                    adminMedia = {
                        id: saved.id,
                        adminId: saved.adminId,
                        name: saved.name,
                        mediaType: saved.mediaType,
                        storageUrl: saved.storageUrl,
                        fileName: saved.fileName || undefined,
                        fileSize: saved.fileSize || undefined,
                        mimeType: saved.mimeType || undefined,
                        durationSeconds: saved.durationSeconds || undefined,
                        description: saved.description,
                        whenToUse: saved.whenToUse || undefined,
                        caption: saved.caption || undefined,
                        transcription: saved.transcription || undefined,
                        isActive: saved.isActive,
                        sendAlone: saved.sendAlone,
                        displayOrder: saved.displayOrder,
                        createdAt: ((_a = saved.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                    };
                    adminMediaCache.set(saved.id, adminMedia);
                    lastCacheUpdate.set(media.adminId, Date.now());
                    console.log("\uD83D\uDCC1 [AdminMediaStore] M\u00EDdia adicionada ao banco: ".concat(media.name, " (").concat(media.mediaType, ")"));
                    return [2 /*return*/, adminMedia];
            }
        });
    });
}
/**
 * Atualiza uma mídia existente no banco e cache
 */
function updateAdminMedia(id, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var saved, adminMedia;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, storage_1.storage.updateAdminMedia(id, updates)];
                case 1:
                    saved = _b.sent();
                    if (!saved)
                        return [2 /*return*/, null];
                    adminMedia = {
                        id: saved.id,
                        adminId: saved.adminId,
                        name: saved.name,
                        mediaType: saved.mediaType,
                        storageUrl: saved.storageUrl,
                        fileName: saved.fileName || undefined,
                        fileSize: saved.fileSize || undefined,
                        mimeType: saved.mimeType || undefined,
                        durationSeconds: saved.durationSeconds || undefined,
                        description: saved.description,
                        whenToUse: saved.whenToUse || undefined,
                        caption: saved.caption || undefined,
                        transcription: saved.transcription || undefined,
                        isActive: saved.isActive,
                        sendAlone: saved.sendAlone,
                        displayOrder: saved.displayOrder,
                        createdAt: ((_a = saved.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                    };
                    adminMediaCache.set(id, adminMedia);
                    if (saved.adminId) {
                        lastCacheUpdate.set(saved.adminId, Date.now());
                    }
                    return [2 /*return*/, adminMedia];
            }
        });
    });
}
/**
 * Remove uma mídia do store e banco de dados
 */
function deleteAdminMedia(id, adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.deleteAdminMedia(id)];
                case 1:
                    success = _a.sent();
                    if (success) {
                        adminMediaCache.delete(id);
                        lastCacheUpdate.set(adminId, Date.now());
                    }
                    return [2 /*return*/, success];
            }
        });
    });
}
/**
 * Verifica se mídia existe (busca em cache primeiro, depois banco)
 */
function hasAdminMedia(id, adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var media, adminMedia;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (adminMediaCache.has(id))
                        return [2 /*return*/, true];
                    return [4 /*yield*/, storage_1.storage.getAdminMediaById(id)];
                case 1:
                    media = _b.sent();
                    if (media) {
                        adminMedia = {
                            id: media.id,
                            adminId: media.adminId,
                            name: media.name,
                            mediaType: media.mediaType,
                            storageUrl: media.storageUrl,
                            fileName: media.fileName || undefined,
                            fileSize: media.fileSize || undefined,
                            mimeType: media.mimeType || undefined,
                            durationSeconds: media.durationSeconds || undefined,
                            description: media.description,
                            whenToUse: media.whenToUse || undefined,
                            caption: media.caption || undefined,
                            transcription: media.transcription || undefined,
                            isActive: media.isActive,
                            sendAlone: media.sendAlone,
                            displayOrder: media.displayOrder,
                            createdAt: ((_a = media.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                        };
                        adminMediaCache.set(id, adminMedia);
                        return [2 /*return*/, true];
                    }
                    return [2 /*return*/, false];
            }
        });
    });
}
/**
 * Obtém mídia por ID (busca em cache primeiro, depois banco)
 */
function getAdminMediaById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var media, adminMedia;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (adminMediaCache.has(id)) {
                        return [2 /*return*/, adminMediaCache.get(id)];
                    }
                    return [4 /*yield*/, storage_1.storage.getAdminMediaById(id)];
                case 1:
                    media = _b.sent();
                    if (!media)
                        return [2 /*return*/, undefined];
                    adminMedia = {
                        id: media.id,
                        adminId: media.adminId,
                        name: media.name,
                        mediaType: media.mediaType,
                        storageUrl: media.storageUrl,
                        fileName: media.fileName || undefined,
                        fileSize: media.fileSize || undefined,
                        mimeType: media.mimeType || undefined,
                        durationSeconds: media.durationSeconds || undefined,
                        description: media.description,
                        whenToUse: media.whenToUse || undefined,
                        caption: media.caption || undefined,
                        transcription: media.transcription || undefined,
                        isActive: media.isActive,
                        sendAlone: media.sendAlone,
                        displayOrder: media.displayOrder,
                        createdAt: ((_a = media.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                    };
                    adminMediaCache.set(id, adminMedia);
                    return [2 /*return*/, adminMedia];
            }
        });
    });
}
/**
 * Retorna o tamanho do store (conta mídias no cache)
 */
function getAdminMediaCount() {
    return adminMediaCache.size;
}
/**
 * Força recarga do cache para um admin específico
 */
function forceReloadCache(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    lastCacheUpdate.delete(adminId);
                    lastBaseMediaUpdate = 0;
                    return [4 /*yield*/, reloadCache(adminId)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Definição dos gatilhos padrão (Exportado para uso no fallback)
exports.defaultTriggers = [
    { keywords: ["como funciona", "funciona assim", "deixa eu explicar", "vou te explicar", "te explico", "vale a pena"], mediaName: "COMO_FUNCIONA" },
    { keywords: ["vídeo", "demonstra", "ver na prática", "te mostro"], mediaName: "VIDEO_DEMONSTRACAO" },
    { keywords: ["preço", "quanto custa", "valor", "investimento", "tabela"], mediaName: "TABELA_PRECOS" },
    { keywords: ["contrato", "termos", "documento"], mediaName: "PDF_CONTRATO" }
];
/**
 * Obtém os gatilhos ativos baseados nas mídias disponíveis
 */
function getActiveTriggers(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var mediaList, allMediaNames;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAdminMediaList(adminId)];
                case 1:
                    mediaList = _a.sent();
                    allMediaNames = mediaList.map(function (m) { return m.name; });
                    return [2 /*return*/, exports.defaultTriggers.filter(function (t) { return allMediaNames.includes(t.mediaName); })];
            }
        });
    });
}
/**
 * Gera gatilhos inteligentes baseados no campo "whenToUse" das mídias
 * Isso permite que mídias personalizadas (como VALE_A_PENA) funcionem automaticamente
 */
function getSmartTriggers(adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var mediaList, triggers, _loop_1, _i, mediaList_2, media, activeDefaultTriggers, _loop_2, _a, activeDefaultTriggers_1, dt;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getAdminMediaList(adminId)];
                case 1:
                    mediaList = _b.sent();
                    triggers = [];
                    _loop_1 = function (media) {
                        if (media.whenToUse && media.whenToUse.length > 3) {
                            // Palavras comuns de início de frase de instrução que devem ser removidas DO INÍCIO
                            var instructionStartWords = [
                                'quando', 'se', 'caso', 'ao', 'para', 'em', 'nos', 'nas', 'no', 'na',
                                'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
                                'cliente', 'usuario', 'pessoa', 'lead',
                                'perguntar', 'falar', 'disser', 'solicitar', 'questionar', 'pedir', 'quiser',
                                'sobre', 'que', 'como', 'informar', 'ver', 'saber', 'onde'
                            ];
                            // Separar por vírgulas, pontos ou ponto e vírgula para pegar frases isoladas
                            // Ex: "Quando pedir X, Y ou Z" -> ["Quando pedir X", " Y ou Z"] - não é perfeito, melhor separar por "," explícita
                            var rawPhrases = media.whenToUse.toLowerCase().split(/[,;.]+/);
                            for (var _c = 0, rawPhrases_1 = rawPhrases; _c < rawPhrases_1.length; _c++) {
                                var rawPhrase = rawPhrases_1[_c];
                                // Limpeza básica inicial
                                var cleanPhrase = rawPhrase.trim();
                                if (cleanPhrase.length < 2)
                                    continue;
                                // Remover palavras de instrução do INÍCIO da frase repetidamente
                                // Ex: "quando o cliente perguntar sobre envio" -> "envio"
                                var changed_1 = true;
                                while (changed_1 && cleanPhrase.length > 0) {
                                    changed_1 = false;
                                    var firstWord = cleanPhrase.split(' ')[0];
                                    if (instructionStartWords.includes(firstWord)) {
                                        cleanPhrase = cleanPhrase.substring(firstWord.length).trim();
                                        changed_1 = true;
                                    }
                                }
                                // Limpar pontuação restante, mas manter estrutura interna
                                cleanPhrase = cleanPhrase.replace(/[^\w\sà-úÀ-Ú\-]/g, "").trim();
                                // Se sobrou uma frase válida
                                if (cleanPhrase.length > 2) {
                                    var existing = triggers.find(function (t) { return t.mediaName === media.name; });
                                    if (existing) {
                                        if (!existing.keywords.includes(cleanPhrase)) {
                                            existing.keywords.push(cleanPhrase);
                                        }
                                    }
                                    else {
                                        triggers.push({
                                            keywords: [cleanPhrase],
                                            mediaName: media.name
                                        });
                                    }
                                }
                            }
                            // Adicionar também o texto completo original (limpo de preposições iniciais) como fallback
                            var fullText = media.whenToUse.toLowerCase().trim();
                            var changed = true;
                            while (changed && fullText.length > 0) {
                                changed = false;
                                var firstWord = fullText.split(' ')[0];
                                if (instructionStartWords.includes(firstWord)) {
                                    fullText = fullText.substring(firstWord.length).trim();
                                    changed = true;
                                }
                            }
                            if (fullText.length > 5) {
                                var existing = triggers.find(function (t) { return t.mediaName === media.name; });
                                if (existing && !existing.keywords.includes(fullText)) {
                                    existing.keywords.push(fullText);
                                }
                            }
                        }
                    };
                    // 1. Gerar gatilhos dinâmicos do "whenToUse" (MAIOR PRIORIDADE - ESPECÍFICOS)
                    for (_i = 0, mediaList_2 = mediaList; _i < mediaList_2.length; _i++) {
                        media = mediaList_2[_i];
                        _loop_1(media);
                    }
                    // DEBUG TRIGGERS
                    console.log('🔍 [AdminMediaStore] DYNAMIC TRIGGERS GENERATED:', triggers.map(function (t) { return "".concat(t.mediaName, ": [").concat(t.keywords.join(', '), "]"); }).join(' | '));
                    return [4 /*yield*/, getActiveTriggers(adminId)];
                case 2:
                    activeDefaultTriggers = _b.sent();
                    _loop_2 = function (dt) {
                        var _d;
                        var existing = triggers.find(function (t) { return t.mediaName === dt.mediaName; });
                        if (existing) {
                            (_d = existing.keywords).push.apply(_d, dt.keywords);
                        }
                        else {
                            triggers.push(dt);
                        }
                    };
                    for (_a = 0, activeDefaultTriggers_1 = activeDefaultTriggers; _a < activeDefaultTriggers_1.length; _a++) {
                        dt = activeDefaultTriggers_1[_a];
                        _loop_2(dt);
                    }
                    return [2 /*return*/, triggers];
            }
        });
    });
}
/**
 * Gera o bloco de prompt para as mídias do admin
 * COPIADO DO mediaService.ts QUE FUNCIONA CORRETAMENTE
 */
var generateAdminMediaPromptBlock = function (adminId) {
    return __awaiter(this, void 0, void 0, function () {
        var mediaList, activeTriggers, mediaBlock, _i, activeTriggers_1, trigger, _a, mediaList_3, media, tipo;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getAdminMediaList(adminId)];
                case 1:
                    mediaList = _b.sent();
                    if (mediaList.length === 0) {
                        return [2 /*return*/, ''];
                    }
                    return [4 /*yield*/, getSmartTriggers(adminId)];
                case 2:
                    activeTriggers = _b.sent();
                    mediaBlock = "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83D\uDCC1 M\u00CDDIAS DISPON\u00CDVEIS E REGRAS DE ENVIO\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
                    if (activeTriggers.length > 0) {
                        mediaBlock += "\n\uD83D\uDEA8 GATILHOS OBRIGAT\u00D3RIOS (Se falar isso, TEM que enviar a m\u00EDdia):\n";
                        for (_i = 0, activeTriggers_1 = activeTriggers; _i < activeTriggers_1.length; _i++) {
                            trigger = activeTriggers_1[_i];
                            mediaBlock += "\u2022 Se falar \"".concat(trigger.keywords[0], "\" ou similar \u2192 Use [ENVIAR_MIDIA:").concat(trigger.mediaName, "]\n");
                        }
                    }
                    mediaBlock += "\n\uD83D\uDCCB LISTA COMPLETA DE M\u00CDDIAS (Use quando o contexto pedir):\n";
                    for (_a = 0, mediaList_3 = mediaList; _a < mediaList_3.length; _a++) {
                        media = mediaList_3[_a];
                        tipo = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
                            media.mediaType === 'video' ? '🎥 VÍDEO' :
                                media.mediaType === 'image' ? '🖼️ IMAGEM' : '📄 DOC';
                        mediaBlock += "\n".concat(tipo, ": ").concat(media.name, "\n   \uD83D\uDCDD Descri\u00E7\u00E3o: ").concat(media.description || 'Sem descrição', "\n   \uD83C\uDFAF Quando usar: ").concat(media.whenToUse || 'Quando relevante', "\n   \uD83D\uDC49 Tag para enviar: [ENVIAR_MIDIA:").concat(media.name, "]\n");
                    }
                    mediaBlock += "\n\u26A0\uFE0F REGRAS DE ENVIO DE M\u00CDDIA (SIGA RIGOROSAMENTE):\n1. LEIA o campo \"Quando usar\" de CADA m\u00EDdia ANTES de decidir enviar.\n2. S\u00D3 envie a m\u00EDdia se a mensagem do cliente bater EXATAMENTE com a situa\u00E7\u00E3o descrita em \"Quando usar\".\n3. Se \"Quando usar\" diz \"N\u00C3O ENVIAR\" em determinada situa\u00E7\u00E3o, OBEDE\u00C7A e n\u00E3o envie.\n4. NUNCA envie m\u00EDdia \"do nada\" ou por conta pr\u00F3pria. S\u00F3 envie se o cliente falou algo que ativa o gatilho.\n5. M\u00E1ximo 1 m\u00EDdia por resposta. N\u00E3o envie 2 ou mais m\u00EDdias de uma vez.\n6. Se j\u00E1 enviou aquela m\u00EDdia antes nesta conversa, N\u00C3O envie de novo.\n7. Na d\u00FAvida, N\u00C3O envie. \u00C9 melhor n\u00E3o enviar do que enviar fora de contexto.\n";
                    return [2 /*return*/, mediaBlock];
            }
        });
    });
};
exports.generateAdminMediaPromptBlock = generateAdminMediaPromptBlock;
/**
 * Parseia a resposta e extrai tags de mídia
 */
var parseAdminMediaTags = function (responseText) {
    var normalizeAdminMediaName = function (value) {
        return value.trim().replace(/\s+/g, "_").toUpperCase();
    };
    var mediaTagRegex = /\[ENVIAR_MIDIA:\s*([^\]\r\n]+?)\s*\]/giu;
    var mediaTagCleanupRegex = /\[ENVIAR_MIDIA:\s*([^\]\r\n]+?)\s*\]/giu;
    var mediaActions = [];
    var match;
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
        var mediaName = normalizeAdminMediaName(match[1]);
        if (!mediaName)
            continue;
        mediaActions.push({
            type: 'send_media',
            media_name: mediaName,
        });
        console.log("\uD83D\uDCC1 [AdminMediaStore] Tag de m\u00EDdia detectada: ".concat(mediaName));
    }
    // Remover as tags do texto final (usando a mesma regex permissiva)
    var cleanText = responseText.replace(mediaTagCleanupRegex, '').trim();
    return { cleanText: cleanText, mediaActions: mediaActions };
};
exports.parseAdminMediaTags = parseAdminMediaTags;
function setMockAdminMediaStore(mocks) {
    if (mocks.generateAdminMediaPromptBlock)
        exports.generateAdminMediaPromptBlock = mocks.generateAdminMediaPromptBlock;
    if (mocks.getAdminMediaByName)
        exports.getAdminMediaByName = mocks.getAdminMediaByName;
    if (mocks.parseAdminMediaTags)
        exports.parseAdminMediaTags = mocks.parseAdminMediaTags;
}
