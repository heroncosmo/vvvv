"use strict";
/**
 * Agent Validation Module
 * Sistema de guardrails, detecção off-topic e prevenção de jailbreak
 * Baseado em research de Anthropic Constitutional AI e OpenAI Safety
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
exports.detectOffTopic = detectOffTopic;
exports.detectJailbreak = detectJailbreak;
exports.generateOffTopicResponse = generateOffTopicResponse;
exports.validateAgentResponse = validateAgentResponse;
exports.cleanupOffTopicCache = cleanupOffTopicCache;
var llm_1 = require("./llm");
// Cache para evitar chamadas repetidas
var offTopicCache = new Map();
var CACHE_TTL = 5 * 60 * 1000; // 5 minutos
function detectOffTopic(message, allowedTopics, prohibitedTopics, config) {
    return __awaiter(this, void 0, void 0, function () {
        var cacheKey, cached, classificationPrompt, mistral, response, content, jsonMatch, analysis, result, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cacheKey = "".concat(message.toLowerCase(), "_").concat(config.id);
                    cached = offTopicCache.get(cacheKey);
                    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                        return [2 /*return*/, cached.result];
                    }
                    classificationPrompt = "\nVoc\u00EA \u00E9 um classificador de mensagens. Analise se a mensagem est\u00E1 DENTRO ou FORA do escopo permitido.\n\nT\u00D3PICOS PERMITIDOS:\n".concat(allowedTopics.map(function (t) { return "\u2022 ".concat(t); }).join('\n'), "\n\nT\u00D3PICOS PROIBIDOS:\n").concat(prohibitedTopics.map(function (t) { return "\u2022 ".concat(t); }).join('\n'), "\n\nMENSAGEM DO USU\u00C1RIO:\n\"").concat(message, "\"\n\nAN\u00C1LISE: A mensagem est\u00E1 dentro do escopo de \"").concat(config.companyName, "\"?\n\nResponda APENAS com um JSON no formato:\n{\n  \"isOffTopic\": true/false,\n  \"confidence\": 0.0-1.0,\n  \"reason\": \"breve explica\u00E7\u00E3o\",\n  \"category\": \"categoria identificada\"\n}\n");
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 2:
                    mistral = _c.sent();
                    return [4 /*yield*/, mistral.chat.complete({
                            messages: [
                                { role: "user", content: classificationPrompt }
                            ],
                            temperature: 0.1, // Baixa temperatura para respostas consistentes
                            maxTokens: 150,
                        })];
                case 3:
                    response = _c.sent();
                    content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "{}";
                    jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        // Fallback: análise baseada em keywords
                        return [2 /*return*/, fallbackOffTopicDetection(message, allowedTopics, prohibitedTopics)];
                    }
                    analysis = JSON.parse(jsonMatch[0]);
                    result = {
                        isOffTopic: analysis.isOffTopic || false,
                        confidence: analysis.confidence || 0.5,
                        reason: analysis.reason,
                        suggestedRedirect: analysis.isOffTopic
                            ? "Entendo! Sobre ".concat(allowedTopics[0], ", posso te ajudar com isso?")
                            : undefined,
                    };
                    // Salvar no cache
                    offTopicCache.set(cacheKey, { result: result, timestamp: Date.now() });
                    return [2 /*return*/, result];
                case 4:
                    error_1 = _c.sent();
                    console.error("Erro ao detectar off-topic:", error_1);
                    // Fallback em caso de erro
                    return [2 /*return*/, fallbackOffTopicDetection(message, allowedTopics, prohibitedTopics)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Detecção fallback baseada em keywords (quando Mistral falha)
function fallbackOffTopicDetection(message, allowedTopics, prohibitedTopics) {
    var messageLower = message.toLowerCase();
    // Verificar tópicos proibidos
    var prohibitedMatch = prohibitedTopics.find(function (topic) {
        return messageLower.includes(topic.toLowerCase());
    });
    if (prohibitedMatch) {
        return {
            isOffTopic: true,
            confidence: 0.8,
            reason: "T\u00F3pico proibido detectado: ".concat(prohibitedMatch),
            suggestedRedirect: "Posso te ajudar com algo relacionado aos nossos servi\u00E7os?",
        };
    }
    // Verificar tópicos permitidos
    var allowedMatch = allowedTopics.some(function (topic) {
        return messageLower.includes(topic.toLowerCase());
    });
    if (allowedMatch) {
        return {
            isOffTopic: false,
            confidence: 0.7,
        };
    }
    // Incerto - considerar in-scope por padrão para não bloquear muito
    return {
        isOffTopic: false,
        confidence: 0.5,
        reason: "Análise incerta, mantendo in-scope",
    };
}
var JAILBREAK_PATTERNS = [
    // Role-play attacks
    /ignore (all|previous) (instructions|rules|commands)/i,
    /forget (everything|all|what) (you|i) (told|said|mentioned)/i,
    /you are now|act as|pretend to be|simulate/i,
    /disregard (your|the) (role|identity|system)/i,
    // Prompt injection
    /new (instructions|system|prompt|rules)/i,
    /override (previous|system|current)/i,
    /(start|begin) (new|fresh) (conversation|session)/i,
    /system:\s*|admin:\s*|root:\s*/i,
    // Information extraction
    /show (me )?(your|the) (prompt|instructions|system|rules)/i,
    /what (are|is) (your|the) (instructions|system prompt|rules)/i,
    /repeat (your|the) (instructions|prompt)/i,
    // Identity manipulation
    /you('re| are) not (really )?[a-z]+/i,
    /stop being [a-z]+/i,
    /don't be [a-z]+/i,
];
function detectJailbreak(message) {
    var messageLower = message.toLowerCase();
    for (var _i = 0, JAILBREAK_PATTERNS_1 = JAILBREAK_PATTERNS; _i < JAILBREAK_PATTERNS_1.length; _i++) {
        var pattern = JAILBREAK_PATTERNS_1[_i];
        if (pattern.test(messageLower)) {
            return {
                isJailbreakAttempt: true,
                confidence: 0.9,
                type: determineJailbreakType(message),
                severity: "high",
            };
        }
    }
    // Detecção de múltiplas tentativas de mudança de comportamento
    var suspiciousKeywords = [
        "ignore", "forget", "pretend", "act as", "you are now",
        "system", "admin", "override", "new instructions"
    ];
    var keywordCount = suspiciousKeywords.filter(function (keyword) {
        return messageLower.includes(keyword);
    }).length;
    if (keywordCount >= 2) {
        return {
            isJailbreakAttempt: true,
            confidence: 0.7,
            type: "multiple-suspicious-keywords",
            severity: "medium",
        };
    }
    return {
        isJailbreakAttempt: false,
        confidence: 0.0,
        severity: "low",
    };
}
function determineJailbreakType(message) {
    var messageLower = message.toLowerCase();
    if (/act as|pretend|simulate|you are now/.test(messageLower)) {
        return "role-play-attack";
    }
    if (/ignore|forget|disregard/.test(messageLower)) {
        return "instruction-override";
    }
    if (/show.*prompt|repeat.*instructions/.test(messageLower)) {
        return "information-extraction";
    }
    if (/system:|admin:|override/.test(messageLower)) {
        return "prompt-injection";
    }
    return "unknown";
}
// ═══════════════════════════════════════════════════════════
// 🔄 GERAÇÃO DE RESPOSTA OFF-TOPIC
// ═══════════════════════════════════════════════════════════
function generateOffTopicResponse(config, offTopicResult) {
    var _a, _b, _c, _d, _e;
    var responses = [
        "Entendo sua pergunta! Por\u00E9m, como ".concat(config.agentName, " da ").concat(config.companyName, ", meu foco \u00E9 ajudar com ").concat(((_a = config.allowedTopics) === null || _a === void 0 ? void 0 : _a[0]) || "nossos serviços", ". Posso te ajudar com algo relacionado?"),
        "Boa pergunta! Mas essa n\u00E3o \u00E9 minha \u00E1rea de expertise \uD83D\uDE0A Sou especialista em ".concat(((_b = config.allowedTopics) === null || _b === void 0 ? void 0 : _b[0]) || "nossos produtos e serviços", ". O que voc\u00EA gostaria de saber sobre isso?"),
        "Obrigado por perguntar! Esse assunto est\u00E1 um pouco fora do que eu posso ajudar. Mas tenho \u00F3timas informa\u00E7\u00F5es sobre ".concat((_c = config.allowedTopics) === null || _c === void 0 ? void 0 : _c[0], ". Te interessa?"),
        "Legal sua pergunta! Mas n\u00E3o sou o melhor para responder isso \uD83D\uDE05 Agora, se quiser saber sobre ".concat(((_d = config.allowedTopics) === null || _d === void 0 ? void 0 : _d[0]) || "nossos serviços", ", a\u00ED eu sou expert! Como posso ajudar?"),
    ];
    // Escolher resposta baseada na formalidade
    var formalityLevel = config.formalityLevel || 5;
    if (formalityLevel >= 7) {
        // Resposta formal
        return "Agrade\u00E7o sua mensagem. No entanto, esse t\u00F3pico est\u00E1 fora do meu escopo de atendimento. Como ".concat(config.agentName, ", estou preparado para auxili\u00E1-lo(a) com quest\u00F5es relacionadas a ").concat(((_e = config.allowedTopics) === null || _e === void 0 ? void 0 : _e[0]) || "nossos serviços", ". Posso ajud\u00E1-lo(a) com algo nesse sentido?");
    }
    else if (formalityLevel <= 3) {
        // Resposta informal
        var randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex];
    }
    else {
        // Resposta equilibrada
        return responses[0];
    }
}
function validateAgentResponse(response, config) {
    var issues = [];
    var maintainsIdentity = true;
    var staysInScope = true;
    // 1. Verificar se mantém identidade
    var wrongIdentityPatterns = [
        /eu sou (claude|gpt|chatgpt|assistant|ai)/i,
        /como (uma |um )?(ia|inteligência artificial|modelo de linguagem)/i,
        /não tenho (nome|identidade|personalidade)/i,
    ];
    for (var _i = 0, wrongIdentityPatterns_1 = wrongIdentityPatterns; _i < wrongIdentityPatterns_1.length; _i++) {
        var pattern = wrongIdentityPatterns_1[_i];
        if (pattern.test(response)) {
            maintainsIdentity = false;
            issues.push("Resposta não mantém identidade correta do agente");
            break;
        }
    }
    // 2. Verificar se não vazou instruções do sistema
    var systemLeakPatterns = [
        /system prompt|instruções do sistema/i,
        /foi programado para|fui treinado para/i,
        /meu criador|openai|anthropic|mistral/i,
    ];
    for (var _a = 0, systemLeakPatterns_1 = systemLeakPatterns; _a < systemLeakPatterns_1.length; _a++) {
        var pattern = systemLeakPatterns_1[_a];
        if (pattern.test(response)) {
            issues.push("Resposta contém vazamento de informações do sistema");
            staysInScope = false;
            break;
        }
    }
    // 3. Verificar tamanho
    if (response.length > (config.maxResponseLength * 1.2)) {
        issues.push("Resposta muito longa (>20% do limite)");
    }
    // 4. Verificar se não responde sobre tópicos proibidos
    if (config.prohibitedTopics && config.prohibitedTopics.length > 0) {
        var responseLower_1 = response.toLowerCase();
        var mentionedProhibited = config.prohibitedTopics.find(function (topic) {
            return responseLower_1.includes(topic.toLowerCase());
        });
        if (mentionedProhibited) {
            issues.push("Resposta menciona t\u00F3pico proibido: ".concat(mentionedProhibited));
            staysInScope = false;
        }
    }
    return {
        isValid: issues.length === 0,
        maintainsIdentity: maintainsIdentity,
        staysInScope: staysInScope,
        issues: issues,
    };
}
// ═══════════════════════════════════════════════════════════
// 🧹 LIMPEZA DE CACHE
// ═══════════════════════════════════════════════════════════
function cleanupOffTopicCache() {
    var now = Date.now();
    var keysToDelete = [];
    offTopicCache.forEach(function (value, key) {
        if (now - value.timestamp > CACHE_TTL) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(function (key) { return offTopicCache.delete(key); });
    console.log("[Cache Cleanup] Removed ".concat(keysToDelete.length, " expired entries"));
}
// Executar cleanup a cada 10 minutos
setInterval(cleanupOffTopicCache, 10 * 60 * 1000);
