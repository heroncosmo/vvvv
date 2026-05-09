"use strict";
/**
 * Admin Agent Tool Calling â€” Motor de decisÃ£o autÃ´nomo via LLM Tool Calling
 *
 * Substitui o sistema de stages/regex por chamadas nativas de ferramentas (Mistral).
 * O LLM decide autonomamente qual ferramenta usar com base no contexto da conversa.
 *
 * Feature flag: ADMIN_TOOL_CALLING=true
 *
 * Ferramentas disponÃ­veis:
 *   1. informar_planos   â€” Retorna tabela de planos e preÃ§os
 *   2. gerar_link_conexao â€” Gera link auto-login para conectar WhatsApp (QR Code)
 *   3. gerar_link_planos  â€” Gera link auto-login para pÃ¡gina de planos/assinatura
 *   4. editar_prompt      â€” Edita o prompt do agente IA do cliente
 *   5. salvar_midia       â€” Salva mÃ­dia na biblioteca do agente
 *   6. criar_agente       â€” Cria conta de teste + agente IA completo
 *   7. registrar_pagamento â€” Registra comprovante de pagamento PIX
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
exports.inferFlowItemsHeuristically = inferFlowItemsHeuristically;
exports.processToolCallingMessage = processToolCallingMessage;
var mistralClient_1 = require("./mistralClient");
var llm_1 = require("./llm");
var actionExecutorV2_1 = require("./actionExecutorV2");
var adminPendingActionExecutor_1 = require("./adminPendingActionExecutor");
var storage_1 = require("./storage");
var promptHistoryService_1 = require("./promptHistoryService");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var adminMediaStore_1 = require("./adminMediaStore");
var mediaService_1 = require("./mediaService");
var adminPlanPricing_1 = require("./adminPlanPricing");
var adminPendingActionExecutionPolicy_1 = require("./adminPendingActionExecutionPolicy");
var adminPendingActionPolicy_1 = require("./adminPendingActionPolicy");
var adminReplyPolicy_1 = require("./adminReplyPolicy");
function normalizeMediaFingerprint(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '_')
        .toUpperCase();
}
function extractSentAdminMediaNames(conversationHistory, mediaLibrary) {
    var sent = new Set();
    for (var _i = 0, conversationHistory_1 = conversationHistory; _i < conversationHistory_1.length; _i++) {
        var message = conversationHistory_1[_i];
        if (message.role !== 'assistant')
            continue;
        var content = String(message.content || '');
        var normalizedContent = normalizeMediaFingerprint(content);
        for (var _a = 0, mediaLibrary_1 = mediaLibrary; _a < mediaLibrary_1.length; _a++) {
            var media = mediaLibrary_1[_a];
            var normalizedName = normalizeMediaFingerprint(media.name);
            if (!normalizedName)
                continue;
            if (normalizedContent.includes(normalizedName)) {
                sent.add(normalizedName);
                continue;
            }
            if (media.storageUrl && content.includes(media.storageUrl)) {
                sent.add(normalizedName);
                continue;
            }
            var captionFingerprint = normalizeMediaFingerprint(media.caption);
            if (captionFingerprint && normalizedContent.includes(captionFingerprint)) {
                sent.add(normalizedName);
            }
        }
    }
    return Array.from(sent);
}
function shouldSkipAdminMediaSuggestion(params) {
    var normalizedMessage = normalizeComparableText(params.messageText);
    var normalizedResponse = normalizeComparableText(params.responseText);
    var source = "".concat(normalizedMessage, " ").concat(normalizedResponse);
    var mediaKeywords = ['midia', 'audio', 'video', 'imagem', 'foto', 'documento', 'arquivo'];
    var flowKeywords = ['fluxo', 'funil', 'sequencia', 'roteiro'];
    var configKeywords = ['salvar', 'cadastrar', 'configurar', 'organizar', 'montar'];
    var hasMediaIntent = mediaKeywords.some(function (keyword) { return source.includes(keyword); });
    var hasFlowIntent = flowKeywords.some(function (keyword) { return source.includes(keyword); });
    var hasConfigIntent = configKeywords.some(function (keyword) { return source.includes(keyword); });
    return hasMediaIntent && (hasFlowIntent || hasConfigIntent);
}
function resolveAdminMediaActions(params) {
    return __awaiter(this, void 0, void 0, function () {
        var tagged, mediaLibrary, activeMediaLibrary, sentMedias, forceResult, mediaData, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveMediaActionsFromResponse(params.responseText)];
                case 1:
                    tagged = _c.sent();
                    if ((_b = tagged.mediaActions) === null || _b === void 0 ? void 0 : _b.length) {
                        return [2 /*return*/, tagged];
                    }
                    if (shouldSkipAdminMediaSuggestion({
                        messageText: params.messageText,
                        responseText: tagged.responseText,
                    })) {
                        return [2 /*return*/, tagged];
                    }
                    return [4 /*yield*/, (0, adminMediaStore_1.getAdminMediaList)(undefined)];
                case 2:
                    mediaLibrary = _c.sent();
                    activeMediaLibrary = mediaLibrary.filter(function (media) { return media.isActive !== false; });
                    if (!activeMediaLibrary.length) {
                        return [2 /*return*/, tagged];
                    }
                    sentMedias = extractSentAdminMediaNames(params.conversationHistory, activeMediaLibrary);
                    return [4 /*yield*/, (0, mediaService_1.forceMediaDetection)(params.messageText, params.conversationHistory.map(function (item) { return ({
                            text: item.content,
                            fromMe: item.role === 'assistant',
                        }); }), activeMediaLibrary.map(function (media) { return ({
                            id: media.id,
                            userId: media.adminId,
                            name: media.name,
                            mediaType: media.mediaType,
                            type: media.mediaType,
                            storageUrl: media.storageUrl,
                            fileName: media.fileName || null,
                            fileSize: media.fileSize || null,
                            mimeType: media.mimeType || null,
                            durationSeconds: media.durationSeconds || null,
                            description: media.description,
                            whenToUse: media.whenToUse || null,
                            caption: media.caption || null,
                            transcription: media.transcription || null,
                            isActive: media.isActive,
                            sendAlone: media.sendAlone,
                            displayOrder: media.displayOrder,
                            createdAt: new Date(media.createdAt),
                            updatedAt: new Date(media.createdAt),
                        }); }), sentMedias, tagged.responseText)];
                case 3:
                    forceResult = _c.sent();
                    if (!forceResult.shouldSendMedia || !forceResult.mediaToSend) {
                        return [2 /*return*/, tagged];
                    }
                    _a = activeMediaLibrary.find(function (media) { var _a; return normalizeMediaFingerprint(media.name) === normalizeMediaFingerprint((_a = forceResult.mediaToSend) === null || _a === void 0 ? void 0 : _a.name); });
                    if (_a) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, adminMediaStore_1.getAdminMediaByName)(undefined, forceResult.mediaToSend.name)];
                case 4:
                    _a = (_c.sent());
                    _c.label = 5;
                case 5:
                    mediaData = _a;
                    if (!mediaData) {
                        return [2 /*return*/, tagged];
                    }
                    console.log("[ToolCalling] Midia selecionada por classificacao secundaria: ".concat(mediaData.name, " | motivo=").concat(forceResult.reason));
                    return [2 /*return*/, {
                            responseText: tagged.responseText,
                            mediaActions: [
                                {
                                    type: 'send_media',
                                    media_name: mediaData.name,
                                    mediaData: mediaData,
                                },
                            ],
                        }];
            }
        });
    });
}
function resolveMediaActionsFromResponse(responseText) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, cleanText, mediaActions, resolvedMediaActions, _i, mediaActions_1, action, mediaData;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = (0, adminMediaStore_1.parseAdminMediaTags)(String(responseText || '')), cleanText = _a.cleanText, mediaActions = _a.mediaActions;
                    if (!mediaActions.length) {
                        return [2 /*return*/, { responseText: cleanText }];
                    }
                    resolvedMediaActions = [];
                    _i = 0, mediaActions_1 = mediaActions;
                    _b.label = 1;
                case 1:
                    if (!(_i < mediaActions_1.length)) return [3 /*break*/, 4];
                    action = mediaActions_1[_i];
                    return [4 /*yield*/, (0, adminMediaStore_1.getAdminMediaByName)(undefined, action.media_name)];
                case 2:
                    mediaData = _b.sent();
                    if (!mediaData)
                        return [3 /*break*/, 3];
                    resolvedMediaActions.push({
                        type: 'send_media',
                        media_name: action.media_name,
                        mediaData: mediaData,
                    });
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, {
                        responseText: cleanText,
                        mediaActions: resolvedMediaActions.length > 0 ? resolvedMediaActions : undefined,
                    }];
            }
        });
    });
}
function normalizeShortReply(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[.!?]+$/g, '')
        .replace(/\s+/g, ' ');
}
function extractSimulatorUrlFromText(text) {
    var tokens = String(text || '')
        .split(/\s+/)
        .map(function (token) { return token.trim(); })
        .filter(Boolean);
    var match = tokens.find(function (token) { return token.includes('/test/'); });
    return match || null;
}
function summarizeRecentMediaBuffer(recentMediaBuffer) {
    var items = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];
    if (!items.length)
        return '';
    var lines = items.map(function (item, index) {
        var details = [
            "tipo=".concat(item.type),
            item.summary ? "resumo=".concat(item.summary) : '',
            item.description ? "descricao=".concat(item.description) : '',
        ].filter(Boolean);
        return "".concat(index + 1, ". ").concat(details.join('; '));
    });
    return "\nArquivos recentes disponiveis para montar fluxo de midias:\n".concat(lines.join('\n'));
}
function normalizeFlowItemsFromArgs(flowItems, recentMediaBuffer) {
    if (!Array.isArray(flowItems))
        return [];
    var recentItems = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];
    return flowItems
        .map(function (rawItem, index) {
        var item = rawItem && typeof rawItem === 'object' ? __assign({}, rawItem) : {};
        var type = String(item.type || '').trim().toLowerCase();
        if (type === 'text') {
            var text = String(item.text || '').trim();
            if (!text)
                return null;
            return {
                id: String(item.id || "flow-text-".concat(index)),
                order: index,
                type: 'text',
                text: text,
            };
        }
        if (type !== 'media')
            return null;
        var recentMediaIndex = Number(item.recentMediaIndex);
        var fromRecent = Number.isInteger(recentMediaIndex) &&
            recentMediaIndex >= 1 &&
            recentMediaIndex <= recentItems.length
            ? recentItems[recentMediaIndex - 1]
            : undefined;
        var storageUrl = String(item.storageUrl || item.mediaUrl || (fromRecent === null || fromRecent === void 0 ? void 0 : fromRecent.url) || '').trim();
        var mediaType = String(item.mediaType || (fromRecent === null || fromRecent === void 0 ? void 0 : fromRecent.type) || '').trim();
        if (!storageUrl || !mediaType)
            return null;
        return {
            id: String(item.id || (fromRecent === null || fromRecent === void 0 ? void 0 : fromRecent.id) || "flow-media-".concat(index)),
            order: index,
            type: 'media',
            storageUrl: storageUrl,
            mediaType: mediaType,
            caption: String(item.caption || '').trim() || undefined,
            fileName: String(item.fileName || '').trim() || undefined,
            mimeType: String(item.mimeType || '').trim() || undefined,
        };
    })
        .filter(function (item) { return Boolean(item); });
}
function summarizeFlowItemsForConfirmation(flowItems) {
    return flowItems
        .map(function (item, index) {
        if (item.type === 'text') {
            return "".concat(index + 1, ". Texto: ").concat(String(item.text || '').trim());
        }
        var mediaLabel = String(item.mediaType || 'midia').trim();
        var caption = String(item.caption || '').trim();
        return "".concat(index + 1, ". Midia ").concat(mediaLabel).concat(caption ? " (".concat(caption, ")") : '');
    })
        .join('\n');
}
function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
function extractQuotedTexts(value) {
    var source = String(value || '');
    var results = [];
    var quoteChars = ["'", "\""];
    for (var _i = 0, quoteChars_1 = quoteChars; _i < quoteChars_1.length; _i++) {
        var quoteChar = quoteChars_1[_i];
        var cursor = 0;
        while (cursor < source.length) {
            var start = source.indexOf(quoteChar, cursor);
            if (start === -1)
                break;
            var end = source.indexOf(quoteChar, start + 1);
            if (end === -1)
                break;
            var text = source.slice(start + 1, end).trim();
            if (text) {
                results.push({ text: text, index: start });
            }
            cursor = end + 1;
        }
    }
    return results.sort(function (a, b) { return a.index - b.index; });
}
function collectMediaMentions(messageText, recentMediaBuffer) {
    var normalizedMessage = normalizeComparableText(messageText);
    var recentItems = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];
    var mentions = [];
    var usedIds = new Set();
    var typeHints = {
        audio: ['audio', 'audios'],
        video: ['video', 'videos'],
        image: ['imagem', 'imagens', 'foto', 'fotos'],
        document: ['documento', 'documentos', 'arquivo', 'arquivos', 'pdf'],
    };
    var _loop_1 = function (mediaType) {
        var candidates = recentItems.filter(function (item) { return item.type === mediaType; });
        if (!candidates.length)
            return "continue";
        var searchFrom = 0;
        for (var _b = 0, _c = typeHints[mediaType]; _b < _c.length; _b++) {
            var hint = _c[_b];
            var position = normalizedMessage.indexOf(hint, searchFrom);
            while (position !== -1) {
                var candidate = candidates.find(function (item) { return !usedIds.has(item.id); });
                if (!candidate)
                    break;
                mentions.push({ index: position, item: candidate });
                usedIds.add(candidate.id);
                searchFrom = position + hint.length;
                position = normalizedMessage.indexOf(hint, searchFrom);
            }
        }
    };
    for (var _i = 0, _a = ['audio', 'video', 'image', 'document']; _i < _a.length; _i++) {
        var mediaType = _a[_i];
        _loop_1(mediaType);
    }
    if (!mentions.length) {
        var genericHints = ['essa midia', 'esse arquivo', 'essa imagem', 'esse audio', 'esse video'];
        var genericMention = genericHints
            .map(function (hint) { return ({ hint: hint, index: normalizedMessage.indexOf(hint) }); })
            .filter(function (item) { return item.index >= 0; })
            .sort(function (a, b) { return a.index - b.index; })[0];
        if (genericMention && recentItems.length) {
            mentions.push({ index: genericMention.index, item: recentItems[0] });
        }
    }
    return mentions.sort(function (a, b) { return a.index - b.index; });
}
function inferFlowItemsHeuristically(params) {
    var messageText = String(params.messageText || '').trim();
    var recentMediaBuffer = Array.isArray(params.recentMediaBuffer) ? params.recentMediaBuffer.slice(-6) : [];
    if (!messageText || recentMediaBuffer.length === 0)
        return [];
    var timeline = [];
    for (var _i = 0, _a = extractQuotedTexts(messageText); _i < _a.length; _i++) {
        var quotedText = _a[_i];
        timeline.push({
            index: quotedText.index,
            item: {
                type: 'text',
                text: quotedText.text,
            },
        });
    }
    var _loop_2 = function (mention) {
        timeline.push({
            index: mention.index,
            item: {
                type: 'media',
                recentMediaIndex: recentMediaBuffer.findIndex(function (item) { return item.id === mention.item.id; }) + 1,
                mediaType: mention.item.type,
            },
        });
    };
    for (var _b = 0, _c = collectMediaMentions(messageText, recentMediaBuffer); _b < _c.length; _b++) {
        var mention = _c[_b];
        _loop_2(mention);
    }
    if (timeline.length < 2) {
        return [];
    }
    var ordered = timeline
        .sort(function (a, b) { return a.index - b.index; })
        .map(function (entry) { return entry.item; });
    return normalizeFlowItemsFromArgs(ordered, recentMediaBuffer);
}
function inferFlowItemsFromMessage(params) {
    return __awaiter(this, void 0, void 0, function () {
        var messageText, recentMediaBuffer, heuristicItems, mediaContext, prompt, response, rawText, jsonText, parsed, error_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    messageText = String(params.messageText || '').trim();
                    recentMediaBuffer = Array.isArray(params.recentMediaBuffer) ? params.recentMediaBuffer.slice(-6) : [];
                    if (!messageText || recentMediaBuffer.length === 0)
                        return [2 /*return*/, []];
                    heuristicItems = inferFlowItemsHeuristically({ messageText: messageText, recentMediaBuffer: recentMediaBuffer });
                    if (heuristicItems.length >= 2) {
                        return [2 /*return*/, heuristicItems];
                    }
                    mediaContext = recentMediaBuffer
                        .map(function (item, index) { return "".concat(index + 1, ". tipo=").concat(item.type, "; descricao=").concat(item.description || item.summary || 'sem descricao'); })
                        .join('\n');
                    prompt = "Voce recebe o pedido de um cliente para cadastrar um fluxo de midias no agente.\n\nPedido do cliente:\n".concat(messageText, "\n\nArquivos recentes disponiveis:\n").concat(mediaContext, "\n\nMonte a sequencia do fluxo em ordem.\n\nRegras:\n- Use SOMENTE os arquivos recentes disponiveis.\n- Para item de texto, retorne { \"type\": \"text\", \"text\": \"...\" }.\n- Para item de midia, retorne { \"type\": \"media\", \"recentMediaIndex\": N, \"mediaType\": \"audio|image|video|document\", \"caption\": \"...\" }.\n- Se o cliente citar \"primeiro\", \"depois\", \"em seguida\", respeite a ordem.\n- Se houver um texto literal entre aspas, preserve esse texto.\n- Nao invente itens que o cliente nao pediu.\n- Se nao der para montar pelo menos 2 itens, retorne array vazio.\n\nResponda SOMENTE com JSON valido:\n{\"flowItems\":[...]} ");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.race([
                            (0, llm_1.chatComplete)({
                                messages: [{ role: 'system', content: prompt }],
                                maxTokens: 400,
                                temperature: 0.1,
                                skipMistralQueue: true,
                            }),
                            new Promise(function (_, reject) {
                                return setTimeout(function () { return reject(new Error('timeout_infer_flow_items')); }, 8000);
                            }),
                        ])];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, []];
                    parsed = JSON.parse(jsonText);
                    return [2 /*return*/, Array.isArray(parsed.flowItems) ? parsed.flowItems : []];
                case 3:
                    error_1 = _d.sent();
                    console.warn('[ToolCalling] Falha ao inferir flowItems da mensagem:', error_1);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function extractPanelUrlFromText(text) {
    var tokens = String(text || '')
        .split(/\s+/)
        .map(function (token) { return token.trim(); })
        .filter(Boolean);
    var match = tokens.find(function (token) {
        return token.includes('agentezap.online') &&
            !token.includes('/test/') &&
            !token.includes('/plans') &&
            !token.includes('/conexao');
    });
    return match || null;
}
function normalizeCreateAgentDeliveryText(text) {
    var simulatorUrl = extractSimulatorUrlFromText(text);
    if (!simulatorUrl) {
        return (0, adminReplyPolicy_1.clampAdminReplyLength)(String(text || '').trim());
    }
    var panelUrl = extractPanelUrlFromText(text);
    var finalPanelUrl = panelUrl || 'https://agentezap.online/meu-agente-ia';
    return (0, adminReplyPolicy_1.clampAdminReplyLength)("Criei seu teste.\n\nTeste: ".concat(simulatorUrl, "\n\n").concat((0, adminReplyPolicy_1.buildAdminPanelPitch)(finalPanelUrl), "\n\nAbre o teste e me fala se voc\u00EA quer assinar ou j\u00E1 conectar o seu WhatsApp."));
}
function normalizeSimulatorLinkDeliveryText(text) {
    var simulatorUrl = extractSimulatorUrlFromText(text);
    if (!simulatorUrl) {
        return (0, adminReplyPolicy_1.clampAdminReplyLength)(String(text || '').trim());
    }
    var panelUrl = extractPanelUrlFromText(text);
    var finalPanelUrl = panelUrl || 'https://agentezap.online/meu-agente-ia';
    return (0, adminReplyPolicy_1.clampAdminReplyLength)("Aqui est\u00E1 seu teste.\n\nTeste: ".concat(simulatorUrl, "\n\n").concat((0, adminReplyPolicy_1.buildAdminPanelPitch)(finalPanelUrl), "\n\nAbre o teste e me fala se voc\u00EA quer assinar ou conectar o seu WhatsApp."));
}
function normalizeActionExecutionResponseText(pendingAction, text) {
    if (pendingAction.type === 'criar_agente') {
        return normalizeCreateAgentDeliveryText(text);
    }
    return String(text || '').trim();
}
function buildPendingActionClarificationReply(toolName) {
    switch (toolName) {
        case 'editar_prompt':
            return 'Perfeito. Me diz em uma frase o que você quer mudar no agente que eu monto a proposta por aqui.';
        case 'salvar_midia':
            return 'Perfeito. Me confirma só o nome da mídia e quando ela deve ser enviada que eu sigo por aqui.';
        case 'registrar_pagamento':
            return 'Perfeito. Me confirma se esse arquivo é o comprovante do pagamento para eu passar ao setor responsável.';
        default:
            return 'Perfeito. Me passa o detalhe que falta e eu sigo por aqui.';
    }
}
function executePendingActionWithSilentRetry(params) {
    return __awaiter(this, void 0, void 0, function () {
        var pendingAction, executionUserId, result, lastFailureText, policy, refreshedPendingAction;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pendingAction = params.pendingAction, executionUserId = params.executionUserId;
                    return [4 /*yield*/, (0, adminPendingActionExecutor_1.executeActionWithTechnicalRetry)(pendingAction, executionUserId)];
                case 1:
                    result = _a.sent();
                    if (result.success) {
                        return [2 /*return*/, {
                                ok: true,
                                responseText: normalizeActionExecutionResponseText(pendingAction, result.responseText),
                                consumedPendingMedia: pendingAction.type === 'save_media' ? true : undefined,
                            }];
                    }
                    lastFailureText = String(result.responseText || '').trim();
                    if (!result.lastFailureWasTechnical) {
                        return [2 /*return*/, {
                                ok: false,
                                responseText: lastFailureText || (0, adminPendingActionExecutionPolicy_1.buildPendingActionRecoveryReply)(pendingAction.type),
                            }];
                    }
                    policy = (0, adminPendingActionExecutionPolicy_1.getPendingActionExecutionPolicy)(pendingAction.type);
                    refreshedPendingAction = __assign(__assign({}, pendingAction), { expiresAt: Date.now() + policy.keepPendingAliveMs });
                    console.warn("[ToolCalling] PendingAction ".concat(pendingAction.type, " continua pendente ap\u00F3s retries silenciosos. \u00DAltima falha: ").concat(lastFailureText || 'sem detalhe'));
                    return [2 /*return*/, {
                            ok: false,
                            responseText: (0, adminPendingActionExecutionPolicy_1.buildPendingActionRecoveryReply)(pendingAction.type),
                            keepPendingAction: refreshedPendingAction,
                        }];
            }
        });
    });
}
function conversationHistoryHasSimulatorLink(conversationHistory) {
    return conversationHistory.some(function (item) {
        return item.role === 'assistant' &&
            /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i.test(String(item.content || ''));
    });
}
function shouldRescueSimulatorLinkWithLLM(params) {
    return __awaiter(this, void 0, void 0, function () {
        var messageText, conversationHistory, pendingAction, cleanMessage, historySummary, prompt, response, rawText, jsonText, parsed, error_2;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    messageText = params.messageText, conversationHistory = params.conversationHistory, pendingAction = params.pendingAction;
                    cleanMessage = String(messageText || '').trim();
                    if (!cleanMessage)
                        return [2 /*return*/, false];
                    historySummary = conversationHistory
                        .slice(-8)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    prompt = "Voc\u00EA analisa se o cliente est\u00E1 cobrando, pedindo ou retomando o LINK DE TESTE/SIMULADOR ap\u00F3s uma cria\u00E7\u00E3o j\u00E1 conclu\u00EDda.\n\nA\u00E7\u00E3o pendente:\n- tipo: ".concat(pendingAction.type, "\n- proposta anterior: ").concat(pendingAction.proposedText || 'não informada', "\n\nConversa recente:\n").concat(historySummary || 'sem histórico', "\n\nMensagem atual:\n").concat(cleanMessage, "\n\nResponda SOMENTE com JSON v\u00E1lido:\n{\"rescue\":true}\nou\n{\"rescue\":false}\n\nUse rescue=true quando a mensagem significar algo como:\n- pedir o link de teste\n- cobrar \"cad\u00EA o link\"\n- dizer que quer testar agora\n- pedir acesso ao simulador\n- responder de forma curta depois da cria\u00E7\u00E3o indicando que quer abrir/ver o teste\n\nUse rescue=false quando:\n- o cliente estiver cancelando\n- trouxer uma nova instru\u00E7\u00E3o que muda a cria\u00E7\u00E3o\n- fizer uma pergunta que n\u00E3o seja sobre abrir/ver o teste agora");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: prompt }],
                            maxTokens: 80,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, false];
                    parsed = JSON.parse(jsonText);
                    return [2 /*return*/, parsed.rescue === true];
                case 3:
                    error_2 = _d.sent();
                    console.warn('[ToolCalling] Falha ao classificar resgate de link do simulador:', error_2);
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function isExplicitPendingConfirmationReply(messageText, pendingAction) {
    var normalized = normalizeShortReply(messageText);
    if (!normalized)
        return false;
    if ([
        'nao',
        'não',
        'cancel',
        'deixa',
        'esquece',
        'melhor nao',
        'melhor não',
    ].some(function (fragment) { return normalized.includes(fragment); })) {
        return false;
    }
    var confirmationReplies = new Set([
        'sim',
        's',
        'ok',
        'okay',
        'pode',
        'pode sim',
        'isso',
        'isso mesmo',
        'exato',
        'correto',
        'certo',
        'perfeito',
        'fechou',
        'bora',
        'vamos',
        'confirmo',
        'confirma',
        'prosseguir',
        'pode prosseguir',
        'pode seguir',
        'segue',
        'seguir',
    ]);
    if (confirmationReplies.has(normalized)) {
        return true;
    }
    if ([
        'confirmo',
        'pode prosseguir',
        'pode seguir',
        'pode continuar',
        'pode salvar',
        'pode cadastrar',
        'pode inserir',
        'segue com',
        'prossegue com',
        'combinado',
    ].some(function (fragment) { return normalized.includes(fragment); })) {
        return true;
    }
    if (pendingAction.type === 'criar_agente' &&
        (normalized === 'cria' || normalized === 'criar' || normalized === 'quero')) {
        return true;
    }
    return false;
}
function isExplicitPendingCancelReply(messageText) {
    var normalized = normalizeShortReply(messageText);
    if (!normalized)
        return false;
    var cancelReplies = new Set([
        'nao',
        'não',
        'cancelar',
        'cancela',
        'deixa',
        'deixa quieto',
        'deixa pra la',
        'deixa para la',
        'esquece',
        'melhor nao',
        'melhor não',
        'pare',
        'para',
    ]);
    if (cancelReplies.has(normalized)) {
        return true;
    }
    return [
        'nao quero',
        'não quero',
        'deixa pra la',
        'deixa para la',
        'pode parar',
        'cancela isso',
    ].some(function (fragment) { return normalized.includes(fragment); });
}
function buildHumanFallbackReply(params) {
    var messageText = params.messageText, userId = params.userId, pendingAction = params.pendingAction, conversationHistory = params.conversationHistory;
    if (pendingAction === null || pendingAction === void 0 ? void 0 : pendingAction.proposedText) {
        return pendingAction.proposedText;
    }
    var trimmed = String(messageText || '').trim();
    if (!trimmed) {
        return 'Me fala em uma frase o que você quer colocar para rodar no WhatsApp que eu sigo por aqui.';
    }
    if (userId) {
        if (conversationHistoryHasSimulatorLink(conversationHistory)) {
            return 'Tive uma instabilidade rápida aqui. Me diz se você quer testar o agente ou ajustar alguma parte dele que eu continuo daqui.';
        }
        return 'Tive uma instabilidade rápida aqui. Me diz em uma frase o que você quer ajustar que eu sigo por aqui.';
    }
    var lines = trimmed
        .split(/\n+/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);
    if (lines.length >= 2) {
        var company = lines[0];
        var focus_1 = lines.slice(1, 3).join(', ');
        return "Entendi. Seu foco \u00E9 ".concat(company).concat(focus_1 ? ", com ".concat(focus_1) : '', ". Se for isso mesmo, eu monto seu teste e te entrego pronto. Posso prosseguir?");
    }
    return 'Entendi. Me confirma só o nome do negócio e o que você quer colocar para rodar no WhatsApp que eu sigo por aqui.';
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tool Definitions (Mistral Function Calling format)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'informar_planos',
            description: 'Retorna a tabela de planos disponÃ­veis do AgenteZap com preÃ§os e recursos. Use quando o cliente perguntar sobre preÃ§os, planos, quanto custa, assinatura, etc.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'gerar_link_conexao',
            description: 'Gera um link de auto-login direto para a pÃ¡gina de conexÃ£o do WhatsApp (QR Code). Use quando o cliente quiser conectar o WhatsApp, escanear QR Code, parear nÃºmero, etc.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'gerar_link_planos',
            description: 'Gera um link de auto-login direto para a pÃ¡gina de planos/assinatura. Use quando o cliente quiser assinar, ativar um plano, pagar, ou pedir o link de assinatura. O cliente clica e jÃ¡ entra logado na pÃ¡gina de planos.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'editar_prompt',
            description: 'Edita/calibra o prompt do agente IA do cliente com base numa instruÃ§Ã£o de mudanÃ§a. Use quando o cliente pedir para mudar comportamento, tom, adicionar instruÃ§Ãµes, etc.',
            parameters: {
                type: 'object',
                properties: {
                    descricaoMudanca: {
                        type: 'string',
                        description: 'DescriÃ§Ã£o detalhada da mudanÃ§a desejada no prompt do agente.',
                    },
                },
                required: ['descricaoMudanca'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'salvar_midia',
            description: 'Salva uma mÃ­dia simples OU um fluxo de mÃ­dias/textos na biblioteca do agente para uso automÃ¡tico. Use somente quando o cliente pedir explicitamente para cadastrar ou usar esse arquivo/fluxo no agente e informar quando ele deve ser enviado.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome descritivo da mÃ­dia (ex: "CardÃ¡pio", "Foto da loja").',
                    },
                    mediaUrl: {
                        type: 'string',
                        description: 'URL da mÃ­dia enviada pelo cliente.',
                    },
                    mediaType: {
                        type: 'string',
                        description: 'Tipo da mÃ­dia: image, video, audio, document ou flow. Use flow quando o cliente quiser uma sequencia/funil com varias midias e textos.',
                    },
                    whenToUse: {
                        type: 'string',
                        description: 'Contexto de quando o agente deve usar essa mÃ­dia (ex: "quando pedirem cardÃ¡pio").',
                    },
                    description: {
                        type: 'string',
                        description: 'DescriÃ§Ã£o breve da mÃ­dia.',
                    },
                    flowItems: {
                        type: 'array',
                        description: 'Somente para mediaType=flow. Sequencia ordenada do funil. Cada item pode ser texto ({type:"text", text:"..."}) ou midia ({type:"media", recentMediaIndex:1, mediaType:"audio", caption:"..."}). recentMediaIndex referencia um dos arquivos recentes listados no contexto.',
                        items: {
                            type: 'object',
                            properties: {
                                type: { type: 'string' },
                                text: { type: 'string' },
                                recentMediaIndex: { type: 'number' },
                                mediaUrl: { type: 'string' },
                                storageUrl: { type: 'string' },
                                mediaType: { type: 'string' },
                                caption: { type: 'string' },
                                fileName: { type: 'string' },
                                mimeType: { type: 'string' },
                            },
                            required: ['type'],
                        },
                    },
                },
                required: ['name', 'whenToUse'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'criar_agente',
            description: 'Cria uma conta de teste gratuita com um agente IA personalizado para o negÃ³cio do cliente. Use quando jÃ¡ tiver informaÃ§Ãµes suficientes sobre o negÃ³cio (nome da empresa, tipo de atendimento) e o cliente quiser testar ou criar o agente. TambÃ©m use quando o cliente disser que quer experimentar, testar, criar seu agente, etc.',
            parameters: {
                type: 'object',
                properties: {
                    nomeEmpresa: {
                        type: 'string',
                        description: 'Nome da empresa/negÃ³cio do cliente.',
                    },
                    ramoAtuacao: {
                        type: 'string',
                        description: 'Ramo de atuaÃ§Ã£o (ex: pizzaria, barbearia, loja de roupas, clÃ­nica).',
                    },
                    descricaoAtendimento: {
                        type: 'string',
                        description: 'Como o agente deve se comportar, o que deve responder, tom de voz, etc.',
                    },
                },
                required: ['nomeEmpresa'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'registrar_pagamento',
            description: 'Prepara o registro oficial no sistema de um comprovante de pagamento PIX enviado neste chat e faz ele aparecer em /admin#receipts depois da confirmacao final do cliente. Use SOMENTE quando o cliente realmente anexar o comprovante por aqui (imagem ou PDF). Se o cliente apenas disser que pagou, sem anexo, nao use esta ferramenta.',
            parameters: {
                type: 'object',
                properties: {
                    comprovanteUrl: {
                        type: 'string',
                        description: 'URL do comprovante enviado pelo cliente neste chat, de preferencia imagem ou PDF.',
                    },
                    valorInformado: {
                        type: 'string',
                        description: 'Valor informado pelo cliente (se mencionado).',
                    },
                    planoEscolhido: {
                        type: 'string',
                        description: 'Plano escolhido pelo cliente (starter, pro, business).',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'gerar_link_simulador',
            description: 'Gera o link do simulador de teste do agente IA do cliente. Use quando o cliente pedir para testar o agente, ver o simulador, link de teste, ou quiser experimentar como o agente atende. O link abre o simulador onde o cliente pode conversar com o agente como se fosse um cliente real dele.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
];
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// System Prompt
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildToolCallingSystemPrompt(phoneNumber, userId, contextInfo) {
    var _a;
    var isExistingClient = Boolean(userId);
    var normalizedAccountStatus = (contextInfo.accountStatus || '').toLowerCase();
    var firstName = (contextInfo.contactName || '').trim().split(/\s+/)[0] || '';
    var hasActiveSubscription = normalizedAccountStatus.includes('(ativo)') ||
        normalizedAccountStatus.includes('plano ativo') ||
        normalizedAccountStatus.includes('assinatura ativa');
    var accountCtx = contextInfo.accountStatus
        ? "\nStatus da conta: ".concat(contextInfo.accountStatus)
        : '\nCliente ainda nÃ£o tem conta (novo lead).';
    var promptCtx = contextInfo.promptSummary
        ? "\nPrompt do agente: ".concat(contextInfo.promptSummary)
        : '';
    var mediaLibCtx = contextInfo.mediaLibrarySummary
        ? "\nBiblioteca de m\u00C3\u00ADdia: ".concat(contextInfo.mediaLibrarySummary)
        : '';
    var mediaPromptCtx = contextInfo.mediaPromptBlock
        ? "\n".concat(contextInfo.mediaPromptBlock)
        : '';
    var companyCtx = ((_a = contextInfo.agentConfig) === null || _a === void 0 ? void 0 : _a.company)
        ? "\nEmpresa do cliente: ".concat(contextInfo.agentConfig.company)
        : '';
    var contactCtx = firstName
        ? "\nNome do cliente no WhatsApp: ".concat(firstName)
        : '';
    var pendingMediaCtx = contextInfo.pendingMedia
        ? "\nArquivo recente dispon\u00C3\u00ADvel no contexto: tipo=".concat(contextInfo.pendingMedia.type, "; descri\u00C3\u00A7\u00C3\u00A3o=").concat(contextInfo.pendingMedia.description || 'nÃ£o informada', "; contexto sugerido=").concat(contextInfo.pendingMedia.whenCandidate || 'ainda nÃ£o definido', ". Use essa URL interna na ferramenta salvar_midia SOMENTE se o cliente pedir explicitamente para cadastrar ou usar esse arquivo no agente. Caso contr\u00C3\u00A1rio, ignore esse arquivo e siga a conversa normal.")
        : '';
    var recentMediaCtx = summarizeRecentMediaBuffer(contextInfo.recentMediaBuffer);
    var deliveredTestCtx = contextInfo.hasDeliveredTestLink
        ? '\nHistorico recente: este cliente ja recebeu link de teste/simulador nesta conversa.'
        : '';
    var clientTypeInstructions = isExistingClient
        ? "\nCLIENTE EXISTENTE (j\u00C3\u00A1 tem conta):\n- Este cliente J\u00C3\u0081 tem conta e agente criado. NUNCA ofere\u00C3\u00A7a ou use criar_agente.\n- Foco: ajudar com configura\u00C3\u00A7\u00C3\u00A3o, edi\u00C3\u00A7\u00C3\u00A3o de prompt, cadastro de m\u00C3\u00ADdias, planos e conex\u00C3\u00A3o do WhatsApp.\n- ".concat(hasActiveSubscription
            ? 'Este cliente JÃ tem plano ativo. NÃƒO ofereÃ§a assinatura, pagamento, preÃ§o ou link de planos por iniciativa prÃ³pria. SÃ³ fale de plano se ele pedir explicitamente sobre cobranÃ§a, renovaÃ§Ã£o, upgrade, pagamento, comprovante ou outro tema comercial.'
            : 'Se ele pedir ou demonstrar intenÃ§Ã£o clara de assinar, pagar, renovar ou ver preÃ§os, use gerar_link_planos para enviar o link com auto-login.', "\n- Se ele pedir mudan\u00C3\u00A7as no agente, use editar_prompt diretamente.\n- Se quiser assinar um plano, use gerar_link_planos para enviar o link com auto-login.\n- Se quiser conectar o WhatsApp, use gerar_link_conexao.\n- Ap\u00C3\u00B3s editar o prompt, sempre informe o link do simulador para testar as mudan\u00C3\u00A7as.\n- Se o cliente pedir para testar o agente ou pedir o link do simulador, use gerar_link_simulador.")
        : "\nCLIENTE NOVO (sem conta):\n- Este \u00C3\u00A9 um lead novo. Apresente-se brevemente como Rodrigo, Inteligencia Artificial da AgenteZap.\n- Se houver nome no WhatsApp, use esse nome com naturalidade logo na primeira resposta.\n- Primeiro entenda a d\u00C3\u00BAvida, interesse ou contexto do cliente. S\u00C3\u00B3 depois conduza para a cria\u00C3\u00A7\u00C3\u00A3o do teste.\n- Fale de forma curta, humana e f\u00C3\u00A1cil de entender. Evite texto longo explicando a plataforma inteira logo de sa\u00C3\u00ADda.\n- A primeira resposta deve seguir esta linha: \"Boa tarde, tudo bem, Rafael? Rodrigo da AgenteZAP aqui. Me conta: o que voc\u00EA faz hoje? Vendas, atendimento ou qualifica\u00E7\u00E3o?\" Se n\u00E3o houver nome, fale sem nome.\n- NUNCA invente nome. Use o nome somente se ele estiver no contexto real do WhatsApp. Sem nome no contexto, fale sem nome.\n- NUNCA use placeholder em resposta final, como NOME_DO_CLIENTE, [seu nome] ou equivalente.\n- Mesmo que a mensagem inicial venha falando de R$49, interesse no an\u00FAncio ou pedido gen\u00E9rico de informa\u00E7\u00E3o, a abertura continua curta e focada em entender o neg\u00F3cio dele. N\u00E3o puxe pre\u00E7o logo na primeira resposta.\n- A segunda resposta deve ser curta e mais vendedora: primeiro mostre o principal beneficio para o ramo do cliente em linguagem simples, depois diga que no sistema ele encontra CRM, conversas, kanban, notificador inteligente, follow-up, fluxos e conexao do WhatsApp. Em seguida diga que ele pode ver tudo em https://agentezap.online/ ou testar direto por um link real. So fale em configuracao assistida se o cliente pedir isso explicitamente. Feche com uma pergunta curta para avancar no sistema, como testar agora ou conhecer por dentro.\n- A segunda resposta nao deve usar lista, bullets ou menu. Use no maximo 2 ou 3 frases curtas.\n- Se o cliente preferir criar sozinho, informe de forma objetiva o site: https://agentezap.online/\n- Se o cliente ja tiver conta e pedir para ele mesmo ajustar, editar, configurar ou arrumar, responda de forma curta com o painel em https://agentezap.online/meu-agente-ia e diga que voce tambem pode continuar ajudando por aqui.\n- Na primeira resposta, seja curto: no maximo 2 frases curtas e uma pergunta simples.\n- Se o cliente mandar \"teste\" ou \"quero testar\", interprete como desejo de ver funcionando na pratica, e nao como piada ou meta-comentario.\n- S\u00C3\u00B3 proponha a cria\u00C3\u00A7\u00C3\u00A3o do agente quando houver interesse claro em testar, configurar ou criar. Se o cliente apenas disser o que faz, continue a conversa e explique rapidamente como o teste ajuda. Nunca crie conta s\u00C3\u00B3 porque j\u00C3\u00A1 tem dados suficientes.\n- N\u00C3\u00A3o pe\u00C3\u00A7a informa\u00C3\u00A7\u00C3\u00B5es demais: o m\u00C3\u00ADnimo \u00C3\u00A9 o nome da empresa. Ramo e descri\u00C3\u00A7\u00C3\u00A3o entram conforme a conversa evoluir.";
    return "Voc\u00C3\u00AA \u00C3\u00A9 o Rodrigo, Inteligencia Artificial da AgenteZap, uma plataforma que permite criar agentes de IA para atendimento via WhatsApp.\n\nSeu papel:\n- Receber leads interessados em automa\u00C3\u00A7\u00C3\u00A3o de atendimento\n- Entender o neg\u00C3\u00B3cio do cliente (nome, ramo, como quer que o agente atenda)\n- Quando tiver informa\u00C3\u00A7\u00C3\u00B5es suficientes, usar a ferramenta criar_agente para gerar uma conta de teste gratuita\n- Ajudar clientes ativos a configurar e calibrar seu agente\n- Responder d\u00C3\u00BAvidas sobre planos e pre\u00C3\u00A7os\n- Enviar links com auto-login para assinar plano (gerar_link_planos) e conectar WhatsApp (gerar_link_conexao)\n\nInforma\u00C3\u00A7\u00C3\u00B5es do contexto:\nTelefone: ".concat(phoneNumber, "\n").concat(userId ? "UserId: ".concat(userId) : 'Sem conta criada').concat(accountCtx).concat(promptCtx).concat(mediaLibCtx).concat(mediaPromptCtx).concat(companyCtx).concat(contactCtx).concat(pendingMediaCtx).concat(recentMediaCtx).concat(deliveredTestCtx, "\n").concat(clientTypeInstructions, "\n\nREGRAS IMPORTANTES:\n1. Seja natural, emp\u00C3\u00A1tico e conversacional, como um atendente humano real\n2. NUNCA mencione JSON, ferramentas, tool_calls, par\u00C3\u00A2metros ou termos t\u00C3\u00A9cnicos internos\n3. Use as ferramentas dispon\u00C3\u00ADveis quando a situa\u00C3\u00A7\u00C3\u00A3o exigir. Para informar_planos, gerar_link_conexao e gerar_link_planos: execute direto. Para criar_agente, editar_prompt, salvar_midia e registrar_pagamento: SEMPRE pe\u00C3\u00A7a confirma\u00C3\u00A7\u00C3\u00A3o antes (veja regra 5). Para registrar_pagamento: s\u00C3\u00B3 use se houver comprovante realmente anexado nesta conversa.\n4. Para CRIAR AGENTE: colete pelo menos o nome da empresa antes. Quando entender o que o cliente quer, primeiro resuma o que vai criar e pe\u00C3\u00A7a confirma\u00C3\u00A7\u00C3\u00A3o. Nunca crie direto sem confirma\u00C3\u00A7\u00C3\u00A3o expl\u00C3\u00ADcita.\n5. Para CRIAR AGENTE, EDITAR PROMPT ou SALVAR M\u00C3\u008DDIA: SEMPRE confirme com o cliente ANTES de executar. Diga o que pretende fazer e pergunte \"Posso prosseguir?\" ou \"Confirma?\". S\u00C3\u00B3 execute DEPOIS que o cliente confirmar. NUNCA crie, edite ou salve sem confirma\u00C3\u00A7\u00C3\u00A3o expl\u00C3\u00ADcita.\n6. Para clientes NOVOS: apresente-se brevemente, pergunte sobre o neg\u00C3\u00B3cio, e quando tiver informa\u00C3\u00A7\u00C3\u00A3o suficiente, proponha a cria\u00C3\u00A7\u00C3\u00A3o do agente e pe\u00C3\u00A7a confirma\u00C3\u00A7\u00C3\u00A3o.\n7. Para clientes que j\u00C3\u00A1 T\u00C3\u0160M CONTA: ajude com configura\u00C3\u00A7\u00C3\u00B5es, edi\u00C3\u00A7\u00C3\u00B5es de prompt, m\u00C3\u00ADdia, planos\n8. NUNCA use emojis, emoticons ou simbolos decorativos na resposta ao cliente\n8A. NUNCA use travess\u00C3\u00A3o ou em dash (\u00E2\u20AC\u201D) na resposta ao cliente. Prefira v\u00C3\u00ADrgula, ponto, dois-pontos ou par\u00C3\u00AAnteses.\n9. Se a inten\u00C3\u00A7\u00C3\u00A3o n\u00C3\u00A3o estiver clara, fa\u00C3\u00A7a UMA pergunta aberta \u00E2\u20AC\u201D nunca liste op\u00C3\u00A7\u00C3\u00B5es como menu\n10. Adapte o tom: acolhedor com novos, prestativo com ativos, direto com quem tem pressa\n10A. Use o nome do cliente quando ele estiver no contexto, sobretudo na primeira resposta ou quando quiser soar mais pr\u00C3\u00B3ximo\n10B. Quando o cliente trouxer uma d\u00C3\u00BAvida objetiva, responda a d\u00C3\u00BAvida antes de convidar para criar conta\n10C. Evite come\u00C3\u00A7ar respostas com \"n\u00C3\u00A3o\". Prefira caminhos positivos e naturais\n10D. Seja breve e profissional. Evite texto longo, lista grande e floreio. O ideal e responder como um vendedor humano no WhatsApp.\n10E. Se o cliente ja estiver em conversa de teste ou ja tiver recebido simulador, foque em orientar o proximo passo. Nao volte para a pergunta inicial do negocio.\n10F. Na primeira abordagem, use no maximo 3 linhas curtas e uma unica pergunta objetiva.\n10G. Antes de criar a conta, tire as d\u00FAvidas principais do cliente e sinta o interesse real. S\u00F3 proponha criar quando ele demonstrar que quer testar.\n10G.1. Se o cliente j\u00E1 disse que quer testar, criar ou ver funcionando, n\u00E3o volte para perguntas gen\u00E9ricas. Aproveite o que ele j\u00E1 informou na conversa, confirme o que entendeu e avance.\n10G.1A. Se o cliente disser que quer testar, mas ainda n\u00E3o deixou claro o pr\u00F3ximo passo, priorize avan\u00E7ar para o teste e para o site. S\u00F3 ofere\u00E7a configura\u00E7\u00E3o assistida se ele pedir explicitamente que voc\u00EAs montem por ele.\n10G.2. Se o cliente pedir o link de teste, simulador ou cobrar \"cad\u00EA o link\", entregue o link real na mesma resposta usando a ferramenta correta. N\u00E3o volte a pedir nome da empresa se isso j\u00E1 apareceu no contexto.\n10G.3. Se o cliente perguntar como saber se est\u00E1 ativo, responda objetivamente como conferir IA ligada e WhatsApp conectado. N\u00E3o diga que vai editar nada.\n10G.4. Se o cliente pedir humano, call ou suporte, explique em uma frase o que voc\u00EA resolve por aqui e passe o n\u00FAmero do suporte humano: +55 17 99164-8288.\n10H. Quando entregar o link do teste, seja curto: diga para ele abrir, conversar com o agente e falar o que quer ajustar. Se fizer sentido, avise que ele tamb\u00E9m pode conectar o WhatsApp ainda no teste gratuito.\n11. NUNCA diga \"aguarde\", \"espere\", \"um momento\" ou \"j\u00C3\u00A1 busco\" \u00E2\u20AC\u201D os resultados das ferramentas chegam INSTANTANEAMENTE. Quando chamar uma ferramenta, INCLUA o resultado dela diretamente na sua resposta final. Ex: se chamou informar_planos, apresente os planos na mesma mensagem.\n12. Ap\u00C3\u00B3s executar uma ferramenta, SEMPRE apresente o resultado completo ao cliente na mesma mensagem. Nunca diga que vai buscar algo sem mostrar o resultado.\n13. Ap\u00C3\u00B3s informar os planos, OFERE\u00C3\u2021A enviar o link direto para assinar usando gerar_link_planos (se o cliente tiver conta e N\u00C3\u0192O tiver plano ativo, ou se ele estiver pedindo explicitamente algo comercial como renova\u00C3\u00A7\u00C3\u00A3o, upgrade ou pagamento).\n13A. Preco comercial do admin: mensal padrao *R$99/mes* e anual promocional *R$599*.\n13A.0. Se o cliente vier do anuncio/oferta de *R$49* ou retomar claramente essa oferta na conversa, use *R$49 por mes* e envie o link promocional https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e.\n13A.1. Se o cliente estiver descrevendo o funil dele, um roteiro de atendimento, uma sequencia com audio, video, imagens, depoimentos, tempo de espera ou automacao, nao trate palavras como \"valor\", \"plano\" ou \"assinatura\" como pergunta sobre o preco da AgenteZap. Nesses casos, responda a configuracao que ele quer fazer.\n13A.2. Se o cliente perguntar so de preco, valor, assinatura ou plano sem citar anual, responda somente o mensal. Use *R$49 por mes* apenas no contexto da oferta de 49. Nos demais casos, use *R$99 por mes*.\n13A.3. So mencione o anual promocional de *R$599* quando o cliente perguntar do anual.\n13A.4. Nao fale de cupom por conta propria. So explique diferenca de preco do site se o cliente perguntar diretamente.\n13B. Se o cliente demonstrar inten\u00E7\u00E3o clara de assinar, fechar, pagar ou pedir link de planos, chame gerar_link_planos na mesma resposta. N\u00E3o deixe para depois. Se o cliente j\u00E1 tiver plano ativo, s\u00F3 fa\u00E7a isso quando ele pedir explicitamente algo comercial.\n13C. Ao enviar link de planos, envie SOMENTE o link de planos retornado pela ferramenta. N\u00C3\u00A3o acrescente link de conex\u00C3\u00A3o, painel ou qualquer outro link, a menos que o cliente pe\u00C3\u00A7a.\n13D. NUNCA use links em markdown no formato [texto](url). Escreva a URL pura exatamente como veio da ferramenta.\n14. NUNCA diga que ativou, liberou ou assinou o plano do cliente sem a\u00C3\u00A7\u00C3\u00A3o real do sistema. A ativa\u00C3\u00A7\u00C3\u00A3o exige pagamento no site. Se o cliente s\u00C3\u00B3 disser que pagou, reenvie o link de planos e oriente clicar em \"Eu j\u00C3\u00A1 paguei\". S\u00C3\u00B3 use registrar_pagamento quando houver comprovante anexado nesta conversa e confirme antes de registrar.\n15. Ap\u00C3\u00B3s criar ou editar o agente, SEMPRE inclua o link do simulador para o cliente testar as mudan\u00C3\u00A7as. O link do simulador \u00C3\u00A9 o que vem no resultado da ferramenta (formato /test/TOKEN). N\u00C3\u0192O substitua por link de planos.\n16. PROIBIDO FABRICAR URLs: NUNCA invente, crie ou escreva URLs manualmente. Links de planos, conex\u00C3\u00A3o e simulador s\u00C3\u00A3o gerados EXCLUSIVAMENTE pelas ferramentas gerar_link_planos, gerar_link_conexao e criar_agente. Se o cliente pedir um link, CHAME a ferramenta correspondente \u00E2\u20AC\u201D NUNCA escreva uma URL por conta pr\u00C3\u00B3pria.\n17. Se o cliente pedir link para PLANOS/ASSINATURA \u00E2\u2020\u2019 chame gerar_link_planos. Se pedir link para CONEX\u00C3\u0192O/WHATSAPP \u00E2\u2020\u2019 chame gerar_link_conexao. Se pedir para TESTAR/SIMULADOR \u00E2\u2020\u2019 chame gerar_link_simulador. Se pedir para CRIAR CONTA \u00E2\u2020\u2019 chame criar_agente. SEMPRE use a ferramenta, NUNCA gere o link na mensagem.\n18. URLs v\u00C3\u00A1lidas SOMENTE v\u00C3\u00AAm do resultado das ferramentas. Qualquer URL que voc\u00C3\u00AA escrever diretamente ser\u00C3\u00A1 INV\u00C3\u0081LIDA e causar\u00C3\u00A1 erro para o cliente.\n19. Quando o resultado de uma ferramenta contiver URLs, copie-as EXATAMENTE como est\u00C3\u00A3o. NUNCA modifique, reescreva ou substitua as URLs retornadas pelas ferramentas.\n20. Apos criar_agente, entregue de forma curta que o teste foi criado, mande o link do simulador (/test/TOKEN) e diga que ele pode testar e depois conectar o WhatsApp ainda no teste gratuito. Nao envie email e senha por iniciativa propria. So envie acesso interno se o cliente pedir painel, login, CRM ou credenciais.\n20A. Se o cliente ainda NAO tem conta e enviar audio, imagem, video ou documento durante o onboarding, trate isso apenas como contexto do negocio. Nao entre em cadastro de midia e nao pergunte quando o agente deve usar esse arquivo, a menos que o lead peca explicitamente para cadastrar essa midia.\n20B. Se o cliente ja tem conta e responder de forma vaga logo apos receber link de teste ou credenciais, trate isso como pedido de ajuda com acesso. Nesse caso, chame gerar_link_simulador e entregue o link novo na mesma resposta. NUNCA diga que vai gerar depois ou que esta gerando sem trazer o resultado da ferramenta.\n20C. Se o cliente j\u00E1 te passou nome da empresa, ramo ou objetivo e depois disser \"pode criar\", \"quero testar\", \"agora cria\" ou equivalente, n\u00E3o reinicie o question\u00E1rio. Confirme o resumo e avance para a cria\u00E7\u00E3o.\n\nCADASTRO DE MIDIAS:\n21. Receber \u00C3\u00A1udio, imagem, v\u00C3\u00ADdeo ou documento N\u00C3\u0192O significa pedido de cadastrar m\u00C3\u00ADdia. Por padr\u00C3\u00A3o, trate a transcri\u00C3\u00A7\u00C3\u00A3o/conte\u00C3\u00BAdo como conversa normal.\n22. S\u00C3\u00B3 entre em cadastro de m\u00C3\u00ADdia se o cliente pedir EXPLICITAMENTE para cadastrar, adicionar, salvar, anexar ou fazer o agente usar aquele arquivo, ou se existir \"M\u00C3\u00ADdia pendente ainda n\u00C3\u00A3o salva\" no contexto e o cliente estiver completando os dados dessa m\u00C3\u00ADdia.\n23. Se a m\u00C3\u00ADdia foi enviada apenas para explicar algo sobre o neg\u00C3\u00B3cio ou pedir uma altera\u00C3\u00A7\u00C3\u00A3o no agente, siga o fluxo normal da conversa. N\u00C3\u0192O pergunte sobre nome da m\u00C3\u00ADdia nem quando usar.\n23A. Quando a m\u00C3\u00ADdia for s\u00C3\u00B3 o meio pelo qual o cliente falou com voc\u00C3\u00AA, N\u00C3\u0192O mencione o arquivo na resposta. Responda apenas \u00C3\u00A0 inten\u00C3\u00A7\u00C3\u00A3o principal do cliente.\n24. Quando houver pedido expl\u00C3\u00ADcito de cadastro, pergunte o nome da m\u00C3\u00ADdia e em qual situa\u00C3\u00A7\u00C3\u00A3o o agente deve envi\u00C3\u00A1-la.\n25. Quando tiver o nome e o contexto de uso, CONFIRME com o cliente antes de salvar (regra 5). Ao salvar, preencha TODOS os campos: name (nome descritivo), whenToUse (quando o agente deve enviar esta m\u00C3\u00ADdia \u00E2\u20AC\u201D esse campo \u00C3\u00A9 OBRIGAT\u00C3\u201CRIO), description (descri\u00C3\u00A7\u00C3\u00A3o do conte\u00C3\u00BAdo), mediaType (image/audio/video/document).\n26. A URL da m\u00C3\u00ADdia j\u00C3\u00A1 \u00C3\u00A9 preenchida automaticamente pelo sistema \u00E2\u20AC\u201D N\u00C3\u0192O invente URLs de m\u00C3\u00ADdia. Se o campo mediaUrl n\u00C3\u00A3o vier automaticamente, pe\u00C3\u00A7a ao cliente para reenviar a m\u00C3\u00ADdia.\n27. Para clientes que j\u00C3\u00A1 t\u00C3\u00AAm conta, o userId \u00C3\u00A9 usado automaticamente. A m\u00C3\u00ADdia fica vinculada ao agente do cliente.\n28. Se existir \"M\u00C3\u00ADdia pendente ainda n\u00C3\u00A3o salva\" no contexto, isso significa que o arquivo j\u00C3\u00A1 foi recebido e a URL interna j\u00C3\u00A1 est\u00C3\u00A1 dispon\u00C3\u00ADvel. Se o cliente responder com nome, descri\u00C3\u00A7\u00C3\u00A3o, quando usar, ou confirmar o salvamento, chame salvar_midia neste turno usando essa m\u00C3\u00ADdia pendente.\n29. Se o cliente quiser montar um funil/sequencia com varias midias e textos, use salvar_midia com mediaType=\"flow\" e preencha flowItems na ordem correta. Para itens de midia, use recentMediaIndex apontando para os arquivos recentes do contexto.\n30. NUNCA diga que a m\u00C3\u00ADdia ou o fluxo foi salvo, configurado ou adicionado \u00C3\u00A0 biblioteca se voc\u00C3\u00AA n\u00C3\u00A3o chamou salvar_midia com sucesso neste turno.");
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Context gathering
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function gatherClientContext(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var ctx, mediaPromptBlock, e_1, subscription, e_2, versions, current, versionNumber, e_3, mediaRecords, names, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ctx = {};
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, adminMediaStore_1.generateAdminMediaPromptBlock)(undefined)];
                case 2:
                    mediaPromptBlock = _a.sent();
                    if (mediaPromptBlock === null || mediaPromptBlock === void 0 ? void 0 : mediaPromptBlock.trim()) {
                        ctx.mediaPromptBlock = mediaPromptBlock.trim();
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.warn('[ToolCalling] Erro ao montar prompt detalhado de mÃ­dia do admin:', e_1);
                    return [3 /*break*/, 4];
                case 4:
                    if (!userId)
                        return [2 /*return*/, ctx];
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, storage_1.storage.getUserSubscription(userId)];
                case 6:
                    subscription = _a.sent();
                    if (subscription && subscription.plan) {
                        ctx.accountStatus = "".concat(subscription.plan.name || subscription.plan.planName || 'Ativo', " (ativo)");
                    }
                    else {
                        ctx.accountStatus = 'Conta criada (plano gratuito de teste)';
                    }
                    return [3 /*break*/, 8];
                case 7:
                    e_2 = _a.sent();
                    console.warn('[ToolCalling] Erro ao buscar assinatura:', e_2);
                    return [3 /*break*/, 8];
                case 8:
                    _a.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, (0, promptHistoryService_1.listarVersoes)(userId)];
                case 9:
                    versions = _a.sent();
                    if (versions && versions.length > 0) {
                        current = versions.find(function (v) { return v.is_current; }) || versions[0];
                        versionNumber = current.version_number || versions.length;
                        ctx.promptSummary = "".concat(versions.length, " vers\u00C3\u00A3o").concat(versions.length > 1 ? 's' : '', " (v").concat(versionNumber, " atual)");
                    }
                    else {
                        ctx.promptSummary = 'Nenhuma versÃ£o registrada';
                    }
                    return [3 /*break*/, 11];
                case 10:
                    e_3 = _a.sent();
                    console.warn('[ToolCalling] Erro ao buscar versÃµes de prompt:', e_3);
                    return [3 /*break*/, 11];
                case 11:
                    _a.trys.push([11, 13, , 14]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.agentMediaLibrary)
                            .where((0, drizzle_orm_1.eq)(schema_1.agentMediaLibrary.userId, userId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.agentMediaLibrary.id))
                            .limit(5)];
                case 12:
                    mediaRecords = _a.sent();
                    if (mediaRecords && mediaRecords.length > 0) {
                        names = mediaRecords.map(function (m) { return m.name; }).join(', ');
                        ctx.mediaLibrarySummary = "".concat(mediaRecords.length, " m\u00C3\u00ADdia").concat(mediaRecords.length > 1 ? 's' : '', " (").concat(names, ")");
                    }
                    else {
                        ctx.mediaLibrarySummary = 'Nenhuma mÃ­dia salva';
                    }
                    return [3 /*break*/, 14];
                case 13:
                    e_4 = _a.sent();
                    console.warn('[ToolCalling] Erro ao buscar biblioteca de mÃ­dia:', e_4);
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/, ctx];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// URL fabrication detection â€” replaces hallucinated URLs with warning
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var APP_DOMAIN = (process.env.APP_URL || 'https://agentezap.online').replace(/^https?:\/\//, '').replace(/\/+$/, '');
var APP_BASE_URL = process.env.APP_URL || 'https://agentezap.online';
var PLANS_LINK_PLACEHOLDER = '{{PLANS_LINK_PLACEHOLDER}}';
var CONEXAO_LINK_PLACEHOLDER = '{{CONEXAO_LINK_PLACEHOLDER}}';
var SIMULATOR_LINK_PLACEHOLDER = '{{SIMULATOR_LINK_PLACEHOLDER}}';
var UUID_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SIMULATOR_TOKEN_PATTERN = /^[a-f0-9]{16,}$/i;
function firstNonEmptyString() {
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    for (var _a = 0, values_1 = values; _a < values_1.length; _a++) {
        var value = values_1[_a];
        var normalized = String(value !== null && value !== void 0 ? value : '').trim();
        if (normalized) {
            return normalized;
        }
    }
    return undefined;
}
function getPlaceholderForLinkType(type) {
    if (type === 'plans')
        return PLANS_LINK_PLACEHOLDER;
    if (type === 'conexao')
        return CONEXAO_LINK_PLACEHOLDER;
    return SIMULATOR_LINK_PLACEHOLDER;
}
function buildPendingConfirmationAction(toolName, toolArgs, phoneNumber) {
    if (toolName === 'criar_agente') {
        var companyName = String(toolArgs.nomeEmpresa ||
            toolArgs.companyName ||
            toolArgs.company ||
            toolArgs.businessName ||
            toolArgs.nomeNegocio ||
            '').trim();
        var businessSegment = String(toolArgs.ramoAtuacao ||
            toolArgs.businessSegment ||
            toolArgs.businessType ||
            toolArgs.segment ||
            toolArgs.ramo ||
            '').trim();
        var serviceDescription = String(toolArgs.descricaoAtendimento ||
            toolArgs.attendanceDescription ||
            toolArgs.promptDescription ||
            toolArgs.instructions ||
            toolArgs.prompt ||
            '').trim();
        if (!companyName)
            return null;
        var details = [
            "Empresa: ".concat(companyName),
            businessSegment ? "Ramo/segmento: ".concat(businessSegment) : '',
            serviceDescription ? "Como o agente deve atuar: ".concat(serviceDescription) : '',
        ].filter(Boolean);
        return {
            type: 'criar_agente',
            payload: __assign(__assign({}, toolArgs), { phoneNumber: phoneNumber }),
            proposedText: "Perfeito. Antes de criar seu teste, deixa eu confirmar se entendi certo:\n\n".concat(details.join('\n'), "\n\nSe for isso mesmo, eu crio e j\u00E1 te entrego o link para testar. Posso prosseguir?"),
            expiresAt: Date.now() + 10 * 60000,
        };
    }
    if (toolName === 'editar_prompt') {
        var descricaoMudanca = String(toolArgs.descricaoMudanca || '').trim();
        if (!descricaoMudanca)
            return null;
        return {
            type: 'edit_prompt',
            payload: __assign(__assign({}, toolArgs), { phoneNumber: phoneNumber }),
            proposedText: "Entendi. Vou atualizar seu agente com esta mudan\u00C3\u00A7a:\n\n".concat(descricaoMudanca, "\n\nPosso prosseguir?"),
            expiresAt: Date.now() + 10 * 60000,
        };
    }
    if (toolName === 'salvar_midia') {
        var mediaName = String(toolArgs.name || 'essa mÃ­dia').trim() || 'essa mÃ­dia';
        var mediaUrl = firstNonEmptyString(toolArgs.mediaUrl, toolArgs.storageUrl);
        var mediaType = String(toolArgs.mediaType || '').trim().toLowerCase();
        var flowItems = Array.isArray(toolArgs.flowItems) ? toolArgs.flowItems : [];
        var whenToUse = String(toolArgs.whenToUse || '').trim();
        var description = String(toolArgs.description || '').trim();
        if (!(0, adminPendingActionPolicy_1.canConfirmSaveMediaPendingAction)({ mediaUrl: mediaUrl, whenToUse: whenToUse, mediaType: mediaType, flowItems: flowItems })) {
            return null;
        }
        var details = mediaType === 'flow'
            ? [
                "Nome: ".concat(mediaName),
                "Tipo: fluxo",
                whenToUse ? "Quando usar: ".concat(whenToUse) : '',
                description ? "Descri\u00C3\u00A7\u00C3\u00A3o: ".concat(description) : '',
                "Sequencia:\n".concat(summarizeFlowItemsForConfirmation(flowItems)),
            ].filter(Boolean)
            : [
                "Nome: ".concat(mediaName),
                whenToUse ? "Quando usar: ".concat(whenToUse) : '',
                description ? "Descri\u00C3\u00A7\u00C3\u00A3o: ".concat(description) : '',
            ].filter(Boolean);
        return {
            type: 'save_media',
            payload: __assign(__assign({}, toolArgs), { phoneNumber: phoneNumber }),
            proposedText: "Perfeito. Vou salvar esta m\u00C3\u00ADdia no seu agente com estes dados:\n\n".concat(details.join('\n'), "\n\nConfirma que posso prosseguir?"),
            expiresAt: Date.now() + 10 * 60000,
        };
    }
    if (toolName === 'registrar_pagamento') {
        var amount = String(toolArgs.valorInformado || toolArgs.amount || '').trim();
        var plan = String(toolArgs.planoEscolhido || toolArgs.plan || '').trim();
        var details = [
            'Acao: registrar oficialmente o comprovante no sistema',
            amount ? "Valor informado: ".concat(amount) : '',
            plan ? "Plano mencionado: ".concat(plan) : '',
        ].filter(Boolean);
        return {
            type: 'registrar_pagamento',
            payload: __assign(__assign({}, toolArgs), { phoneNumber: phoneNumber }),
            proposedText: "Recebi um comprovante por aqui e vou encaminhar isso para registro oficial no sistema.\n\n".concat(details.join('\n'), "\n\nConfirma que posso prosseguir?"),
            expiresAt: Date.now() + 10 * 60000,
        };
    }
    return null;
}
function normalizePendingConfirmationAction(pendingAction) {
    var _a, _b, _c, _d;
    if (pendingAction.type === 'criar_agente') {
        var rebuilt = buildPendingConfirmationAction('criar_agente', pendingAction.payload || {}, String(((_a = pendingAction.payload) === null || _a === void 0 ? void 0 : _a.phoneNumber) || '').trim());
        if (rebuilt) {
            return __assign(__assign({}, rebuilt), { expiresAt: pendingAction.expiresAt || rebuilt.expiresAt });
        }
    }
    if (pendingAction.type === 'edit_prompt') {
        var rebuilt = buildPendingConfirmationAction('editar_prompt', pendingAction.payload || {}, String(((_b = pendingAction.payload) === null || _b === void 0 ? void 0 : _b.phoneNumber) || '').trim());
        if (rebuilt) {
            return __assign(__assign({}, rebuilt), { expiresAt: pendingAction.expiresAt || rebuilt.expiresAt });
        }
    }
    if (pendingAction.type === 'save_media') {
        var rebuilt = buildPendingConfirmationAction('salvar_midia', pendingAction.payload || {}, String(((_c = pendingAction.payload) === null || _c === void 0 ? void 0 : _c.phoneNumber) || '').trim());
        if (rebuilt) {
            return __assign(__assign({}, rebuilt), { expiresAt: pendingAction.expiresAt || rebuilt.expiresAt });
        }
    }
    if (pendingAction.type === 'registrar_pagamento') {
        var rebuilt = buildPendingConfirmationAction('registrar_pagamento', pendingAction.payload || {}, String(((_d = pendingAction.payload) === null || _d === void 0 ? void 0 : _d.phoneNumber) || '').trim());
        if (rebuilt) {
            return __assign(__assign({}, rebuilt), { expiresAt: pendingAction.expiresAt || rebuilt.expiresAt });
        }
    }
    return pendingAction;
}
function pendingActionAlreadyAsksForConfirmation(text) {
    var normalized = text.toLowerCase();
    return normalized.includes('posso prosseguir') || normalized.includes('confirma');
}
function extractToolResultText(content) {
    try {
        var parsed = JSON.parse(content);
        return String((parsed === null || parsed === void 0 ? void 0 : parsed.message) || (parsed === null || parsed === void 0 ? void 0 : parsed.responseText) || content);
    }
    catch (_a) {
        return content;
    }
}
function classifySuspiciousOwnDomainUrl(urlObj) {
    var pathname = urlObj.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    var token = urlObj.searchParams.get('token');
    if (pathname.startsWith('/test/')) {
        var tokenCandidate = pathname.split('/')[2] || '';
        return SIMULATOR_TOKEN_PATTERN.test(tokenCandidate) ? null : 'simulator';
    }
    if (pathname === '/connect' || pathname.startsWith('/connect/')) {
        return 'conexao';
    }
    if (pathname === '/conexao') {
        if (!token)
            return null;
        return UUID_TOKEN_PATTERN.test(token) ? null : 'conexao';
    }
    if (pathname.startsWith('/conexao/')) {
        return 'conexao';
    }
    if (pathname === '/plans') {
        if (!token)
            return null;
        return UUID_TOKEN_PATTERN.test(token) ? null : 'plans';
    }
    if (pathname.startsWith('/plans/')) {
        return 'plans';
    }
    return null;
}
function classifyFabricatedExternalUrl(url) {
    var lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('simulador') || lowerUrl.includes('simulator') || lowerUrl.includes('/test/') || lowerUrl.includes('teste')) {
        return 'simulator';
    }
    if (lowerUrl.includes('conex') || lowerUrl.includes('/connect') || lowerUrl.includes('/conexao') || lowerUrl.includes('qr') || lowerUrl.includes('parear') || lowerUrl.includes('whatsapp')) {
        return 'conexao';
    }
    if (lowerUrl.includes('plan') || lowerUrl.includes('assin') || lowerUrl.includes('pricing') || lowerUrl.includes('checkout') || lowerUrl.includes('token=')) {
        return 'plans';
    }
    return null;
}
function normalizeToolArguments(toolName, toolArgs) {
    if (toolName !== 'criar_agente') {
        return toolArgs;
    }
    var normalizedArgs = __assign({}, toolArgs);
    var nomeEmpresa = firstNonEmptyString(toolArgs.nomeEmpresa, toolArgs.companyName, toolArgs.company, toolArgs.businessName, toolArgs.nomeNegocio);
    var ramoAtuacao = firstNonEmptyString(toolArgs.ramoAtuacao, toolArgs.businessSegment, toolArgs.businessType, toolArgs.segment, toolArgs.ramo);
    var descricaoAtendimento = firstNonEmptyString(toolArgs.descricaoAtendimento, toolArgs.attendanceDescription, toolArgs.promptDescription, toolArgs.instructions, toolArgs.prompt);
    if (nomeEmpresa)
        normalizedArgs.nomeEmpresa = nomeEmpresa;
    if (ramoAtuacao)
        normalizedArgs.ramoAtuacao = ramoAtuacao;
    if (descricaoAtendimento)
        normalizedArgs.descricaoAtendimento = descricaoAtendimento;
    return normalizedArgs;
}
function sanitizeFabricatedUrls(text) {
    // Valid URLs are only those from our own domain (agentezap.online)
    // Any URL from other domains (agentezap.com, agentezap.com.br, etc.) is fabricated
    var urlPattern = /https?:\/\/[^\s\)>\]"']+/gi;
    var result = text;
    var hadFabricatedPlansUrl = false;
    var hadFabricatedConexaoUrl = false;
    var hadFabricatedSimulatorUrl = false;
    var matches = text.match(urlPattern);
    if (!matches)
        return { text: text, hadFabricatedPlansUrl: false, hadFabricatedConexaoUrl: false, hadFabricatedSimulatorUrl: false };
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var url = matches_1[_i];
        try {
            var urlObj = new URL(url);
            var hostname = urlObj.hostname.toLowerCase();
            // Allow our real domain
            if (hostname === APP_DOMAIN || hostname === 'www.' + APP_DOMAIN) {
                var suspiciousType = classifySuspiciousOwnDomainUrl(urlObj);
                if (!suspiciousType)
                    continue;
                console.warn("[ToolCalling] URL do dom\u00C3\u00ADnio pr\u00C3\u00B3prio mas suspeita: ".concat(url));
                if (suspiciousType === 'plans')
                    hadFabricatedPlansUrl = true;
                if (suspiciousType === 'conexao')
                    hadFabricatedConexaoUrl = true;
                if (suspiciousType === 'simulator')
                    hadFabricatedSimulatorUrl = true;
                result = result.replace(url, getPlaceholderForLinkType(suspiciousType));
                continue;
            }
            // Allow Supabase storage URLs
            if (hostname.includes('supabase.co'))
                continue;
            // Allow common media URLs (imgur, etc)
            if (hostname.includes('imgur.com') || hostname.includes('i.imgur.com'))
                continue;
            // Detect fabricated URLs and classify them
            var fabricatedType = hostname.includes('agentezap')
                ? classifyFabricatedExternalUrl(url) || 'plans'
                : classifyFabricatedExternalUrl(url);
            if (fabricatedType) {
                console.warn("[ToolCalling] URL fabricada detectada e removida: ".concat(url));
                if (fabricatedType === 'plans')
                    hadFabricatedPlansUrl = true;
                if (fabricatedType === 'conexao')
                    hadFabricatedConexaoUrl = true;
                if (fabricatedType === 'simulator')
                    hadFabricatedSimulatorUrl = true;
                result = result.replace(url, getPlaceholderForLinkType(fabricatedType));
            }
        }
        catch (_a) {
            // Not a valid URL, skip
        }
    }
    return { text: result, hadFabricatedPlansUrl: hadFabricatedPlansUrl, hadFabricatedConexaoUrl: hadFabricatedConexaoUrl, hadFabricatedSimulatorUrl: hadFabricatedSimulatorUrl };
}
/**
 * V23k: Ensure simulator URLs from tool results are preserved in the LLM response.
 * The LLM sometimes replaces /test/TOKEN with bare /plans â€” this catches that.
 */
function preserveSimulatorUrlFromToolResults(responseText, toolResultMessages) {
    // Extract /test/TOKEN URLs from tool results
    var testUrlPattern = /https?:\/\/[^\s"'\]>]+\/test\/[a-f0-9]+/gi;
    var simulatorUrl = null;
    for (var _i = 0, toolResultMessages_1 = toolResultMessages; _i < toolResultMessages_1.length; _i++) {
        var msg = toolResultMessages_1[_i];
        var match = extractToolResultText(msg.content).match(testUrlPattern);
        if (match) {
            simulatorUrl = match[0];
            break;
        }
    }
    if (!simulatorUrl)
        return responseText; // No simulator URL in tool results
    // Check if the response already contains a /test/ URL
    if (/\/test\/[a-f0-9]+/i.test(responseText))
        return responseText;
    // The LLM dropped the simulator URL. Replace bare /plans URLs with simulator URL.
    var barePlansRegex = /https?:\/\/agentezap\.online\/plans(?![?\w/])/gi;
    if (barePlansRegex.test(responseText)) {
        console.log("[ToolCalling] LLM substituiu /test/ por /plans \u00E2\u20AC\u201D corrigindo para: ".concat(simulatorUrl));
        return responseText.replace(/https?:\/\/agentezap\.online\/plans(?![?\w/])/gi, simulatorUrl);
    }
    // If response mentions testing/simulator but no URL, append it
    if (/test[ae]|simulador|simulat/i.test(responseText)) {
        console.log("[ToolCalling] LLM mencionou teste mas omitiu URL \u00E2\u20AC\u201D adicionando: ".concat(simulatorUrl));
        return responseText + "\n\n\u00F0\u0178\u201D\u2014 Link do simulador: ".concat(simulatorUrl);
    }
    return responseText;
}
function preserveAutologinUrlsFromToolResults(responseText, toolResultMessages) {
    var plansUrlPattern = /https?:\/\/[^\s"'\]>]+\/plans\?token=[0-9a-f-]+/i;
    var conexaoUrlPattern = /https?:\/\/[^\s"'\]>]+\/conexao\?token=[0-9a-f-]+/i;
    var existingPlansUrlPattern = /https?:\/\/(?:www\.)?agentezap\.online\/(?:plans(?:\?token=[^\s"'\]>]+)?|plans\/[^\s"'\]>]+|p\/[^\s"'\]>]+)/gi;
    var existingConexaoUrlPattern = /https?:\/\/(?:www\.)?agentezap\.online\/(?:conexao(?:\?token=[^\s"'\]>]+)?|conexao\/[^\s"'\]>]+|connect(?:\?token=[^\s"'\]>]+)?|connect\/[^\s"'\]>]+)/gi;
    var plansUrl = null;
    var conexaoUrl = null;
    for (var _i = 0, toolResultMessages_2 = toolResultMessages; _i < toolResultMessages_2.length; _i++) {
        var msg = toolResultMessages_2[_i];
        var textContent = extractToolResultText(msg.content);
        if (!plansUrl) {
            var plansMatch = textContent.match(plansUrlPattern);
            if (plansMatch)
                plansUrl = plansMatch[0];
        }
        if (!conexaoUrl) {
            var conexaoMatch = textContent.match(conexaoUrlPattern);
            if (conexaoMatch)
                conexaoUrl = conexaoMatch[0];
        }
    }
    var result = responseText;
    if (plansUrl) {
        if (result.includes(plansUrl)) {
            // already correct
        }
        else if (existingPlansUrlPattern.test(result)) {
            console.log("[ToolCalling] Corrigindo link de planos para URL real: ".concat(plansUrl));
            result = result.replace(existingPlansUrlPattern, plansUrl);
        }
        else if (/(assin|plano|pagamento|checkout)/i.test(result)) {
            console.log("[ToolCalling] Resposta mencionou planos sem URL real - anexando: ".concat(plansUrl));
            result = "".concat(result, "\n\n\u00F0\u0178\u201D\u2014 Link direto para assinar: ").concat(plansUrl);
        }
    }
    if (conexaoUrl) {
        if (result.includes(conexaoUrl)) {
            // already correct
        }
        else if (existingConexaoUrlPattern.test(result)) {
            console.log("[ToolCalling] Corrigindo link de conex\u00C3\u00A3o para URL real: ".concat(conexaoUrl));
            result = result.replace(existingConexaoUrlPattern, conexaoUrl);
        }
        else if (/(conex|whatsapp|qr\s*code|parea|pareamento)/i.test(result)) {
            console.log("[ToolCalling] Resposta mencionou conex\u00C3\u00A3o sem URL real - anexando: ".concat(conexaoUrl));
            result = "".concat(result, "\n\n\u00F0\u0178\u201D\u2014 Link direto para conectar o WhatsApp: ").concat(conexaoUrl);
        }
    }
    return result;
}
function extractPlansUrlFromText(text) {
    var match = String(text || '').match(/https?:\/\/[^\s"'\]>]+\/plans(?:\?token=[^\s"'\]>]+)?/i);
    return (match === null || match === void 0 ? void 0 : match[0]) || null;
}
function extractPlansUrlFromToolResults(toolResultMessages) {
    for (var _i = 0, toolResultMessages_3 = toolResultMessages; _i < toolResultMessages_3.length; _i++) {
        var msg = toolResultMessages_3[_i];
        var url = extractPlansUrlFromText(extractToolResultText(msg.content));
        if (url) {
            return url;
        }
    }
    return null;
}
function normalizeAdminPlanResponse(params) {
    return __awaiter(this, void 0, void 0, function () {
        var responseText, toolResultMessages, messageText, userId, phoneNumber, shouldNormalizePlanReply, focus, planUrl, toolResult, parsed, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    responseText = params.responseText, toolResultMessages = params.toolResultMessages, messageText = params.messageText, userId = params.userId, phoneNumber = params.phoneNumber;
                    shouldNormalizePlanReply = (0, adminPlanPricing_1.containsLegacyAdminPlanPricing)(responseText) ||
                        (0, adminPlanPricing_1.isAdminPlanRequest)(messageText);
                    if (!shouldNormalizePlanReply) {
                        return [2 /*return*/, responseText];
                    }
                    focus = (0, adminPlanPricing_1.detectAdminPlanFocusFromText)(messageText);
                    planUrl = extractPlansUrlFromToolResults(toolResultMessages) || extractPlansUrlFromText(responseText);
                    if (!(!planUrl && userId)) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, executeToolCall('gerar_link_planos', { focus: focus, requestText: messageText }, userId, phoneNumber)];
                case 2:
                    toolResult = _a.sent();
                    parsed = JSON.parse(toolResult);
                    planUrl = extractPlansUrlFromText(String((parsed === null || parsed === void 0 ? void 0 : parsed.message) || (parsed === null || parsed === void 0 ? void 0 : parsed.responseText) || '')) || planUrl;
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    console.warn('[ToolCalling] Falha ao reforçar link de planos para resposta comercial:', error_3);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, (0, adminPlanPricing_1.buildAdminPlanReplyText)({ focus: focus, link: planUrl || undefined })];
            }
        });
    });
}
/**
 * V23k: Ensure real credentials from criar_agente tool results are preserved.
 * The LLM often fabricates "nicer-looking" emails/passwords instead of using the real ones.
 */
function preserveCredentialsFromToolResults(responseText, toolResultMessages) {
    // Look for real credentials in tool results (parse JSON first to get actual text)
    var realEmail = null;
    var realPassword = null;
    for (var _i = 0, toolResultMessages_4 = toolResultMessages; _i < toolResultMessages_4.length; _i++) {
        var msg = toolResultMessages_4[_i];
        var textContent = msg.content;
        try {
            var parsed = JSON.parse(msg.content);
            textContent = parsed.message || msg.content;
        }
        catch ( /* not JSON, use raw */_a) { /* not JSON, use raw */ }
        var emailMatch = textContent.match(/E-mail(?:\s+REAL)?:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/i);
        if (emailMatch)
            realEmail = emailMatch[1];
        var passMatch = textContent.match(/Senha(?:\s+REAL)?:\s*([^\s\n]+)/i);
        if (passMatch)
            realPassword = passMatch[1];
    }
    if (!realEmail && !realPassword)
        return responseText;
    var result = responseText;
    // Replace any fabricated email with the real one
    if (realEmail) {
        var emailPattern = /(?:ðŸ“§|e-?mail|E-?mail)[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/gi;
        var match = void 0;
        while ((match = emailPattern.exec(result)) !== null) {
            var foundEmail = match[1];
            if (foundEmail !== realEmail) {
                console.log("[ToolCalling] LLM fabricou email \"".concat(foundEmail, "\" \u00E2\u20AC\u201D corrigindo para: ").concat(realEmail));
                result = result.replace(foundEmail, realEmail);
            }
        }
    }
    // Replace any fabricated password with the real one
    if (realPassword) {
        var passPattern = /(?:ðŸ”‘|senha|Senha|password)[^\n]*?([^\s\n*]+)$/gmi;
        var match = void 0;
        while ((match = passPattern.exec(result)) !== null) {
            var foundPass = match[1];
            if (foundPass !== realPassword && foundPass.length > 2) {
                console.log("[ToolCalling] LLM fabricou senha \"".concat(foundPass, "\" \u00E2\u20AC\u201D corrigindo para: ").concat(realPassword));
                result = result.replace(foundPass, realPassword);
            }
        }
    }
    return result;
}
/**
 * Sanitize response and auto-inject real links when LLM fabricates URLs.
 * If fabricated plan/conexao URLs are detected, calls the real tool and replaces placeholder.
 */
function sanitizeAndInjectRealLinks(responseText, userId, phoneNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, text, hadFabricatedPlansUrl, hadFabricatedConexaoUrl, hadFabricatedSimulatorUrl, result, realSimUrl, err_1, toolResult, parsed, realUrlMatch, err_2, toolResult, parsed, realUrlMatch, err_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = sanitizeFabricatedUrls(responseText), text = _a.text, hadFabricatedPlansUrl = _a.hadFabricatedPlansUrl, hadFabricatedConexaoUrl = _a.hadFabricatedConexaoUrl, hadFabricatedSimulatorUrl = _a.hadFabricatedSimulatorUrl;
                    if (!hadFabricatedPlansUrl && !hadFabricatedConexaoUrl && !hadFabricatedSimulatorUrl) {
                        return [2 /*return*/, text]; // No fabrication detected, return as-is
                    }
                    result = text;
                    if (!(hadFabricatedSimulatorUrl && userId)) return [3 /*break*/, 5];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    console.log('[ToolCalling] Auto-injetando link REAL de simulador (LLM fabricou URL)');
                    return [4 /*yield*/, (0, actionExecutorV2_1.getOrCreateSimulatorUrlForUser)(userId)];
                case 2:
                    realSimUrl = _b.sent();
                    result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), realSimUrl);
                    console.log("[ToolCalling] Link real de simulador injetado: ".concat(realSimUrl));
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _b.sent();
                    console.error('[ToolCalling] Erro ao gerar link real de simulador:', err_1);
                    result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL);
                    return [3 /*break*/, 4];
                case 4: return [3 /*break*/, 6];
                case 5:
                    if (hadFabricatedSimulatorUrl) {
                        result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL);
                    }
                    _b.label = 6;
                case 6:
                    if (!(hadFabricatedPlansUrl && userId)) return [3 /*break*/, 11];
                    _b.label = 7;
                case 7:
                    _b.trys.push([7, 9, , 10]);
                    console.log('[ToolCalling] Auto-injetando link REAL de planos (LLM fabricou URL)');
                    return [4 /*yield*/, executeToolCall('gerar_link_planos', {}, userId, phoneNumber)];
                case 8:
                    toolResult = _b.sent();
                    parsed = JSON.parse(toolResult);
                    if (parsed.success && parsed.message) {
                        realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
                        if (realUrlMatch) {
                            result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), realUrlMatch[0]);
                            console.log("[ToolCalling] Link real de planos injetado: ".concat(realUrlMatch[0]));
                        }
                        else {
                            result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/plans"));
                        }
                    }
                    else {
                        result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/plans"));
                    }
                    return [3 /*break*/, 10];
                case 9:
                    err_2 = _b.sent();
                    console.error('[ToolCalling] Erro ao gerar link real de planos:', err_2);
                    result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/plans"));
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (hadFabricatedPlansUrl) {
                        // No userId â€” can't generate autologin, use generic URL
                        result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/plans"));
                    }
                    _b.label = 12;
                case 12:
                    if (!(hadFabricatedConexaoUrl && userId)) return [3 /*break*/, 17];
                    _b.label = 13;
                case 13:
                    _b.trys.push([13, 15, , 16]);
                    console.log('[ToolCalling] Auto-injetando link REAL de conexÃ£o (LLM fabricou URL)');
                    return [4 /*yield*/, executeToolCall('gerar_link_conexao', {}, userId, phoneNumber)];
                case 14:
                    toolResult = _b.sent();
                    parsed = JSON.parse(toolResult);
                    if (parsed.success && parsed.message) {
                        realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
                        if (realUrlMatch) {
                            result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), realUrlMatch[0]);
                            console.log("[ToolCalling] Link real de conex\u00C3\u00A3o injetado: ".concat(realUrlMatch[0]));
                        }
                        else {
                            result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/conexao"));
                        }
                    }
                    else {
                        result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/conexao"));
                    }
                    return [3 /*break*/, 16];
                case 15:
                    err_3 = _b.sent();
                    console.error('[ToolCalling] Erro ao gerar link real de conexÃ£o:', err_3);
                    result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/conexao"));
                    return [3 /*break*/, 16];
                case 16: return [3 /*break*/, 18];
                case 17:
                    if (hadFabricatedConexaoUrl) {
                        result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/conexao"));
                    }
                    _b.label = 18;
                case 18:
                    // Clean up any remaining placeholders
                    result = result
                        .replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/plans"))
                        .replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), "".concat(APP_BASE_URL, "/conexao"))
                        .replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL)
                        .replace(/\{\{LINK_PLACEHOLDER\}\}/g, APP_BASE_URL);
                    return [2 /*return*/, result];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tool execution bridge â€” maps tool calls to actionExecutorV2
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function executeToolCall(toolName, toolArgs, userId, phoneNumber, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, currentMessageText) {
    return __awaiter(this, void 0, void 0, function () {
        var attempt, simUrl, e_5, toolToActionType, actionType, normalizedToolMediaType, normalizedFlowItems, inferredRawFlowItems, inferredNormalizedFlowItems, pendingConfirmationAction, pendingAction, result, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[ToolCalling] Executando tool: ".concat(toolName), JSON.stringify(toolArgs).slice(0, 200));
                    if ((toolName === 'informar_planos' || toolName === 'gerar_link_planos') && currentMessageText) {
                        if (!toolArgs.requestText) {
                            toolArgs.requestText = currentMessageText;
                        }
                        if (!toolArgs.focus) {
                            toolArgs.focus = (0, adminPlanPricing_1.detectAdminPlanFocusFromText)(currentMessageText);
                        }
                    }
                    if (!(toolName === 'gerar_link_simulador')) return [3 /*break*/, 9];
                    if (!userId) {
                        return [2 /*return*/, JSON.stringify({ success: false, error: 'Cliente nÃ£o tem conta ativa. Crie uma conta primeiro com criar_agente.' })];
                    }
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= 2)) return [3 /*break*/, 8];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 7]);
                    return [4 /*yield*/, (0, actionExecutorV2_1.getOrCreateSimulatorUrlForUser)(userId)];
                case 3:
                    simUrl = _a.sent();
                    return [2 /*return*/, JSON.stringify({
                            success: true,
                            message: "\u00F0\u0178\u201D\u2014 Link do simulador para testar seu agente:\n".concat(simUrl, "\n\n\u00F0\u0178\u2019\u00A1 Abra o link e converse com o agente como se fosse um cliente. Teste diferentes perguntas para ver como ele responde!"),
                        })];
                case 4:
                    e_5 = _a.sent();
                    console.error("[ToolCalling] Erro ao gerar link do simulador (tentativa ".concat(attempt, "/2):"), e_5);
                    if (!(attempt < 2)) return [3 /*break*/, 6];
                    return [4 /*yield*/, waitBeforeRetry(1200 * attempt)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [3 /*break*/, 7];
                case 7:
                    attempt++;
                    return [3 /*break*/, 1];
                case 8: return [2 /*return*/, JSON.stringify({ success: false, error: 'Nao consegui concluir o link do simulador agora.' })];
                case 9:
                    toolToActionType = {
                        informar_planos: 'INFORMAR_PLANOS',
                        gerar_link_conexao: 'GERAR_LINK_CONEXAO',
                        gerar_link_planos: 'GERAR_LINK_PLANOS',
                        editar_prompt: 'edit_prompt',
                        salvar_midia: 'save_media',
                        criar_agente: 'criar_agente',
                        registrar_pagamento: 'registrar_pagamento',
                    };
                    actionType = toolToActionType[toolName];
                    if (!actionType) {
                        return [2 /*return*/, JSON.stringify({ success: false, error: "Ferramenta \"".concat(toolName, "\" n\u00C3\u00A3o reconhecida.") })];
                    }
                    // For tools that don't require userId (informar_planos on new leads)
                    if (!userId && actionType !== 'INFORMAR_PLANOS' && actionType !== 'criar_agente' && actionType !== 'registrar_pagamento') {
                        return [2 /*return*/, JSON.stringify({ success: false, error: 'Cliente nÃ£o tem conta ativa. Crie uma conta primeiro com criar_agente.' })];
                    }
                    if (!(toolName === 'salvar_midia')) return [3 /*break*/, 13];
                    if (mediaUrl && !toolArgs.mediaUrl)
                        toolArgs.mediaUrl = mediaUrl;
                    if (mediaType && !toolArgs.mediaType)
                        toolArgs.mediaType = mediaType;
                    if ((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.url) && !toolArgs.mediaUrl)
                        toolArgs.mediaUrl = pendingMedia.url;
                    if ((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.type) && !toolArgs.mediaType)
                        toolArgs.mediaType = pendingMedia.type;
                    if ((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.description) && !toolArgs.description)
                        toolArgs.description = pendingMedia.description;
                    if ((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.whenCandidate) && !toolArgs.whenToUse)
                        toolArgs.whenToUse = pendingMedia.whenCandidate;
                    normalizedToolMediaType = String(toolArgs.mediaType || '').trim().toLowerCase();
                    if (!(normalizedToolMediaType === 'flow')) return [3 /*break*/, 12];
                    normalizedFlowItems = normalizeFlowItemsFromArgs(toolArgs.flowItems, recentMediaBuffer);
                    if (!(normalizedFlowItems.length < 2)) return [3 /*break*/, 11];
                    return [4 /*yield*/, inferFlowItemsFromMessage({
                            messageText: currentMessageText,
                            recentMediaBuffer: recentMediaBuffer,
                        })];
                case 10:
                    inferredRawFlowItems = _a.sent();
                    inferredNormalizedFlowItems = normalizeFlowItemsFromArgs(inferredRawFlowItems, recentMediaBuffer);
                    if (inferredNormalizedFlowItems.length > normalizedFlowItems.length) {
                        normalizedFlowItems = inferredNormalizedFlowItems;
                    }
                    _a.label = 11;
                case 11:
                    toolArgs.flowItems = normalizedFlowItems;
                    if (!String(toolArgs.whenToUse || '').trim()) {
                        return [2 /*return*/, JSON.stringify({
                                success: false,
                                error: 'Perfeito. Me confirma so em qual situacao o agente deve disparar esse fluxo que eu sigo por aqui.',
                            })];
                    }
                    if (normalizedFlowItems.length < 2) {
                        return [2 /*return*/, JSON.stringify({
                                success: false,
                                error: 'Para salvar esse fluxo, preciso da sequencia com pelo menos 2 itens entre textos e midias. Me manda a ordem exata que eu organizo.',
                            })];
                    }
                    return [3 /*break*/, 13];
                case 12:
                    if (!String(toolArgs.mediaUrl || '').trim()) {
                        return [2 /*return*/, JSON.stringify({
                                success: false,
                                error: 'Recebi a instrucao, mas preciso que voce reenvie o arquivo para cadastrar essa midia agora.',
                            })];
                    }
                    if (!String(toolArgs.whenToUse || '').trim()) {
                        return [2 /*return*/, JSON.stringify({
                                success: false,
                                error: 'Perfeito. Me confirma so em qual situacao o agente deve enviar essa midia que eu sigo por aqui.',
                            })];
                    }
                    _a.label = 13;
                case 13:
                    if (toolName === 'registrar_pagamento') {
                        if (mediaUrl && !toolArgs.comprovanteUrl)
                            toolArgs.comprovanteUrl = mediaUrl;
                    }
                    if (toolName === 'criar_agente' || toolName === 'editar_prompt' || toolName === 'salvar_midia' || toolName === 'registrar_pagamento') {
                        pendingConfirmationAction = buildPendingConfirmationAction(toolName, toolArgs, phoneNumber);
                        if (!pendingConfirmationAction) {
                            if (toolName === 'criar_agente') {
                                return [2 /*return*/, JSON.stringify({
                                        success: false,
                                        error: 'Entendi. Me confirma só o nome da empresa e o que você quer que o agente faça no WhatsApp que eu sigo por aqui.',
                                    })];
                            }
                            return [2 /*return*/, JSON.stringify({
                                    success: false,
                                    error: buildPendingActionClarificationReply(toolName),
                                })];
                        }
                        return [2 /*return*/, JSON.stringify({
                                success: true,
                                requiresConfirmation: true,
                                message: pendingConfirmationAction.proposedText,
                                pendingAction: pendingConfirmationAction,
                            })];
                    }
                    pendingAction = {
                        type: actionType,
                        payload: __assign(__assign({}, toolArgs), { phoneNumber: phoneNumber }),
                        proposedText: '',
                        expiresAt: Date.now() + 60000,
                    };
                    _a.label = 14;
                case 14:
                    _a.trys.push([14, 16, , 17]);
                    return [4 /*yield*/, (0, adminPendingActionExecutor_1.executeActionWithTechnicalRetry)(pendingAction, userId || phoneNumber)];
                case 15:
                    result = _a.sent();
                    return [2 /*return*/, JSON.stringify({
                            success: result.success,
                            message: result.responseText,
                            responseText: result.responseText,
                            error: result.success ? undefined : result.responseText,
                        })];
                case 16:
                    err_4 = _a.sent();
                    console.error("[ToolCalling] Erro ao executar tool ".concat(toolName, ":"), err_4);
                    return [2 /*return*/, JSON.stringify({ success: false, error: (err_4 === null || err_4 === void 0 ? void 0 : err_4.message) || 'Erro interno ao executar aÃ§Ã£o.' })];
                case 17: return [2 /*return*/];
            }
        });
    });
}
function getActionTypeForToolName(toolName) {
    switch (toolName) {
        case 'editar_prompt':
            return 'edit_prompt';
        case 'salvar_midia':
            return 'save_media';
        case 'criar_agente':
            return 'criar_agente';
        case 'registrar_pagamento':
            return 'registrar_pagamento';
        default:
            return null;
    }
}
function buildDirectToolFailureReply(toolName, rawFailureText) {
    var actionType = getActionTypeForToolName(toolName);
    if (actionType && (0, adminPendingActionExecutionPolicy_1.isTechnicalFailureMessage)(rawFailureText)) {
        return (0, adminPendingActionExecutionPolicy_1.buildPendingActionRecoveryReply)(actionType);
    }
    return rawFailureText.trim();
}
function parseFallbackToolCalls(text) {
    // Try to find JSON block with tool_calls array
    var patterns = [
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i,
        /(\{[\s\S]*"tool_calls"[\s\S]*\})/i,
        /(\{[\s\S]*"ferramenta"[\s\S]*\})/i,
    ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = text.match(pattern);
        if (match) {
            try {
                var parsed = JSON.parse(match[1]);
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    return parsed.tool_calls.map(function (tc) { return ({
                        tool: tc.name || tc.tool || tc.function,
                        arguments: tc.arguments || tc.params || tc.parametros || {},
                    }); });
                }
                if (parsed.ferramenta) {
                    return [{
                            tool: parsed.ferramenta,
                            arguments: parsed.argumentos || parsed.parametros || {},
                        }];
                }
            }
            catch (_a) {
                // Continue trying other patterns
            }
        }
    }
    return [];
}
function extractJsonObject(text) {
    var fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch === null || fencedMatch === void 0 ? void 0 : fencedMatch[1]) {
        return fencedMatch[1].trim();
    }
    var directMatch = text.match(/\{[\s\S]*\}/);
    return directMatch ? directMatch[0].trim() : null;
}
function tryRecoverPendingMediaSave(params) {
    return __awaiter(this, void 0, void 0, function () {
        var phoneNumber, userId, messageText, conversationHistory, pendingMedia, historySummary, recoveryPrompt, response, rawText, jsonText, parsed, name_1, whenToUse, description, toolResult, parsedToolResult, error_4;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    phoneNumber = params.phoneNumber, userId = params.userId, messageText = params.messageText, conversationHistory = params.conversationHistory, pendingMedia = params.pendingMedia;
                    if (!pendingMedia || !userId) {
                        return [2 /*return*/, null];
                    }
                    historySummary = conversationHistory
                        .slice(-8)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    recoveryPrompt = "Voc\u00C3\u00AA recebe uma conversa do admin do AgenteZap sobre UMA m\u00C3\u00ADdia pendente que j\u00C3\u00A1 foi enviada.\n\nSeu trabalho \u00C3\u00A9 decidir se j\u00C3\u00A1 existem dados suficientes para salvar a m\u00C3\u00ADdia AGORA.\n\nM\u00C3\u008DDIA PENDENTE:\n- tipo: ".concat(pendingMedia.type, "\n- descri\u00C3\u00A7\u00C3\u00A3o existente: ").concat(pendingMedia.description || 'nÃ£o informada', "\n- contexto sugerido anterior: ").concat(pendingMedia.whenCandidate || 'nÃ£o informado', "\n\nCONVERSA RECENTE:\n").concat(historySummary, "\n\nMENSAGEM ATUAL DO CLIENTE:\n").concat(messageText, "\n\nRegras:\n- action=\"save_now\" somente se j\u00C3\u00A1 houver nome + quando usar suficientes na conversa e o cliente estiver informando isso agora ou confirmando o salvamento.\n- action=\"ask_user\" se ainda faltar nome ou quando usar.\n- action=\"none\" se a mensagem atual for sobre outro assunto.\n- N\u00C3\u00A3o invente URL.\n- description deve ser curta e objetiva.\n\nResponda SOMENTE com JSON v\u00C3\u00A1lido neste formato:\n{\"action\":\"save_now|ask_user|none\",\"name\":\"...\",\"whenToUse\":\"...\",\"description\":\"...\"}");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: recoveryPrompt }],
                            maxTokens: 300,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText) {
                        return [2 /*return*/, null];
                    }
                    parsed = JSON.parse(jsonText);
                    if (parsed.action !== 'save_now') {
                        return [2 /*return*/, null];
                    }
                    name_1 = String(parsed.name || '').trim();
                    whenToUse = String(parsed.whenToUse || '').trim();
                    description = String(parsed.description || '').trim() ||
                        pendingMedia.description ||
                        whenToUse;
                    if (!name_1 || !whenToUse) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, executeToolCall('salvar_midia', { name: name_1, whenToUse: whenToUse, description: description }, userId, phoneNumber, undefined, undefined, pendingMedia, undefined)];
                case 3:
                    toolResult = _d.sent();
                    parsedToolResult = JSON.parse(toolResult);
                    if ((parsedToolResult === null || parsedToolResult === void 0 ? void 0 : parsedToolResult.success) && (parsedToolResult === null || parsedToolResult === void 0 ? void 0 : parsedToolResult.message)) {
                        console.log('[ToolCalling] RecuperaÃ§Ã£o de mÃ­dia pendente executou salvar_midia com sucesso');
                        return [2 /*return*/, {
                                responseText: parsedToolResult.message,
                                consumedPendingMedia: true,
                            }];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_4 = _d.sent();
                    console.warn('[ToolCalling] Falha ao recuperar salvamento de mÃ­dia pendente:', error_4);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, null];
            }
        });
    });
}
function decidePendingActionReply(params) {
    return __awaiter(this, void 0, void 0, function () {
        var pendingAction, messageText, conversationHistory, historySummary, decisionPrompt, response, rawText, jsonText, parsed, error_5;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    pendingAction = params.pendingAction, messageText = params.messageText, conversationHistory = params.conversationHistory;
                    historySummary = conversationHistory
                        .slice(-8)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    decisionPrompt = "Voc\u00C3\u00AA est\u00C3\u00A1 analisando a resposta do cliente para uma a\u00C3\u00A7\u00C3\u00A3o pendente do admin do AgenteZap.\n\nA\u00C3\u00A7\u00C3\u00A3o pendente:\n- tipo: ".concat(pendingAction.type, "\n- payload: ").concat(JSON.stringify(pendingAction.payload || {}), "\n- proposta exibida ao cliente: ").concat(pendingAction.proposedText || 'nÃ£o informada', "\n\nConversa recente:\n").concat(historySummary, "\n\nMensagem atual do cliente:\n").concat(messageText, "\n\nClassifique a mensagem atual em UMA destas a\u00C3\u00A7\u00C3\u00B5es:\n- \"confirm\": o cliente confirmou claramente que quer executar a a\u00C3\u00A7\u00C3\u00A3o pendente agora\n- \"cancel\": o cliente cancelou claramente a a\u00C3\u00A7\u00C3\u00A3o pendente\n- \"modify\": o cliente mudou o pedido, corrigiu algo, ou trouxe nova instru\u00C3\u00A7\u00C3\u00A3o que substitui a a\u00C3\u00A7\u00C3\u00A3o pendente\n- \"unclear\": n\u00C3\u00A3o ficou claro\n\nRegras:\n- \"confirm\" exige confirma\u00C3\u00A7\u00C3\u00A3o clara e contextual.\n- Se o cliente disser que N\u00C3\u0192O quer usar a m\u00C3\u00ADdia, ou corrigir o que deve ser alterado, isso \u00C3\u00A9 \"modify\".\n- Se a mensagem s\u00C3\u00B3 trouxer continua\u00C3\u00A7\u00C3\u00A3o vaga sem confirma\u00C3\u00A7\u00C3\u00A3o clara, use \"unclear\".\n\nResponda SOMENTE com JSON v\u00C3\u00A1lido:\n{\"action\":\"confirm|cancel|modify|unclear\"}");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: decisionPrompt }],
                            maxTokens: 120,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, 'unclear'];
                    parsed = JSON.parse(jsonText);
                    if (parsed.action === 'confirm' || parsed.action === 'cancel' || parsed.action === 'modify') {
                        return [2 /*return*/, parsed.action];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_5 = _d.sent();
                    console.warn('[ToolCalling] Falha ao interpretar resposta da pendingAction:', error_5);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, 'unclear'];
            }
        });
    });
}
function inferPendingActionFromAssistantReply(params) {
    return __awaiter(this, void 0, void 0, function () {
        var assistantResponse, messageText, phoneNumber, userId, conversationHistory, mediaType, mediaUrl, pendingMedia, historySummary, inferencePrompt, response, rawText, jsonText, parsed, descricaoMudanca, name_2, whenToUse, effectiveMediaUrl, effectiveMediaType, companyName, error_6;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    assistantResponse = params.assistantResponse, messageText = params.messageText, phoneNumber = params.phoneNumber, userId = params.userId, conversationHistory = params.conversationHistory, mediaType = params.mediaType, mediaUrl = params.mediaUrl, pendingMedia = params.pendingMedia;
                    historySummary = conversationHistory
                        .slice(-8)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    inferencePrompt = "Voc\u00C3\u00AA analisa uma resposta do admin do AgenteZap para decidir se ela deixou UMA a\u00C3\u00A7\u00C3\u00A3o pendente pronta para confirma\u00C3\u00A7\u00C3\u00A3o.\n\nConversa recente:\n".concat(historySummary, "\n\nMensagem atual do cliente:\n").concat(messageText, "\n\nResposta que ser\u00C3\u00A1 enviada pelo assistente:\n").concat(assistantResponse, "\n\nM\u00C3\u00ADdia dispon\u00C3\u00ADvel no contexto:\n- mediaType atual: ").concat(mediaType || 'nenhum', "\n- mediaUrl atual: ").concat(mediaUrl || 'nenhuma', "\n- pendingMedia: ").concat(pendingMedia ? JSON.stringify(pendingMedia) : 'nenhuma', "\n- existe conta ativa: ").concat(userId ? 'sim' : 'nao', "\n\nRetorne action=\"criar_agente\" SOMENTE se a resposta estiver propondo criar um teste/conta e a conversa ja tiver dados suficientes para confirmacao.\nRetorne action=\"edit_prompt\" SOMENTE se houver conta ativa e a resposta estiver propondo uma altera\u00C3\u00A7\u00C3\u00A3o pronta para confirma\u00C3\u00A7\u00C3\u00A3o.\nRetorne action=\"save_media\" SOMENTE se houver conta ativa e a resposta estiver propondo salvar m\u00C3\u00ADdia e j\u00C3\u00A1 houver nome + whenToUse suficientes.\nRetorne action=\"none\" se a resposta estiver apenas esclarecendo, perguntando mais detalhes, ou concluindo algo sem depender de confirma\u00C3\u00A7\u00C3\u00A3o futura.\n\nRegras:\n- proposedText deve ser a pr\u00C3\u00B3pria resposta do assistente.\n- Para edit_prompt, preencha descricaoMudanca com a altera\u00C3\u00A7\u00C3\u00A3o concreta j\u00C3\u00A1 definida.\n- Para save_media, n\u00C3\u00A3o invente mediaUrl. Use a m\u00C3\u00ADdia j\u00C3\u00A1 presente no contexto.\n- Se ainda faltar detalhe essencial, action=\"none\".\n\nResponda SOMENTE com JSON v\u00C3\u00A1lido:\n{\"action\":\"edit_prompt|save_media|criar_agente|none\",\"descricaoMudanca\":\"...\",\"name\":\"...\",\"whenToUse\":\"...\",\"description\":\"...\",\"companyName\":\"...\",\"businessSegment\":\"...\",\"serviceDescription\":\"...\"}");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: inferencePrompt }],
                            maxTokens: 240,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, null];
                    parsed = JSON.parse(jsonText);
                    if (parsed.action === 'edit_prompt') {
                        if (!userId)
                            return [2 /*return*/, null];
                        descricaoMudanca = String(parsed.descricaoMudanca || '').trim();
                        if (!descricaoMudanca)
                            return [2 /*return*/, null];
                        return [2 /*return*/, buildPendingConfirmationAction('editar_prompt', { descricaoMudanca: descricaoMudanca }, phoneNumber)];
                    }
                    if (parsed.action === 'save_media') {
                        if (!userId)
                            return [2 /*return*/, null];
                        name_2 = String(parsed.name || '').trim();
                        whenToUse = String(parsed.whenToUse || '').trim();
                        effectiveMediaUrl = String((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.url) || mediaUrl || '').trim();
                        effectiveMediaType = String((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.type) || mediaType || '').trim();
                        if (!name_2 || !whenToUse || !effectiveMediaUrl || !effectiveMediaType)
                            return [2 /*return*/, null];
                        return [2 /*return*/, buildPendingConfirmationAction('salvar_midia', {
                                name: name_2,
                                whenToUse: whenToUse,
                                description: String(parsed.description || '').trim() ||
                                    (pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.description) ||
                                    whenToUse,
                                mediaUrl: effectiveMediaUrl,
                                mediaType: effectiveMediaType,
                            }, phoneNumber)];
                    }
                    if (parsed.action === 'criar_agente') {
                        companyName = String(parsed.companyName || '').trim();
                        if (!companyName)
                            return [2 /*return*/, null];
                        return [2 /*return*/, buildPendingConfirmationAction('criar_agente', {
                                nomeEmpresa: companyName,
                                ramoAtuacao: String(parsed.businessSegment || '').trim(),
                                descricaoAtendimento: String(parsed.serviceDescription || '').trim(),
                            }, phoneNumber)];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_6 = _d.sent();
                    console.warn('[ToolCalling] Falha ao inferir pendingAction pela resposta do assistente:', error_6);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
function tryRecoverImplicitCreateConfirmation(params) {
    return __awaiter(this, void 0, void 0, function () {
        var messageText, phoneNumber, conversationHistory, historySummary, prompt, response, rawText, jsonText, parsed, companyName, error_7;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    messageText = params.messageText, phoneNumber = params.phoneNumber, conversationHistory = params.conversationHistory;
                    if (!isExplicitPendingConfirmationReply(messageText, { type: 'criar_agente', payload: {}, proposedText: '', expiresAt: 0 })) {
                        return [2 /*return*/, null];
                    }
                    historySummary = conversationHistory
                        .slice(-10)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    prompt = "Voc\u00C3\u00AA analisa uma conversa do admin da AgenteZap.\n\nObjetivo:\n- identificar se o cliente acabou de CONFIRMAR uma proposta recente de criar uma conta/teste do agente\n- se sim, extrair os dados necessarios para executar criar_agente agora\n\nConversa recente:\n".concat(historySummary, "\n\nMensagem atual do cliente:\n").concat(messageText, "\n\nRegras:\n- action=\"execute_create\" somente se a conversa mostrar claramente que o assistente acabou de propor criar o teste/agente e o cliente respondeu confirmando\n- se ainda faltar o nome da empresa, retorne \"none\"\n- companyName e obrigatorio para execute_create\n- businessSegment e serviceDescription podem ficar vazios se a conversa nao tiver isso claro\n\nResponda SOMENTE com JSON valido:\n{\"action\":\"execute_create|none\",\"companyName\":\"...\",\"businessSegment\":\"...\",\"serviceDescription\":\"...\"}");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: prompt }],
                            maxTokens: 220,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, null];
                    parsed = JSON.parse(jsonText);
                    if (parsed.action !== 'execute_create')
                        return [2 /*return*/, null];
                    companyName = String(parsed.companyName || '').trim();
                    if (!companyName)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            type: 'criar_agente',
                            payload: {
                                nomeEmpresa: companyName,
                                ramoAtuacao: String(parsed.businessSegment || '').trim(),
                                descricaoAtendimento: String(parsed.serviceDescription || '').trim(),
                                phoneNumber: phoneNumber,
                            },
                            proposedText: '',
                            expiresAt: Date.now() + 60000,
                        }];
                case 3:
                    error_7 = _d.sent();
                    console.warn('[ToolCalling] Falha ao recuperar confirmacao implicita de criar_agente:', error_7);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function tryRecoverMissingToolExecution(params) {
    return __awaiter(this, void 0, void 0, function () {
        var phoneNumber, userId, messageText, assistantResponse, conversationHistory, mediaType, mediaUrl, pendingMedia, historySummary, recoveryPrompt, response, rawText, jsonText, parsed, descricaoMudanca, pendingConfirmationAction, name_3, whenToUse, description, pendingConfirmationAction, error_8;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    phoneNumber = params.phoneNumber, userId = params.userId, messageText = params.messageText, assistantResponse = params.assistantResponse, conversationHistory = params.conversationHistory, mediaType = params.mediaType, mediaUrl = params.mediaUrl, pendingMedia = params.pendingMedia;
                    if (!userId) {
                        return [2 /*return*/, null];
                    }
                    historySummary = conversationHistory
                        .slice(-10)
                        .map(function (msg) { return "".concat(msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE', ": ").concat(msg.content); })
                        .join('\n');
                    recoveryPrompt = "Voc\u00C3\u00AA est\u00C3\u00A1 validando uma resposta do admin do AgenteZap.\n\nPROBLEMA A EVITAR:\n- O assistente N\u00C3\u0192O pode dizer que j\u00C3\u00A1 alterou o prompt ou j\u00C3\u00A1 salvou uma m\u00C3\u00ADdia se nenhuma ferramenta foi executada neste turno.\n\nConversa recente:\n".concat(historySummary, "\n\nMensagem atual do cliente:\n").concat(messageText, "\n\nResposta gerada neste turno:\n").concat(assistantResponse, "\n\nM\u00C3\u00ADdia dispon\u00C3\u00ADvel no contexto:\n- mediaType atual: ").concat(mediaType || 'nenhum', "\n- mediaUrl atual: ").concat(mediaUrl || 'nenhuma', "\n- pendingMedia: ").concat(pendingMedia ? JSON.stringify(pendingMedia) : 'nenhuma', "\n\nSe a resposta acima est\u00C3\u00A1 apenas esclarecendo, perguntando ou ainda aguardando confirma\u00C3\u00A7\u00C3\u00A3o, retorne action=\"none\".\nSe a resposta acima est\u00C3\u00A1 afirmando ou implicando que uma altera\u00C3\u00A7\u00C3\u00A3o de prompt j\u00C3\u00A1 foi feita, e a conversa j\u00C3\u00A1 traz a instru\u00C3\u00A7\u00C3\u00A3o confirmada, retorne action=\"edit_prompt\" e preencha descricaoMudanca.\nSe a resposta acima est\u00C3\u00A1 afirmando ou implicando que uma m\u00C3\u00ADdia j\u00C3\u00A1 foi salva, e a conversa j\u00C3\u00A1 traz nome + quando usar, retorne action=\"save_media\" com name/whenToUse/description.\n\nRegras:\n- S\u00C3\u00B3 retorne uma a\u00C3\u00A7\u00C3\u00A3o quando a conversa j\u00C3\u00A1 tiver informa\u00C3\u00A7\u00C3\u00A3o suficiente para EXECUTAR agora.\n- N\u00C3\u00A3o invente mediaUrl; a URL j\u00C3\u00A1 vem do contexto.\n- N\u00C3\u00A3o retorne \"edit_prompt\" se ainda faltar defini\u00C3\u00A7\u00C3\u00A3o essencial do que mudar.\n- N\u00C3\u00A3o retorne \"save_media\" se ainda faltar nome ou whenToUse.\n\nResponda SOMENTE com JSON v\u00C3\u00A1lido:\n{\"action\":\"edit_prompt|save_media|none\",\"descricaoMudanca\":\"...\",\"name\":\"...\",\"whenToUse\":\"...\",\"description\":\"...\"}");
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: [{ role: 'system', content: recoveryPrompt }],
                            maxTokens: 260,
                            temperature: 0.1,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _d.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    jsonText = extractJsonObject(rawText);
                    if (!jsonText)
                        return [2 /*return*/, null];
                    parsed = JSON.parse(jsonText);
                    if (parsed.action === 'edit_prompt') {
                        descricaoMudanca = String(parsed.descricaoMudanca || '').trim();
                        if (!descricaoMudanca)
                            return [2 /*return*/, null];
                        pendingConfirmationAction = buildPendingConfirmationAction('editar_prompt', { descricaoMudanca: descricaoMudanca }, phoneNumber);
                        if (pendingConfirmationAction) {
                            console.log('[ToolCalling] RecuperaÃ§Ã£o converteu falso positivo de editar_prompt em confirmaÃ§Ã£o pendente');
                            return [2 /*return*/, {
                                    responseText: pendingConfirmationAction.proposedText,
                                    newPendingAction: pendingConfirmationAction,
                                }];
                        }
                        return [2 /*return*/, null];
                    }
                    if (parsed.action === 'save_media') {
                        name_3 = String(parsed.name || '').trim();
                        whenToUse = String(parsed.whenToUse || '').trim();
                        if (!name_3 || !whenToUse)
                            return [2 /*return*/, null];
                        description = String(parsed.description || '').trim() ||
                            (pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.description) ||
                            whenToUse;
                        pendingConfirmationAction = buildPendingConfirmationAction('salvar_midia', {
                            name: name_3,
                            whenToUse: whenToUse,
                            description: description,
                            mediaUrl: String((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.url) || mediaUrl || '').trim(),
                            mediaType: String((pendingMedia === null || pendingMedia === void 0 ? void 0 : pendingMedia.type) || mediaType || '').trim(),
                        }, phoneNumber);
                        if (pendingConfirmationAction) {
                            console.log('[ToolCalling] RecuperaÃ§Ã£o converteu falso positivo de salvar_midia em confirmaÃ§Ã£o pendente');
                            return [2 /*return*/, {
                                    responseText: pendingConfirmationAction.proposedText,
                                    newPendingAction: pendingConfirmationAction,
                                }];
                        }
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_8 = _d.sent();
                    console.warn('[ToolCalling] Falha ao recuperar ferramenta ausente apÃ³s falso positivo:', error_8);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main export â€” Multi-turn tool calling loop
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var MAX_TOOL_ROUNDS = 3;
function processToolCallingMessage(phoneNumber, messageText, userId, conversationHistory, pendingAction, agentConfig, contactName, mediaType, mediaUrl, sendIntermediateMessage, pendingMedia, recentMediaBuffer) {
    return __awaiter(this, void 0, void 0, function () {
        var shouldClearPendingAction, hasDeliveredTestLink, shouldRescueSimulatorLink, _a, _b, toolResult, parsed, error_9, recoveredCreateAction, result, executionUserId, result, decision, executionUserId, result, currentDescription, mergedDescription, refreshedPendingAction, context, systemPrompt, historySlice, messages, mistral_1, finalResponse, consumedPendingMedia, callMistralWithRetry, round, response, choice, assistantMessage, toolCalls, _i, toolCalls_1, tc, fnName, fnArgs, err_5, toolResult, parsed, parsed, rawFailureText, parsed, rawFailureText, parsed, rawFailureText, parsed, rawFailureText, finalResp, sanitized, toolMsgs, preserved, withAutologin, withCreds, withNormalizedPlanReply, recoveredMissingTool, recovered, inferredPendingAction, mediaResolved, err_6, toolResultMessages, results, combinedResult, sanitizedCombined, preservedCombined, withAutologinCombined, withCredsCombined, consumedPendingMedia, mediaResolved;
        var _this = this;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    console.log("[ToolCalling] Processando mensagem de ".concat(phoneNumber, ", userId=").concat(userId || 'novo', ", msg=\"").concat(messageText.slice(0, 60), "\""));
                    shouldClearPendingAction = false;
                    hasDeliveredTestLink = conversationHistoryHasSimulatorLink(conversationHistory);
                    if (pendingAction && (pendingAction.type === 'criar_agente' || pendingAction.type === 'edit_prompt' || pendingAction.type === 'save_media' || pendingAction.type === 'registrar_pagamento')) {
                        pendingAction = normalizePendingConfirmationAction(pendingAction);
                    }
                    if (!pendingAction) return [3 /*break*/, 8];
                    shouldClearPendingAction = true;
                    if (!(userId && pendingAction.type === 'criar_agente')) return [3 /*break*/, 8];
                    _a = !hasDeliveredTestLink;
                    if (!_a) return [3 /*break*/, 3];
                    _b = isExplicitPendingConfirmationReply(messageText, pendingAction);
                    if (_b) return [3 /*break*/, 2];
                    return [4 /*yield*/, shouldRescueSimulatorLinkWithLLM({
                            messageText: messageText,
                            conversationHistory: conversationHistory,
                            pendingAction: pendingAction,
                        })];
                case 1:
                    _b = (_m.sent());
                    _m.label = 2;
                case 2:
                    _a = (_b);
                    _m.label = 3;
                case 3:
                    shouldRescueSimulatorLink = _a;
                    if (!shouldRescueSimulatorLink) return [3 /*break*/, 7];
                    _m.label = 4;
                case 4:
                    _m.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, executeToolCall('gerar_link_simulador', {}, userId, phoneNumber)];
                case 5:
                    toolResult = _m.sent();
                    parsed = JSON.parse(toolResult);
                    if ((parsed === null || parsed === void 0 ? void 0 : parsed.success) && (parsed === null || parsed === void 0 ? void 0 : parsed.message)) {
                        console.log('[ToolCalling] Recuperando link do simulador para pendingAction stale de criar_agente');
                        return [2 /*return*/, {
                                responseText: normalizeSimulatorLinkDeliveryText(String(parsed.message)),
                                clearPendingAction: true,
                            }];
                    }
                    return [3 /*break*/, 7];
                case 6:
                    error_9 = _m.sent();
                    console.warn('[ToolCalling] Falha ao recuperar link do simulador para conta ja criada:', error_9);
                    return [3 /*break*/, 7];
                case 7:
                    console.log('[ToolCalling] Limpando pendingAction stale de criar_agente para cliente que ja possui conta');
                    pendingAction = undefined;
                    _m.label = 8;
                case 8:
                    if (!(!pendingAction && !userId)) return [3 /*break*/, 11];
                    return [4 /*yield*/, tryRecoverImplicitCreateConfirmation({
                            messageText: messageText,
                            phoneNumber: phoneNumber,
                            conversationHistory: conversationHistory,
                        })];
                case 9:
                    recoveredCreateAction = _m.sent();
                    if (!recoveredCreateAction) return [3 /*break*/, 11];
                    return [4 /*yield*/, executePendingActionWithSilentRetry({
                            pendingAction: recoveredCreateAction,
                            executionUserId: phoneNumber,
                        })];
                case 10:
                    result = _m.sent();
                    return [2 /*return*/, {
                            responseText: result.responseText,
                            clearPendingAction: result.ok ? true : false,
                            newPendingAction: result.keepPendingAction,
                        }];
                case 11:
                    if (!pendingAction) return [3 /*break*/, 17];
                    shouldClearPendingAction = true;
                    if (!userId && pendingAction.type !== 'criar_agente') {
                        return [2 /*return*/, {
                                responseText: 'NÃ£o encontrei uma conta ativa para concluir aquela aÃ§Ã£o. Me diz o que vocÃª quer fazer e eu sigo por aqui.',
                                clearPendingAction: true,
                            }];
                    }
                    if (!(pendingAction.expiresAt >= Date.now())) return [3 /*break*/, 17];
                    if (!isExplicitPendingConfirmationReply(messageText, pendingAction)) return [3 /*break*/, 13];
                    executionUserId = userId || phoneNumber;
                    return [4 /*yield*/, executePendingActionWithSilentRetry({
                            pendingAction: pendingAction,
                            executionUserId: executionUserId,
                        })];
                case 12:
                    result = _m.sent();
                    return [2 /*return*/, {
                            responseText: result.responseText,
                            consumedPendingMedia: result.consumedPendingMedia,
                            clearPendingAction: result.ok ? true : false,
                            newPendingAction: result.keepPendingAction,
                        }];
                case 13:
                    if (isExplicitPendingCancelReply(messageText)) {
                        return [2 /*return*/, {
                                responseText: 'Perfeito. Deixei essa aÃ§Ã£o de lado. Me diz como vocÃª quer seguir.',
                                clearPendingAction: true,
                            }];
                    }
                    return [4 /*yield*/, decidePendingActionReply({
                            pendingAction: pendingAction,
                            messageText: messageText,
                            conversationHistory: conversationHistory,
                        })];
                case 14:
                    decision = _m.sent();
                    if (!(decision === 'confirm')) return [3 /*break*/, 16];
                    executionUserId = userId || phoneNumber;
                    return [4 /*yield*/, executePendingActionWithSilentRetry({
                            pendingAction: pendingAction,
                            executionUserId: executionUserId,
                        })];
                case 15:
                    result = _m.sent();
                    return [2 /*return*/, {
                            responseText: result.responseText,
                            consumedPendingMedia: result.consumedPendingMedia,
                            clearPendingAction: result.ok ? true : false,
                            newPendingAction: result.keepPendingAction,
                        }];
                case 16:
                    if (decision === 'cancel') {
                        return [2 /*return*/, {
                                responseText: 'Beleza, nÃ£o apliquei essa aÃ§Ã£o. Me diz como vocÃª quer seguir.',
                                clearPendingAction: true,
                            }];
                    }
                    if (decision === 'modify') {
                        if (pendingAction.type === 'criar_agente') {
                            currentDescription = firstNonEmptyString(pendingAction.payload.descricaoAtendimento, pendingAction.payload.attendanceDescription, pendingAction.payload.promptDescription, pendingAction.payload.instructions, pendingAction.payload.prompt);
                            mergedDescription = [currentDescription, String(messageText || '').trim()]
                                .filter(Boolean)
                                .join('. ');
                            refreshedPendingAction = buildPendingConfirmationAction('criar_agente', __assign(__assign({}, pendingAction.payload), { descricaoAtendimento: mergedDescription }), phoneNumber);
                            if (refreshedPendingAction) {
                                return [2 /*return*/, {
                                        responseText: refreshedPendingAction.proposedText,
                                        newPendingAction: refreshedPendingAction,
                                    }];
                            }
                        }
                    }
                    if (decision === 'unclear') {
                        return [2 /*return*/, {
                                responseText: pendingActionAlreadyAsksForConfirmation(pendingAction.proposedText)
                                    ? pendingAction.proposedText
                                    : "".concat(pendingAction.proposedText, "\n\nSe estiver certo, me confirma. Se quiser ajustar algo antes, me fala o que mudar."),
                                newPendingAction: pendingAction,
                            }];
                    }
                    _m.label = 17;
                case 17: return [4 /*yield*/, gatherClientContext(userId)];
                case 18:
                    context = _m.sent();
                    systemPrompt = buildToolCallingSystemPrompt(phoneNumber, userId, __assign(__assign({}, context), { agentConfig: agentConfig, contactName: contactName, pendingMedia: pendingMedia, recentMediaBuffer: recentMediaBuffer, hasDeliveredTestLink: hasDeliveredTestLink }));
                    historySlice = conversationHistory.slice(-20);
                    messages = __spreadArray(__spreadArray([
                        { role: 'system', content: systemPrompt }
                    ], historySlice.map(function (m) { return ({ role: m.role, content: m.content }); }), true), [
                        { role: 'user', content: messageText },
                    ], false);
                    // Add media annotation if present
                    if (mediaType && mediaType !== 'text' && mediaType !== 'chat' && mediaUrl) {
                        messages.push({
                            role: 'user',
                            content: "[O cliente enviou uma midia do tipo \"".concat(mediaType, "\". URL: ").concat(mediaUrl, "]"),
                        });
                        messages.push({
                            role: 'user',
                            content: !userId
                                ? '[SISTEMA: Esta midia foi enviada apenas para contextualizar o negocio durante o onboarding. Use o conteudo como contexto para criar a conta e entender a operacao. Nao entre em cadastro de midia nem pergunte quando o agente deve usar esse arquivo, a menos que o lead peca isso explicitamente.]'
                                : '[SISTEMA: Esta midia pode ser apenas o meio pelo qual o cliente falou com voce. Trate a transcricao/conteudo como conversa normal. Nao presuma cadastro de midia so porque ele enviou audio, imagem, video ou documento. So entre em salvar_midia se o cliente pedir explicitamente para cadastrar esse arquivo no agente, ou se estiver completando/confirmando uma midia pendente. Se a intencao principal for outra, nao mencione o arquivo na resposta.]',
                        });
                    }
                    _m.label = 19;
                case 19:
                    _m.trys.push([19, 42, , 46]);
                    return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 20:
                    mistral_1 = _m.sent();
                    finalResponse = '';
                    consumedPendingMedia = false;
                    callMistralWithRetry = function (params_1) {
                        var args_1 = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            args_1[_i - 1] = arguments[_i];
                        }
                        return __awaiter(_this, __spreadArray([params_1], args_1, true), void 0, function (params, retries) {
                            var _loop_3, attempt, state_1;
                            var _a, _b;
                            if (retries === void 0) { retries = 2; }
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        _loop_3 = function (attempt) {
                                            var _d, err_7, is429, delay_1;
                                            return __generator(this, function (_e) {
                                                switch (_e.label) {
                                                    case 0:
                                                        _e.trys.push([0, 2, , 5]);
                                                        _d = {};
                                                        return [4 /*yield*/, mistral_1.chat.complete(params)];
                                                    case 1: return [2 /*return*/, (_d.value = _e.sent(), _d)];
                                                    case 2:
                                                        err_7 = _e.sent();
                                                        is429 = (err_7 === null || err_7 === void 0 ? void 0 : err_7.statusCode) === 429 || ((_a = err_7 === null || err_7 === void 0 ? void 0 : err_7.message) === null || _a === void 0 ? void 0 : _a.includes('429')) || ((_b = err_7 === null || err_7 === void 0 ? void 0 : err_7.message) === null || _b === void 0 ? void 0 : _b.includes('Rate limit'));
                                                        if (!(is429 && attempt < retries)) return [3 /*break*/, 4];
                                                        delay_1 = (attempt + 1) * 2000;
                                                        console.log("[ToolCalling] Rate limit 429 \u00E2\u20AC\u201D retry ".concat(attempt + 1, " em ").concat(delay_1, "ms"));
                                                        return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, delay_1); })];
                                                    case 3:
                                                        _e.sent();
                                                        return [2 /*return*/, "continue"];
                                                    case 4: throw err_7;
                                                    case 5: return [2 /*return*/];
                                                }
                                            });
                                        };
                                        attempt = 0;
                                        _c.label = 1;
                                    case 1:
                                        if (!(attempt <= retries)) return [3 /*break*/, 4];
                                        return [5 /*yield**/, _loop_3(attempt)];
                                    case 2:
                                        state_1 = _c.sent();
                                        if (typeof state_1 === "object")
                                            return [2 /*return*/, state_1.value];
                                        _c.label = 3;
                                    case 3:
                                        attempt++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        });
                    };
                    round = 0;
                    _m.label = 21;
                case 21:
                    if (!(round < MAX_TOOL_ROUNDS)) return [3 /*break*/, 33];
                    console.log("[ToolCalling] Round ".concat(round + 1, "/").concat(MAX_TOOL_ROUNDS));
                    return [4 /*yield*/, callMistralWithRetry({
                            model: 'mistral-small-latest',
                            messages: messages,
                            tools: TOOL_DEFINITIONS,
                            toolChoice: 'auto',
                            maxTokens: 1024,
                            temperature: 0.4,
                        })];
                case 22:
                    response = _m.sent();
                    choice = (_c = response.choices) === null || _c === void 0 ? void 0 : _c[0];
                    if (!choice) {
                        console.error('[ToolCalling] LLM retornou sem choices');
                        return [3 /*break*/, 33];
                    }
                    assistantMessage = choice.message;
                    toolCalls = assistantMessage === null || assistantMessage === void 0 ? void 0 : assistantMessage.toolCalls;
                    // If no tool calls, we have the final text response
                    if (!toolCalls || toolCalls.length === 0) {
                        finalResponse = (assistantMessage === null || assistantMessage === void 0 ? void 0 : assistantMessage.content) || '';
                        console.log("[ToolCalling] Resposta final (round ".concat(round + 1, "): \"").concat(finalResponse.slice(0, 100), "...\""));
                        return [3 /*break*/, 33];
                    }
                    // Add assistant message with tool calls to history
                    messages.push(assistantMessage);
                    _i = 0, toolCalls_1 = toolCalls;
                    _m.label = 23;
                case 23:
                    if (!(_i < toolCalls_1.length)) return [3 /*break*/, 30];
                    tc = toolCalls_1[_i];
                    fnName = ((_d = tc.function) === null || _d === void 0 ? void 0 : _d.name) || '';
                    fnArgs = {};
                    try {
                        fnArgs = typeof ((_e = tc.function) === null || _e === void 0 ? void 0 : _e.arguments) === 'string'
                            ? JSON.parse(tc.function.arguments)
                            : ((_f = tc.function) === null || _f === void 0 ? void 0 : _f.arguments) || {};
                    }
                    catch (_o) {
                        console.warn("[ToolCalling] Falha ao parsear argumentos do tool ".concat(fnName));
                    }
                    fnArgs = normalizeToolArguments(fnName, fnArgs);
                    console.log("[ToolCalling] Tool call: ".concat(fnName, "(").concat(JSON.stringify(fnArgs).slice(0, 150), ")"));
                    if (!(false && fnName === 'criar_agente' && sendIntermediateMessage)) return [3 /*break*/, 27];
                    _m.label = 24;
                case 24:
                    _m.trys.push([24, 26, , 27]);
                    return [4 /*yield*/, sendIntermediateMessage('â³ Estou preparando sua conta de teste agora, um momento...')];
                case 25:
                    _m.sent();
                    console.log('[ToolCalling] Mensagem intermediÃ¡ria enviada antes de criar_agente');
                    return [3 /*break*/, 27];
                case 26:
                    err_5 = _m.sent();
                    console.warn('[ToolCalling] Falha ao enviar mensagem intermediÃ¡ria:', err_5);
                    return [3 /*break*/, 27];
                case 27: return [4 /*yield*/, executeToolCall(fnName, fnArgs, userId, phoneNumber, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, messageText)];
                case 28:
                    toolResult = _m.sent();
                    try {
                        parsed = JSON.parse(toolResult);
                        if ((parsed === null || parsed === void 0 ? void 0 : parsed.requiresConfirmation) && ((_g = parsed === null || parsed === void 0 ? void 0 : parsed.pendingAction) === null || _g === void 0 ? void 0 : _g.type) && (parsed === null || parsed === void 0 ? void 0 : parsed.message)) {
                            console.log("[ToolCalling] ".concat(fnName, ": aguardando confirma\u00C3\u00A7\u00C3\u00A3o expl\u00C3\u00ADcita antes de executar"));
                            return [2 /*return*/, {
                                    responseText: parsed.message,
                                    newPendingAction: parsed.pendingAction,
                                    clearPendingAction: false,
                                }];
                        }
                    }
                    catch (_p) {
                        // segue fluxo normal
                    }
                    // For direct action results, intercept technical failures before they can leak back to the client.
                    // criar_agente and editar_prompt are the most sensitive paths here because a retry/recovery
                    // is better than exposing an internal execution error in the WhatsApp conversation.
                    if (fnName === 'editar_prompt') {
                        try {
                            parsed = JSON.parse(toolResult);
                            if (parsed.success && parsed.message) {
                                return [2 /*return*/, {
                                        responseText: String(parsed.message).trim(),
                                        clearPendingAction: shouldClearPendingAction,
                                    }];
                            }
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch (_q) {
                            // segue fluxo normal
                        }
                    }
                    // V23k: For criar_agente, return tool result DIRECTLY â€” bypasses LLM reformatting
                    // which was fabricating fake emails/passwords and replacing simulator URLs
                    if (fnName === 'criar_agente') {
                        try {
                            parsed = JSON.parse(toolResult);
                            if (parsed.success && parsed.message) {
                                console.log('[ToolCalling] criar_agente: retornando resultado direto (bypass LLM reformat)');
                                return [2 /*return*/, {
                                        responseText: normalizeCreateAgentDeliveryText(parsed.message),
                                        clearPendingAction: shouldClearPendingAction,
                                    }];
                            }
                            if (parsed.success === false) {
                                console.warn('[ToolCalling] criar_agente falhou - retornando erro direto sem deixar a LLM inventar entrega');
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
                                    }];
                            }
                        }
                        catch ( /* parse failed, continue normal flow */_r) { /* parse failed, continue normal flow */ }
                    }
                    if (fnName === 'salvar_midia') {
                        try {
                            parsed = JSON.parse(toolResult);
                            if (parsed.success && parsed.message) {
                                consumedPendingMedia = true;
                                console.log('[ToolCalling] salvar_midia: retornando resultado direto para evitar confirmaÃ§Ã£o falsa');
                                return [2 /*return*/, { responseText: parsed.message, consumedPendingMedia: true, clearPendingAction: shouldClearPendingAction }];
                            }
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch ( /* parse failed, continue normal flow */_s) { /* parse failed, continue normal flow */ }
                    }
                    if (fnName === 'registrar_pagamento') {
                        try {
                            parsed = JSON.parse(toolResult);
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch ( /* parse failed, continue normal flow */_t) { /* parse failed, continue normal flow */ }
                    }
                    // Add tool result to messages for next round
                    messages.push({
                        role: 'tool',
                        toolCallId: tc.id,
                        name: fnName,
                        content: toolResult,
                    });
                    _m.label = 29;
                case 29:
                    _i++;
                    return [3 /*break*/, 23];
                case 30:
                    if (!(round === MAX_TOOL_ROUNDS - 1)) return [3 /*break*/, 32];
                    console.log('[ToolCalling] Max rounds atingido â€” forÃ§ando resposta de texto');
                    return [4 /*yield*/, callMistralWithRetry({
                            model: 'mistral-small-latest',
                            messages: messages,
                            maxTokens: 800,
                            temperature: 0.4,
                        })];
                case 31:
                    finalResp = _m.sent();
                    finalResponse = ((_k = (_j = (_h = finalResp.choices) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.message) === null || _k === void 0 ? void 0 : _k.content) || '';
                    _m.label = 32;
                case 32:
                    round++;
                    return [3 /*break*/, 21];
                case 33:
                    if (!finalResponse) return [3 /*break*/, 41];
                    return [4 /*yield*/, sanitizeAndInjectRealLinks(finalResponse, userId, phoneNumber)];
                case 34:
                    sanitized = _m.sent();
                    toolMsgs = messages.filter(function (m) { return m.role === 'tool'; });
                    preserved = preserveSimulatorUrlFromToolResults(sanitized, toolMsgs);
                    withAutologin = preserveAutologinUrlsFromToolResults(preserved, toolMsgs);
                    withCreds = preserveCredentialsFromToolResults(withAutologin, toolMsgs);
                    return [4 /*yield*/, normalizeAdminPlanResponse({
                            responseText: withCreds,
                            toolResultMessages: toolMsgs,
                            messageText: messageText,
                            userId: userId,
                            phoneNumber: phoneNumber,
                        })];
                case 35:
                    withNormalizedPlanReply = _m.sent();
                    return [4 /*yield*/, tryRecoverMissingToolExecution({
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: messageText,
                            assistantResponse: withNormalizedPlanReply,
                            conversationHistory: conversationHistory,
                            mediaType: mediaType,
                            mediaUrl: mediaUrl,
                            pendingMedia: pendingMedia,
                        })];
                case 36:
                    recoveredMissingTool = _m.sent();
                    if (recoveredMissingTool) {
                        return [2 /*return*/, __assign(__assign({}, recoveredMissingTool), { clearPendingAction: true })];
                    }
                    if (!(!consumedPendingMedia && pendingMedia)) return [3 /*break*/, 38];
                    return [4 /*yield*/, tryRecoverPendingMediaSave({
                            responseText: withNormalizedPlanReply,
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: messageText,
                            conversationHistory: conversationHistory,
                            pendingMedia: pendingMedia,
                        })];
                case 37:
                    recovered = _m.sent();
                    if (recovered) {
                        return [2 /*return*/, __assign(__assign({}, recovered), { clearPendingAction: shouldClearPendingAction })];
                    }
                    _m.label = 38;
                case 38: return [4 /*yield*/, inferPendingActionFromAssistantReply({
                        assistantResponse: withNormalizedPlanReply,
                        messageText: messageText,
                        phoneNumber: phoneNumber,
                        userId: userId,
                        conversationHistory: conversationHistory,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl,
                        pendingMedia: pendingMedia,
                    })];
                case 39:
                    inferredPendingAction = _m.sent();
                    if (inferredPendingAction) {
                        return [2 /*return*/, {
                                responseText: inferredPendingAction.proposedText,
                                consumedPendingMedia: consumedPendingMedia,
                                newPendingAction: inferredPendingAction,
                            }];
                    }
                    return [4 /*yield*/, resolveAdminMediaActions({
                            responseText: withNormalizedPlanReply,
                            messageText: messageText,
                            conversationHistory: conversationHistory,
                        })];
                case 40:
                    mediaResolved = _m.sent();
                    return [2 /*return*/, {
                            responseText: mediaResolved.responseText,
                            mediaActions: mediaResolved.mediaActions,
                            consumedPendingMedia: consumedPendingMedia,
                            clearPendingAction: shouldClearPendingAction,
                        }];
                case 41: return [3 /*break*/, 46];
                case 42:
                    err_6 = _m.sent();
                    console.error('[ToolCalling] Erro no tool calling nativo, tentando fallback JSON-in-text:', (err_6 === null || err_6 === void 0 ? void 0 : err_6.message) || err_6);
                    toolResultMessages = messages.filter(function (m) { return m.role === 'tool'; });
                    if (!(toolResultMessages.length > 0)) return [3 /*break*/, 45];
                    console.log("[ToolCalling] ".concat(toolResultMessages.length, " tool(s) j\u00C3\u00A1 executada(s) \u00E2\u20AC\u201D usando resultados diretos"));
                    results = toolResultMessages.map(function (m) {
                        try {
                            var parsed = JSON.parse(m.content);
                            return parsed.message || parsed.error || m.content;
                        }
                        catch (_a) {
                            return m.content;
                        }
                    });
                    combinedResult = results.join('\n\n');
                    if (!(combinedResult && combinedResult.length > 10)) return [3 /*break*/, 45];
                    return [4 /*yield*/, sanitizeAndInjectRealLinks(combinedResult, userId, phoneNumber)];
                case 43:
                    sanitizedCombined = _m.sent();
                    preservedCombined = preserveSimulatorUrlFromToolResults(sanitizedCombined, toolResultMessages);
                    withAutologinCombined = preserveAutologinUrlsFromToolResults(preservedCombined, toolResultMessages);
                    withCredsCombined = preserveCredentialsFromToolResults(withAutologinCombined, toolResultMessages);
                    consumedPendingMedia = toolResultMessages.some(function (m) {
                        if (m.name !== 'salvar_midia')
                            return false;
                        try {
                            var parsed = JSON.parse(m.content);
                            return Boolean(parsed === null || parsed === void 0 ? void 0 : parsed.success);
                        }
                        catch (_a) {
                            return false;
                        }
                    });
                    return [4 /*yield*/, resolveAdminMediaActions({
                            responseText: withCredsCombined,
                            messageText: String(((_l = messages[messages.length - 1]) === null || _l === void 0 ? void 0 : _l.content) || ''),
                            conversationHistory: messages
                                .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
                                .map(function (m) { return ({ role: m.role, content: String(m.content || '') }); }),
                        })];
                case 44:
                    mediaResolved = _m.sent();
                    return [2 /*return*/, {
                            responseText: mediaResolved.responseText,
                            mediaActions: mediaResolved.mediaActions,
                            consumedPendingMedia: consumedPendingMedia,
                            clearPendingAction: shouldClearPendingAction,
                        }];
                case 45: return [3 /*break*/, 46];
                case 46:
                    // 5. Fallback: JSON-in-text via chatComplete (works with any provider)
                    console.log('[ToolCalling] Usando fallback JSON-in-text');
                    return [2 /*return*/, processWithJsonFallback(messages, userId, phoneNumber, messageText, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, shouldClearPendingAction)];
            }
        });
    });
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// JSON-in-text fallback (when native tool calling fails)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function processWithJsonFallback(messages_1, userId_1, phoneNumber_1, messageText_1, mediaType_1, mediaUrl_1, pendingMedia_1, recentMediaBuffer_1) {
    return __awaiter(this, arguments, void 0, function (messages, userId, phoneNumber, messageText, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, pendingActionCleared) {
        var toolNames, fallbackInstruction, fallbackMessages, response, rawText, toolCalls, results, _i, toolCalls_2, tc, normalizedArgs, result, parsed, parsed, rawFailureText, parsed, rawFailureText, parsed, rawFailureText, parsed, rawFailureText, sanitizedFallback, toolMsgsFallback, preservedFallback, withAutologinFallback, withCredsFallback, fallbackConversationHistory, recoveredMissingTool_1, recovered, inferredPendingAction_1, mediaResolved_1, toolResultsSummary, mediaResolved_2, sanitizedNoTool, noToolConversationHistory, noToolMessageText, recoveredMissingTool, recovered, inferredPendingAction, mediaResolved, err_8, fallbackConversationHistory;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (pendingActionCleared === void 0) { pendingActionCleared = false; }
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    toolNames = TOOL_DEFINITIONS.map(function (t) { return t.function.name; }).join(', ');
                    fallbackInstruction = "\n\nINSTRU\u00C3\u2021\u00C3\u0192O ESPECIAL: Se voc\u00C3\u00AA precisar executar uma a\u00C3\u00A7\u00C3\u00A3o, inclua EXATAMENTE este formato JSON no in\u00C3\u00ADcio da sua resposta:\n```json\n{\"tool_calls\": [{\"name\": \"NOME_DA_FERRAMENTA\", \"arguments\": {PARAMETROS}}]}\n```\n\nFerramentas dispon\u00C3\u00ADveis: ".concat(toolNames, "\nDepois do JSON, escreva a mensagem normal para o cliente.\nSe N\u00C3\u0192O precisar de a\u00C3\u00A7\u00C3\u00A3o, responda normalmente sem JSON.");
                    fallbackMessages = messages.map(function (m, i) {
                        if (i === 0 && m.role === 'system') {
                            return { role: 'system', content: m.content + fallbackInstruction };
                        }
                        // Only include user/assistant/system messages (skip tool messages)
                        if (['user', 'assistant', 'system'].includes(m.role)) {
                            return { role: m.role, content: m.content || '' };
                        }
                        return null;
                    }).filter(Boolean);
                    _m.label = 1;
                case 1:
                    _m.trys.push([1, 22, , 23]);
                    return [4 /*yield*/, (0, llm_1.chatComplete)({
                            messages: fallbackMessages,
                            maxTokens: 1024,
                            temperature: 0.4,
                            skipMistralQueue: true,
                        })];
                case 2:
                    response = _m.sent();
                    rawText = ((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                    toolCalls = parseFallbackToolCalls(rawText);
                    if (!(toolCalls.length > 0)) return [3 /*break*/, 15];
                    // Remove JSON block from response text
                    rawText = rawText
                        .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
                        .replace(/\{[\s\S]*"tool_calls"[\s\S]*?\}/i, '')
                        .trim();
                    results = [];
                    _i = 0, toolCalls_2 = toolCalls;
                    _m.label = 3;
                case 3:
                    if (!(_i < toolCalls_2.length)) return [3 /*break*/, 6];
                    tc = toolCalls_2[_i];
                    normalizedArgs = normalizeToolArguments(tc.tool, tc.arguments);
                    return [4 /*yield*/, executeToolCall(tc.tool, normalizedArgs, userId, phoneNumber, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, messageText)];
                case 4:
                    result = _m.sent();
                    results.push(result);
                    try {
                        parsed = JSON.parse(result);
                        if ((parsed === null || parsed === void 0 ? void 0 : parsed.requiresConfirmation) && ((_d = parsed === null || parsed === void 0 ? void 0 : parsed.pendingAction) === null || _d === void 0 ? void 0 : _d.type) && (parsed === null || parsed === void 0 ? void 0 : parsed.message)) {
                            console.log("[ToolCalling-Fallback] ".concat(tc.tool, ": aguardando confirma\u00C3\u00A7\u00C3\u00A3o expl\u00C3\u00ADcita antes de executar"));
                            return [2 /*return*/, {
                                    responseText: parsed.message,
                                    newPendingAction: parsed.pendingAction,
                                    clearPendingAction: false,
                                }];
                        }
                    }
                    catch (_o) {
                        // segue fluxo normal
                    }
                    if (tc.tool === 'editar_prompt') {
                        try {
                            parsed = JSON.parse(result);
                            if (parsed.success && parsed.message) {
                                return [2 /*return*/, {
                                        responseText: String(parsed.message).trim(),
                                        clearPendingAction: pendingActionCleared,
                                    }];
                            }
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch ( /* continue */_p) { /* continue */ }
                    }
                    // V23k: For criar_agente, return tool result DIRECTLY (bypass LLM reformatting)
                    if (tc.tool === 'criar_agente') {
                        try {
                            parsed = JSON.parse(result);
                            if (parsed.success && parsed.message) {
                                console.log('[ToolCalling-Fallback] criar_agente: retornando resultado direto');
                                return [2 /*return*/, {
                                        responseText: normalizeCreateAgentDeliveryText(parsed.message),
                                        clearPendingAction: pendingActionCleared,
                                    }];
                            }
                            if (parsed.success === false) {
                                console.warn('[ToolCalling-Fallback] criar_agente falhou - retornando erro direto');
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
                                    }];
                            }
                        }
                        catch ( /* continue */_q) { /* continue */ }
                    }
                    if (tc.tool === 'salvar_midia') {
                        try {
                            parsed = JSON.parse(result);
                            if (parsed.success && parsed.message) {
                                console.log('[ToolCalling-Fallback] salvar_midia: retornando resultado direto');
                                return [2 /*return*/, { responseText: parsed.message, consumedPendingMedia: true, clearPendingAction: pendingActionCleared }];
                            }
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch ( /* continue */_r) { /* continue */ }
                    }
                    if (tc.tool === 'registrar_pagamento') {
                        try {
                            parsed = JSON.parse(result);
                            if (parsed.success === false) {
                                rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                                return [2 /*return*/, {
                                        responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
                                        clearPendingAction: false,
                                    }];
                            }
                        }
                        catch ( /* continue */_s) { /* continue */ }
                    }
                    _m.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    if (!rawText) return [3 /*break*/, 13];
                    return [4 /*yield*/, sanitizeAndInjectRealLinks(rawText, userId, phoneNumber)];
                case 7:
                    sanitizedFallback = _m.sent();
                    toolMsgsFallback = results.map(function (r) { return ({ role: 'tool', content: r }); });
                    preservedFallback = preserveSimulatorUrlFromToolResults(sanitizedFallback, toolMsgsFallback);
                    withAutologinFallback = preserveAutologinUrlsFromToolResults(preservedFallback, toolMsgsFallback);
                    withCredsFallback = preserveCredentialsFromToolResults(withAutologinFallback, toolMsgsFallback);
                    fallbackConversationHistory = messages
                        .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
                        .map(function (m) { return ({ role: m.role, content: String(m.content || '') }); });
                    return [4 /*yield*/, tryRecoverMissingToolExecution({
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: String(((_e = messages[messages.length - 1]) === null || _e === void 0 ? void 0 : _e.content) || ''),
                            assistantResponse: withCredsFallback,
                            conversationHistory: fallbackConversationHistory,
                            mediaType: mediaType,
                            mediaUrl: mediaUrl,
                            pendingMedia: pendingMedia,
                        })];
                case 8:
                    recoveredMissingTool_1 = _m.sent();
                    if (recoveredMissingTool_1) {
                        return [2 /*return*/, __assign(__assign({}, recoveredMissingTool_1), { clearPendingAction: true })];
                    }
                    if (!pendingMedia) return [3 /*break*/, 10];
                    return [4 /*yield*/, tryRecoverPendingMediaSave({
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: String(((_f = messages[messages.length - 1]) === null || _f === void 0 ? void 0 : _f.content) || ''),
                            conversationHistory: fallbackConversationHistory,
                            pendingMedia: pendingMedia,
                        })];
                case 9:
                    recovered = _m.sent();
                    if (recovered) {
                        return [2 /*return*/, __assign(__assign({}, recovered), { clearPendingAction: pendingActionCleared })];
                    }
                    _m.label = 10;
                case 10: return [4 /*yield*/, inferPendingActionFromAssistantReply({
                        assistantResponse: withCredsFallback,
                        messageText: String(((_g = messages[messages.length - 1]) === null || _g === void 0 ? void 0 : _g.content) || ''),
                        phoneNumber: phoneNumber,
                        userId: userId,
                        conversationHistory: fallbackConversationHistory,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl,
                        pendingMedia: pendingMedia,
                    })];
                case 11:
                    inferredPendingAction_1 = _m.sent();
                    if (inferredPendingAction_1) {
                        return [2 /*return*/, {
                                responseText: inferredPendingAction_1.proposedText,
                                newPendingAction: inferredPendingAction_1,
                            }];
                    }
                    return [4 /*yield*/, resolveAdminMediaActions({
                            responseText: withCredsFallback,
                            messageText: String(((_h = messages[messages.length - 1]) === null || _h === void 0 ? void 0 : _h.content) || ''),
                            conversationHistory: fallbackConversationHistory,
                        })];
                case 12:
                    mediaResolved_1 = _m.sent();
                    return [2 /*return*/, {
                            responseText: mediaResolved_1.responseText,
                            mediaActions: mediaResolved_1.mediaActions,
                            clearPendingAction: pendingActionCleared,
                        }];
                case 13:
                    toolResultsSummary = results.map(function (r) {
                        try {
                            var parsed = JSON.parse(r);
                            return parsed.message || parsed.error || r;
                        }
                        catch (_a) {
                            return r;
                        }
                    }).join('\n');
                    return [4 /*yield*/, resolveAdminMediaActions({
                            responseText: toolResultsSummary,
                            messageText: String(((_j = messages[messages.length - 1]) === null || _j === void 0 ? void 0 : _j.content) || ''),
                            conversationHistory: messages
                                .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
                                .map(function (m) { return ({ role: m.role, content: String(m.content || '') }); }),
                        })];
                case 14:
                    mediaResolved_2 = _m.sent();
                    return [2 /*return*/, {
                            responseText: mediaResolved_2.responseText,
                            mediaActions: mediaResolved_2.mediaActions,
                            clearPendingAction: pendingActionCleared,
                        }];
                case 15: return [4 /*yield*/, sanitizeAndInjectRealLinks(rawText || 'Desculpe, tive uma dificuldade tÃ©cnica. Como posso ajudar?', userId, phoneNumber)];
                case 16:
                    sanitizedNoTool = _m.sent();
                    noToolConversationHistory = messages
                        .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
                        .map(function (m) { return ({ role: m.role, content: String(m.content || '') }); });
                    noToolMessageText = String(((_k = messages[messages.length - 1]) === null || _k === void 0 ? void 0 : _k.content) || '');
                    return [4 /*yield*/, tryRecoverMissingToolExecution({
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: noToolMessageText,
                            assistantResponse: sanitizedNoTool,
                            conversationHistory: noToolConversationHistory,
                            mediaType: mediaType,
                            mediaUrl: mediaUrl,
                            pendingMedia: pendingMedia,
                        })];
                case 17:
                    recoveredMissingTool = _m.sent();
                    if (recoveredMissingTool) {
                        return [2 /*return*/, __assign(__assign({}, recoveredMissingTool), { clearPendingAction: true })];
                    }
                    if (!pendingMedia) return [3 /*break*/, 19];
                    return [4 /*yield*/, tryRecoverPendingMediaSave({
                            phoneNumber: phoneNumber,
                            userId: userId,
                            messageText: noToolMessageText,
                            conversationHistory: noToolConversationHistory,
                            pendingMedia: pendingMedia,
                        })];
                case 18:
                    recovered = _m.sent();
                    if (recovered) {
                        return [2 /*return*/, __assign(__assign({}, recovered), { clearPendingAction: pendingActionCleared })];
                    }
                    _m.label = 19;
                case 19: return [4 /*yield*/, inferPendingActionFromAssistantReply({
                        assistantResponse: sanitizedNoTool,
                        messageText: noToolMessageText,
                        phoneNumber: phoneNumber,
                        userId: userId,
                        conversationHistory: noToolConversationHistory,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl,
                        pendingMedia: pendingMedia,
                    })];
                case 20:
                    inferredPendingAction = _m.sent();
                    if (inferredPendingAction) {
                        return [2 /*return*/, {
                                responseText: inferredPendingAction.proposedText,
                                newPendingAction: inferredPendingAction,
                            }];
                    }
                    return [4 /*yield*/, resolveAdminMediaActions({
                            responseText: sanitizedNoTool,
                            messageText: noToolMessageText,
                            conversationHistory: noToolConversationHistory,
                        })];
                case 21:
                    mediaResolved = _m.sent();
                    return [2 /*return*/, {
                            responseText: mediaResolved.responseText,
                            mediaActions: mediaResolved.mediaActions,
                            clearPendingAction: pendingActionCleared,
                        }];
                case 22:
                    err_8 = _m.sent();
                    console.error('[ToolCalling] Fallback falhou:', (err_8 === null || err_8 === void 0 ? void 0 : err_8.message) || err_8);
                    fallbackConversationHistory = messages
                        .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
                        .map(function (m) { return ({ role: m.role, content: String(m.content || '') }); });
                    return [2 /*return*/, {
                            responseText: buildHumanFallbackReply({
                                messageText: String(((_l = messages[messages.length - 1]) === null || _l === void 0 ? void 0 : _l.content) || ''),
                                userId: userId,
                                conversationHistory: fallbackConversationHistory,
                            }),
                            clearPendingAction: pendingActionCleared,
                        }];
                case 23: return [2 /*return*/];
            }
        });
    });
}
