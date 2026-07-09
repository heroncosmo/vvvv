/**
 * 🧪 TESTE COM 100 TIPOS DE CLIENTES - AGENTEZAP
 * 
 * Este arquivo contém 100 perfis de clientes diferentes para testar
 * a capacidade de conversão da IA em diferentes cenários.
 * 
 * Cada perfil simula um tipo real de cliente que pode interagir
 * com o sistema AgenteZap.
 * 
 * @author GitHub Copilot
 * @date 27/06/2025
 */

export interface ClientProfile {
  id: number;
  name: string;
  category: 'otimista' | 'pessimista' | 'curioso' | 'apressado' | 'indeciso' | 'tecnico' | 'leigo' | 'desconfiado' | 'entusiasta' | 'corporativo';
  description: string;
  initialMessage: string;
  expectedResponses: string[];  // O que a IA deve fazer
  redFlags: string[];  // O que a IA NÃO deve fazer
  conversionTarget: 'cadastro' | 'demo' | 'venda' | 'informacao';
}

export const CLIENT_PROFILES: ClientProfile[] = [
  // ============================================================================
  // 📗 CATEGORIA: OTIMISTAS (1-10)
  // Clientes positivos, abertos a novidades, fáceis de converter
  // ============================================================================
  {
    id: 1,
    name: "Otimista Empolgado",
    category: "otimista",
    description: "Cliente super animado, já quer testar tudo",
    initialMessage: "Oi! Vi o anúncio de vocês e achei incrível! Quero muito testar! 🚀",
    expectedResponses: ["oferecer demo", "pedir email", "explicar benefícios rápido"],
    redFlags: ["explicação longa", "muitas perguntas", "desânimo"],
    conversionTarget: "cadastro"
  },
  {
    id: 2,
    name: "Otimista Empreendedor",
    category: "otimista",
    description: "Dono de negócio procurando soluções",
    initialMessage: "Boa tarde! Tenho uma loja de roupas e preciso automatizar meu WhatsApp. Como funciona?",
    expectedResponses: ["perguntar sobre volume de mensagens", "mostrar case de sucesso similar"],
    redFlags: ["resposta genérica", "ignorar contexto da loja"],
    conversionTarget: "demo"
  },
  {
    id: 3,
    name: "Otimista Referenciado",
    category: "otimista",
    description: "Veio por indicação de amigo",
    initialMessage: "Olá! Meu amigo Pedro usa o sistema de vocês e recomendou. Quero saber mais!",
    expectedResponses: ["agradecer indicação", "perguntar o que Pedro usa", "oferecer condição especial"],
    redFlags: ["ignorar a indicação", "tratamento genérico"],
    conversionTarget: "cadastro"
  },
  {
    id: 4,
    name: "Otimista Pesquisador",
    category: "otimista",
    description: "Já pesquisou concorrentes e escolheu vocês",
    initialMessage: "Vi que vocês são melhores que o Manychat para WhatsApp. Quero começar!",
    expectedResponses: ["confirmar diferencial", "iniciar onboarding rápido"],
    redFlags: ["falar mal de concorrentes", "demorar para agir"],
    conversionTarget: "cadastro"
  },
  {
    id: 5,
    name: "Otimista Urgente",
    category: "otimista",
    description: "Precisa resolver problema HOJE",
    initialMessage: "Preciso de um bot urgente! Meu funcionário saiu e não tenho quem atenda o WhatsApp!",
    expectedResponses: ["tranquilizar", "mostrar que é rápido de configurar", "priorizar atendimento"],
    redFlags: ["demorar para responder", "fazer muitas perguntas"],
    conversionTarget: "venda"
  },
  {
    id: 6,
    name: "Otimista Tech-Savvy",
    category: "otimista",
    description: "Entende de tecnologia e quer detalhes técnicos",
    initialMessage: "Usa API do WhatsApp Business oficial ou é via web scraping? Preciso saber por compliance",
    expectedResponses: ["explicar tecnicamente", "falar de segurança", "mencionar conformidade"],
    redFlags: ["resposta evasiva", "não saber responder"],
    conversionTarget: "demo"
  },
  {
    id: 7,
    name: "Otimista Marketeiro",
    category: "otimista",
    description: "Trabalha com marketing digital",
    initialMessage: "Ei! Sou gestor de tráfego e quero usar IA para qualificar os leads que caem no WhatsApp dos meus clientes",
    expectedResponses: ["entender o volume", "falar de integração", "sugerir modelo de revenda"],
    redFlags: ["não entender o contexto B2B"],
    conversionTarget: "demo"
  },
  {
    id: 8,
    name: "Otimista Renovador",
    category: "otimista",
    description: "Já usou outro serviço e quer trocar",
    initialMessage: "Usava o Zenvia mas cancelei. O de vocês tem IA mesmo ou é só chatbot de fluxo?",
    expectedResponses: ["diferenciar de chatbot tradicional", "mostrar IA real", "oferecer migração"],
    redFlags: ["comparação negativa", "resposta genérica"],
    conversionTarget: "cadastro"
  },
  {
    id: 9,
    name: "Otimista Influencer",
    category: "otimista",
    description: "Digital influencer com muitos seguidores",
    initialMessage: "Oi! Tenho 500k seguidores e recebo muitas msgs no direct. Funciona pra Instagram também ou só WhatsApp?",
    expectedResponses: ["explicar foco WhatsApp", "sugerir solução", "perguntar sobre volume"],
    redFlags: ["prometer o que não faz", "ignorar a escala"],
    conversionTarget: "demo"
  },
  {
    id: 10,
    name: "Otimista Testador",
    category: "otimista",
    description: "Quer testar antes de decidir",
    initialMessage: "Tem período de teste? Quero ver se funciona pro meu negócio antes de pagar",
    expectedResponses: ["oferecer trial 24h", "configurar teste rápido", "pedir informações básicas"],
    redFlags: ["forçar venda sem teste", "complicar processo"],
    conversionTarget: "demo"
  },

  // ============================================================================
  // 📕 CATEGORIA: PESSIMISTAS/DESCONFIADOS (11-20)
  // Clientes céticos, precisam de provas e garantias
  // ============================================================================
  {
    id: 11,
    name: "Desconfiado Cauteloso",
    category: "desconfiado",
    description: "Tem medo de golpe, pede muitas provas",
    initialMessage: "Isso não é golpe né? Já caí em propaganda de bot antes...",
    expectedResponses: ["tranquilizar", "mostrar CNPJ", "oferecer teste grátis", "cases de sucesso"],
    redFlags: ["pressionar", "não ter paciência", "ficar na defensiva"],
    conversionTarget: "informacao"
  },
  {
    id: 12,
    name: "Desconfiado Técnico",
    category: "desconfiado",
    description: "Quer entender tudo antes de decidir",
    initialMessage: "Como vocês garantem que minha conta do WhatsApp não vai ser banida? Já ouvi histórias...",
    expectedResponses: ["explicar medidas de segurança", "falar de rate limiting", "mencionar boas práticas"],
    redFlags: ["resposta vaga", "promessas irreais"],
    conversionTarget: "informacao"
  },
  {
    id: 13,
    name: "Desconfiado Experiência Ruim",
    category: "desconfiado",
    description: "Já teve experiência negativa com similar",
    initialMessage: "Contratei um bot antes e foi horrível. As respostas eram ridículas. O de vocês é diferente?",
    expectedResponses: ["validar frustração", "explicar diferencial da IA", "oferecer demonstração"],
    redFlags: ["minimizar problema anterior", "prometer demais"],
    conversionTarget: "demo"
  },
  {
    id: 14,
    name: "Desconfiado Privacidade",
    category: "desconfiado",
    description: "Preocupado com dados dos clientes",
    initialMessage: "Vocês têm acesso às conversas dos meus clientes? Isso é um problema de LGPD",
    expectedResponses: ["explicar política de privacidade", "mencionar criptografia", "falar de compliance"],
    redFlags: ["ignorar preocupação", "resposta evasiva"],
    conversionTarget: "informacao"
  },
  {
    id: 15,
    name: "Desconfiado Preço",
    category: "desconfiado",
    description: "Acha que vai ter custo escondido",
    initialMessage: "Qual o preço REAL? Já vi empresa que cobra R$99 mas depois tem taxa disso, taxa daquilo...",
    expectedResponses: ["ser transparente", "explicar o que está incluído", "sem taxas escondidas"],
    redFlags: ["omitir informação", "complicar precificação"],
    conversionTarget: "informacao"
  },
  {
    id: 16,
    name: "Desconfiado Contrato",
    category: "desconfiado",
    description: "Quer saber de multa e cancelamento",
    initialMessage: "Se eu não gostar posso cancelar? Tem fidelidade? Multa?",
    expectedResponses: ["explicar política de cancelamento", "sem fidelidade", "cancelamento fácil"],
    redFlags: ["esconder termos", "complicar cancelamento"],
    conversionTarget: "informacao"
  },
  {
    id: 17,
    name: "Desconfiado Suporte",
    category: "desconfiado",
    description: "Preocupado se vai ter ajuda quando precisar",
    initialMessage: "E se der problema às 10 da noite? Tem suporte 24h ou vou ficar na mão?",
    expectedResponses: ["explicar horário de suporte", "canais de atendimento", "tempo de resposta"],
    redFlags: ["prometer 24h se não tiver", "ignorar preocupação"],
    conversionTarget: "informacao"
  },
  {
    id: 18,
    name: "Desconfiado Resultado",
    category: "desconfiado",
    description: "Quer garantia de resultado",
    initialMessage: "Se não funcionar vocês devolvem o dinheiro? Quero garantia!",
    expectedResponses: ["explicar política", "oferecer teste", "mostrar cases"],
    redFlags: ["prometer resultado garantido", "pressionar"],
    conversionTarget: "demo"
  },
  {
    id: 19,
    name: "Desconfiado Concorrência",
    category: "desconfiado",
    description: "Está comparando com vários fornecedores",
    initialMessage: "Estou cotando com 5 empresas. Por que eu deveria escolher vocês?",
    expectedResponses: ["destacar diferenciais", "não falar mal de concorrentes", "oferecer demo"],
    redFlags: ["falar mal de concorrentes", "pressionar decisão"],
    conversionTarget: "demo"
  },
  {
    id: 20,
    name: "Desconfiado IA Fake",
    category: "desconfiado",
    description: "Acha que IA é só marketing",
    initialMessage: "Todo mundo fala de IA hoje em dia mas é tudo chatbot comum. O de vocês usa IA de verdade?",
    expectedResponses: ["explicar modelo usado", "demonstrar capacidade", "diferenciar de chatbot"],
    redFlags: ["resposta genérica", "não saber explicar"],
    conversionTarget: "demo"
  },

  // ============================================================================
  // 📘 CATEGORIA: CURIOSOS (21-30)
  // Clientes que querem entender tudo, fazem muitas perguntas
  // ============================================================================
  {
    id: 21,
    name: "Curioso Acadêmico",
    category: "curioso",
    description: "Quer entender como a IA funciona por dentro",
    initialMessage: "Qual modelo de IA vocês usam? GPT? Claude? É fine-tuned?",
    expectedResponses: ["explicar tecnicamente", "mencionar Mistral", "falar de customização"],
    redFlags: ["resposta vaga", "não saber explicar"],
    conversionTarget: "informacao"
  },
  {
    id: 22,
    name: "Curioso Funcionalidades",
    category: "curioso",
    description: "Quer saber todas as features",
    initialMessage: "O que exatamente o bot consegue fazer? Manda uma lista completa de funcionalidades",
    expectedResponses: ["listar principais features", "não ser exaustivo", "focar no problema dele"],
    redFlags: ["lista infinita", "não perguntar necessidade"],
    conversionTarget: "informacao"
  },
  {
    id: 23,
    name: "Curioso Integração",
    category: "curioso",
    description: "Quer saber se integra com seus sistemas",
    initialMessage: "Integra com Shopify? Tenho uma loja virtual e quero que o bot consulte estoque e pedidos",
    expectedResponses: ["explicar integrações disponíveis", "possibilidades de customização"],
    redFlags: ["prometer integração que não existe"],
    conversionTarget: "demo"
  },
  {
    id: 24,
    name: "Curioso Casos de Uso",
    category: "curioso",
    description: "Quer exemplos práticos",
    initialMessage: "Me dá exemplos de como empresas estão usando? Quero entender melhor o potencial",
    expectedResponses: ["cases de sucesso", "exemplos práticos", "números se tiver"],
    redFlags: ["inventar casos", "ser genérico"],
    conversionTarget: "informacao"
  },
  {
    id: 25,
    name: "Curioso Limitações",
    category: "curioso",
    description: "Quer saber o que o bot NÃO faz",
    initialMessage: "E o que o bot NÃO consegue fazer? Quais são as limitações?",
    expectedResponses: ["ser honesto", "explicar limitações", "mostrar como contornar"],
    redFlags: ["dizer que faz tudo", "esconder limitações"],
    conversionTarget: "informacao"
  },
  {
    id: 26,
    name: "Curioso Personalização",
    category: "curioso",
    description: "Quer saber nível de customização",
    initialMessage: "Dá pra deixar o bot com a cara da minha marca? Quero que fale igual minha equipe fala",
    expectedResponses: ["explicar customização de prompt", "tom de voz", "personalidade"],
    redFlags: ["resposta padronizada"],
    conversionTarget: "demo"
  },
  {
    id: 27,
    name: "Curioso Métricas",
    category: "curioso",
    description: "Quer saber que dados vai ter acesso",
    initialMessage: "Vocês têm dashboard? Quero ver métricas de atendimento, tempo de resposta, conversão...",
    expectedResponses: ["mostrar relatórios disponíveis", "métricas principais"],
    redFlags: ["prometer métricas que não existem"],
    conversionTarget: "demo"
  },
  {
    id: 28,
    name: "Curioso Multi-Atendente",
    category: "curioso",
    description: "Tem equipe e quer saber como funciona",
    initialMessage: "Tenho 5 pessoas na equipe. Todas podem usar? Como funciona isso?",
    expectedResponses: ["explicar modelo de usuários", "preços adicionais se houver"],
    redFlags: ["não ter clareza sobre multi-usuário"],
    conversionTarget: "informacao"
  },
  {
    id: 29,
    name: "Curioso Escalabilidade",
    category: "curioso",
    description: "Pensa no futuro e crescimento",
    initialMessage: "Se meu negócio crescer e eu receber 1000 msgs por dia, vocês aguentam?",
    expectedResponses: ["falar de capacidade", "planos maiores", "escalabilidade"],
    redFlags: ["não ter resposta", "parecer pequeno demais"],
    conversionTarget: "informacao"
  },
  {
    id: 30,
    name: "Curioso Comparativo",
    category: "curioso",
    description: "Quer comparação detalhada",
    initialMessage: "Qual a diferença de vocês pro Blip? E pro Take? Faz uma comparação pra mim",
    expectedResponses: ["comparar honestamente", "destacar diferencial", "não denegrir"],
    redFlags: ["falar mal de concorrentes", "não conhecer mercado"],
    conversionTarget: "informacao"
  },

  // ============================================================================
  // ⏱️ CATEGORIA: APRESSADOS (31-40)
  // Clientes que não têm tempo, querem respostas rápidas
  // ============================================================================
  {
    id: 31,
    name: "Apressado Executivo",
    category: "apressado",
    description: "CEO que tem 2 minutos para decidir",
    initialMessage: "Não tenho tempo. Resumo: quanto custa, o que faz, quando começo?",
    expectedResponses: ["resposta objetiva", "sem enrolação", "ir direto ao ponto"],
    redFlags: ["texto longo", "muitas perguntas", "lentidão"],
    conversionTarget: "venda"
  },
  {
    id: 32,
    name: "Apressado Emergência",
    category: "apressado",
    description: "Tem problema urgente para resolver",
    initialMessage: "URGENTE! Minha atendente saiu e tenho 50 clientes esperando resposta. Conseguem ativar HOJE?",
    expectedResponses: ["tranquilizar", "confirmar rapidez", "priorizar atendimento"],
    redFlags: ["demorar", "processo burocrático"],
    conversionTarget: "venda"
  },
  {
    id: 33,
    name: "Apressado Reunião",
    category: "apressado",
    description: "Está entre reuniões",
    initialMessage: "Tenho 5 min até minha próxima call. Fala rápido o essencial",
    expectedResponses: ["bullet points", "resumo executivo", "link para mais info"],
    redFlags: ["texto corrido", "perder tempo"],
    conversionTarget: "informacao"
  },
  {
    id: 34,
    name: "Apressado Decisor",
    category: "apressado",
    description: "Já decidiu, só quer executar",
    initialMessage: "Já vi tudo que precisava. Como faço pra começar? Qual o próximo passo?",
    expectedResponses: ["ir direto pro cadastro", "não repetir benefícios", "agilidade"],
    redFlags: ["explicar tudo de novo", "fazer perguntas desnecessárias"],
    conversionTarget: "cadastro"
  },
  {
    id: 35,
    name: "Apressado Preço",
    category: "apressado",
    description: "Só quer saber preço",
    initialMessage: "Quanto custa? Só isso",
    expectedResponses: ["dar o preço direto", "breve explicação do que inclui"],
    redFlags: ["enrolar", "não dar preço", "fazer muitas perguntas antes"],
    conversionTarget: "informacao"
  },
  {
    id: 36,
    name: "Apressado Pagamento",
    category: "apressado",
    description: "Pronto para pagar",
    initialMessage: "Quero pagar agora. PIX ou cartão? Manda o link",
    expectedResponses: ["enviar forma de pagamento", "confirmar valor", "agilizar"],
    redFlags: ["demorar", "fazer perguntas", "complicar"],
    conversionTarget: "venda"
  },
  {
    id: 37,
    name: "Apressado Teste",
    category: "apressado",
    description: "Quer testar imediatamente",
    initialMessage: "Como testo? Quero ver funcionando em 5 minutos",
    expectedResponses: ["link do teste", "instruções rápidas", "suporte imediato"],
    redFlags: ["processo demorado", "burocracia"],
    conversionTarget: "demo"
  },
  {
    id: 38,
    name: "Apressado Renovação",
    category: "apressado",
    description: "Cliente atual querendo renovar rápido",
    initialMessage: "Meu plano vence amanhã. Quero renovar agora. Manda o PIX",
    expectedResponses: ["confirmar plano atual", "enviar pagamento", "agradecer fidelidade"],
    redFlags: ["perguntas desnecessárias", "demorar"],
    conversionTarget: "venda"
  },
  {
    id: 39,
    name: "Apressado Suporte",
    category: "apressado",
    description: "Tem problema e precisa de solução rápida",
    initialMessage: "Meu bot parou de funcionar! Preciso resolver AGORA!",
    expectedResponses: ["priorizar", "verificar problema", "solução rápida"],
    redFlags: ["demorar", "pedir muita informação antes de agir"],
    conversionTarget: "informacao"
  },
  {
    id: 40,
    name: "Apressado Cotação",
    category: "apressado",
    description: "Precisa de proposta para apresentar",
    initialMessage: "Preciso de uma proposta comercial pra apresentar pro meu chefe em 1 hora. Conseguem?",
    expectedResponses: ["enviar proposta rápida", "PDF ou texto estruturado", "disponibilidade para dúvidas"],
    redFlags: ["demorar", "pedir muita informação"],
    conversionTarget: "informacao"
  },

  // ============================================================================
  // 🤔 CATEGORIA: INDECISOS (41-50)
  // Clientes que não sabem se precisam, precisam de convencimento
  // ============================================================================
  {
    id: 41,
    name: "Indeciso Exploratório",
    category: "indeciso",
    description: "Só está olhando, sem compromisso",
    initialMessage: "Só estou dando uma olhada... não sei se preciso disso",
    expectedResponses: ["não pressionar", "perguntar sobre negócio", "educar sobre benefícios"],
    redFlags: ["pressionar venda", "ser agressivo"],
    conversionTarget: "informacao"
  },
  {
    id: 42,
    name: "Indeciso Orçamento",
    category: "indeciso",
    description: "Não sabe se cabe no bolso",
    initialMessage: "Parece legal mas não sei se tenho budget pra isso agora...",
    expectedResponses: ["mostrar ROI", "custo-benefício", "plano de entrada"],
    redFlags: ["ignorar objeção", "pressionar"],
    conversionTarget: "informacao"
  },
  {
    id: 43,
    name: "Indeciso Timing",
    category: "indeciso",
    description: "Não sabe se é o momento certo",
    initialMessage: "Talvez mais pra frente... estou muito ocupado agora",
    expectedResponses: ["entender momento", "deixar porta aberta", "follow-up futuro"],
    redFlags: ["pressionar", "insistir demais"],
    conversionTarget: "informacao"
  },
  {
    id: 44,
    name: "Indeciso Consulta",
    category: "indeciso",
    description: "Precisa consultar outras pessoas",
    initialMessage: "Vou precisar falar com meu sócio antes de decidir...",
    expectedResponses: ["oferecer material para compartilhar", "agendar call com ambos"],
    redFlags: ["pressionar decisão individual", "ignorar sócio"],
    conversionTarget: "informacao"
  },
  {
    id: 45,
    name: "Indeciso Alternativas",
    category: "indeciso",
    description: "Está considerando fazer internamente",
    initialMessage: "Estava pensando em contratar um atendente em vez de usar bot...",
    expectedResponses: ["comparar custos", "benefícios de cada", "complementaridade"],
    redFlags: ["denegrir contratação humana", "pressionar"],
    conversionTarget: "informacao"
  },
  {
    id: 46,
    name: "Indeciso Complexidade",
    category: "indeciso",
    description: "Acha que é complicado demais",
    initialMessage: "Parece muito complicado... não entendo muito de tecnologia",
    expectedResponses: ["mostrar simplicidade", "oferecer suporte", "demonstrar uso"],
    redFlags: ["usar termos técnicos", "complicar mais"],
    conversionTarget: "demo"
  },
  {
    id: 47,
    name: "Indeciso Tamanho",
    category: "indeciso",
    description: "Acha que é pequeno demais para precisar",
    initialMessage: "Meu negócio é pequeno, recebo só umas 20 mensagens por dia. Será que vale a pena?",
    expectedResponses: ["validar necessidade", "benefícios para pequenos", "custo acessível"],
    redFlags: ["ignorar objeção", "forçar venda"],
    conversionTarget: "informacao"
  },
  {
    id: 48,
    name: "Indeciso Prioridade",
    category: "indeciso",
    description: "Tem outras prioridades no momento",
    initialMessage: "Tenho outras coisas mais urgentes pra resolver agora...",
    expectedResponses: ["entender prioridades", "posicionar como facilitador", "follow-up futuro"],
    redFlags: ["ignorar prioridades", "pressionar"],
    conversionTarget: "informacao"
  },
  {
    id: 49,
    name: "Indeciso Experiência",
    category: "indeciso",
    description: "Teve experiência ruim com automação",
    initialMessage: "Já tentei automatizar antes e deu errado. Não sei se quero arriscar de novo...",
    expectedResponses: ["validar experiência", "diferenciar solução", "oferecer teste sem risco"],
    redFlags: ["minimizar experiência ruim", "prometer demais"],
    conversionTarget: "demo"
  },
  {
    id: 50,
    name: "Indeciso Validação",
    category: "indeciso",
    description: "Quer opinião de terceiros",
    initialMessage: "Vocês têm depoimentos de clientes? Quero ver o que as pessoas falam...",
    expectedResponses: ["compartilhar depoimentos", "cases de sucesso", "referências"],
    redFlags: ["não ter provas sociais", "inventar"],
    conversionTarget: "informacao"
  },

  // ============================================================================
  // 💻 CATEGORIA: TÉCNICOS (51-60)
  // Clientes que entendem de tecnologia, querem detalhes técnicos
  // ============================================================================
  {
    id: 51,
    name: "Técnico Desenvolvedor",
    category: "tecnico",
    description: "Dev querendo integrar via API",
    initialMessage: "Vocês têm API REST? Preciso integrar com meu sistema. Documentação?",
    expectedResponses: ["link da documentação", "endpoints principais", "autenticação"],
    redFlags: ["não ter API", "documentação ruim"],
    conversionTarget: "demo"
  },
  {
    id: 52,
    name: "Técnico DevOps",
    category: "tecnico",
    description: "Preocupado com infraestrutura",
    initialMessage: "Qual a disponibilidade (SLA) de vocês? Onde fica o servidor? Tem redundância?",
    expectedResponses: ["SLA", "localização", "arquitetura básica"],
    redFlags: ["não saber responder", "parecer amador"],
    conversionTarget: "informacao"
  },
  {
    id: 53,
    name: "Técnico Segurança",
    category: "tecnico",
    description: "Especialista em segurança da informação",
    initialMessage: "Quais certificações de segurança vocês têm? SOC2? ISO27001? Pen test?",
    expectedResponses: ["certificações se tiver", "práticas de segurança", "compliance"],
    redFlags: ["inventar certificações", "ignorar pergunta"],
    conversionTarget: "informacao"
  },
  {
    id: 54,
    name: "Técnico Webhook",
    category: "tecnico",
    description: "Quer receber eventos em tempo real",
    initialMessage: "Vocês mandam webhook quando chega mensagem? Preciso processar em tempo real no meu backend",
    expectedResponses: ["explicar webhooks disponíveis", "eventos", "formato"],
    redFlags: ["não ter webhook", "resposta vaga"],
    conversionTarget: "informacao"
  },
  {
    id: 55,
    name: "Técnico CRM",
    category: "tecnico",
    description: "Quer integrar com CRM",
    initialMessage: "Integra com HubSpot? Preciso que os leads caiam direto no meu CRM com as conversas",
    expectedResponses: ["integrações disponíveis", "Zapier se tiver", "alternativas"],
    redFlags: ["prometer integração inexistente"],
    conversionTarget: "demo"
  },
  {
    id: 56,
    name: "Técnico Multi-Número",
    category: "tecnico",
    description: "Tem múltiplos números de WhatsApp",
    initialMessage: "Tenho 10 números de WhatsApp diferentes. Dá pra gerenciar tudo num lugar só?",
    expectedResponses: ["explicar multi-número", "preço por número", "gestão centralizada"],
    redFlags: ["não suportar múltiplos", "preço confuso"],
    conversionTarget: "demo"
  },
  {
    id: 57,
    name: "Técnico White Label",
    category: "tecnico",
    description: "Agência querendo revender",
    initialMessage: "Vocês têm programa de revenda? Quero oferecer como serviço pros meus clientes sem aparecer a marca de vocês",
    expectedResponses: ["programa de parceiros", "white label", "condições"],
    redFlags: ["não ter programa", "margens ruins"],
    conversionTarget: "informacao"
  },
  {
    id: 58,
    name: "Técnico Rate Limit",
    category: "tecnico",
    description: "Preocupado com limites do WhatsApp",
    initialMessage: "Qual o rate limit? Quantas mensagens por segundo? Não quero tomar ban do WhatsApp",
    expectedResponses: ["explicar limites", "boas práticas", "segurança anti-ban"],
    redFlags: ["ignorar preocupação", "não saber responder"],
    conversionTarget: "informacao"
  },
  {
    id: 59,
    name: "Técnico Backup",
    category: "tecnico",
    description: "Quer saber sobre persistência de dados",
    initialMessage: "Por quanto tempo vocês guardam as conversas? Posso exportar? Em que formato?",
    expectedResponses: ["política de retenção", "exportação", "formatos"],
    redFlags: ["não reter dados", "não permitir exportação"],
    conversionTarget: "informacao"
  },
  {
    id: 60,
    name: "Técnico Custom Model",
    category: "tecnico",
    description: "Quer usar modelo de IA próprio",
    initialMessage: "Dá pra usar meu próprio modelo de IA em vez do de vocês? Tenho um fine-tuned específico",
    expectedResponses: ["possibilidades de customização", "alternativas", "limitações"],
    redFlags: ["resposta falsa", "prometer impossível"],
    conversionTarget: "informacao"
  },

  // ============================================================================
  // 👶 CATEGORIA: LEIGOS (61-70)
  // Clientes que não entendem de tecnologia, precisam de explicações simples
  // ============================================================================
  {
    id: 61,
    name: "Leigo Total",
    category: "leigo",
    description: "Não entende nada de tecnologia",
    initialMessage: "Não entendo nada disso de bot e IA. Explica como se eu fosse uma criança",
    expectedResponses: ["explicação simples", "analogias", "paciência", "sem termos técnicos"],
    redFlags: ["termos técnicos", "explicação complexa"],
    conversionTarget: "informacao"
  },
  {
    id: 62,
    name: "Leigo Idoso",
    category: "leigo",
    description: "Pessoa mais velha aprendendo tecnologia",
    initialMessage: "Sou dona de uma lojinha e minha neta disse pra eu procurar vocês. Isso é difícil de usar?",
    expectedResponses: ["acolher", "garantir simplicidade", "oferecer suporte", "paciência"],
    redFlags: ["apressar", "complicar", "termos em inglês"],
    conversionTarget: "demo"
  },
  {
    id: 63,
    name: "Leigo Medo",
    category: "leigo",
    description: "Tem medo de tecnologia",
    initialMessage: "Tenho medo de mexer nisso e quebrar alguma coisa... é seguro?",
    expectedResponses: ["tranquilizar", "mostrar que não quebra nada", "suporte"],
    redFlags: ["minimizar medo", "resposta técnica"],
    conversionTarget: "informacao"
  },
  {
    id: 64,
    name: "Leigo Delegador",
    category: "leigo",
    description: "Quer que façam tudo por ele",
    initialMessage: "Não tenho tempo nem paciência pra configurar. Vocês fazem tudo pra mim?",
    expectedResponses: ["oferecer setup assistido", "configuração inclusa", "suporte personalizado"],
    redFlags: ["exigir que ele faça", "parecer trabalho"],
    conversionTarget: "venda"
  },
  {
    id: 65,
    name: "Leigo Analogia",
    category: "leigo",
    description: "Entende melhor com exemplos do mundo real",
    initialMessage: "É tipo uma secretária virtual? Não entendi o que é 'inteligência artificial'",
    expectedResponses: ["usar analogia", "sim, como secretária", "exemplos práticos"],
    redFlags: ["explicação técnica", "corrigir analogia"],
    conversionTarget: "informacao"
  },
  {
    id: 66,
    name: "Leigo Visual",
    category: "leigo",
    description: "Precisa ver para entender",
    initialMessage: "Tem como me mostrar funcionando? Não consigo entender só com texto",
    expectedResponses: ["enviar vídeo", "demonstração ao vivo", "prints"],
    redFlags: ["mais texto", "não ter visual"],
    conversionTarget: "demo"
  },
  {
    id: 67,
    name: "Leigo Passo a Passo",
    category: "leigo",
    description: "Precisa de instruções detalhadas",
    initialMessage: "Me explica passo a passo o que eu preciso fazer. Tipo 1, 2, 3...",
    expectedResponses: ["lista numerada", "passos claros", "simplicidade"],
    redFlags: ["texto corrido", "assumir conhecimento"],
    conversionTarget: "cadastro"
  },
  {
    id: 68,
    name: "Leigo Celular",
    category: "leigo",
    description: "Só usa celular, não tem computador",
    initialMessage: "Só tenho celular, não uso computador. Funciona pelo celular?",
    expectedResponses: ["confirmar mobile", "app ou web mobile", "simplicidade"],
    redFlags: ["exigir computador"],
    conversionTarget: "demo"
  },
  {
    id: 69,
    name: "Leigo Vocabulário",
    category: "leigo",
    description: "Não conhece termos de tecnologia",
    initialMessage: "O que é 'integração'? E 'API'? Fala em português normal por favor",
    expectedResponses: ["traduzir termos", "linguagem simples", "paciência"],
    redFlags: ["mais termos técnicos", "parecer arrogante"],
    conversionTarget: "informacao"
  },
  {
    id: 70,
    name: "Leigo Familiar",
    category: "leigo",
    description: "Veio por recomendação de familiar tech-savvy",
    initialMessage: "Meu filho que entende de internet disse que vocês são bons. O que é esse negócio de chatbot?",
    expectedResponses: ["explicar simplesmente", "agradecer indicação", "oferecer demo"],
    redFlags: ["assumir conhecimento", "termos complexos"],
    conversionTarget: "demo"
  },

  // ============================================================================
  // 🎉 CATEGORIA: ENTUSIASTAS (71-80)
  // Clientes muito engajados, evangelistas em potencial
  // ============================================================================
  {
    id: 71,
    name: "Entusiasta Early Adopter",
    category: "entusiasta",
    description: "Adora testar coisas novas",
    initialMessage: "Adoro testar tecnologias novas! O que vocês têm de mais inovador?",
    expectedResponses: ["mostrar features novas", "roadmap", "beta tester"],
    redFlags: ["parecer ultrapassado"],
    conversionTarget: "cadastro"
  },
  {
    id: 72,
    name: "Entusiasta Compartilhador",
    category: "entusiasta",
    description: "Vai indicar para todo mundo se gostar",
    initialMessage: "Se funcionar bem vou indicar pra todos os meus amigos empreendedores!",
    expectedResponses: ["programa de indicação", "benefícios", "agradecer"],
    redFlags: ["ignorar potencial de indicação"],
    conversionTarget: "cadastro"
  },
  {
    id: 73,
    name: "Entusiasta Cases",
    category: "entusiasta",
    description: "Quer ser um case de sucesso",
    initialMessage: "Se der certo no meu negócio, vocês podem me usar como case? Adoro aparecer!",
    expectedResponses: ["aceitar proposta", "benefícios", "próximos passos"],
    redFlags: ["recusar", "não valorizar"],
    conversionTarget: "cadastro"
  },
  {
    id: 74,
    name: "Entusiasta Feedback",
    category: "entusiasta",
    description: "Adora dar sugestões de melhoria",
    initialMessage: "Vocês aceitam sugestões de features? Tenho várias ideias!",
    expectedResponses: ["canal de feedback", "valorizar", "exemplos de melhorias implementadas"],
    redFlags: ["ignorar", "parecer fechado"],
    conversionTarget: "cadastro"
  },
  {
    id: 75,
    name: "Entusiasta Comunidade",
    category: "entusiasta",
    description: "Quer fazer parte de comunidade",
    initialMessage: "Vocês têm grupo de usuários? Comunidade? Gosto de trocar experiências!",
    expectedResponses: ["informar comunidade se tiver", "criar se não tiver"],
    redFlags: ["ignorar", "não ter comunidade"],
    conversionTarget: "cadastro"
  },
  {
    id: 76,
    name: "Entusiasta Palestrante",
    category: "entusiasta",
    description: "Pode falar sobre vocês em eventos",
    initialMessage: "Dou palestras sobre tecnologia. Posso falar do produto de vocês se for bom!",
    expectedResponses: ["agradecer", "oferecer parceria", "material de apoio"],
    redFlags: ["não valorizar"],
    conversionTarget: "cadastro"
  },
  {
    id: 77,
    name: "Entusiasta YouTuber",
    category: "entusiasta",
    description: "Criador de conteúdo",
    initialMessage: "Tenho um canal sobre empreendedorismo. Posso fazer um vídeo sobre vocês?",
    expectedResponses: ["aceitar", "oferecer acesso especial", "material para vídeo"],
    redFlags: ["recusar", "burocratizar"],
    conversionTarget: "demo"
  },
  {
    id: 78,
    name: "Entusiasta Beta",
    category: "entusiasta",
    description: "Quer testar features antes do lançamento",
    initialMessage: "Vocês têm programa beta? Adoro testar coisas antes de todo mundo!",
    expectedResponses: ["programa beta se tiver", "early access", "feedback loop"],
    redFlags: ["não ter programa"],
    conversionTarget: "cadastro"
  },
  {
    id: 79,
    name: "Entusiasta Networking",
    category: "entusiasta",
    description: "Conhece muita gente",
    initialMessage: "Participo de vários grupos de empresários. Vocês têm material que eu possa compartilhar?",
    expectedResponses: ["material de divulgação", "parceria", "comissão"],
    redFlags: ["não ter material"],
    conversionTarget: "cadastro"
  },
  {
    id: 80,
    name: "Entusiasta Power User",
    category: "entusiasta",
    description: "Vai usar intensamente se gostar",
    initialMessage: "Se funcionar bem, vou usar em TODAS as minhas empresas. Tenho 5!",
    expectedResponses: ["plano enterprise", "desconto volume", "gerente de conta"],
    redFlags: ["tratar como cliente comum"],
    conversionTarget: "demo"
  },

  // ============================================================================
  // 🏢 CATEGORIA: CORPORATIVOS (81-100)
  // Clientes empresariais, processos de compra mais complexos
  // ============================================================================
  {
    id: 81,
    name: "Corporativo Compras",
    category: "corporativo",
    description: "Departamento de compras",
    initialMessage: "Sou do setor de compras. Precisamos de proposta formal com CNPJ, contrato e NF",
    expectedResponses: ["proposta formal", "dados fiscais", "processo comercial"],
    redFlags: ["informalidade", "não ter CNPJ"],
    conversionTarget: "informacao"
  },
  {
    id: 82,
    name: "Corporativo TI",
    category: "corporativo",
    description: "Gerente de TI avaliando solução",
    initialMessage: "Sou gerente de TI. Preciso entender a arquitetura antes de aprovar para o negócio",
    expectedResponses: ["documentação técnica", "segurança", "integração"],
    redFlags: ["resposta superficial"],
    conversionTarget: "informacao"
  },
  {
    id: 83,
    name: "Corporativo Compliance",
    category: "corporativo",
    description: "Preocupado com regulamentação",
    initialMessage: "Somos empresa regulada. Vocês têm certificações? LGPD? Onde ficam os dados?",
    expectedResponses: ["compliance", "certificações", "políticas"],
    redFlags: ["não ter compliance"],
    conversionTarget: "informacao"
  },
  {
    id: 84,
    name: "Corporativo Financeiro",
    category: "corporativo",
    description: "CFO avaliando custo-benefício",
    initialMessage: "Preciso de um business case. Qual o ROI esperado? TCO em 12 meses?",
    expectedResponses: ["ROI", "calculadora de economia", "cases com números"],
    redFlags: ["sem números", "resposta vaga"],
    conversionTarget: "informacao"
  },
  {
    id: 85,
    name: "Corporativo RH",
    category: "corporativo",
    description: "RH querendo automatizar recrutamento",
    initialMessage: "Queremos usar para triagem inicial de candidatos. Funciona para RH?",
    expectedResponses: ["caso de uso RH", "customização", "integração ATS"],
    redFlags: ["não atender caso"],
    conversionTarget: "demo"
  },
  {
    id: 86,
    name: "Corporativo Marketing",
    category: "corporativo",
    description: "CMO buscando escala",
    initialMessage: "Fazemos campanhas com 50 mil leads/mês. Vocês aguentam esse volume?",
    expectedResponses: ["capacidade", "escalabilidade", "plano enterprise"],
    redFlags: ["parecer pequeno"],
    conversionTarget: "demo"
  },
  {
    id: 87,
    name: "Corporativo Vendas",
    category: "corporativo",
    description: "Diretor comercial otimizando funil",
    initialMessage: "Quero qualificar leads automaticamente antes de passar pro meu time. Como funciona?",
    expectedResponses: ["qualificação automática", "critérios", "integração CRM"],
    redFlags: ["não entender vendas"],
    conversionTarget: "demo"
  },
  {
    id: 88,
    name: "Corporativo SAC",
    category: "corporativo",
    description: "Gerente de SAC com alto volume",
    initialMessage: "Temos 500 atendimentos/dia. Qual a redução de carga que posso esperar?",
    expectedResponses: ["métricas de redução", "casos similares", "tipos de atendimento"],
    redFlags: ["sem métricas"],
    conversionTarget: "demo"
  },
  {
    id: 89,
    name: "Corporativo Franquia",
    category: "corporativo",
    description: "Franqueador querendo padronizar atendimento",
    initialMessage: "Tenho 200 franqueados. Quero que todos atendam igual. Funciona em escala?",
    expectedResponses: ["multi-tenant", "gestão centralizada", "preço por franquia"],
    redFlags: ["não suportar escala"],
    conversionTarget: "demo"
  },
  {
    id: 90,
    name: "Corporativo Jurídico",
    category: "corporativo",
    description: "Advogado da empresa revisando contrato",
    initialMessage: "Sou do jurídico. Preciso do contrato de serviço para análise antes da contratação",
    expectedResponses: ["enviar contrato", "SLA", "termos de uso"],
    redFlags: ["sem contrato formal"],
    conversionTarget: "informacao"
  },
  {
    id: 91,
    name: "Corporativo Piloto",
    category: "corporativo",
    description: "Quer fazer POC antes de escalar",
    initialMessage: "Queremos fazer um piloto com um departamento antes de expandir. É possível?",
    expectedResponses: ["oferecer POC", "métricas de sucesso", "cronograma"],
    redFlags: ["forçar contrato grande"],
    conversionTarget: "demo"
  },
  {
    id: 92,
    name: "Corporativo Startup",
    category: "corporativo",
    description: "Startup em crescimento acelerado",
    initialMessage: "Somos uma startup série A. Crescemos 300% ao ano. Vocês acompanham?",
    expectedResponses: ["escalabilidade", "planos flexíveis", "case startups"],
    redFlags: ["parecer lento/burocrático"],
    conversionTarget: "demo"
  },
  {
    id: 93,
    name: "Corporativo E-commerce",
    category: "corporativo",
    description: "Loja virtual grande",
    initialMessage: "Temos uma loja com 10 mil pedidos/mês. Quero automatizar dúvidas sobre pedidos",
    expectedResponses: ["integração e-commerce", "tracking", "status de pedido"],
    redFlags: ["não ter integração"],
    conversionTarget: "demo"
  },
  {
    id: 94,
    name: "Corporativo SaaS",
    category: "corporativo",
    description: "Empresa SaaS querendo melhorar suporte",
    initialMessage: "Somos um SaaS B2B. Queremos automatizar primeiro nível de suporte técnico",
    expectedResponses: ["suporte técnico", "base de conhecimento", "escalonamento"],
    redFlags: ["não entender SaaS"],
    conversionTarget: "demo"
  },
  {
    id: 95,
    name: "Corporativo Saúde",
    category: "corporativo",
    description: "Clínica médica com requisitos especiais",
    initialMessage: "Somos uma clínica. Podemos usar para agendamento? Tem conformidade com dados de saúde?",
    expectedResponses: ["LGPD saúde", "agendamento", "casos clínicas"],
    redFlags: ["ignorar compliance saúde"],
    conversionTarget: "demo"
  },
  {
    id: 96,
    name: "Corporativo Educação",
    category: "corporativo",
    description: "Instituição de ensino",
    initialMessage: "Somos uma faculdade com 5 mil alunos. Queremos automatizar atendimento da secretaria",
    expectedResponses: ["caso educação", "integração sistema acadêmico", "volume"],
    redFlags: ["não ter caso educação"],
    conversionTarget: "demo"
  },
  {
    id: 97,
    name: "Corporativo Imobiliária",
    category: "corporativo",
    description: "Imobiliária com muitos leads",
    initialMessage: "Recebemos 200 leads de imóveis por dia pelos portais. Precisamos qualificar rápido",
    expectedResponses: ["qualificação imobiliária", "integração portais", "captação dados"],
    redFlags: ["resposta genérica"],
    conversionTarget: "demo"
  },
  {
    id: 98,
    name: "Corporativo Restaurante",
    category: "corporativo",
    description: "Rede de restaurantes",
    initialMessage: "Temos 50 restaurantes. Quero um bot para pedidos e reservas padronizado",
    expectedResponses: ["caso food service", "multi-unidade", "cardápio dinâmico"],
    redFlags: ["não entender setor"],
    conversionTarget: "demo"
  },
  {
    id: 99,
    name: "Corporativo Banco",
    category: "corporativo",
    description: "Instituição financeira",
    initialMessage: "Somos um banco digital. Precisamos de altíssima segurança. Vocês atendem requisitos bancários?",
    expectedResponses: ["segurança bancária", "certificações", "compliance financeiro"],
    redFlags: ["não ter segurança adequada"],
    conversionTarget: "informacao"
  },
  {
    id: 100,
    name: "Corporativo Multinacional",
    category: "corporativo",
    description: "Empresa global",
    initialMessage: "Somos uma multinacional. Precisamos de suporte em inglês também. Funciona multi-idioma?",
    expectedResponses: ["multi-idioma", "suporte global", "enterprise"],
    redFlags: ["só português", "parecer local demais"],
    conversionTarget: "demo"
  }
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

/**
 * Obtém todos os perfis de uma categoria específica
 */
export function getProfilesByCategory(category: ClientProfile['category']): ClientProfile[] {
  return CLIENT_PROFILES.filter(p => p.category === category);
}

/**
 * Obtém perfil por ID
 */
export function getProfileById(id: number): ClientProfile | undefined {
  return CLIENT_PROFILES.find(p => p.id === id);
}

/**
 * Obtém perfis aleatórios para teste
 */
export function getRandomProfiles(count: number): ClientProfile[] {
  const shuffled = [...CLIENT_PROFILES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Simula conversa com um perfil específico
 */
export async function simulateConversation(
  profile: ClientProfile,
  aiResponder: (message: string) => Promise<string>
): Promise<{
  profile: ClientProfile;
  conversation: Array<{ role: 'user' | 'ai'; message: string }>;
  score: { hits: number; misses: number; redFlags: number };
}> {
  const conversation: Array<{ role: 'user' | 'ai'; message: string }> = [];
  let hits = 0;
  let misses = 0;
  let redFlagsFound = 0;

  // Primeira mensagem do cliente
  conversation.push({ role: 'user', message: profile.initialMessage });

  // Resposta da IA
  const aiResponse = await aiResponder(profile.initialMessage);
  conversation.push({ role: 'ai', message: aiResponse });

  // Avaliar resposta
  const responseLower = aiResponse.toLowerCase();

  // Verificar expected responses
  for (const expected of profile.expectedResponses) {
    if (responseLower.includes(expected.toLowerCase())) {
      hits++;
    } else {
      misses++;
    }
  }

  // Verificar red flags
  for (const redFlag of profile.redFlags) {
    if (responseLower.includes(redFlag.toLowerCase())) {
      redFlagsFound++;
    }
  }

  return {
    profile,
    conversation,
    score: { hits, misses, redFlags: redFlagsFound }
  };
}

/**
 * Executa teste completo com todos os 100 perfis
 */
export async function runFullTest(
  aiResponder: (message: string) => Promise<string>
): Promise<{
  totalProfiles: number;
  averageScore: number;
  categorySummary: Record<string, { count: number; avgScore: number }>;
  worstPerformers: Array<{ profile: ClientProfile; score: number }>;
  bestPerformers: Array<{ profile: ClientProfile; score: number }>;
}> {
  const results: Array<{ profile: ClientProfile; score: number }> = [];
  const categoryScores: Record<string, { total: number; count: number }> = {};

  for (const profile of CLIENT_PROFILES) {
    const result = await simulateConversation(profile, aiResponder);
    const score = (result.score.hits / (profile.expectedResponses.length || 1)) * 100 - (result.score.redFlags * 20);
    
    results.push({ profile, score: Math.max(0, score) });

    // Agregar por categoria
    if (!categoryScores[profile.category]) {
      categoryScores[profile.category] = { total: 0, count: 0 };
    }
    categoryScores[profile.category].total += score;
    categoryScores[profile.category].count++;
  }

  // Ordenar resultados
  const sorted = results.sort((a, b) => a.score - b.score);

  // Calcular média por categoria
  const categorySummary: Record<string, { count: number; avgScore: number }> = {};
  for (const [cat, data] of Object.entries(categoryScores)) {
    categorySummary[cat] = {
      count: data.count,
      avgScore: data.total / data.count
    };
  }

  return {
    totalProfiles: CLIENT_PROFILES.length,
    averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    categorySummary,
    worstPerformers: sorted.slice(0, 10),
    bestPerformers: sorted.slice(-10).reverse()
  };
}

// ============================================================================
// ESTATÍSTICAS
// ============================================================================

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  📊 ESTATÍSTICAS DOS 100 PERFIS DE CLIENTE                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Total de perfis: ${CLIENT_PROFILES.length}                                                       ║
║                                                                              ║
║  Por categoria:                                                              ║
║  • Otimistas:     ${getProfilesByCategory('otimista').length.toString().padEnd(3)} perfis  (fáceis de converter)                     ║
║  • Desconfiados:  ${getProfilesByCategory('desconfiado').length.toString().padEnd(3)} perfis  (precisam de provas)                    ║
║  • Curiosos:      ${getProfilesByCategory('curioso').length.toString().padEnd(3)} perfis  (muitas perguntas)                       ║
║  • Apressados:    ${getProfilesByCategory('apressado').length.toString().padEnd(3)} perfis  (querem rapidez)                        ║
║  • Indecisos:     ${getProfilesByCategory('indeciso').length.toString().padEnd(3)} perfis  (precisam de convencimento)              ║
║  • Técnicos:      ${getProfilesByCategory('tecnico').length.toString().padEnd(3)} perfis  (querem detalhes técnicos)               ║
║  • Leigos:        ${getProfilesByCategory('leigo').length.toString().padEnd(3)} perfis  (precisam de simplicidade)               ║
║  • Entusiastas:   ${getProfilesByCategory('entusiasta').length.toString().padEnd(3)} perfis  (evangelistas em potencial)            ║
║  • Corporativos:  ${getProfilesByCategory('corporativo').length.toString().padEnd(3)} perfis  (processo complexo)                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

export default CLIENT_PROFILES;
