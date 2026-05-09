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

import { db, withRetry } from "./db";
import { sql } from "drizzle-orm";
import {
  parseNaturalDate,
  parseNaturalTime,
  extractDateFromText,
  extractTimeFromText,
  detectIntent,
  processUserInputWithNaturalLanguage,
  findNodeByIntent,
  applyExtractedDataToVariables,
  getHybridConfig,
  logHybridDecision,
  type IntentCategory,
  type HybridFlowConfig
} from "./hybridAIFlowEngine";

// Interfaces
interface ChatbotConfig {
  id: string;
  user_id: string;
  name: string;
  welcome_message: string;
  fallback_message: string;
  goodbye_message: string;
  is_active: boolean;
  typing_delay_ms: number;
  message_delay_ms: number;
  send_welcome_on_first_contact: boolean;
  restart_on_keyword: boolean;
  restart_keywords: string[];
  // Anti-ban: variação humanizada
  enable_humanization?: boolean;
  humanization_level?: 'low' | 'medium' | 'high';
}

interface FlowNode {
  node_id: string;
  name: string;
  node_type: string;
  content: any;
  next_node_id?: string;
}

interface FlowConnection {
  from_node_id: string;
  from_handle: string;
  to_node_id: string;
}

interface ConversationState {
  id: string;
  chatbot_id: string;
  conversation_id: string;
  contact_number: string;
  current_node_id?: string;
  status: 'active' | 'completed' | 'abandoned' | 'transferred';
  variables: Record<string, string>;
  visited_nodes: string[];
  started_at: Date;
  last_interaction_at: Date;
}

interface ChatbotResponse {
  messages: Array<{
    type: 'text' | 'buttons' | 'list' | 'media';
    content: any;
    delay?: number;
  }>;
  waitingForInput: boolean;
  currentNodeId?: string;
  shouldTransferToHuman?: boolean;
  variables?: Record<string, string>;
}

// Cache em memória para fluxos ativos (evita consultas repetidas ao banco)
const flowCache = new Map<string, {
  config: ChatbotConfig;
  nodes: FlowNode[];
  connections: FlowConnection[];
  cachedAt: number;
}>();

const CACHE_TTL_MS = 60000; // 1 minuto de cache

/**
 * Limpa o cache de um usuário específico (chamar quando fluxo for atualizado)
 */
export function clearFlowCache(userId: string): void {
  flowCache.delete(userId);
  console.log(`🗑️ [CHATBOT_ENGINE] Cache limpo para usuário ${userId}`);
}

/**
 * Carrega o fluxo do chatbot de um usuário
 */
async function loadChatbotFlow(userId: string): Promise<{
  config: ChatbotConfig;
  nodes: FlowNode[];
  connections: FlowConnection[];
} | null> {
  // Verificar cache
  const cached = flowCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    // Buscar config
    const configResult = await withRetry(async () => {
      return db.execute(sql`
        SELECT * FROM chatbot_configs WHERE user_id = ${userId} AND is_active = true
      `);
    });

    if (configResult.rows.length === 0) {
      return null;
    }

    const config = configResult.rows[0] as unknown as ChatbotConfig;

    // Buscar nós
    const nodesResult = await withRetry(async () => {
      return db.execute(sql`
        SELECT node_id, name, node_type, content, next_node_id
        FROM chatbot_flow_nodes
        WHERE chatbot_id = ${config.id}
        ORDER BY display_order ASC
      `);
    });

    // Buscar conexões
    const connectionsResult = await withRetry(async () => {
      return db.execute(sql`
        SELECT from_node_id, from_handle, to_node_id
        FROM chatbot_flow_connections
        WHERE chatbot_id = ${config.id}
      `);
    });

    const flowData = {
      config,
      nodes: nodesResult.rows as unknown as FlowNode[],
      connections: connectionsResult.rows as unknown as FlowConnection[],
      cachedAt: Date.now()
    };

    // Salvar no cache
    flowCache.set(userId, flowData);

    return flowData;
  } catch (error) {
    console.error('[CHATBOT_ENGINE] Erro ao carregar fluxo:', error);
    return null;
  }
}

/**
 * Busca ou cria o estado da conversa
 */
async function getOrCreateConversationState(
  chatbotId: string,
  conversationId: string,
  contactNumber: string
): Promise<ConversationState | null> {
  try {
    // Buscar estado existente
    const existingResult = await withRetry(async () => {
      return db.execute(sql`
        SELECT * FROM chatbot_conversation_data
        WHERE chatbot_id = ${chatbotId} AND conversation_id = ${conversationId}
      `);
    });

    if (existingResult.rows.length > 0) {
      const state = existingResult.rows[0] as any;
      return {
        ...state,
        variables: state.variables || {},
        visited_nodes: state.visited_nodes || []
      };
    }

    // Criar novo estado
    const newResult = await withRetry(async () => {
      return db.execute(sql`
        INSERT INTO chatbot_conversation_data (chatbot_id, conversation_id, contact_number, status, variables, visited_nodes)
        VALUES (${chatbotId}, ${conversationId}, ${contactNumber}, 'active', '{}', ARRAY[]::TEXT[])
        RETURNING *
      `);
    });

    const state = newResult.rows[0] as any;
    return {
      ...state,
      variables: state.variables || {},
      visited_nodes: state.visited_nodes || []
    };
  } catch (error) {
    console.error('[CHATBOT_ENGINE] Erro ao buscar/criar estado:', error);
    return null;
  }
}

/**
 * Atualiza o estado da conversa
 */
async function updateConversationState(
  conversationId: string,
  chatbotId: string,
  updates: Partial<ConversationState>
): Promise<void> {
  try {
    const setClauses: string[] = [];
    
    if (updates.current_node_id !== undefined) {
      setClauses.push(`current_node_id = '${updates.current_node_id}'`);
    }
    if (updates.status) {
      setClauses.push(`status = '${updates.status}'`);
    }
    if (updates.variables) {
      setClauses.push(`variables = '${JSON.stringify(updates.variables)}'::jsonb`);
    }
    if (updates.visited_nodes) {
      setClauses.push(`visited_nodes = ARRAY[${updates.visited_nodes.map(n => `'${n}'`).join(',')}]::TEXT[]`);
    }
    
    setClauses.push(`last_interaction_at = now()`);

    if (setClauses.length > 0) {
      await withRetry(async () => {
        return db.execute(sql.raw(`
          UPDATE chatbot_conversation_data
          SET ${setClauses.join(', ')}
          WHERE chatbot_id = '${chatbotId}' AND conversation_id = '${conversationId}'
        `));
      });
    }
  } catch (error) {
    console.error('[CHATBOT_ENGINE] Erro ao atualizar estado:', error);
  }
}

/**
 * Encontra o próximo nó baseado na conexão
 */
function findNextNode(
  currentNodeId: string,
  handle: string,
  nodes: FlowNode[],
  connections: FlowConnection[]
): FlowNode | null {
  // Buscar por conexão específica
  const connection = connections.find(
    c => c.from_node_id === currentNodeId && c.from_handle === handle
  );
  
  if (connection) {
    return nodes.find(n => n.node_id === connection.to_node_id) || null;
  }

  // Buscar por conexão default
  const defaultConnection = connections.find(
    c => c.from_node_id === currentNodeId && c.from_handle === 'default'
  );
  
  if (defaultConnection) {
    return nodes.find(n => n.node_id === defaultConnection.to_node_id) || null;
  }

  // Fallback para next_node_id
  const currentNode = nodes.find(n => n.node_id === currentNodeId);
  if (currentNode?.next_node_id) {
    return nodes.find(n => n.node_id === currentNode.next_node_id) || null;
  }

  return null;
}

/**
 * Interpola variáveis no texto
 */
function interpolateVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

/**
 * Humaniza o texto para evitar detecção de bot (Anti-Ban)
 * Adiciona variações naturais para parecer mais humano
 */
function humanizeText(text: string, level: 'low' | 'medium' | 'high'): string {
  if (!text) return text;
  
  let result = text;
  
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
    const emojiVariations: Record<string, string[]> = {
      '😊': ['😄', '🙂', '😃'],
      '👋': ['✋', '🖐️', '🤚'],
      '✅': ['✔️', '☑️', '👍'],
      '❤️': ['💖', '💕', '♥️'],
      '🎉': ['🥳', '✨', '🎊'],
      '🔥': ['💥', '⚡', '✨'],
      '💪': ['👊', '✊', '🤜'],
      '🙏': ['🤲', '👐', '💫'],
    };
    
    for (const [emoji, variations] of Object.entries(emojiVariations)) {
      if (result.includes(emoji) && Math.random() > 0.5) {
        const randomVariation = variations[Math.floor(Math.random() * variations.length)];
        result = result.replace(emoji, randomVariation);
      }
    }
    
    // Sinônimos básicos (uma substituição por mensagem)
    const synonyms: Array<[RegExp, string[]]> = [
      [/\bOlá\b/gi, ['Oi', 'Oie', 'Eai', 'Hey']],
      [/\bObrigado\b/gi, ['Vlw', 'Valeu', 'Thanks', 'Grato']],
      [/\baguarde\b/gi, ['espere', 'só um momento', 'um instante']],
      [/\bperfeito\b/gi, ['show', 'ótimo', 'beleza', 'top']],
    ];
    
    const selectedSynonym = synonyms[Math.floor(Math.random() * synonyms.length)];
    if (Math.random() > 0.6) {
      const [pattern, options] = selectedSynonym;
      const replacement = options[Math.floor(Math.random() * options.length)];
      result = result.replace(pattern, replacement);
    }
  }
  
  // Nível alto: variações mais intensas (simula erros de digitação ocasionais corrigidos)
  if (level === 'high') {
    // Adiciona interjeições naturais
    const interjections = ['Então', 'Bom', 'Ah', 'Hmm', 'Enfim'];
    if (Math.random() > 0.7) {
      const interjection = interjections[Math.floor(Math.random() * interjections.length)];
      result = `${interjection}, ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
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
async function processNode(
  node: FlowNode,
  state: ConversationState,
  nodes: FlowNode[],
  connections: FlowConnection[],
  config: ChatbotConfig
): Promise<ChatbotResponse> {
  const messages: ChatbotResponse['messages'] = [];
  let waitingForInput = false;
  let currentNodeId = node.node_id;
  let shouldTransferToHuman = false;
  const variables = { ...state.variables };
  const visitedNodes = [...state.visited_nodes, node.node_id];

  // Evitar loops infinitos
  const visitCount = visitedNodes.filter(n => n === node.node_id).length;
  if (visitCount > 10) {
    console.warn(`[CHATBOT_ENGINE] Loop detectado no nó ${node.node_id}`);
    return { messages: [], waitingForInput: false, variables };
  }

  switch (node.node_type) {
    case 'start':
      // Ir para próximo nó
      const nextAfterStart = findNextNode(node.node_id, 'default', nodes, connections);
      if (nextAfterStart) {
        const nextResponse = await processNode(nextAfterStart, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;

    case 'message':
      const msgText = interpolateVariables(node.content.text || '', variables);
      messages.push({
        type: 'text',
        content: msgText,
        delay: config.typing_delay_ms
      });
      
      // Ir para próximo nó
      const nextAfterMessage = findNextNode(node.node_id, 'default', nodes, connections);
      if (nextAfterMessage) {
        const nextResponse = await processNode(nextAfterMessage, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          currentNodeId: nextResponse.currentNodeId,
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;

    case 'buttons':
      const btnBody = interpolateVariables(node.content.body || '', variables);
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
      break;

    case 'list':
      const listBody = interpolateVariables(node.content.body || '', variables);
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
      break;

    case 'input':
      const prompt = interpolateVariables(node.content.prompt || '', variables);
      messages.push({
        type: 'text',
        content: prompt,
        delay: config.typing_delay_ms
      });
      waitingForInput = true;
      break;

    case 'media':
      const caption = interpolateVariables(node.content.caption || '', variables);
      messages.push({
        type: 'media',
        content: {
          media_type: node.content.media_type,
          url: node.content.url,
          caption
        },
        delay: config.typing_delay_ms
      });
      
      const nextAfterMedia = findNextNode(node.node_id, 'default', nodes, connections);
      if (nextAfterMedia) {
        const nextResponse = await processNode(nextAfterMedia, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;

    case 'condition':
      const varValue = variables[node.content.variable || ''] || '';
      let conditionResult = false;
      
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
      
      const nextNodeId = conditionResult ? node.content.true_node : node.content.false_node;
      if (nextNodeId) {
        const nextNode = nodes.find(n => n.node_id === nextNodeId);
        if (nextNode) {
          const nextResponse = await processNode(nextNode, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      }
      break;

    case 'delay':
      // O delay será aplicado entre mensagens
      const nextAfterDelay = findNextNode(node.node_id, 'default', nodes, connections);
      if (nextAfterDelay) {
        const nextResponse = await processNode(nextAfterDelay, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        // Adicionar delay extra às mensagens
        const messagesWithDelay = nextResponse.messages.map((msg, idx) => ({
          ...msg,
          delay: idx === 0 ? (node.content.seconds || 3) * 1000 : msg.delay
        }));
        return {
          ...nextResponse,
          messages: messagesWithDelay,
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;

    case 'set_variable':
      if (node.content.variable_name) {
        variables[node.content.variable_name] = node.content.value || '';
      }
      const nextAfterSetVar = findNextNode(node.node_id, 'default', nodes, connections);
      if (nextAfterSetVar) {
        const nextResponse = await processNode(nextAfterSetVar, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;

    case 'transfer_human':
      const transferMsg = interpolateVariables(node.content.message || 'Aguarde, vou transferir para um atendente...', variables);
      messages.push({
        type: 'text',
        content: transferMsg,
        delay: config.typing_delay_ms
      });
      shouldTransferToHuman = true;
      break;

    case 'goto':
      if (node.content.target_node) {
        const targetNode = nodes.find(n => n.node_id === node.content.target_node);
        if (targetNode) {
          const nextResponse = await processNode(targetNode, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      }
      break;

    case 'end':
      const goodbyeMsg = interpolateVariables(config.goodbye_message || 'Até mais! 👋', variables);
      messages.push({
        type: 'text',
        content: goodbyeMsg,
        delay: config.typing_delay_ms
      });
      break;

    // ============================================================
    // 🍕 DELIVERY_ORDER - Cria pedido e salva na tabela delivery_pedidos
    // ============================================================
    case 'delivery_order':
      try {
        // Interpolar todas as variáveis necessárias
        const orderItems = variables['pedido_itens'] || variables['items'] || variables['carrinho'] || '';
        const orderTotal = variables['pedido_total'] || variables['total'] || '0';
        const deliveryAddress = interpolateVariables(
          node.content.address_variable ? `{{${node.content.address_variable}}}` : (variables['endereco'] || variables['address'] || ''), 
          variables
        );
        const paymentMethod = variables['pagamento'] || variables['payment'] || node.content.default_payment || 'dinheiro';
        const deliveryType = variables['tipo_entrega'] || variables['delivery_type'] || node.content.default_delivery_type || 'delivery';
        const customerNotes = variables['observacoes'] || variables['notes'] || '';
        
        // Criar objeto do pedido para salvar na tabela delivery_pedidos
        const orderData = {
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

        console.log(`🍕 [CHATBOT_ENGINE] Criando pedido de delivery:`, JSON.stringify(orderData, null, 2));

        // Salvar pedido no banco (será tratado pelo chatbotIntegration que tem acesso ao userId)
        // Armazenar dados do pedido nas variáveis para processamento posterior
        variables['__delivery_order_data'] = JSON.stringify(orderData);
        variables['__delivery_order_pending'] = 'true';

        // Mensagem de confirmação
        const confirmMsg = interpolateVariables(
          node.content.confirmation_message || 
          `✅ *Pedido Confirmado!*\n\n📋 Itens: {{pedido_itens}}\n💰 Total: R$ {{pedido_total}}\n📍 Entrega: {{endereco}}\n💳 Pagamento: {{pagamento}}\n\nSeu pedido será preparado! 🍕`,
          variables
        );
        
        messages.push({
          type: 'text',
          content: confirmMsg,
          delay: config.typing_delay_ms
        });

        // Ir para próximo nó
        const nextAfterDelivery = findNextNode(node.node_id, 'default', nodes, connections);
        if (nextAfterDelivery) {
          const nextResponse = await processNode(nextAfterDelivery, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (deliveryError) {
        console.error('[CHATBOT_ENGINE] Erro ao criar pedido de delivery:', deliveryError);
        messages.push({
          type: 'text',
          content: '❌ Desculpe, ocorreu um erro ao processar seu pedido. Tente novamente.',
          delay: config.typing_delay_ms
        });
      }
      break;

    // ============================================================
    // ⏰ CHECK_BUSINESS_HOURS - Verifica horário de funcionamento
    // ============================================================
    case 'check_business_hours':
      try {
        const isOpen = checkBusinessHours(node.content.opening_hours || {});
        const handleToFollow = isOpen ? 'open' : 'closed';
        
        // Armazenar resultado na variável
        variables['is_open'] = isOpen ? 'true' : 'false';
        variables['business_status'] = isOpen ? 'aberto' : 'fechado';
        
        // Se fechado e tem mensagem configurada
        if (!isOpen && node.content.closed_message) {
          const closedMsg = interpolateVariables(node.content.closed_message, variables);
          messages.push({
            type: 'text',
            content: closedMsg,
            delay: config.typing_delay_ms
          });
        }
        
        // Ir para o nó correto baseado no status
        const nextAfterHours = findNextNode(node.node_id, handleToFollow, nodes, connections) ||
                              findNextNode(node.node_id, 'default', nodes, connections);
        if (nextAfterHours) {
          const nextResponse = await processNode(nextAfterHours, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (hoursError) {
        console.error('[CHATBOT_ENGINE] Erro ao verificar horário:', hoursError);
      }
      break;

    // ============================================================
    // 📅 CREATE_APPOINTMENT - Criar agendamento
    // ============================================================
    case 'create_appointment':
      try {
        console.log(`📅 [CHATBOT_ENGINE] Processando nó create_appointment`);
        
        // Extrair dados do agendamento das variáveis
        const clientName = variables['nome'] || variables['cliente_nome'] || 'Cliente';
        const clientPhone = variables['telefone'] || variables['cliente_telefone'] || '';
        const clientEmail = variables['email'] || variables['cliente_email'] || '';
        const serviceName = variables['servico'] || variables['servico_nome'] || node.content?.service_name || '';
        const serviceId = variables['servico_id'] || node.content?.service_id || '';
        const professionalName = variables['profissional'] || variables['profissional_nome'] || node.content?.professional_name || '';
        const professionalId = variables['profissional_id'] || node.content?.professional_id || '';
        const appointmentDate = variables['data'] || variables['data_agendamento'] || '';
        const appointmentTime = variables['horario'] || variables['hora'] || variables['horario_agendamento'] || '';
        const durationMinutes = parseInt(variables['duracao'] || node.content?.duration_minutes || '60') || 60;
        const customerNotes = variables['observacoes'] || variables['notas'] || '';
        const location = variables['local'] || node.content?.location || '';
        const locationType = variables['tipo_atendimento'] || node.content?.location_type || 'presencial';
        
        // Validar dados obrigatórios
        if (!appointmentDate || !appointmentTime) {
          console.log(`📅 [CHATBOT_ENGINE] Faltam dados obrigatórios - data: ${appointmentDate}, hora: ${appointmentTime}`);
          messages.push({
            type: 'text',
            content: interpolateVariables(
              node.content?.missing_data_message || '❌ Desculpe, preciso da data e horário para agendar. Pode informar?',
              variables
            ),
            delay: config.typing_delay_ms
          });
          break;
        }

        // Montar dados do agendamento
        const appointmentData = {
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
          location: location,
          location_type: locationType,
          status: 'pendente'
        };

        console.log(`📅 [CHATBOT_ENGINE] Criando agendamento:`, JSON.stringify(appointmentData, null, 2));

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

        // Mensagem de confirmação
        const confirmAppointmentMsg = interpolateVariables(
          node.content?.confirmation_message || 
          `✅ *Agendamento Confirmado!*\n\n📅 Data: {{agendamento_data}}\n⏰ Horário: {{agendamento_horario}}\n💼 Serviço: {{agendamento_servico}}\n👤 Profissional: {{agendamento_profissional}}\n⏱️ Duração: {{agendamento_duracao}} minutos\n\nAguardamos você! 📋`,
          variables
        );
        
        messages.push({
          type: 'text',
          content: confirmAppointmentMsg,
          delay: config.typing_delay_ms
        });

        // Ir para próximo nó
        const nextAfterAppointment = findNextNode(node.node_id, 'default', nodes, connections);
        if (nextAfterAppointment) {
          const nextResponse = await processNode(nextAfterAppointment, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (appointmentError) {
        console.error('[CHATBOT_ENGINE] Erro ao criar agendamento:', appointmentError);
        messages.push({
          type: 'text',
          content: '❌ Desculpe, ocorreu um erro ao processar seu agendamento. Tente novamente.',
          delay: config.typing_delay_ms
        });
      }
      break;
  }

  return {
    messages,
    waitingForInput,
    currentNodeId,
    shouldTransferToHuman,
    variables
  };
}

// ============================================================
// 🍕 HELPER: Parse items de pedido
// ============================================================
function parseOrderItems(itemsString: string, variables: Record<string, string>): Array<{name: string, quantity: number, price: number, notes?: string}> {
  try {
    // Se já é um array JSON
    if (itemsString.startsWith('[')) {
      return JSON.parse(itemsString);
    }
    
    // Se é string formatada: "1x Pizza Grande, 2x Coca-Cola"
    const items: Array<{name: string, quantity: number, price: number, notes?: string}> = [];
    const parts = itemsString.split(/[,;]/);
    
    for (const part of parts) {
      const match = part.trim().match(/^(\d+)x?\s*(.+?)(?:\s*-\s*R?\$?\s*([\d.,]+))?$/i);
      if (match) {
        items.push({
          name: match[2].trim(),
          quantity: parseInt(match[1]) || 1,
          price: parseFloat(match[3]?.replace(',', '.') || '0') || 0
        });
      } else if (part.trim()) {
        items.push({
          name: part.trim(),
          quantity: 1,
          price: 0
        });
      }
    }
    
    return items;
  } catch (e) {
    console.error('[CHATBOT_ENGINE] Erro ao parsear itens:', e);
    return [];
  }
}

// ============================================================
// ⏰ HELPER: Verificar horário de funcionamento
// ============================================================
function checkBusinessHours(openingHours: Record<string, { open: string; close: string; is_open: boolean }>): boolean {
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[now.getDay()];
  
  const todayHours = openingHours[today];
  if (!todayHours || !todayHours.is_open) {
    return false;
  }
  
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  
  const openTime = openH * 60 + openM;
  const closeTime = closeH * 60 + closeM;
  
  // Trata caso de horário que passa da meia-noite (ex: 18:00 - 02:00)
  if (closeTime < openTime) {
    return currentTime >= openTime || currentTime <= closeTime;
  }
  
  return currentTime >= openTime && currentTime <= closeTime;
}

/**
 * Verifica se o chatbot está ativo para um usuário
 */
export async function isChatbotActive(userId: string): Promise<boolean> {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql`
        SELECT is_active FROM chatbot_configs WHERE user_id = ${userId}
      `);
    });
    
    if (result.rows.length === 0) {
      return false;
    }
    
    return (result.rows[0] as any).is_active === true;
  } catch (error) {
    console.error('[CHATBOT_ENGINE] Erro ao verificar status:', error);
    return false;
  }
}

/**
 * Aplica humanização às mensagens de resposta se habilitado
 */
function applyHumanization(response: ChatbotResponse, config: ChatbotConfig): ChatbotResponse {
  if (!config.enable_humanization || !response.messages) {
    return response;
  }
  
  const level = config.humanization_level || 'medium';
  
  return {
    ...response,
    messages: response.messages.map(msg => {
      if (msg.type === 'text' && typeof msg.content === 'string') {
        return {
          ...msg,
          content: humanizeText(msg.content, level)
        };
      }
      // Para buttons e lists, humanizar o body
      if ((msg.type === 'buttons' || msg.type === 'list') && msg.content?.body) {
        return {
          ...msg,
          content: {
            ...msg.content,
            body: humanizeText(msg.content.body, level)
          }
        };
      }
      return msg;
    })
  };
}

/**
 * Processa uma mensagem recebida pelo chatbot
 * Retorna null se o chatbot não estiver ativo ou não tiver fluxo configurado
 * 
 * SISTEMA HÍBRIDO: Se habilitado, a IA interpreta a intenção do usuário
 * e aciona o nó correto do fluxo. A resposta SEMPRE vem do fluxo.
 */
export async function processChatbotMessage(
  userId: string,
  conversationId: string,
  contactNumber: string,
  message: string,
  isFirstMessage: boolean = false
): Promise<ChatbotResponse | null> {
  console.log(`🤖 [CHATBOT_ENGINE] Processando mensagem para usuário ${userId}`);
  
  // Carregar fluxo
  const flow = await loadChatbotFlow(userId);
  if (!flow) {
    console.log(`[CHATBOT_ENGINE] Chatbot não está ativo ou não tem fluxo para ${userId}`);
    return null;
  }

  const { config, nodes, connections } = flow;

  // Verificar se há nós no fluxo
  if (nodes.length === 0) {
    console.log(`[CHATBOT_ENGINE] Fluxo vazio para ${userId}`);
    return null;
  }

  // Buscar/criar estado da conversa
  const state = await getOrCreateConversationState(config.id, conversationId, contactNumber);
  if (!state) {
    console.error('[CHATBOT_ENGINE] Não foi possível obter estado da conversa');
    return null;
  }

  const messageLower = message.toLowerCase().trim();

  // ==============================================================
  // 🤖 SISTEMA HÍBRIDO: Carregar configuração e processar entrada
  // ==============================================================
  let hybridConfig: HybridFlowConfig | null = null;
  let processedInput: ReturnType<typeof processUserInputWithNaturalLanguage> | null = null;
  
  try {
    hybridConfig = await getHybridConfig(userId);
    
    if (hybridConfig?.enable_hybrid_ai) {
      // Processar entrada com interpretação de linguagem natural
      processedInput = processUserInputWithNaturalLanguage(message, hybridConfig);
      
      // Log da decisão do sistema híbrido
      logHybridDecision(
        message,
        processedInput.intent,
        processedInput.intent.confidence >= (hybridConfig.ai_confidence_threshold || 0.7) ? 'hybrid' : 'flow'
      );
      
      // Aplicar dados extraídos (data, hora) às variáveis
      if (processedInput.extractedDate || processedInput.extractedTime) {
        const updatedVars = applyExtractedDataToVariables(
          state.variables,
          processedInput.extractedDate,
          processedInput.extractedTime,
          processedInput.intent
        );
        
        // Atualizar variáveis no estado
        await updateConversationState(conversationId, config.id, {
          variables: updatedVars
        });
        
        state.variables = updatedVars;
      }
    }
  } catch (hybridError) {
    console.error('[CHATBOT_ENGINE] Erro no sistema híbrido:', hybridError);
    // Continuar com fluxo normal se híbrido falhar
  }

  // ==============================================================
  // 🤖 DETECÇÃO COM IA: Usar detectIntent para interpretar a mensagem
  // ==============================================================
  const intent = detectIntent(message);
  console.log(`🤖 [IA] Intenção detectada: ${intent.category} (confiança: ${(intent.confidence * 100).toFixed(0)}%)`);
  
  // Se IA detectou SAUDAÇÃO com confiança >= 70%, reiniciar fluxo
  if (intent.category === 'greeting' && intent.confidence >= 0.7) {
    console.log(`👋 [IA] Saudação detectada: "${message}" - Iniciando/reiniciando fluxo`);
    
    // Reiniciar estado para saudação
    await updateConversationState(conversationId, config.id, {
      current_node_id: undefined,
      variables: {},
      visited_nodes: []
    });

    // Processar desde o início
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }
  
  // Se IA detectou MENU com confiança >= 70%, mostrar menu inicial
  if (intent.category === 'menu' && intent.confidence >= 0.7) {
    console.log(`📋 [IA] Pedido de menu detectado: "${message}" - Mostrando menu inicial`);
    
    // Reiniciar para mostrar menu inicial
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      await updateConversationState(conversationId, config.id, {
        current_node_id: undefined,
        variables: {},
        visited_nodes: []
      });
      
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }

  // Verificar palavra-chave de reinício
  const restartKeywords = config.restart_keywords || ['menu', 'início', 'inicio', 'voltar', 'reiniciar'];
  if (config.restart_on_keyword && restartKeywords.some(kw => messageLower === kw.toLowerCase())) {
    console.log(`[CHATBOT_ENGINE] Reiniciando fluxo por palavra-chave: ${message}`);
    
    // Reiniciar estado
    await updateConversationState(conversationId, config.id, {
      current_node_id: undefined,
      variables: {},
      visited_nodes: []
    });

    // Processar desde o início
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }

  // Se é a primeira mensagem, iniciar do começo
  // BUGFIX: Apenas enviar boas-vindas se for REALMENTE a primeira mensagem (isFirstMessage=true)
  // Antes estava enviando boas-vindas sempre que !current_node_id (bug!)
  if (isFirstMessage) {
    // Enviar boas-vindas se configurado
    const messages: ChatbotResponse['messages'] = [];
    
    if (config.send_welcome_on_first_contact && config.welcome_message) {
      messages.push({
        type: 'text',
        content: config.welcome_message,
        delay: config.typing_delay_ms
      });
    }

    // Encontrar nó de início
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id, ...(response.currentNodeId ? [response.currentNodeId] : [])]
      });

      return applyHumanization({
        ...response,
        messages: [...messages, ...response.messages]
      }, config);
    }

    return applyHumanization({ messages, waitingForInput: false }, config);
  }

  // Se não tem nó atual mas não é primeira mensagem, reiniciar fluxo SEM boas-vindas
  if (!state.current_node_id) {
    console.log(`[CHATBOT_ENGINE] Sem nó atual, reiniciando fluxo SEM boas-vindas`);
    const startNode = nodes.find(n => n.node_type === 'start');
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: state.variables || {}, visited_nodes: [] }, nodes, connections, config);
      
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id, ...(response.currentNodeId ? [response.currentNodeId] : [])]
      });

      return applyHumanization(response, config);
    }
    return null;
  }

  // Processar resposta do usuário baseado no nó atual
  const currentNode = nodes.find(n => n.node_id === state.current_node_id);
  if (!currentNode) {
    console.warn(`[CHATBOT_ENGINE] Nó atual não encontrado: ${state.current_node_id}`);
    return null;
  }

  const variables = { ...state.variables };

  // Processar baseado no tipo do nó atual
  if (currentNode.node_type === 'input') {
    // Salvar variável
    const varName = currentNode.content.variable_name || 'input';
    variables[varName] = message;

    // Validar entrada se necessário
    if (currentNode.content.input_type && currentNode.content.required) {
      let isValid = true;
      
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
        const errorMsg = currentNode.content.validation_message || 
          `Por favor, digite um ${currentNode.content.input_type} válido.`;
        return applyHumanization({
          messages: [{ type: 'text', content: errorMsg, delay: config.typing_delay_ms }],
          waitingForInput: true,
          currentNodeId: currentNode.node_id,
          variables: state.variables
        }, config);
      }
    }

    // Ir para próximo nó
    const nextNode = findNextNode(currentNode.node_id, 'default', nodes, connections);
    if (nextNode) {
      const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
      
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: { ...variables, ...response.variables },
        visited_nodes: [...state.visited_nodes, currentNode.node_id]
      });

      return applyHumanization(response, config);
    }
  } else if (currentNode.node_type === 'buttons') {
    // Encontrar botão clicado
    // CORREÇÃO: Também aceitar números (1, 2, 3) como resposta aos botões
    // Isso é necessário quando os botões são convertidos para texto numerado
    const buttons = currentNode.content.buttons || [];
    let button = buttons.find(
      (btn: any) => btn.title.toLowerCase() === messageLower || btn.id === message
    );
    
    // Se não encontrou, tentar por índice numérico (1, 2, 3, etc)
    if (!button) {
      const numericInput = parseInt(message.trim(), 10);
      if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= buttons.length) {
        button = buttons[numericInput - 1]; // Índice base 0
        console.log(`🔢 [BUTTONS] Entrada numérica detectada: ${numericInput} -> ${button?.title}`);
      }
    }
    
    // Também tentar match por título sem emoji (ex: "Pizzas" ao invés de "🍕 Pizzas")
    if (!button) {
      button = buttons.find((btn: any) => {
        const titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
        return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji);
      });
      if (button) {
        console.log(`🔤 [BUTTONS] Match por título sem emoji: ${message} -> ${button.title}`);
      }
    }
    
    // ==============================================================
    // 🧠 MATCH INTELIGENTE: Busca parcial flexível
    // Permite: "Salgadas" → "🍕 Pizzas Salgadas", "Grande" → "G - Grande"
    // ==============================================================
    if (!button && messageLower.length >= 2) {
      button = buttons.find((btn: any) => {
        const titleLower = btn.title.toLowerCase();
        const titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
        const titleNormalized = titleNoEmoji
          .replace(/^[a-z]\s*-\s*/i, '') // Remove prefixos como "G - ", "M - ", "P - "
          .replace(/[^\w\sáéíóúàèìòùãõâêîôûç]/gi, '') // Remove caracteres especiais
          .trim();
        
        // Verificar se o título CONTÉM a mensagem do usuário
        const containsMatch = titleNoEmoji.includes(messageLower) || 
                             titleNormalized.includes(messageLower);
        
        // Verificar match de tamanho: "grande" → "G - Grande", "media" → "M - Média"
        const sizeMap: Record<string, string[]> = {
          'p': ['pequena', 'pequeno', 'peq', 'p'],
          'm': ['media', 'média', 'medio', 'médio', 'med', 'm'],
          'g': ['grande', 'grd', 'g'],
          'gg': ['gigante', 'familia', 'família', 'gg']
        };
        
        let sizeMatch = false;
        for (const [prefix, aliases] of Object.entries(sizeMap)) {
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
        const msgWords = messageLower.split(/\s+/).filter(w => w.length >= 3);
        const keywordMatch = msgWords.some(word => 
          titleNoEmoji.split(/\s+/).some(titleWord => 
            titleWord.includes(word) || word.includes(titleWord)
          )
        );
        
        return containsMatch || sizeMatch || keywordMatch;
      });
      
      if (button) {
        console.log(`🧠 [SMART_MATCH] Match inteligente: "${message}" → "${button.title}"`);
      }
    }

    if (button) {
      // ====================================================================
      // 📌 CORREÇÃO CRÍTICA: Salvar variável quando usuário seleciona botão
      // ====================================================================
      // Prioridade 1: save_variable dentro do próprio botão (estrutura nova)
      if (button.save_variable) {
        variables[button.save_variable] = button.title;
        console.log(`💾 [BUTTONS] Salvando variável (do botão) ${button.save_variable} = "${button.title}"`);
      }
      // Prioridade 2: save_variable no nó (estrutura antiga/fallback)
      else if (currentNode.content.save_variable) {
        variables[currentNode.content.save_variable] = button.title;
        console.log(`💾 [BUTTONS] Salvando variável (do nó) ${currentNode.content.save_variable} = "${button.title}"`);
      }
      
      const handle = `button_${button.id}`;
      const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                      findNextNode(currentNode.node_id, 'default', nodes, connections);
      
      if (nextNode) {
        const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
        
        await updateConversationState(conversationId, config.id, {
          current_node_id: response.currentNodeId,
          variables: { ...variables, ...response.variables },
          visited_nodes: [...state.visited_nodes, currentNode.node_id]
        });

        return applyHumanization(response, config);
      }
    } else {
      // ==============================================================
      // 🤖 SISTEMA HÍBRIDO: Tentar interpretar a intenção do usuário
      // ==============================================================
      if (hybridConfig?.enable_hybrid_ai && processedInput) {
        const intent = processedInput.intent;
        const threshold = hybridConfig.ai_confidence_threshold || 0.7;
        
        // Se a IA tem confiança suficiente, tentar encontrar botão por similaridade
        if (intent.confidence >= threshold) {
          // Tentar match parcial com botões
          const partialButton = currentNode.content.buttons?.find((btn: any) => {
            const btnLower = btn.title.toLowerCase();
            const msgWords = messageLower.split(/\s+/);
            return msgWords.some((word: string) => word.length > 2 && btnLower.includes(word)) ||
                   intent.keywords.some(kw => btnLower.includes(kw));
          });
          
          if (partialButton) {
            console.log(`🤖 [HYBRID_AI] Match parcial encontrado: ${partialButton.title}`);
            
            // 📌 CORREÇÃO: Salvar variável quando match híbrido encontra botão
            if (partialButton.save_variable) {
              variables[partialButton.save_variable] = partialButton.title;
              console.log(`💾 [HYBRID_AI] Salvando variável ${partialButton.save_variable} = "${partialButton.title}"`);
            } else if (currentNode.content.save_variable) {
              variables[currentNode.content.save_variable] = partialButton.title;
              console.log(`💾 [HYBRID_AI] Salvando variável ${currentNode.content.save_variable} = "${partialButton.title}"`);
            }
            
            const handle = `button_${partialButton.id}`;
            const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                            findNextNode(currentNode.node_id, 'default', nodes, connections);
            
            if (nextNode) {
              const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });

              return applyHumanization(response, config);
            }
          }
          
          // Tentar encontrar nó por intenção
          const intentNodeId = findNodeByIntent(intent, nodes, { variables, currentNodeId: currentNode.node_id });
          if (intentNodeId && intentNodeId !== currentNode.node_id) {
            const intentNode = nodes.find(n => n.node_id === intentNodeId);
            if (intentNode) {
              console.log(`🤖 [HYBRID_AI] Redirecionando para nó por intenção: ${intentNode.name}`);
              const response = await processNode(intentNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });

              return applyHumanization(response, config);
            }
          }
        }
      }
      
      // ==============================================================
      // 🔄 FALLBACK INTELIGENTE COM IA: Redirecionar por intenção
      // ==============================================================
      // A IA já detectou a intenção no início. Se chegou aqui sem match de botão,
      // verificar se a intenção pode ser mapeada para uma opção
      if (intent.confidence >= 0.6) {
        // Tentar encontrar botão que corresponda à intenção
        const matchedButton = currentNode.content.buttons?.find((btn: any) => {
          const btnText = btn.title.toLowerCase();
          // Verificar se alguma keyword da intenção está no texto do botão
          return intent.keywords.some(kw => btnText.includes(kw.toLowerCase()));
        });
        
        if (matchedButton) {
          console.log(`🤖 [IA] Intenção "${intent.category}" mapeada para botão: ${matchedButton.title}`);
          
          // 📌 CORREÇÃO: Salvar variável quando IA mapeia intenção para botão
          if (matchedButton.save_variable) {
            variables[matchedButton.save_variable] = matchedButton.title;
            console.log(`💾 [IA_INTENT] Salvando variável ${matchedButton.save_variable} = "${matchedButton.title}"`);
          } else if (currentNode.content.save_variable) {
            variables[currentNode.content.save_variable] = matchedButton.title;
            console.log(`💾 [IA_INTENT] Salvando variável ${currentNode.content.save_variable} = "${matchedButton.title}"`);
          }
          
          const handle = `button_${matchedButton.id}`;
          const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                          findNextNode(currentNode.node_id, 'default', nodes, connections);
          
          if (nextNode) {
            const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
            await updateConversationState(conversationId, config.id, {
              current_node_id: response.currentNodeId,
              variables: { ...variables, ...response.variables },
              visited_nodes: [...state.visited_nodes, currentNode.node_id]
            });
            return applyHumanization(response, config);
          }
        }
      }
      
      // Resposta não reconhecida (fallback) - repetir menu atual
      console.log(`⚠️ [CHATBOT_ENGINE] Mensagem não reconhecida: "${message}" - Mostrando fallback com menu`);
      return applyHumanization({
        messages: [{ type: 'text', content: config.fallback_message, delay: config.typing_delay_ms }],
        waitingForInput: true,
        currentNodeId: currentNode.node_id,
        variables: state.variables
      }, config);
    }
  } else if (currentNode.node_type === 'list') {
    // Encontrar opção selecionada
    const allRows: any[] = [];
    currentNode.content.sections?.forEach((section: any) => {
      if (section.rows) {
        allRows.push(...section.rows);
      }
    });
    
    // CORREÇÃO: Também aceitar números (1, 2, 3) como resposta às listas
    let option = allRows.find(
      (row: any) => row.title.toLowerCase() === messageLower || row.id === message
    );
    
    // Se não encontrou, tentar por índice numérico (1, 2, 3, etc)
    if (!option) {
      const numericInput = parseInt(message.trim(), 10);
      if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= allRows.length) {
        option = allRows[numericInput - 1]; // Índice base 0
        console.log(`🔢 [LIST] Entrada numérica detectada: ${numericInput} -> ${option?.title}`);
      }
    }
    
    // Também tentar match por título parcial
    if (!option) {
      option = allRows.find((row: any) => {
        const titleNoEmoji = row.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim().toLowerCase();
        return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji) || titleNoEmoji.includes(messageLower);
      });
      if (option) {
        console.log(`🔤 [LIST] Match parcial: ${message} -> ${option.title}`);
      }
    }

    if (option) {
      // ====================================================================
      // 📌 CORREÇÃO CRÍTICA: Salvar variável quando usuário seleciona item da lista
      // ====================================================================
      // Prioridade 1: save_variable dentro do próprio item (estrutura nova)
      if (option.save_variable) {
        variables[option.save_variable] = option.title;
        console.log(`💾 [LIST] Salvando variável (do item) ${option.save_variable} = "${option.title}"`);
      }
      // Prioridade 2: save_variable no nó (estrutura antiga/fallback)
      else if (currentNode.content.save_variable) {
        variables[currentNode.content.save_variable] = option.title;
        console.log(`💾 [LIST] Salvando variável (do nó) ${currentNode.content.save_variable} = "${option.title}"`);
      }
      
      const handle = `row_${option.id}`;
      const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                      findNextNode(currentNode.node_id, 'default', nodes, connections);
      
      if (nextNode) {
        const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
        
        await updateConversationState(conversationId, config.id, {
          current_node_id: response.currentNodeId,
          variables: { ...variables, ...response.variables },
          visited_nodes: [...state.visited_nodes, currentNode.node_id]
        });

        return applyHumanization(response, config);
      }
    } else {
      // ==============================================================
      // 🤖 SISTEMA HÍBRIDO: Tentar interpretar a intenção para listas
      // ==============================================================
      if (hybridConfig?.enable_hybrid_ai && processedInput) {
        const intent = processedInput.intent;
        const threshold = hybridConfig.ai_confidence_threshold || 0.7;
        
        if (intent.confidence >= threshold) {
          // Tentar match parcial com opções da lista
          const partialOption = allRows.find((row: any) => {
            const rowLower = row.title.toLowerCase();
            const descLower = (row.description || '').toLowerCase();
            const msgWords = messageLower.split(/\s+/);
            return msgWords.some((word: string) => word.length > 2 && (rowLower.includes(word) || descLower.includes(word))) ||
                   intent.keywords.some(kw => rowLower.includes(kw) || descLower.includes(kw));
          });
          
          if (partialOption) {
            console.log(`🤖 [HYBRID_AI] Match parcial em lista: ${partialOption.title}`);
            
            // 📌 CORREÇÃO: Salvar variável quando match híbrido encontra item
            if (partialOption.save_variable) {
              variables[partialOption.save_variable] = partialOption.title;
              console.log(`💾 [HYBRID_AI] Salvando variável ${partialOption.save_variable} = "${partialOption.title}"`);
            } else if (currentNode.content.save_variable) {
              variables[currentNode.content.save_variable] = partialOption.title;
              console.log(`💾 [HYBRID_AI] Salvando variável ${currentNode.content.save_variable} = "${partialOption.title}"`);
            }
            // Manter compatibilidade com código antigo
            variables['opcao_escolhida'] = partialOption.title;
            variables['opcao_id'] = partialOption.id;
            
            const handle = `row_${partialOption.id}`;
            const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                            findNextNode(currentNode.node_id, 'default', nodes, connections);
            
            if (nextNode) {
              const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });

              return applyHumanization(response, config);
            }
          }
          
          // Tentar encontrar nó por intenção
          const intentNodeId = findNodeByIntent(intent, nodes, { variables, currentNodeId: currentNode.node_id });
          if (intentNodeId && intentNodeId !== currentNode.node_id) {
            const intentNode = nodes.find(n => n.node_id === intentNodeId);
            if (intentNode) {
              console.log(`🤖 [HYBRID_AI] Redirecionando para nó por intenção: ${intentNode.name}`);
              const response = await processNode(intentNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });

              return applyHumanization(response, config);
            }
          }
        }
      }
      
      // ==============================================================
      // 🔄 FALLBACK INTELIGENTE COM IA para LISTAS
      // ==============================================================
      // A IA já detectou a intenção no início. Se chegou aqui sem match de lista,
      // verificar se a intenção pode ser mapeada para uma opção
      if (intent.confidence >= 0.6) {
        // Tentar encontrar row que corresponda à intenção
        const matchedRow = allRows.find((row: any) => {
          const rowText = row.title.toLowerCase();
          // Verificar se alguma keyword da intenção está no texto da row
          return intent.keywords.some(kw => rowText.includes(kw.toLowerCase()));
        });
        
        if (matchedRow) {
          console.log(`🤖 [IA] Intenção "${intent.category}" mapeada para lista: ${matchedRow.title}`);
          
          // ✅ CORREÇÃO: Salvar variável do item da lista selecionado
          if (matchedRow.save_variable) {
            variables[matchedRow.save_variable] = matchedRow.title;
            console.log(`💾 [IA_INTENT] Salvando variável (da lista) ${matchedRow.save_variable} = "${matchedRow.title}"`);
          } else if (currentNode.content.save_variable) {
            variables[currentNode.content.save_variable] = matchedRow.title;
            console.log(`💾 [IA_INTENT] Salvando variável (do nó) ${currentNode.content.save_variable} = "${matchedRow.title}"`);
          }
          
          const handle = `row_${matchedRow.id}`;
          const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) ||
                          findNextNode(currentNode.node_id, 'default', nodes, connections);
          
          if (nextNode) {
            const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
            await updateConversationState(conversationId, config.id, {
              current_node_id: response.currentNodeId,
              variables: { ...variables, ...response.variables },
              visited_nodes: [...state.visited_nodes, currentNode.node_id]
            });
            return applyHumanization(response, config);
          }
        }
      }
      
      // Resposta não reconhecida (fallback)
      console.log(`⚠️ [CHATBOT_ENGINE] Lista - Mensagem não reconhecida: "${message}" - Mostrando fallback`);
      return applyHumanization({
        messages: [{ type: 'text', content: config.fallback_message, delay: config.typing_delay_ms }],
        waitingForInput: true,
        currentNodeId: currentNode.node_id,
        variables: state.variables
      }, config);
    }
  }

  // Se chegou aqui, não conseguiu processar
  console.log(`[CHATBOT_ENGINE] Não foi possível processar mensagem para nó ${currentNode.node_type}`);
  return null;
}

/**
 * Obtém estatísticas do chatbot de um usuário
 */
export async function getChatbotStats(userId: string): Promise<{
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  variablesCollected: number;
} | null> {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(jsonb_object_keys(variables)::int) as vars_count
        FROM chatbot_conversation_data cd
        JOIN chatbot_configs c ON cd.chatbot_id = c.id
        WHERE c.user_id = ${userId}
      `);
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      totalConversations: parseInt(row.total) || 0,
      activeConversations: parseInt(row.active) || 0,
      completedConversations: parseInt(row.completed) || 0,
      variablesCollected: parseInt(row.vars_count) || 0
    };
  } catch (error) {
    console.error('[CHATBOT_ENGINE] Erro ao obter estatísticas:', error);
    return null;
  }
}
