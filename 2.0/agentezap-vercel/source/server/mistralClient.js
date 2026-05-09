"use strict";
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
exports.invalidateMistralKeyCache = invalidateMistralKeyCache;
exports.resolveApiKey = resolveApiKey;
exports.setMockMistralClient = setMockMistralClient;
exports.getMistralClient = getMistralClient;
exports.transcribeAudioWithMistral = transcribeAudioWithMistral;
exports.analyzeImageWithMistral = analyzeImageWithMistral;
exports.analyzeImageForAdmin = analyzeImageForAdmin;
exports.classifyMediaWithAI = classifyMediaWithAI;
exports.generateWithMistral = generateWithMistral;
var mistralai_1 = require("@mistralai/mistralai");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var apiKeyCache = null;
var openRouterKeyCache = null;
var API_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
/**
 * Invalida o cache da API key (usar quando a key for atualizada)
 */
function invalidateMistralKeyCache() {
    apiKeyCache = null;
    openRouterKeyCache = null;
    console.log("[Mistral] Cache da API key invalidado");
}
/**
 * Limpa a chave removendo espaços, quebras de linha e caracteres invisíveis
 */
function sanitizeApiKey(key) {
    return key.trim().replace(/[\r\n\t\s]/g, "");
}
function resolveApiKey() {
    return __awaiter(this, void 0, void 0, function () {
        var config, fromDb, cleanKey, error_1, envKey;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    // 🚀 CACHE: Verificar se já temos a key em cache
                    if (apiKeyCache && (Date.now() - apiKeyCache.timestamp < API_KEY_CACHE_TTL_MS)) {
                        return [2 /*return*/, apiKeyCache.key];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, "mistral_api_key"))
                            .limit(1)];
                case 2:
                    config = _b.sent();
                    fromDb = (_a = config[0]) === null || _a === void 0 ? void 0 : _a.valor;
                    if (fromDb && fromDb.length >= 32) {
                        cleanKey = sanitizeApiKey(fromDb);
                        console.log("[Mistral] Using API key from DATABASE (".concat(cleanKey.length, " chars)"));
                        // 🚀 Salvar no cache
                        apiKeyCache = { key: cleanKey, timestamp: Date.now() };
                        return [2 /*return*/, cleanKey];
                    }
                    else if (fromDb) {
                        console.warn("[Mistral] DB key exists but seems invalid (".concat(fromDb.length, " chars), trying environment..."));
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    console.warn("[Mistral] Failed to fetch API key from DB, trying environment...");
                    return [3 /*break*/, 4];
                case 4:
                    // 2. Fallback para variável de ambiente
                    if (process.env.MISTRAL_API_KEY) {
                        envKey = sanitizeApiKey(process.env.MISTRAL_API_KEY);
                        if (envKey.length >= 32) {
                            console.log("[Mistral] Using API key from ENVIRONMENT (".concat(envKey.length, " chars)"));
                            // 🚀 Salvar no cache
                            apiKeyCache = { key: envKey, timestamp: Date.now() };
                            return [2 /*return*/, envKey];
                        }
                        else {
                            console.warn("[Mistral] Environment key seems invalid (".concat(envKey.length, " chars)"));
                        }
                    }
                    // Allow empty key for testing if mock is set
                    if (globalMockClient)
                        return [2 /*return*/, "mock-key"];
                    throw new Error("Mistral API Key not configured or invalid (must be at least 32 chars)");
            }
        });
    });
}
function resolveConfigValue(key) {
    return __awaiter(this, void 0, void 0, function () {
        var config, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, key))
                            .limit(1)];
                case 1:
                    config = _c.sent();
                    return [2 /*return*/, ((_b = config[0]) === null || _b === void 0 ? void 0 : _b.valor) ? String(config[0].valor) : null];
                case 2:
                    _a = _c.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function resolveOpenRouterKey() {
    return __awaiter(this, void 0, void 0, function () {
        var fromDb, cleanKey, envKey;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (openRouterKeyCache && (Date.now() - openRouterKeyCache.timestamp < API_KEY_CACHE_TTL_MS)) {
                        return [2 /*return*/, openRouterKeyCache.key];
                    }
                    return [4 /*yield*/, resolveConfigValue("openrouter_api_key")];
                case 1:
                    fromDb = _a.sent();
                    if (fromDb && fromDb.length > 20) {
                        cleanKey = sanitizeApiKey(fromDb);
                        openRouterKeyCache = { key: cleanKey, timestamp: Date.now() };
                        console.log("[OpenRouter] Using API key from DATABASE (".concat(cleanKey.length, " chars)"));
                        return [2 /*return*/, cleanKey];
                    }
                    if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 20) {
                        envKey = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
                        openRouterKeyCache = { key: envKey, timestamp: Date.now() };
                        console.log("[OpenRouter] Using API key from ENVIRONMENT (".concat(envKey.length, " chars)"));
                        return [2 /*return*/, envKey];
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
function analyzeImageWithOpenRouter(imageUrl, prompt) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, candidateModels, _i, candidateModels_1, model, response, errorText, data, content, error_2;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, resolveOpenRouterKey()];
                case 1:
                    apiKey = _d.sent();
                    if (!apiKey) {
                        return [2 /*return*/, null];
                    }
                    candidateModels = [
                        "google/gemma-3-4b-it:free",
                        "qwen/qwen2.5-vl-72b-instruct:free",
                    ];
                    _i = 0, candidateModels_1 = candidateModels;
                    _d.label = 2;
                case 2:
                    if (!(_i < candidateModels_1.length)) return [3 /*break*/, 10];
                    model = candidateModels_1[_i];
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 8, , 9]);
                    console.log("[OpenRouter] Trying vision fallback with model: ".concat(model));
                    return [4 /*yield*/, fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                Authorization: "Bearer ".concat(apiKey),
                                "Content-Type": "application/json",
                                "HTTP-Referer": "https://agentezap.online",
                                "X-Title": "AgenteZap",
                            },
                            body: JSON.stringify({
                                model: model,
                                messages: [
                                    {
                                        role: "user",
                                        content: [
                                            { type: "text", text: prompt },
                                            {
                                                type: "image_url",
                                                image_url: {
                                                    url: imageUrl,
                                                },
                                            },
                                        ],
                                    },
                                ],
                                temperature: 0.0,
                                max_tokens: 300,
                            }),
                        })];
                case 4:
                    response = _d.sent();
                    if (!!response.ok) return [3 /*break*/, 6];
                    return [4 /*yield*/, response.text()];
                case 5:
                    errorText = _d.sent();
                    console.error("[OpenRouter] Vision fallback failed on ".concat(model, ": ").concat(response.status, " - ").concat(errorText));
                    return [3 /*break*/, 9];
                case 6: return [4 /*yield*/, response.json()];
                case 7:
                    data = _d.sent();
                    content = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                    if (typeof content === "string" && content.trim().length > 0) {
                        console.log("[OpenRouter] Vision fallback succeeded with model: ".concat(model));
                        return [2 /*return*/, content.trim()];
                    }
                    return [3 /*break*/, 9];
                case 8:
                    error_2 = _d.sent();
                    console.error("[OpenRouter] Vision fallback exception on ".concat(model, ":"), error_2);
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 2];
                case 10: return [2 /*return*/, null];
            }
        });
    });
}
var globalMockClient = null;
function setMockMistralClient(mock) {
    globalMockClient = mock;
}
function getMistralClient() {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (globalMockClient)
                        return [2 /*return*/, globalMockClient];
                    return [4 /*yield*/, resolveApiKey()];
                case 1:
                    apiKey = _a.sent();
                    return [2 /*return*/, new mistralai_1.Mistral({ apiKey: apiKey })];
            }
        });
    });
}
function transcribeAudioWithMistral(audioBuffer, options) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, model, response, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getMistralClient()];
                case 1:
                    mistral = _b.sent();
                    model = (options === null || options === void 0 ? void 0 : options.model) ||
                        process.env.MISTRAL_TRANSCRIPTION_MODEL ||
                        "voxtral-mini-latest";
                    return [4 /*yield*/, mistral.audio.transcriptions.complete({
                            model: model,
                            file: {
                                fileName: (options === null || options === void 0 ? void 0 : options.fileName) || "audio.ogg",
                                content: audioBuffer,
                            },
                            language: (_a = options === null || options === void 0 ? void 0 : options.language) !== null && _a !== void 0 ? _a : undefined,
                        })];
                case 2:
                    response = _b.sent();
                    if (!response || typeof response.text !== "string") {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, response.text.trim()];
                case 3:
                    error_3 = _b.sent();
                    console.error("Error transcribing audio with Mistral:", error_3);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function analyzeImageWithMistral(imageUrl_1) {
    return __awaiter(this, arguments, void 0, function (imageUrl, prompt) {
        var mistral, model, response, error_4;
        if (prompt === void 0) { prompt = "Descreva esta imagem detalhadamente para que eu possa entender o que é (ex: cardápio, produto, tabela de preços, etc)."; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 5]);
                    if (globalMockClient && globalMockClient.analyzeImageWithMistral) {
                        return [2 /*return*/, globalMockClient.analyzeImageWithMistral(imageUrl)];
                    }
                    return [4 /*yield*/, getMistralClient()];
                case 1:
                    mistral = _a.sent();
                    model = "pixtral-12b-2409";
                    return [4 /*yield*/, mistral.chat.complete({
                            model: model,
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        { type: "text", text: prompt },
                                        { type: "image_url", imageUrl: imageUrl }
                                    ]
                                }
                            ]
                        })];
                case 2:
                    response = _a.sent();
                    if (!response || !response.choices || response.choices.length === 0) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, response.choices[0].message.content];
                case 3:
                    error_4 = _a.sent();
                    console.error("Error analyzing image with Mistral:", error_4);
                    return [4 /*yield*/, analyzeImageWithOpenRouter(imageUrl, prompt)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Retorna resumo curto (uma etiqueta) e descrição detalhada para uso na conversa com o admin
function analyzeImageForAdmin(imageUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, model, userPrompt, response, raw, jsonTextMatch, jsonText, parsed, description, summary, error_5, fallbackRaw, jsonTextMatch, jsonText, parsed, description, summary;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 5]);
                    if (globalMockClient && globalMockClient.analyzeImageForAdmin) {
                        return [2 /*return*/, globalMockClient.analyzeImageForAdmin(imageUrl)];
                    }
                    return [4 /*yield*/, getMistralClient()];
                case 1:
                    mistral = _d.sent();
                    model = "pixtral-12b-2409";
                    userPrompt = "Por favor, analise a imagem fornecida e responda em JSON com duas chaves: " +
                        "\"summary\" (uma etiqueta curta, 2-4 palavras, sem pontua\u00E7\u00E3o, ex: cardapio, foto_produto, logo) e " +
                        "\"description\" (uma frase curta descrevendo o conte\u00FAdo, em portugu\u00EAs). Responda apenas o JSON.";
                    return [4 /*yield*/, mistral.chat.complete({
                            model: model,
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        { type: "text", text: userPrompt },
                                        { type: "image_url", imageUrl: imageUrl }
                                    ]
                                }
                            ],
                            maxTokens: 200,
                            temperature: 0.0,
                        })];
                case 2:
                    response = _d.sent();
                    raw = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
                    if (!raw || typeof raw !== 'string')
                        return [2 /*return*/, null];
                    jsonTextMatch = raw.match(/\{[\s\S]*\}/);
                    jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
                    try {
                        parsed = JSON.parse(jsonText);
                        return [2 /*return*/, {
                                summary: String(parsed.summary || parsed.tag || '').trim(),
                                description: String(parsed.description || parsed.desc || '').trim(),
                            }];
                    }
                    catch (e) {
                        description = raw.trim();
                        summary = description.split(/[.,;\n]/)[0].split(' ').slice(0, 3).join('_').toLowerCase();
                        return [2 /*return*/, { summary: summary, description: description }];
                    }
                    return [3 /*break*/, 5];
                case 3:
                    error_5 = _d.sent();
                    console.error('Error analyzing image for admin with Mistral:', error_5);
                    return [4 /*yield*/, analyzeImageWithOpenRouter(imageUrl, "Analise a imagem e responda em JSON com {\"summary\":\"etiqueta_curta\",\"description\":\"frase curta em portugues\"}. Responda apenas o JSON.")];
                case 4:
                    fallbackRaw = _d.sent();
                    if (!fallbackRaw)
                        return [2 /*return*/, null];
                    jsonTextMatch = fallbackRaw.match(/\{[\s\S]*\}/);
                    jsonText = jsonTextMatch ? jsonTextMatch[0] : fallbackRaw;
                    try {
                        parsed = JSON.parse(jsonText);
                        return [2 /*return*/, {
                                summary: String(parsed.summary || parsed.tag || '').trim(),
                                description: String(parsed.description || parsed.desc || '').trim(),
                            }];
                    }
                    catch (_e) {
                        description = fallbackRaw.trim();
                        summary = description.split(/[.,;\n]/)[0].split(' ').slice(0, 3).join('_').toLowerCase();
                        return [2 /*return*/, { summary: summary, description: description }];
                    }
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function classifyMediaWithAI(input) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, clientMessage, conversationHistory, mediaLibrary, _a, sentMedias_1, availableMedia, clientMsgCount, isFirstMessage, recentHistory, mediaListForAI, systemPrompt, userPrompt, mistral, response, elapsedMs, rawResponse, jsonMatch, parsed, result, error_6;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    startTime = Date.now();
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    console.log("\n\uD83E\uDD16 [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83E\uDD16 [MEDIA AI] Iniciando classifica\u00E7\u00E3o de m\u00EDdia com IA...");
                    clientMessage = input.clientMessage, conversationHistory = input.conversationHistory, mediaLibrary = input.mediaLibrary, _a = input.sentMedias, sentMedias_1 = _a === void 0 ? [] : _a;
                    availableMedia = mediaLibrary.filter(function (m) {
                        var alreadySent = sentMedias_1.some(function (sent) { return sent.toUpperCase() === m.name.toUpperCase(); });
                        return !alreadySent && m.isActive !== false;
                    });
                    if (availableMedia.length === 0) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u274C Nenhuma m\u00EDdia dispon\u00EDvel");
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' }];
                    }
                    clientMsgCount = conversationHistory.filter(function (m) { return !m.fromMe; }).length;
                    isFirstMessage = clientMsgCount <= 1;
                    recentHistory = conversationHistory
                        .slice(-10)
                        .map(function (m) { return "".concat(m.fromMe ? 'Agente' : 'Cliente', ": ").concat(m.text || '(sem texto)'); })
                        .join('\n');
                    mediaListForAI = availableMedia
                        .map(function (m, i) { return "".concat(i + 1, ". NOME: \"").concat(m.name, "\" | TIPO: ").concat(m.type, " | QUANDO USAR: ").concat(m.whenToUse || 'não especificado'); })
                        .join('\n');
                    systemPrompt = "Voc\u00EA \u00E9 um sistema de classifica\u00E7\u00E3o de m\u00EDdia para um chatbot de WhatsApp.\nSua tarefa \u00E9 analisar a conversa e decidir SE e QUAL m\u00EDdia deve ser enviada ao cliente.\n\n## REGRAS IMPORTANTES:\n1. Se for PRIMEIRA MENSAGEM do cliente (sauda\u00E7\u00E3o como \"oi\", \"ol\u00E1\", \"bom dia\"), procure por m\u00EDdia de boas-vindas/in\u00EDcio\n2. Apenas recomende m\u00EDdia se for CLARAMENTE RELEVANTE para o contexto\n3. N\u00C3O recomende m\u00EDdia se o cliente estiver fazendo perguntas espec\u00EDficas que n\u00E3o precisam de m\u00EDdia\n4. Leia o campo \"QUANDO USAR\" de cada m\u00EDdia para entender quando \u00E9 apropriado enviar\n5. Se nenhuma m\u00EDdia for claramente apropriada, responda com NO_MEDIA\n6. Confian\u00E7a deve ser entre 0-100 (apenas envie se > 60)\n\n## RESPONDA APENAS EM JSON:\n{\"decision\": \"SEND\" ou \"NO_MEDIA\", \"mediaName\": \"NOME_EXATO_DA_MIDIA\" ou null, \"confidence\": 0-100, \"reason\": \"explica\u00E7\u00E3o breve\"}";
                    userPrompt = "## CONTEXTO:\n\u00C9 a primeira mensagem do cliente? ".concat(isFirstMessage ? 'SIM' : 'NÃO', "\nMensagem atual do cliente: \"").concat(clientMessage, "\"\n\n## HIST\u00D3RICO RECENTE:\n").concat(recentHistory || '(primeira interação)', "\n\n## M\u00CDDIAS DISPON\u00CDVEIS:\n").concat(mediaListForAI, "\n\n## M\u00CDDIAS J\u00C1 ENVIADAS (n\u00E3o repetir):\n").concat(sentMedias_1.join(', ') || 'nenhuma', "\n\nAnalise e decida se alguma m\u00EDdia deve ser enviada. Responda APENAS o JSON.");
                    return [4 /*yield*/, getMistralClient()];
                case 2:
                    mistral = _b.sent();
                    return [4 /*yield*/, mistral.chat.complete({
                            model: "mistral-small-latest",
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userPrompt }
                            ],
                            maxTokens: 150,
                            temperature: 0.1, // Baixa para decisões mais consistentes
                        })];
                case 3:
                    response = _b.sent();
                    elapsedMs = Date.now() - startTime;
                    if (!response || !response.choices || response.choices.length === 0) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u274C Sem resposta da API (".concat(elapsedMs, "ms)"));
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' }];
                    }
                    rawResponse = response.choices[0].message.content;
                    console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDCE5 Resposta bruta (".concat(elapsedMs, "ms): ").concat(rawResponse));
                    jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u26A0\uFE0F N\u00E3o conseguiu extrair JSON");
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' }];
                    }
                    try {
                        parsed = JSON.parse(jsonMatch[0]);
                        result = {
                            shouldSend: parsed.decision === 'SEND' && parsed.confidence >= 60,
                            mediaName: parsed.mediaName || null,
                            confidence: parsed.confidence || 0,
                            reason: parsed.reason || 'Sem razão especificada'
                        };
                        console.log("\uD83E\uDD16 [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                        if (result.shouldSend) {
                            console.log("\uD83E\uDD16 [MEDIA AI] \u2705 DECIS\u00C3O: ENVIAR \"".concat(result.mediaName, "\""));
                        }
                        else {
                            console.log("\uD83E\uDD16 [MEDIA AI] \u274C DECIS\u00C3O: N\u00C3O ENVIAR");
                        }
                        console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDCCA Confian\u00E7a: ".concat(result.confidence, "%"));
                        console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDCA1 Raz\u00E3o: ".concat(result.reason));
                        console.log("\uD83E\uDD16 [MEDIA AI] \u23F1\uFE0F Tempo: ".concat(elapsedMs, "ms"));
                        console.log("\uD83E\uDD16 [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, result];
                    }
                    catch (parseError) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u26A0\uFE0F Erro ao parsear JSON: ".concat(parseError));
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Erro ao parsear resposta' }];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _b.sent();
                    console.error("\uD83E\uDD16 [MEDIA AI] \u274C ERRO: ".concat(error_6.message));
                    // Em caso de erro, retorna "não enviar" para não quebrar o fluxo
                    return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: "Erro: ".concat(error_6.message) }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== TEXT GENERATION ====================
/**
 * Gera texto usando a API Mistral
 * Útil para geração de mensagens, respostas rápidas, etc.
 */
function generateWithMistral(systemPrompt, userMessage, options) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, model, response, error_7;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, getMistralClient()];
                case 1:
                    mistral = _b.sent();
                    model = (options === null || options === void 0 ? void 0 : options.model) || "mistral-small-latest";
                    return [4 /*yield*/, mistral.chat.complete({
                            model: model,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userMessage }
                            ],
                            maxTokens: (options === null || options === void 0 ? void 0 : options.maxTokens) || 500,
                            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                        })];
                case 2:
                    response = _b.sent();
                    if (!response || !response.choices || response.choices.length === 0) {
                        throw new Error("No response from Mistral");
                    }
                    return [2 /*return*/, response.choices[0].message.content || ""];
                case 3:
                    error_7 = _b.sent();
                    console.error("Error generating text with Mistral:", error_7);
                    throw new Error("Failed to generate text: ".concat(error_7.message));
                case 4: return [2 /*return*/];
            }
        });
    });
}
