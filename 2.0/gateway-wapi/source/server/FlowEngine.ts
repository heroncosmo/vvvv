/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🔄 FLOW ENGINE - Motor de Fluxos Determinísticos
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Este é o CÉREBRO do sistema. A IA apenas:
 * 1. Classifica a intenção do cliente
 * 2. Humaniza a resposta do fluxo
 * 
 * O FlowEngine é 100% determinístico - sem alucinações!
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabaseService';

// ═══════════════════════════════════════════════════════════════════════
// 📊 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Intenções possíveis do cliente
 */
export type CustomerIntent = 
  // Gerais
  | 'GREETING'           // Oi, olá, bom dia
  | 'FAREWELL'           // Tchau, até mais
  | 'THANKS'             // Obrigado
  | 'HELP'               // Ajuda, não entendi
  
  // Cardápio/Produtos
  | 'WANT_MENU'          // Quero ver cardápio
  | 'ASK_PRODUCT_INFO'   // Quanto custa a pizza?
  | 'ASK_AVAILABILITY'   // Tem pizza de calabresa?
  
  // Pedido
  | 'WANT_TO_ORDER'      // Quero fazer pedido
  | 'ADD_ITEM'           // Quero 2 pizzas
  | 'REMOVE_ITEM'        // Tira a coca
  | 'CHANGE_QUANTITY'    // Muda pra 3
  | 'SEE_CART'           // O que tem no meu pedido?
  | 'CLEAR_CART'         // Limpa tudo
  
  // Confirmação
  | 'CONFIRM_ORDER'      // Isso, pode fechar
  | 'CANCEL_ORDER'       // Cancela
  
  // Informações
  | 'PROVIDE_NAME'       // Meu nome é João
  | 'PROVIDE_ADDRESS'    // Rua das Flores, 123
  | 'PROVIDE_PHONE'      // 11999999999
  | 'CHOOSE_DELIVERY'    // Quero delivery
  | 'CHOOSE_PICKUP'      // Vou buscar
  | 'CHOOSE_PAYMENT'     // Pago no Pix
  
  // Delivery info
  | 'ASK_DELIVERY_FEE'   // Qual a taxa?
  | 'ASK_DELIVERY_TIME'  // Quanto tempo?
  | 'ASK_MIN_ORDER'      // Tem pedido mínimo?
  | 'ASK_PAYMENT_METHODS'// Aceita Pix?
  | 'ASK_HOURS'          // Horário de funcionamento
  | 'ASK_LOCATION'       // Onde fica?
  
  // Outros
  | 'OTHER';             // Não identificado

/**
 * Entidades extraídas da mensagem
 */
export interface ExtractedEntities {
  product?: string;
  quantity?: number;
  address?: string;
  name?: string;
  phone?: string;
  paymentMethod?: string;
  deliveryType?: 'delivery' | 'pickup';
  [key: string]: any;
}

/**
 * Resultado da classificação de intenção
 */
export interface IntentClassification {
  intent: CustomerIntent;
  confidence: number;
  entities: ExtractedEntities;
  rawMessage: string;
}

/**
 * Definição de uma transição de estado
 */
export interface StateTransition {
  nextState: string;
  action: string;
  condition?: (context: FlowContext) => boolean;
}

/**
 * Definição de um estado do fluxo
 */
export interface FlowState {
  name: string;
  transitions: Partial<Record<CustomerIntent, StateTransition>>;
  defaultTransition?: StateTransition;
  onEnter?: (context: FlowContext) => Promise<void>;
  onExit?: (context: FlowContext) => Promise<void>;
}

/**
 * Definição completa de um fluxo
 */
export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  initialState: string;
  finalStates: string[];
  states: Record<string, FlowState>;
}

/**
 * Contexto da conversa (dados acumulados)
 */
export interface FlowContext {
  // Carrinho
  cart: CartItem[];
  
  // Dados do cliente
  customerName?: string;
  customerPhone: string;
  customerAddress?: string;
  
  // Configurações do pedido
  deliveryType?: 'delivery' | 'pickup';
  paymentMethod?: string;
  
  // Dados do negócio
  businessName?: string;
  businessType?: string;
  deliveryFee?: number;
  minOrderValue?: number;
  
  // Extras
  lastProductAsked?: string;
  [key: string]: any;
}

/**
 * Item do carrinho
 */
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

/**
 * Instância de um fluxo em execução
 */
export interface FlowInstance {
  id: string;
  
  // Identificadores
  userId: string;          // Dono do negócio
  customerPhone: string;   // Cliente final
  
  // Estado do fluxo
  flowId: string;
  currentState: string;
  
  // Contexto acumulado
  context: FlowContext;
  
  // Histórico
  history: Array<{
    state: string;
    intent: CustomerIntent;
    action: string;
    timestamp: Date;
  }>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Resultado de uma ação executada
 */
export interface ActionResult {
  success: boolean;
  action: string;
  
  // Dados para a resposta
  data: any;
  
  // Template base (opcional)
  template?: string;
  
  // Mensagens de bubble (separadas)
  bubbles?: string[];
  
  // Próximo estado (se a transição deve ser forçada)
  forceState?: string;
  
  // Erro (se houver)
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// 🗄️ STORAGE - Persistência de Estados
// ═══════════════════════════════════════════════════════════════════════

class FlowStorage {
  private instances: Map<string, FlowInstance> = new Map();
  private supabase: SupabaseClient | null = null;
  
  constructor() {
    if (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) {
      this.supabase = createSupabaseServiceClient();
    }
  }
  
  private getKey(userId: string, customerPhone: string): string {
    return `${userId}:${customerPhone}`;
  }
  
  async get(userId: string, customerPhone: string): Promise<FlowInstance | null> {
    const key = this.getKey(userId, customerPhone);
    
    // Primeiro tentar memória
    const cached = this.instances.get(key);
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }
    
    // Se não tem Supabase, retorna null
    if (!this.supabase) return null;
    
    // Buscar no banco
    try {
      const { data } = await this.supabase
        .from('flow_instances')
        .select('*')
        .eq('user_id', userId)
        .eq('customer_phone', customerPhone)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (data) {
        const instance: FlowInstance = {
          id: data.id,
          userId: data.user_id,
          customerPhone: data.customer_phone,
          flowId: data.flow_id,
          currentState: data.current_state,
          context: data.context,
          history: data.history || [],
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
          expiresAt: new Date(data.expires_at),
        };
        
        // Cache em memória
        this.instances.set(key, instance);
        return instance;
      }
    } catch (e) {
      // Ignorar erro, usar fallback
    }
    
    return null;
  }
  
  async save(instance: FlowInstance): Promise<void> {
    const key = this.getKey(instance.userId, instance.customerPhone);
    
    // Atualizar timestamps
    instance.updatedAt = new Date();
    if (!instance.expiresAt) {
      instance.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas
    }
    
    // Salvar em memória
    this.instances.set(key, instance);
    
    // Se tem Supabase, persistir
    if (this.supabase) {
      try {
        await this.supabase
          .from('flow_instances')
          .upsert({
            id: instance.id,
            user_id: instance.userId,
            customer_phone: instance.customerPhone,
            flow_id: instance.flowId,
            current_state: instance.currentState,
            context: instance.context,
            history: instance.history,
            created_at: instance.createdAt.toISOString(),
            updated_at: instance.updatedAt.toISOString(),
            expires_at: instance.expiresAt.toISOString(),
          });
      } catch (e) {
        // Log mas não falha
        console.error('[FlowStorage] Erro ao salvar:', e);
      }
    }
  }
  
  async delete(userId: string, customerPhone: string): Promise<void> {
    const key = this.getKey(userId, customerPhone);
    this.instances.delete(key);
    
    if (this.supabase) {
      try {
        await this.supabase
          .from('flow_instances')
          .delete()
          .eq('user_id', userId)
          .eq('customer_phone', customerPhone);
      } catch (e) {
        // Ignorar
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 INTENT CLASSIFIER - Classificador de Intenções
// ═══════════════════════════════════════════════════════════════════════

/**
 * Classificador híbrido: regras + IA como fallback
 */
export class IntentClassifier {
  
  /**
   * Classifica a intenção usando regras primeiro, IA como fallback
   */
  async classify(
    message: string, 
    context?: FlowContext
  ): Promise<IntentClassification> {
    const normalized = message.toLowerCase().trim();
    
    // Primeiro: tentar regras determinísticas (rápido e confiável)
    const ruleResult = this.classifyByRules(normalized, context);
    if (ruleResult.confidence >= 0.8) {
      return ruleResult;
    }
    
    // Segundo: usar IA para casos ambíguos
    // (implementar depois - por agora usa regras)
    return ruleResult;
  }
  
  /**
   * Classificação por regras (determinística)
   */
  private classifyByRules(
    message: string, 
    context?: FlowContext
  ): IntentClassification {
    const result: IntentClassification = {
      intent: 'OTHER',
      confidence: 0,
      entities: {},
      rawMessage: message,
    };
    
    // ═══════════════════════════════════════
    // SAUDAÇÕES
    // ═══════════════════════════════════════
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|e ai|eai|hey|hi|hello)/i.test(message)) {
      result.intent = 'GREETING';
      result.confidence = 0.95;
      return result;
    }
    
    if (/^(tchau|adeus|até mais|ate mais|flw|falou|bye)/i.test(message)) {
      result.intent = 'FAREWELL';
      result.confidence = 0.95;
      return result;
    }
    
    if (/^(obrigad[oa]|valeu|thanks|vlw|brigadao)/i.test(message)) {
      result.intent = 'THANKS';
      result.confidence = 0.95;
      return result;
    }
    
    // ═══════════════════════════════════════
    // CONFIRMAÇÃO/CANCELAMENTO (prioridade alta)
    // ═══════════════════════════════════════
    if (/^(isso|fechado|pode fechar|fechar|confirma|confirmado|[eé] isso|fecha|finaliza|ok pode|sim pode|pode sim|beleza|fechou)/i.test(message)) {
      result.intent = 'CONFIRM_ORDER';
      result.confidence = 0.95;
      return result;
    }
    
    if (/^(cancela|desisto|não quero|nao quero|deixa pra lá|esquece)/i.test(message)) {
      result.intent = 'CANCEL_ORDER';
      result.confidence = 0.95;
      return result;
    }
    
    // ═══════════════════════════════════════
    // CARDÁPIO/MENU (cuidado para não confundir com "o que tem no meu pedido")
    // ═══════════════════════════════════════
    if (/card[aá]pio|menu|o que (voc[eê]s? )?tem(m)?(?! no meu)|quais (produto|item|sabor)|lista de|ver (os|as) (produto|pizza|item)/i.test(message) &&
        !/meu pedido|meu carrinho/i.test(message)) {
      result.intent = 'WANT_MENU';
      result.confidence = 0.9;
      return result;
    }
    
    // ═══════════════════════════════════════
    // INFORMAÇÕES DE DELIVERY
    // ═══════════════════════════════════════
    if (/taxa|frete|entrega/i.test(message) && /(quanto|qual|custa|valor|cobr)/i.test(message)) {
      result.intent = 'ASK_DELIVERY_FEE';
      result.confidence = 0.9;
      return result;
    }
    
    if (/tempo|demora|quanto tempo|prazo/i.test(message)) {
      result.intent = 'ASK_DELIVERY_TIME';
      result.confidence = 0.9;
      return result;
    }
    
    if (/m[ií]nimo|pedido m[ií]nimo/i.test(message)) {
      result.intent = 'ASK_MIN_ORDER';
      result.confidence = 0.9;
      return result;
    }
    
    if (/aceita|pagamento|paga|pagar|forma de|pix|cart[aã]o|dinheiro/i.test(message) && !/(quero|vou|pago|no|com)\s*(pix|cart|dinheiro)/i.test(message)) {
      result.intent = 'ASK_PAYMENT_METHODS';
      result.confidence = 0.85;
      return result;
    }
    
    if (/hor[aá]rio|funciona|abre|fecha|aberto/i.test(message) && !/^(quero|me v|me d|manda|uma|duas)/i.test(message)) {
      result.intent = 'ASK_HOURS';
      result.confidence = 0.9;
      return result;
    }
    
    if (/onde fica|endere[cç]o|localiza[cç][aã]o/i.test(message)) {
      result.intent = 'ASK_LOCATION';
      result.confidence = 0.9;
      return result;
    }
    
    // ═══════════════════════════════════════
    // ESCOLHA DE PAGAMENTO
    // ═══════════════════════════════════════
    if (/(pago|quero pagar|vou pagar|pagar|no|com|em|na)\s*(pix|cart[aã]o|dinheiro|d[eé]bito|cr[eé]dito)/i.test(message) ||
        /^(pix|cart[aã]o|dinheiro|cart[aã]o de (cr[eé]dito|d[eé]bito))$/i.test(message)) {
      result.intent = 'CHOOSE_PAYMENT';
      result.confidence = 0.9;
      
      if (/pix/i.test(message)) result.entities.paymentMethod = 'Pix';
      else if (/dinheiro/i.test(message)) result.entities.paymentMethod = 'Dinheiro';
      else if (/cr[eé]dito/i.test(message)) result.entities.paymentMethod = 'Cartão Crédito';
      else if (/d[eé]bito/i.test(message)) result.entities.paymentMethod = 'Cartão Débito';
      else if (/cart[aã]o/i.test(message)) result.entities.paymentMethod = 'Cartão';
      
      return result;
    }
    
    // ═══════════════════════════════════════
    // TIPO DE ENTREGA
    // ═══════════════════════════════════════
    if (/(quero|pode ser|vou|prefiro)\s*(delivery|entrega)/i.test(message) || /^delivery$/i.test(message)) {
      result.intent = 'CHOOSE_DELIVERY';
      result.entities.deliveryType = 'delivery';
      result.confidence = 0.9;
      return result;
    }
    
    if (/(vou buscar|retirar|retirada|balc[aã]o)/i.test(message) || /^retirada$/i.test(message)) {
      result.intent = 'CHOOSE_PICKUP';
      result.entities.deliveryType = 'pickup';
      result.confidence = 0.9;
      return result;
    }
    
    // ═══════════════════════════════════════
    // FORNECENDO ENDEREÇO
    // ═══════════════════════════════════════
    if (/^(rua|av|avenida|alameda|travessa|pra[cç]a)/i.test(message) || 
        /\d{5}-?\d{3}/.test(message) ||  // CEP
        /(número|n[uú]mero|n°|nº)\s*\d+/i.test(message)) {
      result.intent = 'PROVIDE_ADDRESS';
      result.entities.address = message;
      result.confidence = 0.85;
      return result;
    }
    
    // ═══════════════════════════════════════
    // FORNECENDO NOME (preservar capitalização original)
    // ═══════════════════════════════════════
    const namePatterns = [
      /^(?:meu nome [eé]|me chamo|sou o|sou a)\s+(.+)$/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match) {
        result.intent = 'PROVIDE_NAME';
        // Capitalizar primeira letra de cada palavra do nome
        const rawName = match[1].trim();
        result.entities.name = rawName.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        result.confidence = 0.9;
        return result;
      }
    }
    
    // ═══════════════════════════════════════
    // VER CARRINHO / MEU PEDIDO
    // ═══════════════════════════════════════
    if (/meu pedido|meu carrinho|o que (eu )?(pedi|tem no meu)|resumo|total|ver pedido/i.test(message)) {
      result.intent = 'SEE_CART';
      result.confidence = 0.9;
      return result;
    }
    
    // ═══════════════════════════════════════
    // LIMPAR CARRINHO
    // ═══════════════════════════════════════
    if (/limpa|limpar|zera|zerar|remove tudo|tira tudo/i.test(message)) {
      result.intent = 'CLEAR_CART';
      result.confidence = 0.85;
      return result;
    }
    
    // ═══════════════════════════════════════
    // ADICIONAR ITEM (mais complexo) - ANTES de horários para evitar conflito
    // ═══════════════════════════════════════
    const addPatterns = [
      /^(quero|vou querer|me (v[eêEÊ]|d[aáAÁ]))\s+(.+)/i,
      /^(\d+)\s+(.+)/i,
      /^(uma?|duas?|tr[eê]s|quatro|cinco)\s+(.+)/i,
      /adiciona\s+(.+)/i,
      /mais\s+(\d+|uma?|duas?)\s+(.+)/i,
      /manda\s+(.+)/i,
      /pode ser\s+(.+)/i,
    ];
    
    for (const pattern of addPatterns) {
      const match = message.match(pattern);
      if (match) {
        result.intent = 'ADD_ITEM';
        result.confidence = 0.8;
        
        // Extrair quantidade e produto
        const parsed = this.parseOrderItems(message);
        if (parsed.length > 0) {
          result.entities.items = parsed;
          result.entities.product = parsed[0].name;
          result.entities.quantity = parsed[0].quantity;
        }
        
        return result;
      }
    }
    
    // ═══════════════════════════════════════
    // REMOVER ITEM
    // ═══════════════════════════════════════
    if (/(tira|remove|retira|sem)\s+(.+)/i.test(message)) {
      result.intent = 'REMOVE_ITEM';
      const match = message.match(/(tira|remove|retira|sem)\s+(.+)/i);
      if (match) result.entities.product = match[2].trim();
      result.confidence = 0.85;
      return result;
    }
    
    // ═══════════════════════════════════════
    // AJUDA
    // ═══════════════════════════════════════
    if (/^(ajuda|help|n[aã]o entendi|como funciona|\?)/i.test(message)) {
      result.intent = 'HELP';
      result.confidence = 0.9;
      return result;
    }
    
    // ═══════════════════════════════════════
    // DEFAULT
    // ═══════════════════════════════════════
    result.intent = 'OTHER';
    result.confidence = 0.3;
    return result;
  }
  
  /**
   * Parse items de pedido da mensagem
   */
  private parseOrderItems(message: string): Array<{ name: string; quantity: number }> {
    const NUMBER_WORDS: Record<string, number> = {
      'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3,
      'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
    };
    
    const results: Array<{ name: string; quantity: number }> = [];
    
    // Limpar - mas NÃO remover preposições importantes
    let normalized = message.toLowerCase()
      .replace(/quero|vou querer|me (vê|ve|da|dá)|pode|manda|por favor|pf/gi, '')
      .replace(/\brefri\b/gi, 'refrigerante')
      .replace(/(\d)\s*l\b/gi, '$1 litros')
      .trim();
    
    // Separar por vírgulas ou "e" (mas não "de")
    // Usar split mais cuidadoso
    const parts = normalized.split(/\s*,\s*|\s+e\s+(?!calabresa|mussarela|frango)/);
    
    for (const part of parts) {
      // Ajustar regex para não cortar em "de"
      const match = part.match(/^(\d+|uma?|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)?\s*(.+)$/i);
      
      if (match) {
        const qtyPart = (match[1] || '1').toLowerCase();
        let itemPart = match[2].trim();
        const qty = NUMBER_WORDS[qtyPart] || parseInt(qtyPart) || 1;
        
        // Remover "de" inicial se houver
        itemPart = itemPart.replace(/^de\s+/, '');
        
        if (itemPart.length > 2) {
          results.push({ name: itemPart, quantity: qty });
        }
      }
    }
    
    return results;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔄 FLOW ENGINE - Motor de Execução
// ═══════════════════════════════════════════════════════════════════════

export class FlowEngine {
  private flows: Map<string, FlowDefinition> = new Map();
  private storage: FlowStorage;
  private classifier: IntentClassifier;
  private actions: FlowActions;
  
  constructor() {
    this.storage = new FlowStorage();
    this.classifier = new IntentClassifier();
    this.actions = new FlowActions();
  }
  
  /**
   * Registra um fluxo
   */
  registerFlow(flow: FlowDefinition): void {
    this.flows.set(flow.id, flow);
  }
  
  /**
   * Processa uma mensagem do cliente
   */
  async processMessage(
    userId: string,
    customerPhone: string,
    message: string,
    businessConfig?: any
  ): Promise<ActionResult> {
    // 1. Buscar ou criar instância do fluxo
    let instance = await this.storage.get(userId, customerPhone);
    
    if (!instance) {
      instance = this.createNewInstance(userId, customerPhone, 'delivery', businessConfig);
    }
    
    // 2. Classificar intenção
    const classification = await this.classifier.classify(message, instance.context);
    
    // 3. Buscar definição do fluxo
    const flow = this.flows.get(instance.flowId);
    if (!flow) {
      return {
        success: false,
        action: 'ERROR',
        data: null,
        error: `Fluxo não encontrado: ${instance.flowId}`,
      };
    }
    
    // 4. Buscar estado atual
    const currentState = flow.states[instance.currentState];
    if (!currentState) {
      return {
        success: false,
        action: 'ERROR',
        data: null,
        error: `Estado não encontrado: ${instance.currentState}`,
      };
    }
    
    // 5. Encontrar transição
    let transition = currentState.transitions[classification.intent];
    if (!transition && currentState.defaultTransition) {
      transition = currentState.defaultTransition;
    }
    
    if (!transition) {
      // Sem transição válida - retornar mensagem de ajuda
      return {
        success: true,
        action: 'HELP',
        data: {
          currentState: instance.currentState,
          intent: classification.intent,
          message: 'Não entendi. Como posso ajudar?',
        },
        template: 'Desculpe, não entendi. Você pode pedir o cardápio ou fazer um pedido.',
      };
    }
    
    // 6. Verificar condição (se existir)
    if (transition.condition && !transition.condition(instance.context)) {
      // Condição não satisfeita
      return {
        success: true,
        action: 'CONDITION_NOT_MET',
        data: { currentState: instance.currentState },
        template: 'Antes de continuar, preciso de mais algumas informações.',
      };
    }
    
    // 7. Executar ação
    const actionResult = await this.actions.execute(
      transition.action,
      instance,
      classification,
      businessConfig
    );
    
    // 8. Atualizar estado
    if (actionResult.forceState) {
      instance.currentState = actionResult.forceState;
    } else {
      instance.currentState = transition.nextState;
    }
    
    // 9. Adicionar ao histórico
    instance.history.push({
      state: instance.currentState,
      intent: classification.intent,
      action: transition.action,
      timestamp: new Date(),
    });
    
    // 10. Persistir
    await this.storage.save(instance);
    
    return actionResult;
  }
  
  /**
   * Cria nova instância de fluxo
   */
  private createNewInstance(
    userId: string,
    customerPhone: string,
    flowId: string,
    businessConfig?: any
  ): FlowInstance {
    const flow = this.flows.get(flowId);
    
    return {
      id: `${userId}-${customerPhone}-${Date.now()}`,
      userId,
      customerPhone,
      flowId,
      currentState: flow?.initialState || 'START',
      context: {
        cart: [],
        customerPhone,
        businessName: businessConfig?.businessName,
        businessType: businessConfig?.businessType,
        deliveryFee: businessConfig?.deliveryFee,
        minOrderValue: businessConfig?.minOrderValue,
      },
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }
  
  /**
   * Limpa a instância do fluxo
   */
  async clearInstance(userId: string, customerPhone: string): Promise<void> {
    await this.storage.delete(userId, customerPhone);
  }
  
  /**
   * Obtém instância atual
   */
  async getInstance(userId: string, customerPhone: string): Promise<FlowInstance | null> {
    return this.storage.get(userId, customerPhone);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎬 FLOW ACTIONS - Ações Executáveis
// ═══════════════════════════════════════════════════════════════════════

class FlowActions {
  private supabase: SupabaseClient | null = null;
  
  constructor() {
    if (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) {
      this.supabase = createSupabaseServiceClient();
    }
  }
  
  /**
   * Executa uma ação
   */
  async execute(
    action: string,
    instance: FlowInstance,
    classification: IntentClassification,
    businessConfig?: any
  ): Promise<ActionResult> {
    const actionMap: Record<string, () => Promise<ActionResult>> = {
      // Saudações
      'GREET_CUSTOMER': () => this.greetCustomer(instance, businessConfig),
      'OFFER_MENU': () => this.offerMenu(instance, businessConfig),
      
      // Cardápio
      'SHOW_MENU': () => this.showMenu(instance, businessConfig),
      'SHOW_PRODUCT_DETAILS': () => this.showProductDetails(instance, classification),
      
      // Carrinho
      'ADD_TO_CART': () => this.addToCart(instance, classification, businessConfig),
      'REMOVE_FROM_CART': () => this.removeFromCart(instance, classification),
      'SHOW_CART': () => this.showCart(instance, businessConfig),
      'CLEAR_CART': () => this.clearCart(instance),
      
      // Informações
      'SHOW_DELIVERY_INFO': () => this.showDeliveryInfo(instance, businessConfig),
      'ASK_DELIVERY_TYPE': () => this.askDeliveryType(instance),
      'SAVE_DELIVERY_TYPE': () => this.saveDeliveryType(instance, classification),
      'ASK_ADDRESS': () => this.askAddress(instance),
      'SAVE_ADDRESS': () => this.saveAddress(instance, classification),
      'ASK_PAYMENT': () => this.askPayment(instance, businessConfig),
      'SAVE_PAYMENT': () => this.savePayment(instance, classification),
      
      // Finalização
      'CONFIRM_ORDER': () => this.confirmOrder(instance, businessConfig),
      'CANCEL_ORDER': () => this.cancelOrder(instance),
      
      // Ajuda
      'ASK_HOW_CAN_HELP': () => this.askHowCanHelp(instance),
      'HELP': () => this.showHelp(instance),
    };
    
    const handler = actionMap[action];
    if (!handler) {
      return {
        success: false,
        action,
        data: null,
        error: `Ação não implementada: ${action}`,
      };
    }
    
    try {
      return await handler();
    } catch (error) {
      return {
        success: false,
        action,
        data: null,
        error: `Erro ao executar ${action}: ${error}`,
      };
    }
  }
  
  // ═══════════════════════════════════════
  // IMPLEMENTAÇÕES DAS AÇÕES
  // ═══════════════════════════════════════
  
  private async greetCustomer(instance: FlowInstance, config?: any): Promise<ActionResult> {
    return {
      success: true,
      action: 'GREET_CUSTOMER',
      data: {
        businessName: config?.businessName || 'nosso estabelecimento',
      },
      template: `Olá! 😊 Bem-vindo ao {businessName}!\n\nPosso te enviar nosso cardápio ou você já sabe o que quer pedir?`,
    };
  }
  
  private async offerMenu(instance: FlowInstance, config?: any): Promise<ActionResult> {
    return {
      success: true,
      action: 'OFFER_MENU',
      data: {},
      template: 'Gostaria de ver nosso cardápio? 📋',
    };
  }
  
  private async showMenu(instance: FlowInstance, config?: any): Promise<ActionResult> {
    // Buscar menu do banco
    let menuData: any = null;
    
    if (this.supabase) {
      try {
        const { data: items } = await this.supabase
          .from('menu_items')
          .select('*')
          .eq('user_id', instance.userId)
          .eq('is_available', true)
          .order('category_name')
          .order('display_order');
        
        if (items && items.length > 0) {
          // Agrupar por categoria
          const categories: Record<string, any[]> = {};
          for (const item of items) {
            const cat = item.category_name || 'Outros';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(item);
          }
          
          menuData = {
            categories: Object.entries(categories).map(([name, items]) => ({
              name,
              items,
            })),
            totalItems: items.length,
          };
        }
      } catch (e) {
        console.error('[showMenu] Erro:', e);
      }
    }
    
    if (!menuData) {
      return {
        success: false,
        action: 'SHOW_MENU',
        data: null,
        error: 'Menu não encontrado',
      };
    }
    
    // Gerar bubbles de menu
    const bubbles: string[] = [];
    
    // Header
    let header = `🍕 *${config?.businessName?.toUpperCase() || 'CARDÁPIO'}*\n`;
    header += '━━━━━━━━━━━━━━━━';
    bubbles.push(header);
    
    // Categorias
    for (const category of menuData.categories) {
      let catText = `\n📁 *${category.name}*\n`;
      for (const item of category.items) {
        const price = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
        catText += `• ${item.name} - ${price}\n`;
      }
      bubbles.push(catText);
    }
    
    // Footer
    let footer = '━━━━━━━━━━━━━━━━\n';
    footer += `🛵 Taxa entrega: R$ ${(config?.deliveryFee || 5).toFixed(2).replace('.', ',')}\n`;
    footer += `📦 Pedido mínimo: R$ ${config?.minOrderValue || 20}\n`;
    footer += '\n✅ Me diga o que deseja pedir!';
    bubbles.push(footer);
    
    return {
      success: true,
      action: 'SHOW_MENU',
      data: menuData,
      bubbles,
    };
  }
  
  private async showProductDetails(instance: FlowInstance, classification: IntentClassification): Promise<ActionResult> {
    // TODO: Implementar busca de detalhes do produto
    return {
      success: true,
      action: 'SHOW_PRODUCT_DETAILS',
      data: {},
      template: 'Informações sobre o produto...',
    };
  }
  
  private async addToCart(
    instance: FlowInstance, 
    classification: IntentClassification,
    config?: any
  ): Promise<ActionResult> {
    const items = classification.entities.items || [
      { name: classification.entities.product, quantity: classification.entities.quantity || 1 }
    ];
    
    if (!items || items.length === 0) {
      return {
        success: false,
        action: 'ADD_TO_CART',
        data: null,
        error: 'Nenhum item identificado',
        template: 'Não consegui identificar o que você quer. Pode repetir?',
      };
    }
    
    const added: string[] = [];
    const notFound: string[] = [];
    
    for (const item of items) {
      // Buscar item no menu
      const menuItem = await this.findMenuItem(instance.userId, item.name);
      
      if (menuItem) {
        // Verificar se já existe no carrinho
        const existingIdx = instance.context.cart.findIndex(c => c.id === menuItem.id);
        
        if (existingIdx >= 0) {
          instance.context.cart[existingIdx].quantity += item.quantity;
        } else {
          instance.context.cart.push({
            id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: item.quantity,
          });
        }
        
        added.push(`${item.quantity}x ${menuItem.name}`);
      } else {
        notFound.push(item.name);
      }
    }
    
    // Gerar resposta
    let response = '';
    if (added.length > 0) {
      response = `✅ Adicionado:\n${added.map(i => `• ${i}`).join('\n')}\n\n`;
      response += this.formatCart(instance.context.cart, config);
    }
    
    if (notFound.length > 0) {
      response += `\n\n⚠️ Não encontrei: ${notFound.join(', ')}`;
    }
    
    return {
      success: added.length > 0,
      action: 'ADD_TO_CART',
      data: {
        added,
        notFound,
        cart: instance.context.cart,
      },
      template: response,
    };
  }
  
  private async findMenuItem(userId: string, searchName: string): Promise<any | null> {
    if (!this.supabase) return null;
    
    // Normalizar busca
    const normalized = searchName.toLowerCase()
      .replace(/\brefri\b/g, 'refrigerante')
      .replace(/(\d)\s*l\b/gi, '$1 litros')
      .replace(/\bde\s+/g, ' ')
      .trim();
    
    try {
      const { data: items } = await this.supabase
        .from('menu_items')
        .select('*')
        .eq('user_id', userId)
        .eq('is_available', true);
      
      if (!items) return null;
      
      // Buscar melhor match
      let bestMatch: any = null;
      let bestScore = 0;
      
      const searchWords = normalized.split(/\s+/).filter(w => w.length > 1);
      
      for (const item of items) {
        const itemLower = item.name.toLowerCase();
        
        // Match exato
        if (itemLower === normalized) return item;
        
        // Score por palavras
        let score = 0;
        for (const word of searchWords) {
          if (word.length > 2 && itemLower.includes(word)) {
            score += word.length;
          }
        }
        
        if (itemLower.includes(normalized)) score += 50;
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
      
      return bestScore >= 3 ? bestMatch : null;
    } catch (e) {
      return null;
    }
  }
  
  private formatCart(cart: CartItem[], config?: any): string {
    if (cart.length === 0) {
      return '🛒 Seu carrinho está vazio.';
    }
    
    let text = '🛒 *Seu pedido:*\n';
    let subtotal = 0;
    
    for (const item of cart) {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;
      text += `${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
    }
    
    text += `\n📦 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}\n`;
    text += `\nDeseja mais alguma coisa ou posso fechar?`;
    
    return text;
  }
  
  private async removeFromCart(instance: FlowInstance, classification: IntentClassification): Promise<ActionResult> {
    const productName = classification.entities.product;
    
    if (!productName) {
      return {
        success: false,
        action: 'REMOVE_FROM_CART',
        data: null,
        template: 'Qual item você quer remover?',
      };
    }
    
    const idx = instance.context.cart.findIndex(
      i => i.name.toLowerCase().includes(productName.toLowerCase())
    );
    
    if (idx >= 0) {
      const removed = instance.context.cart.splice(idx, 1)[0];
      return {
        success: true,
        action: 'REMOVE_FROM_CART',
        data: { removed },
        template: `✅ Removido: ${removed.name}\n\n${this.formatCart(instance.context.cart)}`,
      };
    }
    
    return {
      success: false,
      action: 'REMOVE_FROM_CART',
      data: null,
      template: `Não encontrei "${productName}" no seu carrinho.`,
    };
  }
  
  private async showCart(instance: FlowInstance, config?: any): Promise<ActionResult> {
    return {
      success: true,
      action: 'SHOW_CART',
      data: { cart: instance.context.cart },
      template: this.formatCart(instance.context.cart, config),
    };
  }
  
  private async clearCart(instance: FlowInstance): Promise<ActionResult> {
    instance.context.cart = [];
    return {
      success: true,
      action: 'CLEAR_CART',
      data: {},
      template: '🗑️ Carrinho limpo! Quer começar um novo pedido?',
    };
  }
  
  private async showDeliveryInfo(instance: FlowInstance, config?: any): Promise<ActionResult> {
    return {
      success: true,
      action: 'SHOW_DELIVERY_INFO',
      data: config,
      template: `📋 *Informações:*\n\n🛵 Taxa de entrega: R$ ${(config?.deliveryFee || 5).toFixed(2).replace('.', ',')}\n⏱️ Tempo: ~${config?.estimatedTime || 45} min\n📦 Pedido mínimo: R$ ${config?.minOrderValue || 20}\n💳 Pagamento: Dinheiro, Cartão, Pix`,
    };
  }
  
  private async askDeliveryType(instance: FlowInstance): Promise<ActionResult> {
    return {
      success: true,
      action: 'ASK_DELIVERY_TYPE',
      data: {},
      template: '🛵 Vai ser *delivery* ou *retirada* no local?',
    };
  }
  
  private async saveDeliveryType(instance: FlowInstance, classification: IntentClassification): Promise<ActionResult> {
    instance.context.deliveryType = classification.entities.deliveryType;
    
    if (classification.entities.deliveryType === 'delivery') {
      return {
        success: true,
        action: 'SAVE_DELIVERY_TYPE',
        data: { deliveryType: 'delivery' },
        template: '📍 Qual seu endereço de entrega?',
        forceState: 'COLLECTING_ADDRESS',
      };
    }
    
    return {
      success: true,
      action: 'SAVE_DELIVERY_TYPE',
      data: { deliveryType: 'pickup' },
      template: '👍 Ótimo! Como você vai pagar? (Pix, Cartão ou Dinheiro)',
      forceState: 'COLLECTING_PAYMENT',
    };
  }
  
  private async askAddress(instance: FlowInstance): Promise<ActionResult> {
    return {
      success: true,
      action: 'ASK_ADDRESS',
      data: {},
      template: '📍 Qual seu endereço de entrega?',
    };
  }
  
  private async saveAddress(instance: FlowInstance, classification: IntentClassification): Promise<ActionResult> {
    instance.context.customerAddress = classification.entities.address;
    
    return {
      success: true,
      action: 'SAVE_ADDRESS',
      data: { address: classification.entities.address },
      template: `📍 Endereço: ${classification.entities.address}\n\n💳 Como você vai pagar? (Pix, Cartão ou Dinheiro)`,
      forceState: 'COLLECTING_PAYMENT',
    };
  }
  
  private async askPayment(instance: FlowInstance, config?: any): Promise<ActionResult> {
    return {
      success: true,
      action: 'ASK_PAYMENT',
      data: {},
      template: '💳 Como você vai pagar? (Pix, Cartão ou Dinheiro)',
    };
  }
  
  private async savePayment(instance: FlowInstance, classification: IntentClassification): Promise<ActionResult> {
    instance.context.paymentMethod = classification.entities.paymentMethod;
    
    return {
      success: true,
      action: 'SAVE_PAYMENT',
      data: { paymentMethod: classification.entities.paymentMethod },
      forceState: 'CONFIRMING',
    };
  }
  
  private async confirmOrder(instance: FlowInstance, config?: any): Promise<ActionResult> {
    const cart = instance.context.cart;
    
    if (cart.length === 0) {
      return {
        success: false,
        action: 'CONFIRM_ORDER',
        data: null,
        template: '❌ Seu carrinho está vazio! Adicione alguns itens primeiro.',
        forceState: 'MENU_SHOWN',
      };
    }
    
    // Calcular totais
    let subtotal = 0;
    for (const item of cart) {
      subtotal += item.price * item.quantity;
    }
    
    const minOrder = config?.minOrderValue || 20;
    if (subtotal < minOrder) {
      return {
        success: false,
        action: 'CONFIRM_ORDER',
        data: { subtotal, minOrder },
        template: `⚠️ Pedido mínimo é R$ ${minOrder}. Seu pedido: R$ ${subtotal.toFixed(2).replace('.', ',')}.\n\nAdicione mais itens!`,
        forceState: 'ORDERING',
      };
    }
    
    const deliveryFee = instance.context.deliveryType === 'delivery' ? (config?.deliveryFee || 5) : 0;
    const total = subtotal + deliveryFee;
    
    // Criar pedido no banco
    const orderId = await this.createOrderInDatabase(instance, subtotal, deliveryFee, total);
    
    // Limpar carrinho
    instance.context.cart = [];
    
    let response = `✅ *PEDIDO CONFIRMADO!*\n\n`;
    response += `📦 Pedido: #${orderId}\n`;
    response += `👤 Cliente: ${instance.context.customerName || instance.customerPhone}\n`;
    
    if (instance.context.deliveryType === 'delivery') {
      response += `📍 Endereço: ${instance.context.customerAddress || 'Não informado'}\n`;
    } else {
      response += `🏪 Retirada no local\n`;
    }
    
    response += `💳 Pagamento: ${instance.context.paymentMethod || 'A definir'}\n\n`;
    response += `🛒 Itens:\n`;
    
    for (const item of cart) {
      response += `• ${item.quantity}x ${item.name}\n`;
    }
    
    response += `\n💰 Total: R$ ${total.toFixed(2).replace('.', ',')}\n`;
    response += `⏱️ Previsão: ~${config?.estimatedTime || 45} min\n\n`;
    response += `Obrigado pelo pedido! 🙏`;
    
    return {
      success: true,
      action: 'CONFIRM_ORDER',
      data: {
        orderId,
        subtotal,
        deliveryFee,
        total,
        items: cart,
      },
      template: response,
      forceState: 'ORDER_COMPLETE',
    };
  }
  
  private async createOrderInDatabase(
    instance: FlowInstance,
    subtotal: number,
    deliveryFee: number,
    total: number
  ): Promise<string> {
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
    
    if (!this.supabase) return orderId;
    
    try {
      // Inserir pedido
      const { data: order, error: orderError } = await this.supabase
        .from('delivery_orders')
        .insert({
          user_id: instance.userId,
          customer_name: instance.context.customerName,
          customer_phone: instance.customerPhone,
          customer_address: instance.context.customerAddress,
          delivery_type: instance.context.deliveryType || 'delivery',
          payment_method: instance.context.paymentMethod,
          subtotal,
          delivery_fee: deliveryFee,
          total,
          status: 'pending',
          notes: null,
        })
        .select('id')
        .single();
      
      if (order) {
        // Inserir itens
        const orderItems = instance.context.cart.map(item => ({
          order_id: order.id,
          menu_item_id: item.id,
          item_name: item.name || item.id || 'Item',
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          notes: item.notes,
        }));
        
        await this.supabase.from('order_items').insert(orderItems);
        
        return order.id;
      }
    } catch (e) {
      console.error('[createOrderInDatabase] Erro:', e);
    }
    
    return orderId;
  }
  
  private async cancelOrder(instance: FlowInstance): Promise<ActionResult> {
    instance.context.cart = [];
    
    return {
      success: true,
      action: 'CANCEL_ORDER',
      data: {},
      template: '❌ Pedido cancelado. Se precisar de algo, é só chamar! 😊',
      forceState: 'START',
    };
  }
  
  private async askHowCanHelp(instance: FlowInstance): Promise<ActionResult> {
    return {
      success: true,
      action: 'ASK_HOW_CAN_HELP',
      data: {},
      template: 'Como posso ajudar? Você pode pedir o cardápio ou fazer um pedido diretamente.',
    };
  }
  
  private async showHelp(instance: FlowInstance): Promise<ActionResult> {
    return {
      success: true,
      action: 'HELP',
      data: {},
      template: `📋 *Como fazer pedido:*\n\n1️⃣ Peça o "cardápio" para ver os itens\n2️⃣ Diga o que quer, ex: "quero 2 pizza calabresa"\n3️⃣ Quando terminar, diga "pode fechar"\n4️⃣ Informe endereço e forma de pagamento\n\nPronto! 🎉`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📝 DEFINIÇÃO DO FLUXO DE DELIVERY
// ═══════════════════════════════════════════════════════════════════════

export const DELIVERY_FLOW: FlowDefinition = {
  id: 'delivery',
  name: 'Pedido de Delivery',
  description: 'Fluxo completo para pedidos de delivery',
  initialState: 'START',
  finalStates: ['ORDER_COMPLETE', 'CANCELLED'],
  
  states: {
    // ═══════════════════════════════════════
    // INÍCIO
    // ═══════════════════════════════════════
    'START': {
      name: 'Início',
      transitions: {
        'GREETING': { nextState: 'GREETED', action: 'GREET_CUSTOMER' },
        'WANT_MENU': { nextState: 'MENU_SHOWN', action: 'SHOW_MENU' },
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
        'HELP': { nextState: 'GREETED', action: 'HELP' },
      },
      defaultTransition: { nextState: 'GREETED', action: 'ASK_HOW_CAN_HELP' },
    },
    
    // ═══════════════════════════════════════
    // CLIENTE SAUDOU
    // ═══════════════════════════════════════
    'GREETED': {
      name: 'Cliente Saudou',
      transitions: {
        'WANT_MENU': { nextState: 'MENU_SHOWN', action: 'SHOW_MENU' },
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
        'ASK_DELIVERY_FEE': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'ASK_DELIVERY_TIME': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'ASK_MIN_ORDER': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'ASK_PAYMENT_METHODS': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'ASK_HOURS': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'ASK_LOCATION': { nextState: 'GREETED', action: 'SHOW_DELIVERY_INFO' },
        'HELP': { nextState: 'GREETED', action: 'HELP' },
        'THANKS': { nextState: 'GREETED', action: 'GREET_CUSTOMER' },
      },
      defaultTransition: { nextState: 'GREETED', action: 'OFFER_MENU' },
    },
    
    // ═══════════════════════════════════════
    // CARDÁPIO MOSTRADO
    // ═══════════════════════════════════════
    'MENU_SHOWN': {
      name: 'Cardápio Mostrado',
      transitions: {
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
        'WANT_MENU': { nextState: 'MENU_SHOWN', action: 'SHOW_MENU' },
        'ASK_PRODUCT_INFO': { nextState: 'MENU_SHOWN', action: 'SHOW_PRODUCT_DETAILS' },
        'ASK_DELIVERY_FEE': { nextState: 'MENU_SHOWN', action: 'SHOW_DELIVERY_INFO' },
        'ASK_DELIVERY_TIME': { nextState: 'MENU_SHOWN', action: 'SHOW_DELIVERY_INFO' },
        'HELP': { nextState: 'MENU_SHOWN', action: 'HELP' },
      },
      defaultTransition: { nextState: 'MENU_SHOWN', action: 'ASK_HOW_CAN_HELP' },
    },
    
    // ═══════════════════════════════════════
    // FAZENDO PEDIDO
    // ═══════════════════════════════════════
    'ORDERING': {
      name: 'Fazendo Pedido',
      transitions: {
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
        'REMOVE_ITEM': { nextState: 'ORDERING', action: 'REMOVE_FROM_CART' },
        'SEE_CART': { nextState: 'ORDERING', action: 'SHOW_CART' },
        'CLEAR_CART': { nextState: 'MENU_SHOWN', action: 'CLEAR_CART' },
        'CONFIRM_ORDER': { nextState: 'COLLECTING_DELIVERY_TYPE', action: 'ASK_DELIVERY_TYPE' },
        'CANCEL_ORDER': { nextState: 'CANCELLED', action: 'CANCEL_ORDER' },
        'WANT_MENU': { nextState: 'ORDERING', action: 'SHOW_MENU' },
        'ASK_DELIVERY_FEE': { nextState: 'ORDERING', action: 'SHOW_DELIVERY_INFO' },
        'HELP': { nextState: 'ORDERING', action: 'HELP' },
      },
      defaultTransition: { nextState: 'ORDERING', action: 'SHOW_CART' },
    },
    
    // ═══════════════════════════════════════
    // COLETANDO TIPO DE ENTREGA
    // ═══════════════════════════════════════
    'COLLECTING_DELIVERY_TYPE': {
      name: 'Coletando Tipo Entrega',
      transitions: {
        'CHOOSE_DELIVERY': { nextState: 'COLLECTING_ADDRESS', action: 'SAVE_DELIVERY_TYPE' },
        'CHOOSE_PICKUP': { nextState: 'COLLECTING_PAYMENT', action: 'SAVE_DELIVERY_TYPE' },
        'CANCEL_ORDER': { nextState: 'CANCELLED', action: 'CANCEL_ORDER' },
      },
      defaultTransition: { nextState: 'COLLECTING_DELIVERY_TYPE', action: 'ASK_DELIVERY_TYPE' },
    },
    
    // ═══════════════════════════════════════
    // COLETANDO ENDEREÇO
    // ═══════════════════════════════════════
    'COLLECTING_ADDRESS': {
      name: 'Coletando Endereço',
      transitions: {
        'PROVIDE_ADDRESS': { nextState: 'COLLECTING_PAYMENT', action: 'SAVE_ADDRESS' },
        'CANCEL_ORDER': { nextState: 'CANCELLED', action: 'CANCEL_ORDER' },
      },
      defaultTransition: { nextState: 'COLLECTING_ADDRESS', action: 'ASK_ADDRESS' },
    },
    
    // ═══════════════════════════════════════
    // COLETANDO PAGAMENTO
    // ═══════════════════════════════════════
    'COLLECTING_PAYMENT': {
      name: 'Coletando Pagamento',
      transitions: {
        'CHOOSE_PAYMENT': { nextState: 'CONFIRMING', action: 'SAVE_PAYMENT' },
        'CANCEL_ORDER': { nextState: 'CANCELLED', action: 'CANCEL_ORDER' },
      },
      defaultTransition: { nextState: 'COLLECTING_PAYMENT', action: 'ASK_PAYMENT' },
    },
    
    // ═══════════════════════════════════════
    // CONFIRMANDO
    // ═══════════════════════════════════════
    'CONFIRMING': {
      name: 'Confirmando Pedido',
      transitions: {
        'CONFIRM_ORDER': { nextState: 'ORDER_COMPLETE', action: 'CONFIRM_ORDER' },
        'CANCEL_ORDER': { nextState: 'CANCELLED', action: 'CANCEL_ORDER' },
      },
      defaultTransition: { nextState: 'ORDER_COMPLETE', action: 'CONFIRM_ORDER' },
    },
    
    // ═══════════════════════════════════════
    // PEDIDO COMPLETO
    // ═══════════════════════════════════════
    'ORDER_COMPLETE': {
      name: 'Pedido Completo',
      transitions: {
        'GREETING': { nextState: 'GREETED', action: 'GREET_CUSTOMER' },
        'WANT_MENU': { nextState: 'MENU_SHOWN', action: 'SHOW_MENU' },
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
      },
      defaultTransition: { nextState: 'ORDER_COMPLETE', action: 'GREET_CUSTOMER' },
    },
    
    // ═══════════════════════════════════════
    // CANCELADO
    // ═══════════════════════════════════════
    'CANCELLED': {
      name: 'Cancelado',
      transitions: {
        'GREETING': { nextState: 'GREETED', action: 'GREET_CUSTOMER' },
        'WANT_MENU': { nextState: 'MENU_SHOWN', action: 'SHOW_MENU' },
        'ADD_ITEM': { nextState: 'ORDERING', action: 'ADD_TO_CART' },
      },
      defaultTransition: { nextState: 'START', action: 'ASK_HOW_CAN_HELP' },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXPORTAR ENGINE CONFIGURADO
// ═══════════════════════════════════════════════════════════════════════

const flowEngine = new FlowEngine();
flowEngine.registerFlow(DELIVERY_FLOW);

export { flowEngine };
export default flowEngine;
