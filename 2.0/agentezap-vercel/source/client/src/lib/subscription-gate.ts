export interface AssignedPlanOffer {
  id?: string;
  nome?: string | null;
  valor?: string | number | null;
  valorOriginal?: string | number | null;
  valorPrimeiraCobranca?: string | number | null;
  badge?: string | null;
}

export interface AssignedPlanResponse {
  hasAssignedPlan: boolean;
  plan?: AssignedPlanOffer;
}

export interface UsageGateData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}

export interface AccessStatusGateData {
  accessStatus: "active" | "trial" | "blocked" | "expired";
  shouldBlock: boolean;
  blockReason: string | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  isSubscriptionExpired: boolean;
  daysRemaining: number;
  subscriptionEndDate: string | null;
  planName: string | null;
  trialMessagesUsed: number;
  trialMessagesRemaining: number;
  trialMessagesLimit: number;
  trialLimitReached: boolean;
  message: string | null;
}

export interface SubscriptionPlanAccessInput {
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  planName?: string | null;
  plan_name?: string | null;
  planType?: string | null;
  plan_type?: string | null;
  type?: string | null;
  plan?: {
    nome?: string | null;
    name?: string | null;
    tipo?: string | null;
    type?: string | null;
    periodicidade?: string | null;
    valor?: string | number | null;
  } | null;
}

export interface SubscriptionGateModule {
  id: string;
  title: string;
  description: string;
  benefit: string;
  benefits: string[];
  paths: string[];
  bannerVariant?: "default" | "compact";
}

export const MY_AGENT_ALLOWED_SECTIONS = ["chat", "code", "media", "info", "config", "tools", "flow", "flow2"] as const;

export const PLAN_ADDON_IDS = {
  whatsappQr: "whatsapp-qrcode-included",
  exclusionList: "exclusion-list-included",
  proPackage: "pro-capacity-upgrade",
  conversationsCrm: "conversas-crm-central",
  membersSectors: "members-sectors",
  followup: "followup-smart",
  audio: "voice-ai",
  scheduling: "agendamento-2",
  notifier: "notificador-inteligente",
  massSend: "envio-massa",
  kanbanCrm: "kanban-crm",
  products: "catalogo-produtos",
  statusPosts: "status-whatsapp-posts",
  estamparia: "estamparia-ai",
  metaForm: "meta-formulario",
  delivery: "delivery-2",
  leadQueue: "fila-atencao",
  dedicatedAi: "dedicated-ai-upgrade",
  specialist: "specialist-dedicated",
  resultSpecialist: "result-specialist-pay-per-result",
  basicImplementation: "basic-implementation-setup",
} as const;

const INCLUDED_ACTIVE_SUBSCRIPTION_ADDONS = [PLAN_ADDON_IDS.whatsappQr, PLAN_ADDON_IDS.exclusionList];

const PLAN_FEATURE_PATHS: Record<string, string[]> = {
  [PLAN_ADDON_IDS.whatsappQr]: ["/qrcode-whatsapp"],
  [PLAN_ADDON_IDS.exclusionList]: ["/lista-exclusao"],
  [PLAN_ADDON_IDS.conversationsCrm]: [
    "/conversas",
    "/contatos",
    "/contatos-sincronizados",
    "/etiquetas",
    "/campos-personalizados",
    "/kanban",
    "/funil",
  ],
  [PLAN_ADDON_IDS.membersSectors]: ["/membros", "/setores"],
  [PLAN_ADDON_IDS.followup]: ["/followup"],
  [PLAN_ADDON_IDS.audio]: ["/falar-por-audio"],
  [PLAN_ADDON_IDS.scheduling]: ["/agendamento-3", "/agendamento-2", "/agendamentos", "/reservas", "/cursos", "/salon-menu", "/salon-agendamentos", "/prestador-menu", "/clinica-menu"],
  [PLAN_ADDON_IDS.notifier]: ["/notificador"],
  [PLAN_ADDON_IDS.massSend]: ["/envio-em-massa", "/campanhas", "/listas-contatos"],
  [PLAN_ADDON_IDS.products]: ["/produtos"],
  [PLAN_ADDON_IDS.statusPosts]: ["/postagens-status"],
  [PLAN_ADDON_IDS.estamparia]: ["/estamparia"],
  [PLAN_ADDON_IDS.metaForm]: ["/meta-formulario"],
  [PLAN_ADDON_IDS.delivery]: ["/delivery-2", "/delivery-cardapio", "/delivery-pedidos", "/delivery-relatorios"],
  [PLAN_ADDON_IDS.leadQueue]: ["/qualificacao"],
};

const ALWAYS_ALLOWED_ACTIVE_PATHS = [
  "/plans",
  "/subscribe",
  "/settings",
  "/minha-assinatura",
  "/payment-history",
  "/historico-pagamentos",
  "/conexao",
  "/tickets",
  "/ajuda",
  "/especialista",
];

const SUBSCRIPTION_ACTION_LABEL_FALLBACK = "continuar com esta ação";

const SUBSCRIPTION_GATE_MODULES: SubscriptionGateModule[] = [
  {
    id: "connection",
    title: "Conexão WhatsApp",
    description: "Veja como a conexão funciona e prepare sua operação antes de colocar o número oficial em produção.",
    benefit: "conectar seu WhatsApp e ativar o atendimento real",
    benefits: [
      "Conexão oficial do número em produção",
      "Liberação do atendimento com automações reais",
      "Entrada segura no fluxo completo do painel",
    ],
    paths: ["/conexao"],
  },
  {
    id: "my-agent",
    title: "Meu Agente IA",
    description: "Modele contexto, linguagem e visão comercial do seu agente antes de colocar em produção.",
    benefit: "salvar, ativar e publicar seu agente em produção",
    benefits: [
      "Salvar mudanças direto no agente",
      "Ativar a IA no WhatsApp com segurança",
      "Liberar recursos avançados de calibração e fluxo",
    ],
    paths: ["/meu-agente-ia"],
  },
  {
    id: "mass-send",
    title: "Envio em Massa",
    description: "Organize campanhas e aqueça sua base com mensagens em escala.",
    benefit: "criar e disparar campanhas de WhatsApp em lote",
    benefits: [
      "Campanhas prontas para disparo",
      "Segmentação e escala comercial",
      "Mais alcance sem operação manual",
    ],
    paths: ["/envio-em-massa"],
    bannerVariant: "compact",
  },
  {
    id: "campaigns",
    title: "Campanhas",
    description: "Planeje sequências, conteúdo e momentos certos para reativar contatos.",
    benefit: "salvar e publicar campanhas recorrentes",
    benefits: [
      "Ritmo comercial consistente",
      "Mais retorno sobre a base atual",
      "Execução sem planilha paralela",
    ],
    paths: ["/campanhas"],
  },
  {
    id: "kanban",
    title: "Kanban",
    description: "Visualize o pipeline comercial e acompanhe negociações em andamento.",
    benefit: "movimentar etapas e registrar evolução do funil",
    benefits: [
      "Pipeline visual em tempo real",
      "Menos lead esquecido",
      "Operação comercial mais previsível",
    ],
    paths: ["/kanban"],
  },
  {
    id: "contacts",
    title: "Contatos",
    description: "Centralize a base de clientes e organize segmentos com mais clareza.",
    benefit: "salvar listas, campos e ações sobre contatos",
    benefits: [
      "Base organizada e pronta para campanha",
      "Segmentação comercial mais rápida",
      "Histórico útil para a IA vender melhor",
    ],
    paths: ["/contatos-sincronizados", "/contatos", "/listas-contatos", "/campos-personalizados", "/etiquetas"],
  },
  {
    id: "media-library",
    title: "Biblioteca de Mídias",
    description: "Explore a vitrine de áudios, imagens, vídeos e documentos que o agente pode usar no atendimento.",
    benefit: "subir, organizar e ativar mídias do agente",
    benefits: [
      "Biblioteca pronta para o agente vender melhor",
      "Mídias alinhadas ao contexto da conversa",
      "Ativação direta no atendimento real",
    ],
    paths: ["/biblioteca-midias"],
  },
  {
    id: "products",
    title: "Catálogo de Produtos",
    description: "Estruture itens, preços e argumentos para o agente vender com contexto.",
    benefit: "salvar catálogo e enriquecer respostas comerciais",
    benefits: [
      "Ofertas mais claras nas respostas",
      "Menos consulta manual de preço",
      "Catálogo alinhado ao prompt do agente",
    ],
    paths: ["/produtos"],
  },
  {
    id: "workspace-management",
    title: "Gestão da Operação",
    description: "Conheça a organização de equipe, setores e distribuição de atendimento antes de ligar tudo em produção.",
    benefit: "salvar membros, setores e estrutura operacional",
    benefits: [
      "Organização da operação comercial e de suporte",
      "Equipe e handoff prontos para crescer",
      "Mais controle do painel quando o agente entrar em produção",
    ],
    paths: ["/membros", "/setores"],
  },
  {
    id: "funnel",
    title: "Funil",
    description: "Acompanhe oportunidades e desenhe a jornada comercial do lead.",
    benefit: "criar etapas, deals e automações do funil",
    benefits: [
      "Mais previsibilidade de conversão",
      "Etapas visuais com contexto",
      "Operação comercial orientada por status",
    ],
    paths: ["/funil"],
  },
  {
    id: "integrations",
    title: "Integrações",
    description: "Conecte fontes externas e traga dados úteis para o agente responder melhor.",
    benefit: "ativar integrações e salvar conexões do módulo",
    benefits: [
      "Dados externos no contexto do agente",
      "Menos trabalho manual de importação",
      "Mais precisão nas respostas de negócio",
    ],
    paths: ["/integracoes", "/meta-formulario"],
  },
  {
    id: "scheduling",
    title: "Agendamentos",
    description: "Abra horários, serviços e regras para sua operação de agenda.",
    benefit: "salvar horários, serviços e automações de agenda",
    benefits: [
      "Agenda pronta para vender no WhatsApp",
      "Menos retrabalho no atendimento",
      "Regras claras para disponibilidade",
    ],
    paths: ["/agendamentos", "/reservas", "/cursos", "/agendamento-3", "/agendamento-2", "/salon-menu", "/prestador-menu", "/clinica-menu"],
  },
  {
    id: "status-posts",
    title: "Postagens no Status",
    description: "Monte uma vitrine viva para o WhatsApp e publique com recorrência.",
    benefit: "agendar, salvar e ativar postagens automáticas",
    benefits: [
      "Mais presença sem postar manualmente",
      "Rotina de conteúdo previsível",
      "Status alinhado às ofertas atuais",
    ],
    paths: ["/postagens-status"],
  },
  {
    id: "lead-qualification",
    title: "Fila de Atenção",
    description: "Priorize quem merece resposta humana antes e acelere o fechamento.",
    benefit: "ativar a priorização automática dos leads",
    benefits: [
      "Mais foco no lead quente",
      "Menos tempo perdido em conversa morna",
      "Atendimento humano mais bem distribuído",
    ],
    paths: ["/qualificacao"],
  },
  {
    id: "notifier",
    title: "Notificador Inteligente",
    description: "Centralize alertas e gatilhos para não perder ação importante do dia.",
    benefit: "salvar regras e ativações do notificador",
    benefits: [
      "Alertas automáticos de operação",
      "Menos falhas em acompanhamento",
      "Mais disciplina comercial",
    ],
    paths: ["/notificador"],
  },
  {
    id: "followup",
    title: "Follow-up Inteligente",
    description: "Recupere conversas e oportunidades sem depender de lembrança manual.",
    benefit: "salvar cadências e ativações de follow-up",
    benefits: [
      "Retomadas automáticas com contexto",
      "Mais chances de conversão",
      "Menos lead parado no meio do caminho",
    ],
    paths: ["/followup"],
  },
  {
    id: "audio",
    title: "Falar por Áudio",
    description: "Transforme o agente em uma experiência mais humana e próxima da conversa real.",
    benefit: "ativar respostas em áudio e salvar ajustes de voz",
    benefits: [
      "Experiência mais próxima do WhatsApp real",
      "Mais retenção na conversa",
      "Respostas alinhadas ao seu tom de marca",
    ],
    paths: ["/falar-por-audio"],
  },
  {
    id: "delivery",
    title: "Delivery",
    description: "Estruture cardápio, pedidos e operação comercial para vender sem atrito.",
    benefit: "salvar cardápio, pedidos e rotinas do delivery",
    benefits: [
      "Cardápio pronto para conversão",
      "Pedido mais organizado no WhatsApp",
      "Menos erro operacional na ponta",
    ],
    paths: ["/delivery-2", "/delivery-cardapio", "/delivery-pedidos", "/delivery-relatorios"],
  },
  {
    id: "flow-builder",
    title: "Construtor de Fluxo",
    description: "Desenhe roteiros guiados para o agente conduzir atendimento com mais controle.",
    benefit: "salvar rotas, nós e automações do fluxo",
    benefits: [
      "Fluxos previsíveis para a equipe",
      "Menos improviso nas conversas",
      "Execução guiada com contexto",
    ],
    paths: ["/construtor-fluxo"],
  },
  {
    id: "tools-menu",
    title: "Ferramentas",
    description: "Explore todos os módulos conectados do sistema e identifique onde o plano gera mais retorno.",
    benefit: "ativar módulos e colocar as ferramentas para rodar",
    benefits: [
      "Visão completa dos módulos disponíveis",
      "Exploração guiada antes da assinatura",
      "Mais clareza sobre o ganho operacional do plano",
    ],
    paths: ["/ferramentas", "/qrcode-whatsapp", "/lista-exclusao"],
  },
];

const ACTION_KEYWORDS = [
  "salvar",
  "adicionar",
  "criar",
  "ativar",
  "publicar",
  "agendar",
  "conectar",
  "sincronizar",
  "integrar",
  "atribuir",
  "remover",
  "excluir",
  "enviar",
  "importar",
  "gerar",
  "subir",
  "liberar",
  "novo",
  "nova",
  "duplicar",
  "clonar",
  "vincular",
];

const PASSIVE_KEYWORDS = [
  "cancelar",
  "fechar",
  "voltar",
  "limpar",
  "editor",
  "simulador",
  "chat",
  "info",
  "editar",
  "abrir",
  "ver planos",
  "assinar",
  "plano",
  "upgrade",
  "ajuda",
  "testar",
];

function normalizeSubscriptionGatePath(pathname: string): string {
  const rawPath = String(pathname || "").trim().toLowerCase();
  if (!rawPath) {
    return "";
  }

  const hashIndex = rawPath.indexOf("#");
  const pathWithoutHash = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
  const queryIndex = pathWithoutHash.indexOf("?");
  return queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash;
}

function normalizePlanGateText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasStandalonePlanToken(text: string, token: string): boolean {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapedToken}($|[^a-z0-9])`).test(text);
}

function getSubscriptionMetadata(subscription?: SubscriptionPlanAccessInput | null): Record<string, unknown> {
  const metadata = subscription?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

export function isNewCheckoutSubscription(subscription?: SubscriptionPlanAccessInput | null): boolean {
  const metadata = getSubscriptionMetadata(subscription);
  const tier = normalizePlanGateText(metadata.checkoutTier);
  return (
    metadata.createdFrom === "plans_checkout" ||
    tier === "base" ||
    tier === "pro" ||
    tier === "dedicated" ||
    Array.isArray(metadata.selectedAddonIds)
  );
}

function getSubscriptionPlanTexts(subscription?: SubscriptionPlanAccessInput | null): { name: string; type: string } {
  const plan = subscription?.plan || {};
  return {
    name: [
      subscription?.planName,
      subscription?.plan_name,
      plan.nome,
      plan.name,
    ].map(normalizePlanGateText).filter(Boolean).join(" "),
    type: [
      subscription?.planType,
      subscription?.plan_type,
      subscription?.type,
      plan.tipo,
      plan.type,
      plan.periodicidade,
    ].map(normalizePlanGateText).filter(Boolean).join(" "),
  };
}

export function getSubscriptionSelectedAddonIds(subscription?: SubscriptionPlanAccessInput | null): string[] {
  const metadata = getSubscriptionMetadata(subscription);
  const selectedAddonIds = Array.isArray(metadata.selectedAddonIds)
    ? metadata.selectedAddonIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  return Array.from(new Set([...INCLUDED_ACTIVE_SUBSCRIPTION_ADDONS, ...selectedAddonIds]));
}

export function hasFullPlanAccess(subscription?: SubscriptionPlanAccessInput | null): boolean {
  return Boolean(subscription);
}

export function canActiveSubscriptionAccessPath(
  pathname: string,
  subscription?: SubscriptionPlanAccessInput | null,
): boolean {
  const currentPath = normalizeSubscriptionGatePath(pathname);
  if (!currentPath) {
    return true;
  }

  if (hasFullPlanAccess(subscription)) {
    return true;
  }

  if (currentPath === "/meu-agente-ia" || currentPath.startsWith("/meu-agente-ia/")) {
    return true;
  }

  if (ALWAYS_ALLOWED_ACTIVE_PATHS.some((allowedPath) => currentPath === allowedPath || currentPath.startsWith(`${allowedPath}/`))) {
    return true;
  }

  const addonIds = getSubscriptionSelectedAddonIds(subscription);
  for (const addonId of addonIds) {
    const paths = PLAN_FEATURE_PATHS[addonId] || [];
    if (paths.some((featurePath) => currentPath === featurePath || currentPath.startsWith(`${featurePath}/`))) {
      return true;
    }
  }

  return false;
}

export function getRequiredAddonForPath(pathname: string): { addonId: string; title: string } | null {
  const currentPath = normalizeSubscriptionGatePath(pathname);
  const addonTitles: Record<string, string> = {
    [PLAN_ADDON_IDS.whatsappQr]: "QR Code WhatsApp",
    [PLAN_ADDON_IDS.exclusionList]: "Lista de exclusao",
    [PLAN_ADDON_IDS.conversationsCrm]: "Central de conversas e CRM",
    [PLAN_ADDON_IDS.membersSectors]: "Membros e setores",
    [PLAN_ADDON_IDS.followup]: "Follow-up inteligente",
    [PLAN_ADDON_IDS.audio]: "Falar por audio com IA",
    [PLAN_ADDON_IDS.scheduling]: "Agendamento 2.0",
    [PLAN_ADDON_IDS.notifier]: "Notificador inteligente",
    [PLAN_ADDON_IDS.massSend]: "Envio em massa e campanhas",
    [PLAN_ADDON_IDS.products]: "Catalogo de produtos",
    [PLAN_ADDON_IDS.statusPosts]: "Postagem no Status WhatsApp",
    [PLAN_ADDON_IDS.estamparia]: "Estamparia com IA",
    [PLAN_ADDON_IDS.metaForm]: "Formulario Meta",
    [PLAN_ADDON_IDS.delivery]: "Delivery 2.0",
    [PLAN_ADDON_IDS.leadQueue]: "Fila de atencao",
  };

  for (const [addonId, paths] of Object.entries(PLAN_FEATURE_PATHS)) {
    if (paths.some((featurePath) => currentPath === featurePath || currentPath.startsWith(`${featurePath}/`))) {
      return { addonId, title: addonTitles[addonId] || "adicional" };
    }
  }

  return null;
}

export function getSubscriptionGateModule(pathname: string): SubscriptionGateModule | null {
  const currentPath = normalizeSubscriptionGatePath(pathname);

  if (currentPath === "/conexao" || currentPath.startsWith("/conexao/")) {
    return null;
  }

  for (const moduleConfig of SUBSCRIPTION_GATE_MODULES) {
    for (const modulePath of moduleConfig.paths) {
      if (currentPath === modulePath || currentPath.startsWith(`${modulePath}/`)) {
        return moduleConfig;
      }
    }
  }

  return null;
}

export function isLockedMyAgentSection(
  section: string,
  hasActiveSubscription: boolean,
  subscription?: SubscriptionPlanAccessInput | null,
): boolean {
  if (!hasActiveSubscription) {
    return !MY_AGENT_ALLOWED_SECTIONS.includes(section as (typeof MY_AGENT_ALLOWED_SECTIONS)[number]);
  }

  return false;
}

export function formatPlanCurrency(value: unknown): string | null {
  const rawValue = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  return `R$ ${rawValue.toFixed(2).replace(".", ",")}`;
}

function collectElementIntentText(element: HTMLElement): string {
  const parts = new Set<string>();

  const pushPart = (value?: string | null) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (!normalizedValue) {
      return;
    }

    parts.add(normalizedValue);
  };

  pushPart(element.getAttribute("aria-label"));
  pushPart(element.getAttribute("title"));
  pushPart(element.textContent);

  if (element instanceof HTMLInputElement) {
    pushPart(element.value);
  }

  const closestLabel = element.closest("label");
  if (closestLabel instanceof HTMLElement) {
    pushPart(closestLabel.textContent);
  }

  if (typeof document !== "undefined") {
    const elementId = String(element.getAttribute("id") || "").trim();
    if (elementId) {
      for (const label of Array.from(document.querySelectorAll("label[for]"))) {
        if (!(label instanceof HTMLLabelElement) || label.htmlFor !== elementId) {
          continue;
        }

        pushPart(label.textContent);
      }
    }
  }

  if (!String(element.textContent || "").trim()) {
    pushPart(element.parentElement?.textContent);
    pushPart(element.previousElementSibling instanceof HTMLElement ? element.previousElementSibling.textContent : "");
    pushPart(element.nextElementSibling instanceof HTMLElement ? element.nextElementSibling.textContent : "");
  }

  return Array.from(parts).join(" ");
}

export function extractSubscriptionActionLabel(target: HTMLElement | null): string {
  if (!target) {
    return "continuar com esta ação";
  }

  const interactive = target.closest("button, [role='button'], [role='switch'], input, a, [data-gated-action]");
  if (!(interactive instanceof HTMLElement)) {
    return "continuar com esta ação";
  }

  const text = collectElementIntentText(interactive);
  if (!text) {
    return "continuar com esta ação";
  }

  if (text.length <= 80) {
    return text;
  }

  return `${text.slice(0, 77).trim()}...`;
}

export function isSubscriptionGatedActionTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return false;
  }

  const interactive = target.closest("button, [role='button'], [role='switch'], a, input, select, textarea, [data-gated-action]");
  if (!(interactive instanceof HTMLElement)) {
    return false;
  }

  if (interactive.closest("[data-subscription-gate-ignore='true']")) {
    return false;
  }

  if (interactive.hasAttribute("disabled") || interactive.getAttribute("aria-disabled") === "true") {
    return false;
  }

  if (interactive.dataset.gatedAction === "true") {
    return true;
  }

  const role = String(interactive.getAttribute("role") || "").toLowerCase();
  if (
    role === "tab" ||
    role === "menuitem" ||
    role === "option" ||
    role === "link" ||
    role === "combobox"
  ) {
    return false;
  }

  if (interactive.closest("[role='tablist']")) {
    return false;
  }

  const tagName = interactive.tagName.toLowerCase();
  if (tagName === "a" && interactive.getAttribute("href")) {
    return false;
  }

  const actionText = collectElementIntentText(interactive);

  if (interactive instanceof HTMLInputElement) {
    const inputType = String(interactive.type || "").toLowerCase();
    if (inputType === "submit") {
      if (!actionText) {
        return true;
      }

      if (PASSIVE_KEYWORDS.some((keyword) => actionText.includes(keyword))) {
        return false;
      }

      return ACTION_KEYWORDS.some((keyword) => actionText.includes(keyword));
    }

    if (inputType === "checkbox" || inputType === "radio") {
      if (!actionText) {
        return false;
      }

      if (PASSIVE_KEYWORDS.some((keyword) => actionText.includes(keyword))) {
        return false;
      }

      return ACTION_KEYWORDS.some((keyword) => actionText.includes(keyword));
    }

    return false;
  }

  if (tagName === "textarea" || tagName === "select") {
    return false;
  }

  if (role === "switch") {
    if (!actionText) {
      return false;
    }

    if (PASSIVE_KEYWORDS.some((keyword) => actionText.includes(keyword))) {
      return false;
    }

    return ACTION_KEYWORDS.some((keyword) => actionText.includes(keyword));
  }

  if (interactive instanceof HTMLButtonElement) {
    const buttonType = String(interactive.type || "submit").toLowerCase();
    if (buttonType === "submit") {
      if (!actionText) {
        return true;
      }

      if (PASSIVE_KEYWORDS.some((keyword) => actionText.includes(keyword))) {
        return false;
      }

      return ACTION_KEYWORDS.some((keyword) => actionText.includes(keyword));
    }
  }

  if (!actionText) {
    return false;
  }

  if (PASSIVE_KEYWORDS.some((keyword) => actionText.includes(keyword))) {
    return false;
  }

  return ACTION_KEYWORDS.some((keyword) => actionText.includes(keyword));
}
