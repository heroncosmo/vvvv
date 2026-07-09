/**
 * 🍕 DELIVERY SERVICE
 * Serviço para processamento automático de pedidos de delivery via IA
 * 
 * Similar ao schedulingService.ts, mas para pedidos de comida
 */

import { supabase } from "./supabaseAuth";
import { sendWhatsAppMessageFromUser } from "./whatsappSender";

// ═══════════════════════════════════════════════════════════════════════
// 🎯 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════

interface DeliveryOrderItem {
  menu_item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
}

interface DeliveryOrder {
  id: number;
  user_id: string;
  conversation_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  customer_complement?: string;
  delivery_type: 'delivery' | 'pickup';
  payment_method: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  estimated_time?: number;
  notes?: string;
  created_at: string;
}

interface CreateOrderResult {
  success: boolean;
  order?: DeliveryOrder;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// 📦 BUSCAR ITEM DO CARDÁPIO POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════

async function findMenuItemByName(userId: string, itemName: string): Promise<{
  id: number;
  name: string;
  price: number;
  promotional_price: number | null;
} | null> {
  try {
    // Normalizar nome para busca
    const normalizedName = itemName.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove acentos

    // Buscar todos os itens do cardápio do usuário
    const { data: items, error } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
        price,
        promotional_price,
        category:menu_categories!inner(user_id)
      `)
      .eq('menu_categories.user_id', userId)
      .eq('is_available', true);

    if (error || !items || items.length === 0) {
      console.log(`🍕 [Delivery] No menu items found for user ${userId}`);
      return null;
    }

    // Buscar match exato primeiro
    let match = items.find((item: any) => 
      item.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    );

    // Se não encontrou exato, busca fuzzy
    if (!match) {
      match = items.find((item: any) => {
        const normalizedItemName = item.name.toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedItemName.includes(normalizedName) || 
               normalizedName.includes(normalizedItemName);
      });
    }

    if (match) {
      return {
        id: match.id,
        name: match.name,
        price: parseFloat(match.price) || 0,
        promotional_price: match.promotional_price ? parseFloat(match.promotional_price) : null
      };
    }

    console.log(`🍕 [Delivery] Item "${itemName}" not found in menu`);
    return null;
  } catch (error) {
    console.error('🍕 [Delivery] Error finding menu item:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🏷️ BUSCAR CONFIGURAÇÃO DE DELIVERY DO USUÁRIO
// ═══════════════════════════════════════════════════════════════════════

async function getDeliveryConfig(userId: string): Promise<{
  delivery_fee: number;
  estimated_delivery_time: number;
  whatsapp_order_number: string | null;
  business_name: string;
  min_order_value: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from('delivery_config')
      .select('delivery_fee, estimated_delivery_time, whatsapp_order_number, business_name, min_order_value')
      .eq('user_id', userId)
      .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 when user has no delivery config

    if (error || !data) {
      console.log(`🍕 [Delivery] No config found for user ${userId}`);
      return null;
    }

    return {
      delivery_fee: parseFloat(data.delivery_fee) || 0,
      estimated_delivery_time: data.estimated_delivery_time || 30,
      whatsapp_order_number: data.whatsapp_order_number,
      business_name: data.business_name || 'Delivery',
      min_order_value: parseFloat(data.min_order_value) || 0
    };
  } catch (error) {
    console.error('🍕 [Delivery] Error getting config:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🛒 CRIAR PEDIDO DE DELIVERY
// ═══════════════════════════════════════════════════════════════════════

async function createDeliveryOrder(
  userId: string,
  customerName: string,
  customerPhone: string,
  customerAddress: string | null,
  deliveryType: 'delivery' | 'pickup',
  paymentMethod: string,
  items: Array<{ name: string; quantity: number; notes?: string }>,
  notes?: string,
  conversationId?: string
): Promise<CreateOrderResult> {
  try {
    console.log(`🍕 [Delivery] Creating order for ${customerName} (${customerPhone})`);
    console.log(`🍕 [Delivery] Items: ${JSON.stringify(items)}`);

    // Buscar configuração de delivery
    const config = await getDeliveryConfig(userId);
    if (!config) {
      return { success: false, error: 'Delivery configuration not found' };
    }

    // Resolver itens do cardápio e calcular totais
    const resolvedItems: DeliveryOrderItem[] = [];
    let subtotal = 0;

    for (const orderItem of items) {
      const menuItem = await findMenuItemByName(userId, orderItem.name);
      
      if (!menuItem) {
        console.log(`⚠️ [Delivery] Item "${orderItem.name}" not found, skipping`);
        continue; // Pula item não encontrado ao invés de falhar
      }

      const unitPrice = menuItem.promotional_price || menuItem.price;
      const totalPrice = unitPrice * orderItem.quantity;

      resolvedItems.push({
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        quantity: orderItem.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: orderItem.notes
      });

      subtotal += totalPrice;
    }

    if (resolvedItems.length === 0) {
      return { success: false, error: 'No valid items found in order' };
    }

    // Verificar pedido mínimo
    if (config.min_order_value > 0 && subtotal < config.min_order_value) {
      return { 
        success: false, 
        error: `Minimum order value is R$${config.min_order_value.toFixed(2)}. Current: R$${subtotal.toFixed(2)}` 
      };
    }

    // Calcular taxa de entrega (0 para retirada)
    const deliveryFee = deliveryType === 'delivery' ? config.delivery_fee : 0;
    const total = subtotal + deliveryFee;

    // Criar o pedido principal
    const { data: order, error: orderError } = await supabase
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
      .single();

    if (orderError || !order) {
      console.error('🍕 [Delivery] Error creating order:', orderError);
      return { success: false, error: orderError?.message || 'Failed to create order' };
    }

    console.log(`✅ [Delivery] Order created with ID: ${order.id}`);

    // Inserir itens do pedido
    const orderItemsToInsert = resolvedItems.map(item => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      notes: item.notes
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsError) {
      console.error('🍕 [Delivery] Error inserting order items:', itemsError);
      // Não falha o pedido, só loga o erro
    }

    // Enviar notificação WhatsApp para o estabelecimento (se configurado)
    if (config.whatsapp_order_number) {
      try {
        const notificationMessage = formatOrderNotification(order, resolvedItems, config);
        await sendWhatsAppMessageFromUser(
          userId,
          config.whatsapp_order_number,
          notificationMessage
        );
        console.log(`📱 [Delivery] Notification sent to ${config.whatsapp_order_number}`);
      } catch (notifyError) {
        console.error('📱 [Delivery] Failed to send notification:', notifyError);
        // Não falha o pedido se notificação falhar
      }
    }

    return { 
      success: true, 
      order: order as DeliveryOrder 
    };
  } catch (error) {
    console.error('🍕 [Delivery] Error in createDeliveryOrder:', error);
    return { success: false, error: 'Internal error creating order' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📨 FORMATAR NOTIFICAÇÃO DO PEDIDO
// ═══════════════════════════════════════════════════════════════════════

function formatOrderNotification(
  order: any,
  items: DeliveryOrderItem[],
  config: { business_name: string }
): string {
  const formatPrice = (value: number) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const itemsList = items.map(item => 
    `  ${item.quantity}x ${item.item_name} - ${formatPrice(item.total_price)}${item.notes ? ` _(${item.notes})_` : ''}`
  ).join('\n');

  const deliveryInfo = order.delivery_type === 'delivery' 
    ? `📍 *Endereço:* ${order.customer_address || 'Não informado'}`
    : `🏪 *Retirada no local*`;

  return `🔔 *NOVO PEDIDO #${order.id}*

👤 *Cliente:* ${order.customer_name}
📱 *Telefone:* ${order.customer_phone}
${deliveryInfo}

📋 *Itens:*
${itemsList}

💰 *Subtotal:* ${formatPrice(order.subtotal)}
${order.delivery_fee > 0 ? `🛵 *Taxa de entrega:* ${formatPrice(order.delivery_fee)}` : ''}
*TOTAL: ${formatPrice(order.total)}*

💳 *Pagamento:* ${order.payment_method}
${order.notes ? `📝 *Obs:* ${order.notes}` : ''}

⏰ *Tempo estimado:* ~${order.estimated_time} min`;
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
export async function processDeliveryOrderTags(
  responseText: string,
  userId: string,
  customerPhone: string,
  conversationId?: string
): Promise<{ text: string; orderCreated?: DeliveryOrder }> {
  // Regex para capturar a tag completa
  const orderTagRegex = /\[PEDIDO_DELIVERY:\s*([^\]]+)\]/gi;
  
  let match = orderTagRegex.exec(responseText);
  let modifiedText = responseText;
  let orderCreated: DeliveryOrder | undefined;
  
  while (match) {
    const [fullMatch, tagContent] = match;
    
    console.log(`🍕 [Delivery] Detected order tag: ${fullMatch}`);
    
    // Parse dos campos da tag
    const fields = parseOrderTagFields(tagContent);
    
    if (!fields) {
      console.log(`⚠️ [Delivery] Failed to parse order tag fields`);
      modifiedText = modifiedText.replace(fullMatch, '');
      match = orderTagRegex.exec(responseText);
      continue;
    }
    
    // Usar telefone do contexto se não especificado na tag
    const phone = fields.telefone || customerPhone;
    
    // Validar tipo de entrega
    const deliveryType = fields.tipo.toLowerCase() === 'retirada' ? 'pickup' : 'delivery';
    
    // Validar endereço para delivery
    if (deliveryType === 'delivery' && !fields.endereco) {
      console.log(`⚠️ [Delivery] Missing address for delivery order`);
      modifiedText = modifiedText.replace(fullMatch, '');
      match = orderTagRegex.exec(responseText);
      continue;
    }
    
    // Parse dos itens
    const items = parseOrderItems(fields.itens);
    
    if (items.length === 0) {
      console.log(`⚠️ [Delivery] No valid items in order`);
      modifiedText = modifiedText.replace(fullMatch, '');
      match = orderTagRegex.exec(responseText);
      continue;
    }
    
    // Criar o pedido
    const result = await createDeliveryOrder(
      userId,
      fields.cliente,
      phone,
      fields.endereco || null,
      deliveryType,
      fields.pagamento,
      items,
      fields.obs,
      conversationId
    );
    
    if (result.success && result.order) {
      console.log(`✅ [Delivery] Order #${result.order.id} created successfully`);
      orderCreated = result.order;
      
      // Remover a tag da resposta
      modifiedText = modifiedText.replace(fullMatch, '');
      
      // Adicionar emoji de confirmação se não tiver
      const trimmed = modifiedText.trim();
      if (!trimmed.endsWith('✅') && !trimmed.endsWith('🛵') && !trimmed.endsWith('👍') && !trimmed.endsWith('🍕')) {
        modifiedText = trimmed + ' ✅';
      }
    } else {
      console.log(`❌ [Delivery] Failed to create order: ${result.error}`);
      // Remover a tag sem adicionar mensagem de erro (IA já confirmou para o cliente)
      modifiedText = modifiedText.replace(fullMatch, '');
    }
    
    match = orderTagRegex.exec(responseText);
  }
  
  return { text: modifiedText.trim(), orderCreated };
}

// ═══════════════════════════════════════════════════════════════════════
// 🔧 FUNÇÕES AUXILIARES DE PARSING
// ═══════════════════════════════════════════════════════════════════════

interface OrderTagFields {
  cliente: string;
  telefone?: string;
  endereco?: string;
  tipo: string;
  pagamento: string;
  itens: string;
  obs?: string;
}

function parseOrderTagFields(tagContent: string): OrderTagFields | null {
  try {
    const fields: Partial<OrderTagFields> = {};
    
    // Regex para capturar cada campo (KEY=VALUE)
    const fieldRegex = /(CLIENTE|TELEFONE|ENDERECO|TIPO|PAGAMENTO|ITENS|OBS)=([^,]+?)(?=,\s*[A-Z]+=|$)/gi;
    
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(tagContent)) !== null) {
      const [, key, value] = fieldMatch;
      const normalizedKey = key.toLowerCase() as keyof OrderTagFields;
      fields[normalizedKey] = value.trim();
    }
    
    // Validar campos obrigatórios
    if (!fields.cliente || !fields.tipo || !fields.pagamento || !fields.itens) {
      console.log(`⚠️ [Delivery] Missing required fields:`, {
        cliente: !!fields.cliente,
        tipo: !!fields.tipo,
        pagamento: !!fields.pagamento,
        itens: !!fields.itens
      });
      return null;
    }
    
    return fields as OrderTagFields;
  } catch (error) {
    console.error('🍕 [Delivery] Error parsing tag fields:', error);
    return null;
  }
}

function parseOrderItems(itemsString: string): Array<{ name: string; quantity: number; notes?: string }> {
  const items: Array<{ name: string; quantity: number; notes?: string }> = [];
  
  try {
    // Formato esperado: "1x Pizza Calabresa;2x Coca-Cola" ou "1x Pizza Calabresa (sem cebola);2x Coca"
    const itemParts = itemsString.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    for (const part of itemParts) {
      // Regex: captura quantidade, nome e opcionalmente observações entre parênteses
      const itemRegex = /^(\d+)x\s*(.+?)(?:\s*\(([^)]+)\))?$/i;
      const match = itemRegex.exec(part);
      
      if (match) {
        const [, quantity, name, notes] = match;
        items.push({
          quantity: parseInt(quantity, 10) || 1,
          name: name.trim(),
          notes: notes?.trim()
        });
      } else {
        // Fallback: tenta extrair só o nome (assume quantidade 1)
        const cleanName = part.replace(/^\d+x\s*/i, '').trim();
        if (cleanName) {
          items.push({
            quantity: 1,
            name: cleanName
          });
        }
      }
    }
  } catch (error) {
    console.error('🍕 [Delivery] Error parsing items:', error);
  }
  
  return items;
}

// ═══════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════

export {
  createDeliveryOrder,
  findMenuItemByName,
  getDeliveryConfig,
  formatOrderNotification
};
