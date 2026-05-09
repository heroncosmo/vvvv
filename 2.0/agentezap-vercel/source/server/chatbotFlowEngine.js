"use strict";
/**
 * Engine de Execução de Fluxo do Chatbot
 * Processa mensagens de usuários e executa o fluxo predefinido
 *
 * Este módulo é responsável por:
 * 1. Verificar se o chatbot está ativo para o usuário
 * 2. Carregar o fluxo do banco de dados
 * 3. Processar a mensagem do usuário e determinar o próximo nó
 * 4. Enviar as respostas apropriadas
 * 5. Gerenciar o estado da conversa (variáveis coletadas, nó atual)
 * 6. [HÍBRIDO] Interpretar linguagem natural e acionar nós corretos
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
exports.clearFlowCache = clearFlowCache;
exports.isChatbotActive = isChatbotActive;
exports.processChatbotMessage = processChatbotMessage;
exports.getChatbotStats = getChatbotStats;
var db_1 = require("./db");
var drizzle_orm_1 = require("drizzle-orm");
var hybridAIFlowEngine_1 = require("./hybridAIFlowEngine");
// Cache em memória para fluxos ativos (evita consultas repetidas ao banco)
var flowCache = new Map();
var CACHE_TTL_MS = 60000; // 1 minuto de cache
/**
 * Limpa o cache de um usuário específico (chamar quando fluxo for atualizado)
 */
function clearFlowCache(userId) {
    flowCache.delete(userId);
    console.log("\uD83D\uDDD1\uFE0F [CHATBOT_ENGINE] Cache limpo para usu\u00E1rio ".concat(userId));
}
/**
 * Carrega o fluxo do chatbot de um usuário
 */
function loadChatbotFlow(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var cached, configResult, config_1, nodesResult, connectionsResult, flowData, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cached = flowCache.get(userId);
                    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
                        return [2 /*return*/, cached];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        SELECT * FROM chatbot_configs WHERE user_id = ", " AND is_active = true\n      "], ["\n        SELECT * FROM chatbot_configs WHERE user_id = ", " AND is_active = true\n      "])), userId))];
                            });
                        }); })];
                case 2:
                    configResult = _a.sent();
                    if (configResult.rows.length === 0) {
                        return [2 /*return*/, null];
                    }
                    config_1 = configResult.rows[0];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n        SELECT node_id, name, node_type, content, next_node_id\n        FROM chatbot_flow_nodes\n        WHERE chatbot_id = ", "\n        ORDER BY display_order ASC\n      "], ["\n        SELECT node_id, name, node_type, content, next_node_id\n        FROM chatbot_flow_nodes\n        WHERE chatbot_id = ", "\n        ORDER BY display_order ASC\n      "])), config_1.id))];
                            });
                        }); })];
                case 3:
                    nodesResult = _a.sent();
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n        SELECT from_node_id, from_handle, to_node_id\n        FROM chatbot_flow_connections\n        WHERE chatbot_id = ", "\n      "], ["\n        SELECT from_node_id, from_handle, to_node_id\n        FROM chatbot_flow_connections\n        WHERE chatbot_id = ", "\n      "])), config_1.id))];
                            });
                        }); })];
                case 4:
                    connectionsResult = _a.sent();
                    flowData = {
                        config: config_1,
                        nodes: nodesResult.rows,
                        connections: connectionsResult.rows,
                        cachedAt: Date.now()
                    };
                    // Salvar no cache
                    flowCache.set(userId, flowData);
                    return [2 /*return*/, flowData];
                case 5:
                    error_1 = _a.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao carregar fluxo:', error_1);
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Busca ou cria o estado da conversa
 */
function getOrCreateConversationState(chatbotId, conversationId, contactNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var existingResult, state_1, newResult, state, error_2;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n        SELECT * FROM chatbot_conversation_data\n        WHERE chatbot_id = ", " AND conversation_id = ", "\n      "], ["\n        SELECT * FROM chatbot_conversation_data\n        WHERE chatbot_id = ", " AND conversation_id = ", "\n      "])), chatbotId, conversationId))];
                            });
                        }); })];
                case 1:
                    existingResult = _a.sent();
                    if (existingResult.rows.length > 0) {
                        state_1 = existingResult.rows[0];
                        return [2 /*return*/, __assign(__assign({}, state_1), { variables: state_1.variables || {}, visited_nodes: state_1.visited_nodes || [] })];
                    }
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n        INSERT INTO chatbot_conversation_data (chatbot_id, conversation_id, contact_number, status, variables, visited_nodes)\n        VALUES (", ", ", ", ", ", 'active', '{}', ARRAY[]::TEXT[])\n        RETURNING *\n      "], ["\n        INSERT INTO chatbot_conversation_data (chatbot_id, conversation_id, contact_number, status, variables, visited_nodes)\n        VALUES (", ", ", ", ", ", 'active', '{}', ARRAY[]::TEXT[])\n        RETURNING *\n      "])), chatbotId, conversationId, contactNumber))];
                            });
                        }); })];
                case 2:
                    newResult = _a.sent();
                    state = newResult.rows[0];
                    return [2 /*return*/, __assign(__assign({}, state), { variables: state.variables || {}, visited_nodes: state.visited_nodes || [] })];
                case 3:
                    error_2 = _a.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao buscar/criar estado:', error_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Atualiza o estado da conversa
 */
function updateConversationState(conversationId, chatbotId, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var setClauses_1, error_3;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    setClauses_1 = [];
                    if (updates.current_node_id !== undefined) {
                        setClauses_1.push("current_node_id = '".concat(updates.current_node_id, "'"));
                    }
                    if (updates.status) {
                        setClauses_1.push("status = '".concat(updates.status, "'"));
                    }
                    if (updates.variables) {
                        setClauses_1.push("variables = '".concat(JSON.stringify(updates.variables), "'::jsonb"));
                    }
                    if (updates.visited_nodes) {
                        setClauses_1.push("visited_nodes = ARRAY[".concat(updates.visited_nodes.map(function (n) { return "'".concat(n, "'"); }).join(','), "]::TEXT[]"));
                    }
                    setClauses_1.push("last_interaction_at = now()");
                    if (!(setClauses_1.length > 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute(drizzle_orm_1.sql.raw("\n          UPDATE chatbot_conversation_data\n          SET ".concat(setClauses_1.join(', '), "\n          WHERE chatbot_id = '").concat(chatbotId, "' AND conversation_id = '").concat(conversationId, "'\n        ")))];
                            });
                        }); })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao atualizar estado:', error_3);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Encontra o próximo nó baseado na conexão
 */
function findNextNode(currentNodeId, handle, nodes, connections) {
    // Buscar por conexão específica
    var connection = connections.find(function (c) { return c.from_node_id === currentNodeId && c.from_handle === handle; });
    if (connection) {
        return nodes.find(function (n) { return n.node_id === connection.to_node_id; }) || null;
    }
    // Buscar por conexão default
    var defaultConnection = connections.find(function (c) { return c.from_node_id === currentNodeId && c.from_handle === 'default'; });
    if (defaultConnection) {
        return nodes.find(function (n) { return n.node_id === defaultConnection.to_node_id; }) || null;
    }
    // Fallback para next_node_id
    var currentNode = nodes.find(function (n) { return n.node_id === currentNodeId; });
    if (currentNode === null || currentNode === void 0 ? void 0 : currentNode.next_node_id) {
        return nodes.find(function (n) { return n.node_id === currentNode.next_node_id; }) || null;
    }
    return null;
}
/**
 * Interpola variáveis no texto
 */
function interpolateVariables(text, variables) {
    return text.replace(/\{\{(\w+)\}\}/g, function (match, varName) {
        return variables[varName] || match;
    });
}
/**
 * Humaniza o texto para evitar detecção de bot (Anti-Ban)
 * Adiciona variações naturais para parecer mais humano
 */
function humanizeText(text, level) {
    if (!text)
        return text;
    var result = text;
    // Nível baixo: pequenas variações de pontuação e espaçamento
    if (level === 'low' || level === 'medium' || level === 'high') {
        // Variação aleatória de espaços duplos
        if (Math.random() > 0.7) {
            result = result.replace(/\. /g, '.  ');
        }
        // Variação de pontuação final
        if (Math.random() > 0.8 && result.endsWith('!')) {
            result = result.slice(0, -1) + '!!';
        }
        // Remover espaços duplos
        if (Math.random() > 0.6) {
            result = result.replace(/  +/g, ' ');
        }
    }
    // Nível médio: troca emojis similares e usa sinônimos básicos
    if (level === 'medium' || level === 'high') {
        var emojiVariations = {
            '😊': ['😄', '🙂', '😃'],
            '👋': ['✋', '🖐️', '🤚'],
            '✅': ['✔️', '☑️', '👍'],
            '❤️': ['💖', '💕', '♥️'],
            '🎉': ['🥳', '✨', '🎊'],
            '🔥': ['💥', '⚡', '✨'],
            '💪': ['👊', '✊', '🤜'],
            '🙏': ['🤲', '👐', '💫'],
        };
        for (var _i = 0, _a = Object.entries(emojiVariations); _i < _a.length; _i++) {
            var _b = _a[_i], emoji = _b[0], variations = _b[1];
            if (result.includes(emoji) && Math.random() > 0.5) {
                var randomVariation = variations[Math.floor(Math.random() * variations.length)];
                result = result.replace(emoji, randomVariation);
            }
        }
        // Sinônimos básicos (uma substituição por mensagem)
        var synonyms = [
            [/\bOlá\b/gi, ['Oi', 'Oie', 'Eai', 'Hey']],
            [/\bObrigado\b/gi, ['Vlw', 'Valeu', 'Thanks', 'Grato']],
            [/\baguarde\b/gi, ['espere', 'só um momento', 'um instante']],
            [/\bperfeito\b/gi, ['show', 'ótimo', 'beleza', 'top']],
        ];
        var selectedSynonym = synonyms[Math.floor(Math.random() * synonyms.length)];
        if (Math.random() > 0.6) {
            var pattern = selectedSynonym[0], options = selectedSynonym[1];
            var replacement = options[Math.floor(Math.random() * options.length)];
            result = result.replace(pattern, replacement);
        }
    }
    // Nível alto: variações mais intensas (simula erros de digitação ocasionais corrigidos)
    if (level === 'high') {
        // Adiciona interjeições naturais
        var interjections = ['Então', 'Bom', 'Ah', 'Hmm', 'Enfim'];
        if (Math.random() > 0.7) {
            var interjection = interjections[Math.floor(Math.random() * interjections.length)];
            result = "".concat(interjection, ", ").concat(result.charAt(0).toLowerCase()).concat(result.slice(1));
        }
        // Variação de letras maiúsculas em início
        if (Math.random() > 0.8) {
            result = result.charAt(0).toLowerCase() + result.slice(1);
        }
    }
    return result;
}
/**
 * Processa um nó e gera as respostas
 */
function processNode(node, state, nodes, connections, config) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, waitingForInput, currentNodeId, shouldTransferToHuman, variables, visitedNodes, visitCount, _a, nextAfterStart, nextResponse, msgText, nextAfterMessage, nextResponse, btnBody, listBody, prompt_1, caption, nextAfterMedia, nextResponse, varValue, conditionResult, nextNodeId_1, nextNode, nextResponse, nextAfterDelay, nextResponse, messagesWithDelay, nextAfterSetVar, nextResponse, transferMsg, targetNode, nextResponse, goodbyeMsg, orderItems, orderTotal, deliveryAddress, paymentMethod, deliveryType, customerNotes, orderData, confirmMsg, nextAfterDelivery, nextResponse, deliveryError_1, isOpen, handleToFollow, closedMsg, nextAfterHours, nextResponse, hoursError_1, clientName, clientPhone, clientEmail, serviceName, serviceId, professionalName, professionalId, appointmentDate, appointmentTime, durationMinutes, customerNotes, location_1, locationType, appointmentData, confirmAppointmentMsg, nextAfterAppointment, nextResponse, appointmentError_1;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    messages = [];
                    waitingForInput = false;
                    currentNodeId = node.node_id;
                    shouldTransferToHuman = false;
                    variables = __assign({}, state.variables);
                    visitedNodes = __spreadArray(__spreadArray([], state.visited_nodes, true), [node.node_id], false);
                    visitCount = visitedNodes.filter(function (n) { return n === node.node_id; }).length;
                    if (visitCount > 10) {
                        console.warn("[CHATBOT_ENGINE] Loop detectado no n\u00F3 ".concat(node.node_id));
                        return [2 /*return*/, { messages: [], waitingForInput: false, variables: variables }];
                    }
                    _a = node.node_type;
                    switch (_a) {
                        case 'start': return [3 /*break*/, 1];
                        case 'message': return [3 /*break*/, 4];
                        case 'buttons': return [3 /*break*/, 7];
                        case 'list': return [3 /*break*/, 8];
                        case 'input': return [3 /*break*/, 9];
                        case 'media': return [3 /*break*/, 10];
                        case 'condition': return [3 /*break*/, 13];
                        case 'delay': return [3 /*break*/, 16];
                        case 'set_variable': return [3 /*break*/, 19];
                        case 'transfer_human': return [3 /*break*/, 22];
                        case 'goto': return [3 /*break*/, 23];
                        case 'end': return [3 /*break*/, 26];
                        case 'delivery_order': return [3 /*break*/, 27];
                        case 'check_business_hours': return [3 /*break*/, 32];
                        case 'create_appointment': return [3 /*break*/, 37];
                    }
                    return [3 /*break*/, 42];
                case 1:
                    nextAfterStart = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterStart) return [3 /*break*/, 3];
                    return [4 /*yield*/, processNode(nextAfterStart, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 2:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 3: return [3 /*break*/, 42];
                case 4:
                    msgText = interpolateVariables(node.content.text || '', variables);
                    messages.push({
                        type: 'text',
                        content: msgText,
                        delay: config.typing_delay_ms
                    });
                    nextAfterMessage = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterMessage) return [3 /*break*/, 6];
                    return [4 /*yield*/, processNode(nextAfterMessage, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 5:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), currentNodeId: nextResponse.currentNodeId, variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 6: return [3 /*break*/, 42];
                case 7:
                    btnBody = interpolateVariables(node.content.body || '', variables);
                    messages.push({
                        type: 'buttons',
                        content: {
                            header: node.content.header,
                            body: btnBody,
                            footer: node.content.footer,
                            buttons: node.content.buttons || []
                        },
                        delay: config.typing_delay_ms
                    });
                    waitingForInput = true;
                    return [3 /*break*/, 42];
                case 8:
                    listBody = interpolateVariables(node.content.body || '', variables);
                    messages.push({
                        type: 'list',
                        content: {
                            header: node.content.header,
                            body: listBody,
                            footer: node.content.footer,
                            button_text: node.content.button_text,
                            sections: node.content.sections || []
                        },
                        delay: config.typing_delay_ms
                    });
                    waitingForInput = true;
                    return [3 /*break*/, 42];
                case 9:
                    prompt_1 = interpolateVariables(node.content.prompt || '', variables);
                    messages.push({
                        type: 'text',
                        content: prompt_1,
                        delay: config.typing_delay_ms
                    });
                    waitingForInput = true;
                    return [3 /*break*/, 42];
                case 10:
                    caption = interpolateVariables(node.content.caption || '', variables);
                    messages.push({
                        type: 'media',
                        content: {
                            media_type: node.content.media_type,
                            url: node.content.url,
                            caption: caption
                        },
                        delay: config.typing_delay_ms
                    });
                    nextAfterMedia = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterMedia) return [3 /*break*/, 12];
                    return [4 /*yield*/, processNode(nextAfterMedia, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 11:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 12: return [3 /*break*/, 42];
                case 13:
                    varValue = variables[node.content.variable || ''] || '';
                    conditionResult = false;
                    switch (node.content.operator) {
                        case 'equals':
                            conditionResult = varValue.toLowerCase() === (node.content.value || '').toLowerCase();
                            break;
                        case 'contains':
                            conditionResult = varValue.toLowerCase().includes((node.content.value || '').toLowerCase());
                            break;
                        case 'starts_with':
                            conditionResult = varValue.toLowerCase().startsWith((node.content.value || '').toLowerCase());
                            break;
                        case 'ends_with':
                            conditionResult = varValue.toLowerCase().endsWith((node.content.value || '').toLowerCase());
                            break;
                        case 'greater':
                            conditionResult = parseFloat(varValue) > parseFloat(node.content.value || '0');
                            break;
                        case 'less':
                            conditionResult = parseFloat(varValue) < parseFloat(node.content.value || '0');
                            break;
                        case 'exists':
                            conditionResult = !!varValue && varValue.trim() !== '';
                            break;
                        case 'not_exists':
                            conditionResult = !varValue || varValue.trim() === '';
                            break;
                    }
                    nextNodeId_1 = conditionResult ? node.content.true_node : node.content.false_node;
                    if (!nextNodeId_1) return [3 /*break*/, 15];
                    nextNode = nodes.find(function (n) { return n.node_id === nextNodeId_1; });
                    if (!nextNode) return [3 /*break*/, 15];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 14:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 15: return [3 /*break*/, 42];
                case 16:
                    nextAfterDelay = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterDelay) return [3 /*break*/, 18];
                    return [4 /*yield*/, processNode(nextAfterDelay, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 17:
                    nextResponse = _l.sent();
                    messagesWithDelay = nextResponse.messages.map(function (msg, idx) { return (__assign(__assign({}, msg), { delay: idx === 0 ? (node.content.seconds || 3) * 1000 : msg.delay })); });
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: messagesWithDelay, variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 18: return [3 /*break*/, 42];
                case 19:
                    if (node.content.variable_name) {
                        variables[node.content.variable_name] = node.content.value || '';
                    }
                    nextAfterSetVar = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterSetVar) return [3 /*break*/, 21];
                    return [4 /*yield*/, processNode(nextAfterSetVar, __assign(__assign({}, state), { visited_nodes: visitedNodes, variables: variables }), nodes, connections, config)];
                case 20:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 21: return [3 /*break*/, 42];
                case 22:
                    transferMsg = interpolateVariables(node.content.message || 'Aguarde, vou transferir para um atendente...', variables);
                    messages.push({
                        type: 'text',
                        content: transferMsg,
                        delay: config.typing_delay_ms
                    });
                    shouldTransferToHuman = true;
                    return [3 /*break*/, 42];
                case 23:
                    if (!node.content.target_node) return [3 /*break*/, 25];
                    targetNode = nodes.find(function (n) { return n.node_id === node.content.target_node; });
                    if (!targetNode) return [3 /*break*/, 25];
                    return [4 /*yield*/, processNode(targetNode, __assign(__assign({}, state), { visited_nodes: visitedNodes }), nodes, connections, config)];
                case 24:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 25: return [3 /*break*/, 42];
                case 26:
                    goodbyeMsg = interpolateVariables(config.goodbye_message || 'Até mais! 👋', variables);
                    messages.push({
                        type: 'text',
                        content: goodbyeMsg,
                        delay: config.typing_delay_ms
                    });
                    return [3 /*break*/, 42];
                case 27:
                    _l.trys.push([27, 30, , 31]);
                    orderItems = variables['pedido_itens'] || variables['items'] || variables['carrinho'] || '';
                    orderTotal = variables['pedido_total'] || variables['total'] || '0';
                    deliveryAddress = interpolateVariables(node.content.address_variable ? "{{".concat(node.content.address_variable, "}}") : (variables['endereco'] || variables['address'] || ''), variables);
                    paymentMethod = variables['pagamento'] || variables['payment'] || node.content.default_payment || 'dinheiro';
                    deliveryType = variables['tipo_entrega'] || variables['delivery_type'] || node.content.default_delivery_type || 'delivery';
                    customerNotes = variables['observacoes'] || variables['notes'] || '';
                    orderData = {
                        items: parseOrderItems(orderItems, variables),
                        subtotal: parseFloat(variables['subtotal'] || orderTotal) || 0,
                        delivery_fee: parseFloat(variables['taxa_entrega'] || '0') || 0,
                        discount: parseFloat(variables['desconto'] || '0') || 0,
                        total: parseFloat(orderTotal) || 0,
                        delivery_type: deliveryType,
                        delivery_address: deliveryAddress ? {
                            street: deliveryAddress,
                            complement: variables['complemento'] || '',
                            reference: variables['referencia'] || ''
                        } : null,
                        payment_method: paymentMethod,
                        payment_status: 'pendente',
                        notes: customerNotes,
                        status: 'pendente'
                    };
                    console.log("\uD83C\uDF55 [CHATBOT_ENGINE] Criando pedido de delivery:", JSON.stringify(orderData, null, 2));
                    // Salvar pedido no banco (será tratado pelo chatbotIntegration que tem acesso ao userId)
                    // Armazenar dados do pedido nas variáveis para processamento posterior
                    variables['__delivery_order_data'] = JSON.stringify(orderData);
                    variables['__delivery_order_pending'] = 'true';
                    confirmMsg = interpolateVariables(node.content.confirmation_message ||
                        "\u2705 *Pedido Confirmado!*\n\n\uD83D\uDCCB Itens: {{pedido_itens}}\n\uD83D\uDCB0 Total: R$ {{pedido_total}}\n\uD83D\uDCCD Entrega: {{endereco}}\n\uD83D\uDCB3 Pagamento: {{pagamento}}\n\nSeu pedido ser\u00E1 preparado! \uD83C\uDF55", variables);
                    messages.push({
                        type: 'text',
                        content: confirmMsg,
                        delay: config.typing_delay_ms
                    });
                    nextAfterDelivery = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterDelivery) return [3 /*break*/, 29];
                    return [4 /*yield*/, processNode(nextAfterDelivery, __assign(__assign({}, state), { visited_nodes: visitedNodes, variables: variables }), nodes, connections, config)];
                case 28:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 29: return [3 /*break*/, 31];
                case 30:
                    deliveryError_1 = _l.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao criar pedido de delivery:', deliveryError_1);
                    messages.push({
                        type: 'text',
                        content: '❌ Desculpe, ocorreu um erro ao processar seu pedido. Tente novamente.',
                        delay: config.typing_delay_ms
                    });
                    return [3 /*break*/, 31];
                case 31: return [3 /*break*/, 42];
                case 32:
                    _l.trys.push([32, 35, , 36]);
                    isOpen = checkBusinessHours(node.content.opening_hours || {});
                    handleToFollow = isOpen ? 'open' : 'closed';
                    // Armazenar resultado na variável
                    variables['is_open'] = isOpen ? 'true' : 'false';
                    variables['business_status'] = isOpen ? 'aberto' : 'fechado';
                    // Se fechado e tem mensagem configurada
                    if (!isOpen && node.content.closed_message) {
                        closedMsg = interpolateVariables(node.content.closed_message, variables);
                        messages.push({
                            type: 'text',
                            content: closedMsg,
                            delay: config.typing_delay_ms
                        });
                    }
                    nextAfterHours = findNextNode(node.node_id, handleToFollow, nodes, connections) ||
                        findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterHours) return [3 /*break*/, 34];
                    return [4 /*yield*/, processNode(nextAfterHours, __assign(__assign({}, state), { visited_nodes: visitedNodes, variables: variables }), nodes, connections, config)];
                case 33:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 34: return [3 /*break*/, 36];
                case 35:
                    hoursError_1 = _l.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao verificar horário:', hoursError_1);
                    return [3 /*break*/, 36];
                case 36: return [3 /*break*/, 42];
                case 37:
                    _l.trys.push([37, 40, , 41]);
                    console.log("\uD83D\uDCC5 [CHATBOT_ENGINE] Processando n\u00F3 create_appointment");
                    clientName = variables['nome'] || variables['cliente_nome'] || 'Cliente';
                    clientPhone = variables['telefone'] || variables['cliente_telefone'] || '';
                    clientEmail = variables['email'] || variables['cliente_email'] || '';
                    serviceName = variables['servico'] || variables['servico_nome'] || ((_b = node.content) === null || _b === void 0 ? void 0 : _b.service_name) || '';
                    serviceId = variables['servico_id'] || ((_c = node.content) === null || _c === void 0 ? void 0 : _c.service_id) || '';
                    professionalName = variables['profissional'] || variables['profissional_nome'] || ((_d = node.content) === null || _d === void 0 ? void 0 : _d.professional_name) || '';
                    professionalId = variables['profissional_id'] || ((_e = node.content) === null || _e === void 0 ? void 0 : _e.professional_id) || '';
                    appointmentDate = variables['data'] || variables['data_agendamento'] || '';
                    appointmentTime = variables['horario'] || variables['hora'] || variables['horario_agendamento'] || '';
                    durationMinutes = parseInt(variables['duracao'] || ((_f = node.content) === null || _f === void 0 ? void 0 : _f.duration_minutes) || '60') || 60;
                    customerNotes = variables['observacoes'] || variables['notas'] || '';
                    location_1 = variables['local'] || ((_g = node.content) === null || _g === void 0 ? void 0 : _g.location) || '';
                    locationType = variables['tipo_atendimento'] || ((_h = node.content) === null || _h === void 0 ? void 0 : _h.location_type) || 'presencial';
                    // Validar dados obrigatórios
                    if (!appointmentDate || !appointmentTime) {
                        console.log("\uD83D\uDCC5 [CHATBOT_ENGINE] Faltam dados obrigat\u00F3rios - data: ".concat(appointmentDate, ", hora: ").concat(appointmentTime));
                        messages.push({
                            type: 'text',
                            content: interpolateVariables(((_j = node.content) === null || _j === void 0 ? void 0 : _j.missing_data_message) || '❌ Desculpe, preciso da data e horário para agendar. Pode informar?', variables),
                            delay: config.typing_delay_ms
                        });
                        return [3 /*break*/, 42];
                    }
                    appointmentData = {
                        client_name: clientName,
                        client_phone: clientPhone,
                        client_email: clientEmail,
                        service_id: serviceId,
                        service_name: serviceName,
                        professional_id: professionalId,
                        professional_name: professionalName,
                        appointment_date: appointmentDate,
                        start_time: appointmentTime,
                        duration_minutes: durationMinutes,
                        notes: customerNotes,
                        location: location_1,
                        location_type: locationType,
                        status: 'pendente'
                    };
                    console.log("\uD83D\uDCC5 [CHATBOT_ENGINE] Criando agendamento:", JSON.stringify(appointmentData, null, 2));
                    // Salvar agendamento no banco (será tratado pelo chatbotIntegration que tem acesso ao userId)
                    // Armazenar dados do agendamento nas variáveis para processamento posterior
                    variables['__appointment_data'] = JSON.stringify(appointmentData);
                    variables['__appointment_pending'] = 'true';
                    // Atualizar variáveis para interpolação
                    variables['agendamento_data'] = appointmentDate;
                    variables['agendamento_horario'] = appointmentTime;
                    variables['agendamento_servico'] = serviceName;
                    variables['agendamento_profissional'] = professionalName;
                    variables['agendamento_duracao'] = String(durationMinutes);
                    confirmAppointmentMsg = interpolateVariables(((_k = node.content) === null || _k === void 0 ? void 0 : _k.confirmation_message) ||
                        "\u2705 *Agendamento Confirmado!*\n\n\uD83D\uDCC5 Data: {{agendamento_data}}\n\u23F0 Hor\u00E1rio: {{agendamento_horario}}\n\uD83D\uDCBC Servi\u00E7o: {{agendamento_servico}}\n\uD83D\uDC64 Profissional: {{agendamento_profissional}}\n\u23F1\uFE0F Dura\u00E7\u00E3o: {{agendamento_duracao}} minutos\n\nAguardamos voc\u00EA! \uD83D\uDCCB", variables);
                    messages.push({
                        type: 'text',
                        content: confirmAppointmentMsg,
                        delay: config.typing_delay_ms
                    });
                    nextAfterAppointment = findNextNode(node.node_id, 'default', nodes, connections);
                    if (!nextAfterAppointment) return [3 /*break*/, 39];
                    return [4 /*yield*/, processNode(nextAfterAppointment, __assign(__assign({}, state), { visited_nodes: visitedNodes, variables: variables }), nodes, connections, config)];
                case 38:
                    nextResponse = _l.sent();
                    return [2 /*return*/, __assign(__assign({}, nextResponse), { messages: __spreadArray(__spreadArray([], messages, true), nextResponse.messages, true), variables: __assign(__assign({}, variables), nextResponse.variables) })];
                case 39: return [3 /*break*/, 41];
                case 40:
                    appointmentError_1 = _l.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao criar agendamento:', appointmentError_1);
                    messages.push({
                        type: 'text',
                        content: '❌ Desculpe, ocorreu um erro ao processar seu agendamento. Tente novamente.',
                        delay: config.typing_delay_ms
                    });
                    return [3 /*break*/, 41];
                case 41: return [3 /*break*/, 42];
                case 42: return [2 /*return*/, {
                        messages: messages,
                        waitingForInput: waitingForInput,
                        currentNodeId: currentNodeId,
                        shouldTransferToHuman: shouldTransferToHuman,
                        variables: variables
                    }];
            }
        });
    });
}
// ============================================================
// 🍕 HELPER: Parse items de pedido
// ============================================================
function parseOrderItems(itemsString, variables) {
    var _a;
    try {
        // Se já é um array JSON
        if (itemsString.startsWith('[')) {
            return JSON.parse(itemsString);
        }
        // Se é string formatada: "1x Pizza Grande, 2x Coca-Cola"
        var items = [];
        var parts = itemsString.split(/[,;]/);
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            var match = part.trim().match(/^(\d+)x?\s*(.+?)(?:\s*-\s*R?\$?\s*([\d.,]+))?$/i);
            if (match) {
                items.push({
                    name: match[2].trim(),
                    quantity: parseInt(match[1]) || 1,
                    price: parseFloat(((_a = match[3]) === null || _a === void 0 ? void 0 : _a.replace(',', '.')) || '0') || 0
                });
            }
            else if (part.trim()) {
                items.push({
                    name: part.trim(),
                    quantity: 1,
                    price: 0
                });
            }
        }
        return items;
    }
    catch (e) {
        console.error('[CHATBOT_ENGINE] Erro ao parsear itens:', e);
        return [];
    }
}
// ============================================================
// ⏰ HELPER: Verificar horário de funcionamento
// ============================================================
function checkBusinessHours(openingHours) {
    var now = new Date();
    var days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var today = days[now.getDay()];
    var todayHours = openingHours[today];
    if (!todayHours || !todayHours.is_open) {
        return false;
    }
    var currentTime = now.getHours() * 60 + now.getMinutes();
    var _a = todayHours.open.split(':').map(Number), openH = _a[0], openM = _a[1];
    var _b = todayHours.close.split(':').map(Number), closeH = _b[0], closeM = _b[1];
    var openTime = openH * 60 + openM;
    var closeTime = closeH * 60 + closeM;
    // Trata caso de horário que passa da meia-noite (ex: 18:00 - 02:00)
    if (closeTime < openTime) {
        return currentTime >= openTime || currentTime <= closeTime;
    }
    return currentTime >= openTime && currentTime <= closeTime;
}
/**
 * Verifica se o chatbot está ativo para um usuário
 */
function isChatbotActive(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_4;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n        SELECT is_active FROM chatbot_configs WHERE user_id = ", "\n      "], ["\n        SELECT is_active FROM chatbot_configs WHERE user_id = ", "\n      "])), userId))];
                            });
                        }); })];
                case 1:
                    result = _a.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, result.rows[0].is_active === true];
                case 2:
                    error_4 = _a.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao verificar status:', error_4);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Aplica humanização às mensagens de resposta se habilitado
 */
function applyHumanization(response, config) {
    if (!config.enable_humanization || !response.messages) {
        return response;
    }
    var level = config.humanization_level || 'medium';
    return __assign(__assign({}, response), { messages: response.messages.map(function (msg) {
            var _a;
            if (msg.type === 'text' && typeof msg.content === 'string') {
                return __assign(__assign({}, msg), { content: humanizeText(msg.content, level) });
            }
            // Para buttons e lists, humanizar o body
            if ((msg.type === 'buttons' || msg.type === 'list') && ((_a = msg.content) === null || _a === void 0 ? void 0 : _a.body)) {
                return __assign(__assign({}, msg), { content: __assign(__assign({}, msg.content), { body: humanizeText(msg.content.body, level) }) });
            }
            return msg;
        }) });
}
/**
 * Processa uma mensagem recebida pelo chatbot
 * Retorna null se o chatbot não estiver ativo ou não tiver fluxo configurado
 *
 * SISTEMA HÍBRIDO: Se habilitado, a IA interpreta a intenção do usuário
 * e aciona o nó correto do fluxo. A resposta SEMPRE vem do fluxo.
 */
function processChatbotMessage(userId_1, conversationId_1, contactNumber_1, message_1) {
    return __awaiter(this, arguments, void 0, function (userId, conversationId, contactNumber, message, isFirstMessage) {
        var flow, config, nodes, connections, state, messageLower, hybridConfig, processedInput, updatedVars, hybridError_1, intent, startNode, response, startNode, response, restartKeywords, startNode, response, messages, startNode, response, startNode, response, currentNode, variables, varName, isValid, errorMsg, nextNode, response, buttons, button, numericInput, handle, nextNode, response, intent_1, threshold, partialButton, handle, nextNode, response, intentNodeId_1, intentNode, response, matchedButton, handle, nextNode, response, allRows_1, option, numericInput, handle, nextNode, response, intent_2, threshold, partialOption, handle, nextNode, response, intentNodeId_2, intentNode, response, matchedRow, handle, nextNode, response;
        var _a, _b, _c;
        if (isFirstMessage === void 0) { isFirstMessage = false; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log("\uD83E\uDD16 [CHATBOT_ENGINE] Processando mensagem para usu\u00E1rio ".concat(userId));
                    return [4 /*yield*/, loadChatbotFlow(userId)];
                case 1:
                    flow = _d.sent();
                    if (!flow) {
                        console.log("[CHATBOT_ENGINE] Chatbot n\u00E3o est\u00E1 ativo ou n\u00E3o tem fluxo para ".concat(userId));
                        return [2 /*return*/, null];
                    }
                    config = flow.config, nodes = flow.nodes, connections = flow.connections;
                    // Verificar se há nós no fluxo
                    if (nodes.length === 0) {
                        console.log("[CHATBOT_ENGINE] Fluxo vazio para ".concat(userId));
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getOrCreateConversationState(config.id, conversationId, contactNumber)];
                case 2:
                    state = _d.sent();
                    if (!state) {
                        console.error('[CHATBOT_ENGINE] Não foi possível obter estado da conversa');
                        return [2 /*return*/, null];
                    }
                    messageLower = message.toLowerCase().trim();
                    hybridConfig = null;
                    processedInput = null;
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 7, , 8]);
                    return [4 /*yield*/, (0, hybridAIFlowEngine_1.getHybridConfig)(userId)];
                case 4:
                    hybridConfig = _d.sent();
                    if (!(hybridConfig === null || hybridConfig === void 0 ? void 0 : hybridConfig.enable_hybrid_ai)) return [3 /*break*/, 6];
                    // Processar entrada com interpretação de linguagem natural
                    processedInput = (0, hybridAIFlowEngine_1.processUserInputWithNaturalLanguage)(message, hybridConfig);
                    // Log da decisão do sistema híbrido
                    (0, hybridAIFlowEngine_1.logHybridDecision)(message, processedInput.intent, processedInput.intent.confidence >= (hybridConfig.ai_confidence_threshold || 0.7) ? 'hybrid' : 'flow');
                    if (!(processedInput.extractedDate || processedInput.extractedTime)) return [3 /*break*/, 6];
                    updatedVars = (0, hybridAIFlowEngine_1.applyExtractedDataToVariables)(state.variables, processedInput.extractedDate, processedInput.extractedTime, processedInput.intent);
                    // Atualizar variáveis no estado
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            variables: updatedVars
                        })];
                case 5:
                    // Atualizar variáveis no estado
                    _d.sent();
                    state.variables = updatedVars;
                    _d.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    hybridError_1 = _d.sent();
                    console.error('[CHATBOT_ENGINE] Erro no sistema híbrido:', hybridError_1);
                    return [3 /*break*/, 8];
                case 8:
                    intent = (0, hybridAIFlowEngine_1.detectIntent)(message);
                    console.log("\uD83E\uDD16 [IA] Inten\u00E7\u00E3o detectada: ".concat(intent.category, " (confian\u00E7a: ").concat((intent.confidence * 100).toFixed(0), "%)"));
                    if (!(intent.category === 'greeting' && intent.confidence >= 0.7)) return [3 /*break*/, 12];
                    console.log("\uD83D\uDC4B [IA] Sauda\u00E7\u00E3o detectada: \"".concat(message, "\" - Iniciando/reiniciando fluxo"));
                    // Reiniciar estado para saudação
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: undefined,
                            variables: {},
                            visited_nodes: []
                        })];
                case 9:
                    // Reiniciar estado para saudação
                    _d.sent();
                    startNode = nodes.find(function (n) { return n.node_type === 'start'; });
                    if (!startNode) return [3 /*break*/, 12];
                    return [4 /*yield*/, processNode(startNode, __assign(__assign({}, state), { variables: {}, visited_nodes: [] }), nodes, connections, config)];
                case 10:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: response.variables,
                            visited_nodes: [startNode.node_id]
                        })];
                case 11:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 12:
                    if (!(intent.category === 'menu' && intent.confidence >= 0.7)) return [3 /*break*/, 16];
                    console.log("\uD83D\uDCCB [IA] Pedido de menu detectado: \"".concat(message, "\" - Mostrando menu inicial"));
                    startNode = nodes.find(function (n) { return n.node_type === 'start'; });
                    if (!startNode) return [3 /*break*/, 16];
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: undefined,
                            variables: {},
                            visited_nodes: []
                        })];
                case 13:
                    _d.sent();
                    return [4 /*yield*/, processNode(startNode, __assign(__assign({}, state), { variables: {}, visited_nodes: [] }), nodes, connections, config)];
                case 14:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: response.variables,
                            visited_nodes: [startNode.node_id]
                        })];
                case 15:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 16:
                    restartKeywords = config.restart_keywords || ['menu', 'início', 'inicio', 'voltar', 'reiniciar'];
                    if (!(config.restart_on_keyword && restartKeywords.some(function (kw) { return messageLower === kw.toLowerCase(); }))) return [3 /*break*/, 20];
                    console.log("[CHATBOT_ENGINE] Reiniciando fluxo por palavra-chave: ".concat(message));
                    // Reiniciar estado
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: undefined,
                            variables: {},
                            visited_nodes: []
                        })];
                case 17:
                    // Reiniciar estado
                    _d.sent();
                    startNode = nodes.find(function (n) { return n.node_type === 'start'; });
                    if (!startNode) return [3 /*break*/, 20];
                    return [4 /*yield*/, processNode(startNode, __assign(__assign({}, state), { variables: {}, visited_nodes: [] }), nodes, connections, config)];
                case 18:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: response.variables,
                            visited_nodes: [startNode.node_id]
                        })];
                case 19:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 20:
                    if (!isFirstMessage) return [3 /*break*/, 24];
                    messages = [];
                    if (config.send_welcome_on_first_contact && config.welcome_message) {
                        messages.push({
                            type: 'text',
                            content: config.welcome_message,
                            delay: config.typing_delay_ms
                        });
                    }
                    startNode = nodes.find(function (n) { return n.node_type === 'start'; });
                    if (!startNode) return [3 /*break*/, 23];
                    return [4 /*yield*/, processNode(startNode, __assign(__assign({}, state), { variables: {}, visited_nodes: [] }), nodes, connections, config)];
                case 21:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: response.variables,
                            visited_nodes: __spreadArray([startNode.node_id], (response.currentNodeId ? [response.currentNodeId] : []), true)
                        })];
                case 22:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(__assign(__assign({}, response), { messages: __spreadArray(__spreadArray([], messages, true), response.messages, true) }), config)];
                case 23: return [2 /*return*/, applyHumanization({ messages: messages, waitingForInput: false }, config)];
                case 24:
                    if (!!state.current_node_id) return [3 /*break*/, 28];
                    console.log("[CHATBOT_ENGINE] Sem n\u00F3 atual, reiniciando fluxo SEM boas-vindas");
                    startNode = nodes.find(function (n) { return n.node_type === 'start'; });
                    if (!startNode) return [3 /*break*/, 27];
                    return [4 /*yield*/, processNode(startNode, __assign(__assign({}, state), { variables: state.variables || {}, visited_nodes: [] }), nodes, connections, config)];
                case 25:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: response.variables,
                            visited_nodes: __spreadArray([startNode.node_id], (response.currentNodeId ? [response.currentNodeId] : []), true)
                        })];
                case 26:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 27: return [2 /*return*/, null];
                case 28:
                    currentNode = nodes.find(function (n) { return n.node_id === state.current_node_id; });
                    if (!currentNode) {
                        console.warn("[CHATBOT_ENGINE] N\u00F3 atual n\u00E3o encontrado: ".concat(state.current_node_id));
                        return [2 /*return*/, null];
                    }
                    variables = __assign({}, state.variables);
                    if (!(currentNode.node_type === 'input')) return [3 /*break*/, 32];
                    varName = currentNode.content.variable_name || 'input';
                    variables[varName] = message;
                    // Validar entrada se necessário
                    if (currentNode.content.input_type && currentNode.content.required) {
                        isValid = true;
                        switch (currentNode.content.input_type) {
                            case 'email':
                                isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message);
                                break;
                            case 'phone':
                                isValid = /^\d{10,15}$/.test(message.replace(/\D/g, ''));
                                break;
                            case 'number':
                                isValid = !isNaN(parseFloat(message));
                                break;
                            case 'cpf':
                                isValid = /^\d{11}$/.test(message.replace(/\D/g, ''));
                                break;
                            case 'cnpj':
                                isValid = /^\d{14}$/.test(message.replace(/\D/g, ''));
                                break;
                            case 'cep':
                                isValid = /^\d{8}$/.test(message.replace(/\D/g, ''));
                                break;
                        }
                        if (!isValid) {
                            errorMsg = currentNode.content.validation_message ||
                                "Por favor, digite um ".concat(currentNode.content.input_type, " v\u00E1lido.");
                            return [2 /*return*/, applyHumanization({
                                    messages: [{ type: 'text', content: errorMsg, delay: config.typing_delay_ms }],
                                    waitingForInput: true,
                                    currentNodeId: currentNode.node_id,
                                    variables: state.variables
                                }, config)];
                        }
                    }
                    nextNode = findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 31];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 29:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 30:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 31: return [3 /*break*/, 61];
                case 32:
                    if (!(currentNode.node_type === 'buttons')) return [3 /*break*/, 47];
                    buttons = currentNode.content.buttons || [];
                    button = buttons.find(function (btn) { return btn.title.toLowerCase() === messageLower || btn.id === message; });
                    // Se não encontrou, tentar por índice numérico (1, 2, 3, etc)
                    if (!button) {
                        numericInput = parseInt(message.trim(), 10);
                        if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= buttons.length) {
                            button = buttons[numericInput - 1]; // Índice base 0
                            console.log("\uD83D\uDD22 [BUTTONS] Entrada num\u00E9rica detectada: ".concat(numericInput, " -> ").concat(button === null || button === void 0 ? void 0 : button.title));
                        }
                    }
                    // Também tentar match por título sem emoji (ex: "Pizzas" ao invés de "🍕 Pizzas")
                    if (!button) {
                        button = buttons.find(function (btn) {
                            var titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
                            return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji);
                        });
                        if (button) {
                            console.log("\uD83D\uDD24 [BUTTONS] Match por t\u00EDtulo sem emoji: ".concat(message, " -> ").concat(button.title));
                        }
                    }
                    // ==============================================================
                    // 🧠 MATCH INTELIGENTE: Busca parcial flexível
                    // Permite: "Salgadas" → "🍕 Pizzas Salgadas", "Grande" → "G - Grande"
                    // ==============================================================
                    if (!button && messageLower.length >= 2) {
                        button = buttons.find(function (btn) {
                            var titleLower = btn.title.toLowerCase();
                            var titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
                            var titleNormalized = titleNoEmoji
                                .replace(/^[a-z]\s*-\s*/i, '') // Remove prefixos como "G - ", "M - ", "P - "
                                .replace(/[^\w\sáéíóúàèìòùãõâêîôûç]/gi, '') // Remove caracteres especiais
                                .trim();
                            // Verificar se o título CONTÉM a mensagem do usuário
                            var containsMatch = titleNoEmoji.includes(messageLower) ||
                                titleNormalized.includes(messageLower);
                            // Verificar match de tamanho: "grande" → "G - Grande", "media" → "M - Média"
                            var sizeMap = {
                                'p': ['pequena', 'pequeno', 'peq', 'p'],
                                'm': ['media', 'média', 'medio', 'médio', 'med', 'm'],
                                'g': ['grande', 'grd', 'g'],
                                'gg': ['gigante', 'familia', 'família', 'gg']
                            };
                            var sizeMatch = false;
                            for (var _i = 0, _a = Object.entries(sizeMap); _i < _a.length; _i++) {
                                var _b = _a[_i], prefix = _b[0], aliases = _b[1];
                                if (aliases.includes(messageLower)) {
                                    // Verificar se o título começa com esse prefixo
                                    if (titleNoEmoji.startsWith(prefix + ' ') ||
                                        titleNoEmoji.startsWith(prefix + ' -') ||
                                        titleNoEmoji === prefix) {
                                        sizeMatch = true;
                                        break;
                                    }
                                }
                            }
                            // Verificar match de palavras-chave importantes
                            var msgWords = messageLower.split(/\s+/).filter(function (w) { return w.length >= 3; });
                            var keywordMatch = msgWords.some(function (word) {
                                return titleNoEmoji.split(/\s+/).some(function (titleWord) {
                                    return titleWord.includes(word) || word.includes(titleWord);
                                });
                            });
                            return containsMatch || sizeMatch || keywordMatch;
                        });
                        if (button) {
                            console.log("\uD83E\uDDE0 [SMART_MATCH] Match inteligente: \"".concat(message, "\" \u2192 \"").concat(button.title, "\""));
                        }
                    }
                    if (!button) return [3 /*break*/, 36];
                    // ====================================================================
                    // 📌 CORREÇÃO CRÍTICA: Salvar variável quando usuário seleciona botão
                    // ====================================================================
                    // Prioridade 1: save_variable dentro do próprio botão (estrutura nova)
                    if (button.save_variable) {
                        variables[button.save_variable] = button.title;
                        console.log("\uD83D\uDCBE [BUTTONS] Salvando vari\u00E1vel (do bot\u00E3o) ".concat(button.save_variable, " = \"").concat(button.title, "\""));
                    }
                    // Prioridade 2: save_variable no nó (estrutura antiga/fallback)
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = button.title;
                        console.log("\uD83D\uDCBE [BUTTONS] Salvando vari\u00E1vel (do n\u00F3) ".concat(currentNode.content.save_variable, " = \"").concat(button.title, "\""));
                    }
                    handle = "button_".concat(button.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 35];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 33:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 34:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 35: return [3 /*break*/, 46];
                case 36:
                    if (!((hybridConfig === null || hybridConfig === void 0 ? void 0 : hybridConfig.enable_hybrid_ai) && processedInput)) return [3 /*break*/, 42];
                    intent_1 = processedInput.intent;
                    threshold = hybridConfig.ai_confidence_threshold || 0.7;
                    if (!(intent_1.confidence >= threshold)) return [3 /*break*/, 42];
                    partialButton = (_a = currentNode.content.buttons) === null || _a === void 0 ? void 0 : _a.find(function (btn) {
                        var btnLower = btn.title.toLowerCase();
                        var msgWords = messageLower.split(/\s+/);
                        return msgWords.some(function (word) { return word.length > 2 && btnLower.includes(word); }) ||
                            intent_1.keywords.some(function (kw) { return btnLower.includes(kw); });
                    });
                    if (!partialButton) return [3 /*break*/, 39];
                    console.log("\uD83E\uDD16 [HYBRID_AI] Match parcial encontrado: ".concat(partialButton.title));
                    // 📌 CORREÇÃO: Salvar variável quando match híbrido encontra botão
                    if (partialButton.save_variable) {
                        variables[partialButton.save_variable] = partialButton.title;
                        console.log("\uD83D\uDCBE [HYBRID_AI] Salvando vari\u00E1vel ".concat(partialButton.save_variable, " = \"").concat(partialButton.title, "\""));
                    }
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = partialButton.title;
                        console.log("\uD83D\uDCBE [HYBRID_AI] Salvando vari\u00E1vel ".concat(currentNode.content.save_variable, " = \"").concat(partialButton.title, "\""));
                    }
                    handle = "button_".concat(partialButton.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 39];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 37:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 38:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 39:
                    intentNodeId_1 = (0, hybridAIFlowEngine_1.findNodeByIntent)(intent_1, nodes, { variables: variables, currentNodeId: currentNode.node_id });
                    if (!(intentNodeId_1 && intentNodeId_1 !== currentNode.node_id)) return [3 /*break*/, 42];
                    intentNode = nodes.find(function (n) { return n.node_id === intentNodeId_1; });
                    if (!intentNode) return [3 /*break*/, 42];
                    console.log("\uD83E\uDD16 [HYBRID_AI] Redirecionando para n\u00F3 por inten\u00E7\u00E3o: ".concat(intentNode.name));
                    return [4 /*yield*/, processNode(intentNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 40:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 41:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 42:
                    if (!(intent.confidence >= 0.6)) return [3 /*break*/, 45];
                    matchedButton = (_b = currentNode.content.buttons) === null || _b === void 0 ? void 0 : _b.find(function (btn) {
                        var btnText = btn.title.toLowerCase();
                        // Verificar se alguma keyword da intenção está no texto do botão
                        return intent.keywords.some(function (kw) { return btnText.includes(kw.toLowerCase()); });
                    });
                    if (!matchedButton) return [3 /*break*/, 45];
                    console.log("\uD83E\uDD16 [IA] Inten\u00E7\u00E3o \"".concat(intent.category, "\" mapeada para bot\u00E3o: ").concat(matchedButton.title));
                    // 📌 CORREÇÃO: Salvar variável quando IA mapeia intenção para botão
                    if (matchedButton.save_variable) {
                        variables[matchedButton.save_variable] = matchedButton.title;
                        console.log("\uD83D\uDCBE [IA_INTENT] Salvando vari\u00E1vel ".concat(matchedButton.save_variable, " = \"").concat(matchedButton.title, "\""));
                    }
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = matchedButton.title;
                        console.log("\uD83D\uDCBE [IA_INTENT] Salvando vari\u00E1vel ".concat(currentNode.content.save_variable, " = \"").concat(matchedButton.title, "\""));
                    }
                    handle = "button_".concat(matchedButton.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 45];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 43:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 44:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 45:
                    // Resposta não reconhecida (fallback) - repetir menu atual
                    console.log("\u26A0\uFE0F [CHATBOT_ENGINE] Mensagem n\u00E3o reconhecida: \"".concat(message, "\" - Mostrando fallback com menu"));
                    return [2 /*return*/, applyHumanization({
                            messages: [{ type: 'text', content: config.fallback_message, delay: config.typing_delay_ms }],
                            waitingForInput: true,
                            currentNodeId: currentNode.node_id,
                            variables: state.variables
                        }, config)];
                case 46: return [3 /*break*/, 61];
                case 47:
                    if (!(currentNode.node_type === 'list')) return [3 /*break*/, 61];
                    allRows_1 = [];
                    (_c = currentNode.content.sections) === null || _c === void 0 ? void 0 : _c.forEach(function (section) {
                        if (section.rows) {
                            allRows_1.push.apply(allRows_1, section.rows);
                        }
                    });
                    option = allRows_1.find(function (row) { return row.title.toLowerCase() === messageLower || row.id === message; });
                    // Se não encontrou, tentar por índice numérico (1, 2, 3, etc)
                    if (!option) {
                        numericInput = parseInt(message.trim(), 10);
                        if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= allRows_1.length) {
                            option = allRows_1[numericInput - 1]; // Índice base 0
                            console.log("\uD83D\uDD22 [LIST] Entrada num\u00E9rica detectada: ".concat(numericInput, " -> ").concat(option === null || option === void 0 ? void 0 : option.title));
                        }
                    }
                    // Também tentar match por título parcial
                    if (!option) {
                        option = allRows_1.find(function (row) {
                            var titleNoEmoji = row.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
                            return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji) || titleNoEmoji.includes(messageLower);
                        });
                        if (option) {
                            console.log("\uD83D\uDD24 [LIST] Match parcial: ".concat(message, " -> ").concat(option.title));
                        }
                    }
                    if (!option) return [3 /*break*/, 51];
                    // ====================================================================
                    // 📌 CORREÇÃO CRÍTICA: Salvar variável quando usuário seleciona item da lista
                    // ====================================================================
                    // Prioridade 1: save_variable dentro do próprio item (estrutura nova)
                    if (option.save_variable) {
                        variables[option.save_variable] = option.title;
                        console.log("\uD83D\uDCBE [LIST] Salvando vari\u00E1vel (do item) ".concat(option.save_variable, " = \"").concat(option.title, "\""));
                    }
                    // Prioridade 2: save_variable no nó (estrutura antiga/fallback)
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = option.title;
                        console.log("\uD83D\uDCBE [LIST] Salvando vari\u00E1vel (do n\u00F3) ".concat(currentNode.content.save_variable, " = \"").concat(option.title, "\""));
                    }
                    handle = "row_".concat(option.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 50];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 48:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 49:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 50: return [3 /*break*/, 61];
                case 51:
                    if (!((hybridConfig === null || hybridConfig === void 0 ? void 0 : hybridConfig.enable_hybrid_ai) && processedInput)) return [3 /*break*/, 57];
                    intent_2 = processedInput.intent;
                    threshold = hybridConfig.ai_confidence_threshold || 0.7;
                    if (!(intent_2.confidence >= threshold)) return [3 /*break*/, 57];
                    partialOption = allRows_1.find(function (row) {
                        var rowLower = row.title.toLowerCase();
                        var descLower = (row.description || '').toLowerCase();
                        var msgWords = messageLower.split(/\s+/);
                        return msgWords.some(function (word) { return word.length > 2 && (rowLower.includes(word) || descLower.includes(word)); }) ||
                            intent_2.keywords.some(function (kw) { return rowLower.includes(kw) || descLower.includes(kw); });
                    });
                    if (!partialOption) return [3 /*break*/, 54];
                    console.log("\uD83E\uDD16 [HYBRID_AI] Match parcial em lista: ".concat(partialOption.title));
                    // 📌 CORREÇÃO: Salvar variável quando match híbrido encontra item
                    if (partialOption.save_variable) {
                        variables[partialOption.save_variable] = partialOption.title;
                        console.log("\uD83D\uDCBE [HYBRID_AI] Salvando vari\u00E1vel ".concat(partialOption.save_variable, " = \"").concat(partialOption.title, "\""));
                    }
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = partialOption.title;
                        console.log("\uD83D\uDCBE [HYBRID_AI] Salvando vari\u00E1vel ".concat(currentNode.content.save_variable, " = \"").concat(partialOption.title, "\""));
                    }
                    // Manter compatibilidade com código antigo
                    variables['opcao_escolhida'] = partialOption.title;
                    variables['opcao_id'] = partialOption.id;
                    handle = "row_".concat(partialOption.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 54];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 52:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 53:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 54:
                    intentNodeId_2 = (0, hybridAIFlowEngine_1.findNodeByIntent)(intent_2, nodes, { variables: variables, currentNodeId: currentNode.node_id });
                    if (!(intentNodeId_2 && intentNodeId_2 !== currentNode.node_id)) return [3 /*break*/, 57];
                    intentNode = nodes.find(function (n) { return n.node_id === intentNodeId_2; });
                    if (!intentNode) return [3 /*break*/, 57];
                    console.log("\uD83E\uDD16 [HYBRID_AI] Redirecionando para n\u00F3 por inten\u00E7\u00E3o: ".concat(intentNode.name));
                    return [4 /*yield*/, processNode(intentNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 55:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 56:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 57:
                    if (!(intent.confidence >= 0.6)) return [3 /*break*/, 60];
                    matchedRow = allRows_1.find(function (row) {
                        var rowText = row.title.toLowerCase();
                        // Verificar se alguma keyword da intenção está no texto da row
                        return intent.keywords.some(function (kw) { return rowText.includes(kw.toLowerCase()); });
                    });
                    if (!matchedRow) return [3 /*break*/, 60];
                    console.log("\uD83E\uDD16 [IA] Inten\u00E7\u00E3o \"".concat(intent.category, "\" mapeada para lista: ").concat(matchedRow.title));
                    // ✅ CORREÇÃO: Salvar variável do item da lista selecionado
                    if (matchedRow.save_variable) {
                        variables[matchedRow.save_variable] = matchedRow.title;
                        console.log("\uD83D\uDCBE [IA_INTENT] Salvando vari\u00E1vel (da lista) ".concat(matchedRow.save_variable, " = \"").concat(matchedRow.title, "\""));
                    }
                    else if (currentNode.content.save_variable) {
                        variables[currentNode.content.save_variable] = matchedRow.title;
                        console.log("\uD83D\uDCBE [IA_INTENT] Salvando vari\u00E1vel (do n\u00F3) ".concat(currentNode.content.save_variable, " = \"").concat(matchedRow.title, "\""));
                    }
                    handle = "row_".concat(matchedRow.id);
                    nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                        findNextNode(currentNode.node_id, 'default', nodes, connections);
                    if (!nextNode) return [3 /*break*/, 60];
                    return [4 /*yield*/, processNode(nextNode, __assign(__assign({}, state), { variables: variables, visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false) }), nodes, connections, config)];
                case 58:
                    response = _d.sent();
                    return [4 /*yield*/, updateConversationState(conversationId, config.id, {
                            current_node_id: response.currentNodeId,
                            variables: __assign(__assign({}, variables), response.variables),
                            visited_nodes: __spreadArray(__spreadArray([], state.visited_nodes, true), [currentNode.node_id], false)
                        })];
                case 59:
                    _d.sent();
                    return [2 /*return*/, applyHumanization(response, config)];
                case 60:
                    // Resposta não reconhecida (fallback)
                    console.log("\u26A0\uFE0F [CHATBOT_ENGINE] Lista - Mensagem n\u00E3o reconhecida: \"".concat(message, "\" - Mostrando fallback"));
                    return [2 /*return*/, applyHumanization({
                            messages: [{ type: 'text', content: config.fallback_message, delay: config.typing_delay_ms }],
                            waitingForInput: true,
                            currentNodeId: currentNode.node_id,
                            variables: state.variables
                        }, config)];
                case 61:
                    // Se chegou aqui, não conseguiu processar
                    console.log("[CHATBOT_ENGINE] N\u00E3o foi poss\u00EDvel processar mensagem para n\u00F3 ".concat(currentNode.node_type));
                    return [2 /*return*/, null];
            }
        });
    });
}
/**
 * Obtém estatísticas do chatbot de um usuário
 */
function getChatbotStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, row, error_5;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, db_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                return [2 /*return*/, db_1.db.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n        SELECT \n          COUNT(*) as total,\n          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,\n          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,\n          SUM(jsonb_object_keys(variables)::int) as vars_count\n        FROM chatbot_conversation_data cd\n        JOIN chatbot_configs c ON cd.chatbot_id = c.id\n        WHERE c.user_id = ", "\n      "], ["\n        SELECT \n          COUNT(*) as total,\n          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,\n          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,\n          SUM(jsonb_object_keys(variables)::int) as vars_count\n        FROM chatbot_conversation_data cd\n        JOIN chatbot_configs c ON cd.chatbot_id = c.id\n        WHERE c.user_id = ", "\n      "])), userId))];
                            });
                        }); })];
                case 1:
                    result = _a.sent();
                    if (result.rows.length === 0) {
                        return [2 /*return*/, null];
                    }
                    row = result.rows[0];
                    return [2 /*return*/, {
                            totalConversations: parseInt(row.total) || 0,
                            activeConversations: parseInt(row.active) || 0,
                            completedConversations: parseInt(row.completed) || 0,
                            variablesCollected: parseInt(row.vars_count) || 0
                        }];
                case 2:
                    error_5 = _a.sent();
                    console.error('[CHATBOT_ENGINE] Erro ao obter estatísticas:', error_5);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7;
