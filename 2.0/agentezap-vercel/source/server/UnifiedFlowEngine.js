"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 UNIFIED FLOW ENGINE - Motor Híbrido Unificado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARQUITETURA HÍBRIDA:
 * 1. IA INTERPRETA → Entende o que o cliente quer (qualquer jeito de falar)
 * 2. SISTEMA EXECUTA → Busca dados, calcula, move estados (determinístico)
 * 3. IA HUMANIZA → Resposta natural, anti-bloqueio (opcional)
 *
 * SUPORTA:
 * - DELIVERY: Cardápio, carrinho, pedidos (ex: pizzarias)
 * - VENDAS: Funil de vendas, preços, demos (ex: AgenteZap)
 * - AGENDAMENTO: Horários, confirmações, cancelamentos
 * - SUPORTE: FAQ, tickets, encaminhamentos
 * - GENERICO: Atendimento livre baseado no prompt
 *
 * INTEGRAÇÃO:
 * - FlowBuilder: Converte prompts em FlowDefinitions
 * - FlowStorage: Persiste fluxos no Supabase
 * - HybridFlowEngine: Executa fluxos com IA híbrida
 *
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
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
exports.FLOW_MIGRATION_SQL = exports.UnifiedFlowEngine = exports.AIHumanizer = exports.SystemExecutor = exports.AIInterpreter = exports.FlowStorage = void 0;
var supabaseAuth_1 = require("./supabaseAuth");
var FlowBuilder_1 = require("./FlowBuilder");
var llm_1 = require("./llm");
// ═══════════════════════════════════════════════════════════════════════════
// FLOW STORAGE - Persistência de Fluxos
// ═══════════════════════════════════════════════════════════════════════════
var FlowStorage = /** @class */ (function () {
    function FlowStorage() {
    }
    /**
     * Salva ou atualiza FlowDefinition no banco
     */
    FlowStorage.saveFlow = function (userId, flow) {
        return __awaiter(this, void 0, void 0, function () {
            var error, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('agent_flows')
                                .upsert({
                                user_id: userId,
                                flow_id: flow.id,
                                flow_type: flow.type,
                                flow_definition: flow,
                                business_name: flow.businessName,
                                agent_name: flow.agentName,
                                version: flow.version,
                                updated_at: new Date().toISOString()
                            }, {
                                onConflict: 'user_id'
                            })];
                    case 1:
                        error = (_a.sent()).error;
                        if (error) {
                            console.error("[FlowStorage] Erro ao salvar flow:", error);
                            return [2 /*return*/, false];
                        }
                        console.log("[FlowStorage] \u2705 Flow salvo: ".concat(flow.id, " (").concat(flow.type, ") para user ").concat(userId));
                        return [2 /*return*/, true];
                    case 2:
                        err_1 = _a.sent();
                        console.error("[FlowStorage] Erro:", err_1);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Carrega FlowDefinition do usuário
     */
    FlowStorage.loadFlow = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, err_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('agent_flows')
                                .select('flow_definition')
                                .eq('user_id', userId)
                                .single()];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error) {
                            if (error.code !== 'PGRST116') { // Não encontrado
                                console.error("[FlowStorage] Erro ao carregar flow:", error);
                            }
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, data === null || data === void 0 ? void 0 : data.flow_definition];
                    case 2:
                        err_2 = _b.sent();
                        console.error("[FlowStorage] Erro:", err_2);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Salva estado da conversa
     */
    FlowStorage.saveConversationState = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            var error, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('conversation_flow_states')
                                .upsert({
                                conversation_id: state.conversationId,
                                user_id: state.userId,
                                flow_id: state.flowId,
                                current_state: state.currentState,
                                data: state.data,
                                history: state.history,
                                updated_at: new Date().toISOString()
                            }, {
                                onConflict: 'conversation_id'
                            })];
                    case 1:
                        error = (_a.sent()).error;
                        if (error) {
                            console.error("[FlowStorage] Erro ao salvar estado:", error);
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/, true];
                    case 2:
                        err_3 = _a.sent();
                        console.error("[FlowStorage] Erro:", err_3);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Carrega estado da conversa
     */
    FlowStorage.loadConversationState = function (conversationId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, err_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('conversation_flow_states')
                                .select('*')
                                .eq('conversation_id', conversationId)
                                .single()];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error) {
                            if (error.code !== 'PGRST116') {
                                console.error("[FlowStorage] Erro ao carregar estado:", error);
                            }
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, {
                                userId: data.user_id,
                                conversationId: data.conversation_id,
                                flowId: data.flow_id,
                                currentState: data.current_state,
                                data: data.data || {},
                                history: data.history || [],
                                createdAt: new Date(data.created_at),
                                updatedAt: new Date(data.updated_at)
                            }];
                    case 2:
                        err_4 = _b.sent();
                        console.error("[FlowStorage] Erro:", err_4);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return FlowStorage;
}());
exports.FlowStorage = FlowStorage;
// ═══════════════════════════════════════════════════════════════════════════
// AI INTERPRETER - Detecta Intenção usando IA
// ═══════════════════════════════════════════════════════════════════════════
var AIInterpreter = /** @class */ (function () {
    // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
    function AIInterpreter() {
        // Não precisa mais de apiKey ou model - usa config do sistema
        console.log("[AIInterpreter] Inicializado com OpenRouter/Chutes");
    }
    /**
     * Detecta intenção do usuário com base no FlowDefinition
     */
    AIInterpreter.prototype.detectIntent = function (message, flow, currentState, context) {
        return __awaiter(this, void 0, void 0, function () {
            var state, possibleIntents, intentDescriptions, systemPrompt, messages, response, text, jsonMatch, result, err_5;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        state = flow.states[currentState];
                        if (!state) {
                            return [2 /*return*/, { intent: 'UNKNOWN', confidence: 0 }];
                        }
                        // Verificar se transitions existe
                        if (!state.transitions || !Array.isArray(state.transitions)) {
                            console.warn("[AIInterpreter] Estado ".concat(currentState, " n\u00E3o tem transitions v\u00E1lidas"));
                            return [2 /*return*/, { intent: 'UNKNOWN', confidence: 0 }];
                        }
                        possibleIntents = state.transitions.map(function (t) { return t.intent; });
                        intentDescriptions = possibleIntents.map(function (intentId) {
                            var intent = flow.intents[intentId];
                            return intent
                                ? "".concat(intentId, ": Exemplos: \"").concat(intent.examples.slice(0, 3).join('", "'), "\"")
                                : intentId;
                        }).join('\n');
                        systemPrompt = "Voc\u00EA \u00E9 um analisador de inten\u00E7\u00F5es para atendimento via WhatsApp.\nNeg\u00F3cio: ".concat(flow.businessName, "\nAgente: ").concat(flow.agentName, "\nEstado atual: ").concat(currentState, "\n\nINTENTS POSS\u00CDVEIS NESTE ESTADO:\n").concat(intentDescriptions, "\n\nTAREFA:\nAnalise a mensagem do cliente e identifique qual intent ela representa.\nRetorne APENAS JSON v\u00E1lido no formato:\n{\n  \"intent\": \"NOME_DO_INTENT\",\n  \"confidence\": 0-100,\n  \"extractedData\": { ... }  // dados extra\u00EDdos se houver (ex: quantidade, item, etc)\n}\n\nREGRAS:\n- Se n\u00E3o tiver certeza, use confidence baixa\n- Se n\u00E3o reconhecer, retorne intent: \"UNKNOWN\"\n- Extraia dados relevantes (n\u00FAmeros, nomes, etc)");
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        messages = [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: "Mensagem do cliente: \"".concat(message, "\"") }
                        ];
                        return [4 /*yield*/, (0, llm_1.chatComplete)({
                                messages: messages,
                                temperature: 0.1,
                                maxTokens: 200
                            })];
                    case 2:
                        response = _e.sent();
                        text = ((_d = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || '{}';
                        jsonMatch = text.match(/\{[\s\S]*\}/);
                        result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
                        return [2 /*return*/, {
                                intent: result.intent || 'UNKNOWN',
                                confidence: result.confidence || 0,
                                extractedData: result.extractedData
                            }];
                    case 3:
                        err_5 = _e.sent();
                        console.error("[AIInterpreter] Erro na detec\u00E7\u00E3o:", err_5);
                        return [2 /*return*/, { intent: 'UNKNOWN', confidence: 0 }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Detecção rápida usando regex (fallback sem IA)
     */
    AIInterpreter.prototype.detectIntentFast = function (message, flow, currentState) {
        var state = flow.states[currentState];
        if (!state) {
            return { intent: 'UNKNOWN', confidence: 0 };
        }
        var msgLower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Verificar cada intent possível
        for (var _i = 0, _a = state.transitions; _i < _a.length; _i++) {
            var transition = _a[_i];
            var intent = flow.intents[transition.intent];
            if (!intent)
                continue;
            // Verificar padrões regex
            if (intent.patterns) {
                for (var _b = 0, _c = intent.patterns; _b < _c.length; _b++) {
                    var pattern = _c[_b];
                    var regex = new RegExp(pattern, 'i');
                    if (regex.test(msgLower)) {
                        return { intent: transition.intent, confidence: 90 };
                    }
                }
            }
            // Verificar exemplos (match parcial)
            for (var _d = 0, _e = intent.examples; _d < _e.length; _d++) {
                var example = _e[_d];
                var exampleLower = example.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (msgLower.includes(exampleLower) || exampleLower.includes(msgLower)) {
                    return { intent: transition.intent, confidence: 70 };
                }
            }
        }
        // Fallback: GREETING para mensagens curtas de saudação
        if (msgLower.match(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|eae|hey|hi)\s*[!?,.]?$/)) {
            return { intent: 'GREETING', confidence: 95 };
        }
        return { intent: 'UNKNOWN', confidence: 0 };
    };
    return AIInterpreter;
}());
exports.AIInterpreter = AIInterpreter;
// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM EXECUTOR - Executa Ações Deterministicamente
// ═══════════════════════════════════════════════════════════════════════════
var SystemExecutor = /** @class */ (function () {
    function SystemExecutor() {
    }
    /**
     * Executa ação e retorna resposta do sistema
     * AGORA COM INTEGRAÇÃO REAL COM O BANCO DE DADOS! 🚀
     */
    SystemExecutor.prototype.execute = function (flow, action, currentState, nextState, data, extractedData, userId, userMessage) {
        return __awaiter(this, void 0, void 0, function () {
            var mergedData, actionName, template, response, mediaActions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mergedData = __assign(__assign({}, data), extractedData);
                        // 🛒 Inicializar carrinho se não existir (para fluxos DELIVERY)
                        if (flow.type === 'DELIVERY' && !mergedData.cart) {
                            mergedData.cart = [];
                            mergedData.total = 0;
                        }
                        if (!(action.type === 'DATA' && userId)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadRealData(action.dataSource, mergedData, flow, userId)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        actionName = action.name || '';
                        if (!(flow.type === 'DELIVERY' && userId)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.processDeliveryAction(actionName, mergedData, extractedData, userId)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        template = action.template || '';
                        if (!(template.includes('{response}') && !mergedData.response && userId)) return [3 /*break*/, 6];
                        console.log("\uD83D\uDCE6 [SystemExecutor] Template usa {response} - carregando dados do contexto...");
                        return [4 /*yield*/, this.loadContextualData(mergedData, flow, userId, userMessage)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        response = this.processTemplate(template, mergedData, flow);
                        mediaActions = [];
                        if (action.mediaTag) {
                            mediaActions = [{ tag: action.mediaTag, type: 'send' }];
                        }
                        return [2 /*return*/, {
                                response: response,
                                newData: mergedData,
                                mediaActions: mediaActions
                            }];
                }
            });
        });
    };
    /**
     * 🛒 Processa ações específicas de Delivery (ADD_TO_CART, REMOVE_FROM_CART, etc)
     */
    SystemExecutor.prototype.processDeliveryAction = function (actionName, data, extractedData, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var productName, quantity, _a, menuItem_1, existingIndex, removeIndex, removed;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("\uD83D\uDED2 [SystemExecutor] Processando a\u00E7\u00E3o delivery: ".concat(actionName));
                        console.log("\uD83D\uDED2 [SystemExecutor] extractedData:", JSON.stringify(extractedData || {}));
                        // Garantir que cart existe
                        if (!data.cart)
                            data.cart = [];
                        if (typeof data.total !== 'number')
                            data.total = 0;
                        productName = (extractedData === null || extractedData === void 0 ? void 0 : extractedData.product) || (extractedData === null || extractedData === void 0 ? void 0 : extractedData.item);
                        quantity = (extractedData === null || extractedData === void 0 ? void 0 : extractedData.quantity) || 1;
                        _a = actionName;
                        switch (_a) {
                            case 'Adicionar ao Carrinho': return [3 /*break*/, 1];
                            case 'ADD_TO_CART': return [3 /*break*/, 1];
                            case 'Remover do Carrinho': return [3 /*break*/, 3];
                            case 'REMOVE_FROM_CART': return [3 /*break*/, 3];
                            case 'Mostrar Carrinho': return [3 /*break*/, 4];
                            case 'SHOW_CART': return [3 /*break*/, 4];
                            case 'Cancelar': return [3 /*break*/, 5];
                            case 'CANCEL': return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 6];
                    case 1:
                        if (!productName || !userId) {
                            console.log("\uD83D\uDED2 [SystemExecutor] Sem produto ou userId para adicionar");
                            return [3 /*break*/, 7];
                        }
                        return [4 /*yield*/, this.findMenuItemByName(productName, userId)];
                    case 2:
                        menuItem_1 = _b.sent();
                        if (!menuItem_1) {
                            console.log("\uD83D\uDED2 [SystemExecutor] Produto \"".concat(productName, "\" n\u00E3o encontrado no menu"));
                            data.error = "Produto \"".concat(productName, "\" n\u00E3o encontrado no card\u00E1pio");
                            return [3 /*break*/, 7];
                        }
                        console.log("\uD83D\uDED2 [SystemExecutor] Item encontrado: ".concat(menuItem_1.name, " - R$ ").concat(menuItem_1.price));
                        existingIndex = data.cart.findIndex(function (item) {
                            return item.name.toLowerCase() === menuItem_1.name.toLowerCase();
                        });
                        if (existingIndex >= 0) {
                            // Incrementar quantidade
                            data.cart[existingIndex].quantity += quantity;
                        }
                        else {
                            // Adicionar novo item
                            data.cart.push({
                                name: menuItem_1.name,
                                quantity: quantity,
                                unit_price: parseFloat(menuItem_1.price)
                            });
                        }
                        // Recalcular total
                        this.recalculateTotal(data);
                        // Preencher variáveis do template
                        data.product = menuItem_1.name;
                        data.quantity = quantity;
                        data.item_total = (quantity * parseFloat(menuItem_1.price)).toFixed(2);
                        this.buildCartSummary(data);
                        console.log("\uD83D\uDED2 [SystemExecutor] \u2705 Carrinho atualizado:", JSON.stringify(data.cart));
                        console.log("\uD83D\uDED2 [SystemExecutor] \u2705 Total: R$ ".concat(data.total));
                        return [3 /*break*/, 7];
                    case 3:
                        {
                            if (!productName)
                                return [3 /*break*/, 7];
                            removeIndex = data.cart.findIndex(function (item) {
                                return item.name.toLowerCase().includes(productName.toLowerCase());
                            });
                            if (removeIndex >= 0) {
                                removed = data.cart.splice(removeIndex, 1)[0];
                                data.product = removed.name;
                                data.quantity = removed.quantity;
                                this.recalculateTotal(data);
                                this.buildCartSummary(data);
                                console.log("\uD83D\uDED2 [SystemExecutor] \u2705 Removido: ".concat(removed.name));
                            }
                            return [3 /*break*/, 7];
                        }
                        _b.label = 4;
                    case 4:
                        {
                            this.buildCartSummary(data);
                            return [3 /*break*/, 7];
                        }
                        _b.label = 5;
                    case 5:
                        {
                            data.cart = [];
                            data.total = 0;
                            data.cart_summary = 'Carrinho vazio';
                            console.log("\uD83D\uDED2 [SystemExecutor] \u2705 Pedido cancelado");
                            return [3 /*break*/, 7];
                        }
                        _b.label = 6;
                    case 6:
                        // Para outras ações, apenas construir resumo se há carrinho
                        if (data.cart.length > 0) {
                            this.buildCartSummary(data);
                        }
                        _b.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🔍 Busca item do menu pelo nome (fuzzy match) com preço REAL
     */
    SystemExecutor.prototype.findMenuItemByName = function (productName, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, items, error, searchLower_1, found, words_1, err_6;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('menu_items')
                                .select('name, price, description')
                                .eq('user_id', userId)
                                .eq('is_available', true)];
                    case 1:
                        _a = _b.sent(), items = _a.data, error = _a.error;
                        if (error || !items || items.length === 0) {
                            console.log("\uD83D\uDD0D [SystemExecutor] Nenhum item encontrado no menu de ".concat(userId));
                            return [2 /*return*/, null];
                        }
                        searchLower_1 = productName.toLowerCase();
                        found = items.find(function (item) {
                            return item.name.toLowerCase() === searchLower_1;
                        });
                        // Segundo: match parcial
                        if (!found) {
                            found = items.find(function (item) {
                                return item.name.toLowerCase().includes(searchLower_1) ||
                                    searchLower_1.includes(item.name.toLowerCase());
                            });
                        }
                        // Terceiro: palavras-chave
                        if (!found) {
                            words_1 = searchLower_1.split(/\s+/);
                            found = items.find(function (item) {
                                var itemLower = item.name.toLowerCase();
                                return words_1.some(function (word) { return word.length > 2 && itemLower.includes(word); });
                            });
                        }
                        return [2 /*return*/, found || null];
                    case 2:
                        err_6 = _b.sent();
                        console.error("\uD83D\uDD0D [SystemExecutor] Erro buscando menu:", err_6);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 💰 Recalcula total do carrinho
     */
    SystemExecutor.prototype.recalculateTotal = function (data) {
        data.total = data.cart.reduce(function (sum, item) {
            return sum + (item.quantity * item.unit_price);
        }, 0);
    };
    /**
     * 📝 Constrói resumo do carrinho para exibição
     */
    SystemExecutor.prototype.buildCartSummary = function (data) {
        if (!data.cart || data.cart.length === 0) {
            data.cart_summary = 'Carrinho vazio';
            data.total = '0,00';
            return;
        }
        data.cart_summary = data.cart.map(function (item) {
            var itemTotal = (item.quantity * item.unit_price).toFixed(2).replace('.', ',');
            return "\u2022 ".concat(item.quantity, "x ").concat(item.name, " - R$ ").concat(itemTotal);
        }).join('\n');
        data.total = typeof data.total === 'number'
            ? data.total.toFixed(2).replace('.', ',')
            : data.total;
    };
    /**
     * 🔧 Carrega dados contextuais quando o template usa {response}
     * Isso é necessário para fluxos GENERICO que usam PROVIDE_INFO com {response}
     */
    SystemExecutor.prototype.loadContextualData = function (data, flow, userId, userMessage) {
        return __awaiter(this, void 0, void 0, function () {
            var msgLower, isMenuQuery, isDeliveryQuery, isHoursQuery, deliveryConfig, displayInstructions, businessName, askFirstKeywords, shouldAskFirst, categoryNames;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\uD83D\uDCE6 [SystemExecutor] Carregando dados contextuais para flow type: ".concat(flow.type));
                        msgLower = (userMessage || '').toLowerCase();
                        isMenuQuery = /cardápio|menu|pizza|pizzas|lanche|hamburguer|comida|prato|vocês têm|o que tem|quais|opções/.test(msgLower);
                        isDeliveryQuery = /entrega|delivery|taxa|frete|tempo|demora/.test(msgLower);
                        isHoursQuery = /horário|abre|fecha|funciona|funcionamento/.test(msgLower);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('delivery_config')
                                .select('display_instructions, business_name')
                                .eq('user_id', userId)
                                .single()];
                    case 1:
                        deliveryConfig = (_a.sent()).data;
                        displayInstructions = (deliveryConfig === null || deliveryConfig === void 0 ? void 0 : deliveryConfig.display_instructions) || '';
                        businessName = (deliveryConfig === null || deliveryConfig === void 0 ? void 0 : deliveryConfig.business_name) || flow.businessName || 'nosso estabelecimento';
                        askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
                        shouldAskFirst = askFirstKeywords.some(function (kw) { return displayInstructions.toLowerCase().includes(kw); });
                        console.log("\uD83D\uDCE6 [SystemExecutor] displayInstructions: \"".concat(displayInstructions.substring(0, 80), "...\""));
                        console.log("\uD83D\uDCE6 [SystemExecutor] shouldAskFirst = ".concat(shouldAskFirst));
                        if (!isMenuQuery) return [3 /*break*/, 3];
                        console.log("\uD83D\uDCE6 [SystemExecutor] Detectada pergunta sobre menu - carregando card\u00E1pio...");
                        return [4 /*yield*/, this.loadMenuData(data, userId, flow)];
                    case 2:
                        _a.sent();
                        // 🔥 SE "PERGUNTAR PRIMEIRO" ESTIVER ATIVO, MOSTRAR APENAS CATEGORIAS
                        if (shouldAskFirst && data.menu_categories && data.menu_categories.length > 0) {
                            console.log("\uD83D\uDCE6 [SystemExecutor] \u26A0\uFE0F MODO PERGUNTAR PRIMEIRO ATIVO! Mostrando apenas categorias.");
                            categoryNames = data.menu_categories.map(function (c) { return c.name; }).join(', ');
                            data.response = "Bem-vindo(a) ao ".concat(businessName, "! \uD83D\uDE0A\n\nTemos: ").concat(categoryNames, ".\n\nQual voc\u00EA gostaria de ver?");
                            data.askingCategory = true; // Flag para indicar que está perguntando categoria
                            return [2 /*return*/];
                        }
                        if (data.menu_formatted && data.menu_formatted !== 'Cardápio não disponível no momento.') {
                            data.response = "Aqui est\u00E1 nosso card\u00E1pio:\n\n".concat(data.menu_formatted);
                        }
                        else {
                            // Fallback se não há menu cadastrado
                            data.response = "Nosso card\u00E1pio est\u00E1 sendo atualizado. Por favor, entre em contato conosco para mais informa\u00E7\u00F5es!";
                        }
                        return [2 /*return*/];
                    case 3:
                        if (!isDeliveryQuery) return [3 /*break*/, 5];
                        console.log("\uD83D\uDCE6 [SystemExecutor] Detectada pergunta sobre delivery - carregando config...");
                        return [4 /*yield*/, this.loadDeliveryFee(data, userId)];
                    case 4:
                        _a.sent();
                        data.response = "\uD83D\uDEF5 *Informa\u00E7\u00F5es de Entrega:*\n\n" +
                            "\uD83D\uDCCD Taxa de entrega: R$ ".concat(data.delivery_fee || '5,00', "\n") +
                            "\u23F1\uFE0F Tempo estimado: ".concat(data.delivery_time || '45 minutos', "\n") +
                            "\uD83D\uDCB0 Pedido m\u00EDnimo: R$ ".concat(data.min_order || '20,00');
                        return [2 /*return*/];
                    case 5:
                        if (!isHoursQuery) return [3 /*break*/, 7];
                        console.log("\uD83D\uDCE6 [SystemExecutor] Detectada pergunta sobre hor\u00E1rio - carregando config...");
                        return [4 /*yield*/, this.loadBusinessHours(data, userId)];
                    case 6:
                        _a.sent();
                        if (data.hours) {
                            data.response = "\uD83D\uDD50 *Nosso hor\u00E1rio de funcionamento:*\n\n".concat(data.hours);
                        }
                        else {
                            data.response = "Nosso hor\u00E1rio de funcionamento est\u00E1 dispon\u00EDvel em nosso site ou redes sociais.";
                        }
                        return [2 /*return*/];
                    case 7:
                        // Fallback genérico - se nenhum contexto específico foi detectado
                        console.log("\uD83D\uDCE6 [SystemExecutor] Nenhum contexto espec\u00EDfico detectado - usando resposta gen\u00E9rica");
                        data.response = "Como posso ajudar voc\u00EA? Posso fornecer informa\u00E7\u00F5es sobre nosso card\u00E1pio, hor\u00E1rios de funcionamento ou delivery.";
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🚀 Carrega dados REAIS do banco de dados
     */
    SystemExecutor.prototype.loadRealData = function (dataSource, data, flow, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("\uD83D\uDCE6 [SystemExecutor] Carregando dados: ".concat(dataSource, " para user ").concat(userId));
                        _a = dataSource;
                        switch (_a) {
                            case 'menu': return [3 /*break*/, 1];
                            case 'business_hours': return [3 /*break*/, 3];
                            case 'delivery_fee': return [3 /*break*/, 5];
                            case 'products': return [3 /*break*/, 7];
                        }
                        return [3 /*break*/, 9];
                    case 1: return [4 /*yield*/, this.loadMenuData(data, userId, flow)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 3: return [4 /*yield*/, this.loadBusinessHours(data, userId)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 5: return [4 /*yield*/, this.loadDeliveryFee(data, userId)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 7: return [4 /*yield*/, this.loadProductsData(data, userId)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        console.log("\uD83D\uDCE6 [SystemExecutor] DataSource n\u00E3o reconhecido: ".concat(dataSource));
                        _b.label = 10;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🍕 Carrega menu de delivery do banco
     */
    SystemExecutor.prototype.loadMenuData = function (data, userId, flow) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, categories, catError, _b, items, itemError, menuFormatted, usedItemIds_1, _loop_1, _i, _c, category, uncategorizedItems, _d, uncategorizedItems_1, item, price, err_7;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('menu_categories')
                                .select('id, name, display_order')
                                .eq('user_id', userId)
                                .eq('is_active', true)
                                .order('display_order')];
                    case 1:
                        _a = _e.sent(), categories = _a.data, catError = _a.error;
                        if (catError)
                            throw catError;
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('menu_items')
                                .select('id, name, description, price, category_id, is_available')
                                .eq('user_id', userId)
                                .eq('is_available', true)
                                .order('display_order')];
                    case 2:
                        _b = _e.sent(), items = _b.data, itemError = _b.error;
                        if (itemError)
                            throw itemError;
                        console.log("\uD83D\uDCE6 [SystemExecutor] Categorias: ".concat((categories === null || categories === void 0 ? void 0 : categories.length) || 0, ", Itens: ").concat((items === null || items === void 0 ? void 0 : items.length) || 0));
                        menuFormatted = '';
                        usedItemIds_1 = new Set();
                        _loop_1 = function (category) {
                            var categoryItems = (items || []).filter(function (item) { return item.category_id === category.id; });
                            if (categoryItems.length === 0)
                                return "continue";
                            // Emoji baseado no nome da categoria
                            var emoji = category.name.toLowerCase().includes('pizza') ? '🍕' : '📋';
                            menuFormatted += "\n".concat(emoji, " *").concat(category.name, "*\n\n");
                            for (var _f = 0, categoryItems_1 = categoryItems; _f < categoryItems_1.length; _f++) {
                                var item = categoryItems_1[_f];
                                var price = parseFloat(item.price).toFixed(2);
                                menuFormatted += "".concat(item.name, " - R$ ").concat(price, "\n");
                                if (item.description) {
                                    menuFormatted += "".concat(item.description, "\n\n");
                                }
                                else {
                                    menuFormatted += "\n";
                                }
                                usedItemIds_1.add(item.id);
                            }
                        };
                        // Primeiro, itens com categoria
                        for (_i = 0, _c = categories || []; _i < _c.length; _i++) {
                            category = _c[_i];
                            _loop_1(category);
                        }
                        uncategorizedItems = (items || []).filter(function (item) { return !item.category_id || !usedItemIds_1.has(item.id); });
                        if (uncategorizedItems.length > 0) {
                            if (menuFormatted) {
                                menuFormatted += "\n\uD83D\uDCCB *Outros*\n\n";
                            }
                            for (_d = 0, uncategorizedItems_1 = uncategorizedItems; _d < uncategorizedItems_1.length; _d++) {
                                item = uncategorizedItems_1[_d];
                                price = parseFloat(item.price).toFixed(2);
                                menuFormatted += "".concat(item.name, " - R$ ").concat(price, "\n");
                                if (item.description) {
                                    menuFormatted += "".concat(item.description, "\n\n");
                                }
                                else {
                                    menuFormatted += "\n";
                                }
                            }
                        }
                        data.menu_formatted = menuFormatted.trim() || 'Cardápio não disponível no momento.';
                        data.menu_items = items || [];
                        data.menu_categories = categories || [];
                        console.log("\uD83D\uDCE6 [SystemExecutor] \u2705 Menu carregado: ".concat((items === null || items === void 0 ? void 0 : items.length) || 0, " itens, formatado: ").concat(data.menu_formatted.substring(0, 100), "..."));
                        return [3 /*break*/, 4];
                    case 3:
                        err_7 = _e.sent();
                        console.error("\uD83D\uDCE6 [SystemExecutor] \u274C Erro ao carregar menu:", err_7);
                        data.menu_formatted = 'Cardápio não disponível no momento.';
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🕐 Carrega horário de funcionamento
     */
    SystemExecutor.prototype.loadBusinessHours = function (data, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, config, error, hours, dayNames, hoursFormatted, _i, _b, _c, day, h, hourData, err_8;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('delivery_config')
                                .select('opening_hours')
                                .eq('user_id', userId)
                                .single()];
                    case 1:
                        _a = _d.sent(), config = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        hours = config === null || config === void 0 ? void 0 : config.opening_hours;
                        if (hours) {
                            dayNames = {
                                monday: 'Segunda',
                                tuesday: 'Terça',
                                wednesday: 'Quarta',
                                thursday: 'Quinta',
                                friday: 'Sexta',
                                saturday: 'Sábado',
                                sunday: 'Domingo'
                            };
                            hoursFormatted = '';
                            for (_i = 0, _b = Object.entries(hours); _i < _b.length; _i++) {
                                _c = _b[_i], day = _c[0], h = _c[1];
                                hourData = h;
                                if (hourData.is_open) {
                                    hoursFormatted += "".concat(dayNames[day] || day, ": ").concat(hourData.open, " \u00E0s ").concat(hourData.close, "\n");
                                }
                            }
                            data.hours = hoursFormatted.trim() || 'Consulte nosso horário de funcionamento.';
                        }
                        console.log("\uD83D\uDCE6 [SystemExecutor] \u2705 Hor\u00E1rio carregado");
                        return [3 /*break*/, 3];
                    case 2:
                        err_8 = _d.sent();
                        console.error("\uD83D\uDCE6 [SystemExecutor] \u274C Erro ao carregar hor\u00E1rio:", err_8);
                        data.hours = 'Consulte nosso horário de funcionamento.';
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🛵 Carrega taxa de entrega
     */
    SystemExecutor.prototype.loadDeliveryFee = function (data, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, config, error, err_9;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('delivery_config')
                                .select('delivery_fee, min_order_value, estimated_delivery_time')
                                .eq('user_id', userId)
                                .single()];
                    case 1:
                        _a = _d.sent(), config = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        data.delivery_fee = ((_b = config === null || config === void 0 ? void 0 : config.delivery_fee) === null || _b === void 0 ? void 0 : _b.toFixed(2).replace('.', ',')) || '0,00';
                        data.min_order = ((_c = config === null || config === void 0 ? void 0 : config.min_order_value) === null || _c === void 0 ? void 0 : _c.toFixed(2).replace('.', ',')) || '0,00';
                        data.delivery_time = "".concat((config === null || config === void 0 ? void 0 : config.estimated_delivery_time) || 45, " minutos");
                        console.log("\uD83D\uDCE6 [SystemExecutor] \u2705 Taxa de entrega: R$ ".concat(data.delivery_fee));
                        return [3 /*break*/, 3];
                    case 2:
                        err_9 = _d.sent();
                        console.error("\uD83D\uDCE6 [SystemExecutor] \u274C Erro ao carregar taxa:", err_9);
                        data.delivery_fee = '0,00';
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 📦 Carrega catálogo de produtos (VENDAS)
     */
    SystemExecutor.prototype.loadProductsData = function (data, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, products, error, productsFormatted, currentCategory, _i, _b, product, price, err_10;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, supabaseAuth_1.supabase
                                .from('products')
                                .select('name, price, description, category, stock')
                                .eq('user_id', userId)
                                .eq('is_active', true)
                                .order('category')
                                .limit(50)];
                    case 1:
                        _a = _c.sent(), products = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        productsFormatted = '';
                        currentCategory = '';
                        for (_i = 0, _b = products || []; _i < _b.length; _i++) {
                            product = _b[_i];
                            if (product.category && product.category !== currentCategory) {
                                currentCategory = product.category;
                                productsFormatted += "\n*".concat(currentCategory.toUpperCase(), "*\n");
                            }
                            price = parseFloat(product.price).toFixed(2).replace('.', ',');
                            productsFormatted += "\u2022 ".concat(product.name, " - R$ ").concat(price, "\n");
                            if (product.description) {
                                productsFormatted += "  \u21B3 ".concat(product.description, "\n");
                            }
                        }
                        data.products_formatted = productsFormatted.trim() || 'Produtos não disponíveis no momento.';
                        data.products_list = products || [];
                        console.log("\uD83D\uDCE6 [SystemExecutor] \u2705 Produtos carregados: ".concat((products === null || products === void 0 ? void 0 : products.length) || 0, " itens"));
                        return [3 /*break*/, 3];
                    case 2:
                        err_10 = _c.sent();
                        console.error("\uD83D\uDCE6 [SystemExecutor] \u274C Erro ao carregar produtos:", err_10);
                        data.products_formatted = 'Produtos não disponíveis no momento.';
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Processa template substituindo variáveis
     */
    SystemExecutor.prototype.processTemplate = function (template, data, flow) {
        var _a, _b, _c, _d;
        var result = template;
        // Substituir variáveis do flow (preços, links, cupons)
        if (flow.data) {
            if (flow.data.prices) {
                result = result.replace(/\{price_standard\}/g, ((_a = flow.data.prices.standard) === null || _a === void 0 ? void 0 : _a.toString()) || '');
                result = result.replace(/\{price_promo\}/g, ((_b = flow.data.prices.promo) === null || _b === void 0 ? void 0 : _b.toString()) || '');
                result = result.replace(/\{impl_price\}/g, ((_c = flow.data.prices.implementation) === null || _c === void 0 ? void 0 : _c.toString()) || '');
            }
            if (flow.data.links) {
                result = result.replace(/\{signup_link\}/g, flow.data.links.signup || '');
                result = result.replace(/\{site_link\}/g, flow.data.links.site || '');
            }
            if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
                var firstCoupon = Object.values(flow.data.coupons)[0];
                result = result.replace(/\{coupon_code\}/g, (firstCoupon === null || firstCoupon === void 0 ? void 0 : firstCoupon.code) || '');
                result = result.replace(/\{coupon_discount\}/g, ((_d = firstCoupon === null || firstCoupon === void 0 ? void 0 : firstCoupon.discount) === null || _d === void 0 ? void 0 : _d.toString()) || '');
            }
        }
        // Substituir dados do negócio
        result = result.replace(/\{agent_name\}/g, flow.agentName);
        result = result.replace(/\{business_name\}/g, flow.businessName);
        // Substituir dados da conversa
        for (var _i = 0, _e = Object.entries(data); _i < _e.length; _i++) {
            var _f = _e[_i], key = _f[0], value = _f[1];
            var regex = new RegExp("\\{".concat(key, "\\}"), 'g');
            result = result.replace(regex, String(value || ''));
        }
        return result;
    };
    return SystemExecutor;
}());
exports.SystemExecutor = SystemExecutor;
// ═══════════════════════════════════════════════════════════════════════════
// AI HUMANIZER - Humaniza Respostas (Opcional)
// ═══════════════════════════════════════════════════════════════════════════
var AIHumanizer = /** @class */ (function () {
    // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
    function AIHumanizer() {
        // Não precisa mais de apiKey ou model - usa config do sistema
        console.log("[AIHumanizer] Inicializado com OpenRouter/Chutes");
    }
    /**
     * Humaniza resposta do sistema (anti-bloqueio)
     */
    AIHumanizer.prototype.humanize = function (systemResponse, flow, userMessage, options) {
        return __awaiter(this, void 0, void 0, function () {
            var personality, systemPrompt, messages, response, humanized, err_11;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        personality = (options === null || options === void 0 ? void 0 : options.personality) || flow.agentPersonality || 'amigável e profissional';
                        systemPrompt = "Voc\u00EA \u00E9 ".concat(flow.agentName, " da ").concat(flow.businessName, ".\nPersonalidade: ").concat(personality, "\n\n\u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F TAREFA CR\u00CDTICA - LEIA COM ATEN\u00C7\u00C3O \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F\n\nVoc\u00EA vai receber uma resposta PRONTA do sistema. Sua \u00DANICA fun\u00E7\u00E3o \u00E9:\n- Tornar o texto mais NATURAL e amig\u00E1vel (como WhatsApp)\n- COPIAR TODOS os dados EXATAMENTE como est\u00E3o\n- N\u00C3O adicionar, remover ou modificar NENHUM item, pre\u00E7o ou informa\u00E7\u00E3o\n\n\uD83D\uDEA8 PROIBIDO (voc\u00EA ser\u00E1 REJEITADO se fizer isso):\n\u274C Adicionar itens que N\u00C3O est\u00E3o na resposta original\n\u274C Inventar pre\u00E7os, produtos, sabores, categorias\n\u274C Adicionar exemplos ou sugest\u00F5es extras\n\u274C Expandir listas com itens novos\n\u274C Usar separadores \"\u2501\u2501\u2501\u2501\u2501\" ou formata\u00E7\u00E3o t\u00E9cnica\n\u274C Adicionar t\u00EDtulos como \"NOSSO DELIVERY\", \"INFORMA\u00C7\u00D5ES\"\n\n\u2705 PERMITIDO (fa\u00E7a APENAS isso):\n\u2713 Ajustar pontua\u00E7\u00E3o e gram\u00E1tica\n\u2713 Adicionar 1-2 emojis simples (se ainda n\u00E3o tiver muitos)\n\u2713 Tornar o tom mais amig\u00E1vel e natural\n\u2713 Reformular frases mantendo OS MESMOS dados\n\nEXEMPLO CORRETO:\nOriginal: \"Ol\u00E1!\n\n\uD83C\uDF55 Pizzas\n\nMussarela - R$ 45.00\nQueijo de primeira\n\nQual gostaria?\"\nHumanizado: \"Ol\u00E1! Essas s\u00E3o nossas pizzas:\n\n\uD83C\uDF55 Mussarela - R$ 45,00\nQueijo de primeira qualidade\n\nQual voc\u00EA gostaria de pedir? \uD83D\uDE0A\"\n(Note: MESMO item, MESMO pre\u00E7o, MESMA descri\u00E7\u00E3o - s\u00F3 mudou a forma de escrever)\n\nEXEMPLO ERRADO (N\u00C3O FA\u00C7A ISSO):\nOriginal: \"Ol\u00E1!\n\n\uD83C\uDF55 Pizzas\n\nMussarela - R$ 45.00\nQueijo de primeira\n\nQual gostaria?\"\nERRADO: \"Ol\u00E1! Temos v\u00E1rias pizzas:\n\n\uD83C\uDF55 Mussarela - R$ 45,00\n\uD83C\uDF55 Calabresa - R$ 50,00\n\uD83C\uDF55 Portuguesa - R$ 55,00\n\nQual prefere?\"\n\u274C\u274C\u274C REJEITADO! Adicionou Calabresa e Portuguesa que N\u00C3O existiam!\n\n\u26A1 REGRA DE OURO: Se a resposta tem 1 pizza, retorne 1 pizza. Se tem 5, retorne 5. NUNCA invente!\n\nResponda APENAS com o texto humanizado.");
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        messages = [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: "Mensagem original do cliente: \"".concat(userMessage, "\"\n\nResposta do sistema para humanizar:\n").concat(systemResponse) }
                        ];
                        return [4 /*yield*/, (0, llm_1.chatComplete)({
                                messages: messages,
                                temperature: 0, // ZERO criatividade - apenas reformulação
                                maxTokens: 500
                            })];
                    case 2:
                        response = _e.sent();
                        humanized = ((_d = (_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || systemResponse;
                        // 🛡️ VALIDAÇÃO: Rejeitar se resposta cresceu muito (indica invenção de dados)
                        if (systemResponse.length > 0 && humanized.length > systemResponse.length * 1.3) {
                            console.error("\uD83D\uDEA8 [AIHumanizer] REJEITADO! Resposta cresceu 30%+ - poss\u00EDvel inven\u00E7\u00E3o de dados");
                            console.error("\uD83D\uDCCA Original: ".concat(systemResponse.length, " chars"));
                            console.error("\uD83D\uDCCA Humanized: ".concat(humanized.length, " chars"));
                            console.error("\uD83D\uDCDD Original:\n".concat(systemResponse));
                            console.error("\uD83D\uDCDD Humanized:\n".concat(humanized));
                            console.error("\u26A0\uFE0F Usando resposta original para evitar alucina\u00E7\u00E3o");
                            humanized = systemResponse; // Fallback: usar original se humanizer inventou
                        }
                        console.log("\uD83C\uDFA8 [AIHumanizer] \u2705 Humanizado (".concat(systemResponse.length, " \u2192 ").concat(humanized.length, " chars): \"").concat(humanized.substring(0, 80), "...\""));
                        return [2 /*return*/, humanized];
                    case 3:
                        err_11 = _e.sent();
                        console.error("[AIHumanizer] Erro:", err_11);
                        return [2 /*return*/, systemResponse]; // Fallback para resposta original
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return AIHumanizer;
}());
exports.AIHumanizer = AIHumanizer;
// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FLOW ENGINE - Motor Principal
// ═══════════════════════════════════════════════════════════════════════════
var UnifiedFlowEngine = /** @class */ (function () {
    function UnifiedFlowEngine(config) {
        this.config = config;
        // 🚀 Não precisa mais de apiKey/model - usa config do sistema via chatComplete()
        this.interpreter = new AIInterpreter();
        this.executor = new SystemExecutor();
        this.humanizer = new AIHumanizer();
    }
    /**
     * Processa mensagem do cliente usando o fluxo
     */
    UnifiedFlowEngine.prototype.processMessage = function (userId, conversationId, message, options) {
        return __awaiter(this, void 0, void 0, function () {
            var flow, state, intentResult, currentFlowState, transition, greetingTransition;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\n\uD83D\uDE80 [UnifiedFlowEngine] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
                        console.log("   User: ".concat(userId));
                        console.log("   Conversation: ".concat(conversationId));
                        console.log("   Message: \"".concat(message.substring(0, 50), "...\""));
                        return [4 /*yield*/, FlowStorage.loadFlow(userId)];
                    case 1:
                        flow = _a.sent();
                        if (!flow) {
                            console.log("   \u26A0\uFE0F Nenhum flow encontrado para user ".concat(userId));
                            return [2 /*return*/, null];
                        }
                        console.log("   \uD83D\uDCCB Flow: ".concat(flow.id, " (").concat(flow.type, ")"));
                        return [4 /*yield*/, FlowStorage.loadConversationState(conversationId)];
                    case 2:
                        state = _a.sent();
                        if (!state) {
                            state = {
                                userId: userId,
                                conversationId: conversationId,
                                flowId: flow.id,
                                currentState: flow.initialState,
                                data: {},
                                history: [],
                                createdAt: new Date(),
                                updatedAt: new Date()
                            };
                            console.log("   \uD83C\uDD95 Nova conversa, estado inicial: ".concat(flow.initialState));
                        }
                        else {
                            console.log("   \uD83D\uDCCD Estado atual: ".concat(state.currentState));
                        }
                        if (!((options === null || options === void 0 ? void 0 : options.useAI) !== false)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.interpreter.detectIntent(message, flow, state.currentState, state.data)];
                    case 3:
                        intentResult = _a.sent();
                        console.log("   \uD83C\uDFAF Intent (IA): ".concat(intentResult.intent, " (").concat(intentResult.confidence, "%)"));
                        return [3 /*break*/, 5];
                    case 4:
                        intentResult = this.interpreter.detectIntentFast(message, flow, state.currentState);
                        console.log("   \uD83C\uDFAF Intent (Regex): ".concat(intentResult.intent, " (").concat(intentResult.confidence, "%)"));
                        _a.label = 5;
                    case 5:
                        currentFlowState = flow.states[state.currentState];
                        if (!currentFlowState) {
                            console.log("   \u274C Estado inv\u00E1lido: ".concat(state.currentState));
                            return [2 /*return*/, null];
                        }
                        // 🔧 FIX: Verificar se transitions existe antes de usar .find()
                        if (!currentFlowState.transitions || !Array.isArray(currentFlowState.transitions)) {
                            console.log("   \u26A0\uFE0F Estado ".concat(state.currentState, " n\u00E3o tem transitions definidas"));
                            return [2 /*return*/, null];
                        }
                        transition = currentFlowState.transitions.find(function (t) { return t.intent === intentResult.intent; });
                        if (!transition) {
                            console.log("   \u26A0\uFE0F Sem transi\u00E7\u00E3o para intent ".concat(intentResult.intent, " no estado ").concat(state.currentState));
                            // Fallback: tentar GREETING em qualquer estado
                            if (intentResult.intent === 'UNKNOWN') {
                                greetingTransition = currentFlowState.transitions.find(function (t) { return t.intent === 'GREETING'; });
                                if (greetingTransition) {
                                    console.log("   \uD83D\uDD04 Fallback para GREETING");
                                    return [2 /*return*/, this.executeTransition(flow, greetingTransition, state, message, options)];
                                }
                            }
                            return [2 /*return*/, null];
                        }
                        // 5. Executar transição
                        return [2 /*return*/, this.executeTransition(flow, transition, state, message, options, intentResult.extractedData)];
                }
            });
        });
    };
    /**
     * Executa uma transição específica
     */
    UnifiedFlowEngine.prototype.executeTransition = function (flow, transition, state, message, options, extractedData) {
        return __awaiter(this, void 0, void 0, function () {
            var action, _a, response, newData, mediaActions, finalResponse;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        action = flow.actions[transition.action];
                        if (!action) {
                            console.log("   \u274C A\u00E7\u00E3o n\u00E3o encontrada: ".concat(transition.action));
                            return [2 /*return*/, {
                                    text: 'Desculpe, ocorreu um erro. Tente novamente.',
                                    newState: state.currentState,
                                    intent: transition.intent,
                                    action: transition.action
                                }];
                        }
                        return [4 /*yield*/, this.executor.execute(flow, action, state.currentState, transition.nextState, state.data, extractedData, state.userId, message // 🔧 Passa mensagem do usuário para detectar contexto
                            )];
                    case 1:
                        _a = _b.sent(), response = _a.response, newData = _a.newData, mediaActions = _a.mediaActions;
                        finalResponse = response;
                        if (!((options === null || options === void 0 ? void 0 : options.humanize) !== false && this.config.humanize !== false)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.humanizer.humanize(response, flow, message)];
                    case 2:
                        finalResponse = _b.sent();
                        _b.label = 3;
                    case 3:
                        // Atualizar estado
                        state.currentState = transition.nextState;
                        state.data = newData;
                        state.history.push({
                            role: 'user',
                            message: message,
                            intent: transition.intent,
                            timestamp: new Date()
                        });
                        state.history.push({
                            role: 'assistant',
                            message: finalResponse,
                            action: transition.action,
                            state: transition.nextState,
                            timestamp: new Date()
                        });
                        state.updatedAt = new Date();
                        // Salvar estado
                        return [4 /*yield*/, FlowStorage.saveConversationState(state)];
                    case 4:
                        // Salvar estado
                        _b.sent();
                        console.log("   \u2705 A\u00E7\u00E3o: ".concat(transition.action, " \u2192 Estado: ").concat(transition.nextState));
                        console.log("   \uD83D\uDCDD Resposta: \"".concat(finalResponse.substring(0, 80), "...\""));
                        console.log("\uD83D\uDE80 [UnifiedFlowEngine] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
                        return [2 /*return*/, {
                                text: finalResponse,
                                newState: transition.nextState,
                                intent: transition.intent,
                                action: transition.action,
                                data: newData,
                                mediaActions: mediaActions
                            }];
                }
            });
        });
    };
    /**
     * Cria FlowDefinition a partir de prompt de texto
     */
    UnifiedFlowEngine.createFlowFromPrompt = function (userId, prompt, options) {
        return __awaiter(this, void 0, void 0, function () {
            var builder, flow, saved;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\n\uD83C\uDFD7\uFE0F [UnifiedFlowEngine] Criando flow a partir de prompt...");
                        builder = new FlowBuilder_1.FlowBuilder();
                        return [4 /*yield*/, builder.buildFromPrompt(prompt)];
                    case 1:
                        flow = _a.sent();
                        // Aplicar overrides se fornecidos
                        if (options === null || options === void 0 ? void 0 : options.businessName) {
                            flow.businessName = options.businessName;
                        }
                        return [4 /*yield*/, FlowStorage.saveFlow(userId, flow)];
                    case 2:
                        saved = _a.sent();
                        if (!saved) {
                            console.log("   \u274C Erro ao salvar flow");
                            return [2 /*return*/, null];
                        }
                        console.log("   \u2705 Flow criado: ".concat(flow.id, " (").concat(flow.type, ")"));
                        console.log("   \uD83D\uDCCA Estados: ".concat(Object.keys(flow.states).length));
                        console.log("   \uD83C\uDFAF Inten\u00E7\u00F5es: ".concat(Object.keys(flow.intents).length));
                        console.log("   \u26A1 A\u00E7\u00F5es: ".concat(Object.keys(flow.actions).length));
                        return [2 /*return*/, flow];
                }
            });
        });
    };
    /**
     * Atualiza FlowDefinition existente com nova instrução
     */
    UnifiedFlowEngine.updateFlowFromInstruction = function (userId, instruction, apiKey) {
        return __awaiter(this, void 0, void 0, function () {
            var existingFlow, analyzer, instructionLower, priceMatch, newPrice, couponMatch, newCoupon, nameMatch, saved;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        console.log("\n\uD83D\uDD04 [UnifiedFlowEngine] Atualizando flow com instru\u00E7\u00E3o...");
                        console.log("   Instru\u00E7\u00E3o: \"".concat(instruction.substring(0, 80), "...\""));
                        return [4 /*yield*/, FlowStorage.loadFlow(userId)];
                    case 1:
                        existingFlow = _d.sent();
                        if (!existingFlow) {
                            return [2 /*return*/, {
                                    success: false,
                                    message: 'Nenhum flow encontrado para atualizar. Crie um agente primeiro.'
                                }];
                        }
                        analyzer = new FlowBuilder_1.PromptAnalyzer();
                        instructionLower = instruction.toLowerCase();
                        priceMatch = instructionLower.match(/pre[çc]o.*?(r?\$?\s*\d+)/i);
                        if (priceMatch) {
                            newPrice = parseFloat(priceMatch[1].replace(/[^\d,]/g, '').replace(',', '.'));
                            if (!isNaN(newPrice) && ((_a = existingFlow.data) === null || _a === void 0 ? void 0 : _a.prices)) {
                                existingFlow.data.prices.standard = newPrice;
                                console.log("   \uD83D\uDCB0 Pre\u00E7o atualizado para R$".concat(newPrice));
                            }
                        }
                        couponMatch = instructionLower.match(/cupom.*?([A-Z0-9]+)/i);
                        if (couponMatch) {
                            newCoupon = couponMatch[1].toUpperCase();
                            if ((_b = existingFlow.data) === null || _b === void 0 ? void 0 : _b.coupons) {
                                existingFlow.data.coupons[0] = { code: newCoupon, discount: ((_c = existingFlow.data.coupons[0]) === null || _c === void 0 ? void 0 : _c.discount) || 50 };
                                console.log("   \uD83C\uDF9F\uFE0F Cupom atualizado para ".concat(newCoupon));
                            }
                        }
                        nameMatch = instructionLower.match(/(?:nome|chama[r]?).*?(?:de\s+)?([a-záéíóúâêîôûãõç]+)/i);
                        if (nameMatch && nameMatch[1].length > 2) {
                            existingFlow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
                            console.log("   \uD83D\uDC64 Nome atualizado para ".concat(existingFlow.agentName));
                        }
                        // Modificar personalidade
                        if (instructionLower.includes('mais formal')) {
                            existingFlow.agentPersonality = 'formal, profissional, educado';
                            console.log("   \uD83C\uDFAD Personalidade: formal");
                        }
                        else if (instructionLower.includes('mais informal') || instructionLower.includes('descontraído')) {
                            existingFlow.agentPersonality = 'informal, descontraído, amigável';
                            console.log("   \uD83C\uDFAD Personalidade: informal");
                        }
                        // Atualizar versão
                        existingFlow.version = incrementVersion(existingFlow.version);
                        return [4 /*yield*/, FlowStorage.saveFlow(userId, existingFlow)];
                    case 2:
                        saved = _d.sent();
                        if (!saved) {
                            return [2 /*return*/, {
                                    success: false,
                                    message: 'Erro ao salvar alterações no flow.'
                                }];
                        }
                        return [2 /*return*/, {
                                success: true,
                                flow: existingFlow,
                                message: "Flow atualizado com sucesso! Vers\u00E3o: ".concat(existingFlow.version)
                            }];
                }
            });
        });
    };
    return UnifiedFlowEngine;
}());
exports.UnifiedFlowEngine = UnifiedFlowEngine;
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function incrementVersion(version) {
    var parts = version.split('.');
    var patch = parseInt(parts[2] || '0') + 1;
    return "".concat(parts[0], ".").concat(parts[1], ".").concat(patch);
}
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION SQL - Executar no Supabase
// ═══════════════════════════════════════════════════════════════════════════
exports.FLOW_MIGRATION_SQL = "\n-- Tabela para armazenar FlowDefinitions dos usu\u00E1rios\nCREATE TABLE IF NOT EXISTS agent_flows (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,\n  flow_id VARCHAR NOT NULL,\n  flow_type VARCHAR(50) NOT NULL,\n  flow_definition JSONB NOT NULL,\n  business_name VARCHAR(255),\n  agent_name VARCHAR(255),\n  version VARCHAR(20) DEFAULT '1.0.0',\n  created_at TIMESTAMP DEFAULT NOW(),\n  updated_at TIMESTAMP DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_agent_flows_user_id ON agent_flows(user_id);\nCREATE INDEX IF NOT EXISTS idx_agent_flows_flow_type ON agent_flows(flow_type);\n\n-- Tabela para armazenar estado das conversas com flows\nCREATE TABLE IF NOT EXISTS conversation_flow_states (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,\n  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  flow_id VARCHAR NOT NULL,\n  current_state VARCHAR(100) NOT NULL,\n  data JSONB DEFAULT '{}',\n  history JSONB DEFAULT '[]',\n  created_at TIMESTAMP DEFAULT NOW(),\n  updated_at TIMESTAMP DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_conv_flow_states_conv ON conversation_flow_states(conversation_id);\nCREATE INDEX IF NOT EXISTS idx_conv_flow_states_user ON conversation_flow_states(user_id);\n";
exports.default = UnifiedFlowEngine;
