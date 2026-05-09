"use strict";
/**
 * Integração do Chatbot de Fluxo com o WhatsApp
 *
 * Este módulo gerencia a integração entre o chatbot de fluxo predefinido
 * e o sistema de mensagens do WhatsApp.
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
exports.clearFlowCache = void 0;
exports.tryProcessChatbotMessage = tryProcessChatbotMessage;
exports.isNewContact = isNewContact;
var chatbotFlowEngine_1 = require("./chatbotFlowEngine");
Object.defineProperty(exports, "clearFlowCache", { enumerable: true, get: function () { return chatbotFlowEngine_1.clearFlowCache; } });
var whatsappSender_1 = require("./whatsappSender");
var storage_1 = require("./storage");
var supabaseAuth_1 = require("./supabaseAuth");
/**
 * Tenta processar uma mensagem usando o chatbot de fluxo.
 * Se o chatbot não estiver ativo ou não processar a mensagem, retorna handled=false
 * para que o sistema de IA possa processar.
 *
 * @param userId - ID do usuário dono do chatbot
 * @param conversationId - ID da conversa
 * @param contactNumber - Número do contato
 * @param messageText - Texto da mensagem recebida
 * @param isFirstContact - Se é o primeiro contato com este número
 * @returns Resultado indicando se o chatbot processou a mensagem
 */
function tryProcessChatbotMessage(userId_1, conversationId_1, contactNumber_1, messageText_1) {
    return __awaiter(this, arguments, void 0, function (userId, conversationId, contactNumber, messageText, isFirstContact) {
        var agentConfig, chatbotActive, response, _loop_1, i, orderData, conversation, contactName, _a, savedOrder, saveError, deliveryError_1, hasPizzaVariables, hasConfirmationMessage, notAlreadySaved, conversation, contactName, sabor, tamanho, borda, tipoEntrega, endereco, pagamento, troco, isDelivery, deliveryFee, basePrice, bordaPrice, subtotal, total, orderItem, _b, savedOrder, saveError, autoSaveError_1, appointmentData, conversation, clientName, durationMinutes, startTime, _c, hours, minutes, endDate, endTime, appointmentId, _d, savedAppointment, saveError, appointmentError_1, error_1;
        var _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        if (isFirstContact === void 0) { isFirstContact = false; }
        return __generator(this, function (_x) {
            switch (_x.label) {
                case 0:
                    _x.trys.push([0, 25, , 26]);
                    return [4 /*yield*/, storage_1.storage.getAgentConfig(userId)];
                case 1:
                    agentConfig = _x.sent();
                    if ((agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.flowModeActive) === true && ((_e = agentConfig === null || agentConfig === void 0 ? void 0 : agentConfig.flowScript) === null || _e === void 0 ? void 0 : _e.trim().length) > 10) {
                        console.log("\uD83D\uDD00 [CHATBOT_INTEGRATION] Modo Fluxo ativo para ".concat(userId, " \u2014 delegando para FlowScriptEngine (prioridade)"));
                        return [2 /*return*/, { handled: false }];
                    }
                    return [4 /*yield*/, (0, chatbotFlowEngine_1.isChatbotActive)(userId)];
                case 2:
                    chatbotActive = _x.sent();
                    if (!chatbotActive) {
                        console.log("\uD83E\uDD16 [CHATBOT] Chatbot n\u00E3o ativo para usu\u00E1rio ".concat(userId, ", delegando para IA"));
                        return [2 /*return*/, { handled: false }];
                    }
                    console.log("\uD83E\uDD16 [CHATBOT] Processando mensagem para ".concat(contactNumber, " (conversa: ").concat(conversationId, ")"));
                    return [4 /*yield*/, (0, chatbotFlowEngine_1.processChatbotMessage)(userId, conversationId, contactNumber, messageText, isFirstContact)];
                case 3:
                    response = _x.sent();
                    if (!response || response.messages.length === 0) {
                        console.log("\uD83E\uDD16 [CHATBOT] Chatbot n\u00E3o gerou resposta, delegando para IA");
                        return [2 /*return*/, { handled: false }];
                    }
                    _loop_1 = function (i) {
                        var msg, _y, buttonPayload, listPayload, mediaUrl, mediaCaption, mediaTypeToMime, mimeType, messageId, sendError_1;
                        return __generator(this, function (_z) {
                            switch (_z.label) {
                                case 0:
                                    msg = response.messages[i];
                                    if (!(msg.delay && i > 0)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, msg.delay); })];
                                case 1:
                                    _z.sent();
                                    _z.label = 2;
                                case 2:
                                    _z.trys.push([2, 13, , 14]);
                                    _y = msg.type;
                                    switch (_y) {
                                        case 'text': return [3 /*break*/, 3];
                                        case 'buttons': return [3 /*break*/, 5];
                                        case 'list': return [3 /*break*/, 7];
                                        case 'media': return [3 /*break*/, 9];
                                    }
                                    return [3 /*break*/, 11];
                                case 3: return [4 /*yield*/, (0, whatsappSender_1.sendWhatsAppMessageFromUser)(userId, contactNumber, msg.content)];
                                case 4:
                                    _z.sent();
                                    return [3 /*break*/, 11];
                                case 5:
                                    buttonPayload = {
                                        body: msg.content.body,
                                        buttons: msg.content.buttons.map(function (btn) { return ({
                                            type: 'reply',
                                            reply: {
                                                id: btn.id,
                                                title: btn.title.substring(0, 20) // WhatsApp limita a 20 caracteres
                                            }
                                        }); })
                                    };
                                    if (msg.content.header) {
                                        buttonPayload.header = { type: 'text', text: msg.content.header };
                                    }
                                    if (msg.content.footer) {
                                        buttonPayload.footer = { text: msg.content.footer };
                                    }
                                    return [4 /*yield*/, (0, whatsappSender_1.sendWhatsAppButtonsFromUser)(userId, contactNumber, buttonPayload)];
                                case 6:
                                    _z.sent();
                                    return [3 /*break*/, 11];
                                case 7:
                                    listPayload = {
                                        body: msg.content.body,
                                        buttonText: msg.content.button_text || 'Ver opções',
                                        sections: msg.content.sections.map(function (section) { return ({
                                            title: section.title || 'Opções',
                                            rows: section.rows.map(function (row) {
                                                var _a;
                                                return ({
                                                    id: row.id,
                                                    title: row.title.substring(0, 24), // WhatsApp limita a 24 caracteres
                                                    description: (_a = row.description) === null || _a === void 0 ? void 0 : _a.substring(0, 72) // WhatsApp limita a 72 caracteres
                                                });
                                            })
                                        }); })
                                    };
                                    if (msg.content.header) {
                                        listPayload.header = { type: 'text', text: msg.content.header };
                                    }
                                    if (msg.content.footer) {
                                        listPayload.footer = { text: msg.content.footer };
                                    }
                                    return [4 /*yield*/, (0, whatsappSender_1.sendWhatsAppListFromUser)(userId, contactNumber, listPayload)];
                                case 8:
                                    _z.sent();
                                    return [3 /*break*/, 11];
                                case 9:
                                    mediaUrl = msg.content.url;
                                    mediaCaption = msg.content.caption || '';
                                    mediaTypeToMime = {
                                        'image': 'image/jpeg',
                                        'audio': 'audio/mpeg',
                                        'video': 'video/mp4',
                                        'document': 'application/pdf'
                                    };
                                    mimeType = mediaTypeToMime[msg.content.media_type] || 'application/octet-stream';
                                    console.log("\uD83D\uDCE4 [CHATBOT] Enviando m\u00EDdia ".concat(msg.content.media_type, ": ").concat(mediaUrl));
                                    return [4 /*yield*/, (0, whatsappSender_1.sendWhatsAppMediaFromUser)(userId, contactNumber, mediaUrl, mediaCaption, mimeType, 'chatbot_flow')];
                                case 10:
                                    _z.sent();
                                    return [3 /*break*/, 11];
                                case 11:
                                    messageId = "chatbot_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                                    return [4 /*yield*/, storage_1.storage.createMessage({
                                            conversationId: conversationId,
                                            messageId: messageId,
                                            text: typeof msg.content === 'string' ? msg.content : msg.content.body || JSON.stringify(msg.content),
                                            fromMe: true,
                                            isFromAgent: true,
                                            timestamp: new Date()
                                        })];
                                case 12:
                                    _z.sent();
                                    return [3 /*break*/, 14];
                                case 13:
                                    sendError_1 = _z.sent();
                                    console.error("\uD83E\uDD16 [CHATBOT] Erro ao enviar mensagem:", sendError_1);
                                    return [3 /*break*/, 14];
                                case 14: return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _x.label = 4;
                case 4:
                    if (!(i < response.messages.length)) return [3 /*break*/, 7];
                    return [5 /*yield**/, _loop_1(i)];
                case 5:
                    _x.sent();
                    _x.label = 6;
                case 6:
                    i++;
                    return [3 /*break*/, 4];
                case 7:
                    if (!response.shouldTransferToHuman) return [3 /*break*/, 9];
                    console.log("\uD83E\uDD16 [CHATBOT] Transferindo conversa ".concat(conversationId, " para humano"));
                    return [4 /*yield*/, storage_1.storage.disableAgentForConversation(conversationId)];
                case 8:
                    _x.sent();
                    _x.label = 9;
                case 9:
                    if (!(((_f = response.variables) === null || _f === void 0 ? void 0 : _f.__delivery_order_pending) === 'true' && ((_g = response.variables) === null || _g === void 0 ? void 0 : _g.__delivery_order_data))) return [3 /*break*/, 14];
                    _x.label = 10;
                case 10:
                    _x.trys.push([10, 13, , 14]);
                    orderData = JSON.parse(response.variables.__delivery_order_data);
                    console.log("\uD83C\uDF55 [CHATBOT] Salvando pedido de delivery na tabela delivery_pedidos");
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 11:
                    conversation = _x.sent();
                    contactName = (conversation === null || conversation === void 0 ? void 0 : conversation.contactName) || 'Cliente';
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_pedidos')
                            .insert({
                            user_id: userId,
                            conversation_id: conversationId,
                            contact_number: contactNumber,
                            contact_name: contactName,
                            status: 'pendente',
                            items: orderData.items || [],
                            subtotal: orderData.subtotal || 0,
                            delivery_fee: orderData.delivery_fee || 0,
                            discount: orderData.discount || 0,
                            total: orderData.total || 0,
                            delivery_type: orderData.delivery_type || 'delivery',
                            delivery_address: orderData.delivery_address || null,
                            payment_method: orderData.payment_method || 'dinheiro',
                            payment_status: 'pendente',
                            notes: orderData.notes || null
                        })
                            .select()
                            .single()];
                case 12:
                    _a = _x.sent(), savedOrder = _a.data, saveError = _a.error;
                    if (saveError) {
                        console.error("\uD83C\uDF55 [CHATBOT] Erro ao salvar pedido:", saveError);
                    }
                    else {
                        console.log("\uD83C\uDF55 [CHATBOT] Pedido #".concat(savedOrder === null || savedOrder === void 0 ? void 0 : savedOrder.id, " salvo com sucesso na tabela delivery_pedidos"));
                    }
                    return [3 /*break*/, 14];
                case 13:
                    deliveryError_1 = _x.sent();
                    console.error("\uD83C\uDF55 [CHATBOT] Erro ao processar pedido de delivery:", deliveryError_1);
                    return [3 /*break*/, 14];
                case 14:
                    hasPizzaVariables = ((_h = response.variables) === null || _h === void 0 ? void 0 : _h.sabor_pizza) && ((_j = response.variables) === null || _j === void 0 ? void 0 : _j.pagamento);
                    hasConfirmationMessage = (_k = response.messages) === null || _k === void 0 ? void 0 : _k.some(function (msg) {
                        return typeof msg.content === 'string' && msg.content.includes('PEDIDO CONFIRMADO');
                    });
                    notAlreadySaved = ((_l = response.variables) === null || _l === void 0 ? void 0 : _l.__delivery_order_pending) !== 'true';
                    if (!(hasPizzaVariables && hasConfirmationMessage && notAlreadySaved)) return [3 /*break*/, 19];
                    _x.label = 15;
                case 15:
                    _x.trys.push([15, 18, , 19]);
                    console.log("\uD83C\uDF55 [CHATBOT] Auto-detectado pedido de pizza/delivery - salvando automaticamente");
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 16:
                    conversation = _x.sent();
                    contactName = ((_m = response.variables) === null || _m === void 0 ? void 0 : _m.nome_cliente) || (conversation === null || conversation === void 0 ? void 0 : conversation.contactName) || 'Cliente';
                    sabor = ((_o = response.variables) === null || _o === void 0 ? void 0 : _o.sabor_pizza) || '';
                    tamanho = ((_p = response.variables) === null || _p === void 0 ? void 0 : _p.tamanho) || '';
                    borda = ((_q = response.variables) === null || _q === void 0 ? void 0 : _q.borda) || '';
                    tipoEntrega = ((_r = response.variables) === null || _r === void 0 ? void 0 : _r.tipo_entrega) || 'delivery';
                    endereco = ((_s = response.variables) === null || _s === void 0 ? void 0 : _s.endereco) || '';
                    pagamento = ((_t = response.variables) === null || _t === void 0 ? void 0 : _t.pagamento) || 'dinheiro';
                    troco = ((_u = response.variables) === null || _u === void 0 ? void 0 : _u.troco) || '';
                    isDelivery = tipoEntrega.toLowerCase().includes('delivery');
                    deliveryFee = isDelivery ? 8 : 0;
                    basePrice = 0;
                    if (tamanho.includes('P') || tamanho.includes('Pequena'))
                        basePrice = 35;
                    else if (tamanho.includes('M') || tamanho.includes('Média'))
                        basePrice = 45;
                    else if (tamanho.includes('G') || tamanho.includes('Grande'))
                        basePrice = 55;
                    else
                        basePrice = 45; // default médio
                    bordaPrice = borda && !borda.toLowerCase().includes('não') ? 10 : 0;
                    subtotal = basePrice + bordaPrice;
                    total = subtotal + deliveryFee;
                    orderItem = {
                        name: "Pizza ".concat(sabor, " (").concat(tamanho, ")"),
                        quantity: 1,
                        price: basePrice,
                        extras: borda && !borda.toLowerCase().includes('não') ? [{ name: "Borda ".concat(borda), price: bordaPrice }] : [],
                        notes: ''
                    };
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_pedidos')
                            .insert({
                            user_id: userId,
                            conversation_id: conversationId,
                            contact_number: contactNumber,
                            contact_name: contactName,
                            status: 'pendente',
                            items: [orderItem],
                            subtotal: subtotal,
                            delivery_fee: deliveryFee,
                            discount: 0,
                            total: total,
                            delivery_type: isDelivery ? 'delivery' : 'pickup',
                            delivery_address: endereco ? { street: endereco } : null,
                            payment_method: pagamento.toLowerCase().includes('pix') ? 'pix' :
                                pagamento.toLowerCase().includes('cartão') || pagamento.toLowerCase().includes('cartao') ? 'cartao' : 'dinheiro',
                            payment_status: 'pendente',
                            notes: troco && troco !== '0' ? "Troco para R$ ".concat(troco) : null
                        })
                            .select()
                            .single()];
                case 17:
                    _b = _x.sent(), savedOrder = _b.data, saveError = _b.error;
                    if (saveError) {
                        console.error("\uD83C\uDF55 [CHATBOT] Erro ao salvar pedido de pizza:", saveError);
                    }
                    else {
                        console.log("\uD83C\uDF55 [CHATBOT] Pedido de pizza #".concat(savedOrder === null || savedOrder === void 0 ? void 0 : savedOrder.id, " salvo com sucesso na tabela delivery_pedidos"));
                        console.log("   \uD83D\uDCCB Item: ".concat(orderItem.name));
                        console.log("   \uD83D\uDCB0 Total: R$ ".concat(total, " (subtotal: ").concat(subtotal, " + entrega: ").concat(deliveryFee, ")"));
                        console.log("   \uD83D\uDCCD Tipo: ".concat(isDelivery ? 'Delivery' : 'Retirada'));
                        console.log("   \uD83D\uDCB3 Pagamento: ".concat(pagamento));
                    }
                    return [3 /*break*/, 19];
                case 18:
                    autoSaveError_1 = _x.sent();
                    console.error("\uD83C\uDF55 [CHATBOT] Erro ao salvar pedido de pizza automaticamente:", autoSaveError_1);
                    return [3 /*break*/, 19];
                case 19:
                    if (!(((_v = response.variables) === null || _v === void 0 ? void 0 : _v.__appointment_pending) === 'true' && ((_w = response.variables) === null || _w === void 0 ? void 0 : _w.__appointment_data))) return [3 /*break*/, 24];
                    _x.label = 20;
                case 20:
                    _x.trys.push([20, 23, , 24]);
                    appointmentData = JSON.parse(response.variables.__appointment_data);
                    console.log("\uD83D\uDCC5 [CHATBOT] Salvando agendamento na tabela appointments");
                    return [4 /*yield*/, storage_1.storage.getConversation(conversationId)];
                case 21:
                    conversation = _x.sent();
                    clientName = appointmentData.client_name || (conversation === null || conversation === void 0 ? void 0 : conversation.contactName) || 'Cliente';
                    durationMinutes = appointmentData.duration_minutes || 60;
                    startTime = appointmentData.start_time || '09:00';
                    _c = startTime.split(':').map(Number), hours = _c[0], minutes = _c[1];
                    endDate = new Date(2000, 0, 1, hours, minutes + durationMinutes);
                    endTime = "".concat(String(endDate.getHours()).padStart(2, '0'), ":").concat(String(endDate.getMinutes()).padStart(2, '0'));
                    appointmentId = "apt_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('appointments')
                            .insert({
                            id: appointmentId,
                            user_id: userId,
                            conversation_id: conversationId,
                            client_name: clientName,
                            client_phone: contactNumber,
                            client_email: appointmentData.client_email || null,
                            service_id: appointmentData.service_id || null,
                            service_name: appointmentData.service_name || 'Serviço não especificado',
                            professional_id: appointmentData.professional_id || null,
                            professional_name: appointmentData.professional_name || null,
                            appointment_date: appointmentData.appointment_date,
                            start_time: startTime,
                            end_time: endTime,
                            duration_minutes: durationMinutes,
                            location: appointmentData.location || null,
                            location_type: appointmentData.location_type || 'presencial',
                            status: 'pendente',
                            confirmed_by_client: false,
                            confirmed_by_business: false,
                            created_by_ai: true,
                            ai_confirmation_pending: true,
                            client_notes: appointmentData.notes || null,
                            ai_conversation_context: {
                                conversationId: conversationId,
                                createdAt: new Date().toISOString(),
                                variables: response.variables
                            }
                        })
                            .select()
                            .single()];
                case 22:
                    _d = _x.sent(), savedAppointment = _d.data, saveError = _d.error;
                    if (saveError) {
                        console.error("\uD83D\uDCC5 [CHATBOT] Erro ao salvar agendamento:", saveError);
                    }
                    else {
                        console.log("\uD83D\uDCC5 [CHATBOT] Agendamento ".concat(savedAppointment === null || savedAppointment === void 0 ? void 0 : savedAppointment.id, " salvo com sucesso na tabela appointments"));
                    }
                    return [3 /*break*/, 24];
                case 23:
                    appointmentError_1 = _x.sent();
                    console.error("\uD83D\uDCC5 [CHATBOT] Erro ao processar agendamento:", appointmentError_1);
                    return [3 /*break*/, 24];
                case 24: return [2 /*return*/, {
                        handled: true,
                        transferToHuman: response.shouldTransferToHuman
                    }];
                case 25:
                    error_1 = _x.sent();
                    console.error("\uD83E\uDD16 [CHATBOT] Erro ao processar mensagem:", error_1);
                    return [2 /*return*/, { handled: false }];
                case 26: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verificar se é um novo contato (primeira mensagem desta conversa)
 */
function isNewContact(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var messages, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, storage_1.storage.getMessagesByConversationId(conversationId)];
                case 1:
                    messages = _a.sent();
                    // É novo se tem 1 ou menos mensagens (a que acabou de chegar)
                    return [2 /*return*/, messages.length <= 1];
                case 2:
                    error_2 = _a.sent();
                    console.error("[CHATBOT] Erro ao verificar se \u00E9 novo contato:", error_2);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
