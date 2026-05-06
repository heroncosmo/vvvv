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

import { FlowBuilder, PromptAnalyzer } from "./FlowBuilder";
import type { FlowDefinition, FlowType } from "./FlowBuilder";
import { UnifiedFlowEngine, FlowStorage, FlowConfig } from "./UnifiedFlowEngine";
import { supabase } from "./supabaseAuth";

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM GENERATE-PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chamado quando usuário cria novo agente (/api/agent/generate-prompt)
 * Cria tanto o prompt (texto) quanto o FlowDefinition (estrutura)
 */
export async function handleGeneratePrompt(
  userId: string,
  businessType: string,
  businessName: string,
  description?: string,
  additionalInfo?: string,
  mistralApiKey?: string
): Promise<{
  prompt: string;
  flow: FlowDefinition;
  flowCreated: boolean;
}> {
  console.log(`\n🔗 [FlowIntegration] Gerando prompt + flow para ${businessName}`);

  // 1. Analisar tipo de negócio para determinar flow adequado
  const analyzer = new PromptAnalyzer();
  // 2. Construir FlowDefinition baseado no tipo
  const builder = new FlowBuilder(undefined, mistralApiKey);
  
  // Criar prompt base para análise
  const basePrompt = `
Você é um atendente virtual da ${businessName}.
Tipo de negócio: ${businessType}
${description ? `Descrição: ${description}` : ''}
${additionalInfo ? `Informações adicionais: ${additionalInfo}` : ''}
  `.trim();

  // 3. Construir flow
  let flow: FlowDefinition;
  try {
    const desiredType = await resolveDesiredFlowType(userId);
    flow = await buildFlowFromPromptWithType(basePrompt, desiredType);
    
    // Ajustar dados do flow
    flow.businessName = businessName;
    flow.agentName = extractAgentName(description) || 'Assistente';
    
    console.log(`   📋 Flow criado: ${flow.type} com ${Object.keys(flow.states).length} estados`);
  } catch (err) {
    console.error(`   ❌ Erro ao criar flow:`, err);
    // Fallback: criar flow genérico
    flow = builder.buildGenericoFlow('Assistente', businessName, 'profissional e amigável');
    flow.businessName = businessName;
  }

  // 4. Salvar flow no banco
  let flowCreated = false;
  try {
    flowCreated = await FlowStorage.saveFlow(userId, flow);
    console.log(`   ${flowCreated ? '✅' : '❌'} Flow ${flowCreated ? 'salvo' : 'não salvo'} no banco`);
  } catch (err) {
    console.error(`   ❌ Erro ao salvar flow:`, err);
  }

  // 5. Gerar prompt de texto (mantido para compatibilidade)
  const prompt = generatePromptFromFlow(flow, description, additionalInfo);

  console.log(`   📝 Prompt gerado: ${prompt.length} chars`);
  console.log(`🔗 [FlowIntegration] ════════════════════════════════\n`);

  return { prompt, flow, flowCreated };
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
export async function handleEditPrompt(
  userId: string,
  currentPrompt: string,
  instruction: string,
  newPrompt: string,
  apiKey: string
): Promise<{
  flowUpdated: boolean;
  changes: string[];
}> {
  console.log(`\n🔗 [FlowIntegration] Editando flow com instrução...`);
  console.log(`   Instrução: "${instruction.substring(0, 60)}..."`);

  // 🎯 DETECÇÃO: Mudança completa de prompt vs edição pontual
  const promptChangedCompletely = newPrompt !== currentPrompt && 
    (newPrompt.length > currentPrompt.length * 1.5 || 
     newPrompt.length < currentPrompt.length * 0.7);
  
  // 🎯 DETECÇÃO: Prompt tem mensagem customizada obrigatória?
  const hasCustomGreeting = /responder\s+\*\*exatamente\*\*|primeira mensagem|sempre enviar|enviar sempre|mensagem inicial/i.test(newPrompt);

  if (promptChangedCompletely || hasCustomGreeting) {
    console.log(`   🔄 REGENERANDO FLOW DO ZERO (prompt mudou ${promptChangedCompletely ? 'completamente' : 'tem mensagem customizada'})`);
    const builder = new FlowBuilder(undefined, apiKey); // Passar Mistral API key
    const flow = await builder.buildFromPrompt(newPrompt);
    const saved = await FlowStorage.saveFlow(userId, flow);
    
    console.log(`   ${saved ? '✅' : '❌'} Flow ${saved ? 'regenerado' : 'não regenerado'} do zero`);
    console.log(`🔗 [FlowIntegration] ════════════════════════════════\n`);
    
    return {
      flowUpdated: saved,
      changes: saved ? ['Flow regenerado completamente do novo prompt'] : []
    };
  }

  // 🎯 EDIÇÃO PONTUAL: Modificar valores específicos
  console.log(`   ✏️ Edição pontual - modificando valores específicos`);

  // 1. Carregar flow existente
  let flow = await FlowStorage.loadFlow(userId);
  const changes: string[] = [];

  if (!flow) {
    // Se não existe flow, criar um do prompt
    console.log(`   ⚠️ Flow não encontrado, criando do prompt atual...`);
    const builder = new FlowBuilder(undefined, apiKey); // Passar Mistral API key
    flow = await builder.buildFromPrompt(currentPrompt);
    changes.push('Flow criado a partir do prompt existente');
  }

  // 2. Analisar instrução e aplicar modificações
  const instructionLower = instruction.toLowerCase();

  // Modificar preços
  const priceMatches = instruction.match(/(?:pre[çc]o|valor|custa?).*?r?\$?\s*(\d+(?:[,.]\d{2})?)/gi);
  if (priceMatches) {
    for (const match of priceMatches) {
      const priceMatch = match.match(/(\d+(?:[,.]\d{2})?)/);
      if (priceMatch) {
        const newPrice = parseFloat(priceMatch[1].replace(',', '.'));
        if (!isNaN(newPrice) && flow) {
          if (!flow.data) flow.data = {};
          if (!flow.data.prices) flow.data.prices = {};
          
          if (instructionLower.includes('promo') || instructionLower.includes('desconto')) {
            flow.data.prices.promo = newPrice;
            changes.push(`Preço promocional: R$${newPrice}`);
          } else if (instructionLower.includes('impl') || instructionLower.includes('setup')) {
            flow.data.prices.implementation = newPrice;
            changes.push(`Preço implementação: R$${newPrice}`);
          } else {
            flow.data.prices.standard = newPrice;
            changes.push(`Preço padrão: R$${newPrice}`);
          }
        }
      }
    }
  }

  // Modificar cupom
  const couponMatch = instruction.match(/cupom\s*(?:é|:)?\s*([A-Z0-9_-]+)/i);
  if (couponMatch && flow) {
    const newCoupon = couponMatch[1].toUpperCase();
    if (!flow.data) flow.data = {};
    if (!flow.data.coupons) flow.data.coupons = {};
    
    const discountMatch = instruction.match(/(\d+)\s*%/);
    const discount = discountMatch ? parseInt(discountMatch[1]) : 50;
    
    flow.data.coupons[newCoupon] = { code: newCoupon, discount };
    changes.push(`Cupom: ${newCoupon} (${discount}% off)`);
  }

  // Modificar link
  const linkMatch = instruction.match(/(https?:\/\/[^\s]+)/i);
  if (linkMatch && flow) {
    if (!flow.data) flow.data = {};
    if (!flow.data.links) flow.data.links = {};
    
    if (instructionLower.includes('cadastro') || instructionLower.includes('signup')) {
      flow.data.links.signup = linkMatch[1];
      changes.push(`Link cadastro: ${linkMatch[1]}`);
    } else {
      flow.data.links.site = linkMatch[1];
      changes.push(`Link site: ${linkMatch[1]}`);
    }
  }

  // Modificar nome do agente
  if (instructionLower.includes('nome') && instructionLower.includes('agente') && flow) {
    const nameMatch = instruction.match(/(?:chamar?|nome).*?(?:de\s+)?([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)(?:\s|$)/i);
    if (nameMatch && nameMatch[1].length > 2 && !['de', 'do', 'da', 'para', 'por'].includes(nameMatch[1].toLowerCase())) {
      flow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
      changes.push(`Nome do agente: ${flow.agentName}`);
    }
  }

  // Verificar se flow existe antes de modificar personalidade
  if (!flow) {
    console.log(`   ❌ Flow não encontrado após criação`);
    return { flowUpdated: false, changes: [] };
  }

  // Modificar personalidade
  if (instructionLower.includes('formal') && !instructionLower.includes('informal')) {
    flow.agentPersonality = 'formal, profissional, cortês';
    changes.push('Personalidade: formal');
  } else if (instructionLower.includes('informal') || instructionLower.includes('descontraído')) {
    flow.agentPersonality = 'informal, descontraído, divertido';
    changes.push('Personalidade: informal');
  } else if (instructionLower.includes('direto') || instructionLower.includes('objetivo')) {
    flow.agentPersonality = 'direto, objetivo, prático';
    changes.push('Personalidade: direto');
  }

  // Adicionar nova regra global
  if (instructionLower.includes('sempre') || instructionLower.includes('nunca')) {
    if (!flow.globalRules) flow.globalRules = [];
    flow.globalRules.push(instruction);
    changes.push(`Nova regra adicionada`);
  }

  // 3. Atualizar versão e salvar
  flow.version = incrementVersion(flow.version);
  
  const saved = await FlowStorage.saveFlow(userId, flow);
  
  console.log(`   ${saved ? '✅' : '❌'} Flow ${saved ? 'atualizado' : 'não atualizado'}`);
  console.log(`   📊 ${changes.length} mudanças aplicadas: ${changes.join(', ')}`);
  console.log(`🔗 [FlowIntegration] ════════════════════════════════\n`);

  return {
    flowUpdated: saved,
    changes
  };
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
export async function shouldUseFlowEngine(userId: string): Promise<boolean> {
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
  console.log(`\n🔍 [shouldUseFlowEngine] Verificando para user ${userId}`);
  
  try {
    // PRIMEIRO: Verificar se o Construtor de Fluxo está ATIVO em chatbot_configs
    const { data: chatbotConfig, error: chatbotError } = await supabase
      .from('chatbot_configs')
      .select('is_active, name')
      .eq('user_id', userId)
      .single();
    
    if (chatbotError && chatbotError.code !== 'PGRST116') {
      console.error(`   ❌ Erro ao verificar chatbot_configs:`, chatbotError);
    }
    
    // Se chatbot_configs.is_active é FALSE ou não existe, NÃO usar FlowEngine
    const flowAtivo = chatbotConfig?.is_active === true;
    console.log(`   → chatbot_configs.is_active: ${chatbotConfig?.is_active ?? 'não existe'}`);
    
    if (!flowAtivo) {
      console.log(`   ⚠️ FlowEngine DESATIVADO - Usando Agente IA (prompt)`);
      return false;
    }
    
    // SEGUNDO: Verificar se tem FlowDefinition no banco
    const flow = await FlowStorage.loadFlow(userId);
    if (flow) {
      console.log(`   ✅ FlowEngine ATIVO - FlowDefinition encontrado: ${flow.type}`);
      return true;
    }
    
    console.log(`   ⚠️ FlowEngine ativo mas sem FlowDefinition, usando Agente IA`);
    return false;
  } catch (error) {
    console.error(`   ❌ Erro ao verificar FlowEngine:`, error);
    return false;
  }
  
  /*
  // ════════════════════════════════════════════════════════════════════════
  // CÓDIGO ANTIGO MANTIDO PARA REFERÊNCIA (não executado)
  // ════════════════════════════════════════════════════════════════════════
  
  // Resolver tipo de flow desejado (DELIVERY, VENDAS, etc)
  const desiredType = await resolveDesiredFlowType(userId);
  
  // Verificar se usuário tem um flow definido
  let flow = await FlowStorage.loadFlow(userId);
  
  if (!flow) {
    console.log(`\n🔄 [shouldUseFlowEngine] User ${userId} não tem FlowDefinition`);
    console.log(`🔄 [shouldUseFlowEngine] Tentando criar automaticamente...`);
    
    // Tentar criar FlowDefinition a partir do prompt existente
    try {
      // Buscar prompt do agente
      const { data: agentConfig, error: agentError } = await supabase
        .from('ai_agent_config')
        .select('prompt, agent_name, business_type')
        .eq('user_id', userId)
        .single();
      
      if (agentError || !agentConfig?.prompt) {
        console.log(`🔄 [shouldUseFlowEngine] ⚠️ Sem prompt para criar flow`);
        return false;
      }
      
      console.log(`🔄 [shouldUseFlowEngine] Prompt encontrado (${agentConfig.prompt.length} chars)`);
      console.log(`🔄 [shouldUseFlowEngine] Tipo: ${agentConfig.business_type || 'não definido'}`);
      
      // Criar FlowDefinition a partir do prompt
      flow = await buildFlowFromPromptWithType(agentConfig.prompt, desiredType);
      
      // Ajustar nome do agente se disponível
      if (agentConfig.agent_name) {
        flow.agentName = agentConfig.agent_name;
      }
      
      // Salvar no banco
      const saved = await FlowStorage.saveFlow(userId, flow);
      
      if (saved) {
        console.log(`🔄 [shouldUseFlowEngine] ✅ FlowDefinition CRIADO automaticamente!`);
        console.log(`🔄 [shouldUseFlowEngine] Tipo: ${flow.type}`);
        console.log(`🔄 [shouldUseFlowEngine] Estados: ${Object.keys(flow.states).length}`);
        return true;
      } else {
        console.log(`🔄 [shouldUseFlowEngine] ❌ Erro ao salvar FlowDefinition`);
        return false;
      }
    } catch (err) {
      console.error(`🔄 [shouldUseFlowEngine] ❌ Erro ao criar flow:`, err);
      return false;
    }
  }
  
  if (flow.type !== desiredType) {
    console.log(`?? [shouldUseFlowEngine] Flow ${flow.type} difere de ${desiredType}, reconstruindo...`);
    try {
      const { data: agentConfig, error: agentError } = await supabase
        .from('agent_configs')
        .select('prompt, agent_name')
        .eq('user_id', userId)
        .single();

      if (agentError || !agentConfig?.prompt) {
        console.log(`?? [shouldUseFlowEngine] ?? Sem prompt para reconstruir flow`);
        return true;
      }

      const rebuilt = await buildFlowFromPromptWithType(agentConfig.prompt, desiredType);
      if (agentConfig.agent_name) {
        rebuilt.agentName = agentConfig.agent_name;
      }

      const saved = await FlowStorage.saveFlow(userId, rebuilt);
      if (saved) {
        console.log(`?? [shouldUseFlowEngine] ? Flow atualizado para ${desiredType}`);
      } else {
        console.log(`?? [shouldUseFlowEngine] ? Falha ao atualizar flow`);
      }
    } catch (err) {
      console.error(`?? [shouldUseFlowEngine] ? Erro ao atualizar flow:`, err);
    }
  }

  console.log(`✅ [shouldUseFlowEngine] RETORNANDO TRUE - FlowEngine ATIVO`);
  return true;
  */
}

/**
 * Processa mensagem usando FlowEngine
 * Chamado por generateAIResponse quando shouldUseFlowEngine = true
 */
export async function processWithFlowEngine(
  userId: string,
  conversationId: string,
  messageText: string,
  apiKey: string,
  options?: {
    contactName?: string;
    history?: { fromMe: boolean; text: string }[];
  }
): Promise<{
  text: string;
  mediaActions?: any[];
  usedFlow: boolean;
} | null> {
  
  // Usa modelo configurado no banco de dados via getLLMClient() interno
  const config: FlowConfig = {
    apiKey,
    model: undefined, // Sem hardcode - usa modelo do banco de dados
    humanize: true,
    temperature: 0.2
  };

  const engine = new UnifiedFlowEngine(config);
  
  const result = await engine.processMessage(
    userId,
    conversationId,
    messageText,
    {
      useAI: true,
      humanize: true,
      contactName: options?.contactName
    }
  );

  if (!result) {
    return null;
  }

  return {
    text: result.text,
    mediaActions: result.mediaActions,
    usedFlow: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractAgentName(text?: string): string | null {
  if (!text) return null;
  
  const patterns = [
    /(?:sou|me chamo|meu nome [ée])\s+([A-Za-záéíóúâêîôûãõç]+)/i,
    /(?:agente|atendente)\s+([A-Za-záéíóúâêîôûãõç]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 2) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    }
  }

  return null;
}

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || '0') + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

/**
 * Gera prompt de texto a partir de FlowDefinition
 * (Mantido para compatibilidade com sistema legado)
 */
function generatePromptFromFlow(
  flow: FlowDefinition,
  description?: string,
  additionalInfo?: string
): string {
  const lines: string[] = [];

  // Identidade
  lines.push(`Você é ${flow.agentName}, atendente virtual da ${flow.businessName}.`);
  if (flow.agentPersonality) {
    lines.push(`Personalidade: ${flow.agentPersonality}.`);
  }
  lines.push('');

  // Tipo de negócio
  if (flow.type === 'DELIVERY') {
    lines.push('TIPO: Delivery/Restaurante');
    lines.push('Você ajuda clientes a ver o cardápio, montar pedidos e finalizar compras.');
  } else if (flow.type === 'VENDAS') {
    lines.push('TIPO: Vendas/Comercial');
    lines.push('Você apresenta produtos/serviços, responde dúvidas e guia para fechamento.');
  } else if (flow.type === 'AGENDAMENTO') {
    lines.push('TIPO: Agendamento');
    lines.push('Você agenda horários, confirma disponibilidade e gerencia reservas.');
  } else if (flow.type === 'SUPORTE') {
    lines.push('TIPO: Suporte');
    lines.push('Você responde dúvidas frequentes e encaminha casos complexos.');
  }
  lines.push('');

  // Dados importantes
  if (flow.data) {
    lines.push('DADOS DO NEGÓCIO:');
    
    if (flow.data.prices) {
      if (flow.data.prices.standard) lines.push(`• Preço padrão: R$${flow.data.prices.standard}`);
      if (flow.data.prices.promo) lines.push(`• Preço promocional: R$${flow.data.prices.promo}`);
      if (flow.data.prices.implementation) lines.push(`• Implementação: R$${flow.data.prices.implementation}`);
    }
    
    if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
      for (const [key, coupon] of Object.entries(flow.data.coupons)) {
        lines.push(`• Cupom ${coupon.code}: ${coupon.discount}% de desconto`);
      }
    }
    
    if (flow.data.links) {
      if (flow.data.links.site) lines.push(`• Site: ${flow.data.links.site}`);
      if (flow.data.links.signup) lines.push(`• Cadastro: ${flow.data.links.signup}`);
    }
    
    lines.push('');
  }

  // Regras globais
  if (flow.globalRules && flow.globalRules.length > 0) {
    lines.push('REGRAS:');
    for (const rule of flow.globalRules.slice(0, 10)) {
      lines.push(`• ${rule}`);
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

async function resolveDesiredFlowType(userId: string): Promise<FlowType> {
  /**
   * PRIORIDADE DE FLUXOS:
   * 1. DELIVERY (https://agentezap.online/delivery-cardapio)
   * 2. PRODUTOS/VENDAS (https://agentezap.online/produtos)
   * 3. AGENDAMENTO (https://agentezap.online/agendamentos)
   * 4. CURSO (se implementado depois)
   * 5. GENERICO (fallback com fluxo invisível por trás)
   * 
   * IMPORTANTE: Quando NENHUM está ativo, usar GENERICO com fluxo por trás
   * IA INTERPRETA → FLUXO EXECUTA → IA HUMANIZA
   */

  // 1. Verificar DELIVERY
  try {
    const { data: deliveryConfigs, error: deliveryError } = await supabase
      .from('delivery_config')
      .select('is_active, send_to_ai')
      .eq('user_id', userId);

    const deliveryConfig = deliveryConfigs?.[0];
    console.log(`🔍 [resolveDesiredFlowType] DELIVERY check - is_active: ${deliveryConfig?.is_active}, send_to_ai: ${deliveryConfig?.send_to_ai}, error: ${deliveryError?.message || 'none'}, count: ${deliveryConfigs?.length || 0}`);

    // Verificar apenas se NÃO há erro e is_active é true
    if (!deliveryError && deliveryConfig?.is_active === true) {
      console.log(`📦 [resolveDesiredFlowType] → DELIVERY (ativo)`);
      return 'DELIVERY';
    }
  } catch (err: any) {
    console.log(`❌ [resolveDesiredFlowType] DELIVERY erro: ${err?.message || err}`);
  }

  // 2. Verificar PRODUTOS/VENDAS
  try {
    const { data: productsConfig } = await supabase
      .from('products_config')
      .select('is_active, send_to_ai')
      .eq('user_id', userId)
      .single();

    if (productsConfig?.is_active && productsConfig?.send_to_ai !== false) {
      console.log(`🛍️ [resolveDesiredFlowType] → VENDAS (ativo)`);
      return 'VENDAS';
    }
  } catch {
    // Sem config
  }

  // 3. Verificar AGENDAMENTO
  try {
    const { data: schedulingConfig } = await supabase
      .from('scheduling_config')
      .select('is_enabled')
      .eq('user_id', userId)
      .single();

    if (schedulingConfig?.is_enabled) {
      console.log(`📅 [resolveDesiredFlowType] → AGENDAMENTO (ativo)`);
      return 'AGENDAMENTO';
    }
  } catch {
    // Sem config
  }

  // 4. Verificar CURSO
  try {
    const { data: courseConfig } = await supabase
      .from('course_config')
      .select('is_active, send_to_ai')
      .eq('user_id', userId)
      .single();

    if (courseConfig?.is_active && courseConfig?.send_to_ai !== false) {
      console.log(`🎓 [resolveDesiredFlowType] → CURSO (ativo)`);
      return 'CURSO';
    }
  } catch {
    // Sem config
  }

  // 5. FALLBACK: GENERICO com fluxo invisível por trás
  // Mesmo quando NENHUM módulo está ativo, o sistema executa um fluxo determinístico
  console.log(`🤖 [resolveDesiredFlowType] → GENERICO (fallback com fluxo invisível)`);
  return 'GENERICO';
}

function buildFlowFromPromptWithType(prompt: string, flowType: FlowType, mistralApiKey?: string): FlowDefinition {
  const analyzer = new PromptAnalyzer();
  const builder = new FlowBuilder(undefined, mistralApiKey);

  const agentName = analyzer.extractAgentName(prompt) || 'Assistente';
  const businessName = analyzer.extractBusinessName(prompt) || 'Empresa';
  const personality = analyzer.extractPersonality(prompt) || 'amigavel e profissional';

  let flow: FlowDefinition;
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

export async function buildFlowForUserPrompt(userId: string, prompt: string): Promise<FlowDefinition> {
  const desiredType = await resolveDesiredFlowType(userId);
  return buildFlowFromPromptWithType(prompt, desiredType);
}

// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  FlowBuilder,
  FlowDefinition,
  UnifiedFlowEngine,
  FlowStorage
};
