"use strict";
/**
 * 🍕 DELIVERY SERVICE
 * Serviço para processamento automático de pedidos de delivery via IA
 *
 * Similar ao schedulingService.ts, mas para pedidos de comida
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
exports.processDeliveryOrderTags = processDeliveryOrderTags;
exports.createDeliveryOrder = createDeliveryOrder;
exports.findMenuItemByName = findMenuItemByName;
exports.getDeliveryConfig = getDeliveryConfig;
exports.formatOrderNotification = formatOrderNotification;
var supabaseAuth_1 = require("./supabaseAuth");
var whatsappSender_1 = require("./whatsappSender");
// ═══════════════════════════════════════════════════════════════════════
// 📦 BUSCAR ITEM DO CARDÁPIO POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════
function findMenuItemByName(userId, itemName) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedName_1, _a, items, error, match, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    normalizedName_1 = itemName.toLowerCase().trim()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('menu_items')
                            .select("\n        id,\n        name,\n        price,\n        promotional_price,\n        category:menu_categories!inner(user_id)\n      ")
                            .eq('menu_categories.user_id', userId)
                            .eq('is_available', true)];
                case 1:
                    _a = _b.sent(), items = _a.data, error = _a.error;
                    if (error || !items || items.length === 0) {
                        console.log("\uD83C\uDF55 [Delivery] No menu items found for user ".concat(userId));
                        return [2 /*return*/, null];
                    }
                    match = items.find(function (item) {
                        return item.name.toLowerCase().trim() === itemName.toLowerCase().trim();
                    });
                    // Se não encontrou exato, busca fuzzy
                    if (!match) {
                        match = items.find(function (item) {
                            var normalizedItemName = item.name.toLowerCase().trim()
                                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                            return normalizedItemName.includes(normalizedName_1) ||
                                normalizedName_1.includes(normalizedItemName);
                        });
                    }
                    if (match) {
                        return [2 /*return*/, {
                                id: match.id,
                                name: match.name,
                                price: parseFloat(match.price) || 0,
                                promotional_price: match.promotional_price ? parseFloat(match.promotional_price) : null
                            }];
                    }
                    console.log("\uD83C\uDF55 [Delivery] Item \"".concat(itemName, "\" not found in menu"));
                    return [2 /*return*/, null];
                case 2:
                    error_1 = _b.sent();
                    console.error('🍕 [Delivery] Error finding menu item:', error_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// 🏷️ BUSCAR CONFIGURAÇÃO DE DELIVERY DO USUÁRIO
// ═══════════════════════════════════════════════════════════════════════
function getDeliveryConfig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_config')
                            .select('delivery_fee, estimated_delivery_time, whatsapp_order_number, business_name, min_order_value')
                            .eq('user_id', userId)
                            .maybeSingle()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error || !data) {
                        console.log("\uD83C\uDF55 [Delivery] No config found for user ".concat(userId));
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            delivery_fee: parseFloat(data.delivery_fee) || 0,
                            estimated_delivery_time: data.estimated_delivery_time || 30,
                            whatsapp_order_number: data.whatsapp_order_number,
                            business_name: data.business_name || 'Delivery',
                            min_order_value: parseFloat(data.min_order_value) || 0
                        }];
                case 2:
                    error_2 = _b.sent();
                    console.error('🍕 [Delivery] Error getting config:', error_2);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// 🛒 CRIAR PEDIDO DE DELIVERY
// ═══════════════════════════════════════════════════════════════════════
function createDeliveryOrder(userId, customerName, customerPhone, customerAddress, deliveryType, paymentMethod, items, notes, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, resolvedItems, subtotal, _i, items_1, orderItem, menuItem, unitPrice, totalPrice, deliveryFee, total, _a, order_1, orderError, orderItemsToInsert, itemsError, notificationMessage, notifyError_1, error_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 12, , 13]);
                    console.log("\uD83C\uDF55 [Delivery] Creating order for ".concat(customerName, " (").concat(customerPhone, ")"));
                    console.log("\uD83C\uDF55 [Delivery] Items: ".concat(JSON.stringify(items)));
                    return [4 /*yield*/, getDeliveryConfig(userId)];
                case 1:
                    config = _b.sent();
                    if (!config) {
                        return [2 /*return*/, { success: false, error: 'Delivery configuration not found' }];
                    }
                    resolvedItems = [];
                    subtotal = 0;
                    _i = 0, items_1 = items;
                    _b.label = 2;
                case 2:
                    if (!(_i < items_1.length)) return [3 /*break*/, 5];
                    orderItem = items_1[_i];
                    return [4 /*yield*/, findMenuItemByName(userId, orderItem.name)];
                case 3:
                    menuItem = _b.sent();
                    if (!menuItem) {
                        console.log("\u26A0\uFE0F [Delivery] Item \"".concat(orderItem.name, "\" not found, skipping"));
                        return [3 /*break*/, 4]; // Pula item não encontrado ao invés de falhar
                    }
                    unitPrice = menuItem.promotional_price || menuItem.price;
                    totalPrice = unitPrice * orderItem.quantity;
                    resolvedItems.push({
                        menu_item_id: menuItem.id,
                        item_name: menuItem.name,
                        quantity: orderItem.quantity,
                        unit_price: unitPrice,
                        total_price: totalPrice,
                        notes: orderItem.notes
                    });
                    subtotal += totalPrice;
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    if (resolvedItems.length === 0) {
                        return [2 /*return*/, { success: false, error: 'No valid items found in order' }];
                    }
                    // Verificar pedido mínimo
                    if (config.min_order_value > 0 && subtotal < config.min_order_value) {
                        return [2 /*return*/, {
                                success: false,
                                error: "Minimum order value is R$".concat(config.min_order_value.toFixed(2), ". Current: R$").concat(subtotal.toFixed(2))
                            }];
                    }
                    deliveryFee = deliveryType === 'delivery' ? config.delivery_fee : 0;
                    total = subtotal + deliveryFee;
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('delivery_orders')
                            .insert({
                            user_id: userId,
                            conversation_id: conversationId,
                            customer_name: customerName,
                            customer_phone: customerPhone,
                            customer_address: customerAddress,
                            customer_complement: null,
                            delivery_type: deliveryType,
                            payment_method: paymentMethod,
                            status: 'pending',
                            subtotal: subtotal,
                            delivery_fee: deliveryFee,
                            total: total,
                            estimated_time: config.estimated_delivery_time,
                            notes: notes
                        })
                            .select()
                            .single()];
                case 6:
                    _a = _b.sent(), order_1 = _a.data, orderError = _a.error;
                    if (orderError || !order_1) {
                        console.error('🍕 [Delivery] Error creating order:', orderError);
                        return [2 /*return*/, { success: false, error: (orderError === null || orderError === void 0 ? void 0 : orderError.message) || 'Failed to create order' }];
                    }
                    console.log("\u2705 [Delivery] Order created with ID: ".concat(order_1.id));
                    orderItemsToInsert = resolvedItems.map(function (item) { return ({
                        order_id: order_1.id,
                        menu_item_id: item.menu_item_id,
                        item_name: item.item_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price,
                        notes: item.notes
                    }); });
                    return [4 /*yield*/, supabaseAuth_1.supabase
                            .from('order_items')
                            .insert(orderItemsToInsert)];
                case 7:
                    itemsError = (_b.sent()).error;
                    if (itemsError) {
                        console.error('🍕 [Delivery] Error inserting order items:', itemsError);
                        // Não falha o pedido, só loga o erro
                    }
                    if (!config.whatsapp_order_number) return [3 /*break*/, 11];
                    _b.label = 8;
                case 8:
                    _b.trys.push([8, 10, , 11]);
                    notificationMessage = formatOrderNotification(order_1, resolvedItems, config);
                    return [4 /*yield*/, (0, whatsappSender_1.sendWhatsAppMessageFromUser)(userId, config.whatsapp_order_number, notificationMessage)];
                case 9:
                    _b.sent();
                    console.log("\uD83D\uDCF1 [Delivery] Notification sent to ".concat(config.whatsapp_order_number));
                    return [3 /*break*/, 11];
                case 10:
                    notifyError_1 = _b.sent();
                    console.error('📱 [Delivery] Failed to send notification:', notifyError_1);
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/, {
                        success: true,
                        order: order_1
                    }];
                case 12:
                    error_3 = _b.sent();
                    console.error('🍕 [Delivery] Error in createDeliveryOrder:', error_3);
                    return [2 /*return*/, { success: false, error: 'Internal error creating order' }];
                case 13: return [2 /*return*/];
            }
        });
    });
}
// ═══════════════════════════════════════════════════════════════════════
// 📨 FORMATAR NOTIFICAÇÃO DO PEDIDO
// ═══════════════════════════════════════════════════════════════════════
function formatOrderNotification(order, items, config) {
    var formatPrice = function (value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    var itemsList = items.map(function (item) {
        return "  ".concat(item.quantity, "x ").concat(item.item_name, " - ").concat(formatPrice(item.total_price)).concat(item.notes ? " _(".concat(item.notes, ")_") : '');
    }).join('\n');
    var deliveryInfo = order.delivery_type === 'delivery'
        ? "\uD83D\uDCCD *Endere\u00E7o:* ".concat(order.customer_address || 'Não informado')
        : "\uD83C\uDFEA *Retirada no local*";
    return "\uD83D\uDD14 *NOVO PEDIDO #".concat(order.id, "*\n\n\uD83D\uDC64 *Cliente:* ").concat(order.customer_name, "\n\uD83D\uDCF1 *Telefone:* ").concat(order.customer_phone, "\n").concat(deliveryInfo, "\n\n\uD83D\uDCCB *Itens:*\n").concat(itemsList, "\n\n\uD83D\uDCB0 *Subtotal:* ").concat(formatPrice(order.subtotal), "\n").concat(order.delivery_fee > 0 ? "\uD83D\uDEF5 *Taxa de entrega:* ".concat(formatPrice(order.delivery_fee)) : '', "\n*TOTAL: ").concat(formatPrice(order.total), "*\n\n\uD83D\uDCB3 *Pagamento:* ").concat(order.payment_method, "\n").concat(order.notes ? "\uD83D\uDCDD *Obs:* ".concat(order.notes) : '', "\n\n\u23F0 *Tempo estimado:* ~").concat(order.estimated_time, " min");
}
// ═══════════════════════════════════════════════════════════════════════
// 🏷️ PROCESSAR TAGS DE PEDIDO NA RESPOSTA DA IA
// ═══════════════════════════════════════════════════════════════════════
/**
 * Processa tags [PEDIDO_DELIVERY: ...] na resposta da IA
 *
 * Formato da tag:
 * [PEDIDO_DELIVERY: CLIENTE=Nome, TELEFONE=11999999999, ENDERECO=Rua..., TIPO=delivery|retirada, PAGAMENTO=pix|dinheiro|cartao, ITENS=1x Pizza Calabresa;2x Coca-Cola, OBS=observações]
 *
 * Campos obrigatórios: CLIENTE, TIPO, PAGAMENTO, ITENS
 * Campos opcionais: TELEFONE (usa do contexto), ENDERECO (obrigatório se TIPO=delivery), OBS
 */
function processDeliveryOrderTags(responseText, userId, customerPhone, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var orderTagRegex, match, modifiedText, orderCreated, fullMatch, tagContent, fields, phone, deliveryType, items, result, trimmed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    orderTagRegex = /\[PEDIDO_DELIVERY:\s*([^\]]+)\]/gi;
                    match = orderTagRegex.exec(responseText);
                    modifiedText = responseText;
                    _a.label = 1;
                case 1:
                    if (!match) return [3 /*break*/, 3];
                    fullMatch = match[0], tagContent = match[1];
                    console.log("\uD83C\uDF55 [Delivery] Detected order tag: ".concat(fullMatch));
                    fields = parseOrderTagFields(tagContent);
                    if (!fields) {
                        console.log("\u26A0\uFE0F [Delivery] Failed to parse order tag fields");
                        modifiedText = modifiedText.replace(fullMatch, '');
                        match = orderTagRegex.exec(responseText);
                        return [3 /*break*/, 1];
                    }
                    phone = fields.telefone || customerPhone;
                    deliveryType = fields.tipo.toLowerCase() === 'retirada' ? 'pickup' : 'delivery';
                    // Validar endereço para delivery
                    if (deliveryType === 'delivery' && !fields.endereco) {
                        console.log("\u26A0\uFE0F [Delivery] Missing address for delivery order");
                        modifiedText = modifiedText.replace(fullMatch, '');
                        match = orderTagRegex.exec(responseText);
                        return [3 /*break*/, 1];
                    }
                    items = parseOrderItems(fields.itens);
                    if (items.length === 0) {
                        console.log("\u26A0\uFE0F [Delivery] No valid items in order");
                        modifiedText = modifiedText.replace(fullMatch, '');
                        match = orderTagRegex.exec(responseText);
                        return [3 /*break*/, 1];
                    }
                    return [4 /*yield*/, createDeliveryOrder(userId, fields.cliente, phone, fields.endereco || null, deliveryType, fields.pagamento, items, fields.obs, conversationId)];
                case 2:
                    result = _a.sent();
                    if (result.success && result.order) {
                        console.log("\u2705 [Delivery] Order #".concat(result.order.id, " created successfully"));
                        orderCreated = result.order;
                        // Remover a tag da resposta
                        modifiedText = modifiedText.replace(fullMatch, '');
                        trimmed = modifiedText.trim();
                        if (!trimmed.endsWith('✅') && !trimmed.endsWith('🛵') && !trimmed.endsWith('👍') && !trimmed.endsWith('🍕')) {
                            modifiedText = trimmed + ' ✅';
                        }
                    }
                    else {
                        console.log("\u274C [Delivery] Failed to create order: ".concat(result.error));
                        // Remover a tag sem adicionar mensagem de erro (IA já confirmou para o cliente)
                        modifiedText = modifiedText.replace(fullMatch, '');
                    }
                    match = orderTagRegex.exec(responseText);
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, { text: modifiedText.trim(), orderCreated: orderCreated }];
            }
        });
    });
}
function parseOrderTagFields(tagContent) {
    try {
        var fields = {};
        // Regex para capturar cada campo (KEY=VALUE)
        var fieldRegex = /(CLIENTE|TELEFONE|ENDERECO|TIPO|PAGAMENTO|ITENS|OBS)=([^,]+?)(?=,\s*[A-Z]+=|$)/gi;
        var fieldMatch = void 0;
        while ((fieldMatch = fieldRegex.exec(tagContent)) !== null) {
            var key = fieldMatch[1], value = fieldMatch[2];
            var normalizedKey = key.toLowerCase();
            fields[normalizedKey] = value.trim();
        }
        // Validar campos obrigatórios
        if (!fields.cliente || !fields.tipo || !fields.pagamento || !fields.itens) {
            console.log("\u26A0\uFE0F [Delivery] Missing required fields:", {
                cliente: !!fields.cliente,
                tipo: !!fields.tipo,
                pagamento: !!fields.pagamento,
                itens: !!fields.itens
            });
            return null;
        }
        return fields;
    }
    catch (error) {
        console.error('🍕 [Delivery] Error parsing tag fields:', error);
        return null;
    }
}
function parseOrderItems(itemsString) {
    var items = [];
    try {
        // Formato esperado: "1x Pizza Calabresa;2x Coca-Cola" ou "1x Pizza Calabresa (sem cebola);2x Coca"
        var itemParts = itemsString.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
        for (var _i = 0, itemParts_1 = itemParts; _i < itemParts_1.length; _i++) {
            var part = itemParts_1[_i];
            // Regex: captura quantidade, nome e opcionalmente observações entre parênteses
            var itemRegex = /^(\d+)x\s*(.+?)(?:\s*\(([^)]+)\))?$/i;
            var match = itemRegex.exec(part);
            if (match) {
                var quantity = match[1], name_1 = match[2], notes = match[3];
                items.push({
                    quantity: parseInt(quantity, 10) || 1,
                    name: name_1.trim(),
                    notes: notes === null || notes === void 0 ? void 0 : notes.trim()
                });
            }
            else {
                // Fallback: tenta extrair só o nome (assume quantidade 1)
                var cleanName = part.replace(/^\d+x\s*/i, '').trim();
                if (cleanName) {
                    items.push({
                        quantity: 1,
                        name: cleanName
                    });
                }
            }
        }
    }
    catch (error) {
        console.error('🍕 [Delivery] Error parsing items:', error);
    }
    return items;
}
