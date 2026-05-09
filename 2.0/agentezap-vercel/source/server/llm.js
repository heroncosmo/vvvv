"use strict";
/**
 * LLM Service - Provider Abstraction Layer
 *
 * Este módulo fornece funções para chamadas de LLM (Large Language Models)
 * Suporta: OpenRouter (primário), Groq e Mistral (fallback)
 *
 * Configuração via system_config:
 * - llm_provider: 'openrouter' | 'groq' | 'mistral'
 * - openrouter_api_key: Chave API do OpenRouter
 * - openrouter_model: Modelo do OpenRouter (ex: 'meta-llama/llama-3.3-70b-instruct:free')
 * - groq_api_key: Chave API do Groq
 * - groq_model: Modelo do Groq (ex: 'openai/gpt-oss-20b')
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
exports.getMistralQueueInfo = getMistralQueueInfo;
exports.clearExpiredMistralCooldowns = clearExpiredMistralCooldowns;
exports.getMistralModelStatus = getMistralModelStatus;
exports.withRetryLLM = withRetryLLM;
exports.invalidateLLMConfigCache = invalidateLLMConfigCache;
exports.getLLMConfig = getLLMConfig;
exports.callGroq = callGroq;
exports.getCurrentProvider = getCurrentProvider;
exports.chatComplete = chatComplete;
exports.getLLMClient = getLLMClient;
exports.generateWithLLM = generateWithLLM;
exports.classifyMediaWithLLM = classifyMediaWithLLM;
exports.detectMediaSendingIntent = detectMediaSendingIntent;
var mistralClient_1 = require("./mistralClient");
var db_1 = require("./db");
var schema_1 = require("@shared/schema");
var drizzle_orm_1 = require("drizzle-orm");
var llmConfigCache = null;
var LLM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
// 🔥 MODELOS VALIDADOS ordenados por preferência
var MISTRAL_VALIDATED_MODELS = [
    { model: 'mistral-medium-latest', ratePerMinute: 10.5, delaySeconds: 6, successRate: 22.6 },
    { model: 'mistral-medium-2312', ratePerMinute: 6, delaySeconds: 10, successRate: 13.0 },
    { model: 'mistral-medium', ratePerMinute: 6, delaySeconds: 10, successRate: 12.8 },
    { model: 'mistral-large-2411', ratePerMinute: 3, delaySeconds: 20, successRate: 6.3 },
    // Tier 2 - menos testados mas podem funcionar
    { model: 'mistral-large-latest', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
    { model: 'mistral-large-2407', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
    { model: 'mistral-large-2402', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
];
var MISTRAL_FALLBACK_MODELS = MISTRAL_VALIDATED_MODELS.map(function (m) { return m.model; });
var MISTRAL_EXTERNAL_FALLBACK_DELAY_MS = 30 * 1000; // 30 segundos antes de fallback externo (era 5min - causava retry storm)
var mistralQueueStatus = {
    firstFailureTime: null,
    totalAttempts: 0,
    lastAttemptTime: 0,
    roundRobinIndex: 0,
};
var CIRCUIT_BREAKER_THRESHOLD = 5; // Após 5 falhas consecutivas, abrir circuito
var CIRCUIT_BREAKER_RESET_MS = 60 * 1000; // Tentar Mistral novamente após 60seg
var circuitBreaker = {
    consecutiveFailures: 0,
    lastFailureTime: 0,
    isOpen: false,
};
function isCircuitBreakerOpen() {
    if (!circuitBreaker.isOpen)
        return false;
    // Verificar se já passou tempo de reset
    var elapsed = Date.now() - circuitBreaker.lastFailureTime;
    if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
        console.log("\uD83D\uDD04 [CIRCUIT BREAKER] Resetando ap\u00F3s ".concat(Math.round(elapsed / 1000), "s - tentando Mistral novamente"));
        circuitBreaker.isOpen = false;
        circuitBreaker.consecutiveFailures = 0;
        return false;
    }
    var remaining = Math.ceil((CIRCUIT_BREAKER_RESET_MS - elapsed) / 1000);
    console.log("\uD83D\uDEE1\uFE0F [CIRCUIT BREAKER] ABERTO - pulando Mistral, direto para fallback (reset em ".concat(remaining, "s)"));
    return true;
}
function recordCircuitBreakerFailure() {
    circuitBreaker.consecutiveFailures++;
    circuitBreaker.lastFailureTime = Date.now();
    if (circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitBreaker.isOpen) {
        circuitBreaker.isOpen = true;
        console.log("\uD83D\uDEE1\uFE0F [CIRCUIT BREAKER] ABERTO! ".concat(circuitBreaker.consecutiveFailures, " falhas consecutivas - pulando Mistral por ").concat(CIRCUIT_BREAKER_RESET_MS / 1000, "s"));
    }
}
function recordCircuitBreakerSuccess() {
    if (circuitBreaker.consecutiveFailures > 0) {
        console.log("\u2705 [CIRCUIT BREAKER] Sucesso! Resetando contador de falhas (era ".concat(circuitBreaker.consecutiveFailures, ")"));
    }
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.isOpen = false;
}
/**
 * Verifica se já passou tempo suficiente para fazer fallback para OpenRouter/Groq
 * Retorna true se podemos fazer fallback, false se devemos continuar tentando Mistral
 */
function canFallbackToExternal() {
    if (!mistralQueueStatus.firstFailureTime) {
        return false; // Nunca falhou, não precisa fallback
    }
    var timeElapsed = Date.now() - mistralQueueStatus.firstFailureTime;
    var canFallback = timeElapsed >= MISTRAL_EXTERNAL_FALLBACK_DELAY_MS;
    if (canFallback) {
        console.log("\u2705 [MISTRAL QUEUE] Passaram ".concat(Math.round(timeElapsed / 1000), "s (").concat(Math.round(timeElapsed / 60000), " min) - LIBERADO para fallback externo"));
    }
    else {
        var remaining = Math.ceil((MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed) / 1000);
        console.log("\u23F3 [MISTRAL QUEUE] Aguardando ".concat(remaining, "s (").concat(Math.round(remaining / 60), " min) antes de fallback externo..."));
    }
    return canFallback;
}
/**
 * Registra falha no sistema de fila Mistral
 */
function registerMistralFailure() {
    if (!mistralQueueStatus.firstFailureTime) {
        mistralQueueStatus.firstFailureTime = Date.now();
        console.log("\uD83D\uDEA8 [MISTRAL QUEUE] Primeira falha registrada - iniciando timer de 5 minutos");
    }
    mistralQueueStatus.totalAttempts++;
    mistralQueueStatus.lastAttemptTime = Date.now();
}
/**
 * Limpa o status da fila após sucesso (reseta o timer de 5 min)
 */
function clearMistralQueueStatus() {
    if (mistralQueueStatus.firstFailureTime) {
        console.log("\u2705 [MISTRAL QUEUE] Fila limpa ap\u00F3s ".concat(mistralQueueStatus.totalAttempts, " tentativas"));
    }
    mistralQueueStatus.firstFailureTime = null;
    mistralQueueStatus.totalAttempts = 0;
    mistralQueueStatus.roundRobinIndex = 0;
}
/**
 * Obtém próximo modelo no round-robin e delay recomendado
 */
function getNextMistralModelRoundRobin() {
    var modelConfig = MISTRAL_VALIDATED_MODELS[mistralQueueStatus.roundRobinIndex];
    // Avança índice para próxima chamada
    mistralQueueStatus.roundRobinIndex =
        (mistralQueueStatus.roundRobinIndex + 1) % MISTRAL_VALIDATED_MODELS.length;
    console.log("\uD83D\uDD04 [MISTRAL QUEUE] Round-robin: ".concat(modelConfig.model, " (delay: ").concat(modelConfig.delaySeconds, "s, rate: ").concat(modelConfig.ratePerMinute, "/min)"));
    return {
        model: modelConfig.model,
        delay: modelConfig.delaySeconds * 1000
    };
}
/**
 * Retorna status da fila para exibição (ex: no admin)
 */
function getMistralQueueInfo() {
    var timeElapsed = mistralQueueStatus.firstFailureTime
        ? Date.now() - mistralQueueStatus.firstFailureTime
        : 0;
    var timeUntilFallback = Math.max(0, MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed);
    return {
        isInFailureMode: mistralQueueStatus.firstFailureTime !== null,
        timeUntilFallback: Math.ceil(timeUntilFallback / 1000),
        totalAttempts: mistralQueueStatus.totalAttempts,
        currentModelIndex: mistralQueueStatus.roundRobinIndex,
        models: MISTRAL_VALIDATED_MODELS,
    };
}
var mistralModelCooldowns = new Map();
var MISTRAL_MODEL_COOLDOWN_MS = 30 * 1000; // 30 segundos de cooldown (curto, pois só afeta retries imediatos)
/**
 * Limpa cooldowns expirados - chamado no início de cada nova mensagem
 * Isso garante que na próxima mensagem o modelo do admin seja tentado novamente
 */
function clearExpiredMistralCooldowns() {
    var now = Date.now();
    var cleared = 0;
    for (var _i = 0, _a = mistralModelCooldowns.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], model = _b[0], cooldown = _b[1];
        if (cooldown.cooldownUntil < now) {
            mistralModelCooldowns.delete(model);
            cleared++;
        }
    }
    if (cleared > 0) {
        console.log("\uD83D\uDD04 [MISTRAL] Limpou ".concat(cleared, " cooldowns expirados"));
    }
}
/**
 * Obtém o próximo modelo Mistral disponível para fallback
 * @param preferredModel Modelo escolhido pelo admin (sempre tenta primeiro)
 * @param excludeModels Modelos que já falharam nesta mensagem (para não repetir)
 * @returns O melhor modelo disponível ou null se todos falharam
 */
function getNextAvailableMistralModel(preferredModel, excludeModels) {
    if (excludeModels === void 0) { excludeModels = []; }
    var now = Date.now();
    // Limpar cooldowns expirados
    clearExpiredMistralCooldowns();
    // 1. Se o modelo preferido NÃO está na lista de exclusão, usar ele
    if (!excludeModels.includes(preferredModel)) {
        var preferredCooldown = mistralModelCooldowns.get(preferredModel);
        if (!preferredCooldown || preferredCooldown.cooldownUntil < now) {
            console.log("\u2705 [MISTRAL ROTATION] Usando modelo do admin: ".concat(preferredModel));
            return preferredModel;
        }
        var remainingCooldown = Math.ceil((preferredCooldown.cooldownUntil - now) / 1000);
        console.log("\u23F3 [MISTRAL ROTATION] Modelo do admin ".concat(preferredModel, " em cooldown por ").concat(remainingCooldown, "s, buscando fallback..."));
    }
    // 2. Procurar fallback na lista de modelos econômicos
    for (var _i = 0, MISTRAL_FALLBACK_MODELS_1 = MISTRAL_FALLBACK_MODELS; _i < MISTRAL_FALLBACK_MODELS_1.length; _i++) {
        var model = MISTRAL_FALLBACK_MODELS_1[_i];
        // Pular se já foi tentado nesta mensagem
        if (excludeModels.includes(model))
            continue;
        // Pular se está em cooldown
        var cooldown = mistralModelCooldowns.get(model);
        if (cooldown && cooldown.cooldownUntil > now)
            continue;
        console.log("\uD83D\uDD04 [MISTRAL ROTATION] Usando fallback: ".concat(model));
        return model;
    }
    // 3. Se todos falharam, retornar null
    console.log("\u274C [MISTRAL ROTATION] Nenhum modelo dispon\u00EDvel! Todos em cooldown ou j\u00E1 tentados.");
    return null;
}
/**
 * Marca um modelo como em cooldown após rate limit
 * O cooldown é curto para não afetar próximas mensagens
 */
function markMistralModelRateLimited(model) {
    var existing = mistralModelCooldowns.get(model);
    var cooldownMultiplier = existing ? Math.min(existing.rateLimitCount + 1, 3) : 1; // Max 3x cooldown (30s, 60s, 90s)
    var cooldownMs = MISTRAL_MODEL_COOLDOWN_MS * cooldownMultiplier;
    mistralModelCooldowns.set(model, {
        model: model,
        cooldownUntil: Date.now() + cooldownMs,
        rateLimitCount: ((existing === null || existing === void 0 ? void 0 : existing.rateLimitCount) || 0) + 1
    });
    console.log("\uD83D\uDEAB [MISTRAL ROTATION] Modelo ".concat(model, " em COOLDOWN por ").concat(cooldownMs / 1000, "s (rate limit #").concat(((existing === null || existing === void 0 ? void 0 : existing.rateLimitCount) || 0) + 1, ")"));
    // Listar modelos de fallback disponíveis
    var now = Date.now();
    var available = MISTRAL_FALLBACK_MODELS.filter(function (m) {
        var cd = mistralModelCooldowns.get(m);
        return !cd || cd.cooldownUntil < now;
    });
    console.log("\uD83D\uDCCA [MISTRAL ROTATION] Fallbacks dispon\u00EDveis: ".concat(available.length > 0 ? available.join(', ') : 'NENHUM'));
}
/**
 * Retorna status de todos os modelos Mistral (para debug/admin)
 */
function getMistralModelStatus() {
    var now = Date.now();
    return MISTRAL_FALLBACK_MODELS.map(function (model) {
        var cooldown = mistralModelCooldowns.get(model);
        return {
            model: model,
            available: !cooldown || cooldown.cooldownUntil < now,
            cooldownRemaining: cooldown ? Math.max(0, Math.ceil((cooldown.cooldownUntil - now) / 1000)) : 0,
            rateLimitCount: (cooldown === null || cooldown === void 0 ? void 0 : cooldown.rateLimitCount) || 0
        };
    });
}
// ============================================================================
// 🔄 FUNÇÃO DE RETRY COM EXPONENTIAL BACKOFF PARA CHAMADAS DE API LLM
// ============================================================================
var LLM_MAX_RETRIES = 3;
var LLM_INITIAL_DELAY_MS = 1000;
/**
 * Executa uma operação com retry automático e exponential backoff
 * Específica para chamadas de API LLM (OpenRouter, Groq, etc)
 * 🔄 EXPORTADA para uso em outros módulos
 */
function withRetryLLM(operation_1) {
    return __awaiter(this, arguments, void 0, function (operation, operationName, maxRetries, initialDelayMs) {
        var lastError, _loop_1, attempt, state_1;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        if (operationName === void 0) { operationName = "LLM API call"; }
        if (maxRetries === void 0) { maxRetries = LLM_MAX_RETRIES; }
        if (initialDelayMs === void 0) { initialDelayMs = LLM_INITIAL_DELAY_MS; }
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    lastError = null;
                    _loop_1 = function (attempt) {
                        var result, error_1, statusCode, isRateLimit, isRetryable, jitter, delay_1;
                        return __generator(this, function (_r) {
                            switch (_r.label) {
                                case 0:
                                    _r.trys.push([0, 2, , 4]);
                                    // Log de início de cada tentativa
                                    console.log("\uD83D\uDD04 [LLM RETRY] ".concat(operationName, " - Tentativa ").concat(attempt, "/").concat(maxRetries, "..."));
                                    return [4 /*yield*/, operation()];
                                case 1:
                                    result = _r.sent();
                                    // Log de sucesso
                                    if (attempt > 1) {
                                        console.log("\u2705 [LLM RETRY] ".concat(operationName, " - SUCESSO na tentativa ").concat(attempt, "/").concat(maxRetries, "!"));
                                    }
                                    return [2 /*return*/, { value: result }];
                                case 2:
                                    error_1 = _r.sent();
                                    lastError = error_1;
                                    statusCode = (error_1 === null || error_1 === void 0 ? void 0 : error_1.status) || (error_1 === null || error_1 === void 0 ? void 0 : error_1.statusCode) ||
                                        (((_b = (_a = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _a === void 0 ? void 0 : _a.match(/error: (\d+)/)) === null || _b === void 0 ? void 0 : _b[1]) ? parseInt(error_1.message.match(/error: (\d+)/)[1]) : null);
                                    isRateLimit = statusCode === 429 ||
                                        ((_d = (_c = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === null || _d === void 0 ? void 0 : _d.includes('rate limit')) ||
                                        ((_f = (_e = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _e === void 0 ? void 0 : _e.toLowerCase()) === null || _f === void 0 ? void 0 : _f.includes('too many requests'));
                                    if (isRateLimit) {
                                        console.log("\u26A1 [LLM RETRY] ".concat(operationName, " - RATE LIMIT! Lan\u00E7ando para rota\u00E7\u00E3o de modelos..."));
                                        throw error_1; // Lançar imediatamente para rotação de modelos
                                    }
                                    isRetryable = statusCode === 500 || // Server error
                                        statusCode === 502 || // Bad gateway
                                        statusCode === 503 || // Service unavailable
                                        statusCode === 504 || // Gateway timeout
                                        statusCode === 520 || // Cloudflare error
                                        statusCode === 521 || // Cloudflare error
                                        statusCode === 522 || // Cloudflare timeout
                                        statusCode === 523 || // Cloudflare error
                                        statusCode === 524 || // Cloudflare timeout
                                        (error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'ECONNRESET' ||
                                        (error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'ETIMEDOUT' ||
                                        (error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'ENOTFOUND' ||
                                        (error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'ECONNREFUSED' ||
                                        (error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'UND_ERR_CONNECT_TIMEOUT' ||
                                        ((_h = (_g = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _g === void 0 ? void 0 : _g.toLowerCase()) === null || _h === void 0 ? void 0 : _h.includes('timeout')) ||
                                        ((_k = (_j = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _j === void 0 ? void 0 : _j.toLowerCase()) === null || _k === void 0 ? void 0 : _k.includes('connection')) ||
                                        ((_m = (_l = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _l === void 0 ? void 0 : _l.toLowerCase()) === null || _m === void 0 ? void 0 : _m.includes('overloaded')) ||
                                        ((_p = (_o = error_1 === null || error_1 === void 0 ? void 0 : error_1.message) === null || _o === void 0 ? void 0 : _o.toLowerCase()) === null || _p === void 0 ? void 0 : _p.includes('temporarily unavailable'));
                                    if (!isRetryable || attempt === maxRetries) {
                                        console.error("\u274C [LLM RETRY] ".concat(operationName, " - ESGOTOU ").concat(maxRetries, " tentativas!"));
                                        console.error("   \u2514\u2500 Erro final: ".concat((error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || error_1));
                                        console.error("   \u2514\u2500 Status: ".concat(statusCode || 'N/A'));
                                        console.error("   \u2514\u2500 Retryable: ".concat(isRetryable ? 'SIM' : 'NÃO'));
                                        throw error_1;
                                    }
                                    jitter = Math.random() * 500;
                                    delay_1 = (initialDelayMs * Math.pow(2, attempt - 1)) + jitter;
                                    console.log("\u26A0\uFE0F [LLM RETRY] ".concat(operationName, " - FALHOU tentativa ").concat(attempt, "/").concat(maxRetries));
                                    console.log("   \u2514\u2500 Erro: ".concat((error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || 'Unknown'));
                                    console.log("   \u2514\u2500 Status: ".concat(statusCode || 'N/A'));
                                    console.log("   \u2514\u2500 Pr\u00F3xima tentativa em: ".concat(Math.round(delay_1 / 1000), "s"));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                case 3:
                                    _r.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _q.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _q.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _q.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: throw lastError || new Error("".concat(operationName, " falhou ap\u00F3s ").concat(maxRetries, " tentativas"));
            }
        });
    });
}
/**
 * Invalida o cache de configuração LLM
 */
function invalidateLLMConfigCache() {
    llmConfigCache = null;
    console.log("[LLM] Cache de configura\u00E7\u00E3o invalidado");
}
/**
 * Obtém configurações de LLM do banco de dados
 * 🔄 EXPORTADA para uso em outros módulos (aiAgent.ts, testAgentService.ts)
 */
function getLLMConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var configs, groqKeyResult, groqModelResult, openrouterKeyResult, openrouterModelResult, openrouterProviderResult, mistralKeyResult, mistralModelResult, nvidiaKeyResult, nvidiaModelResult, provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, openrouterProvider, mistralApiKey, mistralModel, nvidiaApiKey, nvidiaModel, error_2;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    // Verificar cache
                    if (llmConfigCache && (Date.now() - llmConfigCache.timestamp < LLM_CONFIG_CACHE_TTL_MS)) {
                        return [2 /*return*/, {
                                provider: llmConfigCache.provider,
                                groqApiKey: llmConfigCache.groqApiKey,
                                groqModel: llmConfigCache.groqModel,
                                openrouterApiKey: llmConfigCache.openrouterApiKey,
                                openrouterModel: llmConfigCache.openrouterModel,
                                openrouterProvider: llmConfigCache.openrouterProvider,
                                mistralApiKey: llmConfigCache.mistralApiKey,
                                mistralModel: llmConfigCache.mistralModel,
                                nvidiaApiKey: llmConfigCache.nvidiaApiKey,
                                nvidiaModel: llmConfigCache.nvidiaModel,
                            }];
                    }
                    _l.label = 1;
                case 1:
                    _l.trys.push([1, 12, , 13]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'llm_provider'))];
                case 2:
                    configs = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'groq_api_key'))];
                case 3:
                    groqKeyResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'groq_model'))];
                case 4:
                    groqModelResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'openrouter_api_key'))];
                case 5:
                    openrouterKeyResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'openrouter_model'))];
                case 6:
                    openrouterModelResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'openrouter_provider'))];
                case 7:
                    openrouterProviderResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'mistral_api_key'))];
                case 8:
                    mistralKeyResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'mistral_model'))];
                case 9:
                    mistralModelResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'nvidia_api_key'))];
                case 10:
                    nvidiaKeyResult = _l.sent();
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.systemConfig)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemConfig.chave, 'nvidia_model'))];
                case 11:
                    nvidiaModelResult = _l.sent();
                    provider = ((_a = configs[0]) === null || _a === void 0 ? void 0 : _a.valor) || 'mistral';
                    groqApiKey = ((_b = groqKeyResult[0]) === null || _b === void 0 ? void 0 : _b.valor) || '';
                    groqModel = ((_c = groqModelResult[0]) === null || _c === void 0 ? void 0 : _c.valor) || 'openai/gpt-oss-20b';
                    openrouterApiKey = ((_d = openrouterKeyResult[0]) === null || _d === void 0 ? void 0 : _d.valor) || '';
                    openrouterModel = ((_e = openrouterModelResult[0]) === null || _e === void 0 ? void 0 : _e.valor) || 'google/gemma-3-4b-it:free';
                    openrouterProvider = ((_f = openrouterProviderResult[0]) === null || _f === void 0 ? void 0 : _f.valor) || 'auto';
                    mistralApiKey = ((_g = mistralKeyResult[0]) === null || _g === void 0 ? void 0 : _g.valor) || '';
                    mistralModel = ((_h = mistralModelResult[0]) === null || _h === void 0 ? void 0 : _h.valor) || 'mistral-medium-latest';
                    nvidiaApiKey = ((_j = nvidiaKeyResult[0]) === null || _j === void 0 ? void 0 : _j.valor) || process.env.NVIDIA_API_KEY || '';
                    nvidiaModel = ((_k = nvidiaModelResult[0]) === null || _k === void 0 ? void 0 : _k.valor) || 'nvidia/llama-3.3-nemotron-super-49b-v1';
                    // Salvar no cache
                    llmConfigCache = { provider: provider, groqApiKey: groqApiKey, groqModel: groqModel, openrouterApiKey: openrouterApiKey, openrouterModel: openrouterModel, openrouterProvider: openrouterProvider, mistralApiKey: mistralApiKey, mistralModel: mistralModel, nvidiaApiKey: nvidiaApiKey, nvidiaModel: nvidiaModel, timestamp: Date.now() };
                    console.log("[LLM] Config loaded: provider=".concat(provider, ", model=").concat(provider === 'openrouter' ? openrouterModel : (provider === 'groq' ? groqModel : (provider === 'nvidia' ? nvidiaModel : mistralModel)), ", openrouterProvider=").concat(openrouterProvider).concat(nvidiaApiKey ? ', nvidia=CONFIGURED' : ''));
                    return [2 /*return*/, { provider: provider, groqApiKey: groqApiKey, groqModel: groqModel, openrouterApiKey: openrouterApiKey, openrouterModel: openrouterModel, openrouterProvider: openrouterProvider, mistralApiKey: mistralApiKey, mistralModel: mistralModel, nvidiaApiKey: nvidiaApiKey, nvidiaModel: nvidiaModel }];
                case 12:
                    error_2 = _l.sent();
                    console.error('[LLM] Erro ao carregar configuração:', error_2);
                    // 🔄 Defaults validados por stress test
                    return [2 /*return*/, { provider: 'mistral', groqApiKey: '', groqModel: 'openai/gpt-oss-20b', openrouterApiKey: '', openrouterModel: 'google/gemma-3-4b-it:free', openrouterProvider: 'auto', mistralApiKey: '', mistralModel: 'mistral-medium-latest', nvidiaApiKey: '', nvidiaModel: 'nvidia/llama-3.3-nemotron-super-49b-v1' }];
                case 13: return [2 /*return*/];
            }
        });
    });
}
/**
 * Chama o OpenRouter API COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 * Suporta provider dinâmico configurado pelo admin (ex: 'together', 'chutes', etc)
 */
function callOpenRouterAPI(messages, apiKey, options) {
    return __awaiter(this, void 0, void 0, function () {
        var model, providerSlug, isAutoProvider;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    model = (options === null || options === void 0 ? void 0 : options.model) || 'google/gemma-3-4b-it:free';
                    providerSlug = (options === null || options === void 0 ? void 0 : options.openrouterProvider) || 'auto';
                    isAutoProvider = providerSlug === 'auto' || providerSlug === '';
                    console.log("[LLM] \uD83D\uDE80 Chamando OpenRouter API com modelo: ".concat(model, ", provider: ").concat(isAutoProvider ? 'auto (OpenRouter escolhe)' : providerSlug));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var requestBody, response, errorText, error, data, content;
                            var _a, _b, _c, _d, _e;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0:
                                        requestBody = {
                                            model: model,
                                            messages: messages,
                                            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                                            max_tokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 500
                                        };
                                        // 🎯 Adiciona provider se NÃO for 'auto'
                                        if (!isAutoProvider) {
                                            requestBody.provider = {
                                                order: [providerSlug],
                                                allow_fallbacks: true // Permitir fallback para outros providers se necessário
                                            };
                                        }
                                        return [4 /*yield*/, fetch('https://openrouter.ai/api/v1/chat/completions', {
                                                method: 'POST',
                                                headers: {
                                                    'Authorization': "Bearer ".concat(apiKey),
                                                    'Content-Type': 'application/json',
                                                    'HTTP-Referer': 'https://agentezap.online',
                                                    'X-Title': 'AgenteZap'
                                                },
                                                body: JSON.stringify(requestBody),
                                            })];
                                    case 1:
                                        response = _f.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _f.sent();
                                        console.error("[LLM] OpenRouter API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("OpenRouter API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4:
                                        data = _f.sent();
                                        content = (_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
                                        console.log("[LLM] \u2705 OpenRouter respondeu com ".concat((content === null || content === void 0 ? void 0 : content.length) || 0, " caracteres (provider: ").concat(providerSlug, ")"));
                                        return [2 /*return*/, typeof content === 'string' ? content : ''];
                                }
                            });
                        }); }, "OpenRouter API (".concat(model, ")"))];
                case 1: 
                // 🔄 Usar retry automático para lidar com erros temporários
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Chama o Groq API diretamente COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 */
function callGroqAPI(messages, apiKey, options) {
    return __awaiter(this, void 0, void 0, function () {
        var model;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    model = (options === null || options === void 0 ? void 0 : options.model) || 'openai/gpt-oss-20b';
                    console.log("[LLM] \uD83D\uDE80 Chamando Groq API com modelo: ".concat(model));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error, data, content;
                            var _a, _b, _c, _d, _e;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0: return [4 /*yield*/, fetch('https://api.groq.com/openai/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(apiKey),
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                model: model,
                                                messages: messages,
                                                temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                                                max_tokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 500,
                                            }),
                                        })];
                                    case 1:
                                        response = _f.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _f.sent();
                                        console.error("[LLM] Groq API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("Groq API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4:
                                        data = _f.sent();
                                        content = (_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
                                        console.log("[LLM] \u2705 Groq respondeu com ".concat((content === null || content === void 0 ? void 0 : content.length) || 0, " caracteres"));
                                        return [2 /*return*/, typeof content === 'string' ? content : ''];
                                }
                            });
                        }); }, "Groq API (".concat(model, ")"))];
                case 1: 
                // 🔄 Usar retry automático para lidar com erros temporários
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Chama o NVIDIA NIM API COM RETRY AUTOMÁTICO
 * API OpenAI-compatible em https://integrate.api.nvidia.com/v1
 * 🆕 NVIDIA NIM - Inferência ultra-rápida com modelos otimizados
 *
 * Modelos recomendados:
 * - nvidia/llama-3.3-nemotron-super-49b-v1 (melhor custo-benefício para chat)
 * - meta/llama-3.1-70b-instruct (multilingual, qualidade alta)
 * - meta/llama-3.1-8b-instruct (ultra rápido)
 */
function callNvidiaAPI(messages, apiKey, options) {
    return __awaiter(this, void 0, void 0, function () {
        var model;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    model = (options === null || options === void 0 ? void 0 : options.model) || 'nvidia/llama-3.3-nemotron-super-49b-v1';
                    console.log("[LLM] \uD83D\uDFE2 Chamando NVIDIA NIM API com modelo: ".concat(model));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error, data, content;
                            var _a, _b, _c, _d, _e;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0: return [4 /*yield*/, fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(apiKey),
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                model: model,
                                                messages: messages,
                                                temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                                                max_tokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 1024,
                                            }),
                                        })];
                                    case 1:
                                        response = _f.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _f.sent();
                                        console.error("[LLM] NVIDIA NIM API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("NVIDIA NIM API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4:
                                        data = _f.sent();
                                        content = (_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
                                        console.log("[LLM] \u2705 NVIDIA NIM respondeu com ".concat((content === null || content === void 0 ? void 0 : content.length) || 0, " caracteres"));
                                        return [2 /*return*/, typeof content === 'string' ? content : ''];
                                }
                            });
                        }); }, "NVIDIA NIM API (".concat(model, ")"))];
                case 1: 
                // 🔄 Usar retry automático para lidar com erros temporários
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Chama o Mistral API COM ROTAÇÃO AUTOMÁTICA DE MODELOS
 * Quando um modelo atinge rate limit, rotaciona para o próximo disponível
 * 🔧 NOVA VERSÃO: Rotação inteligente entre modelos gratuitos
 */
function callMistralAPI(messages, options) {
    return __awaiter(this, void 0, void 0, function () {
        var mistral, adminModel, triedModels, maxModelAttempts, lastError, _loop_2, modelAttempt, state_2;
        var _this = this;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 1:
                    mistral = _e.sent();
                    if (!mistral) {
                        console.error('[LLM] Mistral client não disponível');
                        return [2 /*return*/, ''];
                    }
                    adminModel = (options === null || options === void 0 ? void 0 : options.model) || 'mistral-small-latest';
                    triedModels = [];
                    // Limpar cooldowns expirados no início de cada mensagem
                    clearExpiredMistralCooldowns();
                    console.log("[LLM] \uD83C\uDFAF Modelo escolhido pelo admin: ".concat(adminModel));
                    maxModelAttempts = 15;
                    lastError = null;
                    _loop_2 = function (modelAttempt) {
                        var currentModel, isAdminModel, result, error_3, isRateLimit;
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0:
                                    currentModel = getNextAvailableMistralModel(adminModel, triedModels);
                                    if (!currentModel) {
                                        console.error('[LLM] ❌ Nenhum modelo Mistral disponível após tentar todos os fallbacks!');
                                        return [2 /*return*/, "break"];
                                    }
                                    triedModels.push(currentModel);
                                    isAdminModel = currentModel === adminModel;
                                    console.log("[LLM] \uD83D\uDE80 Chamando Mistral - Modelo: ".concat(currentModel, " ").concat(isAdminModel ? '(ADMIN)' : '(FALLBACK)', " [").concat(modelAttempt, "/").concat(maxModelAttempts, "]"));
                                    _f.label = 1;
                                case 1:
                                    _f.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                                            var response, content;
                                            var _a, _b, _c, _d, _e;
                                            return __generator(this, function (_f) {
                                                switch (_f.label) {
                                                    case 0: return [4 /*yield*/, mistral.chat.complete({
                                                            model: currentModel,
                                                            messages: messages,
                                                            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                                                            maxTokens: (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 500,
                                                        })];
                                                    case 1:
                                                        response = _f.sent();
                                                        content = (_e = (_d = (_c = response.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
                                                        console.log("[LLM] \u2705 Mistral (".concat(currentModel, ") respondeu com ").concat(typeof content === 'string' ? content.length : 0, " caracteres"));
                                                        return [2 /*return*/, typeof content === 'string' ? content : ''];
                                                }
                                            });
                                        }); }, "Mistral API (".concat(currentModel, ")"), 2, 1500)];
                                case 2:
                                    result = _f.sent();
                                    return [2 /*return*/, { value: result }];
                                case 3:
                                    error_3 = _f.sent();
                                    lastError = error_3;
                                    isRateLimit = (error_3 === null || error_3 === void 0 ? void 0 : error_3.status) === 429 ||
                                        (error_3 === null || error_3 === void 0 ? void 0 : error_3.statusCode) === 429 ||
                                        ((_b = (_a = error_3 === null || error_3 === void 0 ? void 0 : error_3.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === null || _b === void 0 ? void 0 : _b.includes('rate limit')) ||
                                        ((_d = (_c = error_3 === null || error_3 === void 0 ? void 0 : error_3.message) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === null || _d === void 0 ? void 0 : _d.includes('too many requests'));
                                    if (isRateLimit) {
                                        console.log("\u26A0\uFE0F [LLM] Rate limit no modelo ".concat(currentModel, " - buscando fallback..."));
                                        markMistralModelRateLimited(currentModel);
                                        return [2 /*return*/, "continue"];
                                    }
                                    // Se não for rate limit, propagar erro (não adianta tentar outro modelo)
                                    console.error("\u274C [LLM] Erro n\u00E3o-recuper\u00E1vel no Mistral (".concat(currentModel, "): ").concat((error_3 === null || error_3 === void 0 ? void 0 : error_3.message) || error_3));
                                    throw error_3;
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    modelAttempt = 1;
                    _e.label = 2;
                case 2:
                    if (!(modelAttempt <= maxModelAttempts)) return [3 /*break*/, 5];
                    return [5 /*yield**/, _loop_2(modelAttempt)];
                case 3:
                    state_2 = _e.sent();
                    if (typeof state_2 === "object")
                        return [2 /*return*/, state_2.value];
                    if (state_2 === "break")
                        return [3 /*break*/, 5];
                    _e.label = 4;
                case 4:
                    modelAttempt++;
                    return [3 /*break*/, 2];
                case 5:
                    console.error("\u274C [LLM] Todos os ".concat(triedModels.length, " modelos Mistral falharam! Tentados: ").concat(triedModels.join(', ')));
                    throw lastError || new Error('Todos os modelos Mistral falharam');
            }
        });
    });
}
/**
 * Função principal de chamada LLM - usa provider configurado
 */
function callGroq(messages, options) {
    return __awaiter(this, void 0, void 0, function () {
        var formattedMessages, config, openrouterError_1, nvidiaError_1, groqError_1, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 22, , 23]);
                    formattedMessages = typeof messages === 'string'
                        ? [{ role: 'user', content: messages }]
                        : messages;
                    return [4 /*yield*/, getLLMConfig()];
                case 1:
                    config = _a.sent();
                    if (!(config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20)) return [3 /*break*/, 7];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 7]);
                    return [4 /*yield*/, callOpenRouterAPI(formattedMessages, config.openrouterApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.openrouterModel, openrouterProvider: config.openrouterProvider // 🎯 Provider dinâmico!
                         }))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    openrouterError_1 = _a.sent();
                    console.error('[LLM] Erro no OpenRouter, tentando fallback para Groq:', openrouterError_1);
                    if (!(config.groqApiKey && config.groqApiKey.length > 20)) return [3 /*break*/, 6];
                    return [4 /*yield*/, callGroqAPI(formattedMessages, config.groqApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.groqModel }))];
                case 5: return [2 /*return*/, _a.sent()];
                case 6: return [3 /*break*/, 7];
                case 7:
                    if (!(config.provider === 'nvidia' && config.nvidiaApiKey && config.nvidiaApiKey.length > 20)) return [3 /*break*/, 15];
                    _a.label = 8;
                case 8:
                    _a.trys.push([8, 10, , 15]);
                    return [4 /*yield*/, callNvidiaAPI(formattedMessages, config.nvidiaApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.nvidiaModel }))];
                case 9: return [2 /*return*/, _a.sent()];
                case 10:
                    nvidiaError_1 = _a.sent();
                    console.error('[LLM] Erro no NVIDIA NIM, tentando fallback para OpenRouter:', nvidiaError_1);
                    if (!(config.openrouterApiKey && config.openrouterApiKey.length > 20)) return [3 /*break*/, 12];
                    return [4 /*yield*/, callOpenRouterAPI(formattedMessages, config.openrouterApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.openrouterModel, openrouterProvider: config.openrouterProvider }))];
                case 11: return [2 /*return*/, _a.sent()];
                case 12:
                    if (!(config.groqApiKey && config.groqApiKey.length > 20)) return [3 /*break*/, 14];
                    return [4 /*yield*/, callGroqAPI(formattedMessages, config.groqApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.groqModel }))];
                case 13: return [2 /*return*/, _a.sent()];
                case 14: return [3 /*break*/, 15];
                case 15:
                    if (!(config.provider === 'groq' && config.groqApiKey && config.groqApiKey.length > 20)) return [3 /*break*/, 20];
                    _a.label = 16;
                case 16:
                    _a.trys.push([16, 18, , 20]);
                    return [4 /*yield*/, callGroqAPI(formattedMessages, config.groqApiKey, __assign(__assign({}, options), { model: (options === null || options === void 0 ? void 0 : options.model) || config.groqModel }))];
                case 17: return [2 /*return*/, _a.sent()];
                case 18:
                    groqError_1 = _a.sent();
                    console.error('[LLM] Erro no Groq, tentando fallback para Mistral:', groqError_1);
                    return [4 /*yield*/, callMistralAPI(formattedMessages, options)];
                case 19: 
                // Fallback para Mistral em caso de erro
                return [2 /*return*/, _a.sent()];
                case 20: return [4 /*yield*/, callMistralAPI(formattedMessages, options)];
                case 21: 
                // Default: usar Mistral
                return [2 /*return*/, _a.sent()];
                case 22:
                    error_4 = _a.sent();
                    console.error('[LLM] Erro ao chamar LLM:', error_4);
                    return [2 /*return*/, ''];
                case 23: return [2 /*return*/];
            }
        });
    });
}
/**
 * Função para obter o provider atual (para logs/debug)
 */
function getCurrentProvider() {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getLLMConfig()];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, config.provider];
            }
        });
    });
}
/**
 * Função de chat completo - substitui getMistralClient().chat.complete()
 * Usa o provider configurado (OpenRouter, Groq ou Mistral)
 * 🔄 COM RETRY AUTOMÁTICO para lidar com rate limits e erros temporários
 */
function chatComplete(params) {
    return __awaiter(this, void 0, void 0, function () {
        var config, hasOpenRouterKey, hasGroqKey, hasMistralKey, hasNvidiaKey, model_1, data, responseContent, promptTokens, completionTokens, nvidiaError_2, adminModel, triedModels, maxModelAttempts, lastMistralError, _loop_3, modelAttempt, state_3, _a, nextModel, delay_2, mistral_1, retryResponse, retryError_1, nvidiaFallbackModel_1, nvidiaFallbackResponse, nvidiaFallbackError_1, fallbackModel_1, fallbackResponse, openrouterFallbackError_1, fallbackModel_2, nemoFallbackResponse, nemoFallbackError_1, model_2, modelToProviderMap, autoProvider, configuredProvider, providerSlug_1, data, responseContent, finishReason, promptTokens, completionTokens, openrouterError_2, nvidiaModel, nvidiaContent, nvidiaFallbackError_2, lastResortModel_1, data, lastResortError_1, mistralModel, mistral, mistralResponse;
        var _this = this;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5;
        return __generator(this, function (_6) {
            switch (_6.label) {
                case 0: return [4 /*yield*/, getLLMConfig()];
                case 1:
                    config = _6.sent();
                    hasOpenRouterKey = config.openrouterApiKey && config.openrouterApiKey.length > 20;
                    hasGroqKey = config.groqApiKey && config.groqApiKey.length > 20;
                    hasMistralKey = (config.mistralApiKey && config.mistralApiKey.length > 10) || (!!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10);
                    hasNvidiaKey = config.nvidiaApiKey && config.nvidiaApiKey.length > 20;
                    if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey && !hasNvidiaKey) {
                        console.error('❌ [LLM] ERRO: Nenhuma API key configurada!');
                        console.error('   └─ Configure uma chave em: Admin → Configurações → Provedor de IA');
                        console.error('   └─ Provider atual: ' + config.provider);
                        throw new Error('API key não configurada. Configure uma chave de API em: Admin → Configurações → Provedor de IA (LLM)');
                    }
                    if (!(config.provider === 'nvidia' && hasNvidiaKey)) return [3 /*break*/, 5];
                    _6.label = 2;
                case 2:
                    _6.trys.push([2, 4, , 5]);
                    model_1 = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
                    console.log("[LLM] \uD83D\uDFE2 chatComplete via NVIDIA NIM com modelo: ".concat(model_1));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(config.nvidiaApiKey),
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                model: model_1,
                                                messages: params.messages,
                                                max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 1024,
                                                temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            }),
                                        })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] NVIDIA NIM API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("NVIDIA NIM API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "NVIDIA NIM chatComplete (".concat(model_1, ")"))];
                case 3:
                    data = _6.sent();
                    responseContent = (_d = (_c = (_b = data.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content;
                    promptTokens = (_e = data.usage) === null || _e === void 0 ? void 0 : _e.prompt_tokens;
                    completionTokens = (_f = data.usage) === null || _f === void 0 ? void 0 : _f.completion_tokens;
                    console.log("[LLM] \u2705 NVIDIA NIM chatComplete respondeu");
                    console.log("[LLM] \uD83D\uDCCA Tokens: prompt=".concat(promptTokens || 'N/A', ", completion=").concat(completionTokens || 'N/A'));
                    console.log("[LLM] \uD83D\uDCCA Response length: ".concat((responseContent === null || responseContent === void 0 ? void 0 : responseContent.length) || 0, " chars"));
                    return [2 /*return*/, {
                            choices: ((_g = data.choices) === null || _g === void 0 ? void 0 : _g.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 4:
                    nvidiaError_2 = _6.sent();
                    console.error('═══════════════════════════════════════════════════════════════');
                    console.error('🔄 [LLM FALLBACK] NVIDIA NIM FALHOU!');
                    console.error("   \u2514\u2500 Erro: ".concat((nvidiaError_2 === null || nvidiaError_2 === void 0 ? void 0 : nvidiaError_2.message) || nvidiaError_2));
                    console.error('🔄 [LLM FALLBACK] Tentando fallback para OpenRouter/Groq/Mistral...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    return [3 /*break*/, 5];
                case 5:
                    if (!(config.provider === 'mistral' && hasMistralKey && !isCircuitBreakerOpen())) return [3 /*break*/, 28];
                    adminModel = config.mistralModel || 'mistral-small-latest';
                    triedModels = [];
                    // Limpar cooldowns expirados no início de cada mensagem
                    clearExpiredMistralCooldowns();
                    console.log("[LLM] \uD83C\uDFAF chatComplete via Mistral - Modelo do admin: ".concat(adminModel));
                    maxModelAttempts = 5;
                    lastMistralError = null;
                    _loop_3 = function (modelAttempt) {
                        var currentModel, isAdminModel, mistral_2, mistralResponse_1, mistralError_1, isRateLimit;
                        return __generator(this, function (_7) {
                            switch (_7.label) {
                                case 0:
                                    currentModel = getNextAvailableMistralModel(adminModel, triedModels);
                                    if (!currentModel) {
                                        console.log("\u26A0\uFE0F [LLM] Nenhum modelo Mistral dispon\u00EDvel, tentando fallback para outros providers...");
                                        return [2 /*return*/, "break"];
                                    }
                                    triedModels.push(currentModel);
                                    isAdminModel = currentModel === adminModel;
                                    console.log("[LLM] \uD83D\uDE80 Mistral chatComplete - Modelo: ".concat(currentModel, " ").concat(isAdminModel ? '(ADMIN)' : '(FALLBACK)', " [").concat(modelAttempt, "/").concat(maxModelAttempts, "]"));
                                    _7.label = 1;
                                case 1:
                                    _7.trys.push([1, 4, , 5]);
                                    return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                                case 2:
                                    mistral_2 = _7.sent();
                                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                                            var _a, _b;
                                            return __generator(this, function (_c) {
                                                switch (_c.label) {
                                                    case 0: return [4 /*yield*/, mistral_2.chat.complete({
                                                            model: currentModel,
                                                            messages: params.messages,
                                                            maxTokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                                            temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                                            randomSeed: params.randomSeed,
                                                        })];
                                                    case 1: return [2 /*return*/, _c.sent()];
                                                }
                                            });
                                        }); }, "Mistral chatComplete (".concat(currentModel, ")"), 1, 1500)];
                                case 3:
                                    mistralResponse_1 = _7.sent();
                                    console.log("[LLM] \u2705 Mistral chatComplete (".concat(currentModel, ") respondeu"));
                                    // ✅ SUCESSO! Limpar status da fila de falhas
                                    clearMistralQueueStatus();
                                    recordCircuitBreakerSuccess();
                                    return [2 /*return*/, { value: {
                                                choices: ((_h = mistralResponse_1.choices) === null || _h === void 0 ? void 0 : _h.map(function (c) {
                                                    var _a, _b;
                                                    return ({
                                                        message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                                        finishReason: c.finishReason
                                                    });
                                                })) || []
                                            } }];
                                case 4:
                                    mistralError_1 = _7.sent();
                                    lastMistralError = mistralError_1;
                                    isRateLimit = (mistralError_1 === null || mistralError_1 === void 0 ? void 0 : mistralError_1.status) === 429 ||
                                        (mistralError_1 === null || mistralError_1 === void 0 ? void 0 : mistralError_1.statusCode) === 429 ||
                                        ((_k = (_j = mistralError_1 === null || mistralError_1 === void 0 ? void 0 : mistralError_1.message) === null || _j === void 0 ? void 0 : _j.toLowerCase()) === null || _k === void 0 ? void 0 : _k.includes('rate limit')) ||
                                        ((_m = (_l = mistralError_1 === null || mistralError_1 === void 0 ? void 0 : mistralError_1.message) === null || _l === void 0 ? void 0 : _l.toLowerCase()) === null || _m === void 0 ? void 0 : _m.includes('too many requests'));
                                    if (isRateLimit) {
                                        console.log("\u26A0\uFE0F [LLM] Rate limit no modelo ".concat(currentModel, " - buscando fallback..."));
                                        markMistralModelRateLimited(currentModel);
                                        return [2 /*return*/, "continue"];
                                    }
                                    // Se não for rate limit, logar e continuar para fallback de provider
                                    console.error("\u274C [LLM] Erro no Mistral (".concat(currentModel, "): ").concat((mistralError_1 === null || mistralError_1 === void 0 ? void 0 : mistralError_1.message) || mistralError_1));
                                    return [2 /*return*/, "break"];
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    modelAttempt = 1;
                    _6.label = 6;
                case 6:
                    if (!(modelAttempt <= maxModelAttempts)) return [3 /*break*/, 9];
                    return [5 /*yield**/, _loop_3(modelAttempt)];
                case 7:
                    state_3 = _6.sent();
                    if (typeof state_3 === "object")
                        return [2 /*return*/, state_3.value];
                    if (state_3 === "break")
                        return [3 /*break*/, 9];
                    _6.label = 8;
                case 8:
                    modelAttempt++;
                    return [3 /*break*/, 6];
                case 9:
                    // Se chegou aqui, todos os modelos Mistral falharam
                    console.error('═══════════════════════════════════════════════════════════════');
                    console.error("\uD83D\uDD04 [LLM FALLBACK] Mistral FALHOU ap\u00F3s tentar ".concat(triedModels.length, " modelos: ").concat(triedModels.join(', ')));
                    // 🛡️ CIRCUIT BREAKER + Registrar falha
                    recordCircuitBreakerFailure();
                    registerMistralFailure();
                    if (!(!params.skipMistralQueue && !canFallbackToExternal())) return [3 /*break*/, 15];
                    _a = getNextMistralModelRoundRobin(), nextModel = _a.model, delay_2 = _a.delay;
                    console.log("\u23F3 [LLM QUEUE] Aguardando ".concat(delay_2 / 1000, "s antes de retentar ").concat(nextModel, "..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_2); })];
                case 10:
                    _6.sent();
                    _6.label = 11;
                case 11:
                    _6.trys.push([11, 14, , 15]);
                    return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 12:
                    mistral_1 = _6.sent();
                    return [4 /*yield*/, mistral_1.chat.complete({
                            model: nextModel,
                            messages: params.messages,
                            maxTokens: (_o = params.maxTokens) !== null && _o !== void 0 ? _o : 500,
                            temperature: (_p = params.temperature) !== null && _p !== void 0 ? _p : 0.7,
                            randomSeed: params.randomSeed,
                        })];
                case 13:
                    retryResponse = _6.sent();
                    console.log("[LLM] \u2705 Mistral (".concat(nextModel, ") respondeu ap\u00F3s aguardar delay!"));
                    clearMistralQueueStatus(); // Sucesso! Limpar fila
                    recordCircuitBreakerSuccess();
                    return [2 /*return*/, {
                            choices: ((_q = retryResponse.choices) === null || _q === void 0 ? void 0 : _q.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finishReason
                                });
                            })) || []
                        }];
                case 14:
                    retryError_1 = _6.sent();
                    console.log("\u26A0\uFE0F [LLM QUEUE] ".concat(nextModel, " falhou novamente, continuando tentativas..."));
                    markMistralModelRateLimited(nextModel);
                    // Não fazer fallback ainda - deixar próxima chamada tentar novamente
                    throw new Error("Mistral em rate limit - aguardando fila (".concat(getMistralQueueInfo().timeUntilFallback, "s restantes para fallback)"));
                case 15:
                    if (params.skipMistralQueue) {
                        console.log("\u26A1 [LLM QUEUE] skipMistralQueue=true - liberando fallback externo imediato");
                    }
                    else {
                        console.log("\u2705 [LLM QUEUE] 5 minutos atingidos - liberando fallback para NVIDIA/OpenRouter/Groq");
                    }
                    clearMistralQueueStatus(); // Limpar status para próxima sessão
                    if (!hasNvidiaKey) return [3 /*break*/, 19];
                    console.error('🔄 [LLM FALLBACK] Tentando NVIDIA NIM como fallback (ultra-rápido)...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    _6.label = 16;
                case 16:
                    _6.trys.push([16, 18, , 19]);
                    nvidiaFallbackModel_1 = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
                    console.log("[LLM] \uD83C\uDD98 NVIDIA NIM FALLBACK - Modelo: ".concat(nvidiaFallbackModel_1));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(config.nvidiaApiKey),
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                model: nvidiaFallbackModel_1,
                                                messages: params.messages,
                                                max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 1024,
                                                temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            }),
                                        })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] NVIDIA NIM FALLBACK error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("NVIDIA NIM FALLBACK error: ".concat(response.status));
                                        error.status = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "NVIDIA NIM FALLBACK (".concat(nvidiaFallbackModel_1, ")"), 2, 1500)];
                case 17:
                    nvidiaFallbackResponse = _6.sent();
                    console.log("[LLM] \u2705 NVIDIA NIM FALLBACK respondeu com sucesso!");
                    return [2 /*return*/, {
                            choices: ((_r = nvidiaFallbackResponse.choices) === null || _r === void 0 ? void 0 : _r.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 18:
                    nvidiaFallbackError_1 = _6.sent();
                    console.error("\u274C [LLM] NVIDIA NIM FALLBACK tamb\u00E9m falhou: ".concat(nvidiaFallbackError_1 === null || nvidiaFallbackError_1 === void 0 ? void 0 : nvidiaFallbackError_1.message));
                    return [3 /*break*/, 19];
                case 19:
                    if (!hasOpenRouterKey) return [3 /*break*/, 23];
                    console.error('🔄 [LLM FALLBACK] Tentando OpenRouter como fallback...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    _6.label = 20;
                case 20:
                    _6.trys.push([20, 22, , 23]);
                    fallbackModel_1 = config.openrouterModel || 'google/gemma-3-4b-it:free';
                    console.log("[LLM] \uD83C\uDD98 OpenRouter FALLBACK - Modelo: ".concat(fallbackModel_1));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, fetch('https://openrouter.ai/api/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(config.openrouterApiKey),
                                                'Content-Type': 'application/json',
                                                'HTTP-Referer': 'https://agentezap.online',
                                                'X-Title': 'AgenteZap'
                                            },
                                            body: JSON.stringify({
                                                model: fallbackModel_1,
                                                messages: params.messages,
                                                max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                                temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            }),
                                        })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] OpenRouter FALLBACK error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("OpenRouter FALLBACK error: ".concat(response.status));
                                        error.status = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "OpenRouter FALLBACK (".concat(fallbackModel_1, ")"), 3, 2000)];
                case 21:
                    fallbackResponse = _6.sent();
                    console.log("[LLM] \u2705 OpenRouter FALLBACK respondeu com sucesso!");
                    return [2 /*return*/, {
                            choices: ((_s = fallbackResponse.choices) === null || _s === void 0 ? void 0 : _s.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 22:
                    openrouterFallbackError_1 = _6.sent();
                    console.error("\u274C [LLM] OpenRouter FALLBACK tamb\u00E9m falhou: ".concat(openrouterFallbackError_1 === null || openrouterFallbackError_1 === void 0 ? void 0 : openrouterFallbackError_1.message));
                    return [3 /*break*/, 23];
                case 23:
                    if (!hasOpenRouterKey) return [3 /*break*/, 27];
                    console.error('🔄 [LLM FALLBACK] Tentando OpenRouter (mistral-nemo) como último fallback...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    _6.label = 24;
                case 24:
                    _6.trys.push([24, 26, , 27]);
                    fallbackModel_2 = 'mistralai/mistral-nemo';
                    console.log("[LLM] \uD83C\uDD98 OpenRouter mistral-nemo FALLBACK - Modelo: ".concat(fallbackModel_2));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, fetch('https://openrouter.ai/api/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(config.openrouterApiKey),
                                                'Content-Type': 'application/json',
                                                'HTTP-Referer': 'https://agentezap.online',
                                                'X-Title': 'AgenteZap'
                                            },
                                            body: JSON.stringify({
                                                model: fallbackModel_2,
                                                messages: params.messages,
                                                max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                                temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            }),
                                        })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] OpenRouter mistral-nemo FALLBACK error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("OpenRouter mistral-nemo FALLBACK error: ".concat(response.status));
                                        error.status = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "OpenRouter mistral-nemo FALLBACK", 3, 2000)];
                case 25:
                    nemoFallbackResponse = _6.sent();
                    console.log("[LLM] \u2705 OpenRouter mistral-nemo FALLBACK respondeu!");
                    return [2 /*return*/, {
                            choices: ((_t = nemoFallbackResponse.choices) === null || _t === void 0 ? void 0 : _t.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 26:
                    nemoFallbackError_1 = _6.sent();
                    console.error("\u274C [LLM] OpenRouter mistral-nemo FALLBACK tamb\u00E9m falhou: ".concat(nemoFallbackError_1 === null || nemoFallbackError_1 === void 0 ? void 0 : nemoFallbackError_1.message));
                    return [3 /*break*/, 27];
                case 27:
                    // ❌ Todos os fallbacks falharam
                    console.error('═══════════════════════════════════════════════════════════════');
                    console.error('❌ [LLM] TODOS OS PROVIDERS FALHARAM!');
                    console.error('   └─ Mistral: Todos os modelos em rate limit');
                    console.error('   └─ NVIDIA NIM: ' + (hasNvidiaKey ? 'Falhou' : 'Não configurado'));
                    console.error('   └─ OpenRouter: ' + (hasOpenRouterKey ? 'Falhou' : 'Não configurado'));
                    console.error('   └─ OpenRouter (mistral-nemo): ' + (hasOpenRouterKey ? 'Falhou' : 'Não configurado'));
                    console.error('═══════════════════════════════════════════════════════════════');
                    throw lastMistralError || new Error('Todos os provedores de LLM falharam');
                case 28:
                    if (!(config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20)) return [3 /*break*/, 36];
                    _6.label = 29;
                case 29:
                    _6.trys.push([29, 31, , 36]);
                    model_2 = config.openrouterModel;
                    modelToProviderMap = {
                        'google/gemma-3-4b-it:free': 'auto', // Validado: 71.7% sucesso
                        'google/gemma-3-4b-it': 'auto',
                        'google/gemma-3n-e4b-it': 'together',
                        'google/gemma-3n-e2b-it': 'together',
                        'google/gemma-3n-e4b-it:free': 'together',
                        'google/gemma-3n-e2b-it:free': 'together',
                    };
                    autoProvider = modelToProviderMap[model_2] || 'auto';
                    configuredProvider = config.openrouterProvider || 'auto';
                    providerSlug_1 = autoProvider !== 'auto' ? autoProvider : configuredProvider;
                    console.log("[LLM] \uD83D\uDE80 chatComplete via OpenRouter com modelo: ".concat(model_2, ", provider: ").concat(providerSlug_1, " (auto-detected: ").concat(autoProvider, ", configured: ").concat(configuredProvider, ")"));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var requestBody, response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        requestBody = {
                                            model: model_2,
                                            messages: params.messages,
                                            max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                            temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                        };
                                        // Só adicionar provider se NÃO for 'auto'
                                        if (providerSlug_1 !== 'auto') {
                                            requestBody.provider = {
                                                order: [providerSlug_1],
                                                allow_fallbacks: true // ✅ Permitir fallback se provider não tiver o modelo
                                            };
                                        }
                                        return [4 /*yield*/, fetch('https://openrouter.ai/api/v1/chat/completions', {
                                                method: 'POST',
                                                headers: {
                                                    'Authorization': "Bearer ".concat(config.openrouterApiKey),
                                                    'Content-Type': 'application/json',
                                                    'HTTP-Referer': 'https://agentezap.online',
                                                    'X-Title': 'AgenteZap'
                                                },
                                                body: JSON.stringify(requestBody),
                                            })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] OpenRouter API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("OpenRouter API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "OpenRouter chatComplete (".concat(model_2, " via ").concat(providerSlug_1, ")"))];
                case 30:
                    data = _6.sent();
                    responseContent = (_w = (_v = (_u = data.choices) === null || _u === void 0 ? void 0 : _u[0]) === null || _v === void 0 ? void 0 : _v.message) === null || _w === void 0 ? void 0 : _w.content;
                    finishReason = (_y = (_x = data.choices) === null || _x === void 0 ? void 0 : _x[0]) === null || _y === void 0 ? void 0 : _y.finish_reason;
                    promptTokens = (_z = data.usage) === null || _z === void 0 ? void 0 : _z.prompt_tokens;
                    completionTokens = (_0 = data.usage) === null || _0 === void 0 ? void 0 : _0.completion_tokens;
                    console.log("[LLM] \u2705 OpenRouter chatComplete respondeu (provider: ".concat(providerSlug_1, ")"));
                    console.log("[LLM] \uD83D\uDCCA Tokens: prompt=".concat(promptTokens || 'N/A', ", completion=").concat(completionTokens || 'N/A'));
                    console.log("[LLM] \uD83D\uDCCA finish_reason: ".concat(finishReason || 'N/A'));
                    console.log("[LLM] \uD83D\uDCCA Response length: ".concat((responseContent === null || responseContent === void 0 ? void 0 : responseContent.length) || 0, " chars"));
                    if (!responseContent || responseContent.length === 0) {
                        console.warn("[LLM] \u26A0\uFE0F RESPOSTA VAZIA do OpenRouter! finish_reason=".concat(finishReason));
                        console.warn("[LLM] \u26A0\uFE0F Full response: ".concat(JSON.stringify(data).substring(0, 500)));
                    }
                    else {
                        console.log("[LLM] \uD83D\uDCDD Response preview: \"".concat(responseContent.substring(0, 100), "...\""));
                    }
                    return [2 /*return*/, {
                            choices: ((_1 = data.choices) === null || _1 === void 0 ? void 0 : _1.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 31:
                    openrouterError_2 = _6.sent();
                    console.error('═══════════════════════════════════════════════════════════════');
                    console.error('🔄 [LLM FALLBACK] OpenRouter FALHOU após 3 tentativas!');
                    console.error("   \u2514\u2500 Erro: ".concat((openrouterError_2 === null || openrouterError_2 === void 0 ? void 0 : openrouterError_2.message) || openrouterError_2));
                    console.error('🔄 [LLM FALLBACK] Tentando NVIDIA NIM antes do Groq...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    if (!hasNvidiaKey) return [3 /*break*/, 35];
                    _6.label = 32;
                case 32:
                    _6.trys.push([32, 34, , 35]);
                    nvidiaModel = config.nvidiaModel || 'nvidia/llama-3.3-nemotron-super-49b-v1';
                    console.log("[LLM] \uD83D\uDD04 NVIDIA NIM fallback (ap\u00F3s OpenRouter falhar) com modelo: ".concat(nvidiaModel));
                    return [4 /*yield*/, callNvidiaAPI(params.messages, config.nvidiaApiKey, {
                            model: nvidiaModel,
                            maxTokens: (_2 = params.maxTokens) !== null && _2 !== void 0 ? _2 : 500,
                            temperature: (_3 = params.temperature) !== null && _3 !== void 0 ? _3 : 0.7
                        })];
                case 33:
                    nvidiaContent = _6.sent();
                    console.log("[LLM] \u2705 NVIDIA NIM respondeu como fallback do OpenRouter!");
                    return [2 /*return*/, {
                            choices: [{
                                    message: { content: nvidiaContent },
                                    finishReason: 'stop'
                                }]
                        }];
                case 34:
                    nvidiaFallbackError_2 = _6.sent();
                    console.error("[LLM] \u274C NVIDIA NIM fallback tamb\u00E9m falhou: ".concat(nvidiaFallbackError_2 === null || nvidiaFallbackError_2 === void 0 ? void 0 : nvidiaFallbackError_2.message));
                    return [3 /*break*/, 35];
                case 35: return [3 /*break*/, 36];
                case 36:
                    if (!((config.provider === 'groq' || config.provider === 'openrouter' || config.provider === 'nvidia' || config.provider === 'mistral') && config.openrouterApiKey && config.openrouterApiKey.length > 20)) return [3 /*break*/, 40];
                    _6.label = 37;
                case 37:
                    _6.trys.push([37, 39, , 40]);
                    lastResortModel_1 = 'mistralai/mistral-nemo';
                    console.log("[LLM] \uD83D\uDE80 chatComplete via OpenRouter (\u00FAltimo recurso) com modelo: ".concat(lastResortModel_1));
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var response, errorText, error;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, fetch('https://openrouter.ai/api/v1/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': "Bearer ".concat(config.openrouterApiKey),
                                                'Content-Type': 'application/json',
                                                'HTTP-Referer': 'https://agentezap.online',
                                                'X-Title': 'AgenteZap'
                                            },
                                            body: JSON.stringify({
                                                model: lastResortModel_1,
                                                messages: params.messages,
                                                max_tokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                                temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            }),
                                        })];
                                    case 1:
                                        response = _c.sent();
                                        if (!!response.ok) return [3 /*break*/, 3];
                                        return [4 /*yield*/, response.text()];
                                    case 2:
                                        errorText = _c.sent();
                                        console.error("[LLM] OpenRouter (mistral-nemo) API error: ".concat(response.status, " - ").concat(errorText));
                                        error = new Error("OpenRouter (mistral-nemo) API error: ".concat(response.status));
                                        error.status = response.status;
                                        error.statusCode = response.status;
                                        throw error;
                                    case 3: return [4 /*yield*/, response.json()];
                                    case 4: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "OpenRouter mistral-nemo (\u00FAltimo recurso)")];
                case 38:
                    data = _6.sent();
                    console.log("[LLM] \u2705 OpenRouter mistral-nemo respondeu como \u00FAltimo recurso");
                    return [2 /*return*/, {
                            choices: ((_4 = data.choices) === null || _4 === void 0 ? void 0 : _4.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finish_reason
                                });
                            })) || []
                        }];
                case 39:
                    lastResortError_1 = _6.sent();
                    console.error('═══════════════════════════════════════════════════════════════');
                    console.error('🔄 [LLM FALLBACK] OpenRouter mistral-nemo FALHOU!');
                    console.error("   \u2514\u2500 Erro: ".concat((lastResortError_1 === null || lastResortError_1 === void 0 ? void 0 : lastResortError_1.message) || lastResortError_1));
                    console.error('🔄 [LLM FALLBACK] Tentando Mistral como último recurso absoluto...');
                    console.error('═══════════════════════════════════════════════════════════════');
                    return [3 /*break*/, 40];
                case 40:
                    // Fallback para Mistral (ÚLTIMO RECURSO - após OpenRouter e Groq falharem)
                    console.log('🆘 [LLM FALLBACK FINAL] Usando Mistral como último recurso!');
                    mistralModel = config.mistralModel || 'mistral-small-latest';
                    console.log("[LLM] \uD83D\uDE80 chatComplete via Mistral (fallback) com modelo: ".concat(mistralModel));
                    return [4 /*yield*/, (0, mistralClient_1.getMistralClient)()];
                case 41:
                    mistral = _6.sent();
                    return [4 /*yield*/, withRetryLLM(function () { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, mistral.chat.complete({
                                            model: mistralModel, // Usar modelo configurado no admin
                                            messages: params.messages,
                                            maxTokens: (_a = params.maxTokens) !== null && _a !== void 0 ? _a : 500,
                                            temperature: (_b = params.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                            randomSeed: params.randomSeed,
                                        })];
                                    case 1: return [2 /*return*/, _c.sent()];
                                }
                            });
                        }); }, "Mistral fallback (".concat(mistralModel, ")"), 3, 2000)];
                case 42:
                    mistralResponse = _6.sent();
                    console.log("[LLM] \u2705 Mistral chatComplete respondeu");
                    return [2 /*return*/, {
                            choices: ((_5 = mistralResponse.choices) === null || _5 === void 0 ? void 0 : _5.map(function (c) {
                                var _a, _b;
                                return ({
                                    message: { content: (_b = (_a = c.message) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : null },
                                    finishReason: c.finishReason
                                });
                            })) || []
                        }];
            }
        });
    });
}
/**
 * Objeto wrapper que simula interface do getMistralClient()
 * Permite usar: const client = await getLLMClient(); client.chat.complete(...)
 */
function getLLMClient() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, {
                    chat: {
                        complete: chatComplete
                    }
                }];
        });
    });
}
/**
 * Gera texto usando o LLM configurado (Groq ou Mistral)
 * Substitui generateWithMistral para usar o provider configurado no admin
 */
function generateWithLLM(systemPrompt, userMessage, options) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_5;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, chatComplete({
                            model: options === null || options === void 0 ? void 0 : options.model,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userMessage }
                            ],
                            maxTokens: (options === null || options === void 0 ? void 0 : options.maxTokens) || 500,
                            temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                        })];
                case 1:
                    response = _b.sent();
                    if (!response || !response.choices || response.choices.length === 0) {
                        throw new Error("No response from LLM");
                    }
                    return [2 /*return*/, response.choices[0].message.content || ""];
                case 2:
                    error_5 = _b.sent();
                    console.error("[LLM] Error generating text:", error_5);
                    throw new Error("Failed to generate text: ".concat(error_5.message));
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Classifica qual mídia deve ser enviada baseado na conversa
 * Usa o LLM configurado (Groq ou Mistral)
 */
function classifyMediaWithLLM(input) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, clientMessage, conversationHistory, mediaLibrary, _a, sentMedias_1, aiResponseText, availableMedia, aiIntendedToSendMedia, clientMsgCount, isFirstMessage, recentHistory, mediaListForAI, systemPrompt, userPrompt, response, elapsedMs, rawResponse, jsonToParse, jsonMatch, incompleteMatch, attempt, openBraces, closeBraces, missingBraces, parsed, confidenceThreshold, result, error_6;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    startTime = Date.now();
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    console.log("\n\uD83E\uDD16 [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83E\uDD16 [MEDIA AI] Iniciando classifica\u00E7\u00E3o de m\u00EDdia com LLM...");
                    clientMessage = input.clientMessage, conversationHistory = input.conversationHistory, mediaLibrary = input.mediaLibrary, _a = input.sentMedias, sentMedias_1 = _a === void 0 ? [] : _a, aiResponseText = input.aiResponseText;
                    availableMedia = mediaLibrary.filter(function (m) {
                        var alreadySent = sentMedias_1.some(function (sent) { return sent.toUpperCase() === m.name.toUpperCase(); });
                        return !alreadySent && m.isActive !== false;
                    });
                    if (availableMedia.length === 0) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u274C Nenhuma m\u00EDdia dispon\u00EDvel");
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' }];
                    }
                    aiIntendedToSendMedia = aiResponseText ? detectMediaSendingIntent(aiResponseText) : false;
                    if (aiIntendedToSendMedia) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \uD83C\uDFAF IA principal EXPRESSOU INTEN\u00C7\u00C3O de enviar m\u00EDdia na resposta!");
                        console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDCAC Resposta IA: \"".concat(aiResponseText.substring(0, 150), "...\""));
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
                    systemPrompt = "Voc\u00EA \u00E9 um sistema de classifica\u00E7\u00E3o de m\u00EDdia para um chatbot de WhatsApp.\nSua tarefa \u00E9 analisar a conversa e decidir SE e QUAL m\u00EDdia deve ser enviada ao cliente.\n\n## REGRAS IMPORTANTES:\n1. Se for PRIMEIRA MENSAGEM do cliente (sauda\u00E7\u00E3o como \"oi\", \"ol\u00E1\", \"bom dia\"), procure por m\u00EDdia de boas-vindas/in\u00EDcio\n2. Apenas recomende m\u00EDdia se for CLARAMENTE RELEVANTE para o contexto\n3. N\u00C3O recomende m\u00EDdia se o cliente estiver fazendo perguntas espec\u00EDficas que n\u00E3o precisam de m\u00EDdia\n4. Leia o campo \"QUANDO USAR\" de cada m\u00EDdia para entender quando \u00E9 apropriado enviar\n5. Se nenhuma m\u00EDdia for claramente apropriada, responda com NO_MEDIA\n6. Confian\u00E7a deve ser entre 0-100 (apenas envie se > 60)\n".concat(aiIntendedToSendMedia ? "\n## \uD83D\uDEA8 CONTEXTO CR\u00CDTICO: A IA PRINCIPAL J\u00C1 DECIDIU ENVIAR M\u00CDDIA!\nA IA que gerou a resposta ao cliente J\u00C1 EXPRESSOU INTEN\u00C7\u00C3O de enviar m\u00EDdia.\nEla disse algo como \"vou te enviar\", \"segue o v\u00EDdeo\", \"aqui est\u00E1 o \u00E1udio\", etc.\nPortanto, voc\u00EA DEVE encontrar a m\u00EDdia mais adequada para enviar.\nN\u00C3O responda NO_MEDIA a menos que NENHUMA m\u00EDdia seja remotamente relevante.\nA confian\u00E7a m\u00EDnima DEVE ser 70+ quando a IA j\u00E1 decidiu enviar.\n" : '', "\n## RESPONDA APENAS EM JSON:\n{\"decision\": \"SEND\" ou \"NO_MEDIA\", \"mediaName\": \"NOME_EXATO_DA_MIDIA\" ou null, \"confidence\": 0-100, \"reason\": \"explica\u00E7\u00E3o breve\"}");
                    userPrompt = "## CONTEXTO:\n\u00C9 a primeira mensagem do cliente? ".concat(isFirstMessage ? 'SIM' : 'NÃO', "\nMensagem atual do cliente: \"").concat(clientMessage, "\"\n").concat(aiResponseText ? "\n## RESPOSTA DA IA PRINCIPAL (que ser\u00E1 enviada ao cliente):\n\"".concat(aiResponseText.substring(0, 500), "\"\n") : '', "\n## HIST\u00D3RICO RECENTE:\n").concat(recentHistory || '(primeira interação)', "\n\n## M\u00CDDIAS DISPON\u00CDVEIS:\n").concat(mediaListForAI, "\n\n## M\u00CDDIAS J\u00C1 ENVIADAS (n\u00E3o repetir):\n").concat(sentMedias_1.join(', ') || 'nenhuma', "\n\nAnalise e decida se alguma m\u00EDdia deve ser enviada. Responda APENAS o JSON.");
                    return [4 /*yield*/, chatComplete({
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userPrompt }
                            ],
                            maxTokens: 150,
                            temperature: 0.1, // Baixa para decisões mais consistentes
                        })];
                case 2:
                    response = _b.sent();
                    elapsedMs = Date.now() - startTime;
                    if (!response || !response.choices || response.choices.length === 0) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u274C Sem resposta da API (".concat(elapsedMs, "ms)"));
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' }];
                    }
                    rawResponse = response.choices[0].message.content;
                    console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDCE5 Resposta bruta (".concat(elapsedMs, "ms): ").concat(rawResponse));
                    jsonToParse = null;
                    jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonToParse = jsonMatch[0];
                    }
                    else {
                        incompleteMatch = rawResponse.match(/\{[\s\S]*/);
                        if (incompleteMatch) {
                            attempt = incompleteMatch[0].trim();
                            // Remover markdown se existir
                            attempt = attempt.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
                            openBraces = (attempt.match(/\{/g) || []).length;
                            closeBraces = (attempt.match(/\}/g) || []).length;
                            missingBraces = openBraces - closeBraces;
                            if (missingBraces > 0) {
                                attempt += '}'.repeat(missingBraces);
                                console.log("\uD83E\uDD16 [MEDIA AI] \uD83D\uDD27 JSON consertado (adicionado ".concat(missingBraces, " chave(s) faltante(s))"));
                            }
                            jsonToParse = attempt;
                        }
                    }
                    if (!jsonToParse) {
                        console.log("\uD83E\uDD16 [MEDIA AI] \u26A0\uFE0F N\u00E3o conseguiu extrair JSON");
                        return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' }];
                    }
                    try {
                        // Limpar markdown code blocks se presentes
                        jsonToParse = jsonToParse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
                        parsed = JSON.parse(jsonToParse);
                        confidenceThreshold = aiIntendedToSendMedia ? 20 : 40;
                        result = {
                            shouldSend: parsed.decision === 'SEND' && parsed.confidence >= confidenceThreshold,
                            mediaName: parsed.mediaName || null,
                            confidence: parsed.confidence || 0,
                            reason: parsed.reason || 'Sem razão especificada'
                        };
                        console.log("\uD83E\uDD16 [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                        if (result.shouldSend) {
                            console.log("\uD83E\uDD16 [MEDIA AI] \u2705 DECIS\u00C3O: ENVIAR \"".concat(result.mediaName, "\""));
                        }
                        else {
                            console.log("\uD83E\uDD16 [MEDIA AI] \u274C DECIS\u00C3O: N\u00C3O ENVIAR (threshold=".concat(confidenceThreshold, "%)"));
                            // 🔧 FIX: Log extra para debug quando confidence está entre 40-60%
                            if (parsed.confidence >= 30 && parsed.confidence < confidenceThreshold) {
                                console.log("\uD83E\uDD16 [MEDIA AI] \u26A0\uFE0F ATEN\u00C7\u00C3O: Confian\u00E7a ".concat(parsed.confidence, "% pr\u00F3xima do threshold"));
                            }
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
                    return [3 /*break*/, 4];
                case 3:
                    error_6 = _b.sent();
                    console.error("\uD83E\uDD16 [MEDIA AI] \u274C ERRO: ".concat(error_6.message));
                    // Em caso de erro, retorna "não enviar" para não quebrar o fluxo
                    return [2 /*return*/, { shouldSend: false, mediaName: null, confidence: 0, reason: "Erro: ".concat(error_6.message) }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 🔍 Detecta se o texto da IA expressa intenção de enviar mídia
 * Usado para saber se o forceMediaDetection deve ser mais agressivo
 *
 * Retorna true se a IA disse algo como "vou te enviar", "segue o vídeo", etc.
 */
function detectMediaSendingIntent(aiResponseText) {
    if (!aiResponseText)
        return false;
    var normalized = aiResponseText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    // Padrões que indicam que a IA quer enviar mídia
    var mediaIntentPatterns = [
        // Frases de envio direto
        /vou\s+te\s+enviar/,
        /vou\s+enviar/,
        /ja\s+te\s+envio/,
        /te\s+envio\s+/,
        /te\s+mando\s+/,
        /vou\s+te\s+mandar/,
        /vou\s+mandar/,
        /enviando\s+(o|a|um|uma|esse|essa|este|esta|pra|para)/,
        /segue\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
        /aqui\s+esta\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
        /confira?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
        /olha?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
        /assista\s+(o|a|esse|essa|este|esta)/,
        /ouca\s+(o|a|esse|essa|este|esta)/,
        /veja\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
        /da\s+uma\s+olhada\s+n(o|a|esse|essa)/,
        /deixa\s+eu\s+te\s+(enviar|mandar|mostrar|passar)/,
        /to\s+te\s+enviando/,
        /estou\s+te\s+enviando/,
        /ja\s+estou\s+enviando/,
        /preparei\s+(um|uma|esse|essa)\s+(video|audio|imagem|documento|material)/,
        /tenho\s+(um|uma)\s+(video|audio|imagem|material)\s+(pra|para)\s+(voce|vc|ti)/,
        // Frases indicando conteúdo multimídia  
        /vai\s+receber\s+(o|a|um|uma)/,
        /pode\s+assistir/,
        /pode\s+ouvir/,
        /pode\s+conferir\s+(o|a|esse|essa|no|na)\s*(video|audio)/,
    ];
    for (var _i = 0, mediaIntentPatterns_1 = mediaIntentPatterns; _i < mediaIntentPatterns_1.length; _i++) {
        var pattern = mediaIntentPatterns_1[_i];
        if (pattern.test(normalized)) {
            return true;
        }
    }
    return false;
}
