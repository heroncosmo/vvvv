/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🔄 HYBRID FLOW ENGINE - IA + Sistema Determinístico
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * ARQUITETURA CORRETA:
 * 
 * 1. CLIENTE ENVIA MENSAGEM (linguagem natural, qualquer forma)
 *    "me vê uma calabresa aí mano kkk"
 * 
 * 2. IA INTERPRETA → Estrutura JSON para o sistema
 *    { intent: "ADD_ITEM", entities: { product: "calabresa", qty: 1 } }
 * 
 * 3. SISTEMA EXECUTA DETERMINISTICAMENTE (sem IA, sem alucinações)
 *    - Adiciona ao carrinho
 *    - Calcula totais
 *    - Muda estado do fluxo
 * 
 * 4. SISTEMA RETORNA DADOS ESTRUTURADOS
 *    { success: true, data: { cart: [...], total: 45.00 }, nextPrompt: "ask_more" }
 * 
 * 5. IA HUMANIZA A RESPOSTA (opcional)
 *    "Beleza! Adicionei a calabresa 🍕 Tá em R$45. Mais alguma coisa?"
 * 
 * A IA é NECESSÁRIA para interpretar porque clientes falam de infinitas formas.
 * Mas a IA NUNCA executa ações - só interpreta entrada e humaniza saída.
 */

import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════════════════
// 📊 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Intenções que o sistema reconhece
 */
export type SystemIntent = 
  | 'GREETING'
  | 'WANT_MENU'
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'SEE_CART'
  | 'CLEAR_CART'
  | 'CONFIRM_ORDER'
  | 'CANCEL_ORDER'
  | 'CHOOSE_DELIVERY'
  | 'CHOOSE_PICKUP'
  | 'PROVIDE_ADDRESS'
  | 'CHOOSE_PAYMENT'
  | 'PROVIDE_NAME'
  | 'ASK_DELIVERY_FEE'
  | 'ASK_DELIVERY_TIME'
  | 'ASK_PAYMENT_METHODS'
  | 'ASK_HOURS'
  | 'THANKS'
  | 'FAREWELL'
  | 'HELP'
  | 'OTHER';

/**
 * Estrutura que a IA envia para o sistema
 */
export interface ParsedInput {
  intent: SystemIntent;
  entities: {
    product?: string;
    quantity?: number;
    address?: string;
    name?: string;
    payment_method?: 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito';
    delivery_type?: 'delivery' | 'retirada';
  };
  confidence: number;
  original_message: string;
}

/**
 * Estrutura que o sistema retorna para a IA humanizar
 */
export interface SystemResponse {
  success: boolean;
  action_performed: string;
  data: Record<string, any>;
  response_template: string;
  response_variables: Record<string, any>;
  next_expected_input?: string;
  error?: string;
}

/**
 * Estado da conversa
 */
export interface ConversationState {
  current_step: 'INICIO' | 'MENU_MOSTRADO' | 'PEDINDO' | 'TIPO_ENTREGA' | 'ENDERECO' | 'PAGAMENTO' | 'CONFIRMACAO' | 'FINALIZADO';
  cart: Array<{ name: string; quantity: number; unit_price: number }>;
  delivery_type?: 'delivery' | 'retirada';
  address?: string;
  payment_method?: string;
  customer_name?: string;
  total: number;
  created_at: Date;
  last_interaction: Date;
}

/**
 * Configuração do negócio
 */
export interface BusinessConfig {
  name: string;
  menu: Array<{ id: string; name: string; price: number; category: string; description?: string }>;
  delivery_fee: number;
  min_order: number;
  payment_methods: string[];
  hours: string;
  delivery_time: string;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 IA INTERPRETER - Interpreta mensagem do cliente
// ═══════════════════════════════════════════════════════════════════════

export class AIInterpreter {
  private anthropic: Anthropic;
  
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }
  
  /**
   * IA interpreta a mensagem do cliente e retorna estrutura para o sistema
   */
  async interpret(
    message: string, 
    conversationState: ConversationState,
    businessConfig: BusinessConfig
  ): Promise<ParsedInput> {
    
    const menuItems = businessConfig.menu.map(item => item.name).join(', ');
    
    const systemPrompt = `Você é um interpretador de intenções para um sistema de delivery.

TAREFA: Analisar a mensagem do cliente e retornar um JSON estruturado.

MENU DO ESTABELECIMENTO:
${menuItems}

ESTADO ATUAL DA CONVERSA:
- Etapa: ${conversationState.current_step}
- Carrinho: ${conversationState.cart.length > 0 ? conversationState.cart.map(i => `${i.quantity}x ${i.name}`).join(', ') : 'vazio'}
- Total: R$ ${conversationState.total.toFixed(2)}

INTENÇÕES POSSÍVEIS:
- GREETING: saudação (oi, olá, bom dia, e aí)
- WANT_MENU: quer ver cardápio/menu
- ADD_ITEM: quer adicionar produto ao pedido
- REMOVE_ITEM: quer remover produto
- SEE_CART: quer ver o que pediu
- CLEAR_CART: quer limpar/cancelar pedido
- CONFIRM_ORDER: confirma/fecha o pedido
- CANCEL_ORDER: cancela tudo
- CHOOSE_DELIVERY: quer delivery/entrega
- CHOOSE_PICKUP: vai buscar/retirada
- PROVIDE_ADDRESS: está informando endereço
- CHOOSE_PAYMENT: está escolhendo forma de pagamento (pix, dinheiro, cartão)
- PROVIDE_NAME: está informando nome
- ASK_DELIVERY_FEE: pergunta sobre taxa de entrega
- ASK_DELIVERY_TIME: pergunta tempo de entrega
- ASK_PAYMENT_METHODS: pergunta formas de pagamento aceitas
- ASK_HOURS: pergunta horário de funcionamento
- THANKS: agradecimento
- FAREWELL: despedida
- HELP: precisa de ajuda
- OTHER: não se encaixa em nenhuma

REGRAS DE EXTRAÇÃO:
1. Se mencionar produto, extraia o nome mais próximo do menu
2. Se mencionar quantidade, extraia o número (default: 1)
3. Se mencionar endereço (rua, av, número), extraia completo
4. Se mencionar pagamento (pix, dinheiro, cartão), extraia o método

RESPONDA APENAS COM JSON VÁLIDO, SEM EXPLICAÇÕES:
{
  "intent": "INTENT_AQUI",
  "entities": {
    "product": "nome do produto se houver",
    "quantity": 1,
    "address": "endereço se houver",
    "name": "nome se houver",
    "payment_method": "pix|dinheiro|cartao_credito|cartao_debito se houver",
    "delivery_type": "delivery|retirada se houver"
  },
  "confidence": 0.95
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // Modelo rápido e barato para classificação
        max_tokens: 300,
        temperature: 0, // Determinístico
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      });
      
      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Resposta não é texto');
      
      // Parse do JSON
      const parsed = JSON.parse(content.text) as ParsedInput;
      parsed.original_message = message;
      
      return parsed;
      
    } catch (error) {
      console.error('[AIInterpreter] Erro:', error);
      
      // Fallback: retorna OTHER
      return {
        intent: 'OTHER',
        entities: {},
        confidence: 0,
        original_message: message
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ SYSTEM EXECUTOR - Executa ações deterministicamente
// ═══════════════════════════════════════════════════════════════════════

export class SystemExecutor {
  
  /**
   * Executa a ação baseada na intenção interpretada
   * 100% DETERMINÍSTICO - sem IA aqui
   */
  execute(
    parsedInput: ParsedInput,
    state: ConversationState,
    config: BusinessConfig
  ): { newState: ConversationState; response: SystemResponse } {
    
    const newState = { ...state, last_interaction: new Date() };
    let response: SystemResponse;
    
    switch (parsedInput.intent) {
      
      // ─────────────────────────────────────────
      // SAUDAÇÃO
      // ─────────────────────────────────────────
      case 'GREETING':
        newState.current_step = 'INICIO';
        response = {
          success: true,
          action_performed: 'GREET',
          data: {},
          response_template: 'Olá! 😊 Bem-vindo ao {business_name}! Posso te enviar nosso cardápio ou você já sabe o que quer pedir?',
          response_variables: { business_name: config.name },
          next_expected_input: 'WANT_MENU ou ADD_ITEM'
        };
        break;
      
      // ─────────────────────────────────────────
      // MOSTRAR MENU
      // ─────────────────────────────────────────
      case 'WANT_MENU':
        newState.current_step = 'MENU_MOSTRADO';
        
        // Agrupar por categoria
        const menuByCategory: Record<string, typeof config.menu> = {};
        for (const item of config.menu) {
          if (!menuByCategory[item.category]) menuByCategory[item.category] = [];
          menuByCategory[item.category].push(item);
        }
        
        let menuText = `📋 *CARDÁPIO ${config.name.toUpperCase()}*\n\n`;
        for (const [category, items] of Object.entries(menuByCategory)) {
          menuText += `*${category}*\n`;
          for (const item of items) {
            menuText += `• ${item.name} - R$ ${item.price.toFixed(2)}\n`;
          }
          menuText += '\n';
        }
        menuText += `\n💰 Pedido mínimo: R$ ${config.min_order.toFixed(2)}\n`;
        menuText += `🛵 Taxa de entrega: R$ ${config.delivery_fee.toFixed(2)}`;
        
        response = {
          success: true,
          action_performed: 'SHOW_MENU',
          data: { menu: config.menu, categories: menuByCategory },
          response_template: menuText + '\n\nO que vai querer hoje?',
          response_variables: {},
          next_expected_input: 'ADD_ITEM'
        };
        break;
      
      // ─────────────────────────────────────────
      // ADICIONAR ITEM
      // ─────────────────────────────────────────
      case 'ADD_ITEM':
        const productName = parsedInput.entities.product;
        const quantity = parsedInput.entities.quantity || 1;
        
        if (!productName) {
          response = {
            success: false,
            action_performed: 'ADD_ITEM_FAILED',
            data: {},
            response_template: 'Qual produto você quer adicionar? Me fala o nome que eu adiciono pro seu pedido 😊',
            response_variables: {},
            error: 'Produto não especificado'
          };
          break;
        }
        
        // Buscar no menu (fuzzy match)
        const foundItem = this.findMenuItem(productName, config.menu);
        
        if (!foundItem) {
          response = {
            success: false,
            action_performed: 'ITEM_NOT_FOUND',
            data: { searched: productName },
            response_template: 'Hmm, não encontrei "{product}" no nosso cardápio 🤔 Quer ver as opções disponíveis?',
            response_variables: { product: productName },
            error: 'Item não encontrado'
          };
          break;
        }
        
        // Adicionar ao carrinho
        const existingItem = newState.cart.find(i => i.name === foundItem.name);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          newState.cart.push({
            name: foundItem.name,
            quantity: quantity,
            unit_price: foundItem.price
          });
        }
        
        // Recalcular total
        newState.total = newState.cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        newState.current_step = 'PEDINDO';
        
        response = {
          success: true,
          action_performed: 'ITEM_ADDED',
          data: { 
            item_added: foundItem.name,
            quantity: quantity,
            item_total: foundItem.price * quantity,
            cart: newState.cart,
            cart_total: newState.total
          },
          response_template: 'Beleza! Adicionei {quantity}x {item} ✅\n\nSeu pedido até agora:\n{cart_summary}\n\n💰 Total: R$ {total}\n\nMais alguma coisa ou podemos fechar?',
          response_variables: {
            quantity: quantity,
            item: foundItem.name,
            cart_summary: newState.cart.map(i => `• ${i.quantity}x ${i.name} - R$ ${(i.quantity * i.unit_price).toFixed(2)}`).join('\n'),
            total: newState.total.toFixed(2)
          },
          next_expected_input: 'ADD_ITEM ou CONFIRM_ORDER'
        };
        break;
      
      // ─────────────────────────────────────────
      // VER CARRINHO
      // ─────────────────────────────────────────
      case 'SEE_CART':
        if (newState.cart.length === 0) {
          response = {
            success: true,
            action_performed: 'SHOW_EMPTY_CART',
            data: {},
            response_template: 'Seu carrinho está vazio! 🛒 Quer ver nosso cardápio?',
            response_variables: {}
          };
        } else {
          response = {
            success: true,
            action_performed: 'SHOW_CART',
            data: { cart: newState.cart, total: newState.total },
            response_template: '🛒 *Seu Pedido:*\n\n{cart_summary}\n\n💰 Total: R$ {total}\n\nQuer adicionar mais algo ou podemos fechar?',
            response_variables: {
              cart_summary: newState.cart.map(i => `• ${i.quantity}x ${i.name} - R$ ${(i.quantity * i.unit_price).toFixed(2)}`).join('\n'),
              total: newState.total.toFixed(2)
            }
          };
        }
        break;
      
      // ─────────────────────────────────────────
      // CONFIRMAR PEDIDO
      // ─────────────────────────────────────────
      case 'CONFIRM_ORDER':
        if (newState.cart.length === 0) {
          response = {
            success: false,
            action_performed: 'CONFIRM_FAILED',
            data: {},
            response_template: 'Você ainda não adicionou nada ao pedido! O que vai querer?',
            response_variables: {},
            error: 'Carrinho vazio'
          };
          break;
        }
        
        newState.current_step = 'TIPO_ENTREGA';
        response = {
          success: true,
          action_performed: 'ASK_DELIVERY_TYPE',
          data: { cart: newState.cart, total: newState.total },
          response_template: '🛵 Vai ser *delivery* ou você vai *retirar* no local?',
          response_variables: {},
          next_expected_input: 'CHOOSE_DELIVERY ou CHOOSE_PICKUP'
        };
        break;
      
      // ─────────────────────────────────────────
      // ESCOLHER DELIVERY
      // ─────────────────────────────────────────
      case 'CHOOSE_DELIVERY':
        newState.delivery_type = 'delivery';
        newState.current_step = 'ENDERECO';
        newState.total += config.delivery_fee;
        
        response = {
          success: true,
          action_performed: 'DELIVERY_SELECTED',
          data: { delivery_fee: config.delivery_fee },
          response_template: '📍 Qual seu endereço de entrega? (Rua, número, bairro)',
          response_variables: {},
          next_expected_input: 'PROVIDE_ADDRESS'
        };
        break;
      
      // ─────────────────────────────────────────
      // ESCOLHER RETIRADA
      // ─────────────────────────────────────────
      case 'CHOOSE_PICKUP':
        newState.delivery_type = 'retirada';
        newState.current_step = 'PAGAMENTO';
        
        response = {
          success: true,
          action_performed: 'PICKUP_SELECTED',
          data: {},
          response_template: '👍 Beleza, retirada no local!\n\n💳 Como vai ser o pagamento?\n• Pix\n• Cartão (crédito/débito)\n• Dinheiro',
          response_variables: {},
          next_expected_input: 'CHOOSE_PAYMENT'
        };
        break;
      
      // ─────────────────────────────────────────
      // FORNECER ENDEREÇO
      // ─────────────────────────────────────────
      case 'PROVIDE_ADDRESS':
        if (!parsedInput.entities.address) {
          response = {
            success: false,
            action_performed: 'ADDRESS_FAILED',
            data: {},
            response_template: 'Não consegui entender o endereço 🤔 Pode me passar no formato: Rua, número, bairro?',
            response_variables: {},
            error: 'Endereço não identificado'
          };
          break;
        }
        
        newState.address = parsedInput.entities.address;
        newState.current_step = 'PAGAMENTO';
        
        response = {
          success: true,
          action_performed: 'ADDRESS_SAVED',
          data: { address: newState.address },
          response_template: '📍 Endereço: {address}\n\n💳 Como vai ser o pagamento?\n• Pix\n• Cartão (crédito/débito)\n• Dinheiro',
          response_variables: { address: newState.address },
          next_expected_input: 'CHOOSE_PAYMENT'
        };
        break;
      
      // ─────────────────────────────────────────
      // ESCOLHER PAGAMENTO
      // ─────────────────────────────────────────
      case 'CHOOSE_PAYMENT':
        const payment = parsedInput.entities.payment_method;
        
        if (!payment) {
          response = {
            success: false,
            action_performed: 'PAYMENT_FAILED',
            data: {},
            response_template: 'Como você quer pagar? Aceitamos Pix, Cartão ou Dinheiro.',
            response_variables: {},
            error: 'Método não especificado'
          };
          break;
        }
        
        const paymentMap: Record<string, string> = {
          'pix': 'Pix',
          'dinheiro': 'Dinheiro',
          'cartao_credito': 'Cartão de Crédito',
          'cartao_debito': 'Cartão de Débito'
        };
        
        newState.payment_method = paymentMap[payment] || payment;
        newState.current_step = 'CONFIRMACAO';
        
        // Montar resumo final
        let resumo = '📋 *RESUMO DO PEDIDO*\n\n';
        resumo += newState.cart.map(i => `• ${i.quantity}x ${i.name} - R$ ${(i.quantity * i.unit_price).toFixed(2)}`).join('\n');
        resumo += `\n\n🛵 ${newState.delivery_type === 'delivery' ? 'Delivery' : 'Retirada'}`;
        if (newState.address) resumo += `\n📍 ${newState.address}`;
        resumo += `\n💳 ${newState.payment_method}`;
        resumo += `\n\n💰 *TOTAL: R$ ${newState.total.toFixed(2)}*`;
        resumo += '\n\n✅ Tudo certo? Posso confirmar o pedido?';
        
        response = {
          success: true,
          action_performed: 'SHOW_CONFIRMATION',
          data: { 
            cart: newState.cart, 
            total: newState.total,
            delivery_type: newState.delivery_type,
            address: newState.address,
            payment: newState.payment_method
          },
          response_template: resumo,
          response_variables: {},
          next_expected_input: 'CONFIRM_ORDER ou CANCEL_ORDER'
        };
        break;
      
      // ─────────────────────────────────────────
      // REMOVER ITEM
      // ─────────────────────────────────────────
      case 'REMOVE_ITEM':
        const itemToRemove = parsedInput.entities.product;
        if (!itemToRemove) {
          response = {
            success: false,
            action_performed: 'REMOVE_FAILED',
            data: {},
            response_template: 'Qual item você quer remover?',
            response_variables: {},
            error: 'Item não especificado'
          };
          break;
        }
        
        const itemIndex = newState.cart.findIndex(i => 
          i.name.toLowerCase().includes(itemToRemove.toLowerCase())
        );
        
        if (itemIndex === -1) {
          response = {
            success: false,
            action_performed: 'ITEM_NOT_IN_CART',
            data: {},
            response_template: 'Não encontrei "{item}" no seu pedido.',
            response_variables: { item: itemToRemove },
            error: 'Item não está no carrinho'
          };
          break;
        }
        
        const removed = newState.cart.splice(itemIndex, 1)[0];
        newState.total = newState.cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        
        response = {
          success: true,
          action_performed: 'ITEM_REMOVED',
          data: { removed: removed },
          response_template: 'Removi {item} do pedido! ✅',
          response_variables: { item: removed.name }
        };
        break;
      
      // ─────────────────────────────────────────
      // LIMPAR CARRINHO
      // ─────────────────────────────────────────
      case 'CLEAR_CART':
        newState.cart = [];
        newState.total = 0;
        newState.current_step = 'INICIO';
        
        response = {
          success: true,
          action_performed: 'CART_CLEARED',
          data: {},
          response_template: 'Pronto, limpei seu pedido! 🗑️ Quer começar de novo?',
          response_variables: {}
        };
        break;
      
      // ─────────────────────────────────────────
      // CANCELAR
      // ─────────────────────────────────────────
      case 'CANCEL_ORDER':
        newState.cart = [];
        newState.total = 0;
        newState.current_step = 'INICIO';
        newState.address = undefined;
        newState.payment_method = undefined;
        newState.delivery_type = undefined;
        
        response = {
          success: true,
          action_performed: 'ORDER_CANCELLED',
          data: {},
          response_template: 'Pedido cancelado! Se mudar de ideia é só chamar 😊',
          response_variables: {}
        };
        break;
      
      // ─────────────────────────────────────────
      // PERGUNTAS INFORMATIVAS
      // ─────────────────────────────────────────
      case 'ASK_DELIVERY_FEE':
        response = {
          success: true,
          action_performed: 'INFO_DELIVERY_FEE',
          data: { fee: config.delivery_fee },
          response_template: '🛵 Taxa de entrega: R$ {fee}',
          response_variables: { fee: config.delivery_fee.toFixed(2) }
        };
        break;
        
      case 'ASK_DELIVERY_TIME':
        response = {
          success: true,
          action_performed: 'INFO_DELIVERY_TIME',
          data: { time: config.delivery_time },
          response_template: '⏱️ Tempo de entrega: {time}',
          response_variables: { time: config.delivery_time }
        };
        break;
        
      case 'ASK_PAYMENT_METHODS':
        response = {
          success: true,
          action_performed: 'INFO_PAYMENT_METHODS',
          data: { methods: config.payment_methods },
          response_template: '💳 Formas de pagamento: {methods}',
          response_variables: { methods: config.payment_methods.join(', ') }
        };
        break;
        
      case 'ASK_HOURS':
        response = {
          success: true,
          action_performed: 'INFO_HOURS',
          data: { hours: config.hours },
          response_template: '🕐 Horário de funcionamento: {hours}',
          response_variables: { hours: config.hours }
        };
        break;
      
      // ─────────────────────────────────────────
      // AGRADECIMENTO/DESPEDIDA
      // ─────────────────────────────────────────
      case 'THANKS':
        response = {
          success: true,
          action_performed: 'THANKS_RESPONSE',
          data: {},
          response_template: 'Por nada! 😊 Qualquer coisa é só chamar!',
          response_variables: {}
        };
        break;
        
      case 'FAREWELL':
        response = {
          success: true,
          action_performed: 'FAREWELL_RESPONSE',
          data: {},
          response_template: 'Até mais! 👋 Volte sempre!',
          response_variables: {}
        };
        break;
      
      // ─────────────────────────────────────────
      // AJUDA
      // ─────────────────────────────────────────
      case 'HELP':
        response = {
          success: true,
          action_performed: 'SHOW_HELP',
          data: {},
          response_template: '📖 *Como posso ajudar?*\n\n• Peça o *cardápio* para ver nossas opções\n• Diga o que quer pedir (ex: "quero 2 pizzas")\n• Pergunte sobre *taxa de entrega* ou *tempo*\n• Diga *meu pedido* para ver o carrinho\n\nO que você precisa?',
          response_variables: {}
        };
        break;
      
      // ─────────────────────────────────────────
      // OUTRO (não entendeu)
      // ─────────────────────────────────────────
      default:
        response = {
          success: false,
          action_performed: 'NOT_UNDERSTOOD',
          data: {},
          response_template: 'Hmm, não entendi bem 🤔 Você pode pedir o *cardápio*, fazer um *pedido*, ou me perguntar sobre *entrega* e *pagamento*.',
          response_variables: {},
          error: 'Intenção não reconhecida'
        };
    }
    
    return { newState, response };
  }
  
  /**
   * Busca item no menu com fuzzy matching
   */
  private findMenuItem(query: string, menu: BusinessConfig['menu']) {
    const normalized = query.toLowerCase()
      .replace(/pizza de /gi, '')
      .replace(/pizza /gi, '')
      .trim();
    
    // Busca exata
    let found = menu.find(item => item.name.toLowerCase() === normalized);
    if (found) return found;
    
    // Busca parcial
    found = menu.find(item => item.name.toLowerCase().includes(normalized));
    if (found) return found;
    
    // Busca reversa
    found = menu.find(item => normalized.includes(item.name.toLowerCase()));
    if (found) return found;
    
    // Busca por palavras
    const words = normalized.split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;
      found = menu.find(item => item.name.toLowerCase().includes(word));
      if (found) return found;
    }
    
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎨 AI HUMANIZER - Humaniza respostas (opcional)
// ═══════════════════════════════════════════════════════════════════════

export class AIHumanizer {
  private anthropic: Anthropic;
  
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }
  
  /**
   * Humaniza a resposta do sistema (opcional - para anti-bloqueio)
   */
  async humanize(
    systemResponse: SystemResponse,
    style: 'formal' | 'casual' | 'friendly' = 'friendly'
  ): Promise<string> {
    
    // Se a resposta é simples, não precisa humanizar
    if (systemResponse.response_template.length < 100) {
      return this.fillTemplate(systemResponse.response_template, systemResponse.response_variables);
    }
    
    const filledTemplate = this.fillTemplate(
      systemResponse.response_template, 
      systemResponse.response_variables
    );
    
    const styleGuide = {
      formal: 'Use linguagem formal e educada.',
      casual: 'Use linguagem casual, com gírias leves.',
      friendly: 'Use linguagem amigável e acolhedora, com emojis ocasionais.'
    };
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0.7, // Um pouco de variação para parecer humano
        system: `Você é um assistente de atendimento. 
${styleGuide[style]}
Reescreva a mensagem abaixo mantendo EXATAMENTE as mesmas informações, mas de forma mais natural e humana.
Mantenha formatação WhatsApp (*negrito*, _itálico_).
Seja conciso.
RESPONDA APENAS COM A MENSAGEM REESCRITA, SEM EXPLICAÇÕES.`,
        messages: [{ role: 'user', content: filledTemplate }]
      });
      
      const content = response.content[0];
      if (content.type !== 'text') return filledTemplate;
      
      return content.text;
      
    } catch (error) {
      console.error('[AIHumanizer] Erro:', error);
      return filledTemplate;
    }
  }
  
  /**
   * Preenche template com variáveis
   */
  private fillTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔄 HYBRID ENGINE - Orquestra tudo
// ═══════════════════════════════════════════════════════════════════════

export class HybridFlowEngine {
  private interpreter: AIInterpreter;
  private executor: SystemExecutor;
  private humanizer: AIHumanizer;
  private conversations: Map<string, ConversationState> = new Map();
  
  constructor(anthropicApiKey: string) {
    this.interpreter = new AIInterpreter(anthropicApiKey);
    this.executor = new SystemExecutor();
    this.humanizer = new AIHumanizer(anthropicApiKey);
  }
  
  /**
   * Processa uma mensagem do cliente
   */
  async processMessage(
    customerId: string,
    message: string,
    businessConfig: BusinessConfig,
    options?: { humanize?: boolean; style?: 'formal' | 'casual' | 'friendly' }
  ): Promise<{
    response: string;
    state: ConversationState;
    debug: {
      parsed_input: ParsedInput;
      system_response: SystemResponse;
    };
  }> {
    
    // 1. Obter ou criar estado da conversa
    let state = this.conversations.get(customerId);
    if (!state) {
      state = {
        current_step: 'INICIO',
        cart: [],
        total: 0,
        created_at: new Date(),
        last_interaction: new Date()
      };
    }
    
    // 2. IA INTERPRETA a mensagem do cliente
    const parsedInput = await this.interpreter.interpret(message, state, businessConfig);
    console.log(`[HybridEngine] Interpretado: ${parsedInput.intent}`, parsedInput.entities);
    
    // 3. SISTEMA EXECUTA a ação deterministicamente
    const { newState, response: systemResponse } = this.executor.execute(parsedInput, state, businessConfig);
    
    // 4. Atualizar estado
    this.conversations.set(customerId, newState);
    
    // 5. IA HUMANIZA a resposta (opcional)
    let finalResponse: string;
    if (options?.humanize) {
      finalResponse = await this.humanizer.humanize(systemResponse, options.style || 'friendly');
    } else {
      // Apenas preenche o template
      finalResponse = this.fillTemplate(systemResponse.response_template, systemResponse.response_variables);
    }
    
    return {
      response: finalResponse,
      state: newState,
      debug: {
        parsed_input: parsedInput,
        system_response: systemResponse
      }
    };
  }
  
  /**
   * Preenche template com variáveis
   */
  private fillTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
    }
    return result;
  }
  
  /**
   * Obtém estado da conversa
   */
  getState(customerId: string): ConversationState | undefined {
    return this.conversations.get(customerId);
  }
  
  /**
   * Limpa conversa
   */
  clearConversation(customerId: string): void {
    this.conversations.delete(customerId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📦 EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════

export default HybridFlowEngine;
