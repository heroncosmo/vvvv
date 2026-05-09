"use strict";
/**
 * Agent Media Service
 *
 * Gerencia biblioteca de mídias dos agentes e envio via WhatsApp (w-api ou Baileys).
 * O Mistral decide qual mídia enviar baseado nas descrições no prompt.
 *
 * ⚠️ IMPORTANTE: Todos os envios passam pelo sistema anti-ban centralizado!
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
exports.getAgentMediaLibrary = getAgentMediaLibrary;
exports.normalizeMediaName = normalizeMediaName;
exports.foldMediaName = foldMediaName;
exports.getMediaByName = getMediaByName;
exports.insertAgentMedia = insertAgentMedia;
exports.updateAgentMedia = updateAgentMedia;
exports.deleteAgentMedia = deleteAgentMedia;
exports.upsertAgentMedia = upsertAgentMedia;
exports.generateMediaPromptBlock = generateMediaPromptBlock;
exports.parseMistralResponse = parseMistralResponse;
exports.forceMediaDetection = forceMediaDetection;
exports.forceMediaDetectionSync = forceMediaDetectionSync;
exports.sendMediaViaWApi = sendMediaViaWApi;
exports.downloadMediaAsBuffer = downloadMediaAsBuffer;
exports.sendMediaViaBaileys = sendMediaViaBaileys;
exports.validateAudioBuffer = validateAudioBuffer;
exports.generateTestWavBuffer = generateTestWavBuffer;
exports.transcribeAudio = transcribeAudio;
exports.executeMediaActions = executeMediaActions;
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var mistralClient_1 = require("./mistralClient");
var whatsapp_1 = require("./whatsapp");
var storage_1 = require("./storage");
var messageQueueService_1 = require("./messageQueueService");
// =============================================================================
// MEDIA LIBRARY CRUD
// =============================================================================
/**
 * Busca todas as mídias ativas de um usuário
 */
function getAgentMediaLibrary(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var media, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId), (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.isActive, true)))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.agentMediaLibrary.displayOrder))];
                case 1:
                    media = _a.sent();
                    return [2 /*return*/, media];
                case 2:
                    error_1 = _a.sent();
                    console.error("[MediaService] Error fetching media library for user ".concat(userId, ":"), error_1);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function normalizeMediaName(value) {
    return (value !== null && value !== void 0 ? value : "")
        .trim()
        .replace(/\s+/g, "_")
        .toUpperCase();
}
function foldMediaName(value) {
    return normalizeMediaName(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
/**
 * Gera um nome único para mídia adicionando sufixo _2, _3, etc se necessário
 */
function generateUniqueMediaName(userId, baseName) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedBaseName, existing, allMedia, pattern, similarNames, maxSuffix, _i, similarNames_1, name_1, match, num;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    normalizedBaseName = normalizeMediaName(baseName);
                    return [4 /*yield*/, getMediaByName(userId, normalizedBaseName)];
                case 1:
                    existing = _a.sent();
                    if (!existing) {
                        return [2 /*return*/, normalizedBaseName];
                    }
                    return [4 /*yield*/, db_1.db
                            .select({ name: schema_1.agentMediaLibrary.name })
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId))];
                case 2:
                    allMedia = _a.sent();
                    pattern = new RegExp("^".concat(normalizedBaseName, "(_\\d+)?$"));
                    similarNames = allMedia
                        .map(function (m) { return m.name; })
                        .filter(function (name) { return pattern.test(name); });
                    maxSuffix = 1;
                    for (_i = 0, similarNames_1 = similarNames; _i < similarNames_1.length; _i++) {
                        name_1 = similarNames_1[_i];
                        match = name_1.match(/_(\d+)$/);
                        if (match) {
                            num = parseInt(match[1], 10);
                            if (num > maxSuffix)
                                maxSuffix = num;
                        }
                    }
                    // Retorna próximo número disponível
                    return [2 /*return*/, "".concat(normalizedBaseName, "_").concat(maxSuffix + 1)];
            }
        });
    });
}
/**
 * Busca uma mídia pelo nome
 */
function getMediaByName(userId, name) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedName, media, foldedTargetName_1, mediaLibrary, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    normalizedName = normalizeMediaName(name);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId), (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.name, normalizedName)))
                            .limit(1)];
                case 1:
                    media = (_a.sent())[0];
                    if (media) {
                        return [2 /*return*/, media];
                    }
                    foldedTargetName_1 = foldMediaName(normalizedName);
                    return [4 /*yield*/, getAgentMediaLibrary(userId)];
                case 2:
                    mediaLibrary = _a.sent();
                    return [2 /*return*/, mediaLibrary.find(function (item) { return foldMediaName(item.name) === foldedTargetName_1; }) || null];
                case 3:
                    error_2 = _a.sent();
                    console.error("[MediaService] Error fetching media ".concat(name, " for user ").concat(userId, ":"), error_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Cria ou atualiza uma mídia na biblioteca
 */
/**
 * Cria uma nova mídia (sempre insere, nunca atualiza)
 * Se o nome já existir, adiciona sufixo _2, _3, etc automaticamente
 */
function insertAgentMedia(data) {
    return __awaiter(this, void 0, void 0, function () {
        var uniqueName, normalizedData, inserted, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, generateUniqueMediaName(data.userId, data.name)];
                case 1:
                    uniqueName = _a.sent();
                    normalizedData = __assign(__assign({}, data), { name: uniqueName });
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.agentMediaLibrary)
                            .values(normalizedData)
                            .returning()];
                case 2:
                    inserted = (_a.sent())[0];
                    console.log("[MediaService] Created media ".concat(uniqueName, " for user ").concat(data.userId));
                    return [2 /*return*/, inserted];
                case 3:
                    error_3 = _a.sent();
                    console.error("[MediaService] Error inserting media:", error_3);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Atualiza uma mídia existente
 * Se mudar o nome e já existir, retorna erro
 */
function updateAgentMedia(mediaId, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedName, existing, updated, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    if (!data.name) return [3 /*break*/, 2];
                    normalizedName = normalizeMediaName(data.name);
                    return [4 /*yield*/, getMediaByName(userId, normalizedName)];
                case 1:
                    existing = _a.sent();
                    if (existing && existing.id !== mediaId) {
                        console.error("[MediaService] Name conflict: ".concat(normalizedName, " already exists"));
                        throw new Error("Nome ".concat(normalizedName, " j\u00E1 existe em outra m\u00EDdia"));
                    }
                    data.name = normalizedName;
                    _a.label = 2;
                case 2: return [4 /*yield*/, db_1.db
                        .update(schema_1.agentMediaLibrary)
                        .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.id, mediaId), (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId)))
                        .returning()];
                case 3:
                    updated = (_a.sent())[0];
                    if (!updated) {
                        console.error("[MediaService] Media ".concat(mediaId, " not found for user ").concat(userId));
                        return [2 /*return*/, null];
                    }
                    console.log("[MediaService] Updated media ".concat(updated.name, " for user ").concat(userId));
                    return [2 /*return*/, updated];
                case 4:
                    error_4 = _a.sent();
                    console.error("[MediaService] Error updating media:", error_4);
                    throw error_4; // Re-throw para capturar no route
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Remove uma mídia da biblioteca
 */
function deleteAgentMedia(userId, mediaId) {
    return __awaiter(this, void 0, void 0, function () {
        var error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .delete(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.id, mediaId), (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId)))];
                case 1:
                    _a.sent();
                    console.log("[MediaService] Deleted media ".concat(mediaId, " for user ").concat(userId));
                    return [2 /*return*/, true];
                case 2:
                    error_5 = _a.sent();
                    console.error("[MediaService] Error deleting media:", error_5);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * @deprecated Use insertAgentMedia para criar ou updateAgentMedia para atualizar
 * Mantido apenas para compatibilidade com testes antigos
 */
function upsertAgentMedia(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            console.warn('[MediaService] upsertAgentMedia is deprecated. Use insertAgentMedia or updateAgentMedia instead.');
            return [2 /*return*/, insertAgentMedia(data)];
        });
    });
}
// =============================================================================
// PROMPT GENERATION FOR MISTRAL
// =============================================================================
/**
 * Gera o bloco de mídias para incluir no prompt do Mistral
 *
 * NOVA ABORDAGEM: O sistema de mídias funciona INDEPENDENTE do prompt do cliente
 *
 * O cliente configura apenas:
 * - Tom de voz, estilo, informações do negócio
 *
 * As mídias são enviadas AUTOMATICAMENTE baseadas no campo "when_to_use"
 * O cliente NÃO precisa colocar instruções de mídia no prompt
 *
 * Este bloco é adicionado AUTOMATICAMENTE pelo sistema e a IA deve seguir
 */
function generateMediaPromptBlock(mediaList) {
    if (!mediaList || mediaList.length === 0) {
        return '';
    }
    // Filtrar apenas mídias ativas
    var activeMedias = mediaList.filter(function (m) { return m.isActive !== false; });
    if (activeMedias.length === 0) {
        return '';
    }
    var mediaBlock = "\n\n=== SISTEMA DE MIDIAS DISPONIVEIS ===\n\nVoce tem arquivos para enviar ao cliente SOMENTE quando ele pedir ou quando o contexto\nda conversa corresponder EXATAMENTE ao campo \"QUANDO ENVIAR\" abaixo.\nNAO envie midias por conta propria. SOMENTE envie quando o cliente PEDIR EXPLICITAMENTE\nou quando a conversa for DIRETAMENTE sobre o tema descrito em \"QUANDO ENVIAR\".\n\nARQUIVOS DISPONIVEIS:\n";
    // Lista cada mídia com gatilhos explícitos extraídos do whenToUse
    for (var i = 0; i < activeMedias.length; i++) {
        var media = activeMedias[i];
        var whenToUse = media.whenToUse || 'quando solicitado';
        var mediaType = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
            media.mediaType === 'video' ? '🎥 VÍDEO' :
                media.mediaType === 'image' ? '🖼️ IMAGEM' :
                    media.mediaType === 'flow' ? '🔀 FLUXO' : '📄 DOCUMENTO/PDF';
        // Para fluxos, mostrar resumo dos itens
        var flowSummary = media.mediaType === 'flow' && media.flowItems && Array.isArray(media.flowItems) && media.flowItems.length > 0
            ? "(".concat(media.flowItems.length, " itens: ").concat(media.flowItems.map(function (it) { return it.type === 'text' ? '💬texto' : "\uD83D\uDCCE".concat(it.mediaType || 'mídia'); }).join('→'), ")")
            : '';
        // Extrair palavras-chave do whenToUse para criar gatilhos explícitos
        var keywordsRaw = whenToUse.toLowerCase()
            .replace(/enviar apenas quando:|não enviar:|quando:/gi, '')
            .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
            .split(/[,\s]+/)
            .filter(function (k) { return k.length > 3; });
        var keywords = __spreadArray([], new Set(keywordsRaw), true).slice(0, 8);
        mediaBlock += "\n- ".concat(mediaType, ": ").concat(media.name).concat(flowSummary ? ' ' + flowSummary : '', "\n  QUANDO ENVIAR: ").concat(whenToUse, "\n  TAG: [MEDIA:").concat(media.name, "]\n");
    }
    mediaBlock += "\n=== REGRAS DE ENVIO DE MIDIA ===\n\n1. SO envie midia quando o cliente PEDIR EXPLICITAMENTE ou a conversa for DIRETAMENTE sobre o tema.\n2. Para enviar, inclua a tag [MEDIA:NOME] na resposta. Sem a tag, nada e enviado.\n3. Max 1 midia por resposta. Nao repita midias ja enviadas.\n4. NAO envie midia em saudacoes genericas a menos que o \"QUANDO ENVIAR\" diga especificamente para fazer isso.\n5. Se voce mencionou que vai enviar, OBRIGATORIO colocar a tag.\n\nFormato: [MEDIA:NOME_DA_MIDIA]\nExemplo: \"Aqui esta o que voce pediu! [MEDIA:VIDEO_DEMO]\"\n";
    return mediaBlock;
}
// =============================================================================
// RESPONSE PARSING
// =============================================================================
/**
 * Parseia a resposta do Mistral e extrai ações de mídia
 *
 * SUPORTA MÚLTIPLOS FORMATOS DE TAG:
 * - [MEDIA:NOME] - formato simplificado
 * - [ENVIAR_MIDIA:NOME] - formato legacy/antigo
 * - [MIDIA:NOME] - formato alternativo
 *
 * A IA pode usar qualquer um destes formatos e o sistema detectará corretamente.
 */
function parseMistralResponse(responseText) {
    try {
        // 🔥 REGEX UNIFICADO: Aceita TODOS os formatos de tag de mídia
        // [MEDIA:NOME], [ENVIAR_MIDIA:NOME], [MIDIA:NOME]
        var mediaTagRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):\s*([^\]\r\n]+?)\s*\]/giu;
        var mediaTagCleanupRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):\s*([^\]\r\n]+?)\s*\]/giu;
        var actions = [];
        var match = void 0;
        var detectedNames = new Set(); // Evitar duplicatas
        while ((match = mediaTagRegex.exec(responseText)) !== null) {
            var tagType = match[1].toUpperCase(); // MEDIA, ENVIAR_MIDIA ou MIDIA
            var mediaName = normalizeMediaName(match[2]);
            if (!mediaName)
                continue;
            // Evitar adicionar a mesma mídia duas vezes
            if (!detectedNames.has(mediaName)) {
                detectedNames.add(mediaName);
                actions.push({
                    type: 'send_media',
                    media_name: mediaName,
                });
                console.log("\uD83D\uDCC1 [MediaService] Tag de m\u00EDdia detectada [".concat(tagType, "]: ").concat(mediaName));
            }
        }
        // 🧹 Remover TODAS as variantes de tags do texto final
        var cleanText = responseText
            .replace(mediaTagCleanupRegex, '')
            .replace(/\s{2,}/g, ' ') // Remover espaços duplicados
            .trim();
        if (actions.length > 0) {
            console.log("\uD83D\uDCC1 [MediaService] Total de ".concat(actions.length, " m\u00EDdia(s) para enviar: ").concat(actions.map(function (a) { return a.media_name; }).join(', ')));
        }
        return {
            messages: [{ type: "text", content: cleanText }],
            actions: actions,
        };
    }
    catch (error) {
        console.error("[MediaService] Error parsing Mistral response:", error);
        return {
            messages: [{ type: "text", content: responseText }],
            actions: [],
        };
    }
}
// =============================================================================
// 🚨 FORÇAR ENVIO DE MÍDIA - SISTEMA AUTOMÁTICO COM IA
// =============================================================================
// Este sistema usa uma CHAMADA DE IA DEDICADA para decidir qual mídia enviar.
// Funciona para QUALQUER conta, independente de keywords hardcoded!
// A IA analisa: mensagem, histórico, biblioteca de mídia e campo whenToUse.
// =============================================================================
var llm_1 = require("./llm");
/**
 * 🚨 FORÇA o envio de mídia baseado em classificação da IA
 *
 * NOVA VERSÃO: Usa uma chamada de IA dedicada para decidir qual mídia enviar.
 *
 * Esta função:
 * 1. Recebe a mensagem do cliente e histórico
 * 2. Chama a IA com a biblioteca de mídias e descrições whenToUse
 * 3. A IA decide de forma INTELIGENTE se deve enviar mídia e qual
 *
 * VANTAGENS:
 * - Funciona para QUALQUER conta com QUALQUER biblioteca de mídia
 * - Entende semântica, não apenas keywords
 * - Não envia mídia aleatoriamente
 * - Respeita o contexto da conversa
 */
function forceMediaDetection(clientMessage_1, conversationHistory_1, mediaLibrary_1) {
    return __awaiter(this, arguments, void 0, function (clientMessage, conversationHistory, mediaLibrary, sentMedias, aiResponseText) {
        var availableMedias, aiResult_1, mediaToSend, aiConfidentlyDecidedNoMedia, fallbackResult, error_6, fallbackResult;
        if (sentMedias === void 0) { sentMedias = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] Iniciando classifica\u00E7\u00E3o com IA...");
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] Mensagem: \"".concat(clientMessage.substring(0, 100), "...\""));
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] M\u00EDdias dispon\u00EDveis: ".concat(mediaLibrary.length));
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] M\u00EDdias j\u00E1 enviadas: ".concat(sentMedias.join(', ') || 'nenhuma'));
                    if (aiResponseText) {
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83C\uDFAF IA principal disse: \"".concat(aiResponseText.substring(0, 150), "...\""));
                    }
                    if (!mediaLibrary || mediaLibrary.length === 0) {
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u274C Nenhuma m\u00EDdia dispon\u00EDvel");
                        return [2 /*return*/, { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhuma mídia disponível' }];
                    }
                    availableMedias = mediaLibrary.filter(function (m) {
                        var alreadySent = sentMedias.some(function (sent) { return sent.toUpperCase() === m.name.toUpperCase(); });
                        return !alreadySent && m.isActive !== false;
                    });
                    if (availableMedias.length === 0) {
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u274C Todas as m\u00EDdias j\u00E1 foram enviadas");
                        return [2 /*return*/, { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Todas as mídias já foram enviadas' }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.classifyMediaWithLLM)({
                            clientMessage: clientMessage,
                            conversationHistory: conversationHistory,
                            mediaLibrary: availableMedias.map(function (m) { return ({
                                name: m.name,
                                type: m.type,
                                whenToUse: m.whenToUse,
                                isActive: m.isActive
                            }); }),
                            sentMedias: sentMedias,
                            aiResponseText: aiResponseText
                        })];
                case 2:
                    aiResult_1 = _a.sent();
                    if (aiResult_1.shouldSend && aiResult_1.mediaName) {
                        mediaToSend = availableMedias.find(function (m) {
                            return m.name.toUpperCase() === aiResult_1.mediaName.toUpperCase();
                        });
                        if (mediaToSend) {
                            console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                            console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83C\uDFC6 IA DECIDIU ENVIAR: ".concat(mediaToSend.name));
                            console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDCCA Confian\u00E7a: ".concat(aiResult_1.confidence, "%"));
                            console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDCA1 Raz\u00E3o: ".concat(aiResult_1.reason));
                            console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                            return [2 /*return*/, {
                                    shouldSendMedia: true,
                                    mediaToSend: mediaToSend,
                                    matchedKeywords: ['IA_DECISION'],
                                    reason: aiResult_1.reason
                                }];
                        }
                    }
                    aiConfidentlyDecidedNoMedia = !aiResult_1.shouldSend &&
                        aiResult_1.confidence >= 60 &&
                        aiResult_1.reason &&
                        !aiResult_1.reason.includes('JSON') &&
                        !aiResult_1.reason.includes('Erro');
                    if (aiConfidentlyDecidedNoMedia) {
                        // IA decidiu explicitamente não enviar - respeitar a decisão
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u274C IA decidiu N\u00C3O enviar m\u00EDdia");
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDCA1 Raz\u00E3o: ".concat(aiResult_1.reason));
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult_1.reason }];
                    }
                    // Fallback: IA não conseguiu decidir (JSON inválido, erro, baixa confiança)
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \u26A0\uFE0F IA n\u00E3o decidiu - tentando FALLBACK por keywords...");
                    fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
                    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDD04 FALLBACK FUNCIONOU: ".concat(fallbackResult.mediaToSend.name));
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDD11 Keywords: ".concat(fallbackResult.matchedKeywords.join(', ')));
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, fallbackResult];
                    }
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \u274C Sem m\u00EDdia para enviar");
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDCA1 Raz\u00E3o: ".concat(aiResult_1.reason || 'Nenhum match'));
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/, { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult_1.reason }];
                case 3:
                    error_6 = _a.sent();
                    console.error("\uD83D\uDEA8 [FORCE MEDIA] \u274C ERRO na classifica\u00E7\u00E3o IA: ".concat(error_6.message));
                    // 🔧 FIX: FALLBACK por keywords quando IA falha completamente
                    console.log("\uD83D\uDEA8 [FORCE MEDIA] \uD83D\uDD04 Tentando FALLBACK por keywords ap\u00F3s erro...");
                    fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
                    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
                        console.log("\uD83D\uDEA8 [FORCE MEDIA] \u2705 FALLBACK SALVOU: ".concat(fallbackResult.mediaToSend.name));
                        return [2 /*return*/, fallbackResult];
                    }
                    return [2 /*return*/, { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: "Erro: ".concat(error_6.message) }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 🔧 FALLBACK: Sistema de detecção por keywords
 * Usado quando a IA não consegue classificar ou falha
 * Analisa o campo whenToUse de cada mídia e busca keywords na mensagem
 */
function keywordBasedMediaFallback(clientMessage, conversationHistory, mediaLibrary) {
    var msgLower = clientMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Detectar primeira mensagem (saudação)
    var clientMsgCount = conversationHistory.filter(function (m) { return !m.fromMe; }).length;
    var isFirstMessage = clientMsgCount <= 1;
    var isSaudacao = /^(oi|ola|olá|bom dia|boa tarde|boa noite|eai|e ai|hey|hello|hi)[\s!?.,]*$/i.test(clientMessage.trim());
    var mediaScores = [];
    for (var _i = 0, mediaLibrary_1 = mediaLibrary; _i < mediaLibrary_1.length; _i++) {
        var media = mediaLibrary_1[_i];
        var score = 0;
        var matchedKeywords = [];
        var reason = '';
        // Extrair keywords do nome da mídia
        var mediaNameWords = media.name.toLowerCase().replace(/_/g, ' ').split(/\s+/);
        // Extrair keywords do whenToUse
        var whenToUse = (media.whenToUse || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Verificar se é mídia de primeira mensagem/saudação
        var mediaNameLower = media.name.toLowerCase();
        var isWelcomeMedia = /primeira|inicio|comeco|oi|ola|saudacao|boas.?vindas|bem.?vindo|mensagem.?inicio|cliente.?vem.?conversar|welcome|greeting/.test(whenToUse) ||
            /inicio|welcome|greeting|saudacao|primeira|mensagem.*inicio|cliente.*vem.*conversar/.test(mediaNameLower);
        if ((isFirstMessage || isSaudacao) && isWelcomeMedia) {
            score += 100; // 🔧 FIX: Score mais alto para garantir que primeira mensagem tenha prioridade
            matchedKeywords.push('PRIMEIRA_MENSAGEM');
            reason = 'Primeira mensagem do cliente - mídia de boas-vindas';
        }
        // Verificar keywords do nome da mídia na mensagem
        for (var _a = 0, mediaNameWords_1 = mediaNameWords; _a < mediaNameWords_1.length; _a++) {
            var word = mediaNameWords_1[_a];
            if (word.length > 3 && msgLower.includes(word)) {
                score += 15;
                matchedKeywords.push(word);
            }
        }
        // Verificar keywords do whenToUse na mensagem
        var whenToUseWords = whenToUse
            .replace(/enviar apenas quando:|nao enviar:|quando:/gi, '')
            .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
            .split(/[,\s]+/)
            .filter(function (k) { return k.length > 3; });
        for (var _b = 0, whenToUseWords_1 = whenToUseWords; _b < whenToUseWords_1.length; _b++) {
            var word = whenToUseWords_1[_b];
            if (msgLower.includes(word)) {
                score += 10;
                if (!matchedKeywords.includes(word)) {
                    matchedKeywords.push(word);
                }
            }
        }
        // Keywords comuns para tipos de mídia
        var commonKeywords = {
            'video': ['mostrar', 'ver', 'demonstracao', 'demo', 'como funciona', 'funcionamento'],
            'audio': ['ouvir', 'escutar', 'audio', 'voz'],
            'image': ['foto', 'imagem', 'ver', 'mostra'],
            'document': ['documento', 'pdf', 'arquivo', 'baixar']
        };
        var typeKeywords = commonKeywords[media.mediaType] || [];
        for (var _c = 0, typeKeywords_1 = typeKeywords; _c < typeKeywords_1.length; _c++) {
            var kw = typeKeywords_1[_c];
            if (msgLower.includes(kw)) {
                score += 5;
                if (!matchedKeywords.includes(kw)) {
                    matchedKeywords.push(kw);
                }
            }
        }
        if (score > 0) {
            mediaScores.push({
                media: media,
                score: score,
                keywords: matchedKeywords,
                reason: reason || "Keywords encontradas: ".concat(matchedKeywords.join(', '))
            });
        }
    }
    // Ordenar por score e retornar o melhor
    mediaScores.sort(function (a, b) { return b.score - a.score; });
    if (mediaScores.length > 0 && mediaScores[0].score >= 10) {
        var winner = mediaScores[0];
        return {
            shouldSendMedia: true,
            mediaToSend: winner.media,
            matchedKeywords: winner.keywords,
            reason: "FALLBACK: ".concat(winner.reason, " (score: ").concat(winner.score, ")")
        };
    }
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhum match significativo (fallback)' };
}
// Manter a versão sync para compatibilidade (usa a função async internamente via wrapper)
// DEPRECATED: Use a versão async diretamente
function forceMediaDetectionSync(clientMessage, conversationHistory, mediaLibrary, sentMedias) {
    if (sentMedias === void 0) { sentMedias = []; }
    console.warn("\u26A0\uFE0F [FORCE MEDIA] forceMediaDetectionSync est\u00E1 DEPRECATED - use forceMediaDetection (async)");
    // Retorna resultado vazio para não quebrar código antigo
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Use async version' };
}
/**
 * Envia mídia via W-API
 * Referência: https://www.postman.com/w-api/w-api-api-do-whatsapp/
 */
function sendMediaViaWApi(config, params) {
    return __awaiter(this, void 0, void 0, function () {
        var apiUrl, apiKey, instanceId, to, mediaType, mediaUrl, caption, fileName, isPtt, formattedNumber, chatId, endpoints, endpoint, payload, response, result, error_7;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    apiUrl = config.apiUrl, apiKey = config.apiKey, instanceId = config.instanceId;
                    to = params.to, mediaType = params.mediaType, mediaUrl = params.mediaUrl, caption = params.caption, fileName = params.fileName, isPtt = params.isPtt;
                    formattedNumber = to.replace(/\D/g, '');
                    chatId = formattedNumber.includes('@') ? formattedNumber : "".concat(formattedNumber, "@s.whatsapp.net");
                    endpoints = {
                        audio: '/message/sendMedia',
                        image: '/message/sendMedia',
                        video: '/message/sendMedia',
                        document: '/message/sendMedia',
                    };
                    endpoint = "".concat(apiUrl).concat(endpoints[mediaType]);
                    payload = {
                        chatId: chatId,
                        mediatype: mediaType,
                        media: mediaUrl,
                    };
                    if (caption) {
                        payload.caption = caption;
                    }
                    if (fileName && mediaType === 'document') {
                        payload.fileName = fileName;
                    }
                    // Para áudio, incluir flag PTT (push-to-talk = mensagem de voz gravada)
                    if (mediaType === 'audio') {
                        payload.ptt = isPtt !== false; // PTT por padrão
                    }
                    console.log("[MediaService] Sending ".concat(mediaType, " to ").concat(chatId, " via W-API"));
                    return [4 /*yield*/, fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer ".concat(apiKey),
                                'x-instance-id': instanceId,
                            },
                            body: JSON.stringify(payload),
                        })];
                case 1:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    result = _b.sent();
                    if (response.ok && ((_a = result.key) === null || _a === void 0 ? void 0 : _a.id)) {
                        console.log("[MediaService] Media sent successfully. MessageId: ".concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id }];
                    }
                    else {
                        console.error("[MediaService] W-API error:", result);
                        return [2 /*return*/, { success: false, error: result.message || 'Unknown error' }];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_7 = _b.sent();
                    console.error("[MediaService] Error sending media via W-API:", error_7);
                    return [2 /*return*/, { success: false, error: String(error_7) }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// =============================================================================
// BAILEYS MEDIA SENDING (Fallback)
// =============================================================================
/**
 * Baixa arquivo da URL e retorna como Buffer
 * Essencial para enviar áudio PTT que precisa de buffer, não URL
 */
function downloadMediaAsBuffer(url) {
    return __awaiter(this, void 0, void 0, function () {
        var response, arrayBuffer, buffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[MediaService] Downloading media from: ".concat(url));
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Failed to download media: ".concat(response.status, " ").concat(response.statusText));
                    }
                    return [4 /*yield*/, response.arrayBuffer()];
                case 2:
                    arrayBuffer = _a.sent();
                    buffer = Buffer.from(arrayBuffer);
                    console.log("[MediaService] Downloaded ".concat(buffer.length, " bytes"));
                    // Validação básica
                    if (buffer.length === 0) {
                        throw new Error('Downloaded buffer is empty');
                    }
                    return [2 /*return*/, buffer];
            }
        });
    });
}
/**
 * Envia mídia via Baileys (socket WhatsApp direto)
 * Usado como fallback se W-API não estiver configurada
 *
 * IMPORTANTE: Para áudio PTT, precisamos baixar o arquivo como Buffer
 * porque Baileys tem problemas com URLs para áudio PTT
 *
 * 🛡️ ANTI-BLOQUEIO: Agora passa pelo sistema de fila para respeitar
 * delay de 5-10s entre mensagens do mesmo WhatsApp
 */
function sendMediaViaBaileys(socket, // WASocket do Baileys
jid, media, userId // Para aplicar delay anti-bloqueio
) {
    return __awaiter(this, void 0, void 0, function () {
        var messageContent, _a, audioBuffer, isPtt, mimeType, audioResult, downloadError_1, imageBuffer, downloadError_2, videoBuffer, downloadError_3, docBuffer, downloadError_4, result, error_8;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 23, , 24]);
                    if (!socket) {
                        return [2 /*return*/, { success: false, error: 'Socket not connected' }];
                    }
                    if (!userId) return [3 /*break*/, 2];
                    return [4 /*yield*/, messageQueueService_1.messageQueueService.waitForTurn(userId, "m\u00EDdia ".concat(media.mediaType, ": ").concat(media.name))];
                case 1:
                    _c.sent();
                    _c.label = 2;
                case 2:
                    console.log("[MediaService] Sending ".concat(media.mediaType, " to ").concat(jid, " via Baileys"));
                    console.log("[MediaService] Media URL: ".concat(media.storageUrl));
                    console.log("[MediaService] Media MimeType: ".concat(media.mimeType));
                    messageContent = void 0;
                    _a = media.mediaType;
                    switch (_a) {
                        case 'audio': return [3 /*break*/, 3];
                        case 'image': return [3 /*break*/, 8];
                        case 'video': return [3 /*break*/, 12];
                        case 'document': return [3 /*break*/, 16];
                    }
                    return [3 /*break*/, 20];
                case 3:
                    _c.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, downloadMediaAsBuffer(media.storageUrl)];
                case 4:
                    audioBuffer = _c.sent();
                    console.log("[MediaService] Audio buffer downloaded: ".concat(audioBuffer.length, " bytes"));
                    isPtt = media.isPtt !== false;
                    mimeType = 'audio/mp4';
                    console.log("[MediaService] \uD83C\uDFB5 Audio config:");
                    console.log("    - Buffer size: ".concat(audioBuffer.length, " bytes"));
                    console.log("    - MimeType: ".concat(mimeType));
                    console.log("    - isPtt (gravado): ".concat(isPtt));
                    return [4 /*yield*/, sendAudioWithFallback(socket, jid, audioBuffer, media.storageUrl, mimeType, isPtt)];
                case 5:
                    audioResult = _c.sent();
                    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado após fallback de áudio
                    if (userId) {
                        messageQueueService_1.messageQueueService.markMediaSent(userId);
                    }
                    return [2 /*return*/, audioResult];
                case 6:
                    downloadError_1 = _c.sent();
                    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro
                    if (userId) {
                        messageQueueService_1.messageQueueService.markMediaSent(userId);
                    }
                    console.error("[MediaService] \u274C Failed to download audio:", downloadError_1);
                    return [2 /*return*/, { success: false, error: "Failed to download audio: ".concat(String(downloadError_1)) }];
                case 7: return [3 /*break*/, 21];
                case 8:
                    _c.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, downloadMediaAsBuffer(media.storageUrl)];
                case 9:
                    imageBuffer = _c.sent();
                    messageContent = {
                        image: imageBuffer,
                        caption: media.caption || undefined, // Usa caption (não description)
                        mimetype: media.mimeType || 'image/jpeg',
                    };
                    return [3 /*break*/, 11];
                case 10:
                    downloadError_2 = _c.sent();
                    // Fallback para URL se download falhar
                    console.warn("[MediaService] Image download failed, trying URL: ".concat(downloadError_2));
                    messageContent = {
                        image: { url: media.storageUrl },
                        caption: media.caption || undefined, // Usa caption (não description)
                        mimetype: media.mimeType || 'image/jpeg',
                    };
                    return [3 /*break*/, 11];
                case 11: return [3 /*break*/, 21];
                case 12:
                    _c.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, downloadMediaAsBuffer(media.storageUrl)];
                case 13:
                    videoBuffer = _c.sent();
                    messageContent = {
                        video: videoBuffer,
                        caption: media.caption || undefined, // Usa caption (não description)
                        mimetype: media.mimeType || 'video/mp4',
                    };
                    return [3 /*break*/, 15];
                case 14:
                    downloadError_3 = _c.sent();
                    console.warn("[MediaService] Video download failed, trying URL: ".concat(downloadError_3));
                    messageContent = {
                        video: { url: media.storageUrl },
                        caption: media.caption || undefined, // Usa caption (não description)
                        mimetype: media.mimeType || 'video/mp4',
                    };
                    return [3 /*break*/, 15];
                case 15: return [3 /*break*/, 21];
                case 16:
                    _c.trys.push([16, 18, , 19]);
                    return [4 /*yield*/, downloadMediaAsBuffer(media.storageUrl)];
                case 17:
                    docBuffer = _c.sent();
                    messageContent = {
                        document: docBuffer,
                        mimetype: media.mimeType || 'application/pdf',
                        fileName: media.fileName || 'document',
                    };
                    return [3 /*break*/, 19];
                case 18:
                    downloadError_4 = _c.sent();
                    console.warn("[MediaService] Document download failed, trying URL: ".concat(downloadError_4));
                    messageContent = {
                        document: { url: media.storageUrl },
                        mimetype: media.mimeType || 'application/pdf',
                        fileName: media.fileName || 'document',
                    };
                    return [3 /*break*/, 19];
                case 19: return [3 /*break*/, 21];
                case 20: return [2 /*return*/, { success: false, error: "Unknown media type: ".concat(media.mediaType) }];
                case 21:
                    console.log("[MediaService] Sending message to Baileys...");
                    return [4 /*yield*/, socket.sendMessage(jid, messageContent)];
                case 22:
                    result = _c.sent();
                    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado para liberar próximo
                    if (userId) {
                        messageQueueService_1.messageQueueService.markMediaSent(userId);
                    }
                    if ((_b = result === null || result === void 0 ? void 0 : result.key) === null || _b === void 0 ? void 0 : _b.id) {
                        console.log("[MediaService] \u2705 Media sent via Baileys. MessageId: ".concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id }];
                    }
                    else {
                        console.error("[MediaService] \u274C No message ID returned from Baileys");
                        return [2 /*return*/, { success: false, error: 'No message ID returned' }];
                    }
                    return [3 /*break*/, 24];
                case 23:
                    error_8 = _c.sent();
                    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro para liberar fila
                    if (userId) {
                        messageQueueService_1.messageQueueService.markMediaSent(userId);
                    }
                    console.error("[MediaService] \u274C Error sending media via Baileys:", error_8);
                    return [2 /*return*/, { success: false, error: String(error_8) }];
                case 24: return [2 /*return*/];
            }
        });
    });
}
// =============================================================================
// AUDIO VALIDATION & CONVERSION
// =============================================================================
/**
 * Valida o formato do áudio e retorna informações de diagnóstico
 * Ajuda a identificar problemas com o arquivo de áudio
 */
function validateAudioBuffer(buffer, mimeType) {
    return __awaiter(this, void 0, void 0, function () {
        var issues, format, hasHeader, header, isValid;
        return __generator(this, function (_a) {
            issues = [];
            format = 'unknown';
            hasHeader = false;
            // Verificar tamanho
            if (buffer.length === 0) {
                issues.push('Buffer vazio');
                return [2 /*return*/, { isValid: false, format: format, hasHeader: hasHeader, size: 0, issues: issues }];
            }
            if (buffer.length < 100) {
                issues.push('Buffer muito pequeno (< 100 bytes) - pode estar corrompido');
            }
            header = buffer.slice(0, 4).toString('hex').toUpperCase();
            // OGG header
            if (header.startsWith('4F6767')) {
                format = 'OGG';
                hasHeader = true;
            }
            // OPUS header (OggS)
            else if (buffer.slice(0, 4).toString() === 'OggS') {
                format = 'OGG-OPUS';
                hasHeader = true;
            }
            // MP3 header
            else if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || header.startsWith('ID3')) {
                format = 'MP3';
                hasHeader = true;
            }
            // WAV header
            else if (header === '52494646') { // RIFF
                format = 'WAV';
                hasHeader = true;
            }
            // M4A header
            else if (header.slice(4) === '66747970') { // ftyp
                format = 'M4A';
                hasHeader = true;
            }
            else {
                issues.push("Formato desconhecido (header: ".concat(header, ")"));
                issues.push('Arquivo pode estar em formato Opus puro sem container OGG');
            }
            isValid = hasHeader && issues.length === 0;
            console.log("[MediaService] \uD83D\uDD0D Audio validation:", {
                format: format,
                mimeType: mimeType,
                hasHeader: hasHeader,
                size: buffer.length,
                isValid: isValid,
                issues: issues
            });
            return [2 /*return*/, { isValid: isValid, format: format, hasHeader: hasHeader, size: buffer.length, issues: issues }];
        });
    });
}
/**
 * Gera um áudio WAV de teste (beep de 1s) em runtime para diagnóstico
 * Útil para validar se o problema é o arquivo ou o envio Baileys
 */
function generateTestWavBuffer(durationMs, freq) {
    if (durationMs === void 0) { durationMs = 1000; }
    if (freq === void 0) { freq = 440; }
    var sampleRate = 16000;
    var numSamples = Math.floor(sampleRate * (durationMs / 1000));
    var amplitude = 0.2; // 20% da escala máxima
    // WAV header (16-bit PCM, mono)
    var headerSize = 44;
    var dataSize = numSamples * 2; // 16-bit = 2 bytes
    var buffer = Buffer.alloc(headerSize + dataSize);
    // Escrever header RIFF/WAVE
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4); // chunk size
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1 size (PCM)
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // Dados PCM (senoide)
    for (var i = 0; i < numSamples; i++) {
        var t = i / sampleRate;
        var sample = Math.sin(2 * Math.PI * freq * t) * amplitude;
        var intSample = Math.max(-1, Math.min(1, sample));
        buffer.writeInt16LE(intSample * 32767, headerSize + i * 2);
    }
    return buffer;
}
/**
 * Tenta diferentes estratégias de envio de áudio para Baileys
 * Se uma falhar, tenta outra
 */
function sendAudioWithFallback(socket, jid, audioBuffer, storageUrl, mimeType, isPtt) {
    return __awaiter(this, void 0, void 0, function () {
        var validation, microDelay, result, e_1, result, e_2, mimetypeOptions, _i, mimetypeOptions_1, mt, result, e_3, result, e_4;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, validateAudioBuffer(audioBuffer, mimeType)];
                case 1:
                    validation = _e.sent();
                    microDelay = function () { return new Promise(function (r) { return setTimeout(r, 2000 + Math.random() * 1000); }); };
                    // Estratégia 1: Enviar como está (com validação)
                    console.log("[MediaService] \uD83D\uDCCB Estrat\u00E9gia 1: Enviar ".concat(isPtt ? 'COM' : 'SEM', " PTT (").concat(mimeType, ")"));
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, socket.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: mimeType,
                            ptt: isPtt,
                        })];
                case 3:
                    result = _e.sent();
                    if ((_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id) {
                        console.log("[MediaService] \u2705 Estrat\u00E9gia 1 funcionou! MessageId: ".concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id, strategy: "Env com ".concat(isPtt ? 'PTT' : 'sem PTT') }];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _e.sent();
                    console.warn("[MediaService] \u274C Estrat\u00E9gia 1 falhou:", e_1);
                    return [3 /*break*/, 5];
                case 5: 
                // 🛡️ Micro-delay entre retries
                return [4 /*yield*/, microDelay()];
                case 6:
                    // 🛡️ Micro-delay entre retries
                    _e.sent();
                    if (!isPtt) return [3 /*break*/, 12];
                    console.log("[MediaService] \uD83D\uDCCB Estrat\u00E9gia 2: Tentar SEM PTT");
                    _e.label = 7;
                case 7:
                    _e.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, socket.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: mimeType,
                            ptt: false,
                        })];
                case 8:
                    result = _e.sent();
                    if ((_b = result === null || result === void 0 ? void 0 : result.key) === null || _b === void 0 ? void 0 : _b.id) {
                        console.log("[MediaService] \u2705 Estrat\u00E9gia 2 funcionou (sem PTT)! MessageId: ".concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id, strategy: 'Enviado sem PTT (fallback)' }];
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _e.sent();
                    console.warn("[MediaService] \u274C Estrat\u00E9gia 2 falhou:", e_2);
                    return [3 /*break*/, 10];
                case 10: 
                // 🛡️ Micro-delay entre retries
                return [4 /*yield*/, microDelay()];
                case 11:
                    // 🛡️ Micro-delay entre retries
                    _e.sent();
                    _e.label = 12;
                case 12:
                    mimetypeOptions = ['audio/mp4', 'audio/ogg; codecs=opus', 'audio/mpeg', 'audio/ogg'];
                    _i = 0, mimetypeOptions_1 = mimetypeOptions;
                    _e.label = 13;
                case 13:
                    if (!(_i < mimetypeOptions_1.length)) return [3 /*break*/, 20];
                    mt = mimetypeOptions_1[_i];
                    if (mt === mimeType)
                        return [3 /*break*/, 19]; // Já tentamos
                    console.log("[MediaService] \uD83D\uDCCB Estrat\u00E9gia 3: Tentar com mimetype ".concat(mt));
                    _e.label = 14;
                case 14:
                    _e.trys.push([14, 16, , 17]);
                    return [4 /*yield*/, socket.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: mt,
                            ptt: false,
                        })];
                case 15:
                    result = _e.sent();
                    if ((_c = result === null || result === void 0 ? void 0 : result.key) === null || _c === void 0 ? void 0 : _c.id) {
                        console.log("[MediaService] \u2705 Estrat\u00E9gia 3 funcionou (".concat(mt, ")! MessageId: ").concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id, strategy: "Enviado com mimetype ".concat(mt) }];
                    }
                    return [3 /*break*/, 17];
                case 16:
                    e_3 = _e.sent();
                    console.warn("[MediaService] \u274C Estrat\u00E9gia 3 falhou com ".concat(mt, ":"), e_3);
                    return [3 /*break*/, 17];
                case 17: 
                // 🛡️ Micro-delay entre retries de mimetype
                return [4 /*yield*/, microDelay()];
                case 18:
                    // 🛡️ Micro-delay entre retries de mimetype
                    _e.sent();
                    _e.label = 19;
                case 19:
                    _i++;
                    return [3 /*break*/, 13];
                case 20:
                    // Estratégia 4: Tentar via URL (alguns cenários de Baileys preferem streaming)
                    console.log("[MediaService] \uD83D\uDCCB Estrat\u00E9gia 4: Enviar via URL direta (sem buffer)");
                    _e.label = 21;
                case 21:
                    _e.trys.push([21, 23, , 24]);
                    return [4 /*yield*/, socket.sendMessage(jid, {
                            audio: { url: storageUrl },
                            mimetype: mimeType,
                            ptt: isPtt,
                        })];
                case 22:
                    result = _e.sent();
                    if ((_d = result === null || result === void 0 ? void 0 : result.key) === null || _d === void 0 ? void 0 : _d.id) {
                        console.log("[MediaService] \u2705 Estrat\u00E9gia 4 funcionou (URL)! MessageId: ".concat(result.key.id));
                        return [2 /*return*/, { success: true, messageId: result.key.id, strategy: 'Enviado via URL' }];
                    }
                    return [3 /*break*/, 24];
                case 23:
                    e_4 = _e.sent();
                    console.warn("[MediaService] \u274C Estrat\u00E9gia 4 falhou (URL):", e_4);
                    return [3 /*break*/, 24];
                case 24: return [2 /*return*/, {
                        success: false,
                        error: "Todas as estrat\u00E9gias falharam. Validation: ".concat(JSON.stringify(validation)),
                        strategy: 'Nenhuma estratégia funcionou'
                    }];
            }
        });
    });
}
// =============================================================================
// AUDIO TRANSCRIPTION
// =============================================================================
/**
 * Transcreve áudio usando Mistral (voxtral-mini-latest)
 * Usado para transcrever áudios recebidos do usuário
 */
function transcribeAudio(audioUrl_1) {
    return __awaiter(this, arguments, void 0, function (audioUrl, mimeType) {
        var getLLMClient, mistral, audioResponse, audioBuffer, base64Audio, result, error_9;
        var _a, _b, _c;
        if (mimeType === void 0) { mimeType = 'audio/ogg'; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./llm'); })];
                case 1:
                    getLLMClient = (_d.sent()).getLLMClient;
                    return [4 /*yield*/, getLLMClient()];
                case 2:
                    mistral = _d.sent();
                    if (!mistral) {
                        console.error('[MediaService] Mistral client not available for transcription');
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, fetch(audioUrl)];
                case 3:
                    audioResponse = _d.sent();
                    return [4 /*yield*/, audioResponse.arrayBuffer()];
                case 4:
                    audioBuffer = _d.sent();
                    base64Audio = Buffer.from(audioBuffer).toString('base64');
                    return [4 /*yield*/, ((_c = (_b = (_a = mistral.audio) === null || _a === void 0 ? void 0 : _a.transcriptions) === null || _b === void 0 ? void 0 : _b.create) === null || _c === void 0 ? void 0 : _c.call(_b, {
                            model: process.env.MISTRAL_TRANSCRIPTION_MODEL || 'voxtral-mini-latest',
                            file: {
                                name: 'audio.ogg',
                                type: mimeType,
                                data: base64Audio,
                            },
                        }))];
                case 5:
                    result = _d.sent();
                    if (result === null || result === void 0 ? void 0 : result.text) {
                        console.log("[MediaService] Audio transcribed: ".concat(result.text.substring(0, 100), "..."));
                        return [2 /*return*/, result.text];
                    }
                    return [2 /*return*/, null];
                case 6:
                    error_9 = _d.sent();
                    console.error('[MediaService] Error transcribing audio:', error_9);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Executa as ações de mídia retornadas pelo Mistral
 *
 * Suporta enviar múltiplas mídias quando elas compartilham a mesma tag
 * (ex: vídeo + áudio + imagem para "restaurante")
 *
 * NOVO: Salva as mensagens de mídia no banco de dados e transcreve áudios
 */
function executeMediaActions(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, jid, conversationId, actions, socket, wapiConfig, persistOutgoingAndBroadcast, urlActions, groupedActions, _i, actions_1, action, _loop_1, _a, urlActions_1, action, _b, _c, _d, mediaName, mediaActions, allMediasForName, _loop_2, _e, allMediasForName_1, media;
        var _this = this;
        var _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    userId = params.userId, jid = params.jid, conversationId = params.conversationId, actions = params.actions, socket = params.socket, wapiConfig = params.wapiConfig;
                    if (!actions || actions.length === 0) {
                        return [2 /*return*/];
                    }
                    persistOutgoingAndBroadcast = function (payload) { return __awaiter(_this, void 0, void 0, function () {
                        var sentAt, safeMessageId, savedMessage, inserted, insertError_1, existing, conversation, error_10;
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!conversationId)
                                        return [2 /*return*/];
                                    sentAt = new Date();
                                    safeMessageId = payload.messageId || "media-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 9));
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 11, , 12]);
                                    _c.label = 2;
                                case 2:
                                    _c.trys.push([2, 4, , 8]);
                                    return [4 /*yield*/, db_1.db
                                            .insert(schema_1.messages)
                                            .values({
                                            conversationId: conversationId,
                                            messageId: safeMessageId,
                                            fromMe: true,
                                            text: payload.text,
                                            timestamp: sentAt,
                                            status: "sent",
                                            isFromAgent: (_a = payload.isFromAgent) !== null && _a !== void 0 ? _a : true,
                                            mediaType: payload.mediaType,
                                            mediaUrl: payload.mediaUrl,
                                            mediaMimeType: payload.mediaMimeType || undefined,
                                            mediaDuration: payload.mediaDuration || undefined,
                                            mediaCaption: payload.mediaCaption || null,
                                        })
                                            .returning()];
                                case 3:
                                    inserted = _c.sent();
                                    savedMessage = inserted === null || inserted === void 0 ? void 0 : inserted[0];
                                    return [3 /*break*/, 8];
                                case 4:
                                    insertError_1 = _c.sent();
                                    if (!((insertError_1 === null || insertError_1 === void 0 ? void 0 : insertError_1.code) === "23505")) return [3 /*break*/, 6];
                                    return [4 /*yield*/, db_1.db
                                            .select()
                                            .from(schema_1.messages)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId), (0, drizzle_orm_1.eq)(schema_1.messages.messageId, safeMessageId)))
                                            .limit(1)];
                                case 5:
                                    existing = _c.sent();
                                    savedMessage = existing === null || existing === void 0 ? void 0 : existing[0];
                                    console.warn("[MediaService] Duplicate messageId detected, reusing existing message: ".concat(safeMessageId));
                                    return [3 /*break*/, 7];
                                case 6: throw insertError_1;
                                case 7: return [3 /*break*/, 8];
                                case 8: return [4 /*yield*/, storage_1.storage.updateConversation(conversationId, {
                                        lastMessageText: payload.text,
                                        lastMessageTime: sentAt,
                                        lastMessageFromMe: true,
                                        hasReplied: true,
                                        unreadCount: 0,
                                    })];
                                case 9:
                                    _c.sent();
                                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                                case 10:
                                    conversation = _c.sent();
                                    (0, whatsapp_1.broadcastToUser)(userId, {
                                        type: "message_sent",
                                        conversationId: conversationId,
                                        message: payload.text,
                                        messageData: savedMessage
                                            ? {
                                                id: savedMessage.id,
                                                conversationId: conversationId,
                                                messageId: savedMessage.messageId || safeMessageId,
                                                fromMe: true,
                                                text: payload.text,
                                                timestamp: savedMessage.timestamp || sentAt.toISOString(),
                                                isFromAgent: (_b = payload.isFromAgent) !== null && _b !== void 0 ? _b : true,
                                                status: "sent",
                                                mediaType: payload.mediaType || null,
                                                mediaUrl: payload.mediaUrl || null,
                                                mediaMimeType: payload.mediaMimeType || null,
                                                mediaDuration: payload.mediaDuration || null,
                                                mediaCaption: payload.mediaCaption || null,
                                            }
                                            : undefined,
                                        conversationUpdate: {
                                            id: conversationId,
                                            connectionId: conversation === null || conversation === void 0 ? void 0 : conversation.connectionId,
                                            contactNumber: conversation === null || conversation === void 0 ? void 0 : conversation.contactNumber,
                                            contactName: conversation === null || conversation === void 0 ? void 0 : conversation.contactName,
                                            contactAvatar: conversation === null || conversation === void 0 ? void 0 : conversation.contactAvatar,
                                            lastMessageText: payload.text,
                                            lastMessageTime: sentAt.toISOString(),
                                            lastMessageFromMe: true,
                                            unreadCount: 0,
                                        },
                                    });
                                    return [3 /*break*/, 12];
                                case 11:
                                    error_10 = _c.sent();
                                    console.error("[MediaService] Erro ao salvar/broadcast de mídia:", error_10);
                                    return [3 /*break*/, 12];
                                case 12: return [2 /*return*/];
                            }
                        });
                    }); };
                    urlActions = actions.filter(function (action) { return action.type === 'send_media_url'; });
                    groupedActions = new Map();
                    for (_i = 0, actions_1 = actions; _i < actions_1.length; _i++) {
                        action = actions_1[_i];
                        if (action.type === 'send_media') {
                            if (!groupedActions.has(action.media_name)) {
                                groupedActions.set(action.media_name, []);
                            }
                            groupedActions.get(action.media_name).push(action);
                        }
                    }
                    _loop_1 = function (action) {
                        var delaySeconds_1, sendResult, payload, result, messageId, messageText, saveError_1, error_11;
                        return __generator(this, function (_m) {
                            switch (_m.label) {
                                case 0:
                                    _m.trys.push([0, 12, , 13]);
                                    delaySeconds_1 = (_f = action.delay_seconds) !== null && _f !== void 0 ? _f : 0;
                                    if (!(delaySeconds_1 > 0)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delaySeconds_1 * 1000); })];
                                case 1:
                                    _m.sent();
                                    _m.label = 2;
                                case 2:
                                    sendResult = { success: false };
                                    if (!wapiConfig) return [3 /*break*/, 4];
                                    return [4 /*yield*/, sendMediaViaWApi(wapiConfig, {
                                            to: jid.split('@')[0],
                                            mediaType: action.media_type,
                                            mediaUrl: action.media_url,
                                            caption: action.caption || undefined,
                                            fileName: action.file_name || undefined,
                                            isPtt: action.media_type === 'audio',
                                        })];
                                case 3:
                                    sendResult = _m.sent();
                                    return [3 /*break*/, 6];
                                case 4:
                                    if (!socket) return [3 /*break*/, 6];
                                    payload = {};
                                    if (action.media_type === 'image') {
                                        payload.image = { url: action.media_url };
                                        if (action.caption)
                                            payload.caption = action.caption;
                                    }
                                    else if (action.media_type === 'video') {
                                        payload.video = { url: action.media_url };
                                        if (action.caption)
                                            payload.caption = action.caption;
                                    }
                                    else if (action.media_type === 'document') {
                                        payload.document = { url: action.media_url };
                                        if (action.caption)
                                            payload.caption = action.caption;
                                        if (action.file_name)
                                            payload.fileName = action.file_name;
                                    }
                                    else if (action.media_type === 'audio') {
                                        payload.audio = { url: action.media_url };
                                        payload.ptt = true;
                                    }
                                    return [4 /*yield*/, socket.sendMessage(jid, payload)];
                                case 5:
                                    result = _m.sent();
                                    sendResult = {
                                        success: true,
                                        messageId: (_g = result === null || result === void 0 ? void 0 : result.key) === null || _g === void 0 ? void 0 : _g.id,
                                    };
                                    _m.label = 6;
                                case 6:
                                    if (sendResult.success && sendResult.messageId) {
                                        (0, whatsapp_1.registerAgentMessageId)(sendResult.messageId);
                                    }
                                    if (!(sendResult.success && conversationId)) return [3 /*break*/, 10];
                                    _m.label = 7;
                                case 7:
                                    _m.trys.push([7, 9, , 10]);
                                    messageId = sendResult.messageId || "media-url-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 9));
                                    messageText = action.caption || (action.media_type === 'image' ? '*Imagem*' : '*Mídia*');
                                    return [4 /*yield*/, persistOutgoingAndBroadcast({
                                            text: messageText,
                                            messageId: messageId,
                                            isFromAgent: true,
                                            mediaType: action.media_type,
                                            mediaUrl: action.media_url,
                                            mediaCaption: '[MEDIA:URL]',
                                        })];
                                case 8:
                                    _m.sent();
                                    return [3 /*break*/, 10];
                                case 9:
                                    saveError_1 = _m.sent();
                                    console.error('[MediaService] Erro ao salvar mensagem de mídia URL:', saveError_1);
                                    return [3 /*break*/, 10];
                                case 10: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                                case 11:
                                    _m.sent();
                                    return [3 /*break*/, 13];
                                case 12:
                                    error_11 = _m.sent();
                                    console.error('[MediaService] Erro ao enviar mídia por URL:', error_11);
                                    return [3 /*break*/, 13];
                                case 13: return [2 /*return*/];
                            }
                        });
                    };
                    _a = 0, urlActions_1 = urlActions;
                    _l.label = 1;
                case 1:
                    if (!(_a < urlActions_1.length)) return [3 /*break*/, 4];
                    action = urlActions_1[_a];
                    return [5 /*yield**/, _loop_1(action)];
                case 2:
                    _l.sent();
                    _l.label = 3;
                case 3:
                    _a++;
                    return [3 /*break*/, 1];
                case 4:
                    _b = 0, _c = Array.from(groupedActions.entries());
                    _l.label = 5;
                case 5:
                    if (!(_b < _c.length)) return [3 /*break*/, 11];
                    _d = _c[_b], mediaName = _d[0], mediaActions = _d[1];
                    console.log("\n\uD83D\uDCC1 [MediaService] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83D\uDCC1 [MediaService] Processando m\u00EDdia: ".concat(mediaName, " (").concat(mediaActions.length, " a\u00E7\u00F5es)"));
                    return [4 /*yield*/, getMediasByNamePattern(userId, mediaName)];
                case 6:
                    allMediasForName = _l.sent();
                    if (allMediasForName.length === 0) {
                        console.error("\uD83D\uDCC1 [MediaService] \u274C ERRO CR\u00CDTICO: Nenhuma m\u00EDdia encontrada para: \"".concat(mediaName, "\" (userId: ").concat(userId, ")"));
                        console.error("\uD83D\uDCC1 [MediaService] \uD83D\uDCA1 Verifique se a m\u00EDdia existe no banco de dados");
                        return [3 /*break*/, 10];
                    }
                    console.log("\uD83D\uDCC1 [MediaService] \u2705 Encontradas ".concat(allMediasForName.length, " m\u00EDdias para \"").concat(mediaName, "\":"));
                    allMediasForName.forEach(function (m) {
                        var _a;
                        console.log("   - ".concat(m.mediaType, ": ").concat(m.name, " | URL: ").concat((_a = m.storageUrl) === null || _a === void 0 ? void 0 : _a.substring(0, 60), "..."));
                    });
                    _loop_2 = function (media) {
                        var flowItems, sortedItems, idx, item, textContent, textMsgId, textEndpoint, formattedNumber, chatId, textResp, textJson, result, textErr_1, itemMediaType, itemUrl, sendResult, tempMedia, msgText, mediaErr_1, retryCount, maxRetries, sendSuccess, _loop_3, state_1, transcriptionText, audioBuffer, transcribeError_1, messageText, messageId, saveError_2;
                        return __generator(this, function (_o) {
                            switch (_o.label) {
                                case 0:
                                    if (!(media.mediaType === 'flow')) return [3 /*break*/, 25];
                                    flowItems = media.flowItems || [];
                                    if (flowItems.length === 0) {
                                        console.error("\uD83D\uDCC1 [MediaService] \u274C Fluxo \"".concat(media.name, "\" n\u00E3o tem itens configurados"));
                                        return [2 /*return*/, "continue"];
                                    }
                                    sortedItems = __spreadArray([], flowItems, true).sort(function (a, b) { var _a, _b; return ((_a = a.order) !== null && _a !== void 0 ? _a : 0) - ((_b = b.order) !== null && _b !== void 0 ? _b : 0); });
                                    console.log("\uD83D\uDD00 [MediaService] Iniciando fluxo \"".concat(media.name, "\" com ").concat(sortedItems.length, " itens"));
                                    idx = 0;
                                    _o.label = 1;
                                case 1:
                                    if (!(idx < sortedItems.length)) return [3 /*break*/, 24];
                                    item = sortedItems[idx];
                                    console.log("\uD83D\uDD00 [MediaService] Fluxo item ".concat(idx + 1, "/").concat(sortedItems.length, ": type=").concat(item.type));
                                    if (!(idx > 0)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1200); })];
                                case 2:
                                    _o.sent();
                                    _o.label = 3;
                                case 3:
                                    if (!(item.type === 'text')) return [3 /*break*/, 14];
                                    textContent = item.text || '';
                                    if (!textContent.trim())
                                        return [3 /*break*/, 23];
                                    _o.label = 4;
                                case 4:
                                    _o.trys.push([4, 12, , 13]);
                                    textMsgId = void 0;
                                    if (!wapiConfig) return [3 /*break*/, 7];
                                    textEndpoint = "".concat(wapiConfig.apiUrl, "/message/sendText");
                                    formattedNumber = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                                    chatId = formattedNumber.includes('@') ? formattedNumber : "".concat(formattedNumber, "@s.whatsapp.net");
                                    return [4 /*yield*/, fetch(textEndpoint, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': "Bearer ".concat(wapiConfig.apiKey),
                                                'x-instance-id': wapiConfig.instanceId,
                                            },
                                            body: JSON.stringify({ chatId: chatId, message: textContent }),
                                        })];
                                case 5:
                                    textResp = _o.sent();
                                    return [4 /*yield*/, textResp.json()];
                                case 6:
                                    textJson = _o.sent();
                                    textMsgId = (_h = textJson.key) === null || _h === void 0 ? void 0 : _h.id;
                                    return [3 /*break*/, 9];
                                case 7:
                                    if (!socket) return [3 /*break*/, 9];
                                    return [4 /*yield*/, socket.sendMessage(jid, { text: textContent })];
                                case 8:
                                    result = _o.sent();
                                    textMsgId = (_j = result === null || result === void 0 ? void 0 : result.key) === null || _j === void 0 ? void 0 : _j.id;
                                    _o.label = 9;
                                case 9:
                                    if (textMsgId)
                                        (0, whatsapp_1.registerAgentMessageId)(textMsgId);
                                    if (!conversationId) return [3 /*break*/, 11];
                                    return [4 /*yield*/, persistOutgoingAndBroadcast({
                                            text: textContent,
                                            messageId: textMsgId || "flow-text-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8)),
                                            isFromAgent: true,
                                            mediaCaption: "[FLOW:".concat(media.name, ":").concat(idx, "]"),
                                        })];
                                case 10:
                                    _o.sent();
                                    _o.label = 11;
                                case 11:
                                    console.log("\uD83D\uDD00 [MediaService] Fluxo item texto enviado: \"".concat(textContent.substring(0, 50), "...\""));
                                    return [3 /*break*/, 13];
                                case 12:
                                    textErr_1 = _o.sent();
                                    console.error("\uD83D\uDD00 [MediaService] Erro ao enviar texto do fluxo item ".concat(idx, ":"), textErr_1);
                                    return [3 /*break*/, 13];
                                case 13: return [3 /*break*/, 23];
                                case 14:
                                    if (!(item.type === 'media')) return [3 /*break*/, 23];
                                    itemMediaType = item.mediaType;
                                    itemUrl = item.storageUrl || '';
                                    if (!itemUrl || !itemMediaType)
                                        return [3 /*break*/, 23];
                                    _o.label = 15;
                                case 15:
                                    _o.trys.push([15, 22, , 23]);
                                    sendResult = { success: false };
                                    tempMedia = {
                                        id: "flow-item-".concat(idx),
                                        userId: userId,
                                        name: "".concat(media.name, "_ITEM_").concat(idx),
                                        mediaType: itemMediaType,
                                        storageUrl: itemUrl,
                                        fileName: item.fileName || null,
                                        fileSize: null,
                                        mimeType: item.mimeType || null,
                                        durationSeconds: null,
                                        description: '',
                                        whenToUse: null,
                                        caption: item.caption || null,
                                        transcription: null,
                                        isPtt: itemMediaType === 'audio',
                                        sendAlone: false,
                                        isActive: true,
                                        displayOrder: idx,
                                        wapiMediaId: null,
                                        flowItems: null,
                                        createdAt: new Date(),
                                        updatedAt: new Date(),
                                    };
                                    if (!wapiConfig) return [3 /*break*/, 17];
                                    return [4 /*yield*/, sendMediaViaWApi(wapiConfig, {
                                            to: jid.split('@')[0],
                                            mediaType: itemMediaType,
                                            mediaUrl: itemUrl,
                                            caption: itemMediaType !== 'audio' ? (item.caption || undefined) : undefined,
                                            fileName: item.fileName || undefined,
                                            isPtt: itemMediaType === 'audio',
                                        })];
                                case 16:
                                    sendResult = _o.sent();
                                    return [3 /*break*/, 19];
                                case 17:
                                    if (!socket) return [3 /*break*/, 19];
                                    return [4 /*yield*/, sendMediaViaBaileys(socket, jid, tempMedia, userId)];
                                case 18:
                                    sendResult = _o.sent();
                                    _o.label = 19;
                                case 19:
                                    if (sendResult.success && sendResult.messageId) {
                                        (0, whatsapp_1.registerAgentMessageId)(sendResult.messageId);
                                    }
                                    if (!(sendResult.success && conversationId)) return [3 /*break*/, 21];
                                    msgText = item.caption || "*".concat(itemMediaType.charAt(0).toUpperCase() + itemMediaType.slice(1), "*");
                                    return [4 /*yield*/, persistOutgoingAndBroadcast({
                                            text: msgText,
                                            messageId: sendResult.messageId || "flow-media-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8)),
                                            isFromAgent: true,
                                            mediaType: itemMediaType,
                                            mediaUrl: itemUrl,
                                            mediaCaption: "[FLOW:".concat(media.name, ":").concat(idx, "]"),
                                        })];
                                case 20:
                                    _o.sent();
                                    _o.label = 21;
                                case 21:
                                    console.log("\uD83D\uDD00 [MediaService] Fluxo item m\u00EDdia enviada: ".concat(itemMediaType, " url=").concat(itemUrl.substring(0, 50)));
                                    return [3 /*break*/, 23];
                                case 22:
                                    mediaErr_1 = _o.sent();
                                    console.error("\uD83D\uDD00 [MediaService] Erro ao enviar m\u00EDdia do fluxo item ".concat(idx, ":"), mediaErr_1);
                                    return [3 /*break*/, 23];
                                case 23:
                                    idx++;
                                    return [3 /*break*/, 1];
                                case 24:
                                    console.log("\uD83D\uDD00 [MediaService] \u2705 Fluxo \"".concat(media.name, "\" conclu\u00EDdo (").concat(sortedItems.length, " itens enviados)"));
                                    return [2 /*return*/, "continue"];
                                case 25:
                                    retryCount = 0;
                                    maxRetries = 2;
                                    sendSuccess = false;
                                    _loop_3 = function () {
                                        var delaySeconds_2, sendResult, error_12;
                                        return __generator(this, function (_p) {
                                            switch (_p.label) {
                                                case 0:
                                                    _p.trys.push([0, 10, , 11]);
                                                    delaySeconds_2 = (_k = mediaActions[0]) === null || _k === void 0 ? void 0 : _k.delay_seconds;
                                                    if (!(delaySeconds_2 && delaySeconds_2 > 0 && retryCount === 0)) return [3 /*break*/, 2];
                                                    console.log("\u23F3 [MediaService] Aguardando ".concat(delaySeconds_2, "s antes de enviar ").concat(media.mediaType, "..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delaySeconds_2 * 1000); })];
                                                case 1:
                                                    _p.sent();
                                                    _p.label = 2;
                                                case 2:
                                                    if (!(retryCount > 0)) return [3 /*break*/, 4];
                                                    console.log("\uD83D\uDD04 [MediaService] Retry ".concat(retryCount, "/").concat(maxRetries, " para ").concat(media.name, "..."));
                                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000 * retryCount); })];
                                                case 3:
                                                    _p.sent();
                                                    _p.label = 4;
                                                case 4:
                                                    console.log("\uD83D\uDCE4 [MediaService] Enviando ".concat(media.mediaType, " \"").concat(media.name, "\" para ").concat(jid, "..."));
                                                    // Validar URL antes de enviar
                                                    if (!media.storageUrl || media.storageUrl.length < 10) {
                                                        console.error("\uD83D\uDCC1 [MediaService] \u274C URL inv\u00E1lida para m\u00EDdia ".concat(media.name, ": \"").concat(media.storageUrl, "\""));
                                                        return [2 /*return*/, "break"];
                                                    }
                                                    sendResult = { success: false };
                                                    if (!wapiConfig) return [3 /*break*/, 6];
                                                    return [4 /*yield*/, sendMediaViaWApi(wapiConfig, {
                                                            to: jid.split('@')[0],
                                                            mediaType: media.mediaType,
                                                            mediaUrl: media.storageUrl,
                                                            caption: media.mediaType !== 'audio' ? (media.caption || undefined) : undefined,
                                                            fileName: media.fileName || undefined,
                                                            isPtt: media.isPtt !== false, // PTT por padrão para áudio
                                                        })];
                                                case 5:
                                                    sendResult = _p.sent();
                                                    return [3 /*break*/, 9];
                                                case 6:
                                                    if (!socket) return [3 /*break*/, 8];
                                                    return [4 /*yield*/, sendMediaViaBaileys(socket, jid, media, userId)];
                                                case 7:
                                                    sendResult = _p.sent();
                                                    return [3 /*break*/, 9];
                                                case 8:
                                                    console.error("[MediaService] \u274C Nenhum transporte dispon\u00EDvel para enviar m\u00EDdia ".concat(media.name));
                                                    return [2 /*return*/, "break"];
                                                case 9:
                                                    if (sendResult.success) {
                                                        sendSuccess = true;
                                                        console.log("\uD83D\uDCC1 [MediaService] \u2705 M\u00CDDIA ENVIADA COM SUCESSO: ".concat(media.name));
                                                        // Registrar messageId para evitar que handleOutgoingMessage pause a IA
                                                        if (sendResult.messageId) {
                                                            (0, whatsapp_1.registerAgentMessageId)(sendResult.messageId);
                                                        }
                                                    }
                                                    else {
                                                        console.error("\uD83D\uDCC1 [MediaService] \u274C Falha ao enviar ".concat(media.name, ": ").concat(sendResult.error));
                                                        retryCount++;
                                                    }
                                                    return [3 /*break*/, 11];
                                                case 10:
                                                    error_12 = _p.sent();
                                                    console.error("\uD83D\uDCC1 [MediaService] \u274C Exce\u00E7\u00E3o ao enviar ".concat(media.name, ": ").concat(error_12.message));
                                                    retryCount++;
                                                    return [3 /*break*/, 11];
                                                case 11: return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _o.label = 26;
                                case 26:
                                    if (!(retryCount <= maxRetries && !sendSuccess)) return [3 /*break*/, 28];
                                    return [5 /*yield**/, _loop_3()];
                                case 27:
                                    state_1 = _o.sent();
                                    if (state_1 === "break")
                                        return [3 /*break*/, 28];
                                    return [3 /*break*/, 26];
                                case 28:
                                    if (!sendSuccess) {
                                        console.error("\uD83D\uDCC1 [MediaService] \u274C FALHA DEFINITIVA ap\u00F3s ".concat(maxRetries, " retries para: ").concat(media.name));
                                    }
                                    if (!(sendSuccess && conversationId)) return [3 /*break*/, 39];
                                    _o.label = 29;
                                case 29:
                                    _o.trys.push([29, 38, , 39]);
                                    transcriptionText = null;
                                    if (!(media.mediaType === 'audio')) return [3 /*break*/, 36];
                                    console.log("\uD83C\uDFA4 [MediaService] Transcrevendo \u00E1udio enviado \"".concat(media.name, "\"..."));
                                    if (!media.transcription) return [3 /*break*/, 30];
                                    transcriptionText = media.transcription;
                                    console.log("\uD83C\uDFA4 [MediaService] Usando transcri\u00E7\u00E3o existente da m\u00EDdia");
                                    return [3 /*break*/, 36];
                                case 30:
                                    _o.trys.push([30, 35, , 36]);
                                    return [4 /*yield*/, downloadMediaAsBuffer(media.storageUrl)];
                                case 31:
                                    audioBuffer = _o.sent();
                                    return [4 /*yield*/, (0, mistralClient_1.transcribeAudioWithMistral)(audioBuffer, {
                                            fileName: media.fileName || 'agent-audio.ogg',
                                        })];
                                case 32:
                                    transcriptionText = _o.sent();
                                    if (!transcriptionText) return [3 /*break*/, 34];
                                    console.log("\uD83C\uDFA4 [MediaService] \u00C1udio transcrito: \"".concat(transcriptionText.substring(0, 100), "...\""));
                                    // Atualizar a mídia com a transcrição para uso futuro
                                    return [4 /*yield*/, db_1.db
                                            .update(schema_1.agentMediaLibrary)
                                            .set({ transcription: transcriptionText, updatedAt: new Date() })
                                            .where((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.id, media.id))];
                                case 33:
                                    // Atualizar a mídia com a transcrição para uso futuro
                                    _o.sent();
                                    _o.label = 34;
                                case 34: return [3 /*break*/, 36];
                                case 35:
                                    transcribeError_1 = _o.sent();
                                    console.error("\uD83C\uDFA4 [MediaService] Erro ao transcrever \u00E1udio:", transcribeError_1);
                                    return [3 /*break*/, 36];
                                case 36:
                                    messageText = '';
                                    if (media.mediaType === 'audio') {
                                        messageText = '*Áudio*';
                                    }
                                    else if (media.mediaType === 'image') {
                                        messageText = media.caption || '*Imagem*';
                                    }
                                    else if (media.mediaType === 'video') {
                                        messageText = media.caption || '*Vídeo*';
                                    }
                                    else if (media.mediaType === 'document') {
                                        messageText = '*Documento*';
                                    }
                                    messageId = "media-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                                    return [4 /*yield*/, persistOutgoingAndBroadcast({
                                            text: messageText,
                                            messageId: messageId,
                                            isFromAgent: true,
                                            mediaType: media.mediaType,
                                            mediaUrl: media.storageUrl,
                                            mediaMimeType: media.mimeType || undefined,
                                            mediaDuration: media.durationSeconds || undefined,
                                            mediaCaption: "[MEDIA:".concat(media.name, "]"),
                                        })];
                                case 37:
                                    _o.sent();
                                    console.log("\uD83D\uDCDD [MediaService] Mensagem de m\u00EDdia salva no banco (conversationId: ".concat(conversationId, ", type: ").concat(media.mediaType, ")"));
                                    return [3 /*break*/, 39];
                                case 38:
                                    saveError_2 = _o.sent();
                                    console.error("\uD83D\uDCDD [MediaService] Erro ao salvar mensagem de m\u00EDdia:", saveError_2);
                                    return [3 /*break*/, 39];
                                case 39: 
                                // Pequeno delay entre envios para não sobrecarregar
                                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                                case 40:
                                    // Pequeno delay entre envios para não sobrecarregar
                                    _o.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _e = 0, allMediasForName_1 = allMediasForName;
                    _l.label = 7;
                case 7:
                    if (!(_e < allMediasForName_1.length)) return [3 /*break*/, 10];
                    media = allMediasForName_1[_e];
                    return [5 /*yield**/, _loop_2(media)];
                case 8:
                    _l.sent();
                    _l.label = 9;
                case 9:
                    _e++;
                    return [3 /*break*/, 7];
                case 10:
                    _b++;
                    return [3 /*break*/, 5];
                case 11:
                    console.log("\uD83D\uDCC1 [MediaService] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca TODAS as mídias que correspondem a um padrão de nome
 * Exemplo: "RESTAURANTE" retorna image/RESTAURANTE + video/RESTAURANTE + audio/RESTAURANTE
 * Se não encontrar, tenta buscar por nome exato como fallback
 */
function getMediasByNamePattern(userId, pattern) {
    return __awaiter(this, void 0, void 0, function () {
        var medias, exactMedia, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId), (0, drizzle_orm_1.or)(
                        // Match exato do name
                        (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.name, pattern), (0, 
                        // Match case-insensitive
                        drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["LOWER(", ") = LOWER(", ")"], ["LOWER(", ") = LOWER(", ")"])), schema_1.agentMediaLibrary.name, pattern))))];
                case 1:
                    medias = _a.sent();
                    if (medias.length > 0) {
                        return [2 /*return*/, medias];
                    }
                    // Se não encontrar com padrão, tenta buscar por nome exato (fallback)
                    console.warn("[MediaService] Padr\u00E3o \"".concat(pattern, "\" n\u00E3o encontrado, tentando busca exata..."));
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId), (0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.name, pattern)))
                            .limit(1)];
                case 2:
                    exactMedia = _a.sent();
                    return [2 /*return*/, exactMedia];
                case 3:
                    error_13 = _a.sent();
                    console.error("[MediaService] Erro ao buscar m\u00EDdias para padr\u00E3o \"".concat(pattern, "\":"), error_13);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
