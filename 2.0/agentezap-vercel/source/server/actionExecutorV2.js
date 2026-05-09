"use strict";
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
exports.getSimulatorTokenForUser = getSimulatorTokenForUser;
exports.buildSimulatorUrl = buildSimulatorUrl;
exports.getOrCreateSimulatorUrlForUser = getOrCreateSimulatorUrlForUser;
exports.executeAction = executeAction;
var promptHistoryService_1 = require("./promptHistoryService");
var mediaService_1 = require("./mediaService");
var autologinService_1 = require("./autologinService");
var storage_1 = require("./storage");
var llm_1 = require("./llm");
var db_1 = require("./db");
var mediaStorageService_1 = require("./mediaStorageService");
var adminAgentService_1 = require("./adminAgentService");
var adminPlanPricing_1 = require("./adminPlanPricing");
var adminPendingActionExecutionPolicy_1 = require("./adminPendingActionExecutionPolicy");
var adminReplyPolicy_1 = require("./adminReplyPolicy");
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Busca o token de simulador mais recente para um userId
 */
function getSimulatorTokenForUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, e_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.pool.query("SELECT token FROM admin_test_tokens\n       WHERE user_id = $1 AND expires_at > NOW()\n       ORDER BY created_at DESC LIMIT 1", [userId])];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.token) || null];
                case 2:
                    e_1 = _b.sent();
                    console.warn('[ExecutorV2] Erro ao buscar simulator token:', e_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Monta o link do simulador a partir de um token
 */
function buildSimulatorUrl(token) {
    var baseUrl = (process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
    return "".concat(baseUrl, "/test/").concat(token);
}
function getSimulatorIdentityForUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var agentConfig;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, storage_1.storage.getAgentConfig(userId).catch(function () { return null; })];
                case 1:
                    agentConfig = _a.sent();
                    return [2 /*return*/, {
                            agentName: firstNonEmptyString(agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.agentName, agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.name, agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.agentDisplayName, 'Agente') || 'Agente',
                            company: firstNonEmptyString(agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.company, agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.businessName, agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.nomeEmpresa, 'Empresa') || 'Empresa',
                        }];
            }
        });
    });
}
function getOrCreateSimulatorUrlForUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var existingToken, identity, createdToken;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getSimulatorTokenForUser(userId)];
                case 1:
                    existingToken = _a.sent();
                    if (existingToken) {
                        return [2 /*return*/, buildSimulatorUrl(existingToken)];
                    }
                    return [4 /*yield*/, getSimulatorIdentityForUser(userId)];
                case 2:
                    identity = _a.sent();
                    return [4 /*yield*/, (0, adminAgentService_1.generateTestToken)(userId, identity.agentName, identity.company)];
                case 3:
                    createdToken = _a.sent();
                    return [2 /*return*/, buildSimulatorUrl(createdToken.token)];
            }
        });
    });
}
var DEFAULT_MEDIA_MIME_TYPES = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/ogg; codecs=opus',
    document: 'application/octet-stream',
};
var MIME_TYPE_TO_EXTENSION = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
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
function normalizeCommercialToken(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function shouldUsePromo49Pricing(payload) {
    var commercialContext = normalizeCommercialToken([
        payload === null || payload === void 0 ? void 0 : payload.requestText,
        payload === null || payload === void 0 ? void 0 : payload.messageText,
        payload === null || payload === void 0 ? void 0 : payload.userMessage,
        payload === null || payload === void 0 ? void 0 : payload.currentMessage,
        payload === null || payload === void 0 ? void 0 : payload.conversationContext,
    ]
        .filter(Boolean)
        .join(" "));
    if (!commercialContext) {
        return false;
    }
    return ((commercialContext.includes("r$49") || commercialContext.includes(" 49 ") || commercialContext.endsWith(" 49")) &&
        (commercialContext.includes("agentezap") ||
            commercialContext.includes("plano") ||
            commercialContext.includes("mensal") ||
            commercialContext.includes("valor") ||
            commercialContext.includes("interesse")));
}
function normalizeMimeType(mediaType) {
    var candidates = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        candidates[_i - 1] = arguments[_i];
    }
    for (var _a = 0, candidates_1 = candidates; _a < candidates_1.length; _a++) {
        var candidate = candidates_1[_a];
        var normalized = String(candidate || '').trim();
        if (normalized) {
            return normalized;
        }
    }
    return DEFAULT_MEDIA_MIME_TYPES[mediaType] || 'application/octet-stream';
}
function getFileExtension(mimeType) {
    var normalized = mimeType.split(';')[0].trim().toLowerCase();
    return MIME_TYPE_TO_EXTENSION[mimeType.toLowerCase()] || MIME_TYPE_TO_EXTENSION[normalized] || 'bin';
}
function buildLibraryFileName(sourceUrl, mediaType, mimeType) {
    if (!(0, mediaStorageService_1.isBase64Url)(sourceUrl)) {
        try {
            var url = new URL(sourceUrl);
            var originalName = url.pathname.split('/').pop();
            if (originalName) {
                return decodeURIComponent(originalName);
            }
        }
        catch (_a) {
            // Ignore URL parsing errors and fall back to generated filename
        }
    }
    return "media-".concat(Date.now(), ".").concat(getFileExtension(mimeType));
}
function ingestMediaForLibrary(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, sourceUrl, mediaType, mimeTypeHint, buffer, detectedMimeType, matches, response, _a, _b, uploadResult;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = params.userId, sourceUrl = params.sourceUrl, mediaType = params.mediaType, mimeTypeHint = params.mimeTypeHint;
                    if (!(0, mediaStorageService_1.isBase64Url)(sourceUrl)) return [3 /*break*/, 1];
                    matches = sourceUrl.match(/^data:([^,]+);base64,(.+)$/);
                    if (!matches) {
                        throw new Error('Formato base64 de mídia inválido');
                    }
                    detectedMimeType = normalizeMimeType(mediaType, mimeTypeHint, matches[1]);
                    buffer = Buffer.from(matches[2], 'base64');
                    return [3 /*break*/, 4];
                case 1: return [4 /*yield*/, fetch(sourceUrl)];
                case 2:
                    response = _c.sent();
                    if (!response.ok) {
                        throw new Error("Falha ao baixar m\u00EDdia original: ".concat(response.status, " ").concat(response.statusText));
                    }
                    detectedMimeType = normalizeMimeType(mediaType, mimeTypeHint, response.headers.get('content-type'));
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, response.arrayBuffer()];
                case 3:
                    buffer = _b.apply(_a, [_c.sent()]);
                    _c.label = 4;
                case 4:
                    if (!buffer.length) {
                        throw new Error('A mídia recebida está vazia');
                    }
                    return [4 /*yield*/, (0, mediaStorageService_1.uploadMediaToStorage)(buffer, detectedMimeType, userId)];
                case 5:
                    uploadResult = _c.sent();
                    if (!(uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.url)) {
                        throw new Error('Falha ao reenviar mídia para o storage do cliente');
                    }
                    return [2 /*return*/, {
                            storageUrl: uploadResult.url,
                            fileName: buildLibraryFileName(sourceUrl, mediaType, detectedMimeType),
                            fileSize: uploadResult.size,
                            mimeType: detectedMimeType,
                        }];
            }
        });
    });
}
function waitBeforeRetry(delayMs) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delayMs); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function executeSensitiveActionWithRetry(actionType, run) {
    return __awaiter(this, void 0, void 0, function () {
        var policy, lastResult, lastError, attempt, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    policy = (0, adminPendingActionExecutionPolicy_1.getPendingActionExecutionPolicy)(actionType);
                    lastResult = null;
                    lastError = '';
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= policy.maxAttempts)) return [3 /*break*/, 8];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, run()];
                case 3:
                    result = _a.sent();
                    lastResult = result;
                    if (result.success || !(0, adminPendingActionExecutionPolicy_1.isTechnicalFailureMessage)(result.responseText) || attempt === policy.maxAttempts) {
                        return [2 /*return*/, result];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    lastError = error_1 instanceof Error ? error_1.message : String(error_1 || '');
                    if (attempt === policy.maxAttempts) {
                        return [3 /*break*/, 8];
                    }
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, waitBeforeRetry(policy.retryBaseDelayMs * attempt)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    attempt++;
                    return [3 /*break*/, 1];
                case 8:
                    if (lastResult) {
                        return [2 /*return*/, lastResult];
                    }
                    return [2 /*return*/, {
                            success: false,
                            responseText: "Ocorreu um erro interno ao concluir ".concat(actionType, "."),
                        }];
            }
        });
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
function getPLANS_INFO() {
    return (0, adminPlanPricing_1.buildAdminPlanReplyText)({ includeSupportLine: false });
}
function resolveAdminPlanFocusFromPayload(payload) {
    var rawFocus = String((payload === null || payload === void 0 ? void 0 : payload.focus) || '').trim().toLowerCase();
    if (rawFocus === 'annual' || rawFocus === 'monthly' || rawFocus === 'both') {
        return rawFocus;
    }
    var requestText = firstNonEmptyString(payload === null || payload === void 0 ? void 0 : payload.requestText, payload === null || payload === void 0 ? void 0 : payload.messageText, payload === null || payload === void 0 ? void 0 : payload.userMessage, payload === null || payload === void 0 ? void 0 : payload.currentMessage);
    return (0, adminPlanPricing_1.detectAdminPlanFocusFromText)(requestText);
}
function getSafeAutologinUrl(userId, destination) {
    return __awaiter(this, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(userId && userId.length > 10)) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, autologinService_1.generateAutologinLinkWithRetry)(userId, destination)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    error_2 = _a.sent();
                    console.warn("[ExecutorV2] Falha ao gerar auto-login para ".concat(destination, ", usando link p\u00FAblico:"), error_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, (0, autologinService_1.buildPublicDestinationUrl)(destination)];
            }
        });
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
function executeAction(pendingAction, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, agentConfig, promptAtual, config, apiKey, instrucao, result, summary, responseText, _b, _c, err, e_2, sourceUrl, storageUrl, whenToUse, mediaType, rawFlowItems, normalizedFlowItems, index, item, itemType, text, itemUrl, itemMediaType, ingestedItem, flowInserted, simulatorBlock, _d, missing, name_1, description, ingestedMedia, parsedDuration, inserted, simulatorBlock, _e, e_3, url, e_4, fallbackUrl, focus_1, promo49, url, _f, e_5, focus_2, promo49, planLink, focus_3, promo49, _g, error_3, phoneNumber, session, agentConfig, resolvedCompanyName, resolvedBusinessSegment, resolvedServiceDescription, testResult, credentials, deliveryText, simulatorUrl, fullDelivery, shortDelivery, e_6, phoneNumber, comprovanteUrl, valorInformado, paymentId, mimeTypeHint, plansUrl, e_7;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    console.log("[ExecutorV2] Executando a\u00E7\u00E3o tipo=\"".concat(pendingAction.type, "\" para userId=").concat(userId));
                    _a = pendingAction.type;
                    switch (_a) {
                        case 'edit_prompt': return [3 /*break*/, 1];
                        case 'save_media': return [3 /*break*/, 9];
                        case 'GERAR_LINK_CONEXAO': return [3 /*break*/, 24];
                        case 'GERAR_LINK_PLANOS': return [3 /*break*/, 27];
                        case 'INFORMAR_PLANOS': return [3 /*break*/, 32];
                        case 'NENHUMA': return [3 /*break*/, 39];
                        case 'criar_agente': return [3 /*break*/, 40];
                        case 'registrar_pagamento': return [3 /*break*/, 43];
                    }
                    return [3 /*break*/, 48];
                case 1:
                    _h.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, storage_1.storage.getAgentConfig(userId)];
                case 2:
                    agentConfig = _h.sent();
                    promptAtual = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) || '';
                    return [4 /*yield*/, (0, llm_1.getLLMConfig)()];
                case 3:
                    config = _h.sent();
                    apiKey = config.mistralApiKey || process.env.MISTRAL_API_KEY || '';
                    instrucao = String(pendingAction.payload.descricaoMudanca || '');
                    console.log("[ExecutorV2] Editando prompt (".concat(promptAtual.length, " chars) com instru\u00E7\u00E3o: \"").concat(instrucao.slice(0, 80), "...\""));
                    return [4 /*yield*/, (0, promptHistoryService_1.editarPromptComHistorico)(userId, promptAtual, instrucao, apiKey)];
                case 4:
                    result = _h.sent();
                    if (!result.resultado.success) return [3 /*break*/, 6];
                    summary = result.resultado.summary || result.resultado.editSummary || '';
                    responseText = "\u2705 Prompt atualizado com sucesso!".concat(summary ? " ".concat(summary) : '');
                    // T4: Always include simulator link after editing prompt
                    _b = responseText;
                    _c = "\n\n\uD83D\uDD17 Teste como ficou: ".concat;
                    return [4 /*yield*/, getOrCreateSimulatorUrlForUser(userId)];
                case 5:
                    // T4: Always include simulator link after editing prompt
                    responseText = _b + _c.apply("\n\n\uD83D\uDD17 Teste como ficou: ", [_h.sent()]);
                    responseText += "\n\n".concat((0, adminReplyPolicy_1.buildAdminPanelPitch)('https://agentezap.online/meu-agente-ia'));
                    responseText = (0, adminReplyPolicy_1.clampAdminReplyLength)(responseText);
                    return [2 /*return*/, {
                            success: true,
                            responseText: responseText,
                        }];
                case 6:
                    err = result.resultado.error || 'erro desconhecido';
                    console.warn('[ExecutorV2] editarPromptComHistorico retornou failure:', err);
                    return [2 /*return*/, { success: false, responseText: "\u274C N\u00E3o foi poss\u00EDvel editar o prompt: ".concat(err) }];
                case 7: return [3 /*break*/, 9];
                case 8:
                    e_2 = _h.sent();
                    console.error('[ExecutorV2] Erro ao editar prompt:', e_2);
                    return [2 /*return*/, { success: false, responseText: '❌ Ocorreu um erro ao editar o prompt. Tente novamente.' }];
                case 9:
                    _h.trys.push([9, 23, , 24]);
                    sourceUrl = String(pendingAction.payload.mediaUrl || pendingAction.payload.storageUrl || '').trim();
                    storageUrl = sourceUrl;
                    whenToUse = String(pendingAction.payload.whenToUse || '').trim();
                    mediaType = String(pendingAction.payload.mediaType || 'image').trim().toLowerCase();
                    if (!(mediaType === 'flow')) return [3 /*break*/, 17];
                    rawFlowItems = Array.isArray(pendingAction.payload.flowItems)
                        ? pendingAction.payload.flowItems
                        : [];
                    if (!whenToUse || rawFlowItems.length < 2) {
                        return [2 /*return*/, {
                                success: false,
                                responseText: 'âŒ Para salvar esse fluxo, preciso do contexto de uso e de pelo menos 2 itens na sequÃªncia.',
                            }];
                    }
                    normalizedFlowItems = [];
                    index = 0;
                    _h.label = 10;
                case 10:
                    if (!(index < rawFlowItems.length)) return [3 /*break*/, 13];
                    item = rawFlowItems[index] || {};
                    itemType = String(item.type || '').trim().toLowerCase();
                    if (itemType === 'text') {
                        text = String(item.text || '').trim();
                        if (!text) {
                            return [2 /*return*/, {
                                    success: false,
                                    responseText: "\u00E2\u009D\u0152 O item ".concat(index + 1, " do fluxo est\u00C3\u00A1 vazio."),
                                }];
                        }
                        normalizedFlowItems.push({
                            id: String(item.id || "flow-text-".concat(index)),
                            order: index,
                            type: 'text',
                            text: text,
                        });
                        return [3 /*break*/, 12];
                    }
                    itemUrl = String(item.storageUrl || item.mediaUrl || '').trim();
                    itemMediaType = String(item.mediaType || '').trim().toLowerCase();
                    if (itemType !== 'media' || !itemUrl || !itemMediaType) {
                        return [2 /*return*/, {
                                success: false,
                                responseText: "\u00E2\u009D\u0152 O item ".concat(index + 1, " do fluxo precisa ser texto preenchido ou m\u00C3\u00ADdia v\u00C3\u00A1lida."),
                            }];
                    }
                    return [4 /*yield*/, ingestMediaForLibrary({
                            userId: userId,
                            sourceUrl: itemUrl,
                            mediaType: itemMediaType,
                            mimeTypeHint: String(item.mimeType || '').trim() || undefined,
                        })];
                case 11:
                    ingestedItem = _h.sent();
                    normalizedFlowItems.push({
                        id: String(item.id || "flow-media-".concat(index)),
                        order: index,
                        type: 'media',
                        storageUrl: ingestedItem.storageUrl,
                        mediaType: itemMediaType,
                        caption: String(item.caption || '').trim() || undefined,
                        fileName: String(item.fileName || '').trim() || ingestedItem.fileName,
                        mimeType: ingestedItem.mimeType,
                    });
                    _h.label = 12;
                case 12:
                    index++;
                    return [3 /*break*/, 10];
                case 13: return [4 /*yield*/, (0, mediaService_1.insertAgentMedia)({
                        userId: userId,
                        name: String(pendingAction.payload.name || '').trim() || "Fluxo ".concat(new Date().toLocaleDateString('pt-BR')),
                        storageUrl: '',
                        mediaType: 'flow',
                        whenToUse: whenToUse,
                        description: String(pendingAction.payload.description || '').trim() || whenToUse,
                        flowItems: normalizedFlowItems,
                        isActive: true,
                        sendAlone: false,
                        displayOrder: 0,
                    })];
                case 14:
                    flowInserted = _h.sent();
                    if (!flowInserted) return [3 /*break*/, 16];
                    _d = "\n\n\u00F0\u0178\u201D\u2014 Teste no simulador agora:\n".concat;
                    return [4 /*yield*/, getOrCreateSimulatorUrlForUser(userId)];
                case 15:
                    simulatorBlock = _d.apply("\n\n\u00F0\u0178\u201D\u2014 Teste no simulador agora:\n", [_h.sent()]);
                    return [2 /*return*/, {
                            success: true,
                            responseText: "\u00E2\u0153\u2026 Fluxo *".concat(flowInserted.name, "* salvo com sucesso!\nVou usar esse fluxo quando: \"").concat(whenToUse, "\".").concat(simulatorBlock),
                        }];
                case 16: return [2 /*return*/, { success: false, responseText: 'âŒ NÃ£o foi possÃ­vel salvar o fluxo. Tente novamente.' }];
                case 17:
                    // Validate required context: both URL and usage description must be present
                    if (!sourceUrl || !whenToUse) {
                        console.log('[ExecutorV2] Mídia incompleta: faltam URL ou contexto de uso');
                        missing = [];
                        if (!storageUrl)
                            missing.push('URL/localização da mídia');
                        if (!whenToUse)
                            missing.push('contexto de quando usar');
                        return [2 /*return*/, {
                                success: false,
                                responseText: "\u274C Para salvar a m\u00EDdia, preciso de mais informa\u00E7\u00F5es: ".concat(missing.join(' e '), ". Pode detalhar?"),
                            }];
                    }
                    name_1 = String(pendingAction.payload.name || '').trim() ||
                        "M\u00EDdia ".concat(new Date().toLocaleDateString('pt-BR'));
                    description = String(pendingAction.payload.description || '').trim() || whenToUse;
                    console.log("[ExecutorV2] Salvando m\u00EDdia \"".concat(name_1, "\" tipo \"").concat(mediaType, "\" com contexto: \"").concat(whenToUse.slice(0, 50), "...\""));
                    return [4 /*yield*/, ingestMediaForLibrary({
                            userId: userId,
                            sourceUrl: sourceUrl,
                            mediaType: mediaType,
                            mimeTypeHint: String(pendingAction.payload.mimeType || '').trim() || undefined,
                        })];
                case 18:
                    ingestedMedia = _h.sent();
                    parsedDuration = Number(pendingAction.payload.durationSeconds);
                    return [4 /*yield*/, (0, mediaService_1.insertAgentMedia)({
                            userId: userId,
                            name: name_1,
                            storageUrl: ingestedMedia.storageUrl,
                            mediaType: mediaType,
                            whenToUse: whenToUse,
                            description: description,
                            fileName: String(pendingAction.payload.fileName || '').trim() || ingestedMedia.fileName,
                            fileSize: ingestedMedia.fileSize,
                            mimeType: ingestedMedia.mimeType,
                            durationSeconds: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
                            caption: String(pendingAction.payload.caption || '').trim() || undefined,
                            transcription: String(pendingAction.payload.transcription || '').trim() || undefined,
                            isPtt: mediaType === 'audio' ? pendingAction.payload.isPtt !== false : undefined,
                        })];
                case 19:
                    inserted = _h.sent();
                    if (!inserted) return [3 /*break*/, 21];
                    _e = "\n\n\uD83D\uDD17 Teste no simulador agora:\n".concat;
                    return [4 /*yield*/, getOrCreateSimulatorUrlForUser(userId)];
                case 20:
                    simulatorBlock = _e.apply("\n\n\uD83D\uDD17 Teste no simulador agora:\n", [_h.sent()]);
                    return [2 /*return*/, {
                            success: true,
                            responseText: "\u2705 M\u00EDdia *".concat(inserted.name, "* salva com sucesso!\nVou us\u00E1-la quando: \"").concat(whenToUse, "\".").concat(simulatorBlock),
                        }];
                case 21: return [2 /*return*/, { success: false, responseText: '❌ Não foi possível salvar a mídia. Tente novamente.' }];
                case 22: return [3 /*break*/, 24];
                case 23:
                    e_3 = _h.sent();
                    console.error('[ExecutorV2] Erro ao salvar mídia:', e_3);
                    return [2 /*return*/, { success: false, responseText: '❌ Ocorreu um erro ao salvar a mídia. Tente novamente.' }];
                case 24:
                    _h.trys.push([24, 26, , 27]);
                    console.log('[ExecutorV2] Gerando link de conexão para userId:', userId);
                    return [4 /*yield*/, getSafeAutologinUrl(userId, '/conexao')];
                case 25:
                    url = _h.sent();
                    return [2 /*return*/, {
                            success: true,
                            responseText: "Aqui est\u00E1 seu link para conectar o WhatsApp:\n".concat(url, "\n\nEle fica v\u00E1lido por 60 minutos."),
                        }];
                case 26:
                    e_4 = _h.sent();
                    console.error('[ExecutorV2] Erro ao gerar link de conexão:', e_4);
                    fallbackUrl = (0, autologinService_1.buildPublicDestinationUrl)('/conexao');
                    return [2 /*return*/, {
                            success: true,
                            responseText: "Aqui esta seu link para conectar o WhatsApp:\n".concat(fallbackUrl, "\n\nSe quiser, eu tambem posso te orientar por aqui."),
                        }];
                case 27:
                    _h.trys.push([27, 31, , 32]);
                    console.log('[ExecutorV2] Gerando link de planos para userId:', userId);
                    focus_1 = resolveAdminPlanFocusFromPayload(pendingAction.payload);
                    promo49 = shouldUsePromo49Pricing(pendingAction.payload);
                    if (!promo49) return [3 /*break*/, 28];
                    _f = (0, adminPlanPricing_1.getAdminPlanDefaultUrl)(true);
                    return [3 /*break*/, 30];
                case 28: return [4 /*yield*/, getSafeAutologinUrl(userId, '/plans')];
                case 29:
                    _f = _h.sent();
                    _h.label = 30;
                case 30:
                    url = _f;
                    return [2 /*return*/, {
                            success: true,
                            responseText: (0, adminPlanPricing_1.buildAdminPlanReplyText)({ focus: focus_1, promo49: promo49, link: url }),
                        }];
                case 31:
                    e_5 = _h.sent();
                    console.error('[ExecutorV2] Erro ao gerar link de planos:', e_5);
                    focus_2 = resolveAdminPlanFocusFromPayload(pendingAction.payload);
                    promo49 = shouldUsePromo49Pricing(pendingAction.payload);
                    return [2 /*return*/, {
                            success: true,
                            responseText: (0, adminPlanPricing_1.buildAdminPlanReplyText)({
                                focus: focus_2,
                                promo49: promo49,
                                link: promo49 ? (0, adminPlanPricing_1.getAdminPlanDefaultUrl)(true) : (0, autologinService_1.buildPublicDestinationUrl)('/plans'),
                            }),
                        }];
                case 32:
                    console.log('[ExecutorV2] Retornando informações de planos');
                    planLink = void 0;
                    focus_3 = resolveAdminPlanFocusFromPayload(pendingAction.payload);
                    promo49 = shouldUsePromo49Pricing(pendingAction.payload);
                    if (!(userId && userId.length > 10)) return [3 /*break*/, 38];
                    _h.label = 33;
                case 33:
                    _h.trys.push([33, 37, , 38]);
                    if (!promo49) return [3 /*break*/, 34];
                    _g = (0, adminPlanPricing_1.getAdminPlanDefaultUrl)(true);
                    return [3 /*break*/, 36];
                case 34: return [4 /*yield*/, getSafeAutologinUrl(userId, '/plans')];
                case 35:
                    _g = _h.sent();
                    _h.label = 36;
                case 36:
                    planLink = _g;
                    return [3 /*break*/, 38];
                case 37:
                    error_3 = _h.sent();
                    console.warn('[ExecutorV2] Falha ao gerar auto login de planos, usando link padrão:', error_3);
                    return [3 /*break*/, 38];
                case 38: return [2 /*return*/, {
                        success: true,
                        responseText: (0, adminPlanPricing_1.buildAdminPlanReplyText)({ focus: focus_3, promo49: promo49, link: planLink || (0, adminPlanPricing_1.getAdminPlanDefaultUrl)(promo49) }),
                    }];
                case 39:
                    {
                        console.log('[ExecutorV2] Tipo NENHUMA — retornando proposedText');
                        return [2 /*return*/, { success: true, responseText: pendingAction.proposedText }];
                    }
                    _h.label = 40;
                case 40:
                    _h.trys.push([40, 42, , 43]);
                    phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
                    if (!phoneNumber) {
                        return [2 /*return*/, { success: false, responseText: '❌ Número de telefone não informado para criação de conta.' }];
                    }
                    session = (0, adminAgentService_1.getClientSession)(phoneNumber);
                    if (!session) {
                        session = (0, adminAgentService_1.createClientSession)(phoneNumber);
                    }
                    agentConfig = __assign({}, session.agentConfig);
                    resolvedCompanyName = firstNonEmptyString(pendingAction.payload.nomeEmpresa, pendingAction.payload.companyName, pendingAction.payload.company, pendingAction.payload.businessName, pendingAction.payload.nomeNegocio);
                    resolvedBusinessSegment = firstNonEmptyString(pendingAction.payload.ramoAtuacao, pendingAction.payload.businessSegment, pendingAction.payload.businessType, pendingAction.payload.segment, pendingAction.payload.ramo);
                    resolvedServiceDescription = firstNonEmptyString(pendingAction.payload.descricaoAtendimento, pendingAction.payload.attendanceDescription, pendingAction.payload.promptDescription, pendingAction.payload.instructions, pendingAction.payload.prompt);
                    if (resolvedCompanyName) {
                        agentConfig.company = resolvedCompanyName;
                    }
                    if (resolvedBusinessSegment) {
                        agentConfig.role = resolvedBusinessSegment;
                    }
                    if (resolvedServiceDescription) {
                        agentConfig.prompt = resolvedServiceDescription;
                    }
                    session = (0, adminAgentService_1.updateClientSession)(phoneNumber, { agentConfig: agentConfig });
                    console.log("[ExecutorV2] Criando agente para ".concat(phoneNumber, ": empresa=").concat(agentConfig.company, ", ramo=").concat(agentConfig.role));
                    return [4 /*yield*/, (0, adminAgentService_1.createTestAccountWithCredentials)(session)];
                case 41:
                    testResult = _h.sent();
                    if (!testResult.success || !testResult.email || !testResult.simulatorToken) {
                        return [2 /*return*/, {
                                success: false,
                                responseText: '❌ Não foi possível criar a conta de teste. Tente novamente em alguns segundos.',
                            }];
                    }
                    credentials = {
                        email: testResult.email,
                        password: testResult.password,
                        loginUrl: testResult.loginUrl || 'https://agentezap.online',
                        simulatorToken: testResult.simulatorToken,
                        isExistingAccount: testResult.isExistingAccount === true,
                    };
                    // Update session with account info
                    // V23j: NÃO sobrescrever userId — createTestAccountWithCredentials já definiu o UUID correto
                    (0, adminAgentService_1.updateClientSession)(phoneNumber, {
                        flowState: 'active',
                        email: credentials.email,
                        lastGeneratedPassword: credentials.password,
                    });
                    deliveryText = (0, adminAgentService_1.buildStructuredAccountDeliveryText)(session, credentials);
                    simulatorUrl = buildSimulatorUrl(credentials.simulatorToken);
                    fullDelivery = "".concat(deliveryText, "\n\nSe quiser acessar sua conta por dentro do sistema, estes s\u00E3o os dados:\nE-mail: ").concat(credentials.email, "\nSenha: ").concat(credentials.password, "\n\nSeu teste:\n").concat(simulatorUrl, "\n\nAbre o link, conversa com o agente e me fala o que voc\u00EA quer ajustar. Se fizer sentido para voc\u00EA, j\u00E1 d\u00E1 para conectar seu WhatsApp ainda no teste gratuito.");
                    shortDelivery = (0, adminReplyPolicy_1.clampAdminReplyLength)("".concat(deliveryText, "\n\nTeste: ").concat(simulatorUrl, "\n\n").concat((0, adminReplyPolicy_1.buildAdminPanelPitch)('https://agentezap.online/meu-agente-ia'), " Se fizer sentido, eu j\u00E1 te ajudo a assinar ou conectar o WhatsApp agora."));
                    console.log("[ExecutorV2] Agente criado: ".concat(credentials.email, " (token: ").concat(credentials.simulatorToken, ")"));
                    return [2 /*return*/, {
                            success: true,
                            responseText: shortDelivery,
                        }];
                case 42:
                    e_6 = _h.sent();
                    console.error('[ExecutorV2] Erro ao criar agente:', e_6);
                    return [2 /*return*/, { success: false, responseText: '❌ Ocorreu um erro ao criar o agente. Tente novamente.' }];
                case 43:
                    _h.trys.push([43, 47, , 48]);
                    phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
                    comprovanteUrl = String(pendingAction.payload.comprovanteUrl || '').trim();
                    valorInformado = String(pendingAction.payload.valorInformado || '').trim();
                    paymentId = String(pendingAction.payload.paymentId || '').trim();
                    mimeTypeHint = String(pendingAction.payload.mimeType || '').trim();
                    if (!!comprovanteUrl) return [3 /*break*/, 45];
                    return [4 /*yield*/, getSafeAutologinUrl(userId, '/plans')];
                case 44:
                    plansUrl = _h.sent();
                    return [2 /*return*/, {
                            success: false,
                            responseText: "Para registrar o pagamento oficialmente, eu preciso do comprovante anexado.\n\nUse este link:\n".concat(plansUrl, "\n\nLa voce abre o plano, gera o QR Code e clica em \"Eu ja paguei\" para enviar o comprovante pelo sistema."),
                        }];
                case 45: return [4 /*yield*/, registerPaymentReceiptFromWhatsApp({
                        userId: userId,
                        phoneNumber: phoneNumber,
                        sourceUrl: comprovanteUrl,
                        amount: valorInformado || undefined,
                        paymentId: paymentId || undefined,
                        mimeTypeHint: mimeTypeHint || undefined,
                    })];
                case 46:
                    _h.sent();
                    if (phoneNumber) {
                        (0, adminAgentService_1.updateClientSession)(phoneNumber, {
                            flowState: 'payment_pending',
                            awaitingPaymentProof: false,
                        });
                    }
                    return [2 /*return*/, {
                            success: true,
                            responseText: 'Pronto! Ja registrei seu comprovante oficialmente no sistema. Ele agora aparece no painel da equipe para conferencia e seu acesso ficou liberado.',
                        }];
                case 47:
                    e_7 = _h.sent();
                    console.error('[ExecutorV2] Erro ao registrar pagamento:', e_7);
                    return [2 /*return*/, { success: false, responseText: 'Ocorreu um erro ao registrar o pagamento. Tente novamente.' }];
                case 48:
                    {
                        console.warn('[ExecutorV2] Tipo de ação desconhecido:', pendingAction.type);
                        return [2 /*return*/, { success: false, responseText: '❌ Ação desconhecida.' }];
                    }
                    _h.label = 49;
                case 49: return [2 /*return*/];
            }
        });
    });
}
