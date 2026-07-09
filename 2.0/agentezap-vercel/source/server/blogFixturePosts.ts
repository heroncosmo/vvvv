export interface BlogEditorialSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  proof?: string[];
}

export interface BlogEditorialFaq {
  question: string;
  answer: string;
}

export interface BlogEditorialReference {
  label: string;
  href: string;
  sourceType: string;
  description?: string;
}

export interface BlogEditorialModelPost {
  slug: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  cluster: string;
  categorySlug: string;
  tags: string[];
  keywordPrimary: string;
  keywordsSecondary: string[];
  intent: "commercial" | "informational";
  funnelStage: "tofu" | "mofu" | "bofu";
  imagePrompt: string;
  internalProofs: string[];
  sections: BlogEditorialSection[];
  faq: BlogEditorialFaq[];
  references: BlogEditorialReference[];
  styleFocus: string[];
}

export const BLOG_EDITORIAL_MODEL_POSTS: BlogEditorialModelPost[] = [
  {
    slug: "agente-de-ia-no-whatsapp-quando-vale-automatizar-e-quando-o-humano-deve-assumir",
    title: "Agente de IA no WhatsApp: quando vale automatizar e quando o humano deve assumir",
    excerpt: "Critérios práticos para decidir onde a IA ajuda no WhatsApp e onde insistir na automação só piora a operação.",
    metaTitle: "Agente de IA no WhatsApp: onde automatizar e onde o humano assume | AgenteZap",
    metaDescription: "Veja como decidir onde usar IA no WhatsApp, quais erros travam a operação e quando o atendimento humano deve entrar.",
    cluster: "ia-whatsapp",
    categorySlug: "ia-whatsapp",
    tags: ["ia-whatsapp", "atendimento", "automacao", "vendas"],
    keywordPrimary: "agente de ia para whatsapp",
    keywordsSecondary: [
      "quando usar agente de ia no whatsapp",
      "transbordo humano no whatsapp",
      "como configurar ia no whatsapp",
      "criterios para automacao no whatsapp",
    ],
    intent: "commercial",
    funnelStage: "bofu",
    imagePrompt: "Smartphone com conversa de WhatsApp, triagem por IA e destaque para transferencia humana.",
    internalProofs: [
      "Configuracao de agente IA com respostas em linguagem natural dentro do AgenteZap.",
      "Historico e contexto por conversa para o humano assumir sem repetir perguntas.",
      "Controle para pausar automacao por conversa quando o time precisa assumir o caso.",
    ],
    sections: [
      {
        heading: "Critérios para decidir se a IA entra nessa etapa",
        paragraphs: [
          "A IA funciona melhor em perguntas recorrentes, triagem inicial e follow-up que depende de regra clara. Ela funciona pior quando a conversa exige negociação, exceção operacional ou leitura fina de contexto comercial.",
          "Antes de automatizar, vale mapear três pontos: qual dúvida se repete, qual dado precisa ser registrado e em que momento a equipe humana deve assumir para não travar a venda.",
        ],
        bullets: [
          "Automatize etapas com pergunta e resposta previsíveis.",
          "Mantenha o humano nas negociações, objeções e exceções.",
          "Defina critérios de transbordo antes de publicar o fluxo.",
        ],
        proof: [
          "Configuracao de agente IA com respostas em linguagem natural dentro do AgenteZap.",
          "Controle para pausar automacao por conversa quando o time precisa assumir o caso.",
        ],
      },
      {
        heading: "Erros comuns de quem tenta vender 24/7 sem desenhar a operação",
        paragraphs: [
          "O erro clássico é ligar a IA em todo o funil e esperar que ela resolva gargalos que na verdade são de processo. Quando o time não define critérios de handoff, a automação vira um bloqueio a mais.",
          "Outro erro é deixar a IA responder sem histórico de conversa. Isso faz o cliente repetir contexto e reduz a confiança logo na etapa em que o lead deveria avançar.",
        ],
        bullets: [
          "Responder tudo com a mesma abertura genérica.",
          "Escalar para humano sem contexto registrado.",
          "Prometer atendimento contínuo sem regra de prioridade.",
        ],
      },
      {
        heading: "Sinais de que a implementação está funcionando",
        paragraphs: [
          "A implementação está no caminho certo quando o tempo até a primeira resposta cai, o número de leads sem próximo passo diminui e o humano recebe a conversa já contextualizada.",
          "Mais importante do que volume de mensagens é ver se a conversa está avançando para agenda, proposta ou qualificação real. Se a IA só aumenta interação sem mover o funil, o desenho está errado.",
        ],
        bullets: [
          "Tempo de resposta mais curto na triagem inicial.",
          "Menos conversas sem próximo passo definido.",
          "Transbordo humano acontecendo com contexto útil.",
        ],
        proof: [
          "Historico e contexto por conversa para o humano assumir sem repetir perguntas.",
        ],
      },
      {
        heading: "Limites da estratégia e quando o humano precisa entrar cedo",
        paragraphs: [
          "Quando a venda depende de proposta sob medida, validação de agenda, negociação ou leitura de urgência, o humano deve entrar cedo. A IA pode preparar o terreno, mas não deve prolongar uma conversa que já pede decisão assistida.",
          "A melhor operação não esconde o humano. Ela usa a IA para reduzir trabalho repetitivo e acelerar o momento em que o atendimento humano entra com mais informação e menos atrito.",
        ],
        bullets: [
          "Negociação complexa pede humano.",
          "Exceções operacionais pedem humano.",
          "Cliente indeciso por tempo demais pede revisão do fluxo.",
        ],
      },
    ],
    faq: [
      {
        question: "Quando um agente de IA no WhatsApp realmente vale a pena?",
        answer: "Vale quando existe volume, repetição de perguntas e um processo claro para decidir quando a automação responde e quando o humano assume.",
      },
      {
        question: "Qual o principal erro ao tentar vender 24/7 com IA?",
        answer: "É usar a IA sem regra de handoff e sem histórico, fazendo o lead girar em respostas genéricas em vez de avançar para uma próxima etapa comercial.",
      },
    ],
    references: [
      {
        label: "Google Helpful Content",
        href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
        sourceType: "external-official",
        description: "Diretrizes do Google para conteúdo people-first.",
      },
      {
        label: "WhatsApp Business Platform",
        href: "https://developers.facebook.com/docs/whatsapp",
        sourceType: "external-official",
        description: "Documentação oficial do canal WhatsApp.",
      },
      {
        label: "Central de ajuda: AI Agent",
        href: "/ajuda/categoria/ai-agent",
        sourceType: "internal-help",
        description: "Configuração e operação do agente no produto.",
      },
    ],
    styleFocus: [
      "abre com gargalo operacional concreto",
      "explica quando a estratégia não é boa ideia",
      "liga prova do produto a decisão editorial",
    ],
  },
  {
    slug: "crm-no-whatsapp-como-parar-de-perder-contexto-entre-atendimento-e-vendas",
    title: "CRM no WhatsApp: como parar de perder contexto entre atendimento e vendas",
    excerpt: "O que separar entre CRM, atendimento e automação para não repetir perguntas nem perder leads no meio da operação.",
    metaTitle: "CRM no WhatsApp: como manter contexto entre atendimento e vendas | AgenteZap",
    metaDescription: "Aprenda a usar CRM no WhatsApp sem perder contexto, repetir perguntas ou quebrar a passagem entre atendimento e vendas.",
    cluster: "crm-whatsapp",
    categorySlug: "crm-whatsapp",
    tags: ["crm-whatsapp", "crm", "vendas", "atendimento"],
    keywordPrimary: "crm para whatsapp com ia",
    keywordsSecondary: [
      "crm no whatsapp com historico",
      "como centralizar atendimento e vendas no whatsapp",
      "crm com ia para whatsapp",
      "contexto de conversa no whatsapp",
    ],
    intent: "commercial",
    funnelStage: "bofu",
    imagePrompt: "Tela de CRM integrada ao WhatsApp com historico, etiquetas e proximo passo comercial.",
    internalProofs: [
      "Etiquetas, funil e contatos sincronizados no mesmo sistema do atendimento.",
      "Campos personalizados para registrar contexto comercial sem sair do WhatsApp.",
      "Historico compartilhado de conversa para equipe comercial e operacional.",
    ],
    sections: [
      {
        heading: "Onde o contexto costuma se perder",
        paragraphs: [
          "O contexto se perde quando o atendimento conversa em um lugar, a equipe comercial organiza o funil em outro e ninguém sabe qual foi o último passo combinado com o lead.",
          "Sem uma camada única de histórico, o time repete perguntas simples, atrasa proposta e passa a sensação de operação desorganizada mesmo quando há interesse real na compra.",
        ],
        bullets: [
          "Atendimento e vendas usando ferramentas separadas.",
          "Contato sem responsável claro.",
          "Próximo passo combinado fora do CRM.",
        ],
      },
      {
        heading: "Critérios para centralizar sem engessar a equipe",
        paragraphs: [
          "Centralizar não significa obrigar o time a preencher uma planilha disfarçada. Significa registrar só o contexto que muda a próxima decisão comercial: intenção, estágio, responsável e pendência.",
          "O melhor desenho é aquele em que o histórico da conversa e o estado do negócio convivem no mesmo fluxo. Isso reduz retrabalho sem travar o atendimento com burocracia.",
        ],
        bullets: [
          "Defina quais dados mudam a próxima ação.",
          "Evite campos que ninguém usa para decidir nada.",
          "Deixe o próximo passo visível para toda a equipe.",
        ],
        proof: [
          "Campos personalizados para registrar contexto comercial sem sair do WhatsApp.",
          "Historico compartilhado de conversa para equipe comercial e operacional.",
        ],
      },
      {
        heading: "Sinais de que o CRM no WhatsApp está ajudando",
        paragraphs: [
          "Os melhores sinais não são estéticos, mas operacionais: menos leads sem dono, menos conversas voltando ao começo e menos tempo entre interesse e proposta.",
          "Quando o CRM realmente ajuda, o humano assume a conversa já sabendo o que foi perguntado, o que ficou pendente e o que precisa acontecer em seguida.",
        ],
        bullets: [
          "Menos leads sem responsável.",
          "Menos repetição de perguntas básicas.",
          "Mais clareza sobre o próximo passo comercial.",
        ],
        proof: [
          "Etiquetas, funil e contatos sincronizados no mesmo sistema do atendimento.",
        ],
      },
      {
        heading: "Limites do CRM quando a operação ainda não tem regra clara",
        paragraphs: [
          "Nenhum CRM resolve um processo que não sabe o que fazer depois da primeira conversa. Se o time ainda depende de memória individual, a ferramenta só expõe o problema com mais nitidez.",
          "Por isso, antes de pensar em automação mais agressiva, vale definir dono, etapa e critério de avanço. Sem isso, o contexto continua existindo, mas segue mal aproveitado.",
        ],
        bullets: [
          "Ferramenta sem processo não vira operação.",
          "Campos demais escondem a informação importante.",
          "Automação sem critério só acelera o erro.",
        ],
      },
    ],
    faq: [
      {
        question: "O que um CRM no WhatsApp precisa registrar de verdade?",
        answer: "Precisa registrar o que muda a próxima decisão: intenção, estágio, responsável, pendência e histórico da conversa.",
      },
      {
        question: "Qual o erro mais comum ao usar CRM no WhatsApp?",
        answer: "É separar atendimento, histórico e funil em ferramentas diferentes, obrigando a equipe a reconstruir o contexto a cada nova etapa.",
      },
    ],
    references: [
      {
        label: "Google Spam Policies",
        href: "https://developers.google.com/search/docs/essentials/spam-policies",
        sourceType: "external-official",
        description: "Políticas do Google para evitar scaled content abuse.",
      },
      {
        label: "Mistral Structured Output",
        href: "https://docs.mistral.ai/capabilities/structured_output/structured_output_overview/",
        sourceType: "external-official",
        description: "Saídas estruturadas para revisão editorial.",
      },
      {
        label: "Central de ajuda: contatos e CRM",
        href: "/ajuda/categoria/contacts",
        sourceType: "internal-help",
        description: "Fluxos de CRM e contatos do produto.",
      },
    ],
    styleFocus: [
      "explica a consequência operacional de cada erro",
      "usa critérios curtos de decisão em vez de promessas vagas",
      "mantém o foco no próximo passo comercial",
    ],
  },
  {
    slug: "agendamento-pelo-whatsapp-como-reduzir-faltas-sem-travar-a-equipe",
    title: "Agendamento pelo WhatsApp: como reduzir faltas sem travar a equipe",
    excerpt: "O que precisa existir no fluxo antes de automatizar agendamento, confirmação e lembretes pelo WhatsApp.",
    metaTitle: "Agendamento pelo WhatsApp: como reduzir faltas sem travar a equipe | AgenteZap",
    metaDescription: "Veja como organizar agendamento pelo WhatsApp com confirmação, lembretes e regras claras para reduzir faltas.",
    cluster: "agendamento-whatsapp",
    categorySlug: "agendamento-whatsapp",
    tags: ["agendamento-whatsapp", "agenda", "confirmacao", "lembretes"],
    keywordPrimary: "agendamento pelo whatsapp com ia",
    keywordsSecondary: [
      "confirmacao de agenda no whatsapp",
      "lembrete automatico no whatsapp",
      "como reduzir faltas no whatsapp",
      "agenda com ia no whatsapp",
    ],
    intent: "commercial",
    funnelStage: "mofu",
    imagePrompt: "Fluxo de agenda no WhatsApp com horario confirmado, lembrete e regra de reagendamento.",
    internalProofs: [
      "Modulo de agendamentos com profissionais, servicos e excecoes de horario.",
      "Lembretes e confirmacoes automaticas por WhatsApp.",
      "Fluxo de agendamento integrado ao mesmo numero usado no atendimento.",
    ],
    sections: [
      {
        heading: "O que precisa estar definido antes de automatizar a agenda",
        paragraphs: [
          "Automatizar agenda sem regra de serviço, profissional e exceção de horário costuma aumentar a confusão em vez de reduzir faltas. A automação só funciona quando a operação já sabe o que pode confirmar automaticamente.",
          "Antes de publicar o fluxo, vale alinhar quais horários são válidos, o que exige confirmação manual e como o reagendamento entra no processo sem virar retrabalho para a equipe.",
        ],
        bullets: [
          "Defina serviços, duração e profissionais disponíveis.",
          "Mapeie exceções de agenda antes do fluxo ir ao ar.",
          "Separe confirmação simples de casos que exigem humano.",
        ],
      },
      {
        heading: "Erros que fazem o agendamento parecer organizado só na tela",
        paragraphs: [
          "O erro mais comum é confirmar horário antes de validar as regras reais da agenda. O segundo é disparar lembrete automático sem saber se aquele cliente ainda está no horário certo ou já pediu alteração.",
          "Quando o fluxo ignora exceções, o time perde tempo desfazendo promessa feita pelo próprio sistema. Isso pesa mais do que o ganho aparente de rapidez.",
        ],
        bullets: [
          "Confirmar antes de validar exceções.",
          "Lembrar cliente de horário já alterado.",
          "Misturar reagendamento com confirmação simples.",
        ],
      },
      {
        heading: "Sinais de uma operação de agenda bem montada",
        paragraphs: [
          "Uma operação bem montada reduz faltas porque confirma cedo, relembra no momento certo e deixa claro como remarcar sem reiniciar toda a conversa.",
          "Também fica mais fácil perceber o que travou: se o gargalo está na confirmação, no reagendamento ou na regra interna da agenda.",
        ],
        bullets: [
          "Confirmação clara antes do atendimento.",
          "Lembrete no tempo certo, sem excesso.",
          "Reagendamento tratado como fluxo próprio.",
        ],
        proof: [
          "Lembretes e confirmacoes automaticas por WhatsApp.",
          "Fluxo de agendamento integrado ao mesmo numero usado no atendimento.",
        ],
      },
      {
        heading: "Quando a agenda precisa de humano cedo",
        paragraphs: [
          "Mudança de profissional, exceção comercial, encaixe e conflito de horário são casos em que o humano deve entrar cedo. A IA ajuda a organizar a triagem, mas não deve fingir previsibilidade onde ela não existe.",
          "O ganho real aparece quando o sistema resolve o padrão e libera a equipe para tratar o que realmente pede interpretação humana.",
        ],
        bullets: [
          "Conflito de horário pede revisão humana.",
          "Encaixe e exceção pedem humano.",
          "Automação deve triagem, não promessa fora de regra.",
        ],
      },
    ],
    faq: [
      {
        question: "Qual o primeiro passo para automatizar agendamento no WhatsApp?",
        answer: "É definir as regras reais da agenda: serviços, duração, profissionais, exceções e quando um humano precisa validar o horário.",
      },
      {
        question: "Por que lembrete automático sozinho não reduz faltas?",
        answer: "Porque falta não é só esquecimento; muitas vezes o problema está em confirmação fraca, reagendamento mal tratado ou promessa de horário sem validação.",
      },
    ],
    references: [
      {
        label: "Google Helpful Content",
        href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
        sourceType: "external-official",
        description: "Conteúdo útil e orientado a pessoas.",
      },
      {
        label: "Google Discover",
        href: "https://developers.google.com/search/docs/appearance/google-discover",
        sourceType: "external-official",
        description: "Boas práticas de apresentação e imagem.",
      },
      {
        label: "Central de ajuda: scheduling",
        href: "/ajuda/categoria/scheduling",
        sourceType: "internal-help",
        description: "Configuração de agenda, profissionais e horários.",
      },
    ],
    styleFocus: [
      "mostra pré-requisitos operacionais antes da automação",
      "trata reagendamento e exceção como problemas reais",
      "fala de redução de faltas sem prometer milagre",
    ],
  },
];

export function getEditorialModelExamples(cluster: string, limit = 2): BlogEditorialModelPost[] {
  return BLOG_EDITORIAL_MODEL_POSTS
    .slice()
    .sort((a, b) => Number(b.cluster === cluster) - Number(a.cluster === cluster))
    .slice(0, limit);
}
