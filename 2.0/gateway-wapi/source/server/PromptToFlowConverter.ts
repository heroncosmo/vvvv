/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🔄 PROMPT TO FLOW CONVERTER - Converte Prompts em Fluxos Determinísticos
 * ═══════════════════════════════════════════════════════════════════════
 *
 * OBJETIVO:
 * Pegar QUALQUER prompt de agente e transformar em um fluxo determinístico
 * que garante respostas consistentes sem depender da IA para decisões.
 *
 * ESTRATÉGIA:
 * 1. Analisar o prompt e extrair informações-chave
 * 2. Determinar tipo de negócio (delivery, vendas, agendamento, genérico)
 * 3. Criar estados do fluxo baseados no tipo de negócio
 * 4. Extrair regras, preços, links, etc do prompt
 * 5. Gerar FlowDefinition completo e funcional
 *
 * FUNCIONA PARA QUALQUER NEGÓCIO!
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { FlowDefinition, FlowState, FlowType } from "./DeterministicFlowEngine";

export class PromptToFlowConverter {

  /**
   * Converte um prompt em FlowDefinition
   */
  async convertPromptToFlow(
    prompt: string,
    userId: string,
    options?: {
      flowType?: FlowType;  // Se não especificado, será detectado automaticamente
      agentName?: string;
      businessName?: string;
    }
  ): Promise<FlowDefinition> {

    console.log(`\n🔄 [PromptToFlow] Convertendo prompt para fluxo determin\u00edstico`);
    console.log(`   Usuário: ${userId}`);
    console.log(`   Tamanho do prompt: ${prompt.length} caracteres`);

    // 1. Detectar tipo de negócio
    const flowType = options?.flowType || this.detectBusinessType(prompt);
    console.log(`   📊 Tipo detectado: ${flowType}`);

    // 2. Extrair informações do prompt
    const agentName = options?.agentName || this.extractAgentName(prompt) || 'Assistente';
    const businessName = options?.businessName || this.extractBusinessName(prompt) || 'Empresa';
    const personality = this.extractPersonality(prompt);
    const businessData = this.extractBusinessData(prompt);
    const globalRules = this.extractGlobalRules(prompt);

    console.log(`   👤 Agente: ${agentName}`);
    console.log(`   🏢 Negócio: ${businessName}`);
    console.log(`   🎭 Personalidade: ${personality}`);

    // 3. Criar estados do fluxo baseado no tipo de negócio
    const states = this.createStatesForBusinessType(flowType, businessName, agentName);

    console.log(`   🔀 Estados criados: ${Object.keys(states).length}`);

    // 4. Montar FlowDefinition
    const flowDefinition: FlowDefinition = {
      id: crypto.randomUUID(),
      userId,
      flowType,
      agentName,
      businessName,
      agentPersonality: personality,
      states,
      initialState: 'start',
      businessData,
      globalRules,
      version: '1.0.0',
      sourcePrompt: prompt,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`🔄 [PromptToFlow] ✅ Conversão concluída!`);
    console.log(`   Estados: ${Object.keys(states).join(', ')}\n`);

    return flowDefinition;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DETECÇÃO DE TIPO DE NEGÓCIO
  // ═══════════════════════════════════════════════════════════════════════

  private detectBusinessType(prompt: string): FlowType {
    const lower = prompt.toLowerCase();

    // Delivery
    if (/(delivery|restaurante|comida|cardápio|pedido|entrega|lanche|pizza|hamburguer)/i.test(lower)) {
      return 'DELIVERY';
    }

    // Agendamento
    if (/(agendar|horário|consulta|reserva|disponibilidade|marcar|calendario)/i.test(lower)) {
      return 'AGENDAMENTO';
    }

    // Vendas/Catálogo
    if (/(produto|venda|catálogo|compra|estoque|preço|item|loja)/i.test(lower)) {
      return 'VENDAS';
    }

    // Suporte
    if (/(suporte|ajuda|dúvida|problema|faq|atendimento|questão)/i.test(lower)) {
      return 'SUPORTE';
    }

    // Curso
    if (/(curso|aula|módulo|treinamento|ensino|aprendizado|lição)/i.test(lower)) {
      return 'CURSO';
    }

    // Genérico (fallback)
    return 'GENERICO';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXTRAÇÃO DE INFORMAÇÕES DO PROMPT
  // ═══════════════════════════════════════════════════════════════════════

  private extractAgentName(prompt: string): string | null {
    const patterns = [
      /(?:sou|me chamo|meu nome [ée]|chamar de)\s+([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)/i,
      /(?:agente|atendente|assistente)\s+([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1] && match[1].length > 2) {
        const name = match[1].trim();
        // Ignorar palavras comuns
        if (!['virtual', 'da', 'do', 'de', 'para', 'com'].includes(name.toLowerCase())) {
          return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        }
      }
    }

    return null;
  }

  private extractBusinessName(prompt: string): string | null {
    const patterns = [
      /(?:empresa|negócio|loja|restaurante)\s+(?:chamada?|é|:)?\s*([A-Za-z0-9áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]+)/i,
      /(?:da|do)\s+([A-Za-z0-9áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]+)(?:\.|,|$)/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1] && match[1].trim().length > 2) {
        const name = match[1].trim().split(/\s+/).slice(0, 3).join(' ');  // Max 3 palavras
        return name;
      }
    }

    return null;
  }

  private extractPersonality(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (/(formal|profissional|corporativo|sério)/i.test(lower)) {
      return 'formal e profissional';
    }

    if (/(informal|descontraído|amigável|divertido|leve)/i.test(lower)) {
      return 'informal e amigável';
    }

    if (/(direto|objetivo|prático|rápido)/i.test(lower)) {
      return 'direto e objetivo';
    }

    if (/(empático|cuidadoso|atencioso|carinhoso)/i.test(lower)) {
      return 'empático e atencioso';
    }

    return 'amigável e profissional';
  }

  private extractBusinessData(prompt: string): Record<string, any> {
    const data: Record<string, any> = {};

    // Extrair preços
    const priceMatches = prompt.match(/(?:pre[çc]o|valor|custa|por)\s*:?\s*r?\$?\s*(\d+(?:[,.]\d{2})?)/gi);
    if (priceMatches && priceMatches.length > 0) {
      data.prices = {};
      priceMatches.forEach((match, idx) => {
        const priceMatch = match.match(/(\d+(?:[,.]\d{2})?)/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(',', '.'));
          if (idx === 0) {
            data.prices.standard = price;
          } else {
            data.prices[`price_${idx}`] = price;
          }
        }
      });
    }

    // Extrair links
    const linkMatches = prompt.match(/(https?:\/\/[^\s]+)/gi);
    if (linkMatches && linkMatches.length > 0) {
      data.links = {};
      linkMatches.forEach((link, idx) => {
        if (idx === 0) {
          data.links.site = link;
        } else {
          data.links[`link_${idx}`] = link;
        }
      });
    }

    // Extrair cupons
    const couponMatch = prompt.match(/cupom\s*(?:de\s*desconto)?\s*:?\s*([A-Z0-9_-]+)/i);
    if (couponMatch) {
      const discountMatch = prompt.match(/(\d+)\s*%/);
      const discount = discountMatch ? parseInt(discountMatch[1]) : 10;

      data.coupons = {
        [couponMatch[1].toUpperCase()]: {
          code: couponMatch[1].toUpperCase(),
          discount
        }
      };
    }

    // Extrair horário de funcionamento
    const scheduleMatch = prompt.match(/(?:horário|funcionamento|aberto).*?(\d{1,2}(?:h|:)\d{2}).*?(?:às?|até).*?(\d{1,2}(?:h|:)\d{2})/i);
    if (scheduleMatch) {
      data.schedule = {
        open: scheduleMatch[1],
        close: scheduleMatch[2]
      };
    }

    return data;
  }

  private extractGlobalRules(prompt: string): string[] {
    const rules: string[] = [];

    // Buscar por linhas que começam com regras explícitas
    const lines = prompt.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Regras que começam com marcadores
      if (/^[-•*]\s+/.test(trimmed)) {
        const rule = trimmed.replace(/^[-•*]\s+/, '').trim();
        if (rule.length > 10 && rule.length < 200) {
          rules.push(rule);
        }
      }

      // Regras com "sempre" ou "nunca"
      if (/(sempre|nunca|jamais|não|evite)/i.test(trimmed) && trimmed.length > 20) {
        rules.push(trimmed);
      }
    }

    // Limitar a 10 regras mais relevantes
    return rules.slice(0, 10);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRIAÇÃO DE ESTADOS BASEADO NO TIPO DE NEGÓCIO
  // ═══════════════════════════════════════════════════════════════════════

  private createStatesForBusinessType(
    flowType: FlowType,
    businessName: string,
    agentName: string
  ): Record<string, FlowState> {

    switch (flowType) {
      case 'DELIVERY':
        return this.createDeliveryStates(businessName, agentName);
      case 'VENDAS':
        return this.createVendasStates(businessName, agentName);
      case 'AGENDAMENTO':
        return this.createAgendamentoStates(businessName, agentName);
      case 'SUPORTE':
        return this.createSuporteStates(businessName, agentName);
      case 'CURSO':
        return this.createCursoStates(businessName, agentName);
      case 'GENERICO':
      default:
        return this.createGenericoStates(businessName, agentName);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // DELIVERY
  // ─────────────────────────────────────────────────────────────────────

  private createDeliveryStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} da ${businessName}! 😊\n\nComo posso ajudar você hoje?\n\n1️⃣ Ver cardápio\n2️⃣ Fazer pedido\n3️⃣ Falar com atendente`,
        nextStates: {
          'cardápio': 'show_menu',
          'menu': 'show_menu',
          '1': 'show_menu',
          'pedido': 'take_order',
          'pedir': 'take_order',
          '2': 'take_order',
          'atendente': 'transfer_human',
          '3': 'transfer_human',
          'greeting': 'start'
        },
        defaultNext: 'show_menu'
      },
      show_menu: {
        id: 'show_menu',
        name: 'Mostrar Cardápio',
        type: 'info',
        message: `Aqui está nosso cardápio! 📋\n\n{{menu_display}}\n\nO que você gostaria de pedir?`,
        nextStates: {
          'product_inquiry': 'take_order',
          'price': 'show_product_price',
          'purchase': 'take_order'
        },
        defaultNext: 'take_order'
      },
      show_product_price: {
        id: 'show_product_price',
        name: 'Mostrar Preço de Produto',
        type: 'info',
        message: `Deixa eu ver nosso cardápio... 📋\n\n{{menu_display}}\n\nQual produto você quer saber o preço?`,
        nextStates: {
          'purchase': 'take_order',
          'product_inquiry': 'take_order'
        },
        defaultNext: 'take_order'
      },
      take_order: {
        id: 'take_order',
        name: 'Anotar Pedido',
        type: 'action',
        message: `Perfeito! Vou anotar seu pedido. 📝\n\nPor favor, me diga:\n- O que você quer?\n- Quantidade\n\nExemplo: "2 pizzas calabresa"`,
        actions: ['add_to_cart'],
        nextStates: {
          'purchase': 'confirm_order',
          'finalizar': 'confirm_order',
          'confirmar': 'confirm_order'
        },
        defaultNext: 'confirm_order'
      },
      confirm_order: {
        id: 'confirm_order',
        name: 'Confirmar Pedido',
        type: 'action',
        message: `Seu pedido:\n{{cart}}\n\nTotal: R$ {{total}}\n\nConfirma? Digite SIM para continuar.`,
        nextStates: {
          'sim': 'collect_address',
          's': 'collect_address',
          'não': 'start',
          'n': 'start'
        },
        defaultNext: 'collect_address'
      },
      collect_address: {
        id: 'collect_address',
        name: 'Coletar Endereço',
        type: 'question',
        message: `Ótimo! Qual o endereço para entrega? 🏠`,
        defaultNext: 'finalize_order'
      },
      finalize_order: {
        id: 'finalize_order',
        name: 'Finalizar Pedido',
        type: 'end',
        message: `Pedido confirmado! ✅\n\nSeu pedido chegará em aproximadamente 40-50 minutos.\n\nObrigado pela preferência! 🙏`
      },
      transfer_human: {
        id: 'transfer_human',
        name: 'Transferir para Humano',
        type: 'end',
        message: `Vou transferir você para um de nossos atendentes. Aguarde um momento! 👤`
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // VENDAS (Catálogo/Produtos)
  // ─────────────────────────────────────────────────────────────────────

  private createVendasStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} da ${businessName}! 😊\n\nEstou aqui para ajudar você a encontrar o produto perfeito!\n\n1️⃣ Ver produtos\n2️⃣ Preços e condições\n3️⃣ Falar com vendedor`,
        nextStates: {
          'produtos': 'show_catalog',
          'catálogo': 'show_catalog',
          '1': 'show_catalog',
          'preço': 'show_prices',
          'valor': 'show_prices',
          '2': 'show_prices',
          'vendedor': 'transfer_human',
          '3': 'transfer_human'
        },
        defaultNext: 'show_catalog'
      },
      show_catalog: {
        id: 'show_catalog',
        name: 'Mostrar Catálogo',
        type: 'info',
        message: `Aqui estão nossos produtos! 🛍️\n\n[Catálogo será carregado automaticamente]\n\nTe interessou algum produto específico?`,
        nextStates: {
          'product_inquiry': 'product_details',
          'price': 'show_prices'
        },
        defaultNext: 'product_details'
      },
      product_details: {
        id: 'product_details',
        name: 'Detalhes do Produto',
        type: 'info',
        message: `Esse produto é excelente! ⭐\n\nGostaria de saber mais alguma coisa ou já quer fechar negócio?`,
        nextStates: {
          'comprar': 'finalize_sale',
          'quero': 'finalize_sale',
          'purchase': 'finalize_sale',
          'price': 'show_prices'
        },
        defaultNext: 'finalize_sale'
      },
      show_prices: {
        id: 'show_prices',
        name: 'Mostrar Preços',
        type: 'info',
        message: `Nossos preços:\n\n💰 Preço: R$ {{standard_price}}\n\nTemos condições especiais!\n\nTe interessa?`,
        nextStates: {
          'sim': 'finalize_sale',
          'purchase': 'finalize_sale'
        },
        defaultNext: 'finalize_sale'
      },
      finalize_sale: {
        id: 'finalize_sale',
        name: 'Finalizar Venda',
        type: 'end',
        message: `Ótimo! Vou passar você para nosso time de vendas finalizar! 🎉\n\nEm breve você receberá o contato.`
      },
      transfer_human: {
        id: 'transfer_human',
        name: 'Transferir para Vendedor',
        type: 'end',
        message: `Vou transferir você para um de nossos vendedores! 👤`
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // AGENDAMENTO
  // ─────────────────────────────────────────────────────────────────────

  private createAgendamentoStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} da ${businessName}! 📅\n\nVou ajudar você a agendar um horário!\n\n1️⃣ Ver horários disponíveis\n2️⃣ Agendar agora\n3️⃣ Cancelar agendamento`,
        nextStates: {
          'horários': 'show_availability',
          'disponível': 'show_availability',
          '1': 'show_availability',
          'agendar': 'collect_date',
          '2': 'collect_date',
          'cancelar': 'cancel_appointment',
          '3': 'cancel_appointment'
        },
        defaultNext: 'show_availability'
      },
      show_availability: {
        id: 'show_availability',
        name: 'Mostrar Disponibilidade',
        type: 'info',
        message: `Aqui estão os horários disponíveis: ⏰\n\n[Horários serão carregados automaticamente]\n\nQual horário funciona melhor para você?`,
        defaultNext: 'collect_date'
      },
      collect_date: {
        id: 'collect_date',
        name: 'Coletar Data',
        type: 'question',
        message: `Para qual dia você gostaria de agendar? 📆\n\nPor favor, informe a data (ex: 25/01/2026)`,
        defaultNext: 'collect_time'
      },
      collect_time: {
        id: 'collect_time',
        name: 'Coletar Horário',
        type: 'question',
        message: `Perfeito! E qual horário você prefere? ⏰\n\n(ex: 14:00)`,
        actions: ['schedule_appointment'],
        defaultNext: 'confirm_appointment'
      },
      confirm_appointment: {
        id: 'confirm_appointment',
        name: 'Confirmar Agendamento',
        type: 'end',
        message: `Agendamento confirmado! ✅\n\nData: {{date}}\nHorário: {{time}}\n\nVocê receberá uma confirmação em breve!`
      },
      cancel_appointment: {
        id: 'cancel_appointment',
        name: 'Cancelar Agendamento',
        type: 'end',
        message: `Por favor, entre em contato para cancelar seu agendamento. 📞`
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SUPORTE
  // ─────────────────────────────────────────────────────────────────────

  private createSuporteStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} do suporte da ${businessName}! 🛟\n\nComo posso ajudar você?\n\n1️⃣ Dúvidas frequentes\n2️⃣ Reportar problema\n3️⃣ Falar com atendente`,
        nextStates: {
          'dúvida': 'show_faq',
          'faq': 'show_faq',
          '1': 'show_faq',
          'problema': 'report_issue',
          '2': 'report_issue',
          'atendente': 'transfer_human',
          '3': 'transfer_human'
        },
        defaultNext: 'show_faq'
      },
      show_faq: {
        id: 'show_faq',
        name: 'Mostrar FAQ',
        type: 'info',
        message: `Aqui estão as dúvidas mais frequentes: ❓\n\n[FAQ será carregado automaticamente]\n\nIsso respondeu sua dúvida?`,
        nextStates: {
          'sim': 'end_resolved',
          'não': 'transfer_human'
        },
        defaultNext: 'transfer_human'
      },
      report_issue: {
        id: 'report_issue',
        name: 'Reportar Problema',
        type: 'question',
        message: `Vou ajudar você! Por favor, descreva o problema em detalhes. 📝`,
        defaultNext: 'collect_issue_details'
      },
      collect_issue_details: {
        id: 'collect_issue_details',
        name: 'Coletar Detalhes',
        type: 'question',
        message: `Entendi. Alguma informação adicional que possa ajudar?`,
        defaultNext: 'transfer_human'
      },
      transfer_human: {
        id: 'transfer_human',
        name: 'Transferir para Atendente',
        type: 'end',
        message: `Vou transferir você para um atendente especializado! 👤`
      },
      end_resolved: {
        id: 'end_resolved',
        name: 'Problema Resolvido',
        type: 'end',
        message: `Que bom que consegui ajudar! 😊\n\nSe precisar de mais algo, estou à disposição!`
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // CURSO
  // ─────────────────────────────────────────────────────────────────────

  private createCursoStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} do ${businessName}! 📚\n\nEstou aqui para te guiar no curso!\n\n1️⃣ Ver módulos\n2️⃣ Meu progresso\n3️⃣ Tirar dúvida`,
        nextStates: {
          'módulos': 'show_modules',
          '1': 'show_modules',
          'progresso': 'show_progress',
          '2': 'show_progress',
          'dúvida': 'ask_question',
          '3': 'ask_question'
        },
        defaultNext: 'show_modules'
      },
      show_modules: {
        id: 'show_modules',
        name: 'Mostrar Módulos',
        type: 'info',
        message: `Aqui estão os módulos disponíveis: 📖\n\n[Módulos serão carregados automaticamente]\n\nQual módulo te interessa?`,
        defaultNext: 'show_module_details'
      },
      show_module_details: {
        id: 'show_module_details',
        name: 'Detalhes do Módulo',
        type: 'info',
        message: `Esse módulo aborda temas importantes! ⭐\n\nQuer começar?`,
        nextStates: {
          'sim': 'start_lesson',
          's': 'start_lesson'
        },
        defaultNext: 'start_lesson'
      },
      start_lesson: {
        id: 'start_lesson',
        name: 'Iniciar Aula',
        type: 'info',
        message: `Vamos lá! Acesse o módulo através do link: {{module_link}}\n\nBons estudos! 📝`
      },
      show_progress: {
        id: 'show_progress',
        name: 'Mostrar Progresso',
        type: 'info',
        message: `Seu progresso até agora: 📊\n\n[Progresso será carregado automaticamente]\n\nContinue assim!`
      },
      ask_question: {
        id: 'ask_question',
        name: 'Tirar Dúvida',
        type: 'question',
        message: `Claro! Qual sua dúvida? 💭`,
        defaultNext: 'transfer_instructor'
      },
      transfer_instructor: {
        id: 'transfer_instructor',
        name: 'Transferir para Instrutor',
        type: 'end',
        message: `Vou passar sua dúvida para o instrutor! 👨‍🏫`
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // GENÉRICO (Escritório/Atendimento Geral)
  // ─────────────────────────────────────────────────────────────────────

  private createGenericoStates(businessName: string, agentName: string): Record<string, FlowState> {
    return {
      start: {
        id: 'start',
        name: 'Início',
        type: 'greeting',
        message: `Olá! Sou ${agentName} da ${businessName}! 👋\n\nComo posso ajudar você hoje?\n\n1️⃣ Informações sobre a empresa\n2️⃣ Falar com atendente\n3️⃣ Deixar uma mensagem`,
        nextStates: {
          'informações': 'company_info',
          'empresa': 'company_info',
          '1': 'company_info',
          'atendente': 'transfer_human',
          '2': 'transfer_human',
          'mensagem': 'leave_message',
          '3': 'leave_message'
        },
        defaultNext: 'company_info'
      },
      company_info: {
        id: 'company_info',
        name: 'Informações da Empresa',
        type: 'info',
        message: `Somos a ${businessName}! 🏢\n\n[Informações serão carregadas automaticamente]\n\nPosso ajudar com mais alguma coisa?`,
        nextStates: {
          'sim': 'start',
          'atendente': 'transfer_human'
        },
        defaultNext: 'transfer_human'
      },
      transfer_human: {
        id: 'transfer_human',
        name: 'Transferir para Atendente',
        type: 'end',
        message: `Vou transferir você para um de nossos atendentes! 👤\n\nAguarde um momento, por favor.`
      },
      leave_message: {
        id: 'leave_message',
        name: 'Deixar Mensagem',
        type: 'question',
        message: `Claro! Por favor, deixe sua mensagem e retornaremos em breve. 📝`,
        defaultNext: 'message_received'
      },
      message_received: {
        id: 'message_received',
        name: 'Mensagem Recebida',
        type: 'end',
        message: `Mensagem recebida! ✅\n\nRetornaremos o mais breve possível. Obrigado!`
      }
    };
  }
}
