"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔗 FLOW INTEGRATION - Integração do Sistema de Fluxos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este arquivo integra o UnifiedFlowEngine com o sistema existente:
 * - /api/agent/generate-prompt → Cria FlowDefinition + Prompt
 * - /api/agent/edit-prompt → Atualiza FlowDefinition + Prompt
 * - generateAIResponse() → Usa FlowDefinition para responder
 *
 * CONCEITO HÍBRIDO:
 * - Mantém o prompt como backup/documentação
 * - FlowDefinition é usado para execução determinística
 * - IA só interpreta intenções e humaniza respostas
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
exports.FlowStorage = exports.UnifiedFlowEngine = exports.FlowBuilder = void 0;
exports.handleGeneratePrompt = handleGeneratePrompt;
exports.handleEditPrompt = handleEditPrompt;
exports.shouldUseFlowEngine = shouldUseFlowEngine;
exports.processWithFlowEngine = processWithFlowEngine;
exports.buildFlowForUserPrompt = buildFlowForUserPrompt;
var FlowBuilder_1 = require("./FlowBuilder");
Object.defineProperty(exports, "FlowBuilder", { enumerable: true, get: function () { return FlowBuilder_1.FlowBuilder; } });
var UnifiedFlowEngine_1 = require("./UnifiedFlowEngine");
Object.defineProperty(exports, "UnifiedFlowEngine", { enumerable: true, get: function () { return UnifiedFlowEngine_1.UnifiedFlowEngine; } });
Object.defineProperty(exports, "FlowStorage", { enumerable: true, get: function () { return UnifiedFlowEngine_1.FlowStorage; } });
var supabaseAuth_1 = require("./supabaseAuth");
// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM GENERATE-PROMPT
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Chamado quando usuário cria novo agente (/api/agent/generate-prompt)
 * Cria tanto o prompt (texto) quanto o FlowDefinition (estrutura)
 */
function handleGeneratePrompt(userId, businessType, businessName, description, additionalInfo, mistralApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var analyzer, builder, basePrompt, flow, desiredType, err_1, flowCreated, err_2, prompt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n\uD83D\uDD17 [FlowIntegration] Gerando prompt + flow para ".concat(businessName));
                    analyzer = new FlowBuilder_1.PromptAnalyzer();
                    builder = new FlowBuilder_1.FlowBuilder(undefined, mistralApiKey);
                    basePrompt = "\nVoc\u00EA \u00E9 um atendente virtual da ".concat(businessName, ".\nTipo de neg\u00F3cio: ").concat(businessType, "\n").concat(description ? "Descri\u00E7\u00E3o: ".concat(description) : '', "\n").concat(additionalInfo ? "Informa\u00E7\u00F5es adicionais: ".concat(additionalInfo) : '', "\n  ").trim();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, resolveDesiredFlowType(userId)];
                case 2:
                    desiredType = _a.sent();
                    return [4 /*yield*/, buildFlowFromPromptWithType(basePrompt, desiredType)];
                case 3:
                    flow = _a.sent();
                    // Ajustar dados do flow
                    flow.businessName = businessName;
                    flow.agentName = extractAgentName(description) || 'Assistente';
                    console.log("   \uD83D\uDCCB Flow criado: ".concat(flow.type, " com ").concat(Object.keys(flow.states).length, " estados"));
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    console.error("   \u274C Erro ao criar flow:", err_1);
                    // Fallback: criar flow genérico
                    flow = builder.buildGenericoFlow('Assistente', businessName, 'profissional e amigável');
                    flow.businessName = businessName;
                    return [3 /*break*/, 5];
                case 5:
                    flowCreated = false;
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, UnifiedFlowEngine_1.FlowStorage.saveFlow(userId, flow)];
                case 7:
                    flowCreated = _a.sent();
                    console.log("   ".concat(flowCreated ? '✅' : '❌', " Flow ").concat(flowCreated ? 'salvo' : 'não salvo', " no banco"));
                    return [3 /*break*/, 9];
                case 8:
                    err_2 = _a.sent();
                    console.error("   \u274C Erro ao salvar flow:", err_2);
                    return [3 /*break*/, 9];
                case 9:
                    prompt = generatePromptFromFlow(flow, description, additionalInfo);
                    console.log("   \uD83D\uDCDD Prompt gerado: ".concat(prompt.length, " chars"));
                    console.log("\uD83D\uDD17 [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/, { prompt: prompt, flow: flow, flowCreated: flowCreated }];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM EDIT-PROMPT
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Chamado quando usuário edita agente via chat (/api/agent/edit-prompt)
 * Atualiza tanto o prompt quanto o FlowDefinition
 *
 * LÓGICA:
 * - Se prompt mudou COMPLETAMENTE: REGENERA flow do zero
 * - Se apenas instrução pontual: Modifica valores específicos (preços, cupons, etc)
 */
function handleEditPrompt(userId, currentPrompt, instruction, newPrompt, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var promptChangedCompletely, hasCustomGreeting, builder, flow_1, saved_1, flow, changes, builder, instructionLower, priceMatches, _i, priceMatches_1, match, priceMatch, newPrice, couponMatch, newCoupon, discountMatch, discount, linkMatch, nameMatch, saved;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n\uD83D\uDD17 [FlowIntegration] Editando flow com instru\u00E7\u00E3o...");
                    console.log("   Instru\u00E7\u00E3o: \"".concat(instruction.substring(0, 60), "...\""));
                    promptChangedCompletely = newPrompt !== currentPrompt &&
                        (newPrompt.length > currentPrompt.length * 1.5 ||
                            newPrompt.length < currentPrompt.length * 0.7);
                    hasCustomGreeting = /responder\s+\*\*exatamente\*\*|primeira mensagem|sempre enviar|enviar sempre|mensagem inicial/i.test(newPrompt);
                    if (!(promptChangedCompletely || hasCustomGreeting)) return [3 /*break*/, 3];
                    console.log("   \uD83D\uDD04 REGENERANDO FLOW DO ZERO (prompt mudou ".concat(promptChangedCompletely ? 'completamente' : 'tem mensagem customizada', ")"));
                    builder = new FlowBuilder_1.FlowBuilder(undefined, apiKey);
                    return [4 /*yield*/, builder.buildFromPrompt(newPrompt)];
                case 1:
                    flow_1 = _a.sent();
                    return [4 /*yield*/, UnifiedFlowEngine_1.FlowStorage.saveFlow(userId, flow_1)];
                case 2:
                    saved_1 = _a.sent();
                    console.log("   ".concat(saved_1 ? '✅' : '❌', " Flow ").concat(saved_1 ? 'regenerado' : 'não regenerado', " do zero"));
                    console.log("\uD83D\uDD17 [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/, {
                            flowUpdated: saved_1,
                            changes: saved_1 ? ['Flow regenerado completamente do novo prompt'] : []
                        }];
                case 3:
                    // 🎯 EDIÇÃO PONTUAL: Modificar valores específicos
                    console.log("   \u270F\uFE0F Edi\u00E7\u00E3o pontual - modificando valores espec\u00EDficos");
                    return [4 /*yield*/, UnifiedFlowEngine_1.FlowStorage.loadFlow(userId)];
                case 4:
                    flow = _a.sent();
                    changes = [];
                    if (!!flow) return [3 /*break*/, 6];
                    // Se não existe flow, criar um do prompt
                    console.log("   \u26A0\uFE0F Flow n\u00E3o encontrado, criando do prompt atual...");
                    builder = new FlowBuilder_1.FlowBuilder(undefined, apiKey);
                    return [4 /*yield*/, builder.buildFromPrompt(currentPrompt)];
                case 5:
                    flow = _a.sent();
                    changes.push('Flow criado a partir do prompt existente');
                    _a.label = 6;
                case 6:
                    instructionLower = instruction.toLowerCase();
                    priceMatches = instruction.match(/(?:pre[çc]o|valor|custa?).*?r?\$?\s*(\d+(?:[,.]\d{2})?)/gi);
                    if (priceMatches) {
                        for (_i = 0, priceMatches_1 = priceMatches; _i < priceMatches_1.length; _i++) {
                            match = priceMatches_1[_i];
                            priceMatch = match.match(/(\d+(?:[,.]\d{2})?)/);
                            if (priceMatch) {
                                newPrice = parseFloat(priceMatch[1].replace(',', '.'));
                                if (!isNaN(newPrice) && flow) {
                                    if (!flow.data)
                                        flow.data = {};
                                    if (!flow.data.prices)
                                        flow.data.prices = {};
                                    if (instructionLower.includes('promo') || instructionLower.includes('desconto')) {
                                        flow.data.prices.promo = newPrice;
                                        changes.push("Pre\u00E7o promocional: R$".concat(newPrice));
                                    }
                                    else if (instructionLower.includes('impl') || instructionLower.includes('setup')) {
                                        flow.data.prices.implementation = newPrice;
                                        changes.push("Pre\u00E7o implementa\u00E7\u00E3o: R$".concat(newPrice));
                                    }
                                    else {
                                        flow.data.prices.standard = newPrice;
                                        changes.push("Pre\u00E7o padr\u00E3o: R$".concat(newPrice));
                                    }
                                }
                            }
                        }
                    }
                    couponMatch = instruction.match(/cupom\s*(?:é|:)?\s*([A-Z0-9_-]+)/i);
                    if (couponMatch && flow) {
                        newCoupon = couponMatch[1].toUpperCase();
                        if (!flow.data)
                            flow.data = {};
                        if (!flow.data.coupons)
                            flow.data.coupons = {};
                        discountMatch = instruction.match(/(\d+)\s*%/);
                        discount = discountMatch ? parseInt(discountMatch[1]) : 50;
                        flow.data.coupons[newCoupon] = { code: newCoupon, discount: discount };
                        changes.push("Cupom: ".concat(newCoupon, " (").concat(discount, "% off)"));
                    }
                    linkMatch = instruction.match(/(https?:\/\/[^\s]+)/i);
                    if (linkMatch && flow) {
                        if (!flow.data)
                            flow.data = {};
                        if (!flow.data.links)
                            flow.data.links = {};
                        if (instructionLower.includes('cadastro') || instructionLower.includes('signup')) {
                            flow.data.links.signup = linkMatch[1];
                            changes.push("Link cadastro: ".concat(linkMatch[1]));
                        }
                        else {
                            flow.data.links.site = linkMatch[1];
                            changes.push("Link site: ".concat(linkMatch[1]));
                        }
                    }
                    // Modificar nome do agente
                    if (instructionLower.includes('nome') && instructionLower.includes('agente') && flow) {
                        nameMatch = instruction.match(/(?:chamar?|nome).*?(?:de\s+)?([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)(?:\s|$)/i);
                        if (nameMatch && nameMatch[1].length > 2 && !['de', 'do', 'da', 'para', 'por'].includes(nameMatch[1].toLowerCase())) {
                            flow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
                            changes.push("Nome do agente: ".concat(flow.agentName));
                        }
                    }
                    // Verificar se flow existe antes de modificar personalidade
                    if (!flow) {
                        console.log("   \u274C Flow n\u00E3o encontrado ap\u00F3s cria\u00E7\u00E3o");
                        return [2 /*return*/, { flowUpdated: false, changes: [] }];
                    }
                    // Modificar personalidade
                    if (instructionLower.includes('formal') && !instructionLower.includes('informal')) {
                        flow.agentPersonality = 'formal, profissional, cortês';
                        changes.push('Personalidade: formal');
                    }
                    else if (instructionLower.includes('informal') || instructionLower.includes('descontraído')) {
                        flow.agentPersonality = 'informal, descontraído, divertido';
                        changes.push('Personalidade: informal');
                    }
                    else if (instructionLower.includes('direto') || instructionLower.includes('objetivo')) {
                        flow.agentPersonality = 'direto, objetivo, prático';
                        changes.push('Personalidade: direto');
                    }
                    // Adicionar nova regra global
                    if (instructionLower.includes('sempre') || instructionLower.includes('nunca')) {
                        if (!flow.globalRules)
                            flow.globalRules = [];
                        flow.globalRules.push(instruction);
                        changes.push("Nova regra adicionada");
                    }
                    // 3. Atualizar versão e salvar
                    flow.version = incrementVersion(flow.version);
                    return [4 /*yield*/, UnifiedFlowEngine_1.FlowStorage.saveFlow(userId, flow)];
                case 7:
                    saved = _a.sent();
                    console.log("   ".concat(saved ? '✅' : '❌', " Flow ").concat(saved ? 'atualizado' : 'não atualizado'));
                    console.log("   \uD83D\uDCCA ".concat(changes.length, " mudan\u00E7as aplicadas: ").concat(changes.join(', ')));
                    console.log("\uD83D\uDD17 [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                    return [2 /*return*/, {
                            flowUpdated: saved,
                            changes: changes
                        }];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM generateAIResponse
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Verifica se deve usar FlowEngine ou sistema legado
 * AGORA: Cria FlowDefinition automaticamente se não existir! 🚀
 *
 * v3.1 - RE-HABILITADO para usar ENQUETES do WhatsApp como botões
 */
function shouldUseFlowEngine(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, chatbotConfig, chatbotError, flowAtivo, flow, error_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // ═══════════════════════════════════════════════════════════════════════════
                    // ✅ LÓGICA CORRETA: VERIFICAR chatbot_configs.is_active PRIMEIRO
                    // ═══════════════════════════════════════════════════════════════════════════
                    // 
                    // REGRA DE NEGÓCIO:
                    // - Se chatbot_configs.is_active = TRUE → Usar FlowEngine (Construtor Fluxo)
                    // - Se chatbot_configs.is_active = FALSE → Usar Agente IA (prompt)
                    // 
                    // O usuário controla isso em:
                    // - /meu-agente-ia → Ativa agente IA, desativa fluxo
                    // - /construtor-fluxo → Ativa fluxo, desativa agente IA
                    // ═══════════════════════════════════════════════════════════════════════════
                    console.log("\n\uD83D\uDD0D [shouldUseFlowEngine] Verificando para user ".concat(userId));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('chatbot_configs')
                            .select('is_active, name')
                            .eq('user_id', userId)
                            .single()];
                case 2:
                    _a = _c.sent(), chatbotConfig = _a.data, chatbotError = _a.error;
                    if (chatbotError && chatbotError.code !== 'PGRST116') {
                        console.error("   \u274C Erro ao verificar chatbot_configs:", chatbotError);
                    }
                    flowAtivo = (chatbotConfig === null || chatbotConfig === void 0 ? void 0 : chatbotConfig.is_active) === true;
                    console.log("   \u2192 chatbot_configs.is_active: ".concat((_b = chatbotConfig === null || chatbotConfig === void 0 ? void 0 : chatbotConfig.is_active) !== null && _b !== void 0 ? _b : 'não existe'));
                    if (!flowAtivo) {
                        console.log("   \u26A0\uFE0F FlowEngine DESATIVADO - Usando Agente IA (prompt)");
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, UnifiedFlowEngine_1.FlowStorage.loadFlow(userId)];
                case 3:
                    flow = _c.sent();
                    if (flow) {
                        console.log("   \u2705 FlowEngine ATIVO - FlowDefinition encontrado: ".concat(flow.type));
                        return [2 /*return*/, true];
                    }
                    console.log("   \u26A0\uFE0F FlowEngine ativo mas sem FlowDefinition, usando Agente IA");
                    return [2 /*return*/, false];
                case 4:
                    error_1 = _c.sent();
                    console.error("   \u274C Erro ao verificar FlowEngine:", error_1);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Processa mensagem usando FlowEngine
 * Chamado por generateAIResponse quando shouldUseFlowEngine = true
 */
function processWithFlowEngine(userId, conversationId, messageText, apiKey, options) {
    return __awaiter(this, void 0, void 0, function () {
        var config, engine, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = {
                        apiKey: apiKey,
                        model: undefined, // Sem hardcode - usa modelo do banco de dados
                        humanize: true,
                        temperature: 0.2
                    };
                    engine = new UnifiedFlowEngine_1.UnifiedFlowEngine(config);
                    return [4 /*yield*/, engine.processMessage(userId, conversationId, messageText, {
                            useAI: true,
                            humanize: true,
                            contactName: options === null || options === void 0 ? void 0 : options.contactName
                        })];
                case 1:
                    result = _a.sent();
                    if (!result) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            text: result.text,
                            mediaActions: result.mediaActions,
                            usedFlow: true
                        }];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function extractAgentName(text) {
    if (!text)
        return null;
    var patterns = [
        /(?:sou|me chamo|meu nome [ée])\s+([A-Za-záéíóúâêîôûãõç]+)/i,
        /(?:agente|atendente)\s+([A-Za-záéíóúâêîôûãõç]+)/i,
    ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = text.match(pattern);
        if (match && match[1].length > 2) {
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        }
    }
    return null;
}
function incrementVersion(version) {
    var parts = version.split('.');
    var patch = parseInt(parts[2] || '0') + 1;
    return "".concat(parts[0], ".").concat(parts[1], ".").concat(patch);
}
/**
 * Gera prompt de texto a partir de FlowDefinition
 * (Mantido para compatibilidade com sistema legado)
 */
function generatePromptFromFlow(flow, description, additionalInfo) {
    var lines = [];
    // Identidade
    lines.push("Voc\u00EA \u00E9 ".concat(flow.agentName, ", atendente virtual da ").concat(flow.businessName, "."));
    if (flow.agentPersonality) {
        lines.push("Personalidade: ".concat(flow.agentPersonality, "."));
    }
    lines.push('');
    // Tipo de negócio
    if (flow.type === 'DELIVERY') {
        lines.push('TIPO: Delivery/Restaurante');
        lines.push('Você ajuda clientes a ver o cardápio, montar pedidos e finalizar compras.');
    }
    else if (flow.type === 'VENDAS') {
        lines.push('TIPO: Vendas/Comercial');
        lines.push('Você apresenta produtos/serviços, responde dúvidas e guia para fechamento.');
    }
    else if (flow.type === 'AGENDAMENTO') {
        lines.push('TIPO: Agendamento');
        lines.push('Você agenda horários, confirma disponibilidade e gerencia reservas.');
    }
    else if (flow.type === 'SUPORTE') {
        lines.push('TIPO: Suporte');
        lines.push('Você responde dúvidas frequentes e encaminha casos complexos.');
    }
    lines.push('');
    // Dados importantes
    if (flow.data) {
        lines.push('DADOS DO NEGÓCIO:');
        if (flow.data.prices) {
            if (flow.data.prices.standard)
                lines.push("\u2022 Pre\u00E7o padr\u00E3o: R$".concat(flow.data.prices.standard));
            if (flow.data.prices.promo)
                lines.push("\u2022 Pre\u00E7o promocional: R$".concat(flow.data.prices.promo));
            if (flow.data.prices.implementation)
                lines.push("\u2022 Implementa\u00E7\u00E3o: R$".concat(flow.data.prices.implementation));
        }
        if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
            for (var _i = 0, _a = Object.entries(flow.data.coupons); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], coupon = _b[1];
                lines.push("\u2022 Cupom ".concat(coupon.code, ": ").concat(coupon.discount, "% de desconto"));
            }
        }
        if (flow.data.links) {
            if (flow.data.links.site)
                lines.push("\u2022 Site: ".concat(flow.data.links.site));
            if (flow.data.links.signup)
                lines.push("\u2022 Cadastro: ".concat(flow.data.links.signup));
        }
        lines.push('');
    }
    // Regras globais
    if (flow.globalRules && flow.globalRules.length > 0) {
        lines.push('REGRAS:');
        for (var _c = 0, _d = flow.globalRules.slice(0, 10); _c < _d.length; _c++) {
            var rule = _d[_c];
            lines.push("\u2022 ".concat(rule));
        }
        lines.push('');
    }
    // Descrição e info adicional
    if (description) {
        lines.push('DESCRIÇÃO:');
        lines.push(description);
        lines.push('');
    }
    if (additionalInfo) {
        lines.push('INFORMAÇÕES ADICIONAIS:');
        lines.push(additionalInfo);
        lines.push('');
    }
    // Instruções finais
    lines.push('INSTRUÇÕES:');
    lines.push('• Seja amigável e profissional');
    lines.push('• Respostas curtas e objetivas para WhatsApp');
    lines.push('• Use no máximo 2 emojis por mensagem');
    lines.push('• Nunca invente informações');
    return lines.join('\n');
}
// ═══════════════════════════════════════════════════════════════════════════
function resolveDesiredFlowType(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, deliveryConfigs, deliveryError, deliveryConfig, err_3, productsConfig, _b, schedulingConfig, _c, courseConfig, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_config')
                            .select('is_active, send_to_ai')
                            .eq('user_id', userId)];
                case 1:
                    _a = _e.sent(), deliveryConfigs = _a.data, deliveryError = _a.error;
                    deliveryConfig = deliveryConfigs === null || deliveryConfigs === void 0 ? void 0 : deliveryConfigs[0];
                    console.log("\uD83D\uDD0D [resolveDesiredFlowType] DELIVERY check - is_active: ".concat(deliveryConfig === null || deliveryConfig === void 0 ? void 0 : deliveryConfig.is_active, ", send_to_ai: ").concat(deliveryConfig === null || deliveryConfig === void 0 ? void 0 : deliveryConfig.send_to_ai, ", error: ").concat((deliveryError === null || deliveryError === void 0 ? void 0 : deliveryError.message) || 'none', ", count: ").concat((deliveryConfigs === null || deliveryConfigs === void 0 ? void 0 : deliveryConfigs.length) || 0));
                    // Verificar apenas se NÃO há erro e is_active é true
                    if (!deliveryError && (deliveryConfig === null || deliveryConfig === void 0 ? void 0 : deliveryConfig.is_active) === true) {
                        console.log("\uD83D\uDCE6 [resolveDesiredFlowType] \u2192 DELIVERY (ativo)");
                        return [2 /*return*/, 'DELIVERY'];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    err_3 = _e.sent();
                    console.log("\u274C [resolveDesiredFlowType] DELIVERY erro: ".concat((err_3 === null || err_3 === void 0 ? void 0 : err_3.message) || err_3));
                    return [3 /*break*/, 3];
                case 3:
                    _e.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('products_config')
                            .select('is_active, send_to_ai')
                            .eq('user_id', userId)
                            .single()];
                case 4:
                    productsConfig = (_e.sent()).data;
                    if ((productsConfig === null || productsConfig === void 0 ? void 0 : productsConfig.is_active) && (productsConfig === null || productsConfig === void 0 ? void 0 : productsConfig.send_to_ai) !== false) {
                        console.log("\uD83D\uDECD\uFE0F [resolveDesiredFlowType] \u2192 VENDAS (ativo)");
                        return [2 /*return*/, 'VENDAS'];
                    }
                    return [3 /*break*/, 6];
                case 5:
                    _b = _e.sent();
                    return [3 /*break*/, 6];
                case 6:
                    _e.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('scheduling_config')
                            .select('is_enabled')
                            .eq('user_id', userId)
                            .single()];
                case 7:
                    schedulingConfig = (_e.sent()).data;
                    if (schedulingConfig === null || schedulingConfig === void 0 ? void 0 : schedulingConfig.is_enabled) {
                        console.log("\uD83D\uDCC5 [resolveDesiredFlowType] \u2192 AGENDAMENTO (ativo)");
                        return [2 /*return*/, 'AGENDAMENTO'];
                    }
                    return [3 /*break*/, 9];
                case 8:
                    _c = _e.sent();
                    return [3 /*break*/, 9];
                case 9:
                    _e.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('course_config')
                            .select('is_active, send_to_ai')
                            .eq('user_id', userId)
                            .single()];
                case 10:
                    courseConfig = (_e.sent()).data;
                    if ((courseConfig === null || courseConfig === void 0 ? void 0 : courseConfig.is_active) && (courseConfig === null || courseConfig === void 0 ? void 0 : courseConfig.send_to_ai) !== false) {
                        console.log("\uD83C\uDF93 [resolveDesiredFlowType] \u2192 CURSO (ativo)");
                        return [2 /*return*/, 'CURSO'];
                    }
                    return [3 /*break*/, 12];
                case 11:
                    _d = _e.sent();
                    return [3 /*break*/, 12];
                case 12:
                    // 5. FALLBACK: GENERICO com fluxo invisível por trás
                    // Mesmo quando NENHUM módulo está ativo, o sistema executa um fluxo determinístico
                    console.log("\uD83E\uDD16 [resolveDesiredFlowType] \u2192 GENERICO (fallback com fluxo invis\u00EDvel)");
                    return [2 /*return*/, 'GENERICO'];
            }
        });
    });
}
function buildFlowFromPromptWithType(prompt, flowType, mistralApiKey) {
    var analyzer = new FlowBuilder_1.PromptAnalyzer();
    var builder = new FlowBuilder_1.FlowBuilder(undefined, mistralApiKey);
    var agentName = analyzer.extractAgentName(prompt) || 'Assistente';
    var businessName = analyzer.extractBusinessName(prompt) || 'Empresa';
    var personality = analyzer.extractPersonality(prompt) || 'amigavel e profissional';
    var flow;
    switch (flowType) {
        case 'DELIVERY':
            flow = builder.buildDeliveryFlow(agentName, businessName, personality);
            break;
        case 'VENDAS':
            flow = builder.buildVendasFlow(agentName, businessName, personality);
            break;
        case 'AGENDAMENTO':
            flow = builder.buildAgendamentoFlow(agentName, businessName, personality);
            break;
        case 'SUPORTE':
            flow = builder.buildSuporteFlow(agentName, businessName, personality);
            break;
        case 'CURSO':
            flow = builder.buildCursoFlow(agentName, businessName, personality);
            break;
        default:
            flow = builder.buildGenericoFlow(agentName, businessName, personality);
    }
    flow.data = flow.data || {};
    flow.data.prices = analyzer.extractPrices(prompt);
    flow.data.links = analyzer.extractLinks(prompt);
    flow.data.coupons = analyzer.extractCoupons(prompt);
    flow.globalRules = analyzer.extractGlobalRules(prompt);
    flow.sourcePrompt = prompt;
    return flow;
}
function buildFlowForUserPrompt(userId, prompt) {
    return __awaiter(this, void 0, void 0, function () {
        var desiredType;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDesiredFlowType(userId)];
                case 1:
                    desiredType = _a.sent();
                    return [2 /*return*/, buildFlowFromPromptWithType(prompt, desiredType)];
            }
        });
    });
}
