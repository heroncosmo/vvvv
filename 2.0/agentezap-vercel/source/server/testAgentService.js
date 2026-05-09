"use strict";
/**
 * Test Agent Service
 *
 * Centraliza a lgica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token vlido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e no o agente de vendas (Rodrigo).
 *
 *  SIMULADOR UNIFICADO: Agora usa EXATAMENTE o mesmo fluxo do WhatsApp
 * atravs da funo testAgentResponse que internamente chama generateAIResponse.
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
exports.expandSimulatorMediaAction = expandSimulatorMediaAction;
exports.handleTestAgentMessage = handleTestAgentMessage;
var aiAgent_1 = require("./aiAgent");
var mediaService_1 = require("./mediaService");
function normalizeAiContent(value) {
    if (typeof value === "string")
        return value;
    if (value == null)
        return "";
    return String(value);
}
function looksLikeTransientFailure(text) {
    var normalized = String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized)
        return true;
    return (normalized.includes("nao consegui processar") ||
        normalized.includes("ocorreu um erro ao processar") ||
        normalized.includes("houve um erro tecnico"));
}
function repairCommonMojibake(text) {
    var fixed = String(text || "");
    var replacements = [
        ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
        ["Ã£", "ã"], ["Ãµ", "õ"], ["Ã§", "ç"], ["Ãª", "ê"], ["Ã´", "ô"], ["Ã¢", "â"],
        ["Ã€", "À"], ["Ã", "Á"], ["Ã‰", "É"], ["Ã“", "Ó"], ["Ãš", "Ú"],
        ["â€”", "—"], ["â€“", "–"], ["â€¢", "•"], ["Â ", " "],
    ];
    for (var _i = 0, replacements_1 = replacements; _i < replacements_1.length; _i++) {
        var _a = replacements_1[_i], from = _a[0], to = _a[1];
        fixed = fixed.split(from).join(to);
    }
    return fixed;
}
function normalizeFlowItems(flowItems) {
    if (!Array.isArray(flowItems))
        return [];
    return __spreadArray([], flowItems, true).filter(function (item) { return item && typeof item === "object"; })
        .sort(function (a, b) {
        var orderA = Number.isFinite(a === null || a === void 0 ? void 0 : a.order) ? Number(a.order) : Number.isFinite(a === null || a === void 0 ? void 0 : a.displayOrder) ? Number(a.displayOrder) : 0;
        var orderB = Number.isFinite(b === null || b === void 0 ? void 0 : b.order) ? Number(b.order) : Number.isFinite(b === null || b === void 0 ? void 0 : b.displayOrder) ? Number(b.displayOrder) : 0;
        return orderA - orderB;
    });
}
function expandSimulatorMediaAction(action, mediaLibrary) {
    if (!action || typeof action !== "object")
        return [];
    if (action.type === "send_media_url" && action.media_url) {
        return [
            {
                type: "send_media_url",
                media_url: action.media_url,
                media_type: action.media_type || "image",
                caption: action.caption,
                media_name: action.media_name,
            },
        ];
    }
    if (action.type !== "send_media" || !action.media_name) {
        return [];
    }
    var targetMediaName = (0, mediaService_1.foldMediaName)(action.media_name);
    var mediaItem = mediaLibrary.find(function (m) { return (0, mediaService_1.foldMediaName)(m.name) === targetMediaName; });
    if (!mediaItem) {
        return [];
    }
    if (mediaItem.mediaType !== "flow") {
        return [
            {
                type: "send_media",
                media_name: action.media_name,
                media_url: mediaItem.storageUrl,
                media_type: mediaItem.mediaType,
                caption: mediaItem.caption || mediaItem.description,
            },
        ];
    }
    var expanded = [];
    for (var _i = 0, _a = normalizeFlowItems(mediaItem.flowItems); _i < _a.length; _i++) {
        var item = _a[_i];
        if (item.type === "text") {
            var text = String(item.text || "").trim();
            if (text) {
                expanded.push({
                    type: "send_text",
                    text: text,
                });
            }
            continue;
        }
        if (item.type === "media" && item.storageUrl) {
            expanded.push({
                type: "send_media_url",
                media_url: item.storageUrl,
                media_type: item.mediaType || "image",
                caption: item.caption || undefined,
                media_name: item.name || action.media_name,
            });
        }
    }
    return expanded;
}
function handleTestAgentMessage(params, deps) {
    return __awaiter(this, void 0, void 0, function () {
        var message, token, history, userId, sentMedias, sessionId, resolvedUserId, tokenInfo, agentConfig, conversationHistory, result, mediaActions, mediaLibrary, _i, _a, action, expandedActions, responseText, shouldRetry, shouldFallback, safeResponse, error_1, fallbackSessionId, response;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    message = params.message, token = params.token, history = params.history, userId = params.userId, sentMedias = params.sentMedias, sessionId = params.sessionId;
                    if (!message || !message.trim()) {
                        throw new Error("Mensagem obrigatoria");
                    }
                    resolvedUserId = userId;
                    if (!(!resolvedUserId && token && token !== "demo")) return [3 /*break*/, 2];
                    return [4 /*yield*/, deps.getTestToken(token)];
                case 1:
                    tokenInfo = _b.sent();
                    if (tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.userId) {
                        resolvedUserId = tokenInfo.userId;
                    }
                    _b.label = 2;
                case 2:
                    if (!resolvedUserId && token && token !== "demo") {
                        return [2 /*return*/, {
                                response: "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador e tente novamente.",
                                mode: "client_agent",
                            }];
                    }
                    if (!resolvedUserId) return [3 /*break*/, 11];
                    return [4 /*yield*/, deps.getAgentConfig(resolvedUserId)];
                case 3:
                    agentConfig = _b.sent();
                    // Se o token aponta para um usuario, NUNCA cair no Rodrigo.
                    // Se nao houver prompt configurado, devolver erro amigavel.
                    if (!(agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt)) {
                        return [2 /*return*/, {
                                response: "Seu agente ainda nao esta configurado para teste. Peca ao administrador para finalizar a configuracao do agente antes de usar este link.",
                                mode: "client_agent",
                                resolvedUserId: resolvedUserId,
                            }];
                    }
                    console.log('\n ');
                    console.log(' [TestAgentService] SIMULADOR UNIFICADO - Usando mesmo fluxo do WhatsApp');
                    console.log(' ');
                    conversationHistory = (history === null || history === void 0 ? void 0 : history.map(function (msg, idx) { return ({
                        id: "sim-".concat(idx),
                        chatId: "simulator",
                        text: msg.content,
                        fromMe: msg.role === "assistant",
                        timestamp: new Date(Date.now() - (history.length - idx) * 60000),
                        isFromAgent: msg.role === "assistant",
                    }); })) || [];
                    console.log(" [TestAgentService] Histrico: ".concat(conversationHistory.length, " msgs, Mdias enviadas: ").concat((sentMedias === null || sentMedias === void 0 ? void 0 : sentMedias.length) || 0));
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 10, , 11]);
                    return [4 /*yield*/, (0, aiAgent_1.testAgentResponse)(resolvedUserId, message, undefined, // Nao passar customPrompt aqui - usar o do banco
                        conversationHistory, sentMedias || [], "Visitante", sessionId || token || resolvedUserId)];
                case 5:
                    result = _b.sent();
                    mediaActions = [];
                    if (!(result.mediaActions && result.mediaActions.length > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, mediaService_1.getAgentMediaLibrary)(resolvedUserId)];
                case 6:
                    mediaLibrary = _b.sent();
                    for (_i = 0, _a = result.mediaActions; _i < _a.length; _i++) {
                        action = _a[_i];
                        expandedActions = expandSimulatorMediaAction(action, mediaLibrary);
                        if (expandedActions.length > 0) {
                            mediaActions.push.apply(mediaActions, expandedActions);
                        }
                    }
                    _b.label = 7;
                case 7:
                    console.log(' \n');
                    responseText = typeof result.text === "string" ? result.text : "";
                    shouldRetry = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
                    if (!shouldRetry) return [3 /*break*/, 9];
                    console.warn(" [TestAgentService] Resposta fraca/transiente detectada, tentando 1 retry");
                    return [4 /*yield*/, (0, aiAgent_1.testAgentResponse)(resolvedUserId, message, undefined, conversationHistory, sentMedias || [], "Visitante", sessionId || token || resolvedUserId)];
                case 8:
                    result = _b.sent();
                    responseText = typeof result.text === "string" ? result.text : "";
                    _b.label = 9;
                case 9:
                    shouldFallback = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
                    safeResponse = repairCommonMojibake(responseText);
                    return [2 /*return*/, {
                            response: shouldFallback ? "Desculpe, nao consegui processar." : safeResponse,
                            mediaActions: mediaActions,
                            deliveryOrderCreated: result.deliveryOrderCreated,
                            mode: "client_agent",
                            resolvedUserId: resolvedUserId,
                        }];
                case 10:
                    error_1 = _b.sent();
                    console.error(' [TestAgentService] Erro:', error_1);
                    return [2 /*return*/, {
                            response: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
                            mode: "client_agent",
                            resolvedUserId: resolvedUserId,
                        }];
                case 11:
                    fallbackSessionId = token || "test_".concat(Date.now());
                    return [4 /*yield*/, deps.processAdminMessage(fallbackSessionId, message, undefined, undefined, true)];
                case 12:
                    response = _b.sent();
                    if (!response) {
                        return [2 /*return*/, {
                                response: "Desculpa, nao consegui processar sua mensagem. Tenta novamente?",
                                mode: "sales_demo",
                            }];
                    }
                    return [2 /*return*/, {
                            response: repairCommonMojibake(response.text),
                            mediaActions: response.mediaActions,
                            mode: "sales_demo",
                        }];
            }
        });
    });
}
