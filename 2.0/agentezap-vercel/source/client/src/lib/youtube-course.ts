export type CourseVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  module: "configuracao" | "atendimento" | "automacao" | "crm" | "integracoes" | "extras";
  articleIds: string[];
  paths: string[];
  courseOrder?: number;
  isPromotional?: boolean;
};

export type CourseModule = {
  id: CourseVideo["module"];
  title: string;
  description: string;
};

export const COURSE_MODULES: CourseModule[] = [
  {
    id: "configuracao",
    title: "Comece pelo agente",
    description: "Criacao, calibracao, midias e ativacao da IA.",
  },
  {
    id: "atendimento",
    title: "Atendimento no WhatsApp",
    description: "Conversas, exclusoes, audio e notificacoes.",
  },
  {
    id: "automacao",
    title: "Automacoes",
    description: "Follow-up, envio em massa, agendamentos e formularios.",
  },
  {
    id: "crm",
    title: "CRM e funil",
    description: "Kanban, setores, membros e gestao comercial.",
  },
  {
    id: "integracoes",
    title: "Integracoes",
    description: "Conexoes externas e fluxos vindos de outros canais.",
  },
  {
    id: "extras",
    title: "Conheca o AgenteZap",
    description: "Videos de apresentacao fora da sequencia pratica.",
  },
];

export const AGENTEZAP_COURSE_CHANNEL = {
  handle: "@AgenteZapIA",
  title: "AgenteZap Inteligencia Artificial",
  channelId: "UCJRkae71Ez93qLKuaW6T5vg",
  url: "https://www.youtube.com/@AgenteZapIA",
};

export const COURSE_VIDEOS: CourseVideo[] = [
  {
    id: "kmk3IwBra-o",
    title: "IA de Atendimento WhatsApp",
    description: "Apresentacao rapida do que a IA para WhatsApp pode fazer no atendimento.",
    publishedAt: "2025-11-12",
    module: "extras",
    articleIds: ["onboarding-overview", "course-video-all"],
    paths: [],
    isPromotional: true,
  },
  {
    id: "L1nKUi5HBNI",
    title: "Transforme Seu Atendimento Agora com AgenteZap no WhatsApp",
    description: "Visao geral do AgenteZap para automatizar atendimento no WhatsApp.",
    publishedAt: "2025-11-18",
    module: "extras",
    articleIds: ["onboarding-overview", "dashboard-overview", "course-video-all"],
    paths: [],
    isPromotional: true,
  },
  {
    id: "wc67X1-P7tU",
    title: "Setores e membros CRM AgenteZap",
    description: "Como organizar equipe, permissoes e setores no CRM.",
    publishedAt: "2026-04-10",
    module: "crm",
    articleIds: ["settings-team", "settings-sectors", "course-video-all"],
    paths: ["/membros", "/setores"],
    courseOrder: 12,
  },
  {
    id: "Q_IzZTh3kPQ",
    title: "Crie um Agente de IA para Vendas no WhatsApp Facil",
    description: "Criacao e configuracao base do agente de IA para vendas.",
    publishedAt: "2026-04-10",
    module: "configuracao",
    articleIds: ["onboarding-agent", "onboarding-activate", "ai-agent-chat", "ai-agent-prompt", "course-video-all"],
    paths: ["/meu-agente-ia"],
    courseOrder: 1,
  },
  {
    id: "DzAzssBFjC0",
    title: "CRM Conversas no WhatsApp com AgenteZap",
    description: "Como usar a tela de conversas para atender e acompanhar clientes.",
    publishedAt: "2026-04-10",
    module: "atendimento",
    articleIds: ["conversations-overview", "conversations-ia-pause", "course-video-all"],
    paths: ["/conversas"],
    courseOrder: 4,
  },
  {
    id: "Gih9poWOSqU",
    title: "Lista de Exclusao - numeros que a IA nao deve responder",
    description: "Como impedir respostas automaticas para numeros especificos.",
    publishedAt: "2026-04-10",
    module: "atendimento",
    articleIds: ["course-video-all"],
    paths: ["/lista-exclusao"],
    courseOrder: 5,
  },
  {
    id: "QaEp4JBaPeM",
    title: "Notificador Inteligente no WhatsApp",
    description: "Alertas por venda, pedido, agendamento ou oportunidade.",
    publishedAt: "2026-04-10",
    module: "atendimento",
    articleIds: ["notifier-overview", "course-video-all"],
    paths: ["/notificador"],
    courseOrder: 6,
  },
  {
    id: "XcRR_1KVCYQ",
    title: "Agendamento com Inteligencia Artificial no WhatsApp",
    description: "Como usar a IA para agendamentos pelo WhatsApp.",
    publishedAt: "2026-04-10",
    module: "automacao",
    articleIds: ["scheduling-maton-google-calendar", "course-video-all"],
    paths: ["/agendamento-2", "/agendamentos", "/salon-agendamentos", "/prestador-menu", "/clinica-menu"],
    courseOrder: 10,
  },
  {
    id: "vLc8YojG6Iw",
    title: "Formulario Meta direto para o WhatsApp com AgenteZap",
    description: "Como levar leads de formulario Meta para o atendimento no WhatsApp.",
    publishedAt: "2026-04-15",
    module: "integracoes",
    articleIds: ["integrations-meta-formulario-google-drive", "course-video-all"],
    paths: ["/meta-formulario"],
    courseOrder: 11,
  },
  {
    id: "xiKLkYUAnaA",
    title: "Enviar midia: audios, arquivos, videos e imagens no WhatsApp",
    description: "Como configurar envio de midias pelo agente.",
    publishedAt: "2026-04-16",
    module: "configuracao",
    articleIds: ["ai-agent-media", "media-overview", "audio-overview", "course-video-all"],
    paths: ["/meu-agente-ia", "/biblioteca-midias", "/falar-por-audio"],
    courseOrder: 3,
  },
  {
    id: "wAXHoPYbUG0",
    title: "Configure seu Agente no WhatsApp e calibre apos criar a conta",
    description: "Ajustes depois da criacao da conta para deixar o agente pronto.",
    publishedAt: "2026-04-16",
    module: "configuracao",
    articleIds: ["onboarding-agent", "ai-agent-calibration", "ai-agent-simulator", "course-video-all"],
    paths: ["/meu-agente-ia"],
    courseOrder: 2,
  },
  {
    id: "CaelrU9h7xc",
    title: "Follow-up Inteligente com Inteligencia Artificial",
    description: "Como recuperar conversas paradas automaticamente.",
    publishedAt: "2026-04-16",
    module: "automacao",
    articleIds: ["followup-setup", "course-video-all"],
    paths: ["/followup"],
    courseOrder: 7,
  },
  {
    id: "VsQOOw4IhHg",
    title: "Kanban CRM completo e profissional com IA no WhatsApp",
    description: "Como organizar oportunidades no Kanban CRM.",
    publishedAt: "2026-04-16",
    module: "crm",
    articleIds: ["kanban-overview", "funnel-overview", "course-video-all"],
    paths: ["/kanban", "/funil", "/qualificacao"],
    courseOrder: 8,
  },
  {
    id: "TWmueSjjMFA",
    title: "Envio em massa no WhatsApp para listas, contatos seguros e grupos",
    description: "Como usar envio em massa com listas e grupos no AgenteZap.",
    publishedAt: "2026-04-16",
    module: "automacao",
    articleIds: ["mass-send-setup", "course-video-all"],
    paths: ["/envio-em-massa", "/listas-contatos", "/campanhas"],
    courseOrder: 9,
  },
];

export function getPrimaryCourseVideos() {
  return COURSE_VIDEOS.filter((video) => !video.isPromotional);
}

export function getPromotionalCourseVideos() {
  return COURSE_VIDEOS.filter((video) => video.isPromotional);
}

export function getOrderedCourseVideos(videos: CourseVideo[] = COURSE_VIDEOS) {
  return [...videos].sort((left, right) => {
    if (!!left.isPromotional !== !!right.isPromotional) {
      return left.isPromotional ? 1 : -1;
    }

    const leftOrder = left.courseOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.courseOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return left.publishedAt.localeCompare(right.publishedAt);
  });
}

export function getCourseVideoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getCourseEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function getCourseThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getCourseVideosForArticle(articleId: string) {
  return getOrderedCourseVideos(COURSE_VIDEOS.filter((video) => video.articleIds.includes(articleId)));
}

export function getCourseVideoForPath(pathname: string) {
  const normalized = pathname.split("?")[0] || "/";
  const videos = getOrderedCourseVideos(getPrimaryCourseVideos());
  const exact = videos.find((video) => video.paths.some((path) => normalized === path));
  if (exact) return exact;
  return videos.find((video) => video.paths.some((path) => normalized.startsWith(`${path}/`))) || null;
}

export function getCourseArticleId(video: CourseVideo) {
  return video.articleIds.find((articleId) => articleId !== "course-video-all") || "course-video-all";
}

export function getCourseArticleHref(video: CourseVideo) {
  return `/ajuda?article=${encodeURIComponent(getCourseArticleId(video))}`;
}

export function getCourseModule(video: CourseVideo) {
  return COURSE_MODULES.find((module) => module.id === video.module) || COURSE_MODULES[0];
}
