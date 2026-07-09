/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 CHATBOT FLOW GENERATOR - Gerador de Fluxos para Chatbots Genéricos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este módulo gera FlowDefinitions automaticamente a partir do prompt do agente.
 * É usado quando:
 * - Delivery está desativado (modo menu-only ou sem delivery)
 * - Agente é do tipo genérico/vendas/suporte
 * - Novo cliente se cadastra (auto-gera fluxo)
 *
 * ARQUITETURA:
 * - IA INTERPRETA: Entende o que o cliente quer (qualquer forma de falar)
 * - SISTEMA EXECUTA: Busca respostas do fluxo determinístico
 * - IA HUMANIZA: Torna a resposta natural e anti-bloqueio
 *
 * O NÚCLEO É DETERMINÍSTICO - A IA só interpreta entrada e humaniza saída!
 */

import type { FlowDefinition, FlowState, FlowIntent, FlowAction, FlowType, FlowData } from "./FlowBuilder";
import { PromptAnalyzer } from "./FlowBuilder";
import { supabase } from "./supabaseAuth";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatbotConfig {
  agentName: string;
  businessName: string;
  personality: string;
  greeting?: string;
  faq?: Array<{ question: string; answer: string; keywords: string[] }>;
  products?: Array<{ name: string; description: string; price: number }>;
  services?: Array<{ name: string; description: string; price?: number }>;
  contactInfo?: {
    phone?: string;
    email?: string;
    address?: string;
    hours?: string;
  };
  customResponses?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 INTENT DEFINITIONS - Intenções base para chatbots
// ═══════════════════════════════════════════════════════════════════════════

const BASE_INTENTS: Record<string, FlowIntent> = {
  GREETING: {
    name: 'GREETING',
    examples: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'eae', 'hey'],
    patterns: ['^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|eae|hey|hi|hello)[!?,.]?$'],
    priority: 100
  },
  FAREWELL: {
    name: 'FAREWELL',
    examples: ['tchau', 'até mais', 'adeus', 'flw', 'falou', 'bye'],
    patterns: ['^(tchau|at[eé] mais|adeus|flw|falou|bye)'],
    priority: 100
  },
  THANKS: {
    name: 'THANKS',
    examples: ['obrigado', 'obrigada', 'valeu', 'thanks', 'vlw'],
    patterns: ['^(obrigad[oa]|valeu|thanks|vlw|brigadao)'],
    priority: 100
  },
  ASK_PRICE: {
    name: 'ASK_PRICE',
    examples: ['quanto custa', 'qual o preço', 'qual o valor', 'preço', 'valor'],
    patterns: ['(quanto|qual).*(custa|pre[çc]o|valor)', '^pre[çc]o', '^valor'],
    entities: ['product', 'service'],
    priority: 80
  },
  ASK_INFO: {
    name: 'ASK_INFO',
    examples: ['como funciona', 'me explica', 'o que é', 'como faz'],
    patterns: ['como funciona', 'me explica', 'o que [eé]', 'como (faz|faço)'],
    priority: 70
  },
  ASK_HOURS: {
    name: 'ASK_HOURS',
    examples: ['horário de funcionamento', 'que horas abre', 'que horas fecha', 'está aberto'],
    patterns: ['hor[aá]rio', 'funciona', 'abre', 'fecha', 'aberto'],
    priority: 75
  },
  ASK_LOCATION: {
    name: 'ASK_LOCATION',
    examples: ['onde fica', 'endereço', 'localização', 'como chegar'],
    patterns: ['onde fica', 'endere[çc]o', 'localiza[çc][aã]o', 'como cheg'],
    priority: 75
  },
  ASK_CONTACT: {
    name: 'ASK_CONTACT',
    examples: ['telefone', 'email', 'contato', 'whatsapp'],
    patterns: ['telefone', 'email', 'contato', 'whatsapp', 'liga'],
    priority: 75
  },
  WANT_PRODUCT: {
    name: 'WANT_PRODUCT',
    examples: ['quero comprar', 'me interessa', 'quero saber mais', 'tenho interesse'],
    patterns: ['quero (comprar|saber|ver)', 'me interessa', 'tenho interesse'],
    entities: ['product'],
    priority: 85
  },
  WANT_SERVICE: {
    name: 'WANT_SERVICE',
    examples: ['quero agendar', 'quero contratar', 'preciso de', 'gostaria de'],
    patterns: ['quero (agendar|contratar)', 'preciso de', 'gostaria de'],
    entities: ['service'],
    priority: 85
  },
  ASK_HELP: {
    name: 'ASK_HELP',
    examples: ['ajuda', 'help', 'não entendi', 'como funciona'],
    patterns: ['^(ajuda|help)', 'n[aã]o entendi', 'como funciona'],
    priority: 60
  },
  COMPLAIN: {
    name: 'COMPLAIN',
    examples: ['reclamação', 'problema', 'insatisfeito', 'ruim'],
    patterns: ['reclama[çc][aã]o', 'problema', 'insatisfeit', 'ruim', 'p[eé]ssimo'],
    priority: 90
  },
  POSITIVE_FEEDBACK: {
    name: 'POSITIVE_FEEDBACK',
    examples: ['muito bom', 'excelente', 'ótimo', 'adorei'],
    patterns: ['muito bom', 'excelente', '[oó]timo', 'adorei', 'parab[eé]ns'],
    priority: 50
  },
  OTHER: {
    name: 'OTHER',
    examples: [],
    patterns: [],
    priority: 0
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📝 ACTION TEMPLATES - Templates de resposta base
// ═══════════════════════════════════════════════════════════════════════════

const BASE_ACTIONS: Record<string, FlowAction> = {
  GREET: {
    name: 'GREET',
    type: 'RESPONSE',
    template: 'Olá! Sou {agent_name} da {business_name}. Como posso te ajudar hoje?',
    variables: ['agent_name', 'business_name']
  },
  FAREWELL_RESPONSE: {
    name: 'FAREWELL_RESPONSE',
    type: 'RESPONSE',
    template: 'Até mais! Foi um prazer atender você. Qualquer coisa é só chamar!',
    variables: []
  },
  THANKS_RESPONSE: {
    name: 'THANKS_RESPONSE',
    type: 'RESPONSE',
    template: 'Por nada! Fico feliz em ajudar. Precisa de mais alguma coisa?',
    variables: []
  },
  SHOW_PRICES: {
    name: 'SHOW_PRICES',
    type: 'DATA',
    dataSource: 'prices',
    template: '{prices_formatted}\n\nPosso te ajudar com mais informações?',
    variables: ['prices_formatted']
  },
  SHOW_INFO: {
    name: 'SHOW_INFO',
    type: 'RESPONSE',
    template: '{business_description}\n\nPosso te ajudar com mais alguma coisa?',
    variables: ['business_description']
  },
  SHOW_HOURS: {
    name: 'SHOW_HOURS',
    type: 'DATA',
    dataSource: 'hours',
    template: 'Nosso horário de funcionamento:\n{hours}',
    variables: ['hours']
  },
  SHOW_LOCATION: {
    name: 'SHOW_LOCATION',
    type: 'DATA',
    dataSource: 'location',
    template: 'Nosso endereço:\n{address}',
    variables: ['address']
  },
  SHOW_CONTACT: {
    name: 'SHOW_CONTACT',
    type: 'DATA',
    dataSource: 'contact',
    template: 'Nossos contatos:\n{contact_info}',
    variables: ['contact_info']
  },
  SHOW_PRODUCTS: {
    name: 'SHOW_PRODUCTS',
    type: 'DATA',
    dataSource: 'products',
    template: 'Nossos produtos/serviços:\n{products_formatted}\n\nQual te interessa?',
    variables: ['products_formatted']
  },
  HANDLE_INTEREST: {
    name: 'HANDLE_INTEREST',
    type: 'RESPONSE',
    template: 'Que ótimo que você tem interesse! Vou te explicar mais sobre {product}...',
    variables: ['product']
  },
  SHOW_HELP: {
    name: 'SHOW_HELP',
    type: 'RESPONSE',
    template: 'Posso te ajudar com:\n• Informações sobre nossos produtos/serviços\n• Preços e valores\n• Horário de funcionamento\n• Endereço e contato\n\nO que você precisa?',
    variables: []
  },
  HANDLE_COMPLAINT: {
    name: 'HANDLE_COMPLAINT',
    type: 'RESPONSE',
    template: 'Sinto muito por qualquer inconveniente! Sua satisfação é muito importante para nós. Pode me contar mais detalhes para que eu possa ajudar?',
    variables: []
  },
  HANDLE_POSITIVE: {
    name: 'HANDLE_POSITIVE',
    type: 'RESPONSE',
    template: 'Muito obrigado pelo feedback positivo! Ficamos felizes em saber que você está satisfeito(a)!',
    variables: []
  },
  DEFAULT_RESPONSE: {
    name: 'DEFAULT_RESPONSE',
    type: 'RESPONSE',
    template: 'Entendi! Como posso te ajudar com isso?',
    variables: []
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ CHATBOT FLOW GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export class ChatbotFlowGenerator {
  private analyzer: PromptAnalyzer;

  constructor() {
    this.analyzer = new PromptAnalyzer();
  }

  /**
   * Gera FlowDefinition a partir do prompt do agente
   */
  generateFromPrompt(prompt: string, userId?: string): FlowDefinition {
    console.log('[ChatbotFlowGenerator] Gerando fluxo a partir do prompt...');

    // Extrair informações do prompt
    const agentName = this.analyzer.extractAgentName(prompt);
    const businessName = this.analyzer.extractBusinessName(prompt);
    const personality = this.analyzer.extractPersonality(prompt);
    const prices = this.analyzer.extractPrices(prompt);
    const links = this.analyzer.extractLinks(prompt);
    const globalRules = this.analyzer.extractGlobalRules(prompt);

    // Detectar tipo de fluxo
    const flowType = this.analyzer.detectFlowType(prompt);

    console.log(`[ChatbotFlowGenerator] Agente: ${agentName}, Negócio: ${businessName}, Tipo: ${flowType}`);

    // Gerar configuração
    const config: ChatbotConfig = {
      agentName,
      businessName,
      personality,
    };

    // Extrair FAQ do prompt (linhas com "P:" ou "R:" ou padrões de pergunta/resposta)
    const faq = this.extractFAQFromPrompt(prompt);
    if (faq.length > 0) {
      config.faq = faq;
    }

    return this.generate(config, flowType, {
      prices,
      links,
      globalRules,
      sourcePrompt: prompt
    });
  }

  /**
   * Gera FlowDefinition a partir de configuração
   */
  generate(
    config: ChatbotConfig,
    flowType: FlowType = 'GENERICO',
    extras?: {
      prices?: Record<string, number>;
      links?: Record<string, string>;
      globalRules?: string[];
      sourcePrompt?: string;
    }
  ): FlowDefinition {
    const flowId = `chatbot_${Date.now()}`;

    // Criar estados base
    const states = this.createBaseStates(config);

    // Adicionar estados específicos se houver FAQ
    if (config.faq && config.faq.length > 0) {
      this.addFAQStates(states, config.faq);
    }

    // Criar intents com FAQ customizado
    const intents = this.createIntents(config);

    // Criar actions customizadas
    const actions = this.createActions(config);

    // Criar dados do fluxo
    const data: FlowData = {
      prices: extras?.prices,
      links: extras?.links,
      faq: config.faq,
    };

    const flow: FlowDefinition = {
      id: flowId,
      version: '1.0.0',
      type: flowType,
      businessName: config.businessName,
      businessDescription: config.greeting,
      agentName: config.agentName,
      agentPersonality: config.personality,
      initialState: 'START',
      finalStates: ['END'],
      states,
      intents,
      actions,
      data,
      globalRules: extras?.globalRules || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      sourcePrompt: extras?.sourcePrompt
    };

    console.log(`[ChatbotFlowGenerator] Fluxo gerado: ${Object.keys(states).length} estados, ${Object.keys(intents).length} intents`);

    return flow;
  }

  /**
   * Cria estados base do chatbot
   */
  private createBaseStates(config: ChatbotConfig): Record<string, FlowState> {
    return {
      START: {
        name: 'Início',
        description: 'Estado inicial do fluxo',
        transitions: [
          { intent: 'GREETING', nextState: 'ACTIVE', action: 'GREET' },
          { intent: 'ASK_PRICE', nextState: 'ACTIVE', action: 'SHOW_PRICES' },
          { intent: 'ASK_INFO', nextState: 'ACTIVE', action: 'SHOW_INFO' },
          { intent: 'ASK_HOURS', nextState: 'ACTIVE', action: 'SHOW_HOURS' },
          { intent: 'ASK_LOCATION', nextState: 'ACTIVE', action: 'SHOW_LOCATION' },
          { intent: 'ASK_CONTACT', nextState: 'ACTIVE', action: 'SHOW_CONTACT' },
          { intent: 'WANT_PRODUCT', nextState: 'ACTIVE', action: 'SHOW_PRODUCTS' },
          { intent: 'WANT_SERVICE', nextState: 'ACTIVE', action: 'SHOW_PRODUCTS' },
          { intent: 'ASK_HELP', nextState: 'ACTIVE', action: 'SHOW_HELP' },
          { intent: 'COMPLAIN', nextState: 'ACTIVE', action: 'HANDLE_COMPLAINT' },
          { intent: 'OTHER', nextState: 'ACTIVE', action: 'GREET' }
        ]
      },
      ACTIVE: {
        name: 'Conversa Ativa',
        description: 'Estado principal de conversa',
        transitions: [
          { intent: 'GREETING', nextState: 'ACTIVE', action: 'GREET' },
          { intent: 'FAREWELL', nextState: 'END', action: 'FAREWELL_RESPONSE' },
          { intent: 'THANKS', nextState: 'ACTIVE', action: 'THANKS_RESPONSE' },
          { intent: 'ASK_PRICE', nextState: 'ACTIVE', action: 'SHOW_PRICES' },
          { intent: 'ASK_INFO', nextState: 'ACTIVE', action: 'SHOW_INFO' },
          { intent: 'ASK_HOURS', nextState: 'ACTIVE', action: 'SHOW_HOURS' },
          { intent: 'ASK_LOCATION', nextState: 'ACTIVE', action: 'SHOW_LOCATION' },
          { intent: 'ASK_CONTACT', nextState: 'ACTIVE', action: 'SHOW_CONTACT' },
          { intent: 'WANT_PRODUCT', nextState: 'ACTIVE', action: 'HANDLE_INTEREST' },
          { intent: 'WANT_SERVICE', nextState: 'ACTIVE', action: 'HANDLE_INTEREST' },
          { intent: 'ASK_HELP', nextState: 'ACTIVE', action: 'SHOW_HELP' },
          { intent: 'COMPLAIN', nextState: 'ACTIVE', action: 'HANDLE_COMPLAINT' },
          { intent: 'POSITIVE_FEEDBACK', nextState: 'ACTIVE', action: 'HANDLE_POSITIVE' },
          { intent: 'OTHER', nextState: 'ACTIVE', action: 'DEFAULT_RESPONSE' }
        ]
      },
      END: {
        name: 'Fim',
        description: 'Estado final do fluxo',
        transitions: [
          { intent: 'GREETING', nextState: 'ACTIVE', action: 'GREET' },
          { intent: 'OTHER', nextState: 'ACTIVE', action: 'GREET' }
        ]
      }
    };
  }

  /**
   * Adiciona estados de FAQ ao fluxo
   */
  private addFAQStates(
    states: Record<string, FlowState>,
    faq: Array<{ question: string; answer: string; keywords: string[] }>
  ): void {
    // Adicionar transições de FAQ ao estado ACTIVE
    for (let i = 0; i < faq.length; i++) {
      const faqItem = faq[i];
      const intentName = `FAQ_${i}`;

      states.ACTIVE.transitions.unshift({
        intent: intentName,
        nextState: 'ACTIVE',
        action: `FAQ_RESPONSE_${i}`
      });
    }
  }

  /**
   * Cria intents incluindo FAQ customizado
   */
  private createIntents(config: ChatbotConfig): Record<string, FlowIntent> {
    const intents = { ...BASE_INTENTS };

    // Adicionar intents de FAQ
    if (config.faq) {
      for (let i = 0; i < config.faq.length; i++) {
        const faqItem = config.faq[i];
        intents[`FAQ_${i}`] = {
          name: `FAQ_${i}`,
          examples: [faqItem.question, ...faqItem.keywords],
          patterns: faqItem.keywords.map(kw => kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          priority: 95 // Alta prioridade para FAQ específico
        };
      }
    }

    // Adicionar intents customizados se houver
    if (config.customResponses) {
      let customIdx = 0;
      for (const trigger of Object.keys(config.customResponses)) {
        intents[`CUSTOM_${customIdx}`] = {
          name: `CUSTOM_${customIdx}`,
          examples: [trigger],
          patterns: [trigger.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')],
          priority: 90
        };
        customIdx++;
      }
    }

    return intents;
  }

  /**
   * Cria actions incluindo respostas customizadas
   */
  private createActions(config: ChatbotConfig): Record<string, FlowAction> {
    const actions = { ...BASE_ACTIONS };

    // Personalizar ação de saudação
    if (config.greeting) {
      actions.GREET.template = config.greeting;
    } else {
      actions.GREET.template = `Olá! Sou ${config.agentName} da ${config.businessName}. Como posso te ajudar hoje?`;
    }

    // Adicionar ações de FAQ
    if (config.faq) {
      for (let i = 0; i < config.faq.length; i++) {
        const faqItem = config.faq[i];
        actions[`FAQ_RESPONSE_${i}`] = {
          name: `FAQ_RESPONSE_${i}`,
          type: 'RESPONSE',
          template: faqItem.answer,
          variables: []
        };
      }
    }

    // Adicionar ações de respostas customizadas
    if (config.customResponses) {
      let customIdx = 0;
      for (const [trigger, response] of Object.entries(config.customResponses)) {
        actions[`CUSTOM_RESPONSE_${customIdx}`] = {
          name: `CUSTOM_RESPONSE_${customIdx}`,
          type: 'RESPONSE',
          template: response,
          variables: []
        };
        customIdx++;
      }
    }

    return actions;
  }

  /**
   * Extrai FAQ do prompt (padrões de pergunta/resposta)
   */
  private extractFAQFromPrompt(prompt: string): Array<{ question: string; answer: string; keywords: string[] }> {
    const faq: Array<{ question: string; answer: string; keywords: string[] }> = [];

    // Padrões para detectar Q&A no prompt
    const qaPatterns = [
      // Padrão: "P: pergunta R: resposta"
      /P:\s*(.+?)\s*R:\s*(.+?)(?=P:|$)/gis,
      // Padrão: "Pergunta: X Resposta: Y"
      /Pergunta:\s*(.+?)\s*Resposta:\s*(.+?)(?=Pergunta:|$)/gis,
      // Padrão: "- X? → Y" ou "- X? -> Y"
      /-\s*(.+?\?)\s*(?:→|->)\s*(.+?)(?=-|$)/gis,
      // Padrão: "Quando cliente perguntar X, responda Y"
      /quando.*?perguntar\s*[""'](.+?)[""']\s*,?\s*respond[ae]\s*[""'](.+?)[""']/gis,
    ];

    for (const pattern of qaPatterns) {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        const question = match[1].trim();
        const answer = match[2].trim();

        if (question.length > 5 && answer.length > 5) {
          // Extrair palavras-chave da pergunta
          const keywords = question
            .toLowerCase()
            .replace(/[?!.,]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3);

          faq.push({ question, answer, keywords });
        }
      }
    }

    return faq;
  }

  /**
   * Atualiza FlowDefinition existente com novo prompt
   */
  updateFromPrompt(existingFlow: FlowDefinition, newPrompt: string): FlowDefinition {
    console.log('[ChatbotFlowGenerator] Atualizando fluxo com novo prompt...');

    // Extrair novas informações
    const newAgentName = this.analyzer.extractAgentName(newPrompt);
    const newBusinessName = this.analyzer.extractBusinessName(newPrompt);
    const newPersonality = this.analyzer.extractPersonality(newPrompt);
    const newPrices = this.analyzer.extractPrices(newPrompt);
    const newLinks = this.analyzer.extractLinks(newPrompt);
    const newRules = this.analyzer.extractGlobalRules(newPrompt);
    const newFaq = this.extractFAQFromPrompt(newPrompt);

    // Atualizar dados básicos
    const updatedFlow = { ...existingFlow };

    if (newAgentName !== 'Atendente') {
      updatedFlow.agentName = newAgentName;
    }
    if (newBusinessName !== 'Meu Negócio') {
      updatedFlow.businessName = newBusinessName;
    }
    if (newPersonality !== 'profissional e amigável') {
      updatedFlow.agentPersonality = newPersonality;
    }

    // Mesclar preços
    if (Object.keys(newPrices).length > 0) {
      updatedFlow.data = {
        ...updatedFlow.data,
        prices: { ...updatedFlow.data?.prices, ...newPrices }
      };
    }

    // Mesclar links
    if (Object.keys(newLinks).length > 0) {
      updatedFlow.data = {
        ...updatedFlow.data,
        links: { ...updatedFlow.data?.links, ...newLinks }
      };
    }

    // Adicionar novas regras
    if (newRules.length > 0) {
      const existingRules = new Set(updatedFlow.globalRules);
      for (const rule of newRules) {
        if (!existingRules.has(rule)) {
          updatedFlow.globalRules.push(rule);
        }
      }
    }

    // Adicionar novo FAQ
    if (newFaq.length > 0) {
      // Criar novos intents e actions para FAQ
      for (let i = 0; i < newFaq.length; i++) {
        const faqItem = newFaq[i];
        const baseIdx = Object.keys(updatedFlow.intents).filter(k => k.startsWith('FAQ_')).length;
        const intentName = `FAQ_${baseIdx + i}`;
        const actionName = `FAQ_RESPONSE_${baseIdx + i}`;

        updatedFlow.intents[intentName] = {
          name: intentName,
          examples: [faqItem.question, ...faqItem.keywords],
          patterns: faqItem.keywords.map(kw => kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          priority: 95
        };

        updatedFlow.actions[actionName] = {
          name: actionName,
          type: 'RESPONSE',
          template: faqItem.answer,
          variables: []
        };

        // Adicionar transição
        if (updatedFlow.states.ACTIVE) {
          updatedFlow.states.ACTIVE.transitions.unshift({
            intent: intentName,
            nextState: 'ACTIVE',
            action: actionName
          });
        }
      }

      // Atualizar lista de FAQ nos dados
      updatedFlow.data = {
        ...updatedFlow.data,
        faq: [...(updatedFlow.data?.faq || []), ...newFaq]
      };
    }

    // Atualizar versão e timestamp
    const versionParts = updatedFlow.version.split('.');
    versionParts[2] = String(parseInt(versionParts[2] || '0') + 1);
    updatedFlow.version = versionParts.join('.');
    updatedFlow.updatedAt = new Date();
    updatedFlow.sourcePrompt = newPrompt;

    console.log(`[ChatbotFlowGenerator] Fluxo atualizado: v${updatedFlow.version}`);

    return updatedFlow;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 FUNÇÕES DE INTEGRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gera e salva FlowDefinition automaticamente ao criar agente
 */
export async function generateAndSaveFlowOnAgentCreate(
  userId: string,
  prompt: string,
  agentName?: string,
  businessName?: string
): Promise<FlowDefinition | null> {
  try {
    console.log(`[generateAndSaveFlowOnAgentCreate] Gerando fluxo para user ${userId}`);

    const generator = new ChatbotFlowGenerator();
    let flow = generator.generateFromPrompt(prompt);

    // Sobrescrever nome se fornecido
    if (agentName) flow.agentName = agentName;
    if (businessName) flow.businessName = businessName;

    // Salvar no banco
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
      console.error(`[generateAndSaveFlowOnAgentCreate] Erro ao salvar:`, error);
      return null;
    }

    console.log(`[generateAndSaveFlowOnAgentCreate] Fluxo salvo com sucesso: ${flow.id}`);
    return flow;
  } catch (err) {
    console.error(`[generateAndSaveFlowOnAgentCreate] Erro:`, err);
    return null;
  }
}

/**
 * Atualiza FlowDefinition quando prompt é editado
 */
export async function updateFlowOnPromptEdit(
  userId: string,
  newPrompt: string
): Promise<{ updated: boolean; flow?: FlowDefinition }> {
  try {
    console.log(`[updateFlowOnPromptEdit] Atualizando fluxo para user ${userId}`);

    // Carregar fluxo existente
    const { data: existing, error: loadError } = await supabase
      .from('agent_flows')
      .select('flow_definition')
      .eq('user_id', userId)
      .single();

    const generator = new ChatbotFlowGenerator();
    let updatedFlow: FlowDefinition;

    if (loadError || !existing?.flow_definition) {
      // Não existe fluxo, criar novo
      console.log(`[updateFlowOnPromptEdit] Fluxo não encontrado, criando novo...`);
      updatedFlow = generator.generateFromPrompt(newPrompt);
    } else {
      // Atualizar fluxo existente
      updatedFlow = generator.updateFromPrompt(
        existing.flow_definition as FlowDefinition,
        newPrompt
      );
    }

    // Salvar
    const { error: saveError } = await supabase
      .from('agent_flows')
      .upsert({
        user_id: userId,
        flow_id: updatedFlow.id,
        flow_type: updatedFlow.type,
        flow_definition: updatedFlow,
        business_name: updatedFlow.businessName,
        agent_name: updatedFlow.agentName,
        version: updatedFlow.version,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (saveError) {
      console.error(`[updateFlowOnPromptEdit] Erro ao salvar:`, saveError);
      return { updated: false };
    }

    console.log(`[updateFlowOnPromptEdit] Fluxo atualizado: v${updatedFlow.version}`);
    return { updated: true, flow: updatedFlow };
  } catch (err) {
    console.error(`[updateFlowOnPromptEdit] Erro:`, err);
    return { updated: false };
  }
}

export default ChatbotFlowGenerator;
