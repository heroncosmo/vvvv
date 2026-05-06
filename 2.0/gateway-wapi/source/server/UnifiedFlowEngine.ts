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

import { supabase } from "./supabaseAuth";
import { FlowBuilder, PromptAnalyzer } from "./FlowBuilder";
import { chatComplete, type ChatMessage } from "./llm";
import type { FlowDefinition, FlowType, FlowState, FlowIntent, FlowAction } from "./FlowBuilder";

// Tipo de transição inline (não exportado pelo FlowBuilder)
interface FlowTransition {
  intent: string;
  nextState: string;
  action: string;
  condition?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationState {
  userId: string;
  conversationId: string;
  flowId: string;
  currentState: string;
  data: Record<string, any>;
  history: ConversationTurn[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  message: string;
  intent?: string;
  action?: string;
  state?: string;
  timestamp: Date;
}

export interface FlowExecutionResult {
  text: string;
  newState: string;
  intent: string;
  action: string;
  data?: Record<string, any>;
  mediaActions?: any[];
  notification?: any;
}

export interface FlowConfig {
  apiKey: string;
  model?: string;
  humanize?: boolean;
  temperature?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOW STORAGE - Persistência de Fluxos
// ═══════════════════════════════════════════════════════════════════════════

export class FlowStorage {
  
  /**
   * Salva ou atualiza FlowDefinition no banco
   */
  static async saveFlow(userId: string, flow: FlowDefinition): Promise<boolean> {
    try {
      const { error } = await supabase
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
        });

      if (error) {
        console.error(`[FlowStorage] Erro ao salvar flow:`, error);
        return false;
      }

      console.log(`[FlowStorage] ✅ Flow salvo: ${flow.id} (${flow.type}) para user ${userId}`);
      return true;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return false;
    }
  }

  /**
   * Carrega FlowDefinition do usuário
   */
  static async loadFlow(userId: string): Promise<FlowDefinition | null> {
    try {
      const { data, error } = await supabase
        .from('agent_flows')
        .select('flow_definition')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Não encontrado
          console.error(`[FlowStorage] Erro ao carregar flow:`, error);
        }
        return null;
      }

      return data?.flow_definition as FlowDefinition;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return null;
    }
  }

  /**
   * Salva estado da conversa
   */
  static async saveConversationState(state: ConversationState): Promise<boolean> {
    try {
      const { error } = await supabase
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
        });

      if (error) {
        console.error(`[FlowStorage] Erro ao salvar estado:`, error);
        return false;
      }

      return true;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return false;
    }
  }

  /**
   * Carrega estado da conversa
   */
  static async loadConversationState(conversationId: string): Promise<ConversationState | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_flow_states')
        .select('*')
        .eq('conversation_id', conversationId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error(`[FlowStorage] Erro ao carregar estado:`, error);
        }
        return null;
      }

      return {
        userId: data.user_id,
        conversationId: data.conversation_id,
        flowId: data.flow_id,
        currentState: data.current_state,
        data: data.data || {},
        history: data.history || [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INTERPRETER - Detecta Intenção usando IA
// ═══════════════════════════════════════════════════════════════════════════

export class AIInterpreter {
  // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()

  constructor() {
    // Não precisa mais de apiKey ou model - usa config do sistema
    console.log(`[AIInterpreter] Inicializado com OpenRouter/Chutes`);
  }

  /**
   * Detecta intenção do usuário com base no FlowDefinition
   */
  async detectIntent(
    message: string,
    flow: FlowDefinition,
    currentState: string,
    context?: Record<string, any>
  ): Promise<{ intent: string; confidence: number; extractedData?: Record<string, any> }> {
    
    // Buscar transições possíveis no estado atual
    const state = flow.states[currentState];
    if (!state) {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    // Verificar se transitions existe
    if (!state.transitions || !Array.isArray(state.transitions)) {
      console.warn(`[AIInterpreter] Estado ${currentState} não tem transitions válidas`);
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    // Construir lista de intents possíveis
    const possibleIntents = state.transitions.map(t => t.intent);
    const intentDescriptions = possibleIntents.map(intentId => {
      const intent = flow.intents[intentId];
      return intent 
        ? `${intentId}: Exemplos: "${intent.examples.slice(0, 3).join('", "')}"`
        : intentId;
    }).join('\n');

    // Prompt para a IA
    const systemPrompt = `Você é um analisador de intenções para atendimento via WhatsApp.
Negócio: ${flow.businessName}
Agente: ${flow.agentName}
Estado atual: ${currentState}

INTENTS POSSÍVEIS NESTE ESTADO:
${intentDescriptions}

TAREFA:
Analise a mensagem do cliente e identifique qual intent ela representa.
Retorne APENAS JSON válido no formato:
{
  "intent": "NOME_DO_INTENT",
  "confidence": 0-100,
  "extractedData": { ... }  // dados extraídos se houver (ex: quantidade, item, etc)
}

REGRAS:
- Se não tiver certeza, use confidence baixa
- Se não reconhecer, retorne intent: "UNKNOWN"
- Extraia dados relevantes (números, nomes, etc)`;

    try {
      // 🚀 Chamada via chatComplete (usa OpenRouter/Hyperbolic automaticamente)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Mensagem do cliente: "${message}"` }
      ];

      const response = await chatComplete({
        messages,
        temperature: 0.1,
        maxTokens: 200
      });

      const text = response.choices?.[0]?.message?.content?.trim() || '{}';
      
      // Extrair JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : text);

      return {
        intent: result.intent || 'UNKNOWN',
        confidence: result.confidence || 0,
        extractedData: result.extractedData
      };
    } catch (err) {
      console.error(`[AIInterpreter] Erro na detecção:`, err);
      return { intent: 'UNKNOWN', confidence: 0 };
    }
  }

  /**
   * Detecção rápida usando regex (fallback sem IA)
   */
  detectIntentFast(message: string, flow: FlowDefinition, currentState: string): { intent: string; confidence: number } {
    const state = flow.states[currentState];
    if (!state) {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    const msgLower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Verificar cada intent possível
    for (const transition of state.transitions) {
      const intent = flow.intents[transition.intent];
      if (!intent) continue;

      // Verificar padrões regex
      if (intent.patterns) {
        for (const pattern of intent.patterns) {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(msgLower)) {
            return { intent: transition.intent, confidence: 90 };
          }
        }
      }

      // Verificar exemplos (match parcial)
      for (const example of intent.examples) {
        const exampleLower = example.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM EXECUTOR - Executa Ações Deterministicamente
// ═══════════════════════════════════════════════════════════════════════════

export class SystemExecutor {
  
  /**
   * Executa ação e retorna resposta do sistema
   * AGORA COM INTEGRAÇÃO REAL COM O BANCO DE DADOS! 🚀
   */
  async execute(
    flow: FlowDefinition,
    action: FlowAction,
    currentState: string,
    nextState: string,
    data: Record<string, any>,
    extractedData?: Record<string, any>,
    userId?: string,
    userMessage?: string
  ): Promise<{ response: string; newData: Record<string, any>; mediaActions?: any[] }> {
    
    // Mesclar dados extraídos
    const mergedData = { ...data, ...extractedData };
    
    // 🛒 Inicializar carrinho se não existir (para fluxos DELIVERY)
    if (flow.type === 'DELIVERY' && !mergedData.cart) {
      mergedData.cart = [];
      mergedData.total = 0;
    }

    // 🚀 Se a ação é do tipo DATA, buscar dados REAIS do sistema
    if (action.type === 'DATA' && userId) {
      await this.loadRealData(action.dataSource, mergedData, flow, userId);
    }
    
    // 🛒 DELIVERY: Processar ações de carrinho com preços REAIS
    const actionName = action.name || '';
    if (flow.type === 'DELIVERY' && userId) {
      await this.processDeliveryAction(actionName, mergedData, extractedData, userId);
    }

    // 🔧 FIX: Se template contém {response} e não há valor definido, 
    // carregar dados relevantes baseado no contexto
    const template = action.template || '';
    if (template.includes('{response}') && !mergedData.response && userId) {
      console.log(`📦 [SystemExecutor] Template usa {response} - carregando dados do contexto...`);
      await this.loadContextualData(mergedData, flow, userId, userMessage);
    }

    // Processar template substituindo variáveis
    let response = this.processTemplate(template, mergedData, flow);

    // Processar ações de mídia se houver
    let mediaActions: any[] = [];
    if (action.mediaTag) {
      mediaActions = [{ tag: action.mediaTag, type: 'send' }];
    }

    return {
      response,
      newData: mergedData,
      mediaActions
    };
  }
  
  /**
   * 🛒 Processa ações específicas de Delivery (ADD_TO_CART, REMOVE_FROM_CART, etc)
   */
  private async processDeliveryAction(
    actionName: string,
    data: Record<string, any>,
    extractedData?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    console.log(`🛒 [SystemExecutor] Processando ação delivery: ${actionName}`);
    console.log(`🛒 [SystemExecutor] extractedData:`, JSON.stringify(extractedData || {}));
    
    // Garantir que cart existe
    if (!data.cart) data.cart = [];
    if (typeof data.total !== 'number') data.total = 0;
    
    const productName = extractedData?.product || extractedData?.item;
    const quantity = extractedData?.quantity || 1;
    
    switch (actionName) {
      case 'Adicionar ao Carrinho':
      case 'ADD_TO_CART': {
        if (!productName || !userId) {
          console.log(`🛒 [SystemExecutor] Sem produto ou userId para adicionar`);
          break;
        }
        
        // Buscar item no menu com preço REAL do banco
        const menuItem = await this.findMenuItemByName(productName, userId);
        
        if (!menuItem) {
          console.log(`🛒 [SystemExecutor] Produto "${productName}" não encontrado no menu`);
          data.error = `Produto "${productName}" não encontrado no cardápio`;
          break;
        }
        
        console.log(`🛒 [SystemExecutor] Item encontrado: ${menuItem.name} - R$ ${menuItem.price}`);
        
        // Verificar se item já está no carrinho
        const existingIndex = data.cart.findIndex((item: any) => 
          item.name.toLowerCase() === menuItem.name.toLowerCase()
        );
        
        if (existingIndex >= 0) {
          // Incrementar quantidade
          data.cart[existingIndex].quantity += quantity;
        } else {
          // Adicionar novo item
          data.cart.push({
            name: menuItem.name,
            quantity: quantity,
            unit_price: parseFloat(menuItem.price)
          });
        }
        
        // Recalcular total
        this.recalculateTotal(data);
        
        // Preencher variáveis do template
        data.product = menuItem.name;
        data.quantity = quantity;
        data.item_total = (quantity * parseFloat(menuItem.price)).toFixed(2);
        this.buildCartSummary(data);
        
        console.log(`🛒 [SystemExecutor] ✅ Carrinho atualizado:`, JSON.stringify(data.cart));
        console.log(`🛒 [SystemExecutor] ✅ Total: R$ ${data.total}`);
        break;
      }
      
      case 'Remover do Carrinho':
      case 'REMOVE_FROM_CART': {
        if (!productName) break;
        
        const removeIndex = data.cart.findIndex((item: any) =>
          item.name.toLowerCase().includes(productName.toLowerCase())
        );
        
        if (removeIndex >= 0) {
          const removed = data.cart.splice(removeIndex, 1)[0];
          data.product = removed.name;
          data.quantity = removed.quantity;
          this.recalculateTotal(data);
          this.buildCartSummary(data);
          console.log(`🛒 [SystemExecutor] ✅ Removido: ${removed.name}`);
        }
        break;
      }
      
      case 'Mostrar Carrinho':
      case 'SHOW_CART': {
        this.buildCartSummary(data);
        break;
      }
      
      case 'Cancelar':
      case 'CANCEL': {
        data.cart = [];
        data.total = 0;
        data.cart_summary = 'Carrinho vazio';
        console.log(`🛒 [SystemExecutor] ✅ Pedido cancelado`);
        break;
      }
      
      default:
        // Para outras ações, apenas construir resumo se há carrinho
        if (data.cart.length > 0) {
          this.buildCartSummary(data);
        }
    }
  }
  
  /**
   * 🔍 Busca item do menu pelo nome (fuzzy match) com preço REAL
   */
  private async findMenuItemByName(
    productName: string,
    userId: string
  ): Promise<{ name: string; price: string; description?: string } | null> {
    try {
      const { data: items, error } = await supabase
        .from('menu_items')
        .select('name, price, description')
        .eq('user_id', userId)
        .eq('is_available', true);
      
      if (error || !items || items.length === 0) {
        console.log(`🔍 [SystemExecutor] Nenhum item encontrado no menu de ${userId}`);
        return null;
      }
      
      const searchLower = productName.toLowerCase();
      
      // Primeiro: match exato
      let found = items.find(item => 
        item.name.toLowerCase() === searchLower
      );
      
      // Segundo: match parcial
      if (!found) {
        found = items.find(item => 
          item.name.toLowerCase().includes(searchLower) ||
          searchLower.includes(item.name.toLowerCase())
        );
      }
      
      // Terceiro: palavras-chave
      if (!found) {
        const words = searchLower.split(/\s+/);
        found = items.find(item => {
          const itemLower = item.name.toLowerCase();
          return words.some(word => word.length > 2 && itemLower.includes(word));
        });
      }
      
      return found || null;
    } catch (err) {
      console.error(`🔍 [SystemExecutor] Erro buscando menu:`, err);
      return null;
    }
  }
  
  /**
   * 💰 Recalcula total do carrinho
   */
  private recalculateTotal(data: Record<string, any>): void {
    data.total = data.cart.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unit_price);
    }, 0);
  }
  
  /**
   * 📝 Constrói resumo do carrinho para exibição
   */
  private buildCartSummary(data: Record<string, any>): void {
    if (!data.cart || data.cart.length === 0) {
      data.cart_summary = 'Carrinho vazio';
      data.total = '0,00';
      return;
    }
    
    data.cart_summary = data.cart.map((item: any) => {
      const itemTotal = (item.quantity * item.unit_price).toFixed(2).replace('.', ',');
      return `• ${item.quantity}x ${item.name} - R$ ${itemTotal}`;
    }).join('\n');
    
    data.total = typeof data.total === 'number' 
      ? data.total.toFixed(2).replace('.', ',')
      : data.total;
  }

  /**
   * 🔧 Carrega dados contextuais quando o template usa {response}
   * Isso é necessário para fluxos GENERICO que usam PROVIDE_INFO com {response}
   */
  private async loadContextualData(
    data: Record<string, any>,
    flow: FlowDefinition,
    userId: string,
    userMessage?: string
  ): Promise<void> {
    console.log(`📦 [SystemExecutor] Carregando dados contextuais para flow type: ${flow.type}`);
    
    const msgLower = (userMessage || '').toLowerCase();
    
    // Detectar contexto da pergunta e carregar dados apropriados
    const isMenuQuery = /cardápio|menu|pizza|pizzas|lanche|hamburguer|comida|prato|vocês têm|o que tem|quais|opções/.test(msgLower);
    const isDeliveryQuery = /entrega|delivery|taxa|frete|tempo|demora/.test(msgLower);
    const isHoursQuery = /horário|abre|fecha|funciona|funcionamento/.test(msgLower);
    
    // 🔥 VERIFICAR SE DEVE PERGUNTAR CATEGORIA PRIMEIRO
    // Buscar display_instructions do delivery_config
    const { data: deliveryConfig } = await supabase
      .from('delivery_config')
      .select('display_instructions, business_name')
      .eq('user_id', userId)
      .single();
    
    const displayInstructions = deliveryConfig?.display_instructions || '';
    const businessName = deliveryConfig?.business_name || flow.businessName || 'nosso estabelecimento';
    const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
    const shouldAskFirst = askFirstKeywords.some(kw => displayInstructions.toLowerCase().includes(kw));
    
    console.log(`📦 [SystemExecutor] displayInstructions: "${displayInstructions.substring(0, 80)}..."`);
    console.log(`📦 [SystemExecutor] shouldAskFirst = ${shouldAskFirst}`);
    
    // Se parece uma pergunta sobre cardápio/menu, carregar dados do menu
    if (isMenuQuery) {
      console.log(`📦 [SystemExecutor] Detectada pergunta sobre menu - carregando cardápio...`);
      await this.loadMenuData(data, userId, flow);
      
      // 🔥 SE "PERGUNTAR PRIMEIRO" ESTIVER ATIVO, MOSTRAR APENAS CATEGORIAS
      if (shouldAskFirst && data.menu_categories && data.menu_categories.length > 0) {
        console.log(`📦 [SystemExecutor] ⚠️ MODO PERGUNTAR PRIMEIRO ATIVO! Mostrando apenas categorias.`);
        const categoryNames = data.menu_categories.map((c: any) => c.name).join(', ');
        data.response = `Bem-vindo(a) ao ${businessName}! 😊\n\nTemos: ${categoryNames}.\n\nQual você gostaria de ver?`;
        data.askingCategory = true; // Flag para indicar que está perguntando categoria
        return;
      }
      
      if (data.menu_formatted && data.menu_formatted !== 'Cardápio não disponível no momento.') {
        data.response = `Aqui está nosso cardápio:\n\n${data.menu_formatted}`;
      } else {
        // Fallback se não há menu cadastrado
        data.response = `Nosso cardápio está sendo atualizado. Por favor, entre em contato conosco para mais informações!`;
      }
      return;
    }
    
    // Se pergunta sobre entrega/delivery
    if (isDeliveryQuery) {
      console.log(`📦 [SystemExecutor] Detectada pergunta sobre delivery - carregando config...`);
      await this.loadDeliveryFee(data, userId);
      
      data.response = `🛵 *Informações de Entrega:*\n\n` +
        `📍 Taxa de entrega: R$ ${data.delivery_fee || '5,00'}\n` +
        `⏱️ Tempo estimado: ${data.delivery_time || '45 minutos'}\n` +
        `💰 Pedido mínimo: R$ ${data.min_order || '20,00'}`;
      return;
    }
    
    // Se pergunta sobre horário
    if (isHoursQuery) {
      console.log(`📦 [SystemExecutor] Detectada pergunta sobre horário - carregando config...`);
      await this.loadBusinessHours(data, userId);
      
      if (data.hours) {
        data.response = `🕐 *Nosso horário de funcionamento:*\n\n${data.hours}`;
      } else {
        data.response = `Nosso horário de funcionamento está disponível em nosso site ou redes sociais.`;
      }
      return;
    }
    
    // Fallback genérico - se nenhum contexto específico foi detectado
    console.log(`📦 [SystemExecutor] Nenhum contexto específico detectado - usando resposta genérica`);
    data.response = `Como posso ajudar você? Posso fornecer informações sobre nosso cardápio, horários de funcionamento ou delivery.`;
  }

  /**
   * 🚀 Carrega dados REAIS do banco de dados
   */
  private async loadRealData(
    dataSource: string | undefined,
    data: Record<string, any>,
    flow: FlowDefinition,
    userId: string
  ): Promise<void> {
    
    console.log(`📦 [SystemExecutor] Carregando dados: ${dataSource} para user ${userId}`);

    switch (dataSource) {
      case 'menu':
        await this.loadMenuData(data, userId, flow);
        break;
      
      case 'business_hours':
        await this.loadBusinessHours(data, userId);
        break;
      
      case 'delivery_fee':
        await this.loadDeliveryFee(data, userId);
        break;
        
      case 'products':
        await this.loadProductsData(data, userId);
        break;
      
      default:
        console.log(`📦 [SystemExecutor] DataSource não reconhecido: ${dataSource}`);
    }
  }

  /**
   * 🍕 Carrega menu de delivery do banco
   */
  private async loadMenuData(data: Record<string, any>, userId: string, flow: FlowDefinition): Promise<void> {
    try {
      // Buscar categorias
      const { data: categories, error: catError } = await supabase
        .from('menu_categories')
        .select('id, name, display_order')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('display_order');

      if (catError) throw catError;

      // Buscar itens do menu
      const { data: items, error: itemError } = await supabase
        .from('menu_items')
        .select('id, name, description, price, category_id, is_available')
        .eq('user_id', userId)
        .eq('is_available', true)
        .order('display_order');

      if (itemError) throw itemError;

      console.log(`📦 [SystemExecutor] Categorias: ${categories?.length || 0}, Itens: ${items?.length || 0}`);

      // Formatar cardápio por categoria (natural, sem separadores técnicos)
      let menuFormatted = '';
      const usedItemIds = new Set<string>();
      
      // Primeiro, itens com categoria
      for (const category of categories || []) {
        const categoryItems = (items || []).filter(item => item.category_id === category.id);
        if (categoryItems.length === 0) continue;
        
        // Emoji baseado no nome da categoria
        const emoji = category.name.toLowerCase().includes('pizza') ? '🍕' : '📋';
        menuFormatted += `\n${emoji} *${category.name}*\n\n`;
        
        for (const item of categoryItems) {
          const price = parseFloat(item.price).toFixed(2);
          menuFormatted += `${item.name} - R$ ${price}\n`;
          if (item.description) {
            menuFormatted += `${item.description}\n\n`;
          } else {
            menuFormatted += `\n`;
          }
          usedItemIds.add(item.id);
        }
      }

      // 🔧 FIX: Depois, itens SEM categoria (category_id é null ou não existe)
      const uncategorizedItems = (items || []).filter(item => !item.category_id || !usedItemIds.has(item.id));
      if (uncategorizedItems.length > 0) {
        if (menuFormatted) {
          menuFormatted += `\n📋 *Outros*\n\n`;
        }
        for (const item of uncategorizedItems) {
          const price = parseFloat(item.price).toFixed(2);
          menuFormatted += `${item.name} - R$ ${price}\n`;
          if (item.description) {
            menuFormatted += `${item.description}\n\n`;
          } else {
            menuFormatted += `\n`;
          }
        }
      }

      data.menu_formatted = menuFormatted.trim() || 'Cardápio não disponível no momento.';
      data.menu_items = items || [];
      data.menu_categories = categories || [];

      console.log(`📦 [SystemExecutor] ✅ Menu carregado: ${items?.length || 0} itens, formatado: ${data.menu_formatted.substring(0, 100)}...`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar menu:`, err);
      data.menu_formatted = 'Cardápio não disponível no momento.';
    }
  }

  /**
   * 🕐 Carrega horário de funcionamento
   */
  private async loadBusinessHours(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: config, error } = await supabase
        .from('delivery_config')
        .select('opening_hours')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      const hours = config?.opening_hours;
      if (hours) {
        const dayNames: Record<string, string> = {
          monday: 'Segunda',
          tuesday: 'Terça',
          wednesday: 'Quarta',
          thursday: 'Quinta',
          friday: 'Sexta',
          saturday: 'Sábado',
          sunday: 'Domingo'
        };
        
        let hoursFormatted = '';
        for (const [day, h] of Object.entries(hours)) {
          const hourData = h as any;
          if (hourData.is_open) {
            hoursFormatted += `${dayNames[day] || day}: ${hourData.open} às ${hourData.close}\n`;
          }
        }
        data.hours = hoursFormatted.trim() || 'Consulte nosso horário de funcionamento.';
      }

      console.log(`📦 [SystemExecutor] ✅ Horário carregado`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar horário:`, err);
      data.hours = 'Consulte nosso horário de funcionamento.';
    }
  }

  /**
   * 🛵 Carrega taxa de entrega
   */
  private async loadDeliveryFee(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: config, error } = await supabase
        .from('delivery_config')
        .select('delivery_fee, min_order_value, estimated_delivery_time')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      data.delivery_fee = config?.delivery_fee?.toFixed(2).replace('.', ',') || '0,00';
      data.min_order = config?.min_order_value?.toFixed(2).replace('.', ',') || '0,00';
      data.delivery_time = `${config?.estimated_delivery_time || 45} minutos`;

      console.log(`📦 [SystemExecutor] ✅ Taxa de entrega: R$ ${data.delivery_fee}`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar taxa:`, err);
      data.delivery_fee = '0,00';
    }
  }

  /**
   * 📦 Carrega catálogo de produtos (VENDAS)
   */
  private async loadProductsData(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('name, price, description, category, stock')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('category')
        .limit(50);

      if (error) throw error;

      // Formatar lista de produtos
      let productsFormatted = '';
      let currentCategory = '';
      
      for (const product of products || []) {
        if (product.category && product.category !== currentCategory) {
          currentCategory = product.category;
          productsFormatted += `\n*${currentCategory.toUpperCase()}*\n`;
        }
        const price = parseFloat(product.price).toFixed(2).replace('.', ',');
        productsFormatted += `• ${product.name} - R$ ${price}\n`;
        if (product.description) {
          productsFormatted += `  ↳ ${product.description}\n`;
        }
      }

      data.products_formatted = productsFormatted.trim() || 'Produtos não disponíveis no momento.';
      data.products_list = products || [];

      console.log(`📦 [SystemExecutor] ✅ Produtos carregados: ${products?.length || 0} itens`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar produtos:`, err);
      data.products_formatted = 'Produtos não disponíveis no momento.';
    }
  }

  /**
   * Processa template substituindo variáveis
   */
  private processTemplate(template: string, data: Record<string, any>, flow: FlowDefinition): string {
    let result = template;

    // Substituir variáveis do flow (preços, links, cupons)
    if (flow.data) {
      if (flow.data.prices) {
        result = result.replace(/\{price_standard\}/g, flow.data.prices.standard?.toString() || '');
        result = result.replace(/\{price_promo\}/g, flow.data.prices.promo?.toString() || '');
        result = result.replace(/\{impl_price\}/g, flow.data.prices.implementation?.toString() || '');
      }
      if (flow.data.links) {
        result = result.replace(/\{signup_link\}/g, flow.data.links.signup || '');
        result = result.replace(/\{site_link\}/g, flow.data.links.site || '');
      }
      if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
        const firstCoupon = Object.values(flow.data.coupons)[0];
        result = result.replace(/\{coupon_code\}/g, firstCoupon?.code || '');
        result = result.replace(/\{coupon_discount\}/g, firstCoupon?.discount?.toString() || '');
      }
    }

    // Substituir dados do negócio
    result = result.replace(/\{agent_name\}/g, flow.agentName);
    result = result.replace(/\{business_name\}/g, flow.businessName);

    // Substituir dados da conversa
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value || ''));
    }

    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI HUMANIZER - Humaniza Respostas (Opcional)
// ═══════════════════════════════════════════════════════════════════════════

export class AIHumanizer {
  // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()

  constructor() {
    // Não precisa mais de apiKey ou model - usa config do sistema
    console.log(`[AIHumanizer] Inicializado com OpenRouter/Chutes`);
  }

  /**
   * Humaniza resposta do sistema (anti-bloqueio)
   */
  async humanize(
    systemResponse: string,
    flow: FlowDefinition,
    userMessage: string,
    options?: { personality?: string; variation?: number }
  ): Promise<string> {
    
    const personality = options?.personality || flow.agentPersonality || 'amigável e profissional';
    
    const systemPrompt = `Você é ${flow.agentName} da ${flow.businessName}.
Personalidade: ${personality}

⚠️⚠️⚠️ TAREFA CRÍTICA - LEIA COM ATENÇÃO ⚠️⚠️⚠️

Você vai receber uma resposta PRONTA do sistema. Sua ÚNICA função é:
- Tornar o texto mais NATURAL e amigável (como WhatsApp)
- COPIAR TODOS os dados EXATAMENTE como estão
- NÃO adicionar, remover ou modificar NENHUM item, preço ou informação

🚨 PROIBIDO (você será REJEITADO se fizer isso):
❌ Adicionar itens que NÃO estão na resposta original
❌ Inventar preços, produtos, sabores, categorias
❌ Adicionar exemplos ou sugestões extras
❌ Expandir listas com itens novos
❌ Usar separadores "━━━━━" ou formatação técnica
❌ Adicionar títulos como "NOSSO DELIVERY", "INFORMAÇÕES"

✅ PERMITIDO (faça APENAS isso):
✓ Ajustar pontuação e gramática
✓ Adicionar 1-2 emojis simples (se ainda não tiver muitos)
✓ Tornar o tom mais amigável e natural
✓ Reformular frases mantendo OS MESMOS dados

EXEMPLO CORRETO:
Original: "Olá!\n\n🍕 Pizzas\n\nMussarela - R$ 45.00\nQueijo de primeira\n\nQual gostaria?"
Humanizado: "Olá! Essas são nossas pizzas:\n\n🍕 Mussarela - R$ 45,00\nQueijo de primeira qualidade\n\nQual você gostaria de pedir? 😊"
(Note: MESMO item, MESMO preço, MESMA descrição - só mudou a forma de escrever)

EXEMPLO ERRADO (NÃO FAÇA ISSO):
Original: "Olá!\n\n🍕 Pizzas\n\nMussarela - R$ 45.00\nQueijo de primeira\n\nQual gostaria?"
ERRADO: "Olá! Temos várias pizzas:\n\n🍕 Mussarela - R$ 45,00\n🍕 Calabresa - R$ 50,00\n🍕 Portuguesa - R$ 55,00\n\nQual prefere?"
❌❌❌ REJEITADO! Adicionou Calabresa e Portuguesa que NÃO existiam!

⚡ REGRA DE OURO: Se a resposta tem 1 pizza, retorne 1 pizza. Se tem 5, retorne 5. NUNCA invente!

Responda APENAS com o texto humanizado.`;

    try {
      // 🚀 Chamada via chatComplete (usa OpenRouter/Hyperbolic automaticamente)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Mensagem original do cliente: "${userMessage}"\n\nResposta do sistema para humanizar:\n${systemResponse}` }
      ];

      const response = await chatComplete({
        messages,
        temperature: 0, // ZERO criatividade - apenas reformulação
        maxTokens: 500
      });

      let humanized = response.choices?.[0]?.message?.content?.trim() || systemResponse;
      
      // 🛡️ VALIDAÇÃO: Rejeitar se resposta cresceu muito (indica invenção de dados)
      if (systemResponse.length > 0 && humanized.length > systemResponse.length * 1.3) {
        console.error(`🚨 [AIHumanizer] REJEITADO! Resposta cresceu 30%+ - possível invenção de dados`);
        console.error(`📊 Original: ${systemResponse.length} chars`);
        console.error(`📊 Humanized: ${humanized.length} chars`);
        console.error(`📝 Original:\n${systemResponse}`);
        console.error(`📝 Humanized:\n${humanized}`);
        console.error(`⚠️ Usando resposta original para evitar alucinação`);
        humanized = systemResponse; // Fallback: usar original se humanizer inventou
      }
      
      console.log(`🎨 [AIHumanizer] ✅ Humanizado (${systemResponse.length} → ${humanized.length} chars): "${humanized.substring(0, 80)}..."`);
      
      return humanized;
    } catch (err) {
      console.error(`[AIHumanizer] Erro:`, err);
      return systemResponse; // Fallback para resposta original
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FLOW ENGINE - Motor Principal
// ═══════════════════════════════════════════════════════════════════════════

export class UnifiedFlowEngine {
  private interpreter: AIInterpreter;
  private executor: SystemExecutor;
  private humanizer: AIHumanizer;
  private config: FlowConfig;

  constructor(config: FlowConfig) {
    this.config = config;
    // 🚀 Não precisa mais de apiKey/model - usa config do sistema via chatComplete()
    this.interpreter = new AIInterpreter();
    this.executor = new SystemExecutor();
    this.humanizer = new AIHumanizer();
  }

  /**
   * Processa mensagem do cliente usando o fluxo
   */
  async processMessage(
    userId: string,
    conversationId: string,
    message: string,
    options?: {
      useAI?: boolean;         // true = IA interpreta, false = regex apenas
      humanize?: boolean;       // true = humaniza resposta
      contactName?: string;
    }
  ): Promise<FlowExecutionResult | null> {
    
    console.log(`\n🚀 [UnifiedFlowEngine] ════════════════════════════════`);
    console.log(`   User: ${userId}`);
    console.log(`   Conversation: ${conversationId}`);
    console.log(`   Message: "${message.substring(0, 50)}..."`);

    // 1. Carregar FlowDefinition do usuário
    const flow = await FlowStorage.loadFlow(userId);
    if (!flow) {
      console.log(`   ⚠️ Nenhum flow encontrado para user ${userId}`);
      return null;
    }
    console.log(`   📋 Flow: ${flow.id} (${flow.type})`);

    // 2. Carregar ou criar estado da conversa
    let state = await FlowStorage.loadConversationState(conversationId);
    if (!state) {
      state = {
        userId,
        conversationId,
        flowId: flow.id,
        currentState: flow.initialState,
        data: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      console.log(`   🆕 Nova conversa, estado inicial: ${flow.initialState}`);
    } else {
      console.log(`   📍 Estado atual: ${state.currentState}`);
    }

    // 3. Detectar intenção
    let intentResult;
    if (options?.useAI !== false) {
      intentResult = await this.interpreter.detectIntent(message, flow, state.currentState, state.data);
      console.log(`   🎯 Intent (IA): ${intentResult.intent} (${intentResult.confidence}%)`);
    } else {
      intentResult = this.interpreter.detectIntentFast(message, flow, state.currentState);
      console.log(`   🎯 Intent (Regex): ${intentResult.intent} (${intentResult.confidence}%)`);
    }

    // 4. Encontrar transição válida
    const currentFlowState = flow.states[state.currentState];
    if (!currentFlowState) {
      console.log(`   ❌ Estado inválido: ${state.currentState}`);
      return null;
    }

    // 🔧 FIX: Verificar se transitions existe antes de usar .find()
    if (!currentFlowState.transitions || !Array.isArray(currentFlowState.transitions)) {
      console.log(`   ⚠️ Estado ${state.currentState} não tem transitions definidas`);
      return null;
    }

    const transition = currentFlowState.transitions.find(t => t.intent === intentResult.intent);
    if (!transition) {
      console.log(`   ⚠️ Sem transição para intent ${intentResult.intent} no estado ${state.currentState}`);
      
      // Fallback: tentar GREETING em qualquer estado
      if (intentResult.intent === 'UNKNOWN') {
        const greetingTransition = currentFlowState.transitions.find(t => t.intent === 'GREETING');
        if (greetingTransition) {
          console.log(`   🔄 Fallback para GREETING`);
          return this.executeTransition(flow, greetingTransition, state, message, options);
        }
      }
      
      return null;
    }

    // 5. Executar transição
    return this.executeTransition(flow, transition, state, message, options, (intentResult as any).extractedData);
  }

  /**
   * Executa uma transição específica
   */
  private async executeTransition(
    flow: FlowDefinition,
    transition: FlowTransition,
    state: ConversationState,
    message: string,
    options?: { humanize?: boolean; contactName?: string },
    extractedData?: Record<string, any>
  ): Promise<FlowExecutionResult> {
    
    const action = flow.actions[transition.action];
    if (!action) {
      console.log(`   ❌ Ação não encontrada: ${transition.action}`);
      return {
        text: 'Desculpe, ocorreu um erro. Tente novamente.',
        newState: state.currentState,
        intent: transition.intent,
        action: transition.action
      };
    }

    // Executar ação (passa userId e mensagem para carregar dados reais do banco)
    const { response, newData, mediaActions } = await this.executor.execute(
      flow,
      action,
      state.currentState,
      transition.nextState,
      state.data,
      extractedData,
      state.userId,
      message  // 🔧 Passa mensagem do usuário para detectar contexto
    );

    // Humanizar se solicitado
    let finalResponse = response;
    if (options?.humanize !== false && this.config.humanize !== false) {
      finalResponse = await this.humanizer.humanize(response, flow, message);
    }

    // Atualizar estado
    state.currentState = transition.nextState;
    state.data = newData;
    state.history.push({
      role: 'user',
      message,
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
    await FlowStorage.saveConversationState(state);

    console.log(`   ✅ Ação: ${transition.action} → Estado: ${transition.nextState}`);
    console.log(`   📝 Resposta: "${finalResponse.substring(0, 80)}..."`);
    console.log(`🚀 [UnifiedFlowEngine] ════════════════════════════════\n`);

    return {
      text: finalResponse,
      newState: transition.nextState,
      intent: transition.intent,
      action: transition.action,
      data: newData,
      mediaActions
    };
  }

  /**
   * Cria FlowDefinition a partir de prompt de texto
   */
  static async createFlowFromPrompt(
    userId: string,
    prompt: string,
    options?: {
      businessType?: string;
      businessName?: string;
      additionalInfo?: string;
    }
  ): Promise<FlowDefinition | null> {
    
    console.log(`\n🏗️ [UnifiedFlowEngine] Criando flow a partir de prompt...`);
    
    const builder = new FlowBuilder();
    const flow = await builder.buildFromPrompt(prompt);

    // Aplicar overrides se fornecidos
    if (options?.businessName) {
      flow.businessName = options.businessName;
    }

    // Salvar no banco
    const saved = await FlowStorage.saveFlow(userId, flow);
    if (!saved) {
      console.log(`   ❌ Erro ao salvar flow`);
      return null;
    }

    console.log(`   ✅ Flow criado: ${flow.id} (${flow.type})`);
    console.log(`   📊 Estados: ${Object.keys(flow.states).length}`);
    console.log(`   🎯 Intenções: ${Object.keys(flow.intents).length}`);
    console.log(`   ⚡ Ações: ${Object.keys(flow.actions).length}`);

    return flow;
  }

  /**
   * Atualiza FlowDefinition existente com nova instrução
   */
  static async updateFlowFromInstruction(
    userId: string,
    instruction: string,
    apiKey: string
  ): Promise<{ success: boolean; flow?: FlowDefinition; message: string }> {
    
    console.log(`\n🔄 [UnifiedFlowEngine] Atualizando flow com instrução...`);
    console.log(`   Instrução: "${instruction.substring(0, 80)}..."`);

    // Carregar flow existente
    const existingFlow = await FlowStorage.loadFlow(userId);
    if (!existingFlow) {
      return {
        success: false,
        message: 'Nenhum flow encontrado para atualizar. Crie um agente primeiro.'
      };
    }

    // Analisar instrução para entender o que modificar
    const analyzer = new PromptAnalyzer();
    
    // Detectar tipo de modificação
    const instructionLower = instruction.toLowerCase();
    
    // Modificar preços
    const priceMatch = instructionLower.match(/pre[çc]o.*?(r?\$?\s*\d+)/i);
    if (priceMatch) {
      const newPrice = parseFloat(priceMatch[1].replace(/[^\d,]/g, '').replace(',', '.'));
      if (!isNaN(newPrice) && existingFlow.data?.prices) {
        existingFlow.data.prices.standard = newPrice;
        console.log(`   💰 Preço atualizado para R$${newPrice}`);
      }
    }

    // Modificar cupom
    const couponMatch = instructionLower.match(/cupom.*?([A-Z0-9]+)/i);
    if (couponMatch) {
      const newCoupon = couponMatch[1].toUpperCase();
      if (existingFlow.data?.coupons) {
        existingFlow.data.coupons[0] = { code: newCoupon, discount: existingFlow.data.coupons[0]?.discount || 50 };
        console.log(`   🎟️ Cupom atualizado para ${newCoupon}`);
      }
    }

    // Modificar nome do agente
    const nameMatch = instructionLower.match(/(?:nome|chama[r]?).*?(?:de\s+)?([a-záéíóúâêîôûãõç]+)/i);
    if (nameMatch && nameMatch[1].length > 2) {
      existingFlow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      console.log(`   👤 Nome atualizado para ${existingFlow.agentName}`);
    }

    // Modificar personalidade
    if (instructionLower.includes('mais formal')) {
      existingFlow.agentPersonality = 'formal, profissional, educado';
      console.log(`   🎭 Personalidade: formal`);
    } else if (instructionLower.includes('mais informal') || instructionLower.includes('descontraído')) {
      existingFlow.agentPersonality = 'informal, descontraído, amigável';
      console.log(`   🎭 Personalidade: informal`);
    }

    // Atualizar versão
    existingFlow.version = incrementVersion(existingFlow.version);

    // Salvar
    const saved = await FlowStorage.saveFlow(userId, existingFlow);
    if (!saved) {
      return {
        success: false,
        message: 'Erro ao salvar alterações no flow.'
      };
    }

    return {
      success: true,
      flow: existingFlow,
      message: `Flow atualizado com sucesso! Versão: ${existingFlow.version}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || '0') + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION SQL - Executar no Supabase
// ═══════════════════════════════════════════════════════════════════════════
export const FLOW_MIGRATION_SQL = `
-- Tabela para armazenar FlowDefinitions dos usuários
CREATE TABLE IF NOT EXISTS agent_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  flow_id VARCHAR NOT NULL,
  flow_type VARCHAR(50) NOT NULL,
  flow_definition JSONB NOT NULL,
  business_name VARCHAR(255),
  agent_name VARCHAR(255),
  version VARCHAR(20) DEFAULT '1.0.0',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_flows_user_id ON agent_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_flows_flow_type ON agent_flows(flow_type);

-- Tabela para armazenar estado das conversas com flows
CREATE TABLE IF NOT EXISTS conversation_flow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flow_id VARCHAR NOT NULL,
  current_state VARCHAR(100) NOT NULL,
  data JSONB DEFAULT '{}',
  history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_flow_states_conv ON conversation_flow_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_flow_states_user ON conversation_flow_states(user_id);
`;

export default UnifiedFlowEngine;
