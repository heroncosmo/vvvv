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
exports.formatMenuForCustomer = formatMenuForCustomer;
exports.analyzeConversationHistory = analyzeConversationHistory;
exports.generateAIResponse = generateAIResponse;
exports.testAgentResponse = testAgentResponse;
var storage_1 = require("./storage");
var llm_1 = require("./llm");
var supabaseAuth_1 = require("./supabaseAuth");
// NOTA: generateSystemPrompt, detectJailbreak, detectOffTopic foram removidos
// pois o sistema ADVANCED foi desativado para garantir determinismo nas respostas
var crypto_1 = require("crypto");
var agentValidation_1 = require("./agentValidation");
// 🚀 UNIFIED FLOW ENGINE - Sistema híbrido (IA interpreta, Sistema executa)
var flowIntegration_1 = require("./flowIntegration");
// 🛡️ BLINDAGEM UNIVERSAL V3.1 - Sistema de hardening de prompts (inclui pré-blindagem anti-alucinação)
var promptBlindagem_1 = require("./promptBlindagem");
// 🤖 CHATBOT VISUAL - Suporte ao Flow Builder (chatbot de fluxo predefinido)
var chatbotFlowEngine_1 = require("./chatbotFlowEngine");
// ═══════════════════════════════════════════════════════════════════════
// 🤖 SISTEMA ANTI-BOT - DETECTA E IGNORA MENSAGENS DE BOTS
// ═══════════════════════════════════════════════════════════════════════
var BOT_PATTERNS = [
    // Bots educacionais
    /anhanguera/i,
    /unopar/i,
    /unip/i,
    /estácio/i,
    /kroton/i,
    // Bots de serviços
    /serasa/i,
    /spc brasil/i,
    /correios/i,
    /sedex/i,
    // Bots de bancos
    /nubank/i,
    // ⚠️ IMPORTANT: não usar /inter/i pois bate em palavras comuns como "interesse"
    /\binter\b/i,
    /c6 bank/i,
    /banco do brasil/i,
    /caixa econômica/i,
    /bradesco/i,
    /itaú/i,
    /santander/i,
    // Bots de delivery
    /ifood/i,
    /rappi/i,
    /uber eats/i,
    /99 food/i,
    // Bots genéricos
    /não responda este número/i,
    /mensagem automática/i,
    /canal oficial/i,
    /mensagem gerada automaticamente/i,
    /este é um aviso automático/i,
    /this is an automated/i,
    /do not reply/i,
    /não responda/i,
    /nao responda/i,
    /verificação de conta/i,
    /código de verificação/i,
    /seu código é/i,
    /your code is/i,
    /^\d{4,8}$/, // Apenas números (códigos de verificação)
];
// Padrões de mensagens automatizadas
var AUTOMATED_MESSAGE_PATTERNS = [
    /^(olá|oi)[,!]?\s+(sou|eu sou|aqui é)\s+(o|a)?\s*bot/i,
    /atendimento (automático|automatizado)/i,
    /^(sua|seu)\s+(fatura|boleto|conta)/i,
    /vence (hoje|amanhã|em \d+ dias)/i,
    /clique (no link|aqui) para/i,
    /acesse o link/i,
    /pix copia e cola/i,
];
function isMessageFromBot(text, contactName) {
    if (!text)
        return { isBot: false, reason: '' };
    var textLower = text.toLowerCase();
    var nameLower = (contactName || '').toLowerCase();
    // Verificar nome do contato
    for (var _i = 0, BOT_PATTERNS_1 = BOT_PATTERNS; _i < BOT_PATTERNS_1.length; _i++) {
        var pattern = BOT_PATTERNS_1[_i];
        if (pattern.test(nameLower)) {
            return { isBot: true, reason: "Nome do contato match: ".concat(pattern) };
        }
    }
    // Verificar conteúdo da mensagem
    for (var _a = 0, BOT_PATTERNS_2 = BOT_PATTERNS; _a < BOT_PATTERNS_2.length; _a++) {
        var pattern = BOT_PATTERNS_2[_a];
        if (pattern.test(textLower)) {
            return { isBot: true, reason: "Conte\u00FAdo match: ".concat(pattern) };
        }
    }
    // Verificar padrões de mensagem automatizada
    for (var _b = 0, AUTOMATED_MESSAGE_PATTERNS_1 = AUTOMATED_MESSAGE_PATTERNS; _b < AUTOMATED_MESSAGE_PATTERNS_1.length; _b++) {
        var pattern = AUTOMATED_MESSAGE_PATTERNS_1[_b];
        if (pattern.test(textLower)) {
            return { isBot: true, reason: "Mensagem automatizada: ".concat(pattern) };
        }
    }
    return { isBot: false, reason: '' };
}
// ═══════════════════════════════════════════════════════════════════════
// 🔄 DEDUPLICAÇÃO DE RESPOSTAS - EVITA LOOPS
// ═══════════════════════════════════════════════════════════════════════
var responseHashCache = new Map();
function isDuplicateResponse(conversationKey, responseText) {
    var hash = crypto_1.default.createHash('md5').update(responseText.substring(0, 200)).digest('hex');
    var entry = responseHashCache.get(conversationKey);
    if (entry && entry.hash === hash) {
        entry.count++;
        entry.timestamp = Date.now();
        if (entry.count >= 3) {
            console.log("\uD83D\uDD04 [Anti-Loop] Mesma resposta detectada ".concat(entry.count, "x para ").concat(conversationKey));
            return true;
        }
    }
    else {
        responseHashCache.set(conversationKey, { hash: hash, timestamp: Date.now(), count: 1 });
    }
    // Limpar cache antigo (mais de 5 minutos)
    var fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (var _i = 0, _a = responseHashCache.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], val = _b[1];
        if (val.timestamp < fiveMinutesAgo)
            responseHashCache.delete(key);
    }
    return false;
}
var questionResponseCache = new Map();
var CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
var promptSyncCache = new Map();
var PROMPT_SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutos
function getCachedResponse(userId, messageText, promptHash) {
    // Gerar chave de cache: userId + hash da mensagem normalizada
    var normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
    var messageHash = crypto_1.default.createHash('md5').update(normalizedMessage).digest('hex');
    var cacheKey = "".concat(userId, ":").concat(messageHash);
    var cached = questionResponseCache.get(cacheKey);
    if (cached) {
        // Verificar se não expirou
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
            questionResponseCache.delete(cacheKey);
            console.log("\uD83D\uDDD1\uFE0F [Response Cache] Cache expirado para key ".concat(cacheKey.substring(0, 30), "..."));
            return null;
        }
        // Verificar se o prompt mudou (invalidar cache se mudou)
        if (cached.promptHash !== promptHash) {
            questionResponseCache.delete(cacheKey);
            console.log("\uD83D\uDD04 [Response Cache] Prompt mudou, invalidando cache para key ".concat(cacheKey.substring(0, 30), "..."));
            return null;
        }
        console.log("\u2705 [Response Cache] HIT! Retornando resposta cacheada para \"".concat(normalizedMessage.substring(0, 40), "...\""));
        return cached.response;
    }
    return null;
}
function setCachedResponse(userId, messageText, promptHash, response) {
    // Não cachear respostas muito curtas (podem ser erros)
    if (response.length < 20)
        return;
    var normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
    var messageHash = crypto_1.default.createHash('md5').update(normalizedMessage).digest('hex');
    var cacheKey = "".concat(userId, ":").concat(messageHash);
    questionResponseCache.set(cacheKey, {
        response: response,
        timestamp: Date.now(),
        promptHash: promptHash,
    });
    console.log("\uD83D\uDCBE [Response Cache] Resposta salva no cache para \"".concat(normalizedMessage.substring(0, 40), "...\" (").concat(response.length, " chars)"));
    // Limpar cache antigo periodicamente
    if (questionResponseCache.size > 500) {
        var now = Date.now();
        for (var _i = 0, _a = questionResponseCache.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], val = _b[1];
            if (now - val.timestamp > CACHE_TTL_MS) {
                questionResponseCache.delete(key);
            }
        }
        console.log("\uD83E\uDDF9 [Response Cache] Limpeza executada, ".concat(questionResponseCache.size, " entradas restantes"));
    }
}
// ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
// Imports comentados - não usar mais:
// import {
//   humanizeResponse,
//   detectEmotion,
//   adjustToneForEmotion,
//   type HumanizationOptions,
// } from "./humanization";
var mediaService_1 = require("./mediaService");
var textUtils_1 = require("./textUtils");
var schedulingService_1 = require("./schedulingService");
var deliveryService_1 = require("./deliveryService");
var deliveryAIService_1 = require("./deliveryAIService");
var salonAIService_1 = require("./salonAIService");
// PRICE FLOW ENFORCEMENT - R$49 leads devem citar o plano corretamente
function normalizePriceLeadText(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}
function shouldEnforcePriceFlow(messageText, prompt) {
    if (!messageText || !prompt)
        return false;
    var normalized = normalizePriceLeadText(messageText);
    var mentionsPrice = normalized.includes("r$ 49") || normalized.includes("r$49") || normalized.includes("49/mes") || normalized.includes("49 mes");
    if (!mentionsPrice)
        return false;
    // So aplicar quando o prompt claramente e o de vendas da AgenteZAP
    var hasAgenteZap = /AgenteZAP/i.test(prompt);
    var hasPrice = /R\$\s*49/i.test(prompt);
    return hasAgenteZap && hasPrice;
}
function extractIdentityFromPrompt(prompt) {
    var _a, _b;
    if (!prompt)
        return {};
    var normalized = normalizePriceLeadText(prompt);
    var nameMatch = normalized.match(/voce e \*\*([^*]+)\*\*/i) ||
        normalized.match(/voce e ([a-z][a-z\s'-]{1,40})/i);
    var companyMatch = normalized.match(/da \*\*([^*]+)\*\*/i) ||
        normalized.match(/da ([a-z][a-z\s'-]{1,60})/i);
    return {
        agentName: (_a = nameMatch === null || nameMatch === void 0 ? void 0 : nameMatch[1]) === null || _a === void 0 ? void 0 : _a.trim(),
        companyName: (_b = companyMatch === null || companyMatch === void 0 ? void 0 : companyMatch[1]) === null || _b === void 0 ? void 0 : _b.trim(),
    };
}
function buildPriceFlowFallback(contactName, prompt) {
    var _a = extractIdentityFromPrompt(prompt), agentName = _a.agentName, companyName = _a.companyName;
    var safeName = (0, textUtils_1.sanitizeContactName)(contactName);
    var namePart = safeName ? ", ".concat(safeName) : "";
    var agentPart = agentName
        ? "".concat(agentName, " da ").concat(companyName || "AgenteZAP")
        : "Aqui da ".concat(companyName || "AgenteZAP");
    return "Ola".concat(namePart, "! Tudo bem? ").concat(agentPart, " aqui. Que otimo que voce tem interesse no plano ilimitado por R$49/mes! Me conta: qual a maior dor que voce enfrenta hoje no atendimento? Assim eu te mostro como o ").concat(companyName || "AgenteZAP", " resolve isso pra voce.");
}
function getProductsForAI(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, config, configError, menuAllowed, deliveryActive, _b, products, error, items, error_1;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('products_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 1:
                    _a = _e.sent(), config = _a.data, configError = _a.error;
                    if (configError && configError.code !== 'PGRST116') {
                        console.error("\uD83D\uDCE6 [Products] Error fetching config:", configError);
                        return [2 /*return*/, null];
                    }
                    menuAllowed = config ? config.send_to_ai !== false : true;
                    deliveryActive = !!(config === null || config === void 0 ? void 0 : config.is_active);
                    if (!menuAllowed) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('products')
                            .select('name, price, stock, description, category, link, sku, unit')
                            .eq('user_id', userId)
                            .eq('is_active', true)
                            .order('name', { ascending: true })];
                case 2:
                    _b = _e.sent(), products = _b.data, error = _b.error;
                    if (error) {
                        console.error("\uD83D\uDCE6 [Products] Error fetching products:", error);
                        return [2 /*return*/, null];
                    }
                    if (!products || products.length === 0) {
                        return [2 /*return*/, null];
                    }
                    console.log("\uD83D\uDCE6 [Products] Found ".concat(products.length, " active products for user ").concat(userId));
                    items = (products || []).map(function (p) {
                        var _a, _b, _c, _d, _e;
                        return ({
                            name: p.name,
                            price: (_a = p.price) !== null && _a !== void 0 ? _a : null,
                            stock: typeof p.stock === 'number' ? p.stock : (parseInt(String(p.stock || '0'), 10) || 0),
                            description: (_b = p.description) !== null && _b !== void 0 ? _b : null,
                            category: (_c = p.category) !== null && _c !== void 0 ? _c : null,
                            link: (_d = p.link) !== null && _d !== void 0 ? _d : null,
                            sku: (_e = p.sku) !== null && _e !== void 0 ? _e : null,
                            unit: p.unit || 'un',
                        });
                    });
                    return [2 /*return*/, {
                            active: true,
                            instructions: (_c = config === null || config === void 0 ? void 0 : config.instructions) !== null && _c !== void 0 ? _c : null,
                            displayInstructions: (_d = config === null || config === void 0 ? void 0 : config.display_instructions) !== null && _d !== void 0 ? _d : null,
                            products: items,
                            count: items.length,
                        }];
                case 3:
                    error_1 = _e.sent();
                    console.error("\uD83D\uDCE6 [Products] Unexpected error:", error_1);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function generateProductsPromptBlock(productsData) {
    if (!productsData || !productsData.products || productsData.products.length === 0) {
        return '';
    }
    // Formata preço em BRL
    var formatPrice = function (price) {
        if (!price)
            return 'Consultar';
        var num = parseFloat(price);
        if (isNaN(num))
            return price;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    // Agrupa por categoria se houver categorias
    var byCategory = new Map();
    var uncategorized = [];
    for (var _i = 0, _a = productsData.products; _i < _a.length; _i++) {
        var product = _a[_i];
        if (product.category) {
            var list = byCategory.get(product.category) || [];
            list.push(product);
            byCategory.set(product.category, list);
        }
        else {
            uncategorized.push(product);
        }
    }
    var productsList = '';
    // Lista produtos por categoria
    for (var _b = 0, byCategory_1 = byCategory; _b < byCategory_1.length; _b++) {
        var _c = byCategory_1[_b], category = _c[0], products = _c[1];
        productsList += "\n\uD83D\uDCC1 *".concat(category, "*:\n");
        for (var _d = 0, products_1 = products; _d < products_1.length; _d++) {
            var p = products_1[_d];
            productsList += "  \u2022 ".concat(p.name, " - ").concat(formatPrice(p.price));
            if (p.stock > 0)
                productsList += " (".concat(p.stock, " ").concat(p.unit, " em estoque)");
            productsList += '\n';
        }
    }
    // Lista produtos sem categoria
    if (uncategorized.length > 0) {
        if (byCategory.size > 0)
            productsList += '\n📁 *Outros*:\n';
        for (var _e = 0, uncategorized_1 = uncategorized; _e < uncategorized_1.length; _e++) {
            var p = uncategorized_1[_e];
            productsList += "  \u2022 ".concat(p.name, " - ").concat(formatPrice(p.price));
            if (p.stock > 0)
                productsList += " (".concat(p.stock, " ").concat(p.unit, " em estoque)");
            productsList += '\n';
        }
    }
    // Instruções customizadas do usuário (comportamento)
    var customInstructions = productsData.instructions
        ? "\n**INSTRU\u00C7\u00D5ES ESPECIAIS DO ADMINISTRADOR:**\n".concat(productsData.instructions, "\n")
        : '';
    // Instruções de exibição (formato de listagem)
    var displayInstructions = productsData.displayInstructions
        ? "\n**FORMATO DE APRESENTA\u00C7\u00C3O:**\n".concat(productsData.displayInstructions, "\n")
        : '\n**FORMATO DE APRESENTAÇÃO:**\nQuando o cliente pedir a lista, mostre cada produto em uma linha com nome e preço.\n';
    return "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83D\uDCE6 CAT\u00C1LOGO DE PRODUTOS/SERVI\u00C7OS (".concat(productsData.count, " itens)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n").concat(productsList, "\n").concat(customInstructions, "\n").concat(displayInstructions, "\n\n**INSTRU\u00C7\u00D5ES PARA USO DO CAT\u00C1LOGO:**\n1. Use APENAS os produtos listados acima ao responder sobre pre\u00E7os, disponibilidade e detalhes\n2. Se o cliente perguntar algo que n\u00E3o est\u00E1 na lista, diga que n\u00E3o tem essa informa\u00E7\u00E3o\n3. Informe pre\u00E7os exatamente como est\u00E3o listados\n4. Se o estoque estiver zerado ou n\u00E3o informado, diga \"consultar disponibilidade\"\n5. NUNCA invente produtos, pre\u00E7os ou informa\u00E7\u00F5es que n\u00E3o est\u00E3o na lista\n6. Se houver link do produto, pode mencionar que \"pode enviar o link\" se relevante\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
}
function getDeliveryMenuForAI(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, config, configError, menuAllowed, deliveryActive, _b, categories, catError, _c, items, itemsError, categoriesMap, _i, items_1, item, menuItem, categoryName, list, categoryList, error_2;
        var _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    _l.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 1:
                    _a = _l.sent(), config = _a.data, configError = _a.error;
                    if (configError && configError.code !== 'PGRST116') {
                        console.error("\uD83C\uDF55 [Delivery] Error fetching config:", configError);
                        return [2 /*return*/, null];
                    }
                    menuAllowed = config ? config.send_to_ai !== false : true;
                    deliveryActive = !!(config === null || config === void 0 ? void 0 : config.is_active);
                    if (!menuAllowed) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('menu_categories')
                            .select('id, name')
                            .eq('user_id', userId)
                            .eq('is_active', true)
                            .order('display_order', { ascending: true })];
                case 2:
                    _b = _l.sent(), categories = _b.data, catError = _b.error;
                    if (catError) {
                        console.error("\uD83C\uDF55 [Delivery] Error fetching categories:", catError);
                    }
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('menu_items')
                            .select("\n        id, name, description, price, promotional_price, \n        category_id, preparation_time, ingredients, serves, is_featured,\n        menu_categories(name)\n      ")
                            .eq('user_id', userId)
                            .eq('is_available', true)
                            .order('display_order', { ascending: true })];
                case 3:
                    _c = _l.sent(), items = _c.data, itemsError = _c.error;
                    if (itemsError) {
                        console.error("\uD83C\uDF55 [Delivery] Error fetching items:", itemsError);
                        return [2 /*return*/, null];
                    }
                    if (!items || items.length === 0) {
                        return [2 /*return*/, null];
                    }
                    categoriesMap = new Map();
                    for (_i = 0, items_1 = items; _i < items_1.length; _i++) {
                        item = items_1[_i];
                        menuItem = {
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            price: item.price,
                            promotional_price: item.promotional_price,
                            category_name: ((_d = item.menu_categories) === null || _d === void 0 ? void 0 : _d.name) || null,
                            preparation_time: item.preparation_time,
                            ingredients: item.ingredients,
                            serves: item.serves,
                            is_featured: item.is_featured,
                        };
                        categoryName = ((_e = item.menu_categories) === null || _e === void 0 ? void 0 : _e.name) || 'Outros';
                        list = categoriesMap.get(categoryName) || [];
                        list.push(menuItem);
                        categoriesMap.set(categoryName, list);
                    }
                    categoryList = Array.from(categoriesMap.entries()).map(function (_a) {
                        var name = _a[0], items = _a[1];
                        return ({
                            name: name,
                            items: items
                        });
                    });
                    console.log("\uD83C\uDF55 [Delivery] Found ".concat(items.length, " menu items for user ").concat(userId));
                    if (!deliveryActive) {
                        console.log("?? [Delivery] Delivery inativo, enviando card?pio em modo menu-only.");
                    }
                    return [2 /*return*/, {
                            active: menuAllowed && items.length > 0,
                            business_name: (_f = config === null || config === void 0 ? void 0 : config.business_name) !== null && _f !== void 0 ? _f : null,
                            business_type: (_g = config === null || config === void 0 ? void 0 : config.business_type) !== null && _g !== void 0 ? _g : 'outros',
                            delivery_fee: deliveryActive ? (parseFloat(config === null || config === void 0 ? void 0 : config.delivery_fee) || 0) : 0,
                            min_order_value: deliveryActive ? (parseFloat(config === null || config === void 0 ? void 0 : config.min_order_value) || 0) : 0,
                            estimated_delivery_time: deliveryActive ? ((config === null || config === void 0 ? void 0 : config.estimated_delivery_time) || 45) : 45,
                            accepts_delivery: deliveryActive ? ((_h = config === null || config === void 0 ? void 0 : config.accepts_delivery) !== null && _h !== void 0 ? _h : true) : false,
                            accepts_pickup: deliveryActive ? ((_j = config === null || config === void 0 ? void 0 : config.accepts_pickup) !== null && _j !== void 0 ? _j : true) : false,
                            payment_methods: (config === null || config === void 0 ? void 0 : config.payment_methods) || ['Dinheiro', 'Cart?o', 'Pix'],
                            categories: categoryList,
                            total_items: items.length,
                            displayInstructions: (_k = config === null || config === void 0 ? void 0 : config.display_instructions) !== null && _k !== void 0 ? _k : null
                        }];
                case 4:
                    error_2 = _l.sent();
                    console.error("\uD83C\uDF55 [Delivery] Unexpected error:", error_2);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// 🎨 FUNÇÃO AUXILIAR: Formata cardápio bonito para envio ao cliente
function formatMenuForCustomer(deliveryData) {
    if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
        return '';
    }
    var formatPrice = function (price) {
        if (!price)
            return 'Consultar';
        var num = parseFloat(price);
        if (isNaN(num))
            return price;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    var businessTypeEmoji = {
        'pizzaria': '🍕',
        'hamburgueria': '🍔',
        'lanchonete': '🥪',
        'restaurante': '🍽️',
        'acai': '🍨',
        'japonesa': '🍣',
        'outros': '🍴'
    };
    var emoji = businessTypeEmoji[deliveryData.business_type] || '🍴';
    var businessName = deliveryData.business_name || 'Nosso Delivery';
    var menuText = "".concat(emoji, " *").concat(businessName.toUpperCase(), "*\n");
    menuText += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";
    var MAX_SECTION_CHARS = 350; // Limite para evitar seções muito grandes (margem de segurança)
    for (var _i = 0, _a = deliveryData.categories; _i < _a.length; _i++) {
        var category = _a[_i];
        menuText += "\uD83D\uDCC1 *".concat(category.name, "*\n\n");
        var currentSection = '';
        var itemCount = 0;
        for (var _b = 0, _c = category.items; _b < _c.length; _b++) {
            var item = _c[_b];
            var price = item.promotional_price
                ? "~".concat(formatPrice(item.price), "~ *").concat(formatPrice(item.promotional_price), "* \uD83D\uDD25")
                : "*".concat(formatPrice(item.price), "*");
            // Cada produto em uma linha bem formatada
            var itemLine = "".concat(item.is_featured ? '⭐ ' : '▪️ ').concat(item.name);
            var itemText = "".concat(itemLine, "\n");
            if (item.description) {
                itemText += "   _".concat(item.description, "_\n");
            }
            itemText += "   \uD83D\uDCB0 ".concat(price);
            if (item.serves > 1)
                itemText += " \u2022 Serve ".concat(item.serves);
            itemText += '\n\n';
            // Se adicionar este item ultrapassar o limite, fecha a seção atual
            if (currentSection.length + itemText.length > MAX_SECTION_CHARS && currentSection.length > 0) {
                menuText += currentSection;
                menuText += '\n'; // Quebra dupla para separar sub-seções da mesma categoria
                currentSection = itemText;
            }
            else {
                currentSection += itemText;
            }
            itemCount++;
        }
        // Adiciona o restante da seção
        if (currentSection) {
            menuText += currentSection;
        }
        // Quebra dupla entre categorias
        if (deliveryData.categories.indexOf(category) < deliveryData.categories.length - 1) {
            menuText += '\n';
        }
    }
    // Informações de entrega
    var paymentMethods = deliveryData.payment_methods.join(', ');
    menuText += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
    menuText += "\uD83D\uDCCB *INFORMA\u00C7\u00D5ES*\n\n";
    if (deliveryData.accepts_delivery) {
        menuText += "\uD83D\uDEF5 Entrega: ".concat(formatPrice(String(deliveryData.delivery_fee)), "\n");
        menuText += "\u23F1\uFE0F Tempo estimado: ".concat(deliveryData.estimated_delivery_time, " min\n");
    }
    if (deliveryData.accepts_pickup) {
        menuText += "\uD83C\uDFEA Retirada: GR\u00C1TIS\n";
    }
    if (deliveryData.min_order_value > 0) {
        menuText += "\uD83D\uDCE6 Pedido m\u00EDnimo: ".concat(formatPrice(String(deliveryData.min_order_value)), "\n");
    }
    menuText += "\uD83D\uDCB3 Pagamento: ".concat(paymentMethods);
    return menuText;
}
function generateDeliveryPromptBlock(deliveryData) {
    var _a;
    // 🚨 LOG AGRESSIVO - INÍCIO DA FUNÇÃO
    console.log("\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 [generateDeliveryPromptBlock] ENTRADA \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8");
    console.log("\uD83D\uDEA8 [generateDeliveryPromptBlock] business_name: ".concat(deliveryData === null || deliveryData === void 0 ? void 0 : deliveryData.business_name));
    console.log("\uD83D\uDEA8 [generateDeliveryPromptBlock] total_items: ".concat(deliveryData === null || deliveryData === void 0 ? void 0 : deliveryData.total_items));
    console.log("\uD83D\uDEA8 [generateDeliveryPromptBlock] displayInstructions: \"".concat(((_a = deliveryData === null || deliveryData === void 0 ? void 0 : deliveryData.displayInstructions) === null || _a === void 0 ? void 0 : _a.substring(0, 150)) || 'NULL/VAZIO', "...\""));
    if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
        console.log("\uD83D\uDEA8 [generateDeliveryPromptBlock] RETORNANDO VAZIO - sem dados ou categorias");
        return '';
    }
    // Formata preço em BRL
    var formatPrice = function (price) {
        if (!price)
            return 'Consultar';
        var num = parseFloat(price);
        if (isNaN(num))
            return price;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    // Tipos de negócio com emoji
    var businessTypeEmoji = {
        'pizzaria': '🍕',
        'hamburgueria': '🍔',
        'lanchonete': '🥪',
        'restaurante': '🍽️',
        'acai': '🍨',
        'japonesa': '🍣',
        'outros': '🍴'
    };
    var emoji = businessTypeEmoji[deliveryData.business_type] || '🍴';
    var businessName = deliveryData.business_name || 'Nosso Delivery';
    // Monta o cardápio para o prompt da IA (formato compacto)
    var menuText = '';
    for (var _i = 0, _b = deliveryData.categories; _i < _b.length; _i++) {
        var category = _b[_i];
        menuText += "\n\uD83D\uDCC1 *".concat(category.name, "*:\n");
        for (var _c = 0, _d = category.items; _c < _d.length; _c++) {
            var item = _d[_c];
            var price = item.promotional_price
                ? "~".concat(formatPrice(item.price), "~ ").concat(formatPrice(item.promotional_price), " (PROMO!)")
                : formatPrice(item.price);
            menuText += "  ".concat(item.is_featured ? '⭐ ' : '• ').concat(item.name, " - ").concat(price);
            if (item.serves > 1)
                menuText += " (serve ".concat(item.serves, ")");
            menuText += '\n';
            if (item.description) {
                menuText += "    _".concat(item.description, "_\n");
            }
        }
    }
    // Formas de pagamento
    var paymentMethods = deliveryData.payment_methods.join(', ');
    // Montar instrução de apresentação
    var displayInstructionsText = deliveryData.displayInstructions
        ? deliveryData.displayInstructions.trim()
        : '';
    // Se as instruções pedem para perguntar primeiro, não usar tag ENVIAR_CARDAPIO_COMPLETO automaticamente
    var askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
    var shouldAskFirst = askFirstKeywords.some(function (kw) { return displayInstructionsText.toLowerCase().includes(kw); });
    // � LOG SUPER AGRESSIVO - DETECÇÃO DO MODO PERGUNTAR PRIMEIRO
    console.log("\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 [PERGUNTAR PRIMEIRO] VERIFICA\u00C7\u00C3O \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8");
    console.log("\uD83D\uDEA8 displayInstructionsText (".concat(displayInstructionsText.length, " chars): \"").concat(displayInstructionsText.substring(0, 200), "...\""));
    console.log("\uD83D\uDEA8 askFirstKeywords: ".concat(JSON.stringify(askFirstKeywords)));
    console.log("\uD83D\uDEA8 shouldAskFirst = ".concat(shouldAskFirst));
    askFirstKeywords.forEach(function (kw) {
        var found = displayInstructionsText.toLowerCase().includes(kw);
        console.log("\uD83D\uDEA8   - \"".concat(kw, "\": ").concat(found ? '✅ ENCONTRADO' : '❌ não'));
    });
    if (shouldAskFirst) {
        console.log("\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 [PERGUNTAR PRIMEIRO] \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F MODO ATIVO! CARD\u00C1PIO N\u00C3O SER\u00C1 INCLU\u00CDDO! \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\n");
    }
    else {
        console.log("\uD83D\uDEA8 [PERGUNTAR PRIMEIRO] Modo N\u00C3O ativo - card\u00E1pio ser\u00E1 inclu\u00EDdo no prompt\n");
    }
    // Gerar lista de categorias para referência (com emojis)
    var categoryList = deliveryData.categories
        .filter(function (c) { return c.items && c.items.length > 0; })
        .map(function (c) { return "".concat(c.name, " (").concat(c.items.length, " itens)"); })
        .join(', ');
    // Lista de categorias formatada para apresentação ao cliente
    var categoryListFormatted = deliveryData.categories
        .filter(function (c) { return c.items && c.items.length > 0; })
        .map(function (c) { return c.name; })
        .join(', ');
    // 🔥 IMPORTANTE: Se shouldAskFirst=true, NÃO incluir o cardápio detalhado
    // Isso FORÇA a IA a perguntar a categoria porque ela não tem os itens para mostrar
    var menuSection = shouldAskFirst
        ? "\uD83D\uDCC1 **CATEGORIAS DISPON\u00CDVEIS:** ".concat(categoryList, "\n\n\u26A0\uFE0F **CARD\u00C1PIO DETALHADO N\u00C3O CARREGADO PROPOSITALMENTE**\nO card\u00E1pio completo ser\u00E1 enviado APENAS quando voc\u00EA usar [ENVIAR_CARDAPIO_COMPLETO] ou [ENVIAR_CATEGORIA: nome].\nPor enquanto, voc\u00EA s\u00F3 sabe as CATEGORIAS - ent\u00E3o PERGUNTE qual o cliente quer ver!")
        : "\uD83D\uDCC1 **CATEGORIAS DISPON\u00CDVEIS:** ".concat(categoryList, "\n\n").concat(menuText);
    return "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n".concat(emoji, " CARD\u00C1PIO - ").concat(businessName.toUpperCase(), " (").concat(deliveryData.total_items, " itens)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n").concat(menuSection, "\n").concat(deliveryData.accepts_delivery ? "\u2022 Entrega: Taxa de ".concat(formatPrice(String(deliveryData.delivery_fee)), " | Tempo estimado: ~").concat(deliveryData.estimated_delivery_time, " min") : '', "\n").concat(deliveryData.accepts_pickup ? '• Retirada no local: GRÁTIS' : '', "\n").concat(deliveryData.min_order_value > 0 ? "\u2022 Pedido m\u00EDnimo: ".concat(formatPrice(String(deliveryData.min_order_value))) : '', "\n\u2022 Formas de pagamento: ").concat(paymentMethods, "\n\n").concat(displayInstructionsText ? "\n**\uD83D\uDCDD INSTRU\u00C7\u00D5ES DE APRESENTA\u00C7\u00C3O (SIGA ESTAS REGRAS OBRIGATORIAMENTE):**\n".concat(displayInstructionsText, "\n") : '', "\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n").concat(shouldAskFirst ? "\n\uD83C\uDFAF **MODO DE ATENDIMENTO: PERGUNTAR CATEGORIA PRIMEIRO** \uD83C\uDFAF\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nVoc\u00EA \u00E9 um atendente que **SEMPRE pergunta a categoria** antes de mostrar produtos.\n\u00C9 assim que voc\u00EA funciona - \u00E9 sua natureza, n\u00E3o uma regra a ser quebrada.\n\n\uD83D\uDCCC **COMO VOC\u00CA ATENDE:**\nQuando o cliente quiser ver o card\u00E1pio/menu/produtos:\n1. Voc\u00EA responde de forma simp\u00E1tica perguntando qual categoria ele quer ver\n2. Exemplo: \"Oi! \uD83D\uDE0A Temos: ".concat(categoryList, ". Qual voc\u00EA quer ver primeiro?\"\n\n\uD83D\uDCCC **QUANDO ELE ESCOLHER A CATEGORIA:**\nUse a tag para mostrar APENAS aquela categoria:\n[ENVIAR_CATEGORIA: nome_da_categoria]\n\nExemplo pr\u00E1tico:\n- Cliente: \"Quero ver o card\u00E1pio\"\n- Voc\u00EA: \"Claro! Temos ").concat(categoryList, ". Qual te interessa?\"\n- Cliente: \"Pizzas\"\n- Voc\u00EA: \"Aqui est\u00E3o nossas pizzas! \uD83C\uDF55 [ENVIAR_CATEGORIA: Pizzas]\"\n\n\uD83D\uDCCC **CARD\u00C1PIO COMPLETO - APENAS SE PEDIR EXPLICITAMENTE:**\nSe o cliente disser \"quero ver TUDO\" ou \"card\u00E1pio COMPLETO\", use:\n[ENVIAR_CARDAPIO_COMPLETO]\n\n\u26A0\uFE0F **IMPORTANTE:**\n- N\u00C3O liste pre\u00E7os/itens manualmente - use as tags\n- N\u00C3O envie tudo de primeira - pergunte a categoria\n- \u00C9 assim que voc\u00EA atende - com calma, perguntando primeiro\n") : "\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 REGRA ABSOLUTAMENTE CR\u00CDTICA E OBRIGAT\u00D3RIA \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nQUANDO O CLIENTE PERGUNTAR SOBRE CARD\u00C1PIO, MENU OU PRODUTOS:\n- \"Qual o card\u00E1pio?\" / \"O que tem?\" / \"Me manda o menu\" / \"Quais produtos?\" / etc.\n\n\u26A0\uFE0F VOC\u00CA \u00C9 OBRIGADO A RESPONDER COM ESTA TAG NO IN\u00CDCIO:\n[ENVIAR_CARDAPIO_COMPLETO]\n\nEXEMPLO CORRETO (COPIE ESTE FORMATO):\n---\n[ENVIAR_CARDAPIO_COMPLETO]\n\nAqui est\u00E1 nosso card\u00E1pio completo! Me avise se quiser fazer um pedido \uD83D\uDE0A\n---\n\n\u26D4 PROIBIDO: Listar itens/pre\u00E7os manualmente. O sistema inserir\u00E1 o card\u00E1pio completo automaticamente.\n\u26D4 PROIBIDO: Inventar ou resumir o card\u00E1pio. Use APENAS a tag.\n\u26D4 PROIBIDO: Citar bebidas, pizzas ou qualquer item sem usar a tag primeiro.\n\n\u2705 A TAG [ENVIAR_CARDAPIO_COMPLETO] ser\u00E1 substitu\u00EDda pelo card\u00E1pio formatado bonitinho automaticamente.\n", "\n\n**INSTRU\u00C7\u00D5ES PARA ATENDIMENTO DE PEDIDOS:**\n1. Seja SIMP\u00C1TICO e NATURAL como um atendente humano de ").concat(deliveryData.business_type, "\n2. \uD83D\uDD34 **REGRA OBRIGAT\u00D3RIA - PRIMEIRA MENSAGEM:** Se o cliente N\u00C3O se apresentou com nome, voc\u00EA DEVE perguntar \"Qual \u00E9 o seu nome?\" ou \"Como voc\u00EA prefere que eu te chame?\" ANTES de mostrar card\u00E1pio ou falar de produtos. N\u00C3O use \"Visitante\" - pe\u00E7a o nome real!\n3. ").concat(shouldAskFirst ? '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** PERGUNTE qual categoria quer ver primeiro!' : '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** Use a tag [ENVIAR_CARDAPIO_COMPLETO] OBRIGATORIAMENTE', "\n4. Quando o cliente quiser fazer pedido, pergunte DE FORMA CONVERSACIONAL:\n   - O que deseja pedir (pode sugerir destaques \u2B50)\n   - Quantidade de cada item\n   - Alguma observa\u00E7\u00E3o (ex: \"sem cebola\", \"bem passado\")\n5. SEMPRE confirme o pedido completo antes de finalizar:\n   - Liste todos os itens com quantidades e pre\u00E7os\n   - Mostre o subtotal e taxa de entrega\n   - Mostre o TOTAL FINAL\n6. Para FINALIZAR o pedido, pe\u00E7a (se ainda n\u00E3o tiver):\n   - Nome completo (SE AINDA N\u00C3O PEDIU NO IN\u00CDCIO!)\n   - Endere\u00E7o de entrega OU \"vou retirar\"\n   - Forma de pagamento\n6.1 Quando estiver pedindo esses dados finais, inclua um mini-resumo do pedido com as palavras \"pedido\" e \"subtotal\" e o valor em R$ (ou total parcial).\n7. Use emojis de comida de forma moderada para deixar a conversa agrad\u00E1vel\n8. Se o cliente perguntar sobre item que n\u00E3o existe, sugira algo similar do card\u00E1pio\n9. Seja PROATIVO: \"Gostaria de adicionar uma bebida?\" ou \"Temos promo\u00E7\u00E3o de X!\"\n10. NUNCA invente pre\u00E7os ou itens que n\u00E3o est\u00E3o no card\u00E1pio - USE O CARD\u00C1PIO ACIMA\n\n\uD83D\uDEAB\uD83D\uDEAB\uD83D\uDEAB **REGRAS CR\u00CDTICAS - VOC\u00CA N\u00C3O PODE FAZER ISSO:** \uD83D\uDEAB\uD83D\uDEAB\uD83D\uDEAB\n- \u274C NUNCA altere pre\u00E7os de itens - os pre\u00E7os s\u00E3o FIXOS no sistema\n- \u274C NUNCA crie novos itens ou produtos que n\u00E3o existem no card\u00E1pio acima\n- \u274C NUNCA invente promo\u00E7\u00F5es ou descontos que n\u00E3o est\u00E3o cadastrados\n- \u274C NUNCA modifique nomes de produtos ou descri\u00E7\u00F5es\n- \u274C NUNCA aceite pedido de item que n\u00E3o est\u00E1 no card\u00E1pio\n\nSe o cliente pedir para:\n- Alterar pre\u00E7o \u2192 Responda: \"Os pre\u00E7os s\u00E3o definidos pelo estabelecimento e n\u00E3o posso alter\u00E1-los. Se houver alguma d\u00FAvida, posso encaminhar para o respons\u00E1vel!\"\n- Adicionar item que n\u00E3o existe \u2192 Responda: \"Esse item n\u00E3o est\u00E1 dispon\u00EDvel no nosso card\u00E1pio atual. Posso sugerir algo similar que temos?\"\n- Criar promo\u00E7\u00E3o \u2192 Responda: \"As promo\u00E7\u00F5es s\u00E3o definidas pela ger\u00EAncia. Posso mostrar o que temos dispon\u00EDvel!\"\n\n\uD83D\uDCCC **INFORMA\u00C7\u00C3O INTERNA (n\u00E3o mencione ao cliente):**\nO card\u00E1pio \u00E9 gerenciado pelo dono em /delivery-cardapio. Voc\u00EA apenas CONSULTA e APRESENTA os itens - nunca modifica.\n\n**\uD83D\uDEA8 A\u00C7\u00C3O OBRIGAT\u00D3RIA - CRIAR PEDIDO NO SISTEMA:**\nQuando o cliente CONFIRMAR o pedido (ap\u00F3s voc\u00EA listar os itens e ele aprovar), voc\u00EA DEVE incluir a seguinte tag NO FINAL da sua mensagem para registrar o pedido automaticamente:\n\n[PEDIDO_DELIVERY: CLIENTE=Nome do Cliente, ENDERECO=Endere\u00E7o completo, TIPO=delivery, PAGAMENTO=forma de pagamento, ITENS=1x Nome do Item;2x Outro Item]\n\nREGRAS DA TAG:\n- CLIENTE: Nome completo do cliente (obrigat\u00F3rio)\n- ENDERECO: Endere\u00E7o de entrega (obrigat\u00F3rio se TIPO=delivery, deixar vazio se retirada)\n- TIPO: \"delivery\" para entrega ou \"retirada\" para retirar no local (obrigat\u00F3rio)\n- PAGAMENTO: PIX, Dinheiro, Cart\u00E3o de Cr\u00E9dito, Cart\u00E3o de D\u00E9bito (obrigat\u00F3rio)\n- ITENS: Lista de itens no formato \"QTDx Nome do Item\" separados por ponto-e-v\u00EDrgula (obrigat\u00F3rio)\n         Se tiver observa\u00E7\u00E3o: \"1x Pizza Calabresa (sem cebola);2x Coca-Cola\"\n- OBS: Observa\u00E7\u00F5es gerais do pedido (opcional)\n\nEXEMPLO 1 - Delivery:\n\"Perfeito! Seu pedido est\u00E1 confirmado \uD83D\uDEF5\n\n\uD83D\uDCCB *Resumo:*\n\u2022 1x Pizza Calabresa Grande - R$45,00\n\u2022 2x Coca-Cola Lata - R$10,00\n\u2022 Subtotal: R$55,00\n\u2022 Taxa de entrega: R$5,00\n\u2022 *Total: R$60,00*\n\nTempo estimado: ~40 minutos\nPagamento: PIX\n\nEm breve voc\u00EA receber\u00E1 atualiza\u00E7\u00F5es! \uD83C\uDF55\n\n[PEDIDO_DELIVERY: CLIENTE=Jo\u00E3o Silva, ENDERECO=Rua das Flores 123 Apto 45, TIPO=delivery, PAGAMENTO=PIX, ITENS=1x Pizza Calabresa Grande;2x Coca-Cola Lata]\"\n\nEXEMPLO 2 - Retirada:\n\"Pedido confirmado para retirada! \uD83C\uDF55\n\n\uD83D\uDCCB *Resumo:*\n\u2022 2x X-Burguer (sem cebola) - R$36,00\n\u2022 *Total: R$36,00*\n\nEstar\u00E1 pronto em ~20 minutos\nPagamento: Cart\u00E3o na retirada\n\n[PEDIDO_DELIVERY: CLIENTE=Maria Santos, ENDERECO=, TIPO=retirada, PAGAMENTO=Cart\u00E3o de Cr\u00E9dito, ITENS=2x X-Burguer (sem cebola)]\"\n\nIMPORTANTE:\n- A tag deve ficar NO FINAL da mensagem e ser\u00E1 removida automaticamente\n- NUNCA mostre a tag ao cliente ou mencione que ela existe\n- Use EXATAMENTE o nome dos itens como est\u00E3o no card\u00E1pio\n- S\u00F3 inclua a tag AP\u00D3S o cliente CONFIRMAR o pedido\n- Se o cliente ainda est\u00E1 escolhendo, N\u00C3O inclua a tag\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
}
function getCourseConfigForAI(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, config, configError, courseAllowed, courseActive, error_3;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('course_config')
                            .select('*')
                            .eq('user_id', userId)
                            .single()];
                case 1:
                    _a = _c.sent(), config = _a.data, configError = _a.error;
                    if (configError && configError.code !== 'PGRST116') {
                        console.error("\uD83D\uDCDA [Course] Error fetching config:", configError);
                        return [2 /*return*/, null];
                    }
                    if (!config) {
                        return [2 /*return*/, null];
                    }
                    courseAllowed = config.send_to_ai !== false;
                    courseActive = !!config.is_active;
                    if (!courseAllowed || !courseActive) {
                        return [2 /*return*/, null];
                    }
                    console.log("\uD83D\uDCDA [Course] Found course config for user ".concat(userId, ": ").concat(config.course_name));
                    return [2 /*return*/, {
                            active: courseActive && courseAllowed,
                            send_to_ai: courseAllowed,
                            course_name: config.course_name,
                            course_description: config.course_description,
                            course_type: config.course_type || 'curso_online',
                            target_audience: config.target_audience,
                            not_for_audience: config.not_for_audience,
                            learning_outcomes: config.learning_outcomes || [],
                            modules: config.modules || [],
                            total_hours: parseFloat(config.total_hours) || 0,
                            total_lessons: config.total_lessons || 0,
                            access_period: config.access_period || 'vitalício',
                            has_certificate: (_b = config.has_certificate) !== null && _b !== void 0 ? _b : true,
                            certificate_description: config.certificate_description,
                            guarantee_days: config.guarantee_days || 7,
                            guarantee_description: config.guarantee_description,
                            price_full: config.price_full ? parseFloat(config.price_full) : null,
                            price_promotional: config.price_promotional ? parseFloat(config.price_promotional) : null,
                            price_installments: config.price_installments || 12,
                            price_installment_value: config.price_installment_value ? parseFloat(config.price_installment_value) : null,
                            checkout_link: config.checkout_link,
                            payment_methods: config.payment_methods || ['pix', 'cartao_credito', 'boleto'],
                            bonus_items: config.bonus_items || [],
                            support_description: config.support_description,
                            community_info: config.community_info,
                            testimonials: config.testimonials || [],
                            results_description: config.results_description,
                            active_coupons: config.active_coupons || [],
                            ai_instructions: config.ai_instructions,
                            lead_nurture_message: config.lead_nurture_message,
                            enrollment_cta: config.enrollment_cta,
                        }];
                case 2:
                    error_3 = _c.sent();
                    console.error("\uD83D\uDCDA [Course] Unexpected error:", error_3);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function generateCoursePromptBlock(courseData) {
    if (!courseData || !courseData.active) {
        return '';
    }
    var formatPrice = function (price) {
        if (!price)
            return 'Consultar';
        return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    var courseName = courseData.course_name || 'Curso';
    // Formatar módulos
    var modulesText = '';
    if (courseData.modules && courseData.modules.length > 0) {
        modulesText = courseData.modules.map(function (m, i) {
            return "  ".concat(i + 1, ". ").concat(m.name).concat(m.description ? " - ".concat(m.description) : '');
        }).join('\n');
    }
    // Formatar bônus
    var bonusText = '';
    if (courseData.bonus_items && courseData.bonus_items.length > 0) {
        bonusText = courseData.bonus_items.map(function (b) {
            return "  \uD83C\uDF81 ".concat(b.name).concat(b.value ? " (valor: ".concat(formatPrice(b.value), ")") : '');
        }).join('\n');
    }
    // Formatar depoimentos (máx 3)
    var testimonialsText = '';
    if (courseData.testimonials && courseData.testimonials.length > 0) {
        testimonialsText = courseData.testimonials.slice(0, 3).map(function (t) {
            return "  \u2B50 \"".concat(t.text, "\" - ").concat(t.name).concat(t.result ? " (".concat(t.result, ")") : '');
        }).join('\n\n');
    }
    // Formatar cupons
    var couponsText = '';
    if (courseData.active_coupons && courseData.active_coupons.length > 0) {
        couponsText = courseData.active_coupons.map(function (c) {
            return "  \uD83C\uDF9F\uFE0F ".concat(c.code, ": ").concat(c.discount_percent ? c.discount_percent + '% OFF' : formatPrice(c.discount_value || 0) + ' OFF');
        }).join('\n');
    }
    // Preço formatado
    var priceInfo = courseData.price_promotional && courseData.price_promotional < (courseData.price_full || 0)
        ? "~".concat(formatPrice(courseData.price_full), "~ *").concat(formatPrice(courseData.price_promotional), "* \uD83D\uDD25 PROMO\u00C7\u00C3O!")
        : formatPrice(courseData.price_full);
    var installmentInfo = courseData.price_installment_value
        ? "ou ".concat(courseData.price_installments, "x de ").concat(formatPrice(courseData.price_installment_value))
        : courseData.price_full
            ? "ou em at\u00E9 ".concat(courseData.price_installments, "x")
            : '';
    return "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83D\uDCDA INFORMA\u00C7\u00D5ES DO CURSO: ".concat(courseName.toUpperCase(), "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\uD83D\uDCDD *DESCRI\u00C7\u00C3O:*\n").concat(courseData.course_description || 'Curso completo para transformar seu conhecimento.', "\n\n\uD83C\uDFAF *PARA QUEM \u00C9 ESTE CURSO:*\n").concat(courseData.target_audience || 'Pessoas interessadas em aprender e evoluir.', "\n\n").concat(courseData.not_for_audience ? "\u274C *PARA QUEM N\u00C3O \u00C9:*\n".concat(courseData.not_for_audience, "\n") : '', "\n\n\uD83D\uDCD6 *CONTE\u00DADO DO CURSO:*\n").concat(courseData.total_hours > 0 ? "\u2022 ".concat(courseData.total_hours, " horas de conte\u00FAdo") : '', "\n").concat(courseData.total_lessons > 0 ? "\u2022 ".concat(courseData.total_lessons, " aulas") : '', "\n").concat(modulesText ? "\n*M\u00F3dulos:*\n".concat(modulesText) : '', "\n\n\uD83D\uDCB0 *INVESTIMENTO:*\n\u2022 ").concat(priceInfo, "\n").concat(installmentInfo ? "\u2022 ".concat(installmentInfo) : '', "\n\u2022 Formas de pagamento: ").concat(courseData.payment_methods.map(function (p) { return p.replace('_', ' '); }).join(', '), "\n\n\u2705 *GARANTIA: ").concat(courseData.guarantee_days, " dias*\n").concat(courseData.guarantee_description || 'Garantia incondicional de satisfação. Se não gostar, devolvemos seu dinheiro.', "\n\n\uD83D\uDCF1 *ACESSO:*\n\u2022 Per\u00EDodo: ").concat(courseData.access_period || 'Vitalício', "\n").concat(courseData.has_certificate ? "\u2022 \uD83C\uDF93 Inclui Certificado".concat(courseData.certificate_description ? ": ".concat(courseData.certificate_description) : '') : '', "\n\n").concat(bonusText ? "\uD83C\uDF81 *B\u00D4NUS INCLUSOS:*\n".concat(bonusText, "\n") : '', "\n\n").concat(courseData.support_description ? "\uD83D\uDCAC *SUPORTE:*\n".concat(courseData.support_description, "\n") : '', "\n").concat(courseData.community_info ? "\uD83D\uDC65 *COMUNIDADE:*\n".concat(courseData.community_info, "\n") : '', "\n\n").concat(testimonialsText ? "\u2B50 *DEPOIMENTOS DE ALUNOS:*\n".concat(testimonialsText, "\n") : '', "\n\n").concat(courseData.results_description ? "\uD83D\uDCC8 *RESULTADOS:*\n".concat(courseData.results_description, "\n") : '', "\n\n").concat(couponsText ? "\uD83C\uDF9F\uFE0F *CUPONS ATIVOS:*\n".concat(couponsText, "\n") : '', "\n\n").concat(courseData.checkout_link ? "\uD83D\uDD17 *LINK DE INSCRI\u00C7\u00C3O:* ".concat(courseData.checkout_link) : '', "\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83D\uDEA8 INSTRU\u00C7\u00D5ES PARA ATENDIMENTO DE VENDA DE CURSO \uD83D\uDEA8\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n").concat(courseData.ai_instructions || 'Você é um especialista em vendas de infoprodutos. Seja empático, mostre o valor do curso e sempre mencione a garantia.', "\n\n**REGRAS ABSOLUTAMENTE OBRIGAT\u00D3RIAS:**\n\n1. \uD83D\uDD34 **NUNCA INVENTE INFORMA\u00C7\u00D5ES!**\n   - NUNCA invente pre\u00E7os diferentes dos listados acima\n   - NUNCA invente depoimentos ou resultados de alunos\n   - NUNCA invente m\u00F3dulos ou conte\u00FAdo que n\u00E3o exista\n   - Se n\u00E3o souber algo, diga: \"Vou confirmar essa informa\u00E7\u00E3o e te retorno\" ou \"Posso transferir para um atendente humano\"\n\n2. \u2705 **SEMPRE MENCIONE A GARANTIA JUNTO COM O PRE\u00C7O:**\n   Quando falar de pre\u00E7o, SEMPRE lembre: \"E voc\u00EA tem ").concat(courseData.guarantee_days, " dias de garantia. Se n\u00E3o gostar, devolvemos seu dinheiro.\"\n\n3. \uD83C\uDFAF **QUALIFIQUE O LEAD:**\n   - Entenda a situa\u00E7\u00E3o atual do cliente\n   - Identifique a dor/problema\n   - Mostre como o curso resolve\n   - Use perguntas: \"O que te atraiu no curso?\" / \"Qual resultado voc\u00EA busca?\"\n\n4. \uD83D\uDCB0 **TRATE OBJE\u00C7\u00D5ES COM EMPATIA:**\n   - \"Est\u00E1 caro\" \u2192 Mostre o valor + garantia + parcelamento\n   - \"Preciso pensar\" \u2192 \"Claro! Qual ponto te deixou em d\u00FAvida?\" + ").concat(courseData.lead_nurture_message || 'Quando estiver pronto(a), é só me chamar!', "\n   - \"N\u00E3o tenho tempo\" \u2192 Mostre flexibilidade do acesso ").concat(courseData.access_period || 'vitalício', "\n\n5. \uD83D\uDED2 **PARA FECHAR A VENDA:**\n   ").concat(courseData.enrollment_cta || 'Garanta sua vaga com desconto especial!', "\n   ").concat(courseData.checkout_link ? "Link: ".concat(courseData.checkout_link) : 'Posso enviar o link de pagamento para você?', "\n\n6. \uD83D\uDCDE **SE O CLIENTE INSISTIR EM FALAR COM HUMANO:**\n   Respeite e diga: \"Sem problemas! Vou encaminhar para nossa equipe de atendimento.\"\n\n**FLUXO IDEAL DE CONVERSA:**\nIN\u00CDCIO \u2192 QUALIFICA\u00C7\u00C3O \u2192 FAQ/EXPLICA\u00C7\u00C3O \u2192 PRE\u00C7OS \u2192 TRATAMENTO OBJE\u00C7\u00D5ES \u2192 FECHAMENTO\n\n**NUNCA:**\n- Force a venda se o cliente n\u00E3o estiver pronto\n- Minta sobre resultados\n- Ignore obje\u00E7\u00F5es leg\u00EDtimas\n- Seja agressivo ou insistente demais\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
}
// ═══════════════════════════════════════════════════════════════════════
// �🚫 VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
// ═══════════════════════════════════════════════════════════════════════
function checkUserSuspension(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var suspensionStatus, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.storage.isUserSuspended(userId)];
                case 1:
                    suspensionStatus = _b.sent();
                    if (suspensionStatus.suspended) {
                        console.log("\uD83D\uDEAB [AI Agent] Usu\u00E1rio ".concat(userId, " est\u00E1 SUSPENSO - IA desativada (").concat((_a = suspensionStatus.data) === null || _a === void 0 ? void 0 : _a.type, ")"));
                        return [2 /*return*/, true];
                    }
                    return [2 /*return*/, false];
                case 2:
                    error_4 = _b.sent();
                    console.error("\u26A0\uFE0F [AI Agent] Erro ao verificar suspens\u00E3o do usu\u00E1rio ".concat(userId, ":"), error_4);
                    return [2 /*return*/, false]; // Em caso de erro, permitir funcionamento normal
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// 🌅 FUNÇÃO DE SAUDAÇÃO BASEADA NO HORÁRIO DO BRASIL
// ═══════════════════════════════════════════════════════════════════════
function getBrazilGreeting() {
    // Usar fuso horário do Brasil (America/Sao_Paulo = UTC-3)
    var now = new Date();
    var brazilOffset = -3 * 60; // UTC-3 em minutos
    var localOffset = now.getTimezoneOffset();
    var brazilTime = new Date(now.getTime() + (localOffset + brazilOffset) * 60 * 1000);
    var hour = brazilTime.getHours();
    if (hour >= 5 && hour < 12) {
        return { greeting: "Bom dia", period: "manhã" };
    }
    else if (hour >= 12 && hour < 18) {
        return { greeting: "Boa tarde", period: "tarde" };
    }
    else {
        return { greeting: "Boa noite", period: "noite" };
    }
}
function getBrazilDateTime() {
    var now = new Date();
    // Converter para timezone de São Paulo
    var brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var hour = brazilTime.getHours();
    var minute = brazilTime.getMinutes();
    var dayOfWeek = brazilTime.getDay(); // 0=Domingo, 1=Segunda, ... 6=Sábado
    var diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    var diasSemanaAbrev = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    var date = brazilTime.toLocaleDateString('pt-BR');
    var time = "".concat(hour.toString().padStart(2, '0'), ":").concat(minute.toString().padStart(2, '0'));
    var dayName = diasSemana[dayOfWeek];
    var dayNameAbrev = diasSemanaAbrev[dayOfWeek];
    var isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return {
        date: date,
        time: time,
        hour: hour,
        minute: minute,
        dayOfWeek: dayOfWeek,
        dayName: dayName,
        dayNameAbrev: dayNameAbrev,
        isWeekend: isWeekend,
        fullDateTime: "".concat(dayName, ", ").concat(date, " \u00E0s ").concat(time),
    };
}
function analyzeConversationHistory(conversationHistory, contactName) {
    var memory = {
        hasGreeted: false,
        greetingCount: 0,
        hasAskedName: false,
        nameQuestionCount: 0,
        hasExplainedProduct: false,
        hasAskedBusiness: false,
        businessQuestionCount: 0,
        hasSentMedia: [],
        hasPromisedToSend: [],
        hasAnsweredQuestions: [],
        clientQuestions: [],
        clientInfo: { name: contactName },
        lastTopics: [],
        pendingActions: [],
        loopDetected: false,
        loopReason: '',
    };
    if (!conversationHistory || conversationHistory.length === 0) {
        return memory;
    }
    // Padrões de detecção
    var greetingPatterns = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eae|hey|hello|fala|salve)/i;
    var nameQuestionPatterns = /(qual (é |seu |o seu )?nome|como (você |vc |tu )?(se )?chama|posso te chamar de)/i;
    var businessQuestionPatterns = /(qual (é |seu |o seu )?(negócio|ramo|área|empresa|trabalho)|o que (você |vc )?(faz|vende)|que tipo de|qual seu segmento)/i;
    // Promessas explícitas ("Vou te enviar...")
    var promisePatterns = /(vou (te )?(enviar|mandar|mostrar)|deixa eu (enviar|mandar)|te (envio|mando)|já já (envio|mando)|segue (o|a) |vou te enviar|aqui está|veja o)/i;
    // Ofertas/Perguntas ("Posso te enviar?", "Quer ver?", "Topico te mostrar")
    var offerPatterns = /(posso (te )?(enviar|mandar|mostrar)|quer (ver|que eu envie|que eu mostre)|topa (ver|conhecer)|gostaria de (ver|receber)|topico te (mostrar|enviar)|qual opção você prefere)/i;
    // Aceite do cliente ("Sim", "Pode", "Aguardo", "Quero") - MAIS ABRANGENTE
    var acceptancePatterns = /^(sim|pode|claro|com certeza|quero|manda|envia|aguardo|estou aguardando|ok|blz|tá bom|pode ser|beleza|show|perfeito|ótimo|otimo|bora|vamos|fechou|combinado|certo|isso|exato|manda aí|manda ai|por favor|please|yes|yep|yeah)/i;
    var questionPatterns = /\?$/;
    var mediaPatterns = /(vídeo|video|foto|imagem|áudio|audio|documento|pdf|arquivo|demonstração|demo)/i;
    var pricePatterns = /(preço|valor|quanto custa|R\$|\d+,\d{2}|\d+\.\d{2})/i;
    var featurePatterns = /(funcionalidade|recurso|função|como funciona|o que faz|benefício)/i;
    var lastOfferContent = null; // O que foi oferecido por último?
    for (var _i = 0, conversationHistory_1 = conversationHistory; _i < conversationHistory_1.length; _i++) {
        var msg = conversationHistory_1[_i];
        if (!msg.text)
            continue;
        var text = msg.text.toLowerCase();
        // 🛡️ CORREÇÃO CRÍTICA: Só considerar como "nossa mensagem" se foi do AGENTE (IA)
        // Mensagens manuais do dono (fromMe=true, isFromAgent=false) NÃO devem ser analisadas
        // como se fossem do agente, pois podem conter assuntos diferentes (ex: vendendo AgenteZap)
        var isFromAgent = msg.isFromAgent === true;
        var isFromOwner = msg.fromMe === true && msg.isFromAgent === false;
        var isFromClient = msg.fromMe === false;
        // Ignorar mensagens manuais do dono para análise de memória
        if (isFromOwner) {
            continue;
        }
        if (isFromAgent) {
            // Análise das mensagens DO AGENTE (IA)
            if (greetingPatterns.test(text)) {
                memory.hasGreeted = true;
                memory.greetingCount++;
            }
            if (nameQuestionPatterns.test(text)) {
                memory.hasAskedName = true;
                memory.nameQuestionCount++;
            }
            if (businessQuestionPatterns.test(text)) {
                memory.hasAskedBusiness = true;
                memory.businessQuestionCount++;
            }
            if (pricePatterns.test(text)) {
                memory.hasExplainedProduct = true;
                memory.hasAnsweredQuestions.push("preço/valor");
            }
            if (featurePatterns.test(text)) {
                memory.hasExplainedProduct = true;
                memory.hasAnsweredQuestions.push("funcionalidades");
            }
            // Detectar promessas de envio
            if (promisePatterns.test(text)) {
                var mediaMatch = text.match(mediaPatterns);
                if (mediaMatch) {
                    memory.hasPromisedToSend.push(mediaMatch[0]);
                }
            }
            // Detectar OFERTAS de envio (possível pendência se cliente aceitar)
            if (offerPatterns.test(text)) {
                var mediaMatch = text.match(mediaPatterns);
                if (mediaMatch) {
                    lastOfferContent = mediaMatch[0]; // Guardar o que foi oferecido (ex: "vídeo")
                }
                else if (text.includes("como funciona") || text.includes("demonstra")) {
                    lastOfferContent = "explicação/vídeo";
                }
            }
            else {
                // Se falamos outra coisa que não é oferta, limpamos a oferta pendente?
                // Não necessariamente, o cliente pode responder a oferta depois.
                // Mas vamos manter simples: só a última oferta conta.
            }
            // Detectar mídias enviadas
            if (text.includes("[vídeo") || text.includes("[video") ||
                text.includes("enviando vídeo") || text.includes("veja o vídeo") || text.includes("segue o vídeo")) {
                memory.hasSentMedia.push("vídeo");
                // Se enviamos, removemos da lista de promessas e ofertas
                lastOfferContent = null;
            }
            if (text.includes("[imagem") || text.includes("[foto") ||
                text.includes("enviando imagem") || text.includes("veja a imagem")) {
                memory.hasSentMedia.push("imagem");
                lastOfferContent = null;
            }
            if (text.includes("[áudio") || text.includes("[audio")) {
                memory.hasSentMedia.push("áudio");
            }
        }
        else if (isFromClient) {
            // Análise das mensagens do cliente
            // 🚨 CRÍTICO: Se cliente aceitou oferta ou disse "aguardo"
            if (lastOfferContent && acceptancePatterns.test(text)) {
                memory.pendingActions.push("CLIENTE ACEITOU SUA OFERTA! Envie agora: ".concat(lastOfferContent));
                memory.hasPromisedToSend.push(lastOfferContent); // Tratar como promessa agora
                lastOfferContent = null; // Oferta aceita e processada
            }
            // Se cliente disse "aguardo" ou similar, SEMPRE adicionar ação pendente
            if (text.match(/aguardo|esperando|fico no aguardo|estou esperando|esperarei|pode mandar|pode enviar|manda aí|manda ai/i)) {
                // Procurar no histórico o que foi prometido (APENAS do agente, não do dono)
                var lastAgentMessages = conversationHistory.filter(function (m) { return m.isFromAgent === true; }).slice(-5);
                var promisedItem = "o que foi prometido";
                for (var _a = 0, lastAgentMessages_1 = lastAgentMessages; _a < lastAgentMessages_1.length; _a++) {
                    var msg_1 = lastAgentMessages_1[_a];
                    if (msg_1.text && msg_1.text.match(/vídeo|video|áudio|audio|imagem|foto|explicar|mostrar|demonstr/i)) {
                        var match = msg_1.text.match(/(vídeo|video|áudio|audio|imagem|foto)/i);
                        if (match)
                            promisedItem = match[0];
                        break;
                    }
                }
                memory.pendingActions.push("CLIENTE DISSE \"".concat(text.substring(0, 20), "\"! ENVIE AGORA: ").concat(promisedItem, ". N\u00C3O PERGUNTE NADA, APENAS ENVIE!"));
            }
            if (questionPatterns.test(text)) {
                // Extrair o assunto da pergunta
                if (pricePatterns.test(text)) {
                    memory.clientQuestions.push("preço");
                }
                if (featurePatterns.test(text)) {
                    memory.clientQuestions.push("funcionalidades");
                }
                if (text.includes("como")) {
                    memory.clientQuestions.push("como funciona");
                }
            }
            // Detectar informações do cliente
            if (text.match(/trabalho com|tenho (uma |um )?(loja|empresa|negócio)|meu (negócio|ramo)/i)) {
                memory.clientInfo.business = text;
            }
            // Detectar interesses
            if (text.match(/me interessa|quero saber|gostaria de|preciso de/i)) {
                memory.clientInfo.interests = memory.clientInfo.interests || [];
                memory.clientInfo.interests.push(text.substring(0, 50));
            }
            // Detectar objeções
            if (text.match(/caro|não sei|vou pensar|depois|agora não|muito|difícil/i)) {
                memory.clientInfo.objections = memory.clientInfo.objections || [];
                memory.clientInfo.objections.push(text.substring(0, 50));
            }
        }
    }
    // Verificar promessas não cumpridas
    for (var _b = 0, _c = memory.hasPromisedToSend; _b < _c.length; _b++) {
        var promised = _c[_b];
        if (!memory.hasSentMedia.includes(promised)) {
            memory.pendingActions.push("Enviar ".concat(promised, " que foi prometido"));
        }
    }
    // Extrair últimos tópicos (das últimas 5 mensagens)
    var recentMessages = conversationHistory.slice(-5);
    for (var _d = 0, recentMessages_1 = recentMessages; _d < recentMessages_1.length; _d++) {
        var msg = recentMessages_1[_d];
        if (msg.text) {
            if (pricePatterns.test(msg.text))
                memory.lastTopics.push("preço");
            if (featurePatterns.test(msg.text))
                memory.lastTopics.push("funcionalidades");
            if (mediaPatterns.test(msg.text))
                memory.lastTopics.push("mídia/demonstração");
        }
    }
    // 🚨 DETECÇÃO DE LOOPS - Padrões repetitivos que indicam problema
    if (memory.greetingCount >= 2) {
        memory.loopDetected = true;
        memory.loopReason = "Sauda\u00E7\u00E3o repetida ".concat(memory.greetingCount, "x");
    }
    if (memory.nameQuestionCount >= 2) {
        memory.loopDetected = true;
        memory.loopReason = "Pergunta de nome repetida ".concat(memory.nameQuestionCount, "x");
    }
    if (memory.businessQuestionCount >= 2) {
        memory.loopDetected = true;
        memory.loopReason = "Pergunta de neg\u00F3cio repetida ".concat(memory.businessQuestionCount, "x");
    }
    // Detectar mensagens idênticas do agente
    var agentMessages = conversationHistory.filter(function (m) { return m.fromMe; }).map(function (m) { var _a; return ((_a = m.text) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) || ''; });
    var messageFrequency = new Map();
    for (var _e = 0, agentMessages_1 = agentMessages; _e < agentMessages_1.length; _e++) {
        var msg = agentMessages_1[_e];
        if (msg.length > 20) { // Ignorar msgs muito curtas
            var count = (messageFrequency.get(msg) || 0) + 1;
            messageFrequency.set(msg, count);
            if (count >= 3) {
                memory.loopDetected = true;
                memory.loopReason = "Mensagem repetida ".concat(count, "x: \"").concat(msg.substring(0, 30), "...\"");
            }
        }
    }
    return memory;
}
function generateMemoryContextBlock(memory, contactName) {
    var sections = [];
    // Nome do cliente - SEMPRE usar se disponível (sanitizado)
    var clientName = (0, textUtils_1.sanitizeContactName)(contactName) || null;
    sections.push("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83E\uDDE0 MEM\u00D3RIA DA CONVERSA (NUNCA ESQUE\u00C7A - ANTI-AMN\u00C9SIA)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    // 🚨 ALERTA DE LOOP DETECTADO - PRIORIDADE MÁXIMA
    if (memory.loopDetected) {
        sections.push("\n\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 ALERTA CR\u00CDTICO: LOOP DETECTADO! \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nPROBLEMA: ".concat(memory.loopReason, "\n\nVOC\u00CA EST\u00C1 REPETINDO AS MESMAS COISAS!\nISSO FAZ VOC\u00CA PARECER UM ROB\u00D4 BURRO E AFASTA CLIENTES!\n\nINSTRU\u00C7\u00D5ES OBRIGAT\u00D3RIAS:\n1. N\u00C3O cumprimente de novo (voc\u00EA j\u00E1 cumprimentou ").concat(memory.greetingCount, "x!)\n2. N\u00C3O pergunte o nome de novo (voc\u00EA j\u00E1 perguntou ").concat(memory.nameQuestionCount, "x!)\n3. N\u00C3O pergunte sobre neg\u00F3cio de novo (voc\u00EA j\u00E1 perguntou ").concat(memory.businessQuestionCount, "x!)\n4. AVANCE a conversa - pergunte algo NOVO ou ofere\u00E7a algo NOVO\n5. Se n\u00E3o sabe o que fazer, pergunte: \"Tem mais alguma d\u00FAvida?\"\n\nSE CONTINUAR REPETINDO = CLIENTE PERDIDO!\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550"));
    }
    // 1. Nome do cliente - TÉCNICA DE VENDAS: Usar o nome gera rapport
    if (clientName) {
        sections.push("\n\uD83D\uDC64 NOME DO CLIENTE: ".concat(clientName, "\n   \u2192 Use o nome ").concat(clientName, " naturalmente na conversa (t\u00E9cnica de rapport)\n   \u2192 Exemplo: \"Entendi, ").concat(clientName, "...\" ou \"").concat(clientName, ", vou te explicar...\"\n   \u2192 N\u00C3O chame de \"cara\", \"v\u00E9i\", \"mano\" - seja profissional mas acolhedor"));
    }
    else {
        sections.push("\n\uD83D\uDC64 NOME DO CLIENTE: N\u00E3o identificado\n   \u2192 Trate como \"voc\u00EA\" de forma respeitosa\n   \u2192 Se apropriado, pergunte o nome UMA VEZ para personalizar o atendimento");
    }
    // 2. Status da conversa
    if (memory.hasGreeted) {
        sections.push("\n\uD83D\uDEAB CUMPRIMENTO: J\u00C1 FOI FEITO!\n   \u2192 N\u00C3O cumprimente novamente (sem \"Oi\", \"Ol\u00E1\", \"Bom dia\")\n   \u2192 N\u00C3O se apresente de novo\n   \u2192 V\u00E1 DIRETO ao assunto - continue a conversa naturalmente");
    }
    // 3. Informações já coletadas
    if (memory.hasAskedName) {
        sections.push("\n\u2705 J\u00C1 PERGUNTOU O NOME: N\u00E3o pergunte novamente");
    }
    if (memory.hasAskedBusiness) {
        sections.push("\n\u2705 J\u00C1 PERGUNTOU SOBRE O NEG\u00D3CIO: N\u00E3o pergunte novamente");
    }
    if (memory.hasExplainedProduct) {
        sections.push("\n\u2705 J\u00C1 EXPLICOU PRODUTO/SERVI\u00C7O: N\u00E3o repita explica\u00E7\u00F5es b\u00E1sicas");
    }
    // 4. Perguntas já respondidas
    if (memory.hasAnsweredQuestions.length > 0) {
        sections.push("\n\uD83D\uDCDD PERGUNTAS J\u00C1 RESPONDIDAS (n\u00E3o repita):\n   \u2192 ".concat(__spreadArray([], new Set(memory.hasAnsweredQuestions), true).join(", ")));
    }
    // 5. Mídias enviadas
    if (memory.hasSentMedia.length > 0) {
        sections.push("\n\uD83D\uDCC1 M\u00CDDIAS J\u00C1 ENVIADAS (n\u00E3o repita):\n   \u2192 ".concat(__spreadArray([], new Set(memory.hasSentMedia), true).join(", ")));
    }
    // 6. AÇÕES PENDENTES - CRÍTICO!
    if (memory.pendingActions.length > 0) {
        sections.push("\n\uD83D\uDEA8 URGENTE: A\u00C7\u00C3O PENDENTE DETECTADA (PRIORIDADE M\u00C1XIMA) \uD83D\uDEA8\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nO cliente est\u00E1 AGUARDANDO uma a\u00E7\u00E3o que voc\u00EA prometeu ou uma resposta espec\u00EDfica.\nIGNORE sauda\u00E7\u00F5es. IGNORE apresenta\u00E7\u00F5es. N\u00C3O pergunte \"como posso ajudar\".\nVOC\u00CA J\u00C1 SABE O QUE FAZER. EXECUTE A A\u00C7\u00C3O ABAIXO IMEDIATAMENTE:\n\n   \u2192 ".concat(memory.pendingActions.join("\n   → "), "\n\n\u26A0\uFE0F REGRA DE OURO: Se a a\u00E7\u00E3o \u00E9 mandar um v\u00EDdeo/\u00E1udio, MANDE AGORA. N\u00E3o fale que vai mandar, MANDE."));
    }
    // 7. Contexto do cliente
    if (memory.clientInfo.business) {
        sections.push("\n\uD83C\uDFE2 NEG\u00D3CIO DO CLIENTE: ".concat(memory.clientInfo.business.substring(0, 100), "\n   \u2192 Personalize suas respostas para este segmento"));
    }
    if (memory.clientInfo.interests && memory.clientInfo.interests.length > 0) {
        sections.push("\n\uD83D\uDCA1 INTERESSES DO CLIENTE:\n   \u2192 ".concat(memory.clientInfo.interests.slice(0, 3).join("\n   → ")));
    }
    if (memory.clientInfo.objections && memory.clientInfo.objections.length > 0) {
        sections.push("\n\uD83E\uDD14 OBJE\u00C7\u00D5ES/PREOCUPA\u00C7\u00D5ES DO CLIENTE:\n   \u2192 ".concat(memory.clientInfo.objections.slice(0, 3).join("\n   → "), "\n   \u2192 Trabalhe essas obje\u00E7\u00F5es com empatia"));
    }
    // 8. Últimos tópicos
    if (memory.lastTopics.length > 0) {
        sections.push("\n\uD83D\uDCCC \u00DALTIMOS ASSUNTOS DISCUTIDOS:\n   \u2192 ".concat(__spreadArray([], new Set(memory.lastTopics), true).join(", "), "\n   \u2192 Continue nesses t\u00F3picos ou avance naturalmente"));
    }
    sections.push("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83C\uDFAF REGRAS UNIVERSAIS DE VENDAS (T\u00C9CNICAS PROFISSIONAIS)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n1. PERSONALIZA\u00C7\u00C3O (Rapport):\n   \u2192 Use o nome do cliente naturalmente (gera confian\u00E7a)\n   \u2192 Referencie informa\u00E7\u00F5es que ele j\u00E1 compartilhou\n   \u2192 Mostre que voc\u00EA LEMBRA da conversa anterior\n\n2. CONSIST\u00CANCIA:\n   \u2192 Se prometeu algo, CUMPRA\n   \u2192 Se explicou algo, n\u00E3o repita do zero\n   \u2192 Se fez uma pergunta, ESPERE a resposta antes de perguntar outra\n\n3. ESCUTA ATIVA:\n   \u2192 Responda EXATAMENTE o que foi perguntado\n   \u2192 N\u00E3o mude de assunto sem motivo\n   \u2192 Reconhe\u00E7a obje\u00E7\u00F5es antes de contorn\u00E1-las\n\n4. PROGRESS\u00C3O:\n   \u2192 Cada mensagem deve AVAN\u00C7AR a conversa\n   \u2192 N\u00E3o fique em loops repetindo as mesmas informa\u00E7\u00F5es\n   \u2192 Tenha um objetivo claro (demo, venda, agendamento)\n\n5. HUMANIZA\u00C7\u00C3O (sem g\u00EDrias excessivas):\n   \u2192 Seja profissional mas acolhedor\n   \u2192 Use emojis com modera\u00E7\u00E3o (1-2 por mensagem)\n   \u2192 Frases curtas e diretas (m\u00E1x 4-5 linhas por mensagem) - EXCETO quando:\n      \u2022 O cliente pedir lista/card\u00E1pio/categorias/produtos COMPLETOS\n      \u2022 O prompt instrui enviar lista INTEIRA/COMPLETA\n      \u2022 Nestes casos: ENVIE A LISTA TODA, SEM CORTAR NADA\n   \u2192 N\u00C3O use: \"cara\", \"v\u00E9i\", \"mano\", \"brother\" - use o NOME do cliente\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    return sections.join("\n");
}
// ═══════════════════════════════════════════════════════════════════════
// 🧠 FUNÇÃO PARA GERAR BLOCO DE CONTEXTO DINÂMICO (NOME, HORÁRIO, ETC)
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: Passar APENAS informações para a IA decidir como usar.
// A IA lê o prompt do cliente e decide: se tem {{nome}}, substitui.
// Se tem gíria no prompt, usa gíria. Se tem formalidade, usa formalidade.
// NÃO IMPOR REGRAS - apenas INFORMAR contexto.
// ═══════════════════════════════════════════════════════════════════════
function generateDynamicContextBlock(contactName, sentMedias, conversationHistory) {
    // � FIX v4: ADICIONADO data/hora do Brasil novamente!
    // Clientes como JB Elétrica precisam saber o horário para verificar
    // se está dentro ou fora do horário de atendimento.
    // A informação é contextual (não afeta determinismo da resposta).
    var brazilTime = getBrazilDateTime();
    var formattedName = (0, textUtils_1.sanitizeContactName)(contactName);
    var sentMediasList = sentMedias && sentMedias.length > 0
        ? sentMedias.join(", ")
        : "nenhuma ainda";
    // 🔄 DETECTAR SE JÁ HOUVE CONVERSA HOJE
    // Se já temos histórico de conversa hoje, a IA NÃO deve cumprimentar novamente
    var alreadyTalkedToday = false;
    var hasFollowUpMessage = false;
    if (conversationHistory && conversationHistory.length > 0) {
        var today_1 = new Date().toDateString();
        alreadyTalkedToday = conversationHistory.some(function (msg) {
            if (!msg.timestamp)
                return false;
            var msgDate = new Date(msg.timestamp).toDateString();
            return msgDate === today_1 && msg.fromMe === true; // Nós já enviamos msg hoje
        });
        // Detectar se última msg nossa foi follow-up (mensagem de reengajamento)
        var lastOurMessage_1 = conversationHistory.filter(function (m) { return m.fromMe; }).slice(-1)[0];
        if (lastOurMessage_1 === null || lastOurMessage_1 === void 0 ? void 0 : lastOurMessage_1.text) {
            var followUpPatterns = [
                'lembrei de você',
                'passando pra ver',
                'conseguiu pensar',
                'ficou alguma dúvida',
                'como combinamos',
                'retomando'
            ];
            hasFollowUpMessage = followUpPatterns.some(function (p) { var _a; return (_a = lastOurMessage_1.text) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(p); });
        }
    }
    // CONTEXTO COM DATA/HORA DO BRASIL - IA interpreta conforme prompt do cliente
    var contextBlock = "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83D\uDCCB INFORMA\u00C7\u00D5ES DO CONTEXTO ATUAL\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\uD83D\uDD50 DATA E HORA ATUAL (BRASIL - Hor\u00E1rio de Bras\u00EDlia):\n   \u2022 Data: ".concat(brazilTime.date, "\n   \u2022 Hora: ").concat(brazilTime.time, "\n   \u2022 Dia da semana: ").concat(brazilTime.dayName, "\n   ").concat(brazilTime.isWeekend ? '⚠️ HOJE É FIM DE SEMANA (Sábado/Domingo)' : '', "\n\n\uD83D\uDC64 Nome do cliente: ").concat(formattedName || "(não identificado - use 'você' se precisar)", "\n\uD83D\uDCC1 M\u00EDdias j\u00E1 enviadas nesta conversa: ").concat(sentMediasList, "\n\nINSTRU\u00C7\u00D5ES IMPORTANTES:\n- USE A DATA/HORA ACIMA para verificar hor\u00E1rios de funcionamento mencionados no prompt\n- Se o prompt menciona hor\u00E1rio de atendimento, VERIFIQUE se est\u00E1 dentro ou fora\n- Se seu prompt usa vari\u00E1veis como {{nome}}, {nome}, [nome], [cliente] etc \u2192 substitua por \"").concat(formattedName || 'você', "\"\n- N\u00E3o repita m\u00EDdias que j\u00E1 foram enviadas\n- SIGA O ESTILO DO SEU PROMPT (g\u00EDrias, formalidade, etc)");
    // 🚨 INSTRUÇÕES CRÍTICAS SOBRE CUMPRIMENTOS
    if (alreadyTalkedToday) {
        contextBlock += "\n\n\u26A0\uFE0F ATEN\u00C7\u00C3O - CONTINUA\u00C7\u00C3O DE CONVERSA:\n- J\u00C1 CONVERSAMOS COM ESTE CLIENTE HOJE!\n- N\u00C3O cumprimente novamente (sem \"Bom dia\", \"Oi\", \"Ol\u00E1\", \"Boa tarde\")\n- N\u00C3O se apresente de novo (sem \"Sou X da empresa Y\")\n- CONTINUE a conversa naturalmente de onde parou\n- Responda diretamente ao que o cliente perguntou/disse";
    }
    if (hasFollowUpMessage) {
        contextBlock += "\n\n\uD83D\uDD04 RETOMADA AP\u00D3S FOLLOW-UP:\n- A \u00FAltima mensagem foi um follow-up de reengajamento\n- O cliente est\u00E1 VOLTANDO a conversar - seja receptivo!\n- N\u00C3O repita o que j\u00E1 foi dito no follow-up\n- Avance a conversa para o pr\u00F3ximo passo";
    }
    contextBlock += "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
    return contextBlock;
}
// ═══════════════════════════════════════════════════════════════════════
// 🔄 FUNÇÃO PARA LIMPAR PLACEHOLDERS QUE A IA NÃO SUBSTITUIU
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: A IA deve substituir as variáveis. Esta função é apenas
// uma rede de segurança para limpar qualquer {{nome}} ou {nome} que
// escapou. NÃO força saudações - respeita 100% o estilo do prompt.
// ═══════════════════════════════════════════════════════════════════════
// 🔄 FUNÇÃO DE RETRY AUTOMÁTICO PARA CHAMADAS DE API
// Implementa exponential backoff para lidar com rate limits e erros temporários
function withRetry(operation_1) {
    return __awaiter(this, arguments, void 0, function (operation, maxRetries, initialDelayMs, operationName) {
        var lastError, _loop_1, attempt, state_1;
        var _a, _b, _c, _d;
        if (maxRetries === void 0) { maxRetries = 3; }
        if (initialDelayMs === void 0) { initialDelayMs = 1000; }
        if (operationName === void 0) { operationName = "API call"; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    lastError = null;
                    _loop_1 = function (attempt) {
                        var result, error_5, isRateLimitError, isRetryable, delay_1;
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0:
                                    _f.trys.push([0, 2, , 4]);
                                    // Log de início de cada tentativa
                                    console.log("\uD83D\uDD04 [AI RETRY] ".concat(operationName, " - Tentativa ").concat(attempt, "/").concat(maxRetries, "..."));
                                    return [4 /*yield*/, operation()];
                                case 1:
                                    result = _f.sent();
                                    // Log de sucesso
                                    if (attempt > 1) {
                                        console.log("\u2705 [AI RETRY] ".concat(operationName, " - SUCESSO na tentativa ").concat(attempt, "/").concat(maxRetries, "!"));
                                    }
                                    return [2 /*return*/, { value: result }];
                                case 2:
                                    error_5 = _f.sent();
                                    lastError = error_5;
                                    isRateLimitError = (error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) === 429 ||
                                        ((_a = error_5 === null || error_5 === void 0 ? void 0 : error_5.message) === null || _a === void 0 ? void 0 : _a.includes('rate limit')) ||
                                        ((_b = error_5 === null || error_5 === void 0 ? void 0 : error_5.message) === null || _b === void 0 ? void 0 : _b.includes('aguardando fila'));
                                    if (isRateLimitError) {
                                        console.log("\u26A1 [AI RETRY] Rate limit detectado - N\u00C3O retentando (llm.ts j\u00E1 fez rota\u00E7\u00E3o de modelos)");
                                        throw error_5;
                                    }
                                    isRetryable = (error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) === 500 || // Server error
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) === 502 || // Bad gateway
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) === 503 || // Service unavailable
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) === 504 || // Gateway timeout
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.code) === 'ECONNRESET' ||
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.code) === 'ETIMEDOUT' ||
                                        (error_5 === null || error_5 === void 0 ? void 0 : error_5.code) === 'ENOTFOUND' ||
                                        ((_c = error_5 === null || error_5 === void 0 ? void 0 : error_5.message) === null || _c === void 0 ? void 0 : _c.includes('timeout')) ||
                                        ((_d = error_5 === null || error_5 === void 0 ? void 0 : error_5.message) === null || _d === void 0 ? void 0 : _d.includes('connection'));
                                    if (!isRetryable || attempt === maxRetries) {
                                        console.error("\u274C [AI RETRY] ".concat(operationName, " - ESGOTOU ").concat(maxRetries, " tentativas!"));
                                        console.error("   \u2514\u2500 Erro final: ".concat((error_5 === null || error_5 === void 0 ? void 0 : error_5.message) || error_5));
                                        console.error("   \u2514\u2500 Status: ".concat((error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) || 'N/A'));
                                        console.error("   \u2514\u2500 Retryable: ".concat(isRetryable ? 'SIM' : 'NÃO'));
                                        throw error_5;
                                    }
                                    delay_1 = initialDelayMs * Math.pow(2, attempt - 1);
                                    console.log("\u26A0\uFE0F [AI RETRY] ".concat(operationName, " - FALHOU tentativa ").concat(attempt, "/").concat(maxRetries));
                                    console.log("   \u2514\u2500 Erro: ".concat((error_5 === null || error_5 === void 0 ? void 0 : error_5.message) || 'Unknown'));
                                    console.log("   \u2514\u2500 Status: ".concat((error_5 === null || error_5 === void 0 ? void 0 : error_5.statusCode) || 'N/A'));
                                    console.log("   \u2514\u2500 Pr\u00F3xima tentativa em: ".concat(delay_1, "ms"));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                case 3:
                                    _f.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _e.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _e.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _e.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: throw lastError || new Error("".concat(operationName, " falhou ap\u00F3s ").concat(maxRetries, " tentativas"));
            }
        });
    });
}
// 🔔 FUNÇÃO PARA GERAR PROMPT DE NOTIFICAÇÃO DINÂMICO E UNIVERSAL
// Suporta detecção em mensagens do cliente E respostas do agente
function getNotificationPrompt(trigger, manualKeywords) {
    // Proteção contra trigger undefined ou null
    if (!trigger) {
        console.warn('⚠️ [getNotificationPrompt] trigger está undefined/null - retornando string vazia');
        return '';
    }
    var triggerLower = trigger.toLowerCase();
    // Combinar palavras-chave predefinidas + manuais
    var keywords = [];
    var actionDesc = "";
    // Palavras-chave baseadas no tipo de gatilho
    if (triggerLower.includes("agendar") || triggerLower.includes("horário") || triggerLower.includes("marcar")) {
        keywords.push("agendar", "agenda", "marcar", "marca", "reservar", "reserva", "tem vaga", "tem horário", "horário disponível", "me encaixa", "encaixe");
        actionDesc = "agendamento";
    }
    if (triggerLower.includes("reembolso") || triggerLower.includes("devolver") || triggerLower.includes("devolução")) {
        keywords.push("reembolso", "devolver", "devolução", "quero meu dinheiro", "cancelar pedido", "estornar", "estorno");
        actionDesc = actionDesc || "reembolso";
    }
    if (triggerLower.includes("humano") || triggerLower.includes("atendente") || triggerLower.includes("pessoa")) {
        keywords.push("falar com humano", "atendente", "pessoa real", "falar com alguém", "quero um humano", "passa pra alguém");
        actionDesc = actionDesc || "atendente humano";
    }
    if (triggerLower.includes("preço") || triggerLower.includes("valor") || triggerLower.includes("quanto custa")) {
        keywords.push("preço", "valor", "quanto custa", "quanto é", "qual o preço", "tabela de preço");
        actionDesc = actionDesc || "preço";
    }
    if (triggerLower.includes("reclama") || triggerLower.includes("problema") || triggerLower.includes("insatisf")) {
        keywords.push("reclamação", "problema", "insatisfeito", "não funcionou", "com defeito", "quebrou", "errado");
        actionDesc = actionDesc || "reclamação";
    }
    if (triggerLower.includes("comprar") || triggerLower.includes("pedido") || triggerLower.includes("encomendar")) {
        keywords.push("comprar", "quero comprar", "fazer pedido", "encomendar", "pedir", "quero pedir");
        actionDesc = actionDesc || "compra";
    }
    // Detectar gatilhos de FINALIZAÇÃO de coleta (universal para qualquer negócio)
    if (triggerLower.includes("finalizar") || triggerLower.includes("encaminhar") || triggerLower.includes("equipe") || triggerLower.includes("informações") || triggerLower.includes("coleta")) {
        keywords.push("encaminhar agora", "vou encaminhar", "já encaminho", "encaminhando", "nossa equipe", "equipe analisar", "equipe vai", "já recebi", "recebi as fotos", "recebi as informações", "informações completas", "vou passar", "já passo", "passando para", "aguarde", "fique no aguardo", "retornamos", "entraremos em contato", "atendimento vai continuar", "humano vai assumir", "atendente vai");
        actionDesc = actionDesc || "coleta finalizada";
    }
    // Se não detectou tipo específico, extrair keywords do trigger + manuais
    if (keywords.length === 0) {
        var extractedKeywords = trigger
            .replace(/me notifique quando o cliente|quiser|quer|pedir|mencionar|falar sobre|ou quando|atendimento automático|finalizar|coleta|informações iniciais/gi, "")
            .trim();
        if (extractedKeywords) {
            keywords.push.apply(keywords, extractedKeywords.split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(function (k) { return k.length > 0; }));
        }
        actionDesc = "gatilho personalizado";
    }
    // Adicionar palavras-chave manuais se fornecidas
    if (manualKeywords) {
        var manualList = manualKeywords.split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(function (k) { return k.length > 0; });
        keywords.push.apply(keywords, manualList);
    }
    // Remover duplicatas (compatível com ES5)
    var uniqueKeywords = keywords.filter(function (value, index, self) { return self.indexOf(value) === index; });
    return "\n### REGRA DE NOTIFICACAO INTELIGENTE ###\n\nPALAVRAS-GATILHO: ".concat(uniqueKeywords.join(', '), "\n\n## INSTRU\u00C7\u00C3O CR\u00CDTICA ##\nAdicione a tag [NOTIFY: ").concat(actionDesc, "] quando QUALQUER uma das condi\u00E7\u00F5es for verdadeira:\n\n1. **MENSAGEM DO CLIENTE** cont\u00E9m uma palavra-gatilho\n2. **SUA PR\u00D3PRIA RESPOSTA** indica que a tarefa/coleta foi conclu\u00EDda\n3. **VOC\u00CA VAI ENCAMINHAR** para equipe humana ou outra \u00E1rea\n4. **O ATENDIMENTO AUTOM\u00C1TICO** atingiu seu objetivo\n\n## EXEMPLOS DE QUANDO NOTIFICAR ##\n\n### Cliente solicita algo:\n- \"Quero agendar\" -> [NOTIFY: ").concat(actionDesc, "]\n- \"Tem vaga amanh\u00E3?\" -> [NOTIFY: ").concat(actionDesc, "]\n\n### Voc\u00EA (agente) finaliza coleta de informa\u00E7\u00F5es:\n- \"Recebi as fotos e o bairro, vou encaminhar para nossa equipe\" -> [NOTIFY: ").concat(actionDesc, "]\n- \"Perfeito! J\u00E1 tenho tudo que preciso, vou passar para o atendimento\" -> [NOTIFY: ").concat(actionDesc, "]\n- \"Informa\u00E7\u00F5es completas! Aguarde que nossa equipe vai analisar\" -> [NOTIFY: ").concat(actionDesc, "]\n\n### Voc\u00EA vai transferir para humano:\n- \"Vou encaminhar agora para nossa equipe analisar\" -> [NOTIFY: ").concat(actionDesc, "]\n- \"Nossa equipe j\u00E1 vai te retornar\" -> [NOTIFY: ").concat(actionDesc, "]\n\n## QUANDO N\u00C3O NOTIFICAR ##\n- Cliente apenas perguntou algo gen\u00E9rico\n- Conversa ainda est\u00E1 em andamento sem gatilho espec\u00EDfico\n- Voc\u00EA est\u00E1 apenas explicando algo ou respondendo d\u00FAvidas\n\nIMPORTANTE: A tag [NOTIFY: ").concat(actionDesc, "] deve estar NO FINAL da sua resposta.\n");
}
// 📝 Converter formatação Markdown para WhatsApp
// WhatsApp usa: *negrito* _itálico_ ~tachado~ ```mono```
// Mistral retorna: **negrito** *itálico* ~~tachado~~ `mono`
function convertMarkdownToWhatsApp(text) {
    var converted = text;
    // 0. FIX 2026-05-27: Remove separator lines that leak from system prompt
    // The AI sometimes copies ━━━, ═══, ---, ___  or *** separators into responses
    converted = converted.replace(/^[\s]*[━═─—\-_*]{3,}[\s]*$/gm, '');
    // 0b. FIX 2026-02-26: Remove padrões de traços que fazem parecer IA/GPT
    // 1) Linhas com 2+ traços consecutivos (ex: "--", "---", "-----")
    converted = converted.replace(/\-{2,}/g, '');
    // 2) Traços usados como bullet points no início de linhas: "- item" → "• item"
    converted = converted.replace(/^[\s]*-\s+/gm, '• ');
    // 3) Em-dashes (—) usados como separadores em frases: " — " → ", "
    converted = converted.replace(/\s*—\s*/g, ', ');
    // 4) En-dashes (–) usados como separadores: " – " → ", "
    converted = converted.replace(/\s*–\s*/g, ', ');
    // 5) Traço isolado usado como separador entre conceitos: " - " → ", "
    // CUIDADO: Não remover traços em palavras compostas (segunda-feira) ou negativos (-5)
    converted = converted.replace(/(?<=[a-záéíóúàâêôãõ\s])\s+-\s+(?=[a-záéíóúàâêôãõA-Z])/g, ', ');
    // Clean up resulting multiple blank lines
    converted = converted.replace(/\n{3,}/g, '\n\n');
    // Clean up multiple commas
    converted = converted.replace(/,\s*,/g, ',');
    // Clean up leading comma at start of line
    converted = converted.replace(/^\s*,\s*/gm, '');
    // 1. Negrito: **texto** → *texto*
    // Regex: Match **...** mas não pegar ***... (que seria bold+italic)
    converted = converted.replace(/\*\*(?!\*)(.+?)\*\*(?!\*)/g, '*$1*');
    // 2. Tachado: ~~texto~~ → ~texto~
    converted = converted.replace(/~~(.+?)~~/g, '~$1~');
    // 3. Mono (code inline): `texto` → ```texto``` (WhatsApp prefere triplo)
    // Mas preservar blocos de código que já são ```...```
    converted = converted.replace(/(?<!`)\`(?!``)(.+?)\`(?!`)/g, '```$1```');
    return converted.trim();
}
// ═══════════════════════════════════════════════════════════════════════
// 🧹 FUNÇÃO PARA LIMPAR VAZAMENTOS DE INSTRUÇÕES NA RESPOSTA DA IA
// Remove instruções técnicas que a IA às vezes copia do prompt para a resposta
// Ex: "Use exatamente o texto abaixo..." não deve aparecer na mensagem ao cliente
// ═══════════════════════════════════════════════════════════════════════
function cleanInstructionLeaks(responseText) {
    var originalText = responseText;
    var cleanedText = responseText;
    // Padrões de instruções técnicas que vazam na resposta
    var instructionPatterns = [
        // "Use exatamente o texto abaixo..." e variações
        /^\s*\*?\*?\s*use\s+\*?exatamente\*?\s+o\s+texto\s+abaixo[^"]*?:\s*/i,
        /^\s*use\s+o\s+(?:modelo|texto)\s+abaixo[^"]*?:\s*/i,
        // "Envie apenas o texto:" e variações
        /envie\s+\*?\*?apenas\*?\*?\s*o\s+texto:?\s*/i,
        // "sem exibir instruções ou notas técnicas"
        /,?\s*sem\s+exibir\s+instru[cç][oõ]es\s+ou\s+notas\s+t[eé]cnicas[^"]*?[:.]?\s*/i,
        // "(ex: "Use exatamente...")"
        /\s*\(ex:?\s*[""][^""]+[""]\.?\)\s*\.?\s*/gi,
        // "mantendo o tom natural e direto:"
        /,?\s*mantendo\s+o\s+tom\s+natural\s+(?:e\s+)?direto:?\s*/i,
        // "sem alterar nome, estrutura ou tom:"
        /,?\s*sem\s+alterar\s+nome,?\s+estrutura\s+ou\s+tom:?\s*/i,
        // Remover asteriscos soltos no início
        /^\s*\*+\s*/,
    ];
    // Aplicar cada padrão de limpeza
    for (var _i = 0, instructionPatterns_1 = instructionPatterns; _i < instructionPatterns_1.length; _i++) {
        var pattern = instructionPatterns_1[_i];
        cleanedText = cleanedText.replace(pattern, '');
    }
    // Se a resposta começa com aspas duplas, provavelmente é o texto entre aspas que queremos
    // Extrair o conteúdo entre as primeiras aspas
    var quotedTextMatch = cleanedText.match(/^[""]([^""]+)[""]$/);
    if (quotedTextMatch) {
        cleanedText = quotedTextMatch[1];
    }
    // Se ainda tem aspas no início (sem fechar), remover
    cleanedText = cleanedText.replace(/^[""]/, '').replace(/[""]$/, '');
    // Limpar espaços extras
    cleanedText = cleanedText.trim();
    // Se limpamos algo significativo, logar
    if (cleanedText !== originalText) {
        console.log("\uD83E\uDDF9 [AI Agent] Limpeza de instru\u00E7\u00F5es vazadas:");
        console.log("   Original (".concat(originalText.length, " chars): \"").concat(originalText.substring(0, 100), "...\""));
        console.log("   Limpo (".concat(cleanedText.length, " chars): \"").concat(cleanedText.substring(0, 100), "...\""));
    }
    return cleanedText;
}
function detectFormattingRequest(conversationHistory, newMessageText) {
    // Juntar todas as mensagens do cliente (não as do agente)
    var clientMessages = conversationHistory
        .filter(function (m) { return !m.fromMe; })
        .map(function (m) { return m.text || ''; })
        .concat([newMessageText || ''])
        .join(' ')
        .toLowerCase();
    // Padrões que indicam pedido de formatação LINHA POR LINHA
    var lineByLinePatterns = [
        // Padrões mais genéricos (colocados primeiro para máxima captura)
        /cada\s+um\s+(?:em\s+)?(?:uma\s+)?linha/i, // "cada um em uma linha"
        /um\s+(?:em\s+)?cada\s+linha/i, // "um em cada linha"  
        /em\s+(?:uma\s+)?linha\s+(?:separada|diferente|própria)/i, // "em uma linha separada"
        /(?:cada|um)\s+(?:em\s+)?(?:sua\s+)?(?:própria\s+)?linha/i, // "cada em sua própria linha"
        // Padrões específicos
        /cada\s+(?:frase|item|bene?f[íi]cio|coisa)\s+(?:em\s+)?(?:uma\s+)?linha/i,
        /linha\s+por\s+linha/i,
        /separad[oa]\s+por\s+linha/i,
        /uma\s+(?:frase|coisa|item)\s+(?:por|em\s+cada)\s+linha/i,
        /em\s+linhas\s+separadas/i,
        /cada\s+linha\s+(?:separada|individual)/i,
        /formata(?:r|do|ção)?\s+(?:com\s+)?(?:quebras?\s+de\s+)?linha/i,
        /(?:pode|quero|gostaria)\s+(?:que\s+)?(?:cada|as)\s+(?:frase|linha)/i,
        /(?:envia|manda)\s+(?:cada|em)\s+linha/i,
        /um\s+(?:item|bene?f[íi]cio)\s+por\s+(?:mensagem|linha)/i,
        /quebra(?:s)?\s+de\s+linha/i,
        /coloca(?:r)?\s+(?:cada\s+)?(?:um|uma)\s+(?:em\s+)?(?:cada\s+)?linha/i,
        /linha\s+separada/i,
    ];
    // Padrões que indicam pedido de formatação COMPACTA (tudo junto)
    var compactPatterns = [
        /tudo\s+junto/i,
        /sem\s+quebra/i,
        /texto\s+corrido/i,
        /parágrafo\s+único/i,
        /não\s+precisa\s+(?:de\s+)?linha/i,
    ];
    // Verificar padrões de linha por linha
    for (var _i = 0, lineByLinePatterns_1 = lineByLinePatterns; _i < lineByLinePatterns_1.length; _i++) {
        var pattern = lineByLinePatterns_1[_i];
        var match = clientMessages.match(pattern);
        if (match) {
            console.log("\uD83C\uDFAF [AI Agent] PEDIDO DE FORMATA\u00C7\u00C3O DETECTADO: linha-por-linha");
            console.log("   Frase detectada: \"".concat(match[0], "\""));
            return { detected: true, type: 'line-by-line', matchedPhrase: match[0] };
        }
    }
    // Verificar padrões de compacto
    for (var _a = 0, compactPatterns_1 = compactPatterns; _a < compactPatterns_1.length; _a++) {
        var pattern = compactPatterns_1[_a];
        var match = clientMessages.match(pattern);
        if (match) {
            console.log("\uD83C\uDFAF [AI Agent] PEDIDO DE FORMATA\u00C7\u00C3O DETECTADO: compacto");
            console.log("   Frase detectada: \"".concat(match[0], "\""));
            return { detected: true, type: 'compact', matchedPhrase: match[0] };
        }
    }
    return { detected: false, type: null, matchedPhrase: null };
}
// Gerar instrução de formatação para injetar no prompt
function generateFormattingInstruction(formattingRequest) {
    if (!formattingRequest.detected)
        return '';
    if (formattingRequest.type === 'line-by-line') {
        return "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83C\uDFAF INSTRU\u00C7\u00C3O CR\u00CDTICA DE FORMATA\u00C7\u00C3O (O CLIENTE PEDIU EXPLICITAMENTE!)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nO cliente PEDIU para voc\u00EA formatar com CADA FRASE EM UMA LINHA SEPARADA.\nFrase detectada: \"".concat(formattingRequest.matchedPhrase, "\"\n\nOBRIGAT\u00D3RIO:\n- Coloque CADA item, benef\u00EDcio ou informa\u00E7\u00E3o em SUA PR\u00D3PRIA LINHA\n- Use quebra de linha entre cada item\n- N\u00C3O coloque m\u00FAltiplos itens na mesma linha\n- Emojis devem aparecer NO IN\u00CDCIO de cada linha\n\nEXEMPLO CORRETO:\n\uD83C\uDFB9 Produza mais r\u00E1pido\n\uD83C\uDFB9 +1000 livrarias de piano\n\uD83C\uDDE7\uD83C\uDDF7 Timbres brasileiros\n\uD83D\uDD25 Acesso vital\u00EDcio\n\nEXEMPLO ERRADO (N\u00C3O FA\u00C7A ISSO):\n\uD83C\uDFB9 Produza mais r\u00E1pido \uD83C\uDFB9 +1000 livrarias \uD83C\uDDE7\uD83C\uDDF7 Timbres brasileiros \uD83D\uDD25 Acesso vital\u00EDcio\n\nSIGA A PREFER\u00CANCIA DO CLIENTE!\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
    }
    if (formattingRequest.type === 'compact') {
        return "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\uD83C\uDFAF INSTRU\u00C7\u00C3O DE FORMATA\u00C7\u00C3O (O CLIENTE PEDIU TEXTO COMPACTO)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nO cliente PEDIU para voc\u00EA enviar texto mais compacto, sem quebras de linha excessivas.\nFrase detectada: \"".concat(formattingRequest.matchedPhrase, "\"\n\nOBRIGAT\u00D3RIO:\n- Mantenha o texto em formato de par\u00E1grafo corrido\n- Evite quebras de linha entre itens\n- Use v\u00EDrgulas ou pontos para separar itens\n\nSIGA A PREFER\u00CANCIA DO CLIENTE!\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
    }
    return '';
}
function generateAIResponse(userId, conversationHistory, newMessageText, options, testDependencies) {
    return __awaiter(this, void 0, void 0, function () {
        var isCTWAFallback, buildNullResult, isSuspended, contactName, sentMedias_1, contactPhone, botCheck, businessConfig, agentConfig, now, agentPromptHash, cached, cacheValid, obterVersaoAtual, currentVersion, versionHash, configTime, versionTime, salvarVersaoPrompt, syncErr_1, syncErr_2, finalHash, syncError_1, isHistoryModeActive, priceFlowEnabled, priceFlowFallback, prodFlowModeActive, prodFlowScript, executeFlowResponse, flowHistory, flowResult, flowErr_1, bypassFlowEngine, _a, deliveryEnabled, schedulingEnabled, salonEnabled, bypassError_1, useFlowEngine, flowInSync, flow, currentPrompt, sourcePrompt, promptHash_1, sourceHash, flowSyncError_1, llmConfig, apiKey, conversationId, flowResult, flowError_1, deliveryResponse, combinedResponse, mediaActions_1, deliveryError_1, salonResponse, salonError_1, mediaLibrary, hasMedia, useAdvancedSystem, triggerPhrases, normalize_1, includesNormalized_1, lastText_1, allMessages_1, foundIn_1, hasTrigger, systemPrompt, mediaPromptBlock, dynamicContextBlock, conversationMemory, memoryContextBlock, promptAnalysis, preBlindagem, blindagemUniversal, nomeNegocio, notificationSection, schedulingPromptBlock, schedError_1, productsData, productsPromptBlock, prodError_1, deliveryData, deliveryPromptBlock, deliveryError_2, courseData, coursePromptBlock, courseError_1, greetingParts, safeName, isGreetingEnabled, greeting, isAddressEnabled, greetingBlock, messages_1, formattingRequest, formattingInstruction, hasAgentResponded, hasOwnerMessages, clientMessagesCount, hasPriorContext, historyContext, RECENT_MESSAGES_COUNT, MAX_MESSAGES_BEFORE_SUMMARY, recentMessages, historySummary, oldMessages, clientMessages, agentMessages, topics, intentKeywords, detectedIntents, allClientText_1, _i, _b, _c, intent, keywords, lastMessages, clientMessages, agentMessages, hasAgentReplies, isSaudacao, msgLower, jaDisseOQueTrabalha, jaPediuAjuda, jaInteragiu, contextSummary, antiAmnesiaPrompt, uniqueMessages, i, current, prev, _loop_2, i, finalUserMessage, isSaudacaoSimples, hasAgentRepliesInHistory, lastAgentMsg, lastAgentText, listPhrases, isAskingForListInMessage, promptToSearch, numberedListRegex, listMatch, extractedList, itemCount, llmClient_1, currentProvider, questionLength, listKeywords, isAskingForList, baseMaxTokens, configMaxTokens, maxTokens_1, model_1, promptHash, chatResponse, content, responseText, notification, finishReason, lastLine, isMidList, isMidSentence, lines, lastPunctuation, paragraphs, halfLength, firstHalf, secondHalf, notifyMatch, hasPromptLeak, originalLength, sentences, cleanedResponse, _d, sentences_1, sentence, validation, deliveryMenu, displayInstructions_1, askFirstKeywords, shouldAskFirst, categoryList, perguntaCategoria, formattedMenu, perguntaPediuCardapio, respostaTemPrecos, deliveryMenu, displayInstructions_2, askFirstKeywords, shouldAskFirst, formattedMenu, categoryTagRegex, categoryMatch, _loop_3, mediaActions, parsedResponse, originalCount, aiHadMediaIntent, forceResult, sequencedMedia, lastSentMedia, responseNormalized, hasPriceMention, appointmentCreated, schedulingResult, schedError_2, cancelResult, cancelError_1, deliveryOrderCreated, deliveryResult, deliveryError_3, conversationKey, deliveryData, hasPrice, validation, priceValidationError_1, error_6, errorBody, e_1;
        var _this = this;
        var _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        return __generator(this, function (_w) {
            switch (_w.label) {
                case 0:
                    _w.trys.push([0, 99, , 107]);
                    isCTWAFallback = (options === null || options === void 0 ? void 0 : options.isCTWAFallback) === true;
                    buildNullResult = function (reason, retryable) { return ({
                        text: null,
                        mediaActions: [],
                        meta: { reason: reason, retryable: retryable },
                    }); };
                    return [4 /*yield*/, checkUserSuspension(userId)];
                case 1:
                    isSuspended = _w.sent();
                    if (isSuspended) {
                        console.log("\n".concat('!'.repeat(60)));
                        console.log("\uD83D\uDEAB [AI Agent] RETURN NULL #1: Usu\u00E1rio ".concat(userId, " est\u00E1 SUSPENSO"));
                        console.log("".concat('!'.repeat(60), "\n"));
                        return [2 /*return*/, buildNullResult("user_suspended", false)];
                    }
                    contactName = options === null || options === void 0 ? void 0 : options.contactName;
                    sentMedias_1 = (options === null || options === void 0 ? void 0 : options.sentMedias) || [];
                    contactPhone = (options === null || options === void 0 ? void 0 : options.contactPhone) || '';
                    botCheck = isMessageFromBot(newMessageText, contactName);
                    if (botCheck.isBot) {
                        console.log("\n".concat('!'.repeat(60)));
                        console.log("\uD83E\uDD16 [AI Agent] RETURN NULL #2: Mensagem de BOT detectada - IGNORANDO");
                        console.log("   Raz\u00E3o: ".concat(botCheck.reason));
                        console.log("   Contato: ".concat(contactName || 'N/A'));
                        console.log("   Mensagem: ".concat(newMessageText.substring(0, 50), "..."));
                        console.log("".concat('!'.repeat(60), "\n"));
                        return [2 /*return*/, buildNullResult("bot_detected", false)];
                    }
                    console.log("\uD83D\uDC64 [AI Agent] Nome do cliente: ".concat(contactName || 'Não identificado'));
                    console.log("\uD83D\uDCC1 [AI Agent] M\u00EDdias j\u00E1 enviadas: ".concat(sentMedias_1.length > 0 ? sentMedias_1.join(', ') : 'nenhuma'));
                    businessConfig = void 0;
                    if (!(testDependencies === null || testDependencies === void 0 ? void 0 : testDependencies.getBusinessAgentConfig)) return [3 /*break*/, 3];
                    return [4 /*yield*/, testDependencies.getBusinessAgentConfig(userId)];
                case 2:
                    businessConfig = _w.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, ((_e = storage_1.storage.getBusinessAgentConfig) === null || _e === void 0 ? void 0 : _e.call(storage_1.storage, userId))];
                case 4:
                    businessConfig = _w.sent();
                    _w.label = 5;
                case 5:
                    agentConfig = void 0;
                    if (!(testDependencies === null || testDependencies === void 0 ? void 0 : testDependencies.getAgentConfig)) return [3 /*break*/, 7];
                    return [4 /*yield*/, testDependencies.getAgentConfig(userId)];
                case 6:
                    agentConfig = _w.sent();
                    return [3 /*break*/, 9];
                case 7: return [4 /*yield*/, storage_1.storage.getAgentConfig(userId)];
                case 8:
                    agentConfig = _w.sent();
                    _w.label = 9;
                case 9:
                    if (!(!(testDependencies === null || testDependencies === void 0 ? void 0 : testDependencies.getAgentConfig) && (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt))) return [3 /*break*/, 24];
                    now = Date.now();
                    agentPromptHash = crypto_1.default.createHash('md5').update(agentConfig.prompt).digest('hex').substring(0, 8);
                    cached = promptSyncCache.get(userId);
                    cacheValid = cached && cached.promptHash === agentPromptHash && (now - cached.checkedAt) < PROMPT_SYNC_TTL_MS;
                    if (!!cacheValid) return [3 /*break*/, 24];
                    _w.label = 10;
                case 10:
                    _w.trys.push([10, 23, , 24]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./promptHistoryService'); })];
                case 11:
                    obterVersaoAtual = (_w.sent()).obterVersaoAtual;
                    return [4 /*yield*/, obterVersaoAtual(userId, 'ai_agent_config')];
                case 12:
                    currentVersion = _w.sent();
                    if (!((currentVersion === null || currentVersion === void 0 ? void 0 : currentVersion.prompt_content) && currentVersion.prompt_content !== agentConfig.prompt)) return [3 /*break*/, 22];
                    versionHash = crypto_1.default.createHash('md5').update(currentVersion.prompt_content).digest('hex').substring(0, 8);
                    console.log("[PROMPT SYNC] Mismatch detected. config hash: ".concat(agentPromptHash, ", versions hash: ").concat(versionHash));
                    configTime = agentConfig.updatedAt ? new Date(agentConfig.updatedAt).getTime() : 0;
                    versionTime = currentVersion.updated_at ? new Date(currentVersion.updated_at).getTime() : 0;
                    if (!(configTime > versionTime)) return [3 /*break*/, 18];
                    // ai_agent_config is NEWER (admin agent / SALVAR_CONFIG wrote) -> sync TO prompt_versions
                    console.log("[PROMPT SYNC] ai_agent_config is newer (".concat(new Date(configTime).toISOString(), " > ").concat(new Date(versionTime).toISOString(), ") - syncing TO prompt_versions"));
                    _w.label = 13;
                case 13:
                    _w.trys.push([13, 16, , 17]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./promptHistoryService'); })];
                case 14:
                    salvarVersaoPrompt = (_w.sent()).salvarVersaoPrompt;
                    return [4 /*yield*/, salvarVersaoPrompt({
                            userId: userId,
                            configType: 'ai_agent_config',
                            promptContent: agentConfig.prompt,
                            editSummary: 'Auto-sync from admin agent update',
                            editType: 'ia'
                        })];
                case 15:
                    _w.sent();
                    console.log("[PROMPT SYNC] prompt_versions updated from ai_agent_config");
                    return [3 /*break*/, 17];
                case 16:
                    syncErr_1 = _w.sent();
                    console.error("[PROMPT SYNC] Failed to sync to prompt_versions:", syncErr_1);
                    return [3 /*break*/, 17];
                case 17: return [3 /*break*/, 22];
                case 18:
                    // prompt_versions is NEWER (UI restore/edit) -> sync TO ai_agent_config
                    console.log("[PROMPT SYNC] prompt_versions is newer - syncing TO ai_agent_config");
                    agentConfig = __assign(__assign({}, agentConfig), { prompt: currentVersion.prompt_content });
                    _w.label = 19;
                case 19:
                    _w.trys.push([19, 21, , 22]);
                    return [4 /*yield*/, storage_1.storage.updateAgentConfig(userId, { prompt: currentVersion.prompt_content })];
                case 20:
                    _w.sent();
                    console.log("[PROMPT SYNC] ai_agent_config updated from prompt_versions");
                    return [3 /*break*/, 22];
                case 21:
                    syncErr_2 = _w.sent();
                    console.error("[PROMPT SYNC] Failed to sync to ai_agent_config:", syncErr_2);
                    return [3 /*break*/, 22];
                case 22:
                    finalHash = crypto_1.default.createHash('md5').update(agentConfig.prompt).digest('hex').substring(0, 8);
                    promptSyncCache.set(userId, { promptHash: finalHash, checkedAt: now });
                    return [3 /*break*/, 24];
                case 23:
                    syncError_1 = _w.sent();
                    console.error("[PROMPT SYNC] Erro ao checar prompt_versions:", syncError_1);
                    promptSyncCache.set(userId, { promptHash: agentPromptHash, checkedAt: now });
                    return [3 /*break*/, 24];
                case 24:
                    // ═══════════════════════════════════════════════════════════════════════
                    // 🎯 DEBUG: Mostrar status das configurações
                    // ═══════════════════════════════════════════════════════════════════════
                    console.log("\n\uD83D\uDD0D [AI Agent] Verificando configura\u00E7\u00F5es para user ".concat(userId, ":"));
                    console.log("   \uD83D\uDCCA Legacy (ai_agent_config): ".concat(agentConfig ? "exists, isActive=".concat(agentConfig.isActive) : 'NOT FOUND'));
                    console.log("   \uD83D\uDCCA Business (business_agent_configs): ".concat(businessConfig ? "exists, isActive=".concat(businessConfig.isActive) : 'NOT FOUND'));
                    isHistoryModeActive = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.fetchHistoryOnFirstResponse) === true;
                    if (isHistoryModeActive) {
                        console.log("\uD83D\uDCDC [AI Agent] MODO HIST\u00D3RICO ATIVO - ".concat(conversationHistory.length, " mensagens ser\u00E3o analisadas com sistema inteligente"));
                    }
                    // ═══════════════════════════════════════════════════════════════════════
                    // 🎯 LÓGICA DE ATIVAÇÃO DO AGENTE:
                    // 
                    // O `ai_agent_config.isActive` (página /meu-agente-ia) é o PRINCIPAL.
                    // Ele controla se o agente responde ou não.
                    // 
                    // O `business_agent_configs.isActive` controla apenas se usa o "modo
                    // avançado" com features extras (jailbreak detection, off-topic, etc.)
                    // ═══════════════════════════════════════════════════════════════════════
                    if (!agentConfig || !agentConfig.isActive) {
                        console.log("\n".concat('!'.repeat(60)));
                        console.log("\u274C [AI Agent] RETURN NULL #3: agentConfig n\u00E3o encontrado ou INATIVO");
                        console.log("   userId: ".concat(userId));
                        console.log("   agentConfig exists: ".concat(!!agentConfig));
                        console.log("   agentConfig.isActive: ".concat(agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.isActive));
                        console.log("".concat('!'.repeat(60), "\n"));
                        return [2 /*return*/, buildNullResult("agent_inactive", false)];
                    }
                    console.log("   \u2705 [AI Agent] Agent ENABLED (legacy isActive=true), processing response...");
                    priceFlowEnabled = shouldEnforcePriceFlow(newMessageText, agentConfig.prompt || "");
                    priceFlowFallback = priceFlowEnabled
                        ? buildPriceFlowFallback(contactName, agentConfig.prompt || "")
                        : null;
                    if (priceFlowEnabled) {
                        console.log("[PRICE FLOW] Enforcement active for this lead");
                    }
                    prodFlowModeActive = agentConfig.flowModeActive === true;
                    prodFlowScript = agentConfig.flowScript;
                    if (!(prodFlowModeActive && prodFlowScript && prodFlowScript.trim().length > 10)) return [3 /*break*/, 29];
                    console.log("\uD83D\uDD00 [AI Agent PROD] \u2705 MODO FLUXO ATIVO - usando FlowScriptEngine");
                    _w.label = 25;
                case 25:
                    _w.trys.push([25, 28, , 29]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./flowScriptEngine"); })];
                case 26:
                    executeFlowResponse = (_w.sent()).executeFlowResponse;
                    flowHistory = conversationHistory.slice(-10).map(function (msg) { return ({
                        role: (msg.fromMe ? "assistant" : "user"),
                        content: msg.text || "",
                    }); });
                    return [4 /*yield*/, executeFlowResponse(newMessageText, prodFlowScript, flowHistory)];
                case 27:
                    flowResult = _w.sent();
                    console.log("\uD83D\uDD00 [AI Agent FLUXO PROD] Resposta (".concat(flowResult.response.length, " chars)"));
                    return [2 /*return*/, {
                            text: flowResult.response,
                            mediaActions: [],
                        }];
                case 28:
                    flowErr_1 = _w.sent();
                    console.error("\uD83D\uDD00 [AI Agent FLUXO PROD] Erro:", flowErr_1);
                    return [2 /*return*/, {
                            text: "Olá! Estou aqui para ajudar. Por favor, siga as instruções do atendimento. 😊",
                            mediaActions: [],
                        }];
                case 29:
                    bypassFlowEngine = false;
                    _w.label = 30;
                case 30:
                    _w.trys.push([30, 32, , 33]);
                    return [4 /*yield*/, Promise.all([
                            (0, deliveryAIService_1.isDeliveryEnabled)(userId),
                            (0, schedulingService_1.isSchedulingEnabled)(userId),
                            (0, salonAIService_1.isSalonActive)(userId),
                        ])];
                case 31:
                    _a = _w.sent(), deliveryEnabled = _a[0], schedulingEnabled = _a[1], salonEnabled = _a[2];
                    bypassFlowEngine = deliveryEnabled || schedulingEnabled || salonEnabled;
                    if (bypassFlowEngine) {
                        console.log("\uD83D\uDEAB [AI Agent] FlowEngine ignorado (delivery/agendamento/salon ativo)");
                    }
                    return [3 /*break*/, 33];
                case 32:
                    bypassError_1 = _w.sent();
                    console.log("\u26A0\uFE0F [AI Agent] N\u00E3o foi poss\u00EDvel verificar delivery/agendamento/salon:", bypassError_1);
                    return [3 /*break*/, 33];
                case 33:
                    if (!!bypassFlowEngine) return [3 /*break*/, 46];
                    _w.label = 34;
                case 34:
                    _w.trys.push([34, 45, , 46]);
                    return [4 /*yield*/, (0, flowIntegration_1.shouldUseFlowEngine)(userId)];
                case 35:
                    useFlowEngine = _w.sent();
                    if (!useFlowEngine) return [3 /*break*/, 44];
                    flowInSync = true;
                    _w.label = 36;
                case 36:
                    _w.trys.push([36, 38, , 39]);
                    return [4 /*yield*/, flowIntegration_1.FlowStorage.loadFlow(userId)];
                case 37:
                    flow = _w.sent();
                    currentPrompt = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) || "";
                    sourcePrompt = (flow === null || flow === void 0 ? void 0 : flow.sourcePrompt) || "";
                    if (!flow || !sourcePrompt || !currentPrompt) {
                        flowInSync = false;
                    }
                    else {
                        promptHash_1 = crypto_1.default.createHash('md5').update(currentPrompt).digest('hex').substring(0, 8);
                        sourceHash = crypto_1.default.createHash('md5').update(sourcePrompt).digest('hex').substring(0, 8);
                        flowInSync = promptHash_1 == sourceHash;
                        if (!flowInSync) {
                            console.log("?? [Flow Engine] Flow desatualizado (promptHash=".concat(promptHash_1, " sourceHash=").concat(sourceHash, ") - usando sistema legado"));
                            console.log("?? [Flow Engine] sourcePrompt len=".concat(sourcePrompt.length, ", prompt len=").concat(currentPrompt.length));
                        }
                    }
                    return [3 /*break*/, 39];
                case 38:
                    flowSyncError_1 = _w.sent();
                    flowInSync = false;
                    console.log("?? [Flow Engine] Falha ao validar sync do flow - usando sistema legado", flowSyncError_1);
                    return [3 /*break*/, 39];
                case 39:
                    if (!!flowInSync) return [3 /*break*/, 40];
                    return [3 /*break*/, 44];
                case 40:
                    console.log("\n\uD83D\uDD17 [AI Agent] Detectado FlowEngine ativo - usando arquitetura IA+Fluxo");
                    console.log("   \u2192 IA INTERPRETA a inten\u00E7\u00E3o");
                    console.log("   \u2192 FLUXO EXECUTA a\u00E7\u00F5es determin\u00EDsticas");
                    console.log("   \u2192 IA HUMANIZA a resposta\n");
                    return [4 /*yield*/, (0, llm_1.getLLMConfig)()];
                case 41:
                    llmConfig = _w.sent();
                    apiKey = llmConfig.provider === 'openrouter'
                        ? llmConfig.openrouterApiKey
                        : llmConfig.provider === 'groq'
                            ? llmConfig.groqApiKey
                            : (llmConfig.mistralApiKey || process.env.MISTRAL_API_KEY || '');
                    if (!!apiKey) return [3 /*break*/, 42];
                    console.log("\u26A0\uFE0F [Flow Engine] Sem API key para provider ".concat(llmConfig.provider, ", usando sistema legado"));
                    return [3 /*break*/, 44];
                case 42:
                    conversationId = (options === null || options === void 0 ? void 0 : options.conversationId) ||
                        "real-".concat(userId, "-").concat(Math.floor(Date.now() / 60000));
                    return [4 /*yield*/, (0, flowIntegration_1.processWithFlowEngine)(userId, conversationId, newMessageText, apiKey, {
                            contactName: contactName,
                            history: conversationHistory.map(function (m) { return ({
                                fromMe: m.fromMe,
                                text: m.text || ''
                            }); })
                        })];
                case 43:
                    flowResult = _w.sent();
                    if (flowResult) {
                        console.log("\u2705 [Flow Engine] Resposta gerada com sucesso");
                        return [2 /*return*/, {
                                text: flowResult.text,
                                mediaActions: flowResult.mediaActions || [],
                                notification: undefined,
                                appointmentCreated: undefined,
                                deliveryOrderCreated: undefined
                            }];
                    }
                    else {
                        console.log("\u26A0\uFE0F [Flow Engine] Sem resposta, usando sistema legado");
                    }
                    _w.label = 44;
                case 44: return [3 /*break*/, 46];
                case 45:
                    flowError_1 = _w.sent();
                    console.error("\u26A0\uFE0F [Flow Engine] Erro:", flowError_1);
                    return [3 /*break*/, 46];
                case 46:
                    _w.trys.push([46, 48, , 49]);
                    console.log("\uD83C\uDF55 [AI Agent] Tentando processar com sistema de delivery...");
                    return [4 /*yield*/, (0, deliveryAIService_1.processDeliveryMessage)(userId, newMessageText, conversationHistory === null || conversationHistory === void 0 ? void 0 : conversationHistory.filter(function (m) { return m.text !== null; }).map(function (m) { return ({ fromMe: m.fromMe, text: m.text }); }), options === null || options === void 0 ? void 0 : options.contactPhone, options === null || options === void 0 ? void 0 : options.conversationId)];
                case 47:
                    deliveryResponse = _w.sent();
                    if (deliveryResponse && (deliveryResponse.bubbles.length > 0 || ((_g = (_f = deliveryResponse.mediaActions) === null || _f === void 0 ? void 0 : _f.length) !== null && _g !== void 0 ? _g : 0) > 0)) {
                        console.log("\uD83C\uDF55 [AI Agent] \u2705 Sistema de delivery retornou ".concat(deliveryResponse.bubbles.length, " bolha(s)"));
                        console.log("\uD83C\uDF55 [AI Agent] Intent: ".concat(deliveryResponse.intent));
                        combinedResponse = deliveryResponse.bubbles.join('\n\n');
                        // Log da resposta para debug
                        console.log("\uD83C\uDF55 [AI Agent] Preview: ".concat(combinedResponse.substring(0, 200), "..."));
                        console.log("\uD83C\uDF55 [AI Agent] Total chars: ".concat(combinedResponse.length));
                        mediaActions_1 = deliveryResponse.mediaActions || [];
                        // V23e: Delivery já decide suas próprias mídias via processDeliveryMessage.
                        // Não forçar mídia adicional via forceMediaDetection.
                        return [2 /*return*/, {
                                text: combinedResponse,
                                mediaActions: mediaActions_1,
                                notification: undefined,
                                appointmentCreated: undefined,
                                deliveryOrderCreated: deliveryResponse.deliveryOrderCreated,
                            }];
                    }
                    else {
                        console.log("\uD83C\uDF55 [AI Agent] Delivery n\u00E3o ativo ou sem resposta - continuando fluxo normal");
                    }
                    return [3 /*break*/, 49];
                case 48:
                    deliveryError_1 = _w.sent();
                    console.error("\uD83C\uDF55 [AI Agent] Erro no sistema de delivery:", deliveryError_1);
                    console.log("\uD83C\uDF55 [AI Agent] Continuando com fluxo normal...");
                    return [3 /*break*/, 49];
                case 49:
                    _w.trys.push([49, 51, , 52]);
                    console.log("\uD83D\uDC87 [AI Agent] Tentando processar com sistema de sal\u00E3o...");
                    return [4 /*yield*/, (0, salonAIService_1.generateSalonResponse)(userId, (options === null || options === void 0 ? void 0 : options.conversationId) || '', (options === null || options === void 0 ? void 0 : options.contactPhone) || '', newMessageText, conversationHistory === null || conversationHistory === void 0 ? void 0 : conversationHistory.filter(function (m) { return m.text !== null; }).map(function (m) { return ({ fromMe: m.fromMe, text: m.text }); }))];
                case 50:
                    salonResponse = _w.sent();
                    if (salonResponse && salonResponse.text) {
                        console.log("\uD83D\uDC87 [AI Agent] \u2705 Sistema de sal\u00E3o retornou resposta");
                        console.log("\uD83D\uDC87 [AI Agent] Preview: ".concat(salonResponse.text.substring(0, 150), "..."));
                        return [2 /*return*/, {
                                text: salonResponse.text,
                                mediaActions: [],
                                notification: undefined,
                                appointmentCreated: salonResponse.shouldSave ? true : undefined,
                                deliveryOrderCreated: undefined,
                            }];
                    }
                    else {
                        console.log("\uD83D\uDC87 [AI Agent] Sal\u00E3o n\u00E3o ativo ou sem resposta - continuando fluxo normal");
                    }
                    return [3 /*break*/, 52];
                case 51:
                    salonError_1 = _w.sent();
                    console.error("\uD83D\uDC87 [AI Agent] Erro no sistema de sal\u00E3o:", salonError_1);
                    console.log("\uD83D\uDC87 [AI Agent] Continuando com fluxo normal...");
                    return [3 /*break*/, 52];
                case 52:
                    mediaLibrary = void 0;
                    if (!(testDependencies === null || testDependencies === void 0 ? void 0 : testDependencies.getAgentMediaLibrary)) return [3 /*break*/, 54];
                    return [4 /*yield*/, testDependencies.getAgentMediaLibrary(userId)];
                case 53:
                    mediaLibrary = _w.sent();
                    return [3 /*break*/, 56];
                case 54: return [4 /*yield*/, (0, mediaService_1.getAgentMediaLibrary)(userId)];
                case 55:
                    mediaLibrary = _w.sent();
                    _w.label = 56;
                case 56:
                    hasMedia = mediaLibrary.length > 0;
                    if (hasMedia) {
                        console.log("\uD83D\uDCC1 [AI Agent] Found ".concat(mediaLibrary.length, " media items for user ").concat(userId));
                    }
                    useAdvancedSystem = false;
                    console.log("\uD83D\uDCDD [AI Agent] Using LEGACY system (deterministic) for user ".concat(userId));
                    // 📝 DEBUG: Log do config do agente para verificar se prompt está correto
                    console.log("\n\uD83E\uDD16 [AI Agent] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83E\uDD16 [AI Agent] Config para user ".concat(userId, " respondendo cliente:"));
                    console.log("   Model (legacy, ignorado): ".concat(agentConfig.model, " \u2192 real: system_config.openrouter_model"));
                    console.log("   Active: ".concat(agentConfig.isActive));
                    console.log("   Trigger phrases: ".concat(((_h = agentConfig.triggerPhrases) === null || _h === void 0 ? void 0 : _h.length) || 0));
                    console.log("   Prompt length: ".concat(((_j = agentConfig.prompt) === null || _j === void 0 ? void 0 : _j.length) || 0, " chars"));
                    console.log("   Prompt (primeiros 150 chars): ".concat(((_k = agentConfig.prompt) === null || _k === void 0 ? void 0 : _k.substring(0, 150)) || 'N/A', "..."));
                    console.log("   Prompt (MD5 para debug): ".concat(crypto_1.default.createHash('md5').update(agentConfig.prompt || '').digest('hex').substring(0, 8)));
                    console.log("\uD83E\uDD16 [AI Agent] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    triggerPhrases = agentConfig.triggerPhrases;
                    if (triggerPhrases && triggerPhrases.length > 0 && !isCTWAFallback) {
                        normalize_1 = function (s) { return (s || "")
                            .toLowerCase()
                            .normalize("NFD").replace(/\p{Diacritic}/gu, "")
                            .replace(/\s+/g, " ")
                            .trim(); };
                        includesNormalized_1 = function (haystack, needle) {
                            var h = normalize_1(haystack);
                            var n = normalize_1(needle);
                            if (!n)
                                return false;
                            // também tolera ausência/presença de espaços (ex: "interesse no" vs "interesseno")
                            var hNoSpace = h.replace(/\s+/g, "");
                            var nNoSpace = n.replace(/\s+/g, "");
                            return h.includes(n) || hNoSpace.includes(nNoSpace);
                        };
                        console.log("\uD83D\uDD0D [AI Agent] Verificando trigger phrases (".concat(triggerPhrases.length, " configuradas)"));
                        console.log("   Trigger phrases: ".concat(triggerPhrases.join(', ')));
                        lastText_1 = newMessageText || "";
                        allMessages_1 = __spreadArray(__spreadArray([], conversationHistory.map(function (m) { return m.text || ""; }), true), [
                            lastText_1
                        ], false).join(" ");
                        foundIn_1 = "none";
                        hasTrigger = triggerPhrases.some(function (phrase) {
                            var inLast = includesNormalized_1(lastText_1, phrase);
                            var inAll = inLast ? false : includesNormalized_1(allMessages_1, phrase);
                            if (inLast)
                                foundIn_1 = "last";
                            else if (inAll)
                                foundIn_1 = "history";
                            console.log("   Procurando \"".concat(phrase, "\" \u2192 last:").concat(inLast ? '✅' : '❌', " | history:").concat(inAll ? '✅' : '❌'));
                            return inLast || inAll;
                        });
                        if (!hasTrigger) {
                            console.log("\n".concat('!'.repeat(60)));
                            console.log("\u23F8\uFE0F [AI Agent] RETURN NULL #4: Trigger phrases configuradas mas NENHUMA encontrada");
                            console.log("   userId: ".concat(userId));
                            console.log("   Trigger phrases configuradas: ".concat(triggerPhrases.join(', ')));
                            console.log("   Mensagem atual: \"".concat(newMessageText.substring(0, 100), "\""));
                            console.log("   \uD83D\uDC49 Para resolver: Remova as trigger phrases ou adicione uma que corresponda");
                            console.log("".concat('!'.repeat(60), "\n"));
                            return [2 /*return*/, buildNullResult("trigger_phrase_not_matched", false)];
                        }
                        console.log("\u2705 [AI Agent] Trigger phrase detected (".concat(foundIn_1, ") for user ").concat(userId, ", proceeding with response"));
                    }
                    else if (triggerPhrases && triggerPhrases.length > 0 && isCTWAFallback) {
                        console.log("\uD83D\uDFE2 [AI Agent] CTWA fallback ativo - ignorando trigger phrases para tratar lead como interesse");
                    }
                    systemPrompt = void 0;
                    mediaPromptBlock = hasMedia ? (0, mediaService_1.generateMediaPromptBlock)(mediaLibrary) : '';
                    dynamicContextBlock = generateDynamicContextBlock(contactName, sentMedias_1, conversationHistory);
                    conversationMemory = analyzeConversationHistory(conversationHistory, contactName);
                    memoryContextBlock = generateMemoryContextBlock(conversationMemory, contactName);
                    console.log("\uD83E\uDDE0 [AI Agent] Memory analysis: greeted=".concat(conversationMemory.hasGreeted, ", pendingActions=").concat(conversationMemory.pendingActions.length, ", sentMedia=").concat(conversationMemory.hasSentMedia.length));
                    promptAnalysis = (0, promptBlindagem_1.analyzeUserPrompt)(agentConfig.prompt);
                    preBlindagem = (0, promptBlindagem_1.generatePreBlindagem)(promptAnalysis);
                    blindagemUniversal = (0, promptBlindagem_1.generateUniversalBlindagem)(promptAnalysis);
                    nomeNegocio = promptAnalysis.businessName;
                    console.log("\uD83D\uDEE1\uFE0F [Blindagem V3] An\u00E1lise do prompt: neg\u00F3cio=\"".concat(nomeNegocio, "\", tipo=\"").concat(promptAnalysis.businessType, "\""));
                    systemPrompt = preBlindagem + agentConfig.prompt + "\n\n  ---\n  \n  ".concat(dynamicContextBlock, "\n  \n  ").concat(blindagemUniversal, "\n  \n  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n  \uD83D\uDCCB REGRAS ESPEC\u00CDFICAS DO SISTEMA (COMPLEMENTARES)\n  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n  \uD83C\uDFA4 REGRA SOBRE \u00C1UDIOS:\n  - Voc\u00EA ENTENDE mensagens de voz (s\u00E3o transcritas automaticamente)\n  - NUNCA diga \"n\u00E3o consigo ouvir \u00E1udios\" - PROIBIDO\n  - Se n\u00E3o transcreveu: \"Desculpa, n\u00E3o entendi bem. Pode repetir?\"\n\n  \uD83D\uDDBC\uFE0F REGRA SOBRE IMAGENS:\n  - Voc\u00EA V\u00CA imagens (s\u00E3o analisadas automaticamente)\n  - Use a descri\u00E7\u00E3o fornecida \"(Cliente enviou imagem: ...)\"\n  - NUNCA diga \"n\u00E3o consigo ver imagens\" - PROIBIDO\n\n  \uD83D\uDCCB REGRA DE FORMATA\u00C7\u00C3O VERBATIM:\n  - Se o prompt diz \"envie EXATAMENTE\" \u2192 COPIE LITERALMENTE\n  - PRESERVE quebras de linha, * (negrito), _ (it\u00E1lico), emojis\n\n  \uD83C\uDF55 REGRA PARA CARD\u00C1PIO/MENU:\n  - Quando pedirem card\u00E1pio/menu/lista de produtos:\n    \u2192 USE A TAG: [ENVIAR_CARDAPIO_COMPLETO]\n    \u2192 NUNCA liste produtos manualmente\n    \u2192 Exemplo: \"[ENVIAR_CARDAPIO_COMPLETO]\\n\\nAqui est\u00E1! \uD83D\uDE0A O que vai querer?\"\n\n  \uD83D\uDCAC ESTILO DE COMUNICA\u00C7\u00C3O - MENSAGENS CURTAS E NATURAIS:\n  - Responda SEMPRE de forma BREVE: no m\u00E1ximo 2-3 frases por bloco.\n  - Fale como uma pessoa real no WhatsApp: direto, casual, sem text\u00E3o.\n  - SO use [BOLHA] quando a resposta TOTAL ultrapassar 400 caracteres. Se a resposta inteira couber em 400 chars, NAO use [BOLHA].\n  - Quando precisar dividir, cada bolha deve ter NO MAXIMO 400 caracteres.\n  - M\u00E1ximo 2-3 blocos separados por [BOLHA]. Nao fragmente demais.\n  - Exemplo SEM bolha (curto): \"Ol\u00E1! Tudo bem? Aqui \u00E9 o Jo\u00E3o da Bicicletaria! Como posso te ajudar?\"\n  - Exemplo COM bolha (longo): \"Temos v\u00E1rios modelos de bicicleta dispon\u00EDveis, desde urbanas at\u00E9 mountain bike. Todas com garantia de 1 ano.[BOLHA]Me conta o que voc\u00EA precisa que te indico o modelo ideal!\"\n  - N\u00C3O fa\u00E7a listas numeradas longas. Resuma em frases curtas e diretas.\n  ");
                    // 🔔 INJETAR SISTEMA DE NOTIFICAÇÃO SE CONFIGURADO
                    if ((businessConfig === null || businessConfig === void 0 ? void 0 : businessConfig.notificationEnabled) && (businessConfig === null || businessConfig === void 0 ? void 0 : businessConfig.notificationTrigger)) {
                        console.log("\uD83D\uDD14 [AI Agent] Notification system ACTIVE - Trigger: \"".concat(businessConfig.notificationTrigger.substring(0, 50), "...\""));
                        notificationSection = getNotificationPrompt(businessConfig.notificationTrigger, businessConfig.notificationManualKeywords || undefined);
                        systemPrompt += notificationSection;
                        console.log("\uD83D\uDD14 [AI Agent] Added notification system to prompt");
                    }
                    _w.label = 57;
                case 57:
                    _w.trys.push([57, 59, , 60]);
                    return [4 /*yield*/, (0, schedulingService_1.generateSchedulingPromptBlock)(userId)];
                case 58:
                    schedulingPromptBlock = _w.sent();
                    if (schedulingPromptBlock) {
                        systemPrompt += schedulingPromptBlock;
                        console.log("\uD83D\uDCC5 [AI Agent] Scheduling system ACTIVE - prompt injected");
                    }
                    return [3 /*break*/, 60];
                case 59:
                    schedError_1 = _w.sent();
                    console.error("\uD83D\uDCC5 [AI Agent] Error loading scheduling config:", schedError_1);
                    return [3 /*break*/, 60];
                case 60:
                    _w.trys.push([60, 62, , 63]);
                    return [4 /*yield*/, getProductsForAI(userId)];
                case 61:
                    productsData = _w.sent();
                    if (productsData && productsData.active && productsData.count > 0) {
                        productsPromptBlock = generateProductsPromptBlock(productsData);
                        systemPrompt += '\n\n' + productsPromptBlock;
                        console.log("\uD83D\uDCE6 [AI Agent] Products catalog ACTIVE - ".concat(productsData.count, " products injected into prompt"));
                    }
                    return [3 /*break*/, 63];
                case 62:
                    prodError_1 = _w.sent();
                    console.error("\uD83D\uDCE6 [AI Agent] Error loading products:", prodError_1);
                    return [3 /*break*/, 63];
                case 63:
                    _w.trys.push([63, 65, , 66]);
                    return [4 /*yield*/, getDeliveryMenuForAI(userId)];
                case 64:
                    deliveryData = _w.sent();
                    if (deliveryData && deliveryData.active && deliveryData.total_items > 0) {
                        deliveryPromptBlock = generateDeliveryPromptBlock(deliveryData);
                        systemPrompt += '\n\n' + deliveryPromptBlock;
                        console.log("\uD83C\uDF55 [AI Agent] Delivery menu ACTIVE - ".concat(deliveryData.total_items, " items injected into prompt"));
                    }
                    return [3 /*break*/, 66];
                case 65:
                    deliveryError_2 = _w.sent();
                    console.error("\uD83C\uDF55 [AI Agent] Error loading delivery menu:", deliveryError_2);
                    return [3 /*break*/, 66];
                case 66:
                    _w.trys.push([66, 68, , 69]);
                    return [4 /*yield*/, getCourseConfigForAI(userId)];
                case 67:
                    courseData = _w.sent();
                    if (courseData && courseData.active) {
                        coursePromptBlock = generateCoursePromptBlock(courseData);
                        systemPrompt += '\n\n' + coursePromptBlock;
                        console.log("\uD83D\uDCDA [AI Agent] Course config ACTIVE - ".concat(courseData.course_name, " injected into prompt"));
                    }
                    return [3 /*break*/, 69];
                case 68:
                    courseError_1 = _w.sent();
                    console.error("\uD83D\uDCDA [AI Agent] Error loading course config:", courseError_1);
                    return [3 /*break*/, 69];
                case 69:
                    // 🧠 ADICIONAR SISTEMA ANTI-AMNÉSIA
                    systemPrompt += memoryContextBlock;
                    // 📁 ADICIONAR BLOCO DE MÍDIAS AO PROMPT (PRIORIDADE MÁXIMA - DEVE SER O ÚLTIMO ANTES DAS MENSAGENS)
                    // Motivo: Instruções de mídia precisam estar "frescas" na memória do modelo
                    // Se ficarem no meio do prompt, são diluídas por outras regras
                    if (mediaPromptBlock) {
                        systemPrompt += '\n\n' + mediaPromptBlock;
                        console.log("\uD83D\uDCC1 [AI Agent] Added media block to prompt (".concat(mediaPromptBlock.length, " chars) - POSITIONED AT END FOR MAXIMUM PRIORITY"));
                    }
                    console.log("\uD83D\uDCDD [AI Agent] Using LEGACY prompt (".concat(systemPrompt.length, " chars) - DETERMINISTIC MODE"));
                    // ═══════════════════════════════════════════════════════════════════════
                    // 📌 SAUDAÇÃO/ENDEREÇO FIXO - PREPEND + OVERRIDE ao systemPrompt
                    // PREPEND garante que a IA lê as regras ANTES do prompt principal
                    // OVERRIDE neutraliza saudações conflitantes no prompt principal
                    // Controlado pelos toggles greetingEnabled e addressEnabled da aba Info
                    // ═══════════════════════════════════════════════════════════════════════
                    {
                        greetingParts = [];
                        safeName = (0, textUtils_1.sanitizeContactName)(contactName);
                        isGreetingEnabled = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.greetingEnabled) === true;
                        if (isGreetingEnabled && (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.customGreeting)) {
                            greeting = agentConfig.customGreeting.replace(/\{nome\}/gi, safeName || 'cliente');
                            if (agentConfig.greetingVariation) {
                                greetingParts.push("\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 SAUDA\u00C7\u00C3O PERSONALIZADA DO DONO - REGRA ABSOLUTA E INVIOL\u00C1VEL \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nREGRA PARA SUA PRIMEIRA RESPOSTA (quando n\u00E3o h\u00E1 mensagens anteriores SUAS no hist\u00F3rico):\nSua resposta INTEIRA deve ser APENAS uma varia\u00E7\u00E3o natural desta frase: \"".concat(greeting, "\"\nN\u00C3O ADICIONE ABSOLUTAMENTE NADA MAIS \u00E0 resposta. Nenhuma pergunta, nenhuma qualifica\u00E7\u00E3o, nenhuma apresenta\u00E7\u00E3o, nenhum complemento.\nA resposta COMPLETA deve ser SOMENTE a sauda\u00E7\u00E3o. Exemplo de resposta correta: \"").concat(greeting, "\"\nExemplo de resposta ERRADA: \"").concat(greeting, " Me conta: o que voc\u00EA faz hoje?\" (N\u00C3O fa\u00E7a isso)\nIGNORE COMPLETAMENTE qualquer \"Mensagem de Abertura\", \"Fluxo 1\", \"Mensagem inicial\" ou qualquer outra instru\u00E7\u00E3o de primeira mensagem que exista no prompt abaixo.\nNas mensagens SEGUINTES (quando j\u00E1 h\u00E1 respostas suas no hist\u00F3rico), N\u00C3O repita a sauda\u00E7\u00E3o e siga o fluxo normalmente."));
                            }
                            else {
                                greetingParts.push("\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 SAUDA\u00C7\u00C3O PERSONALIZADA DO DONO - REGRA ABSOLUTA E INVIOL\u00C1VEL \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nREGRA PARA SUA PRIMEIRA RESPOSTA (quando n\u00E3o h\u00E1 mensagens anteriores SUAS no hist\u00F3rico):\nSua resposta INTEIRA deve ser APENAS e EXATAMENTE: \"".concat(greeting, "\"\nN\u00C3O ADICIONE ABSOLUTAMENTE NADA MAIS \u00E0 resposta. Nenhuma pergunta, nenhuma qualifica\u00E7\u00E3o, nenhuma apresenta\u00E7\u00E3o, nenhum complemento.\nA resposta COMPLETA deve ser SOMENTE: \"").concat(greeting, "\"\nExemplo de resposta ERRADA: \"").concat(greeting, " Me conta: o que voc\u00EA faz hoje?\" (N\u00C3O fa\u00E7a isso)\nIGNORE COMPLETAMENTE qualquer \"Mensagem de Abertura\", \"Fluxo 1\", \"Mensagem inicial\" ou qualquer outra instru\u00E7\u00E3o de primeira mensagem que exista no prompt abaixo.\nNas mensagens SEGUINTES (quando j\u00E1 h\u00E1 respostas suas no hist\u00F3rico), N\u00C3O repita a sauda\u00E7\u00E3o e siga o fluxo normalmente."));
                            }
                            // 🔧 NEUTRALIZAR saudações conflitantes no prompt principal
                            // Remove/substitui seções de "mensagem inicial" e "mensagem de abertura" do prompt
                            // para que a IA não veja instruções conflitantes
                            systemPrompt = systemPrompt
                                .replace(/##\s*MENSAGEM\s+DE\s+ABERTURA\s+PADR[ÃA]O[^\n]*\n[\s\S]*?(?=\n---|\n##\s)/gi, "## MENSAGEM DE ABERTURA PADR\u00C3O\n[DESATIVADA - O dono configurou uma sauda\u00E7\u00E3o personalizada na aba Info que substitui esta se\u00E7\u00E3o]\n\n")
                                .replace(/##\s*\d+\)\s*Mensagem\s+inicial[^\n]*\n[\s\S]*?(?=\n---|\n##\s)/gi, "## Mensagem inicial\n[DESATIVADA - O dono configurou uma sauda\u00E7\u00E3o personalizada na aba Info que substitui esta se\u00E7\u00E3o]\n\n");
                            console.log("\uD83D\uDD27 [AI Agent] Sauda\u00E7\u00F5es conflitantes do prompt principal NEUTRALIZADAS");
                        }
                        isAddressEnabled = (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.addressEnabled) === true;
                        if (isAddressEnabled && (agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.customAddress)) {
                            greetingParts.push("\u26A0\uFE0F ENDERE\u00C7O FIXO DO NEG\u00D3CIO (PRIORIDADE M\u00C1XIMA - NUNCA INVENTE OUTRO):\nQuando o cliente perguntar sobre localiza\u00E7\u00E3o, endere\u00E7o, como chegar, onde fica, etc., SEMPRE responda com este endere\u00E7o EXATO: \"".concat(agentConfig.customAddress, "\"\nNUNCA invente, modifique ou use outro endere\u00E7o diferente deste. Este \u00E9 o endere\u00E7o OFICIAL do neg\u00F3cio."));
                        }
                        // Nome inválido - instrução especial
                        if (!safeName && contactName) {
                            greetingParts.push("O nome \"".concat(contactName, "\" n\u00E3o \u00E9 um nome real. Chame de \"caro cliente\" ou \"voc\u00EA\"."));
                        }
                        if (greetingParts.length > 0) {
                            greetingBlock = "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\n\u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F INSTRU\u00C7\u00D5ES DO DONO DO NEG\u00D3CIO - PRIORIDADE ABSOLUTA \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F\nAs regras abaixo T\u00CAM PRIORIDADE sobre QUALQUER instru\u00E7\u00E3o conflitante no prompt principal.\n\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\n".concat(greetingParts.join('\n\n'), "\n\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\nFIM DAS INSTRU\u00C7\u00D5ES PRIORIT\u00C1RIAS - O prompt principal come\u00E7a abaixo:\n\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\n\n");
                            systemPrompt = greetingBlock + systemPrompt;
                            console.log("\uD83D\uDCCC [AI Agent] Sauda\u00E7\u00E3o/endere\u00E7o PREPENDED ao prompt (".concat(greetingParts.length, " regras, greeting=").concat(isGreetingEnabled, ", address=").concat(isAddressEnabled, ")"));
                        }
                    }
                    messages_1 = [
                        {
                            role: "system",
                            content: systemPrompt,
                        },
                    ];
                    formattingRequest = detectFormattingRequest(conversationHistory, newMessageText);
                    if (formattingRequest.detected) {
                        formattingInstruction = generateFormattingInstruction(formattingRequest);
                        messages_1.push({
                            role: "system",
                            content: formattingInstruction,
                        });
                        console.log("\uD83C\uDFAF [AI Agent] Instru\u00E7\u00E3o de formata\u00E7\u00E3o \"".concat(formattingRequest.type, "\" injetada no prompt"));
                    }
                    // ═══════════════════════════════════════════════════════════════════════
                    // 🚨 DETECTAR PEDIDO DE LISTA/CARDÁPIO/CATEGORIAS - FORÇAR RESPOSTA COMPLETA
                    // Esta é uma mensagem de SYSTEM separada para ter MÁXIMA PRIORIDADE
                    // 📜 INSTRUÇÃO ESPECIAL QUANDO MODO HISTÓRICO ESTÁ ATIVO
                    // Ajuda a IA a entender que deve analisar o contexto completo da conversa
                    if (isHistoryModeActive && conversationHistory.length > 0) {
                        hasAgentResponded = conversationHistory.some(function (m) { return m.isFromAgent; });
                        hasOwnerMessages = conversationHistory.some(function (m) { return m.fromMe && !m.isFromAgent; });
                        clientMessagesCount = conversationHistory.filter(function (m) { return !m.fromMe; }).length;
                        hasPriorContext = hasAgentResponded || hasOwnerMessages || clientMessagesCount > 1;
                        if (hasPriorContext) {
                            historyContext = hasAgentResponded
                                ? "\n[?? CONTEXTO DE HIST?RICO ATIVO]\n\nEsta conversa tem hist?rico ativo. Voc? j? interagiu com este cliente antes.\nANALISE o hist?rico completo para manter consist?ncia e continuidade.\nN?O repita informa??es j? fornecidas. Continue de onde parou.\n"
                                : "\n[?? CONTEXTO IMPORTANTE - ASSUMINDO ATENDIMENTO]\n\nVoc? est? ASSUMINDO o atendimento de um cliente que J? CONVERSOU anteriormente.\nO hist?rico abaixo mostra todas as intera??es anteriores (possivelmente com humano).\n\nINSTRU??ES CR?TICAS:\n1. ANALISE todo o hist?rico para entender o contexto\n2. IDENTIFIQUE o que o cliente j? perguntou/comprou/quer\n3. CONTINUE a conversa de forma natural, sem repetir informa??es j? dadas\n4. N?O se apresente como se fosse a primeira vez - o cliente j? conhece a empresa\n5. Se houve algum pedido/solicita??o anterior, REFERENCIE isso naturalmente\n6. Seja CONSISTENTE com qualquer promessa ou informa??o dada anteriormente\n\nO cliente N?O SABE que voc? ? uma IA assumindo. Mantenha a continuidade!\n";
                            messages_1.push({
                                role: "system",
                                content: historyContext
                            });
                            console.log("?? [AI Agent] Instru??o de hist?rico adicionada (j? respondeu: ".concat(hasAgentResponded, ", priorContext: ").concat(hasPriorContext, ", clientMsgs: ").concat(clientMessagesCount, ")"));
                        }
                        else {
                            console.log("?? [AI Agent] Instru??o de hist?rico ignorada (sem contexto pr?vio real).");
                        }
                    }
                    RECENT_MESSAGES_COUNT = 30;
                    MAX_MESSAGES_BEFORE_SUMMARY = 40;
                    recentMessages = [];
                    historySummary = null;
                    if (isHistoryModeActive && conversationHistory.length > MAX_MESSAGES_BEFORE_SUMMARY) {
                        oldMessages = conversationHistory.slice(0, -RECENT_MESSAGES_COUNT);
                        recentMessages = conversationHistory.slice(-RECENT_MESSAGES_COUNT);
                        clientMessages = oldMessages.filter(function (m) { return !m.fromMe; }).map(function (m) { return m.text || ''; });
                        agentMessages = oldMessages.filter(function (m) { return m.fromMe; }).map(function (m) { return m.text || ''; });
                        topics = clientMessages
                            .map(function (text) { return text.substring(0, 60).replace(/[^\w\sáàãâéèêíìîóòõôúùûç]/gi, ''); })
                            .filter(function (t) { return t.length > 5; })
                            .slice(0, 10);
                        intentKeywords = {
                            preco: ['preço', 'valor', 'quanto', 'custa', 'custo'],
                            agendamento: ['agendar', 'marcar', 'horário', 'agenda', 'disponível'],
                            duvida: ['dúvida', 'pergunta', 'como', 'funciona', 'pode'],
                            problema: ['problema', 'erro', 'não funciona', 'ajuda', 'urgente'],
                            compra: ['comprar', 'adquirir', 'pedido', 'encomendar', 'quero'],
                            informacao: ['informação', 'saber', 'qual', 'onde', 'quando']
                        };
                        detectedIntents = [];
                        allClientText_1 = clientMessages.join(' ').toLowerCase();
                        for (_i = 0, _b = Object.entries(intentKeywords); _i < _b.length; _i++) {
                            _c = _b[_i], intent = _c[0], keywords = _c[1];
                            if (keywords.some(function (kw) { return allClientText_1.includes(kw); })) {
                                detectedIntents.push(intent);
                            }
                        }
                        historySummary = "\n[\uD83D\uDCDC RESUMO DO HIST\u00D3RICO ANTERIOR - ".concat(oldMessages.length, " mensagens]\n\n\uD83D\uDC64 CLIENTE j\u00E1 interagiu ").concat(clientMessages.length, "x. T\u00F3picos abordados:\n").concat(topics.length > 0 ? topics.map(function (t) { return "\u2022 ".concat(t); }).join('\n') : '• Conversas gerais', "\n\n\uD83C\uDFAF INTEN\u00C7\u00D5ES DETECTADAS: ").concat(detectedIntents.length > 0 ? detectedIntents.join(', ') : 'conversação geral', "\n\n\uD83E\uDD16 VOC\u00CA j\u00E1 respondeu ").concat(agentMessages.length, "x nesta conversa.\n\n\u26A0\uFE0F IMPORTANTE: Use este contexto para entender o relacionamento com o cliente. N\u00E3o repita informa\u00E7\u00F5es j\u00E1 dadas. Continue de onde parou.\n");
                        console.log("\uD83D\uDCDA [AI Agent] Hist\u00F3rico grande (".concat(conversationHistory.length, " msgs) - Resumindo ").concat(oldMessages.length, " antigas + ").concat(recentMessages.length, " recentes na \u00EDntegra"));
                        console.log("\uD83D\uDCDA [AI Agent] Inten\u00E7\u00F5es detectadas: ".concat(detectedIntents.join(', ') || 'nenhuma específica'));
                    }
                    else if (isHistoryModeActive) {
                        // 📋 MODO COMPLETO: Histórico pequeno - enviar tudo na íntegra
                        recentMessages = conversationHistory.slice(-100); // Limite de segurança
                        console.log("\uD83D\uDCCB [AI Agent] Hist\u00F3rico pequeno (".concat(conversationHistory.length, " msgs) - Enviando tudo na \u00EDntegra"));
                    }
                    else {
                        // 📝 MODO PADRÃO: Sem histórico ativo - comportamento original
                        recentMessages = conversationHistory.slice(-100);
                    }
                    // Adicionar resumo do histórico se existir
                    if (historySummary) {
                        messages_1.push({
                            role: "system",
                            content: historySummary
                        });
                    }
                    // 🛡️ ANTI-AMNESIA PROMPT INJECTION
                    // Adicionar instrução explícita para não se repetir se já houver histórico
                    // ATIVADO SEMPRE QUE HÁ HISTÓRICO (independente de fetchHistoryOnFirstResponse)
                    if (conversationHistory.length > 1) {
                        lastMessages = conversationHistory.slice(-4);
                        clientMessages = lastMessages.filter(function (m) { return !m.fromMe; });
                        agentMessages = lastMessages.filter(function (m) { return m.fromMe; });
                        hasAgentReplies = agentMessages.length > 0;
                        isSaudacao = /^(oi+e?|oie+|olá|ola|bom dia|boa tarde|boa noite|ei|e ai|eai|fala|tudo bem|td bem|blz|beleza)[\s\?!\.]*$/i.test((newMessageText || '').trim());
                        msgLower = (newMessageText || '').toLowerCase();
                        jaDisseOQueTrabalha = /trabalho|faço|vendo|sou|tenho|minha|empresa|loja|negócio|vendas|atendimento|clientes/i.test(msgLower);
                        jaPediuAjuda = /preciso|quero|gostaria|ajuda|ajudar|responder|automatizar|atender/i.test(msgLower);
                        jaInteragiu = agentMessages.length > 0;
                        contextSummary = hasAgentReplies
                            ? "O cliente j\u00E1 disse: ".concat(clientMessages.map(function (m) { return "\"".concat((m.text || '').substring(0, 50), "\""); }).join(', '))
                            : '';
                        antiAmnesiaPrompt = "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\u26A0\uFE0F REGRAS CR\u00CDTICAS DE CONTINUIDADE (OBRIGAT\u00D3RIO - SEMPRE SIGA)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nEsta \u00E9 uma CONVERSA EM ANDAMENTO com ".concat(conversationHistory.length, " mensagens.\n").concat(contextSummary, "\n\n\uD83D\uDEAB PROIBIDO (vai fazer voc\u00EA parecer um rob\u00F4 burro):\n   \u274C Perguntar \"o que voc\u00EA faz?\" de novo se cliente J\u00C1 RESPONDEU (inclusive na msg atual!)\n   ").concat(jaInteragiu ? '❌ Se apresentar novamente (dizer Nome, Cargo ou Empresa) - O CLIENTE JÁ TE CONHECE!' : '', "\n   ").concat(jaInteragiu ? '❌ Repetir a mesma pergunta feita anteriormente - verifique o histórico!' : '', "\n   \u274C Ignorar o contexto e recome\u00E7ar a conversa do zero\n   \u274C Dar a mesma sauda\u00E7\u00E3o inicial para um novo \"oi\" no meio da conversa\n   \u274C Escrever a palavra \"\u00C1udio\", \"Audio\", \"Imagem\", \"V\u00EDdeo\" SOLTA no texto\n   \u274C Repetir o nome do cliente mais de 1x na mesma resposta\n   \u274C Concatenar m\u00FAltiplas respostas em uma s\u00F3 (uma resposta por vez!)\n   \u274C SIMULAR O CLIENTE (Nunca escreva \"Cliente:\", \"Rodrigo:\", ou invente a resposta dele)\n   \u274C RESPONDER A SI MESMO (Nunca fa\u00E7a uma pergunta e responda na mesma mensagem)\n\n\u2705 OBRIGAT\u00D3RIO:\n   \u2705 Se cliente manda \"oi/ol\u00E1/tudo bem\" de novo \u2192 responda a sauda\u00E7\u00E3o de forma BREVE e retome o assunto (no idioma da conversa)\n   \u2705 Se cliente repete uma pergunta \u2192 responda brevemente (\"como eu disse, ...\")\n   \u2705 Se cliente responde \"sim/n\u00E3o\" \u2192 entenda o contexto da pergunta anterior\n   \u2705 Continue de onde parou naturalmente\n   \u2705 LEIA A MENSAGEM ATUAL INTEIRA - se o cliente j\u00E1 diz o que trabalha/precisa NA PR\u00D3PRIA MENSAGEM, n\u00E3o pergunte de novo!\n   \u2705 Use o nome do cliente NO M\u00C1XIMO 1 vez por mensagem\n   \u2705 Responda de forma NATURAL e CURTA (m\u00E1x 2-3 frases)\n   \u2705 PARE DE ESCREVER assim que terminar sua vez. AGUARDE o cliente.\n\n").concat(isSaudacao ? "\n\uD83C\uDFAF ATEN\u00C7\u00C3O: O cliente acabou de mandar \"".concat(newMessageText, "\" que \u00E9 uma SAUDA\u00C7\u00C3O REPETIDA.\n   INSTRU\u00C7\u00C3O: Responda a sauda\u00E7\u00E3o de forma BREVE e pergunte como ajudar, mantendo o idioma e o tom da conversa.\n   EXEMPLO (PT): \"Oi! Em que posso ajudar?\"\n   EXEMPLO (EN): \"Hi! How can I help?\"\n   \uD83D\uDEAB N\u00C3O se apresente novamente.\n   \uD83D\uDEAB N\u00C3O repita a pergunta de qualifica\u00E7\u00E3o (\"o que voc\u00EA faz?\") se j\u00E1 foi feita.\n") : '', "\n").concat(jaDisseOQueTrabalha || jaPediuAjuda ? "\n\uD83C\uDFAF ATEN\u00C7\u00C3O: A mensagem ATUAL do cliente J\u00C1 CONT\u00C9M informa\u00E7\u00F5es importantes!\n   O cliente disse: \"".concat(newMessageText.substring(0, 100), "\"\n   ").concat(jaDisseOQueTrabalha ? '→ ELE JÁ DISSE O QUE FAZ/TRABALHA - NÃO PERGUNTE DE NOVO!' : '', "\n   ").concat(jaPediuAjuda ? '→ ELE JÁ DISSE O QUE PRECISA - responda a necessidade dele!' : '', "\n") : '', "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        messages_1.push({
                            role: "system",
                            content: antiAmnesiaPrompt
                        });
                        console.log("\uD83D\uDEE1\uFE0F [AI Agent] Anti-amnesia prompt injetado (".concat(conversationHistory.length, " msgs, sauda\u00E7\u00E3o=").concat(isSaudacao, ", hasReplies=").concat(hasAgentReplies, ", jaDisseNegocio=").concat(jaDisseOQueTrabalha, ")"));
                    }
                    uniqueMessages = [];
                    for (i = 0; i < recentMessages.length; i++) {
                        current = recentMessages[i];
                        prev = uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1] : null;
                        // Se for mensagem do mesmo autor com mesmo texto da anterior, ignora (spam)
                        if (prev && prev.fromMe === current.fromMe && prev.text === current.text) {
                            console.log("\u26A0\uFE0F [AI Agent] Mensagem duplicada ADJACENTE removida: ".concat((current.text || '').substring(0, 30), "..."));
                            continue;
                        }
                        uniqueMessages.push(current);
                    }
                    console.log("\uD83D\uDCCB [AI Agent] Enviando ".concat(uniqueMessages.length, " mensagens de contexto (").concat(recentMessages.length - uniqueMessages.length, " duplicatas removidas):"));
                    _loop_2 = function (i) {
                        var msg = uniqueMessages[i];
                        // 🛡️ CORREÇÃO CRÍTICA: Distinguir mensagens do AGENTE vs mensagens do DONO
                        // - isFromAgent=true → A IA enviou esta mensagem → role="assistant"
                        // - fromMe=true, isFromAgent=false → O DONO enviou manualmente → NÃO é assistant!
                        // - fromMe=false → Cliente enviou → role="user"
                        // 
                        // BUG ANTERIOR: Mensagens manuais do dono (ex: vendendo AgenteZap) eram tratadas como
                        // "assistant", fazendo a IA ALUCINAR e continuar o assunto errado!
                        var role = void 0;
                        if (msg.isFromAgent === true) {
                            // A IA realmente enviou esta mensagem
                            role = "assistant";
                        }
                        else if (msg.fromMe === true && msg.isFromAgent === false) {
                            // O DONO enviou manualmente - NÃO INCLUIR como assistant!
                            // Opção 1: Pular completamente (dono pode falar coisas fora do escopo)
                            // Opção 2: Incluir como contexto de "sistema" (menos confuso para IA)
                            // Vamos pular para evitar que IA copie mensagens do dono
                            console.log("   ".concat(i + 1, ". [DONO] ").concat((msg.text || "").substring(0, 50), "... (IGNORADA - msg manual do dono)"));
                            return "continue";
                        }
                        else {
                            // Cliente enviou
                            role = "user";
                        }
                        var isLastMessage = i === uniqueMessages.length - 1;
                        // Se última mensagem do histórico for do user com mesmo texto que newMessageText, pular (evitar duplicação)
                        if (isLastMessage && !msg.fromMe && msg.text === newMessageText) {
                            console.log("   ".concat(i + 1, ". [").concat(role, "] ").concat((msg.text || "").substring(0, 50), "... (PULADA - duplicata da nova mensagem)"));
                            return "continue";
                        }
                        var preview = (msg.text || "").substring(0, 50);
                        console.log("   ".concat(i + 1, ". [").concat(role, "] ").concat(preview, "..."));
                        // 🛡️ FIX: Mistral API rejects empty content. Ensure content is never empty.
                        var content_1 = msg.text || "";
                        if (!content_1.trim()) {
                            if (msg.mediaType) {
                                content_1 = "[Arquivo de ".concat(msg.mediaType, "]");
                            }
                            else {
                                content_1 = "[Mensagem vazia]";
                            }
                        }
                        // 🛡️ FIX: Limpar TODOS os marcadores internos de mídia que não devem aparecer no contexto da IA
                        // Isso evita que a IA "aprenda" a repetir esses textos problemáticos
                        // 1. Limpar padrões de mídia sincronizada do WhatsApp (🎤 Áudio, 🎵 Áudio, 📷 Imagem, etc.)
                        // CRÍTICO: Esses textos são salvos quando mídias são sincronizadas do WhatsApp
                        // 🎤 FIX 2025: Adicionar TODOS os padrões encontrados no banco de dados
                        var audioPatterns = [
                            '🎤 Áudio', '🎤 Audio', '🎤Áudio', '🎤Audio',
                            '🎵 Áudio', '🎵 Audio', '🎵Áudio', '🎵Audio', // 🎵 é usado também pelo WhatsApp!
                            '[Áudio recebido]', '[Audio recebido]',
                            '[Áudio enviado]', '[Audio enviado]',
                            '*Áudio*', '*Audio*',
                            'Áudio', 'Audio' // Fallback para casos simples
                        ];
                        // Verificar se a mensagem é APENAS um marcador de áudio (sem transcrição)
                        var trimmedContent = content_1.trim();
                        var isAudioMarker = audioPatterns.some(function (pattern) {
                            return trimmedContent === pattern ||
                                trimmedContent.toLowerCase() === pattern.toLowerCase();
                        });
                        if (isAudioMarker) {
                            // Se a mensagem é APENAS o marcador de áudio, indicar que foi mensagem de voz
                            // MAS instruir a IA a pedir que repita de forma educada (não dizer que não entende)
                            content_1 = '(o cliente enviou uma mensagem de voz que não pôde ser transcrita - peça educadamente que ele repita ou envie por texto)';
                        }
                        else if (/^[🎤🎵]\s*[ÁáAa]udio\s+/i.test(content_1)) {
                            // PROBLEMA CRÍTICO: A IA está gerando texto que começa com "🎤 Áudio" ou "🎵 Áudio"
                            // Remover esse prefixo para evitar que a IA aprenda este padrão
                            content_1 = content_1.replace(/^[🎤🎵]\s*[ÁáAa]udio\s*/i, '');
                        }
                        // 🖼️ TRATAMENTO DE IMAGENS ANALISADAS
                        // Se a imagem foi analisada pelo Vision, manter a descrição para a IA entender
                        if (content_1.includes('[IMAGEM ANALISADA:')) {
                            // Manter o conteúdo da análise - a IA precisa saber o que tem na imagem!
                            // IMPORTANTE: Deixar MUITO claro que o conteúdo veio do cliente, não do negócio do agente
                            var match = content_1.match(/\[IMAGEM ANALISADA:\s*(.*?)\]/s);
                            if (match && match[1]) {
                                content_1 = "(O cliente enviou uma imagem com o seguinte conte\u00FAdo: \"".concat(match[1].trim(), "\" \u2014 Este conte\u00FAdo foi enviado PELO CLIENTE e N\u00C3O representa os produtos, servi\u00E7os ou \u00E1rea de atua\u00E7\u00E3o do seu neg\u00F3cio. Responda no contexto do SEU neg\u00F3cio habitual.)");
                            }
                        }
                        else if (content_1 === '📷 Imagem' || content_1 === '🖼️ Imagem' || content_1 === '*Imagem*') {
                            // Imagem não foi analisada (fallback)
                            content_1 = '(cliente enviou uma imagem que não pôde ser analisada - pergunte educadamente sobre o que se trata)';
                        }
                        if (content_1 === '🎥 Vídeo' || content_1 === '🎬 Vídeo') {
                            content_1 = '(vídeo enviado)';
                        }
                        if (content_1 === '📄 Documento' || content_1 === '📎 Documento') {
                            content_1 = '(documento enviado)';
                        }
                        // 2. Limpar padrões internos de mídia enviada pelo agente
                        // CRÍTICO: Remover completamente este texto para não confundir a IA
                        if (content_1.includes('[ÁUDIO ENVIADO PELO AGENTE]')) {
                            content_1 = content_1.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]:[^]*/gi, '');
                            content_1 = content_1.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]/gi, '');
                        }
                        // Limpar formato antigo [Áudio enviado: ...] - IA estava copiando isso na resposta
                        if (content_1.includes('[Áudio enviado:')) {
                            content_1 = content_1.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[Imagem enviada:')) {
                            content_1 = content_1.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[Vídeo enviado:')) {
                            content_1 = content_1.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[Documento enviado:')) {
                            content_1 = content_1.replace(/\[Documento enviado:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[IMAGEM ENVIADA:')) {
                            content_1 = content_1.replace(/\[IMAGEM ENVIADA:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[VÍDEO ENVIADO:')) {
                            content_1 = content_1.replace(/\[VÍDEO ENVIADO:[^\]]*\]/gi, '');
                        }
                        if (content_1.includes('[DOCUMENTO ENVIADO:')) {
                            content_1 = content_1.replace(/\[DOCUMENTO ENVIADO:[^\]]*\]/gi, '');
                        }
                        // 🛡️ LIMPEZA EXTRA: Remover qualquer menção a "Áudio" ou "Audio" isolada
                        content_1 = content_1.replace(/\*[ÁáAa]udio\*/gi, '');
                        content_1 = content_1.replace(/\[[ÁáAa]udio[^\]]*\]/gi, '');
                        content_1 = content_1.replace(/\s+[ÁáAa]udio\s+/gi, ' ');
                        // 3. Limpar qualquer texto vazio resultante
                        content_1 = content_1.trim();
                        if (!content_1) {
                            // Se após limpar ficou vazio, marcar que foi mídia (sem usar a palavra Áudio/Audio)
                            if (msg.mediaType) {
                                content_1 = msg.mediaType === 'audio' ? '(mensagem de voz)' :
                                    msg.mediaType === 'image' ? '(imagem)' :
                                        msg.mediaType === 'video' ? '(vídeo)' : '(arquivo)';
                            }
                            else {
                                content_1 = '(mensagem de mídia)';
                            }
                        }
                        messages_1.push({
                            role: role,
                            content: content_1,
                        });
                    };
                    // Adicionar mensagens do histórico (exceto a última se for do user com mesmo texto que newMessageText)
                    for (i = 0; i < uniqueMessages.length; i++) {
                        _loop_2(i);
                    }
                    // ✅ SEMPRE adicionar a nova mensagem do user como última (Mistral exige que última seja user)
                    console.log("   ".concat(uniqueMessages.length + 1, ". [user] ").concat(newMessageText.substring(0, 50), "... (NOVA MENSAGEM)"));
                    finalUserMessage = newMessageText.trim() || "[Mensagem vazia]";
                    isSaudacaoSimples = /^(oi+e?|oie+|olá|ola|bom dia|boa tarde|boa noite|ei|e ai|eai|fala|tudo bem|td bem|blz|beleza|hey|hello|hi)[\s\?!\.]*$/i.test(finalUserMessage);
                    hasAgentRepliesInHistory = uniqueMessages.some(function (m) { return m.fromMe; });
                    if (isSaudacaoSimples && hasAgentRepliesInHistory && uniqueMessages.length >= 2) {
                        console.log("\uD83D\uDEE1\uFE0F [AI Agent] SAUDA\u00C7\u00C3O REPETIDA DETECTADA! For\u00E7ando instru\u00E7\u00E3o anti-repeti\u00E7\u00E3o na mensagem.");
                        lastAgentMsg = __spreadArray([], uniqueMessages, true).reverse().find(function (m) { return m.fromMe; });
                        lastAgentText = ((_l = lastAgentMsg === null || lastAgentMsg === void 0 ? void 0 : lastAgentMsg.text) === null || _l === void 0 ? void 0 : _l.substring(0, 80)) || '';
                        // Adicionar instrução JUNTO com a mensagem do usuário
                        finalUserMessage = "[INSTRU\u00C7\u00C3O CR\u00CDTICA PARA O ASSISTENTE: O cliente mandou \"".concat(finalUserMessage, "\" de novo. Esta \u00E9 uma SAUDA\u00C7\u00C3O REPETIDA em uma conversa j\u00E1 iniciada. Sua \u00FAltima resposta foi: \"").concat(lastAgentText, "...\". N\u00C3O se apresente novamente. N\u00C3O pergunte o que ele faz de novo. Responda apenas uma sauda\u00E7\u00E3o curta e pergunte como ajudar (no idioma da conversa).]\n\nMensagem do cliente: ").concat(newMessageText.trim());
                    }
                    listPhrases = ['o que tem', 'que tem', 'o que vem', 'quais são', 'quais sao', 'lista', 'cardápio', 'cardapio', 'categorias', 'produtos', 'tudo que tem', 'todas', 'todos', 'completo', 'completa', 'inteiro', 'inteira', 'pack', 'superpack'];
                    isAskingForListInMessage = listPhrases.some(function (kw) { return newMessageText.toLowerCase().includes(kw); });
                    if (isAskingForListInMessage) {
                        console.log("\uD83D\uDCCB [AI Agent] PEDIDO DE LISTA DETECTADO! Extraindo lista do prompt...");
                        promptToSearch = systemPrompt || agentConfig.prompt || '';
                        numberedListRegex = /(?:^|\n)((?:\d{1,3}\.\s*[^\n]+(?:\n|$)){10,})/;
                        listMatch = promptToSearch.match(numberedListRegex);
                        if (listMatch) {
                            extractedList = listMatch[1].trim();
                            itemCount = (extractedList.match(/^\d{1,3}\./gm) || []).length;
                            console.log("\uD83D\uDCCB [AI Agent] \u2705 LISTA EXTRA\u00CDDA: ".concat(itemCount, " itens (").concat(extractedList.length, " chars)"));
                            // 🚀 TÉCNICA VENCEDORA: Injetar lista na user message (testado - 100% sucesso)
                            finalUserMessage = "O cliente perguntou: \"".concat(newMessageText.trim(), "\"\n\nCopie esta lista COMPLETA (").concat(itemCount, " itens):\n\n").concat(extractedList);
                        }
                        else {
                            console.log("\uD83D\uDCCB [AI Agent] \u26A0\uFE0F Nenhuma lista numerada detectada no prompt");
                            // Fallback: instrução genérica
                            finalUserMessage = "[INSTRU\u00C7\u00C3O: O cliente est\u00E1 pedindo lista/card\u00E1pio. Envie a lista COMPLETA do seu conhecimento, item por item, sem cortar nada]\n\nCliente: ".concat(newMessageText.trim());
                        }
                    }
                    messages_1.push({
                        role: "user",
                        content: finalUserMessage,
                    });
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 70:
                    llmClient_1 = _w.sent();
                    return [4 /*yield*/, (0, llm_1.getCurrentProvider)()];
                case 71:
                    currentProvider = _w.sent();
                    questionLength = newMessageText.length;
                    listKeywords = ['lista', 'cardápio', 'cardapio', 'categorias', 'produtos', 'o que tem', 'que tem', 'o que vem', 'que vem', 'tudo que tem', 'quais são', 'quais sao', 'todas', 'todos', 'completo', 'completa', 'inteiro', 'inteira', 'pack', 'superpack'];
                    isAskingForList = listKeywords.some(function (kw) { return newMessageText.toLowerCase().includes(kw); });
                    baseMaxTokens = isAskingForList ? 8000 : (questionLength < 20 ? 500 : questionLength < 50 ? 600 : 800);
                    if (isAskingForList) {
                        console.log("\uD83D\uDCCB [AI Agent] Detectado pedido de LISTA - usando maxTokens aumentado: ".concat(baseMaxTokens));
                    }
                    configMaxTokens = useAdvancedSystem && (businessConfig === null || businessConfig === void 0 ? void 0 : businessConfig.maxResponseLength)
                        ? Math.ceil(businessConfig.maxResponseLength / 3) // aprox 3 chars por token
                        : baseMaxTokens;
                    maxTokens_1 = Math.max(configMaxTokens, baseMaxTokens);
                    console.log("\uD83C\uDFAF [AI Agent] Pergunta: ".concat(questionLength, " chars \u2192 maxTokens: ").concat(maxTokens_1, " (SEM LIMITE - divis\u00E3o em partes \u00E9 depois)"));
                    model_1 = currentProvider === 'groq'
                        ? undefined // Deixar o LLM client usar o modelo configurado
                        : (useAdvancedSystem && (businessConfig === null || businessConfig === void 0 ? void 0 : businessConfig.model)
                            ? businessConfig.model
                            : agentConfig.model);
                    promptHash = crypto_1.default.createHash('md5')
                        .update(((agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.prompt) || '').substring(0, 500))
                        .digest('hex')
                        .substring(0, 8);
                    // ⚠️ CACHE DESATIVADO TEMPORARIAMENTE
                    // Motivo: O cache estava causando problemas porque a resposta precisa considerar
                    // o contexto da conversa (histórico), não apenas a mensagem atual.
                    // Uma mesma mensagem "oi" pode ter respostas diferentes dependendo do histórico.
                    // TODO: Implementar cache mais inteligente que considere o contexto
                    /*
                    // Verificar se temos resposta cacheada para esta pergunta
                    const cachedResponse = getCachedResponse(userId, newMessageText, promptHash);
                    if (cachedResponse) {
                      console.log(`✅ [CACHE HIT] Usando resposta cacheada para evitar variação do Mistral`);
                      // Retornar resposta cacheada diretamente (pular chamada do Mistral)
                      const processedCached = processResponsePlaceholders(cachedResponse, contactName, contactPhone);
                      return {
                        text: processedCached,
                        mediaActions: [],
                        notification: undefined,
                      };
                    }
                    */
                    // 🔄 CHAMADA COM RETRY AUTOMÁTICO PARA ERROS DE API (rate limit, timeout, etc)
                    // 🎯 TEMPERATURE 0.0 + SEED FIXO: Respostas 100% DETERMINÍSTICAS
                    // REMOVIDA VARIAÇÃO: Usuário solicitou remover variação do simulador e WhatsApp debug
                    // randomSeed: Garante que mesma pergunta = mesma resposta SEMPRE
                    // NOTA: O modelo real é definido em llm.ts usando config.openrouterModel do system_config
                    console.log("\uD83D\uDD27 [AI-CONFIG] DETERMINISM: provider=".concat(currentProvider, ", temperature=0.0, randomSeed=42, model=from-system-config (llm.ts usa openrouterModel)"));
                    return [4 /*yield*/, withRetry(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, llmClient_1.chat.complete({
                                            model: model_1,
                                            messages: messages_1,
                                            maxTokens: maxTokens_1, // Dinâmico baseado na pergunta e config
                                            temperature: 0.0, // ZERO: Resposta determinística
                                            randomSeed: 42, // SEED FIXO: Garante determinismo absoluto
                                        })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); }, 1, // 1 tentativa (era 3 - causava retry storm multiplicando chamadas)
                        1500, // Delay inicial de 1.5s
                        "LLM API (".concat(currentProvider, ")"))];
                case 72:
                    chatResponse = _w.sent();
                    content = (_p = (_o = (_m = chatResponse.choices) === null || _m === void 0 ? void 0 : _m[0]) === null || _o === void 0 ? void 0 : _o.message) === null || _p === void 0 ? void 0 : _p.content;
                    responseText = typeof content === 'string' ? content : null;
                    notification = void 0;
                    finishReason = ((_r = (_q = chatResponse.choices) === null || _q === void 0 ? void 0 : _q[0]) === null || _r === void 0 ? void 0 : _r.finishReason) || ((_t = (_s = chatResponse.choices) === null || _s === void 0 ? void 0 : _s[0]) === null || _t === void 0 ? void 0 : _t.finish_reason);
                    if (responseText && finishReason === 'length') {
                        console.log("\u26A0\uFE0F [AI Agent] Resposta TRUNCADA detectada (finish_reason=length)! maxTokens=".concat(maxTokens_1, ", chars=").concat(responseText.length));
                        lastLine = responseText.trim().split('\n').pop() || '';
                        isMidList = /^\d{1,3}\.?\s*$/.test(lastLine.trim());
                        isMidSentence = !/[.!?:)\]"…]$/.test(responseText.trim());
                        if (isMidList || isMidSentence) {
                            console.log("\u26A0\uFE0F [AI Agent] Resposta cortada no meio de ".concat(isMidList ? 'lista' : 'frase', ". Removendo parte incompleta..."));
                            lines = responseText.trim().split('\n');
                            if (isMidList && lines.length > 1) {
                                // Remover última linha da lista que está incompleta (ex: "3." sem conteúdo)
                                lines.pop();
                                responseText = lines.join('\n');
                            }
                            else if (isMidSentence && !isMidList) {
                                lastPunctuation = responseText.search(/[.!?][^.!?]*$/);
                                if (lastPunctuation > responseText.length * 0.5) {
                                    // Só cortar se o ponto está na segunda metade (não perder muito conteúdo)
                                    responseText = responseText.substring(0, lastPunctuation + 1);
                                }
                            }
                            console.log("\u2702\uFE0F [AI Agent] Resposta ajustada: ".concat(responseText.length, " chars"));
                        }
                    }
                    // ═══════════════════════════════════════════════════════════════════════
                    // 🧠 FILOSOFIA: DEIXAR A IA PROCESSAR NATURALMENTE
                    // A IA lê o prompt do cliente e gera a resposta seguindo as instruções.
                    // NÃO FAZEMOS tratamento especial - a IA é inteligente o suficiente.
                    // ═══════════════════════════════════════════════════════════════════════
                    if (responseText) {
                        paragraphs = responseText.split('\n\n');
                        halfLength = Math.floor(paragraphs.length / 2);
                        if (paragraphs.length > 2 && paragraphs.length % 2 === 0) {
                            firstHalf = paragraphs.slice(0, halfLength).join('\n\n');
                            secondHalf = paragraphs.slice(halfLength).join('\n\n');
                            if (firstHalf === secondHalf) {
                                console.log("\u26A0\uFE0F [AI Agent] Resposta duplicada detectada do Mistral, usando apenas primeira metade");
                                console.log("   Original length: ".concat(responseText.length, " chars"));
                                responseText = firstHalf;
                                console.log("   Fixed length: ".concat(responseText.length, " chars"));
                            }
                        }
                        // 📝 FIX: Converter formatação Markdown para WhatsApp
                        // WhatsApp: *negrito* _itálico_ ~tachado~ ```mono```
                        // Markdown:  **negrito** *itálico* ~~tachado~~ `mono`
                        responseText = convertMarkdownToWhatsApp(responseText);
                        // 🔔 NOTIFICATION SYSTEM: Check for [NOTIFY: ...] tag
                        console.log("\uD83D\uDD14 [AI Agent] Checking for NOTIFY tag in response...");
                        console.log("   Response snippet (last 100 chars): \"".concat(responseText.slice(-100), "\""));
                        notifyMatch = responseText.match(/\[NOTIFY: (.*?)\]/);
                        if (notifyMatch) {
                            notification = {
                                shouldNotify: true,
                                reason: notifyMatch[1].trim()
                            };
                            // Remove tag from response
                            responseText = responseText.replace(/\[NOTIFY: .*?\]/g, '').trim();
                            console.log("\uD83D\uDD14 [AI Agent] \u2705 Notification trigger detected: ".concat(notification.reason));
                        }
                        else {
                            console.log("\uD83D\uDD14 [AI Agent] \u274C No NOTIFY tag found in response");
                        }
                        // 🛡️ SEGURANÇA: Remover qualquer vazamento de texto de notificação que a IA possa ter gerado
                        // Isso evita que a IA "invente" notificações no formato errado
                        if (responseText.includes('🔔 NOTIFICAÇÃO') || responseText.includes('NOTIFICAÇÃO DO AGENTE')) {
                            console.log("\u26A0\uFE0F [AI Agent] Detectado vazamento de template de notifica\u00E7\u00E3o! Limpando...");
                            // Remover bloco de notificação que pode ter vazado
                            responseText = responseText.replace(/🔔\s*\*?NOTIFICAÇÃO[^]*?(Cliente:|Última mensagem:)[^"]*"[^"]*"/gi, '').trim();
                            responseText = responseText.replace(/🔔[^]*?Motivo:[^\n]*/gi, '').trim();
                        }
                        // �️ FIX: Remover "[Mensagem vazia]" que pode aparecer quando histórico tinha mídia sem texto
                        if (responseText.includes('[Mensagem vazia]')) {
                            responseText = responseText.replace(/\[Mensagem vazia\]\s*/g, '').trim();
                            console.log("\u26A0\uFE0F [AI Agent] Removido \"[Mensagem vazia]\" da resposta");
                        }
                        // �🚨 POST-PROCESSING: Detectar e limpar possíveis vazamentos de instruções do prompt
                        // CUIDADO: Não truncar agressivamente - apenas limpar padrões específicos problemáticos
                        // 🆕 FIX: Remover instruções técnicas que vazam na resposta da IA
                        // Padrões como "Use exatamente o texto abaixo..." são instruções, não respostas
                        responseText = cleanInstructionLeaks(responseText);
                        hasPromptLeak = false;
                        if (hasPromptLeak) {
                            console.log("\u26A0\uFE0F [AI Agent] Detectado vazamento de prompt! Limpando...");
                            originalLength = responseText.length;
                            sentences = responseText.split(/\.\s+/);
                            cleanedResponse = '';
                            for (_d = 0, sentences_1 = sentences; _d < sentences_1.length; _d++) {
                                sentence = sentences_1[_d];
                                // Parar se encontrar texto que parece instrução
                                if (sentence.includes('online/cadastro') ||
                                    sentence.includes('Depois de logado') ||
                                    sentence.includes('clica em Ilimitado') ||
                                    sentence.includes('no menu do lado esquerdo')) {
                                    break;
                                }
                                cleanedResponse += sentence + '. ';
                            }
                            // Se conseguiu extrair algo válido, usar
                            if (cleanedResponse.trim().length > 50) {
                                responseText = cleanedResponse.trim();
                                console.log("\u2702\uFE0F [AI Agent] Resposta limpa de ".concat(originalLength, " para ").concat(responseText.length, " chars"));
                            }
                        }
                        // 🛡️ VALIDAÇÃO DE RESPOSTA (apenas no sistema avançado)
                        if (useAdvancedSystem && businessConfig) {
                            validation = (0, agentValidation_1.validateAgentResponse)(responseText, businessConfig);
                            if (!validation.isValid) {
                                console.log("\u26A0\uFE0F [AI Agent] Response validation FAILED:");
                                console.log("   Maintains identity: ".concat(validation.maintainsIdentity));
                                console.log("   Stays in scope: ".concat(validation.staysInScope));
                                console.log("   Issues: ".concat(validation.issues.join(', ')));
                                // Se violou identidade, rejeitar resposta e retornar fallback
                                if (!validation.maintainsIdentity) {
                                    console.log("\uD83D\uDEA8 [AI Agent] CRITICAL: Response breaks identity! Using fallback.");
                                    return [2 /*return*/, {
                                            text: "Desculpe, tive um problema ao processar sua mensagem. Sou ".concat(businessConfig.agentName, " da ").concat(businessConfig.companyName, ". Como posso te ajudar com ").concat(((_u = businessConfig.allowedTopics) === null || _u === void 0 ? void 0 : _u[0]) || "nossos serviços", "?"),
                                            mediaActions: [],
                                        }];
                                }
                                // Se saiu do escopo mas mantém identidade, apenas logar
                                if (!validation.staysInScope) {
                                    console.log("\u26A0\uFE0F [AI Agent] WARNING: Response may be out of scope. Proceeding anyway.");
                                }
                            }
                            else {
                                console.log("\u2705 [AI Agent] Response validation PASSED");
                            }
                            // ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
                            // A IA já gera respostas naturais no prompt, não precisa de pós-processamento
                            // que adiciona saudações/emojis indesejados
                            // 
                            // Código removido:
                            // - detectEmotion() / adjustToneForEmotion()
                            // - humanizeResponse() com saudações/conectores/emojis
                            //
                            // A resposta da Mistral agora é usada EXATAMENTE como gerada
                            console.log("\u2705 [AI Agent] Usando resposta original da IA (sem humaniza\u00E7\u00E3o extra)");
                        }
                        console.log("\u2705 [AI Agent] Resposta gerada: ".concat(responseText.substring(0, 100), "..."));
                    }
                    if (!(responseText && responseText.includes('[ENVIAR_CARDAPIO_COMPLETO]'))) return [3 /*break*/, 74];
                    console.log("\uD83C\uDF55 [AI Agent] Tag [ENVIAR_CARDAPIO_COMPLETO] detectada! Buscando card\u00E1pio para userId=".concat(userId, "..."));
                    return [4 /*yield*/, getDeliveryMenuForAI(userId)];
                case 73:
                    deliveryMenu = _w.sent();
                    console.log("\uD83C\uDF55 [AI Agent] DEBUG getDeliveryMenuForAI retornou: ".concat(deliveryMenu ? "active=".concat(deliveryMenu.active, ", items=").concat(deliveryMenu.total_items) : 'NULL'));
                    displayInstructions_1 = (deliveryMenu === null || deliveryMenu === void 0 ? void 0 : deliveryMenu.displayInstructions) || '';
                    askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
                    shouldAskFirst = askFirstKeywords.some(function (kw) { return displayInstructions_1.toLowerCase().includes(kw); });
                    if (shouldAskFirst && deliveryMenu && deliveryMenu.active) {
                        console.log("\uD83C\uDF55 [AI Agent] \u26A0\uFE0F MODO PERGUNTAR PRIMEIRO ATIVO! Bloqueando envio do card\u00E1pio completo...");
                        console.log("\uD83C\uDF55 [AI Agent] displayInstructions: \"".concat(displayInstructions_1.substring(0, 100), "...\""));
                        categoryList = deliveryMenu.categories
                            .filter(function (c) { return c.items && c.items.length > 0; })
                            .map(function (c) { return c.name; })
                            .join(', ');
                        perguntaCategoria = "Temos: ".concat(categoryList, ". Qual voc\u00EA quer ver? \uD83D\uDE0A");
                        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, perguntaCategoria);
                        console.log("\uD83C\uDF55 [AI Agent] \u2705 Tag substitu\u00EDda pela pergunta de categoria: \"".concat(perguntaCategoria, "\""));
                    }
                    else if (deliveryMenu && deliveryMenu.active) {
                        console.log("\uD83C\uDF55 [AI Agent] Card\u00E1pio obtido: ".concat(deliveryMenu.total_items, " itens, ").concat(deliveryMenu.categories.length, " categorias"));
                        deliveryMenu.categories.forEach(function (cat) {
                            console.log("   - ".concat(cat.name, ": ").concat(cat.items.length, " itens"));
                        });
                        formattedMenu = formatMenuForCustomer(deliveryMenu);
                        console.log("\uD83C\uDF55 [AI Agent] DEBUG formattedMenu length=".concat(formattedMenu.length));
                        // Substituir a tag pelo cardápio formatado
                        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
                        console.log("\uD83C\uDF55 [AI Agent] \u2705 Card\u00E1pio formatado inserido (".concat(formattedMenu.length, " chars)"));
                        console.log("\uD83C\uDF55 [AI Agent] Preview: ".concat(formattedMenu.substring(0, 200), "..."));
                    }
                    else {
                        // Se não tem cardápio ativo, remover a tag e deixar a mensagem da IA
                        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, '');
                        console.log("\u26A0\uFE0F [AI Agent] Card\u00E1pio n\u00E3o dispon\u00EDvel - tag removida. deliveryMenu=".concat((_v = JSON.stringify(deliveryMenu)) === null || _v === void 0 ? void 0 : _v.substring(0, 200)));
                    }
                    return [3 /*break*/, 76];
                case 74:
                    console.log("\u26A0\uFE0F [AI Agent] TAG N\u00C3O DETECTADA! Response: ".concat(responseText === null || responseText === void 0 ? void 0 : responseText.substring(0, 300)));
                    perguntaPediuCardapio = /cardápio|cardapio|menu|o que tem|oque tem|quais produto|quais os produto|me manda o menu|mostra o menu|ver o cardápio|ver cardápio/i.test(newMessageText || '');
                    respostaTemPrecos = /R\$\s*\d+|reais|\d+,\d{2}/i.test(responseText || '');
                    if (!(perguntaPediuCardapio && respostaTemPrecos)) return [3 /*break*/, 76];
                    console.log("\uD83D\uDEE1\uFE0F [AI Agent] FALLBACK: Cliente pediu card\u00E1pio mas IA listou pre\u00E7os manualmente! Verificando displayInstructions...");
                    return [4 /*yield*/, getDeliveryMenuForAI(userId)];
                case 75:
                    deliveryMenu = _w.sent();
                    displayInstructions_2 = (deliveryMenu === null || deliveryMenu === void 0 ? void 0 : deliveryMenu.displayInstructions) || '';
                    askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
                    shouldAskFirst = askFirstKeywords.some(function (kw) { return displayInstructions_2.toLowerCase().includes(kw); });
                    if (shouldAskFirst) {
                        console.log("\uD83D\uDEE1\uFE0F [AI Agent] \u26A0\uFE0F FALLBACK BLOQUEADO - Modo \"perguntar primeiro\" ativo!");
                    }
                    else if (deliveryMenu && deliveryMenu.active && deliveryMenu.total_items > 0) {
                        formattedMenu = formatMenuForCustomer(deliveryMenu);
                        // Substituir a resposta inteira pelo cardápio formatado + mensagem amigável
                        responseText = "".concat(formattedMenu, "\n\nAqui est\u00E1 nosso card\u00E1pio completo! \uD83D\uDE0A Quer fazer um pedido?");
                        console.log("\uD83D\uDEE1\uFE0F [AI Agent] \u2705 FALLBACK aplicado - card\u00E1pio completo injetado (".concat(formattedMenu.length, " chars)"));
                    }
                    _w.label = 76;
                case 76:
                    categoryTagRegex = /\[ENVIAR_CATEGORIA:\s*([^\]]+)\]/gi;
                    categoryMatch = void 0;
                    _loop_3 = function () {
                        var fullTag, categoryName, deliveryMenu, normalizedSearch_1, matchingCategory, formatPrice, categoryText, _x, _y, item, priceText;
                        return __generator(this, function (_z) {
                            switch (_z.label) {
                                case 0:
                                    fullTag = categoryMatch[0], categoryName = categoryMatch[1];
                                    console.log("\uD83D\uDCC1 [AI Agent] Tag [ENVIAR_CATEGORIA: ".concat(categoryName, "] detectada!"));
                                    return [4 /*yield*/, getDeliveryMenuForAI(userId)];
                                case 1:
                                    deliveryMenu = _z.sent();
                                    if (deliveryMenu && deliveryMenu.active) {
                                        normalizedSearch_1 = categoryName.toLowerCase().trim();
                                        matchingCategory = deliveryMenu.categories.find(function (cat) {
                                            return cat.name.toLowerCase().includes(normalizedSearch_1) ||
                                                normalizedSearch_1.includes(cat.name.toLowerCase().replace(/[🍕🍫🥟🍹🧀]/g, '').trim());
                                        });
                                        if (matchingCategory && matchingCategory.items.length > 0) {
                                            console.log("\uD83D\uDCC1 [AI Agent] Categoria encontrada: ".concat(matchingCategory.name, " com ").concat(matchingCategory.items.length, " itens"));
                                            formatPrice = function (price) {
                                                if (!price)
                                                    return 'Consultar';
                                                var num = parseFloat(price);
                                                if (isNaN(num))
                                                    return price;
                                                return "R$ ".concat(num.toFixed(2).replace('.', ','));
                                            };
                                            categoryText = "*".concat(matchingCategory.name, "*\n");
                                            for (_x = 0, _y = matchingCategory.items; _x < _y.length; _x++) {
                                                item = _y[_x];
                                                priceText = item.promotional_price
                                                    ? "~".concat(formatPrice(item.price), "~ *").concat(formatPrice(item.promotional_price), "*")
                                                    : formatPrice(item.price);
                                                categoryText += "\u2022 ".concat(item.name, " - ").concat(priceText, "\n");
                                                if (item.description) {
                                                    categoryText += "  _".concat(item.description, "_\n");
                                                }
                                            }
                                            responseText = responseText.replace(fullTag, categoryText);
                                            console.log("\uD83D\uDCC1 [AI Agent] \u2705 Categoria \"".concat(matchingCategory.name, "\" inserida (").concat(categoryText.length, " chars)"));
                                        }
                                        else {
                                            console.log("\u26A0\uFE0F [AI Agent] Categoria \"".concat(categoryName, "\" n\u00E3o encontrada"));
                                            responseText = responseText.replace(fullTag, "(Categoria \"".concat(categoryName, "\" n\u00E3o encontrada)"));
                                        }
                                    }
                                    else {
                                        responseText = responseText.replace(fullTag, '');
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _w.label = 77;
                case 77:
                    if (!((categoryMatch = categoryTagRegex.exec(responseText || '')) !== null)) return [3 /*break*/, 79];
                    return [5 /*yield**/, _loop_3()];
                case 78:
                    _w.sent();
                    return [3 /*break*/, 77];
                case 79:
                    mediaActions = [];
                    if (responseText) {
                        parsedResponse = (0, mediaService_1.parseMistralResponse)(responseText);
                        if (parsedResponse) {
                            // Extrair ações de mídia detectadas pelas tags
                            mediaActions = parsedResponse.actions || [];
                            // Usar o texto limpo (sem as tags de mídia)
                            if (parsedResponse.messages && parsedResponse.messages.length > 0) {
                                responseText = parsedResponse.messages.map(function (m) { return m.content; }).join('\n\n');
                                // Limpar espaços HORIZONTAIS extras que podem sobrar (preservar quebras de linha!)
                                responseText = responseText.replace(/[ \t]+/g, ' ').trim();
                            }
                            if (mediaActions.length > 0) {
                                console.log("\uD83D\uDCC1 [AI Agent] Tags de m\u00EDdia detectadas: ".concat(mediaActions.map(function (a) { return a.media_name; }).join(', ')));
                                originalCount = mediaActions.length;
                                mediaActions = mediaActions.filter(function (action) {
                                    var mediaName = (0, mediaService_1.foldMediaName)(action.media_name);
                                    var alreadySent = sentMedias_1.some(function (sent) { return (0, mediaService_1.foldMediaName)(sent) === mediaName; });
                                    if (alreadySent) {
                                        console.log("\u26A0\uFE0F [AI Agent] M\u00EDdia ".concat(action.media_name, " j\u00E1 foi enviada - REMOVIDA para eviar duplica\u00E7\u00E3o"));
                                    }
                                    return !alreadySent;
                                });
                                if (mediaActions.length < originalCount) {
                                    console.log("\uD83D\uDCC1 [AI Agent] ".concat(originalCount - mediaActions.length, " m\u00EDdia(s) removida(s) por j\u00E1 terem sido enviadas"));
                                }
                            }
                        }
                    }
                    if (!(hasMedia && mediaActions.length === 0)) return [3 /*break*/, 82];
                    aiHadMediaIntent = responseText ? (0, llm_1.detectMediaSendingIntent)(responseText) : false;
                    if (!aiHadMediaIntent) return [3 /*break*/, 81];
                    console.log("\n\uD83D\uDEA8 [AI Agent] \u26A1 IA disse que vai enviar m\u00EDdia mas N\u00C3O incluiu tag! RESGATE ATIVADO!");
                    console.log("\uD83D\uDEA8 [AI Agent] \uD83D\uDCAC Resposta: \"".concat(responseText.substring(0, 200), "...\""));
                    return [4 /*yield*/, (0, mediaService_1.forceMediaDetection)(newMessageText, conversationHistory, mediaLibrary, sentMedias_1, responseText || undefined)];
                case 80:
                    forceResult = _w.sent();
                    if (forceResult.shouldSendMedia && forceResult.mediaToSend) {
                        console.log("\uD83D\uDEA8 [AI Agent] \uD83C\uDFAF RESGATE: ".concat(forceResult.mediaToSend.name));
                        mediaActions.push({
                            type: 'send_media',
                            media_name: forceResult.mediaToSend.name,
                        });
                        console.log("\uD83D\uDEA8 [AI Agent] \u2705 M\u00EDdia ".concat(forceResult.mediaToSend.name, " ADICIONADA via resgate!"));
                    }
                    else {
                        console.log("\uD83D\uDEA8 [AI Agent] \u274C Resgate n\u00E3o encontrou m\u00EDdia adequada");
                    }
                    return [3 /*break*/, 82];
                case 81:
                    console.log("\uD83D\uDCC1 [AI Agent] IA n\u00E3o incluiu m\u00EDdia - decis\u00E3o respeitada (sem for\u00E7ar)");
                    _w.label = 82;
                case 82:
                    if (hasMedia && mediaActions.length === 0) {
                        sequencedMedia = selectSequencedFollowUpMedia(sentMedias_1, newMessageText, mediaLibrary);
                        if (sequencedMedia) {
                            lastSentMedia = mediaLibrary.find(function (media) { return (0, mediaService_1.foldMediaName)(media.name) === (0, mediaService_1.foldMediaName)(sentMedias_1[sentMedias_1.length - 1]); });
                            responseText = buildSequencedFollowUpText(lastSentMedia, sequencedMedia);
                            mediaActions.push({
                                type: 'send_media',
                                media_name: sequencedMedia.name,
                            });
                            console.log("\uD83D\uDCC1 [AI Agent] Follow-up sequencial acionado: ".concat(sequencedMedia.name));
                        }
                    }
                    // 🔄 PROCESSAR PLACEHOLDERS NA RESPOSTA FINAL ({{nome}}, saudações)
                    if (responseText) {
                        responseText = (0, textUtils_1.processResponsePlaceholders)(responseText, contactName);
                        responseText = repairKnownMediaPhrasing(responseText);
                        console.log("\uD83D\uDD04 [AI Agent] Placeholders processados na resposta");
                    }
                    // Price-flow enforcement: garantir mencao ao R$49 quando lead pediu preco
                    if (priceFlowFallback) {
                        responseNormalized = normalizePriceLeadText(responseText || "");
                        hasPriceMention = responseNormalized.includes("r$ 49") || responseNormalized.includes("r$49") || responseNormalized.includes("49/mes") || responseNormalized.includes("49 mes");
                        if (!hasPriceMention) {
                            console.log("[PRICE FLOW] Fallback aplicado");
                            responseText = priceFlowFallback;
                        }
                    }
                    appointmentCreated = undefined;
                    if (!(responseText && (options === null || options === void 0 ? void 0 : options.contactPhone))) return [3 /*break*/, 86];
                    _w.label = 83;
                case 83:
                    _w.trys.push([83, 85, , 86]);
                    return [4 /*yield*/, (0, schedulingService_1.processSchedulingTags)(responseText, userId, options.contactPhone, options.conversationId)];
                case 84:
                    schedulingResult = _w.sent();
                    responseText = schedulingResult.text;
                    if (schedulingResult.appointmentCreated) {
                        appointmentCreated = schedulingResult.appointmentCreated;
                        console.log("\uD83D\uDCC5 [AI Agent] Appointment created: ".concat(appointmentCreated.id, " for ").concat(appointmentCreated.client_name));
                    }
                    return [3 /*break*/, 86];
                case 85:
                    schedError_2 = _w.sent();
                    console.error("\uD83D\uDCC5 [AI Agent] Error processing scheduling tags:", schedError_2);
                    return [3 /*break*/, 86];
                case 86:
                    if (!(responseText && (options === null || options === void 0 ? void 0 : options.contactPhone))) return [3 /*break*/, 90];
                    _w.label = 87;
                case 87:
                    _w.trys.push([87, 89, , 90]);
                    return [4 /*yield*/, (0, schedulingService_1.processSchedulingCancelTags)(responseText, userId, options.contactPhone)];
                case 88:
                    cancelResult = _w.sent();
                    responseText = cancelResult.text;
                    if (cancelResult.appointmentCancelled) {
                        console.log("\uD83D\uDCC5 [AI Agent] Appointment cancelled successfully");
                    }
                    return [3 /*break*/, 90];
                case 89:
                    cancelError_1 = _w.sent();
                    console.error("\uD83D\uDCC5 [AI Agent] Error processing cancellation tags:", cancelError_1);
                    return [3 /*break*/, 90];
                case 90:
                    deliveryOrderCreated = undefined;
                    if (!(responseText && (options === null || options === void 0 ? void 0 : options.contactPhone))) return [3 /*break*/, 94];
                    _w.label = 91;
                case 91:
                    _w.trys.push([91, 93, , 94]);
                    return [4 /*yield*/, (0, deliveryService_1.processDeliveryOrderTags)(responseText, userId, options.contactPhone, options.conversationId)];
                case 92:
                    deliveryResult = _w.sent();
                    responseText = deliveryResult.text;
                    if (deliveryResult.orderCreated) {
                        deliveryOrderCreated = deliveryResult.orderCreated;
                        console.log("\uD83C\uDF55 [AI Agent] Delivery order created: #".concat(deliveryOrderCreated.id, " for ").concat(deliveryOrderCreated.customer_name));
                    }
                    return [3 /*break*/, 94];
                case 93:
                    deliveryError_3 = _w.sent();
                    console.error("\uD83C\uDF55 [AI Agent] Error processing delivery order tags:", deliveryError_3);
                    return [3 /*break*/, 94];
                case 94:
                    // 🔄 VERIFICAÇÃO ANTI-LOOP - Não enviar mesma resposta repetidamente
                    if (responseText) {
                        conversationKey = "".concat(userId, ":").concat((options === null || options === void 0 ? void 0 : options.contactPhone) || (options === null || options === void 0 ? void 0 : options.contactName) || 'unknown');
                        if (isDuplicateResponse(conversationKey, responseText)) {
                            console.log("\uD83D\uDD04 [AI Agent] Resposta duplicada detectada - BLOQUEANDO para evitar loop");
                            console.log("   Resposta: ".concat(responseText.substring(0, 80), "..."));
                            return [2 /*return*/, buildNullResult("duplicate_response_blocked", false)];
                        }
                    }
                    if (!responseText) return [3 /*break*/, 98];
                    _w.label = 95;
                case 95:
                    _w.trys.push([95, 97, , 98]);
                    return [4 /*yield*/, (0, deliveryAIService_1.getDeliveryData)(userId)];
                case 96:
                    deliveryData = _w.sent();
                    if (deliveryData && deliveryData.totalItems > 0) {
                        hasPrice = /R\$\s*\d+[.,]\d{2}/i.test(responseText);
                        if (hasPrice) {
                            console.log("\uD83C\uDF55 [AI Agent] Resposta cont\u00E9m pre\u00E7os - validando contra card\u00E1pio...");
                            validation = (0, deliveryAIService_1.validatePriceInResponse)(responseText, deliveryData);
                            if (!validation.valid) {
                                console.log("\u26A0\uFE0F [AI Agent] PRE\u00C7OS INCORRETOS DETECTADOS E CORRIGIDOS:");
                                validation.errors.forEach(function (err) { return console.log("   - ".concat(err)); });
                                responseText = validation.corrected;
                                console.log("\u2705 [AI Agent] Resposta corrigida aplicada");
                            }
                            else {
                                console.log("\u2705 [AI Agent] Pre\u00E7os validados - todos corretos");
                            }
                        }
                    }
                    return [3 /*break*/, 98];
                case 97:
                    priceValidationError_1 = _w.sent();
                    console.error("\u26A0\uFE0F [AI Agent] Erro na valida\u00E7\u00E3o de pre\u00E7os (continuando):", priceValidationError_1);
                    return [3 /*break*/, 98];
                case 98: return [2 /*return*/, {
                        text: responseText,
                        mediaActions: mediaActions,
                        notification: notification,
                        appointmentCreated: appointmentCreated,
                        deliveryOrderCreated: deliveryOrderCreated,
                        meta: {
                            retryable: false,
                            reason: responseText ? "generated" : "empty_response",
                        },
                    }];
                case 99:
                    error_6 = _w.sent();
                    console.error("Error generating AI response:", error_6);
                    if (!((error_6 === null || error_6 === void 0 ? void 0 : error_6.body) && typeof error_6.body.pipe === 'function')) return [3 /*break*/, 100];
                    console.error("⚠️ [AI Agent] API Error Body is a stream, cannot read directly.");
                    return [3 /*break*/, 106];
                case 100:
                    if (!(error_6 === null || error_6 === void 0 ? void 0 : error_6.response)) return [3 /*break*/, 105];
                    _w.label = 101;
                case 101:
                    _w.trys.push([101, 103, , 104]);
                    return [4 /*yield*/, error_6.response.text()];
                case 102:
                    errorBody = _w.sent();
                    console.error("\u26A0\uFE0F [AI Agent] API Error Details: ".concat(errorBody));
                    return [3 /*break*/, 104];
                case 103:
                    e_1 = _w.sent();
                    console.error("⚠️ [AI Agent] Could not read API error body");
                    return [3 /*break*/, 104];
                case 104: return [3 /*break*/, 106];
                case 105:
                    if (error_6 === null || error_6 === void 0 ? void 0 : error_6.message) {
                        console.error("\u26A0\uFE0F [AI Agent] Error message: ".concat(error_6.message));
                    }
                    _w.label = 106;
                case 106: return [2 /*return*/, {
                        text: null,
                        mediaActions: [],
                        meta: {
                            retryable: true,
                            reason: "generation_error",
                        },
                    }];
                case 107: return [2 /*return*/];
            }
        });
    });
}
function normalizeSequencedMediaText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function repairKnownMediaPhrasing(text) {
    if (!text)
        return text !== null && text !== void 0 ? text : null;
    var replacements = [
        [
            "prefere que eu envie as informações por ou que eu continue por mensagem escrita?",
            "prefere que eu envie as informações por áudio ou que eu continue por mensagem escrita?",
        ],
        [
            "prefere que eu envie as informacoes por ou que eu continue por mensagem escrita?",
            "prefere que eu envie as informacoes por audio ou que eu continue por mensagem escrita?",
        ],
        [
            "Vou te enviar um explicando tudo sobre o Ecoflash.",
            "Vou te enviar um áudio explicando tudo sobre o Ecoflash.",
        ],
        [
            "Vou te enviar um explicando tudo direitinho.",
            "Vou te enviar um áudio explicando tudo direitinho.",
        ],
    ];
    var next = text;
    for (var _i = 0, replacements_1 = replacements; _i < replacements_1.length; _i++) {
        var _a = replacements_1[_i], from = _a[0], to = _a[1];
        next = next.replace(from, to);
    }
    return next;
}
function selectSequencedFollowUpMedia(sentMedias, newMessageText, mediaLibrary) {
    if (!Array.isArray(sentMedias) || sentMedias.length === 0)
        return null;
    if (!Array.isArray(mediaLibrary) || mediaLibrary.length === 0)
        return null;
    var normalizedMessage = normalizeSequencedMediaText(newMessageText);
    var isShortContinuation = normalizedMessage.length <= 40 &&
        (normalizedMessage.includes("pode mandar") ||
            normalizedMessage.includes("pode enviar") ||
            normalizedMessage.includes("manda") ||
            normalizedMessage.includes("envia") ||
            normalizedMessage.includes("continua") ||
            normalizedMessage.includes("continue") ||
            normalizedMessage.includes("quero ver") ||
            normalizedMessage.includes("pode continuar") ||
            normalizedMessage === "ok" ||
            normalizedMessage === "beleza" ||
            normalizedMessage === "entendi");
    if (!isShortContinuation)
        return null;
    var sentMediaNames = sentMedias.map(function (item) { return (0, mediaService_1.foldMediaName)(item); });
    var lastSentName = sentMediaNames[sentMediaNames.length - 1];
    var lastSentMedia = mediaLibrary.find(function (media) { return (0, mediaService_1.foldMediaName)(media.name) === lastSentName; });
    if (!lastSentMedia)
        return null;
    var pickByPriority = function (items, preferredType) {
        return items
            .filter(function (media) { return media.isActive !== false; })
            .filter(function (media) { return !sentMediaNames.includes((0, mediaService_1.foldMediaName)(media.name)); })
            .sort(function (a, b) {
            var score = function (media) {
                var whenToUse = normalizeSequencedMediaText(media.whenToUse || "");
                var value = media.mediaType === preferredType ? 50 : 0;
                if (whenToUse.includes("depois do audio") || whenToUse.includes("apos o audio") || whenToUse.includes("após o áudio"))
                    value += 30;
                if (whenToUse.includes("em seguida") || whenToUse.includes("continuar"))
                    value += 20;
                if (whenToUse.includes("video") || whenToUse.includes("detalhes"))
                    value += 10;
                return value;
            };
            return score(b) - score(a);
        })[0] || null;
    };
    if (lastSentMedia.mediaType === "audio") {
        return pickByPriority(mediaLibrary, "video");
    }
    if (lastSentMedia.mediaType === "video") {
        return pickByPriority(mediaLibrary, "image");
    }
    return null;
}
function buildSequencedFollowUpText(lastSentMedia, nextMedia) {
    if ((lastSentMedia === null || lastSentMedia === void 0 ? void 0 : lastSentMedia.mediaType) === "audio" && (nextMedia === null || nextMedia === void 0 ? void 0 : nextMedia.mediaType) === "video") {
        return "Perfeito. Segue o vídeo com mais detalhes sobre o Ecoflash. Depois me fala se quer que eu te passe o valor.";
    }
    return "Perfeito. Segue aqui para você ver melhor.";
}
function normalizeSimulatorSessionId(sessionId) {
    var raw = String(sessionId || "").trim().toLowerCase();
    return raw.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "default";
}
function buildSimulatorSessionHash(userId, sessionId) {
    var seed = "".concat(userId, ":").concat(normalizeSimulatorSessionId(sessionId));
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36).slice(0, 8) || "sim";
}
function buildSimulatorConversationId(userId, sessionId, prefix) {
    if (prefix === void 0) { prefix = "simulator"; }
    var userPrefix = userId.split("-")[0] || "user";
    return "".concat(prefix, "-").concat(userPrefix, "-").concat(buildSimulatorSessionHash(userId, sessionId));
}
function buildSimulatorContactPhone(userId, sessionId) {
    var userPrefix = userId.split("-")[0] || "user";
    return "sim-".concat(userPrefix, "-").concat(buildSimulatorSessionHash(userId, sessionId));
}
/**
 * 🧪 SIMULADOR UNIFICADO - USA EXATAMENTE O MESMO FLUXO DO WHATSAPP
 *
 * Esta função agora chama generateAIResponse internamente para garantir
 * que o simulador se comporta IDENTICAMENTE ao agente real.
 *
 * Diferenças controladas:
 * - conversationHistory: vem do parâmetro (simulador mantém em memória)
 * - contactName: configurável (default "Visitante")
 * - sentMedias: rastreado pelo simulador
 * - appointmentCreated: retorna agendamento criado (se houver)
 */
function testAgentResponse(userId_1, testMessage_1, customPrompt_1, conversationHistory_2, sentMedias_2) {
    return __awaiter(this, arguments, void 0, function (userId, testMessage, customPrompt, conversationHistory, sentMedias, contactName, sessionId) {
        var llmConfig, hasOpenRouterKey, hasGroqKey, hasMistralKey, agentConfig_1, history_1, simulatorSessionId, simulatorConversationId, simulatorChatbotConversationId, simulatorContactPhone, isGreetingEnabledTest, customGreetingTest, isFirstMessageTest, greetingText, flowModeActive, flowScript, executeFlowResponse, flowHistory, flowResult, flowError_2, chatbotActive, isFirstContact, chatbotResponse, responseTexts, mediaActions, _i, _a, msg, buttonText, _b, _c, btn, listText, _d, _e, section, _f, _g, row, fullResponse, bypassFlowEngineForDelivery, _h, deliveryEnabled, schedulingEnabled, salonEnabled, bypassErr_1, useFlowEngine, _j, llmClient, llmConfig_1, apiKey, flowResult, result, error_7;
        var _this = this;
        var _k, _l, _m;
        if (contactName === void 0) { contactName = "Visitante"; }
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    _o.trys.push([0, 25, , 26]);
                    console.log("\n\uD83E\uDDEA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    console.log("\uD83E\uDDEA [SIMULADOR] Nome do contato: ".concat(contactName));
                    console.log("\uD83E\uDDEA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                    return [4 /*yield*/, (0, llm_1.getLLMConfig)()];
                case 1:
                    llmConfig = _o.sent();
                    hasOpenRouterKey = llmConfig.openrouterApiKey && llmConfig.openrouterApiKey.length > 20;
                    hasGroqKey = llmConfig.groqApiKey && llmConfig.groqApiKey.length > 20;
                    hasMistralKey = (llmConfig.mistralApiKey && llmConfig.mistralApiKey.length > 10) || (!!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10);
                    if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey) {
                        console.error('🧪 [SIMULADOR] ❌ ERRO: Nenhuma API key configurada!');
                        return [2 /*return*/, {
                                text: "⚠️ **Simulador Indisponível**\n\nNenhuma chave de API (LLM) está configurada.\n\n📋 Para resolver:\n1. Vá em **Admin → Configurações**\n2. Escolha um provedor (OpenRouter é gratuito!)\n3. Cole sua chave de API\n4. Salve e teste novamente\n\n💡 Dica: OpenRouter oferece modelos gratuitos como GPT-OSS 20B",
                                mediaActions: [],
                                appointmentCreated: undefined,
                                deliveryOrderCreated: undefined
                            }];
                    }
                    return [4 /*yield*/, storage_1.storage.getAgentConfig(userId)];
                case 2:
                    agentConfig_1 = _o.sent();
                    if (!agentConfig_1) {
                        throw new Error("Agent not configured");
                    }
                    history_1 = (conversationHistory || []);
                    simulatorSessionId = sessionId || userId;
                    simulatorConversationId = buildSimulatorConversationId(userId, simulatorSessionId);
                    simulatorChatbotConversationId = buildSimulatorConversationId(userId, simulatorSessionId, "simulator-chatbot");
                    simulatorContactPhone = buildSimulatorContactPhone(userId, simulatorSessionId);
                    console.log("\uD83E\uDDEA [SIMULADOR] Hist\u00F3rico: ".concat(history_1.length, " mensagens"));
                    console.log("\uD83E\uDDEA [SIMULADOR] M\u00EDdias j\u00E1 enviadas: ".concat((sentMedias === null || sentMedias === void 0 ? void 0 : sentMedias.length) || 0));
                    console.log("\uD83E\uDDEA [SIMULADOR] Sess\u00E3o: ".concat(simulatorSessionId, " | Contato: ").concat(simulatorContactPhone));
                    isGreetingEnabledTest = (agentConfig_1 === null || agentConfig_1 === void 0 ? void 0 : agentConfig_1.greetingEnabled) === true;
                    customGreetingTest = agentConfig_1 === null || agentConfig_1 === void 0 ? void 0 : agentConfig_1.customGreeting;
                    isFirstMessageTest = !history_1 || history_1.length === 0;
                    if (isGreetingEnabledTest && customGreetingTest && isFirstMessageTest) {
                        greetingText = customGreetingTest.replace(/\{nome\}/gi, contactName || 'cliente');
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDC4B SAUDA\u00C7\u00C3O DIRETA (sem LLM): \"".concat(greetingText, "\""));
                        return [2 /*return*/, {
                                text: greetingText,
                                mediaActions: [],
                                appointmentCreated: undefined,
                                deliveryOrderCreated: undefined
                            }];
                    }
                    flowModeActive = agentConfig_1.flowModeActive === true;
                    flowScript = agentConfig_1.flowScript;
                    if (!(flowModeActive && flowScript && flowScript.trim().length > 10)) return [3 /*break*/, 7];
                    console.log("\uD83D\uDD00 [SIMULADOR] \u2705 MODO FLUXO ATIVO - usando FlowScriptEngine (prioridade m\u00E1xima)");
                    _o.label = 3;
                case 3:
                    _o.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./flowScriptEngine"); })];
                case 4:
                    executeFlowResponse = (_o.sent()).executeFlowResponse;
                    flowHistory = history_1.slice(-10).map(function (msg) { return ({
                        role: (msg.fromMe ? "assistant" : "user"),
                        content: msg.text || "",
                    }); });
                    return [4 /*yield*/, executeFlowResponse(testMessage, flowScript, flowHistory)];
                case 5:
                    flowResult = _o.sent();
                    console.log("\uD83D\uDD00 [SIMULADOR FLUXO] Resposta gerada (".concat(flowResult.response.length, " chars)"));
                    return [2 /*return*/, {
                            text: flowResult.response,
                            mediaActions: [],
                        }];
                case 6:
                    flowError_2 = _o.sent();
                    console.error("\uD83D\uDD00 [SIMULADOR FLUXO] Erro no FlowScriptEngine:", flowError_2);
                    return [2 /*return*/, {
                            text: "Olá! Estou disponível para ajudar. Por favor, siga as instruções do atendimento. 😊",
                            mediaActions: [],
                        }];
                case 7:
                    if (!!customPrompt) return [3 /*break*/, 10];
                    return [4 /*yield*/, (0, chatbotFlowEngine_1.isChatbotActive)(userId)];
                case 8:
                    chatbotActive = _o.sent();
                    if (!chatbotActive) return [3 /*break*/, 10];
                    console.log("\uD83E\uDDEA [SIMULADOR] \uD83E\uDD16 Chatbot Visual ATIVO - usando Flow Builder");
                    isFirstContact = !history_1 || history_1.length === 0;
                    return [4 /*yield*/, (0, chatbotFlowEngine_1.processChatbotMessage)(userId, simulatorChatbotConversationId, simulatorContactPhone, testMessage, isFirstContact)];
                case 9:
                    chatbotResponse = _o.sent();
                    if (chatbotResponse && chatbotResponse.messages.length > 0) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \u2705 Chatbot Visual respondeu com ".concat(chatbotResponse.messages.length, " mensagens"));
                        responseTexts = [];
                        mediaActions = [];
                        for (_i = 0, _a = chatbotResponse.messages; _i < _a.length; _i++) {
                            msg = _a[_i];
                            if (msg.type === 'text') {
                                responseTexts.push(msg.content);
                            }
                            else if (msg.type === 'buttons') {
                                buttonText = msg.content.body || '';
                                if (msg.content.header) {
                                    buttonText = "*".concat(msg.content.header, "*\n\n").concat(buttonText);
                                }
                                buttonText += '\n\n📊 *ENQUETE (Poll):*';
                                for (_b = 0, _c = msg.content.buttons; _b < _c.length; _b++) {
                                    btn = _c[_b];
                                    buttonText += "\n\uD83D\uDD18 ".concat(btn.title);
                                }
                                if (msg.content.footer) {
                                    buttonText += "\n\n_".concat(msg.content.footer, "_");
                                }
                                responseTexts.push(buttonText);
                            }
                            else if (msg.type === 'list') {
                                listText = msg.content.body || '';
                                if (msg.content.header) {
                                    listText = "*".concat(msg.content.header, "*\n\n").concat(listText);
                                }
                                listText += "\n\n\uD83D\uDCCB *LISTA (".concat(msg.content.button_text || 'Ver opções', "):*");
                                for (_d = 0, _e = msg.content.sections || []; _d < _e.length; _d++) {
                                    section = _e[_d];
                                    if (section.title) {
                                        listText += "\n\n*".concat(section.title, "*");
                                    }
                                    for (_f = 0, _g = section.rows || []; _f < _g.length; _f++) {
                                        row = _g[_f];
                                        listText += "\n\u2022 ".concat(row.title);
                                        if (row.description) {
                                            listText += " - ".concat(row.description);
                                        }
                                    }
                                }
                                if (msg.content.footer) {
                                    listText += "\n\n_".concat(msg.content.footer, "_");
                                }
                                responseTexts.push(listText);
                            }
                            else if (msg.type === 'media') {
                                mediaActions.push({
                                    type: 'send_media',
                                    media_name: msg.content.url,
                                    media_url: msg.content.url,
                                    caption: msg.content.caption
                                });
                                if (msg.content.caption) {
                                    responseTexts.push("\uD83D\uDCCE *M\u00EDdia*: ".concat(msg.content.caption));
                                }
                            }
                        }
                        fullResponse = responseTexts.join('\n\n---\n\n');
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83E\uDD16 Chatbot Visual resposta: \"".concat(fullResponse.substring(0, 100), "...\""));
                        console.log("\uD83E\uDDEA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, {
                                text: fullResponse,
                                mediaActions: mediaActions,
                                appointmentCreated: undefined,
                                deliveryOrderCreated: undefined
                            }];
                    }
                    console.log("\uD83E\uDDEA [SIMULADOR] \u26A0\uFE0F Chatbot Visual n\u00E3o gerou resposta, fallback para FlowEngine/IA");
                    _o.label = 10;
                case 10:
                    bypassFlowEngineForDelivery = false;
                    _o.label = 11;
                case 11:
                    _o.trys.push([11, 13, , 14]);
                    return [4 /*yield*/, Promise.all([
                            (0, deliveryAIService_1.isDeliveryEnabled)(userId),
                            (0, schedulingService_1.isSchedulingEnabled)(userId),
                            (0, salonAIService_1.isSalonActive)(userId),
                        ])];
                case 12:
                    _h = _o.sent(), deliveryEnabled = _h[0], schedulingEnabled = _h[1], salonEnabled = _h[2];
                    bypassFlowEngineForDelivery = deliveryEnabled || schedulingEnabled || salonEnabled;
                    if (bypassFlowEngineForDelivery) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83C\uDF55 BYPASS FlowEngine - delivery/agendamento/sal\u00E3o ativo");
                    }
                    return [3 /*break*/, 14];
                case 13:
                    bypassErr_1 = _o.sent();
                    console.log("\u26A0\uFE0F [SIMULADOR] Erro ao verificar delivery/scheduling:", bypassErr_1);
                    return [3 /*break*/, 14];
                case 14:
                    _j = !customPrompt && !bypassFlowEngineForDelivery;
                    if (!_j) return [3 /*break*/, 16];
                    return [4 /*yield*/, (0, flowIntegration_1.shouldUseFlowEngine)(userId)];
                case 15:
                    _j = (_o.sent());
                    _o.label = 16;
                case 16:
                    useFlowEngine = _j;
                    if (!useFlowEngine) return [3 /*break*/, 22];
                    console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDE80 Usando FLOW ENGINE (Sistema H\u00EDbrido)");
                    console.log("\uD83E\uDDEA [SIMULADOR] IA \u2192 Interpreta inten\u00E7\u00E3o");
                    console.log("\uD83E\uDDEA [SIMULADOR] Sistema \u2192 Executa a\u00E7\u00E3o (determin\u00EDstico)");
                    console.log("\uD83E\uDDEA [SIMULADOR] IA \u2192 Humaniza resposta");
                    return [4 /*yield*/, (0, llm_1.getLLMClient)()];
                case 17:
                    llmClient = _o.sent();
                    if (!llmClient) {
                        throw new Error("LLM não configurado");
                    }
                    return [4 /*yield*/, (0, llm_1.getLLMConfig)()];
                case 18:
                    llmConfig_1 = _o.sent();
                    apiKey = llmConfig_1.provider === 'openrouter'
                        ? llmConfig_1.openrouterApiKey
                        : llmConfig_1.provider === 'groq'
                            ? llmConfig_1.groqApiKey
                            : (llmConfig_1.mistralApiKey || process.env.MISTRAL_API_KEY || '');
                    if (!!apiKey) return [3 /*break*/, 19];
                    console.log("\u26A0\uFE0F [SIMULADOR] Sem API key para provider ".concat(llmConfig_1.provider, ", usando sistema legado"));
                    return [3 /*break*/, 21];
                case 19: return [4 /*yield*/, (0, flowIntegration_1.processWithFlowEngine)(userId, simulatorConversationId, testMessage, apiKey, {
                        contactName: contactName,
                        history: history_1.map(function (m) { return ({ fromMe: m.fromMe, text: m.text || '' }); })
                    })];
                case 20:
                    flowResult = _o.sent();
                    if (flowResult) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \u2705 FlowEngine respondeu: \"".concat((_k = flowResult.text) === null || _k === void 0 ? void 0 : _k.substring(0, 80), "...\""));
                        console.log("\uD83E\uDDEA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, {
                                text: flowResult.text,
                                mediaActions: flowResult.mediaActions || [],
                                appointmentCreated: undefined,
                                deliveryOrderCreated: undefined
                            }];
                    }
                    console.log("\uD83E\uDDEA [SIMULADOR] \u26A0\uFE0F FlowEngine sem resposta, fallback para sistema legado");
                    _o.label = 21;
                case 21: return [3 /*break*/, 23];
                case 22:
                    console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDCCB Usando sistema LEGADO (IA livre)");
                    if (customPrompt) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDCDD customPrompt fornecido - testando prompt n\u00E3o salvo");
                    }
                    _o.label = 23;
                case 23: return [4 /*yield*/, generateAIResponse(userId, history_1, testMessage, {
                        contactName: contactName,
                        // Use an isolated synthetic contact id in simulator mode to avoid
                        // anti-loop collisions between independent test sessions.
                        contactPhone: simulatorContactPhone,
                        conversationId: simulatorConversationId,
                        sentMedias: sentMedias || [],
                    }, customPrompt ? {
                        getAgentConfig: function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, (__assign(__assign({}, agentConfig_1), { prompt: customPrompt }))];
                            });
                        }); },
                    } : undefined)];
                case 24:
                    result = _o.sent();
                    if (!result) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \u26A0\uFE0F Sem resposta do generateAIResponse");
                        return [2 /*return*/, { text: null, mediaActions: [], appointmentCreated: undefined, deliveryOrderCreated: undefined }];
                    }
                    console.log("\uD83E\uDDEA [SIMULADOR] \u2705 Resposta gerada: ".concat((_l = result.text) === null || _l === void 0 ? void 0 : _l.substring(0, 80), "..."));
                    console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDCC1 M\u00EDdias na resposta: ".concat(((_m = result.mediaActions) === null || _m === void 0 ? void 0 : _m.length) || 0));
                    if (result.appointmentCreated) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83D\uDCC5 Agendamento criado: ".concat(result.appointmentCreated.id));
                    }
                    if (result.deliveryOrderCreated) {
                        console.log("\uD83E\uDDEA [SIMULADOR] \uD83C\uDF55 Pedido de delivery criado: #".concat(result.deliveryOrderCreated.id));
                    }
                    console.log("\uD83E\uDDEA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/, {
                            text: result.text,
                            mediaActions: result.mediaActions || [],
                            appointmentCreated: result.appointmentCreated,
                            deliveryOrderCreated: result.deliveryOrderCreated
                        }];
                case 25:
                    error_7 = _o.sent();
                    console.error("🧪 [SIMULADOR] Error:", error_7);
                    throw error_7;
                case 26: return [2 /*return*/];
            }
        });
    });
}
