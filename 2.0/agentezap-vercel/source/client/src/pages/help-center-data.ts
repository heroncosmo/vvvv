/**
 * help-center-data.ts
 * Dados compartilhados da Central de Ajuda — usados tanto na versão interna quanto na pública
 * FONTE DA VERDADE: editar aqui reflete em ambas as versões
 */
import React from "react";
import {
  Bot, Smartphone, MessageCircle, Wrench, Send, Megaphone, Kanban, Users, Tags, Filter, Plug,
  CalendarClock, BedDouble, Bell, Upload, BookUser, Sparkles, Ban, FormInput, Package,
  UtensilsCrossed, ClipboardList, Mic, Workflow, Ticket, Settings, Receipt, CreditCard,
  LayoutDashboard, Rocket, Brain, Building2, HelpCircle, Home, CheckCircle2, Info,
  AlertCircle, Lightbulb, ArrowRight, ExternalLink
} from "lucide-react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface Article {
  id: string;
  title: string;
  description: string;
  content: ArticleSection[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface VisualStep {
  step: string;
  action: string;
  explain: string;
  screenshot?: string;
  result?: string;
}

export interface ArticleSection {
  type: "text" | "steps" | "tip" | "warning" | "code" | "list" | "screenshot" | "visual-steps" | "heading" | "badge-row";
  heading?: string;
  caption?: string;
  src?: string;
  content?: string | string[] | VisualStep[];
}

export interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  articles: Article[];
}

// ─── Conteúdo dos Artigos ────────────────────────────────────────────────────
export const HELP_CATEGORIES: Category[] = [
  // ══════════════════════════════════════════════════════════════════
  // 1. INÍCIO RÁPIDO (onboarding)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "onboarding",
    title: "Início Rápido",
    description: "Do cadastro ao primeiro atendimento em minutos",
    icon: Rocket,
    color: "text-blue-600",
    articles: [
      {
        id: "onboarding-overview",
        title: "Bem-vindo ao AgenteZap — O que você pode fazer",
        description: "Visão geral do sistema e principais funcionalidades",
        tags: ["começar", "visão geral", "introdução", "o que é"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O AgenteZap é uma plataforma de automação de atendimento para WhatsApp com Inteligência Artificial. Com ele você conecta seu número do WhatsApp e configura um agente de IA que responde automaticamente aos seus clientes, 24 horas por dia.",
          },
          {
            type: "list",
            heading: "O que você pode fazer:",
            content: [
              "💬 Atender clientes via WhatsApp com IA",
              "🤖 Configurar um agente com personalidade e conhecimento do seu negócio",
              "📦 Criar cardápios de delivery e receber pedidos automaticamente",
              "💇 Gerenciar agendamentos de salão de beleza",
              "📅 Organizar agendamentos gerais",
              "📢 Enviar mensagens em massa e campanhas",
              "📊 Visualizar relatórios e funil de vendas",
              "🔔 Configurar follow-up automático para recuperar conversas",
              "🏪 Vender para revenda (plano revendedor)",
            ],
          },
          {
            type: "tip",
            content:
              "Siga o guia de início rápido na tela de Dashboard (3 passos: Conectar WhatsApp → Configurar Agente → Ativar) para entrar em operação em menos de 10 minutos.",
          },
        ],
      },
      {
        id: "onboarding-connect",
        title: "Passo 1 — Como conectar seu WhatsApp",
        description: "Conecte seu número via QR Code em menos de 2 minutos",
        tags: ["qrcode", "whatsapp", "conectar", "conexão", "celular"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A conexão é feita de forma simples, semelhante ao WhatsApp Web. Você precisa do celular com WhatsApp ativo para escanear o QR Code.",
          },
          {
            type: "visual-steps",
            heading: "Como conectar seu WhatsApp:",
            content: [
              {
                step: "1",
                action: 'No menu lateral esquerdo, clique em **"Conexão"**',
                explain: "Você pode acessar diretamente pelo link: agentezap.online/conexao",
                screenshot: "02-conexao.png",
                result: "A tela de Conexão exibe o status atual e um botão para conectar."
              },
              {
                step: "2",
                action: 'Clique no botão **"Conectar WhatsApp"** (caso ainda não esteja conectado)',
                explain: "Um QR Code será gerado na tela. Este código é único e válido por 60 segundos.",
                screenshot: "02-conexao.png",
                result: "O QR Code aparece na tela, pronto para ser escaneado."
              },
              {
                step: "3",
                action: 'No seu **celular**, abra o WhatsApp → toque nos 3 pontos (⋮) → **"Aparelhos conectados"** → **"Conectar aparelho"**',
                explain: "Esta é a mesma função usada para conectar o WhatsApp Web. No iPhone, o caminho é: WhatsApp → Configurações → Aparelhos conectados → Adicionar aparelho.",
                result: "A câmera do celular é ativada para escanear o QR Code."
              },
              {
                step: "4",
                action: "Aponte a câmera do celular para o QR Code exibido na tela do computador",
                explain: "Mantenha o celular estável e bem posicionado. O QR Code será reconhecido automaticamente.",
                screenshot: "02-conexao.png",
                result: "A tela muda para 'WhatsApp Conectado' com o número do seu celular exibido em verde."
              },
            ] as any,
          },
          {
            type: "warning",
            content:
              "O QR Code expira em 60 segundos. Se ele sumir, clique em 'Recarregar QR Code' para gerar um novo. Use um número que não seja usado em outro dispositivo ou WhatsApp Web simultaneamente.",
          },
          {
            type: "tip",
            content:
              "Recomendamos usar um número de chip dedicado (não o número pessoal). Assim o atendimento fica separado e você evita problemas.",
          },
        ],
      },
      {
        id: "onboarding-agent",
        title: "Passo 2 — Configurar seu Agente IA",
        description: "Dê personalidade, nome e conhecimento ao seu agente",
        tags: ["agente", "ia", "configurar", "prompt", "nome", "personalidade"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Depois de conectar o WhatsApp, vá em "Meu Agente IA" no menu lateral. Aqui você define como o agente vai se comportar.',
          },
          {
            type: "visual-steps",
            heading: "Configuração básica do seu Agente IA:",
            content: [
              {
                step: "1",
                action: 'Clique em **"Meu Agente IA"** no menu lateral esquerdo',
                explain: "Você pode acessar diretamente pelo link: agentezap.online/meu-agente-ia",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "A tela do Editor de Agente é aberta com o Simulador WhatsApp ao lado direito."
              },
              {
                step: "2",
                action: 'Na aba **Chat** (padrão), descreva como quer que seu agente se comporte',
                explain: "Digite uma instrução clara em português. Por exemplo: 'Você é a Mari, atendente da Lanchonete do João. Seja simpática, responda em português. Sempre pergunte o nome do cliente. Nosso cardápio: X-burguer R$15, Coca R$6.' Seja específico sobre o nome do negócio, produtos, horário de funcionamento e tom de voz.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O agente confirma que ajustou o prompt com base na sua instrução."
              },
              {
                step: "3",
                action: 'Verifique o prompt gerado clicando na aba **"Editar"**',
                explain: "A aba Editar mostra o texto completo do prompt. Você pode revisar e fazer ajustes manuais se necessário.",
                screenshot: "03-agente-ia-editor.png",
                result: "Você vê o texto completo das instruções do agente em modo de edição."
              },
              {
                step: "4",
                action: "Ative o agente pelo **toggle 'IA ON/OFF'** no topo da tela",
                explain: "O toggle verde 'IA ON' indica que o agente está ativo e responderá mensagens automaticamente. 'IA OFF' significa que o agente está pausado.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O toggle fica verde com o texto 'IA ON'. O agente começa a responder automaticamente."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              'Exemplo de bom prompt: "Você é a Mari, atendente virtual da Lanchonete do João. Seja simpática, responda em português brasileiro. Sempre pergunte o nome do cliente. Nosso cardápio é: X-burguer R$15, Coca R$6..."',
          },
        ],
      },
      {
        id: "onboarding-activate",
        title: "Passo 3 — Ativar e testar o agente",
        description: "Valide que o agente está respondendo corretamente",
        tags: ["ativar", "testar", "teste", "simulador"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Com WhatsApp conectado e agente configurado, é hora de testar antes de ativar para o público.',
          },
          {
            type: "visual-steps",
            heading: "Como ativar e testar seu agente:",
            content: [
              {
                step: "1",
                action: 'Vá em **"Meu Agente IA"** → certifique-se que o toggle **"IA ON"** está ativo (verde)',
                explain: "O toggle fica no topo da tela. Quando verde, o agente está ativo e responde automaticamente. Quando cinza, o agente está pausado.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "Toggle verde mostrando 'IA ON'."
              },
              {
                step: "2",
                action: "No **Simulador WhatsApp** (painel direito), digite uma mensagem como se fosse um cliente",
                explain: "O simulador fica à direita da tela. Digite perguntas que seus clientes fariam: 'Olá, qual o preço?', 'Vocês estão abertos?', 'Preciso de ajuda'. Veja se as respostas fazem sentido.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O agente responde em tempo real no simulador, mostrando exatamente como responderá no WhatsApp real."
              },
              {
                step: "3",
                action: "Se as respostas não estiverem boas, ajuste o prompt pelo **Chat** e repita o teste",
                explain: "Use a aba Chat para fazer ajustes em linguagem natural: 'Seja mais direto', 'Não mencione concorrentes', 'Sempre pergunte o nome do cliente antes de responder'.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O agente aplica os ajustes e as próximas respostas já refletem as mudanças."
              },
              {
                step: "4",
                action: "Envie uma mensagem de **outro celular** para o número conectado para testar na prática",
                explain: "O teste no simulador é ótimo, mas o teste real com outro celular garante que tudo funciona no WhatsApp de verdade. Peça para um amigo ou use um número secundário.",
                result: "O outro celular recebe a resposta automática do agente — confirmando que tudo está funcionando!"
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Envie uma mensagem de outro celular para o número conectado para testar na prática. A IA responderá automaticamente.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // CURSO EM VIDEO
  // ══════════════════════════════════════════════════════════════════
  {
    id: "course-video",
    title: "Curso em Video",
    description: "Aulas do canal AgenteZap organizadas dentro da plataforma",
    icon: BookUser,
    color: "text-red-600",
    articles: [
      {
        id: "course-video-all",
        title: "Curso AgenteZap dentro da plataforma",
        description: "Assista as aulas praticas na ordem certa, sem precisar sair para o YouTube",
        tags: ["curso", "video", "youtube", "aulas", "treinamento", "tutorial"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O curso em video reune as aulas publicadas no canal AgenteZap e organiza tudo por ordem de uso: primeiro configurar o agente, depois operar conversas, ativar automacoes, usar CRM e integrar formularios. As aulas de apresentacao ficam como extras no final.",
          },
          {
            type: "tip",
            content:
              "Dentro do painel, clique em Curso AgenteZap no menu principal. Em paginas com aula especifica, use a entrada Aula desta pagina no menu para abrir a Central de Ajuda direto no tutorial correto.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. DASHBOARD
  // ══════════════════════════════════════════════════════════════════
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Entenda os números e estatísticas do seu atendimento",
    icon: LayoutDashboard,
    color: "text-slate-600",
    articles: [
      {
        id: "dashboard-overview",
        title: "Como ler o Dashboard",
        description: "Entenda cada indicador da tela inicial",
        tags: ["dashboard", "estatísticas", "métricas", "conversas", "status"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O Dashboard é a primeira tela que você vê ao entrar. Ele mostra uma visão rápida da saúde do seu atendimento.",
          },
          {
            type: "screenshot",
            src: "01-dashboard.png",
            caption: "Dashboard — visão geral com cards de métricas, status do WhatsApp e guia de início rápido",
          },
          {
            type: "list",
            heading: "O que cada card significa:",
            content: [
              "**Total de Conversas** — quantos contatos já iniciaram conversa com seu número.",
              "**Não Lidas** — conversas que chegaram mas ainda não foram visualizadas.",
              "**Mensagens Hoje** — total de mensagens (enviadas + recebidas) no dia.",
              "**Status WhatsApp** — se o número está 'Conectado' (verde) ou desconectado.",
              "**Status do Agente IA** — 'Ativo' significa que o robô está respondendo automaticamente.",
              "**Respostas do Agente** — quantas mensagens automáticas o agente enviou no total.",
            ],
          },
          {
            type: "tip",
            content:
              "Se o Status WhatsApp aparecer 'Desconectado', vá em Conexão e reconecte escaneando o QR Code novamente.",
          },
        ],
      },
      {
        id: "dashboard-guide-steps",
        title: "Guia de Início no Dashboard",
        description: "O que significa cada passo do guia de início rápido",
        tags: ["guia", "tarefas", "onboarding", "checklist"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'O card "Prepare-se para vender" no dashboard mostra 3 tarefas. Cada uma leva você para a etapa seguinte da configuração.',
          },
          {
            type: "list",
            heading: "As 3 tarefas:",
            content: [
              "**Conectar WhatsApp** → vai para a tela de Conexão para escanear QR Code.",
              "**Configurar Agente IA** → vai para Meu Agente IA para escrever o prompt.",
              "**Ativar o Agente** → confirma que o agente está ativo e pronto.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. CONVERSAS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "conversations",
    title: "Conversas",
    description: "Gerencie todas as conversas do WhatsApp em um só lugar",
    icon: MessageCircle,
    color: "text-green-600",
    articles: [
      {
        id: "conversations-overview",
        title: "Como funciona a lista de conversas",
        description: "Entenda a tela de conversas e como navegar nela",
        tags: ["conversas", "lista", "chat", "mensagens", "whatsapp"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela de "Conversas" mostra todas as conversas do seu WhatsApp, semelhante ao app do WhatsApp, mas com recursos extras de IA e gestão.',
          },
          {
            type: "screenshot",
            src: "04-conversas-lista.png",
            caption: "Tela de Conversas — lista de todas as conversas com filtros, busca e indicadores",
          },
          {
            type: "list",
            heading: "O que você vê na lista:",
            content: [
              "📱 Nome ou número do contato",
              "⏰ Horário da última mensagem",
              "💬 Prévia da última mensagem",
              "🔴 Indicador de não lida (bolinha colorida)",
              "🏷️ Etiquetas atribuídas",
              "🤖 Status da IA (ativa/pausada para aquela conversa)",
            ],
          },
          {
            type: "tip",
            content:
              "Clique em qualquer conversa para abrir o chat. No chat, você pode ver o histórico completo e enviar mensagens manualmente mesmo com a IA ativa.",
          },
        ],
      },
      {
        id: "conversations-ia-pause",
        title: "Como pausar a IA em uma conversa",
        description: "Assuma o atendimento manual quando necessário",
        tags: ["pausar", "ia", "manual", "intervenção", "humano"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Às vezes você precisa responder manualmente sem que a IA interfira. O sistema permite pausar a IA por conversa, individualmente.",
          },
          {
            type: "screenshot",
            src: "04-conversa-aberta.png",
            caption: "Tela de conversa aberta — o toggle de IA fica no topo do painel de chat",
          },
          {
            type: "visual-steps",
            heading: "Como pausar a IA em uma conversa:",
            content: [
              {
                step: "1",
                action: 'Abra a **Conversa** que deseja assumir manualmente em **Conversas**',
                explain: "Clique na conversa da lista. A tela de chat abre com o histórico e os controles.",
                screenshot: "04-conversas-lista.png",
                result: "A conversa fica aberta com o painel de chat à direita."
              },
              {
                step: "2",
                action: "No topo do painel de chat, localize o toggle **'IA'** (com ícone de robô ⚡) e desative",
                explain: "O toggle fica no cabeçalho da conversa. Quando está verde/ativo, a IA está respondendo automaticamente. Ao desativar, você assume o controle manual.",
                screenshot: "04-conversa-aberta.png",
                result: "Toggle muda para desativado. A IA para de responder nesta conversa específica. As demais conversas continuam com IA ativa."
              },
              {
                step: "3",
                action: "Digite e envie as mensagens manuais normalmente",
                explain: "Use o campo de texto no rodapé para digitar. Você pode usar as respostas rápidas (⚡), enviar mídia ou enviar mensagem de voz.",
                result: "Suas mensagens são enviadas diretamente para o cliente."
              },
              {
                step: "4",
                action: "Quando terminar, reative o toggle de IA para que o agente retome",
                explain: "Ao reativar, a IA volta a monitorar e responder automaticamente a partir da próxima mensagem do cliente.",
                result: "Toggle volta para verde. O agente retoma o atendimento automático."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Use a pausa para situações especiais: negociações complexas, reclamações críticas ou quando o cliente pedir especificamente por atendimento humano. Para a maioria das situações, a IA consegue lidar sozinha.",
          },
          {
            type: "tip",
            content:
              "Você também pode configurar o Follow-up para que a IA reative automaticamente após X horas de inatividade.",
          },
        ],
      },
      {
        id: "conversations-labels",
        title: "Usar etiquetas para organizar conversas",
        description: "Classifique e filtre conversas com etiquetas personalizadas",
        tags: ["etiquetas", "tags", "filtro", "organizar", "classificar"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Etiquetas permitem categorizar conversas (ex: 'Lead Quente', 'Aguardando Pagamento', 'VIP'). A IA também pode atribuir etiquetas automaticamente.",
          },
          {
            type: "steps",
            heading: "Como usar etiquetas:",
            content: [
              'Crie etiquetas em "Ferramentas → Etiquetas".',
              "Abra uma conversa.",
              "Clique no ícone de etiqueta dentro do chat.",
              "Selecione as etiquetas desejadas.",
              "Na lista de conversas, use o filtro para ver só as conversas com determinada etiqueta.",
            ],
          },
        ],
      },
      {
        id: "conversations-quick-replies",
        title: "Respostas rápidas",
        description: "Envie mensagens pré-definidas com agilidade",
        tags: ["respostas rápidas", "atalho", "template", "mensagem padrão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Respostas rápidas são mensagens pré-definidas que você envia com poucos cliques, sem precisar digitar tudo do zero.",
          },
          {
            type: "steps",
            heading: "Como usar respostas rápidas:",
            content: [
              "Abra uma conversa.",
              "No campo de texto, clique no ícone de raio (⚡) ou use o atalho '/'.",
              "Selecione a resposta rápida desejada.",
              "A mensagem será inserida no campo. Edite se necessário e envie.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. MEU AGENTE IA
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ai-agent",
    title: "Meu Agente IA",
    description: "Configure o comportamento, personalidade e conhecimento do agente",
    icon: Bot,
    color: "text-purple-600",
    articles: [
      {
        id: "ai-agent-overview",
        title: "Visão geral da tela Meu Agente IA",
        description: "Entenda o layout: abas de configuração e simulador ao lado direito",
        tags: ["meu agente", "visão geral", "layout", "abas", "simulador"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela "Meu Agente IA" é o coração do sistema. Ela fica dividida em duas colunas: à esquerda as abas de configuração (Chat, Editar, Mídias, Config, Corrigir, Fluxo) e à direita o Simulador WhatsApp onde você testa em tempo real.',
          },
          {
            type: "screenshot",
            src: "03-agente-ia-chat-editor.png",
            caption: "Tela Meu Agente IA — coluna esquerda (editor/chat) + coluna direita (simulador WhatsApp)",
          },
          {
            type: "badge-row",
            content: ["Chat", "Editar", "Mídias", "Config", "Corrigir", "Fluxo"],
          },
          {
            type: "list",
            heading: "O que cada aba faz:",
            content: [
              "💬 **Chat** — Calibra o agente via conversa: você digita uma instrução em linguagem natural e a IA ajusta o prompt automaticamente.",
              "✏️ **Editar** — Editor de código do prompt (texto bruto). Para quem quer controle total da instrução.",
              "🖼️ **Mídias** — Sobe imagens, áudios e vídeos que o agente envia automaticamente.",
              "⚙️ **Config** — Ajustes técnicos: delay de resposta, tamanho máximo, gatilhos de pausa.",
              "🔧 **Corrigir** — A IA revisa e corrige o prompt atual, apontando inconsistências.",
              "🔀 **Fluxo** — Cria roteiros de conversa estruturados (chatbot clássico, sem IA).",
            ],
          },
          {
            type: "tip",
            content:
              "Fluxo recomendado: calibre pelo Chat → confira no Editar → suba Mídias → ajuste o Config → valide no Simulador. Só ative para o público depois.",
          },
        ],
      },
      {
        id: "ai-agent-chat",
        title: "Aba Chat — Calibrar o agente com linguagem natural",
        description: "Ensine o agente digitando instruções em português, como conversa",
        tags: ["chat", "calibrar", "calibração", "instrução", "linguagem natural", "bot"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A aba Chat é onde você se comunica com o agente para calibrá-lo. Em vez de escrever código de prompt, você digita em português do dia a dia: 'Seja mais formal', 'Adicione emojis', 'Não mencione concorrentes'. O agente edita o próprio prompt com base na sua instrução.",
          },
          {
            type: "visual-steps",
            heading: "Tutorial passo a passo — Calibrar via Chat",
            content: [
              {
                step: "1",
                action: "Acesse **Meu Agente IA** no menu lateral esquerdo",
                explain: "Ao clicar, você já entra diretamente na aba Chat. O histórico de calibrações anteriores fica no painel central, mostrando o que foi solicitado e o que foi alterado.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "Você vê o painel do Chat com a caixa de texto 'Descreva como deseja alterar seu agente...' na parte inferior."
              },
              {
                step: "2",
                action: "Digite uma instrução de calibração no campo de texto no rodapé do painel",
                explain: "Exemplos de instruções que funcionam bem: 'Seja mais direto e objetivo nas respostas', 'Sempre cumprimente o cliente pelo nome', 'Não use emojis', 'Adicione o link do cardápio quando perguntarem sobre preços'. Escreva como falaria para um funcionário.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O campo de texto fica preenchido. Você pode usar os botões de atalho: 'Mais formal', 'Mais vendedor', 'Mais curto'."
              },
              {
                step: "3",
                action: "Clique na seta de envio (→) ou pressione **Enter**",
                explain: "O sistema processa sua instrução e aplica as mudanças no prompt do agente. Você verá a resposta do sistema confirmando o que foi alterado, junto com um score de validação (ex: Score 95/100). Se o score for abaixo de 70, as mudanças não foram aplicadas — reformule a instrução.",
                result: "Aparece a confirmação 'Edição aplicada ✅' com o score. O prompt foi atualizado automaticamente."
              },
              {
                step: "4",
                action: "Teste no **Simulador** à direita para validar se a mudança ficou boa",
                explain: "O Simulador WhatsApp ao lado direito permite que você escreva como um cliente e veja a resposta em tempo real. É a forma mais rápida de validar se a calibração funcionou como esperado.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "A resposta do simulador reflete a nova calibração. Se não estiver satisfatório, faça mais ajustes pelo Chat."
              },
            ] as any,
          },
          {
            type: "list",
            heading: "Botões de atalho de calibração:",
            content: [
              "**Mais formal** — ajusta o tom para linguagem mais corporativa e profissional.",
              "**Mais vendedor** — adiciona persuasão, gatilhos de urgência e escassez.",
              "**Mais curto** — reduz o tamanho das respostas, tornando-as mais diretas.",
            ],
          },
          {
            type: "warning",
            content:
              "Se receber 'Calibração falhou: Score X/100 (mínimo: 70)', sua instrução pode ser ambígua ou contraditória com o prompt atual. Tente reescrever de forma mais clara e objetiva.",
          },
          {
            type: "tip",
            content:
              "Depois de vários ajustes, use o botão 'Histórico' (↺ ícone) para ver e desfazer alterações passadas. Funciona como um ctrl+z do seu agente.",
          },
        ],
      },
      {
        id: "ai-agent-prompt",
        title: "Aba Editar — Editor direto do prompt",
        description: "Edite o texto bruto das instruções do agente diretamente",
        tags: ["prompt", "instruções", "editar", "configuração", "ia", "agente", "personalidade", "editor"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "A aba Editar exibe o prompt completo do agente em um editor de código de fundo preto. Aqui você tem controle total sobre cada palavra das instruções — ideal para ajustes precisos, adicionar seções inteiras ou revisar o texto gerado pela aba Chat.",
          },
          {
            type: "visual-steps",
            heading: "Tutorial passo a passo — Editar o prompt diretamente",
            content: [
              {
                step: "1",
                action: "Em **Meu Agente IA**, clique na aba **Editar** (ícone </>)",
                explain: "O editor de código abre mostrando o prompt atual em texto verde sobre fundo preto. Todo o conteúdo é editável — não existe botão de 'salvar automático', você precisará salvar manualmente.",
                screenshot: "03b-agente-ia-editar-prompt.png",
                result: "O editor aparece com o prompt atual formatado, pronto para edição."
              },
              {
                step: "2",
                action: "Clique no texto dentro do editor e faça suas alterações",
                explain: "Use este editor para: adicionar novas seções de produto, alterar preços, mudar o tom da escrita, adicionar FAQs, inserir instruções de fluxo. Tudo que estiver neste texto será o 'manual' do agente. Quanto mais rico, melhor o resultado.",
                result: "O texto fica editável no cursor. Você vê as mudanças em tempo real."
              },
              {
                step: "3",
                action: "Role para baixo e clique no botão de **Salvar** (ícone disco/save)",
                explain: "Depois de editar, é obrigatório clicar em Salvar. Se fechar a aba sem salvar, todas as alterações são perdidas. O sistema valida o prompt automaticamente ao salvar.",
                result: "Prompt salvo. Notificação de confirmação aparece no topo da tela."
              },
              {
                step: "4",
                action: "Vá para o **Simulador** e teste as mudanças",
                explain: "Sempre valide no simulador após editar. Perguntas de teste: saudação inicial, pergunta de preço, situação fora do escopo, pedido de informação sensível.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "O simulador já usa o prompt atualizado. Teste pelo menos 5 cenários diferentes."
              },
            ] as any,
          },
          {
            type: "list",
            heading: "Estrutura recomendada para o prompt:",
            content: [
              "**Seção 1 — Identidade:** nome do agente, cargo, empresa, tom de voz.",
              "**Seção 2 — Contexto do negócio:** o que faz, diferenciais, localização, horários.",
              "**Seção 3 — Produtos/Serviços:** lista completa com nomes e preços.",
              "**Seção 4 — Regras de comportamento:** o que deve e o que não deve fazer.",
              "**Seção 5 — Fluxo de atendimento:** como conduzir a conversa do início ao fechamento.",
              "**Seção 6 — Respostas padrão:** como responder a dúvidas frequentes.",
            ],
          },
          {
            type: "tip",
            content:
              "Para prompts longos: use a aba Chat para ajustes pequenos e a aba Editar para revisões estruturais completas. Uma boa divisão é: 80% construído pelo Chat (IA edita por você) + 20% ajuste fino manual no Editar.",
          },
          {
            type: "warning",
            content:
              "Não remova acidentalmente seções inteiras do prompt. Se isso acontecer, use o botão 'Histórico' na aba Chat para restaurar uma versão anterior.",
          },
        ],
      },
      {
        id: "ai-agent-calibration",
        title: "Aba Config — Configurações avançadas do agente",
        description: "Delay de resposta, tamanho de mensagem, gatilhos de pausa e mais",
        tags: ["calibrar", "calibração", "config", "configuração", "delay", "gatilho", "pausa", "ajuste fino"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "A aba Config controla o comportamento técnico do agente: quanto tempo ele espera antes de responder, qual o tamanho máximo das mensagens, quando pausar automaticamente, e quais gatilhos de texto ativam ou desativam o bot.",
          },
          {
            type: "visual-steps",
            heading: "Tutorial passo a passo — Configurar o agente",
            content: [
              {
                step: "1",
                action: "Acesse **Meu Agente IA** → clique na aba **Config**",
                explain: "A aba Config exibe as configurações técnicas do agente. É a tela certa quando você quer ajustar o timing das respostas ou controlar quando o bot deve entrar em modo silencioso.",
                screenshot: "03c-agente-ia-config.png",
                result: "Você vê as seções: Delay de Resposta, Tamanho das Mensagens, e Gatilho."
              },
              {
                step: "2",
                action: "Ajuste o **Delay de Resposta** (padrão: 10 segundos)",
                explain: "O delay é o tempo que o agente espera antes de responder após receber uma mensagem. Um delay de 10-30 segundos faz o agente parecer mais humano, como se ele estivesse 'digitando'. Um delay muito curto (0-3s) parece robótico.",
                screenshot: "03c-agente-ia-config.png",
                result: "O slider ajusta o tempo em segundos. 'Rápido (10s)' é o mínimo — para a maioria dos negócios, 15-30s é ideal."
              },
              {
                step: "3",
                action: "Configure o **Tamanho das Mensagens** (padrão: 300 caracteres)",
                explain: "Define o tamanho máximo de cada bolha de resposta. Mensagens longas demais são cansativas no WhatsApp. Para atendimento ao cliente, 200-400 caracteres é o ideal. Para respostas técnicas ou tutoriais, pode subir para 800.",
                screenshot: "03c-agente-ia-config.png",
                result: "O agente vai quebrar respostas longas automaticamente para respeitar o limite configurado."
              },
              {
                step: "4",
                action: "Configure os **Gatilhos** (palavras que pausam/reativam o bot)",
                explain: "Gatilhos são palavras-chave que controlam o bot durante a conversa. Exemplo: se o cliente digitar 'humano' ou 'atendente', o bot pausa e notifica você. Se você digitar 'bot' em uma conversa, o bot pode reativar. Escreva os gatilhos separados por vírgula.",
                screenshot: "03c-agente-ia-config.png",
                result: "Os gatilhos ficam salvos e entram em vigor imediatamente. Teste enviando a palavra-gatilho no simulador."
              },
              {
                step: "5",
                action: "Clique em **Salvar** para confirmar as alterações",
                explain: "Sem salvar, as configurações são perdidas ao trocar de aba. Sempre confirme antes de sair.",
                result: "Configurações salvas. O agente já opera com os novos parâmetros."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Delay recomendado por tipo de negócio: delivery (10-15s — respostas rápidas são importantes), consultórios e advogados (20-30s — aparência mais humana), e-commerce (15s — balanço entre velocidade e naturalidade).",
          },
        ],
      },
      {
        id: "ai-agent-simulator",
        title: "Simulador WhatsApp — Testar o agente em tempo real",
        description: "Use o simulador do lado direito para validar antes de ativar",
        tags: ["testar", "simulador", "teste", "agente", "validar", "conversa de teste"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O Simulador fica permanentemente no lado direito da tela Meu Agente IA. Ele imita o WhatsApp — bolhas de mensagem, leitura confirmada, digitando... — e usa exatamente o mesmo agente que vai responder seus clientes reais.",
          },
          {
            type: "screenshot",
            src: "03-agente-ia-chat-editor.png",
            caption: "Lado direito da tela: Simulador WhatsApp — 'Teste como seu agente responde. Digite uma mensagem abaixo.'",
          },
          {
            type: "visual-steps",
            heading: "Como usar o simulador",
            content: [
              {
                step: "1",
                action: "Localize o **Simulador WhatsApp** no lado direito da tela",
                explain: "O simulador fica visível assim que você entra em Meu Agente IA. Ele tem o cabeçalho verde 'Simulador WhatsApp — Teste seu agente em tempo real' e um botão 'Limpar' para resetar.",
                screenshot: "03-agente-ia-chat-editor.png",
                result: "Você vê a tela do simulador com a mensagem inicial 'Teste como seu agente responde. Digite uma mensagem abaixo.'"
              },
              {
                step: "2",
                action: "Digite uma mensagem no campo 'Digite sua mensagem...' no rodapé do simulador",
                explain: "Escreva como se fosse um cliente real — pode ser uma saudação ('Oi!'), uma pergunta específica ('Qual o preço?'), ou uma situação difícil ('Quero cancelar'). O simulador é isolado dos clientes reais.",
                result: "Sua mensagem aparece como bolha azul/cinza do lado direito (você = cliente)."
              },
              {
                step: "3",
                action: "Aguarde a resposta do agente aparecer no painel",
                explain: "O agente processa sua mensagem usando o prompt atual e retorna uma resposta. O delay configurado no Config também se aplica aqui — se estiver em 30s, vai esperar 30s para responder.",
                result: "A resposta aparece como bolha do agente no lado esquerdo do simulador."
              },
              {
                step: "4",
                action: "Clique em **Limpar** para começar um novo teste do zero",
                explain: "Ao limpar, o histórico de conversa é apagado e o simulador age como se fosse um novo cliente entrando em contato pela primeira vez. Útil para testar o fluxo de acolhimento inicial.",
                result: "Simulador resetado, pronto para um novo cenário de teste."
              },
            ] as any,
          },
          {
            type: "list",
            heading: "Cenários obrigatórios antes de ativar:",
            content: [
              "✅ Saudação simples: 'Oi', 'Bom dia', 'Olá'",
              "✅ Pergunta de preço: 'Quanto custa X?', 'Qual o valor?'",
              "✅ Pergunta de horário: 'Que horas vocês abrem?'",
              "✅ Pedido completo: simule um cliente fazendo um pedido do início ao fim",
              "✅ Reclamação: 'Tive um problema, quero resolver'",
              "✅ Mensagem fora do escopo: 'Você pode me ajudar com X?' (algo que não faz parte do negócio)",
              "✅ Gatilho de pausa: teste a palavra-gatilho configurada no Config",
            ],
          },
          {
            type: "tip",
            content:
              "Peça para um amigo testar sem ver o prompt. Se ele conseguir completar uma jornada de compra/atendimento com naturalidade, o agente está pronto. Se ele travar em algum ponto, é sinal de que o prompt precisa cobrir aquele cenário.",
          },
        ],
      },
      {
        id: "ai-agent-media",
        title: "Aba Mídias — Imagens, áudios e vídeos automáticos",
        description: "Configure arquivos que o agente envia automaticamente na hora certa",
        tags: ["mídia", "imagem", "áudio", "vídeo", "pdf", "envio automático", "biblioteca", "cardápio"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Na aba Mídias você cadastra arquivos (imagens, áudios, vídeos, PDFs) e ensina ao agente quando cada arquivo deve ser enviado. A IA decide sozinha o momento certo — quando o cliente perguntar sobre cardápio, ela envia a imagem do cardápio. Quando perguntar como funciona, ela envia o vídeo de demonstração.",
          },
          {
            type: "screenshot",
            src: "09-biblioteca-midias.png",
            caption: "Biblioteca de Mídias — cada card mostra o tipo, nome, descrição e instrução de quando usar",
          },
          {
            type: "visual-steps",
            heading: "Como adicionar uma nova mídia",
            content: [
              {
                step: "1",
                action: "Acesse **Meu Agente IA** → aba **Mídias**",
                explain: "A Biblioteca de Mídias exibe todos os arquivos já cadastrados em cards. Cada card mostra o nome, tipo (Vídeo/Áudio/Imagem) e a instrução de quando usar. O botão '+ Nova Mídia' fica no topo direito.",
                screenshot: "09-biblioteca-midias.png",
                result: "Você vê a lista de mídias cadastradas com os cards de cada arquivo."
              },
              {
                step: "2",
                action: "Clique em **+ Nova Mídia**",
                explain: "Abre o formulário de cadastro de nova mídia. Você precisará: fazer upload do arquivo, dar um nome, escrever uma descrição e definir quando deve ser enviado.",
                result: "Modal de cadastro de mídia abre na tela."
              },
              {
                step: "3",
                action: "Faça o upload do arquivo clicando na área pontilhada",
                explain: "Arraste e solte o arquivo ou clique para selecionar. Formatos aceitos: JPG, PNG, MP3, OGG, MP4, PDF, DOCX, XLSX. Limite: 16MB para vídeos, 10MB para áudios e documentos, 5MB para imagens.",
                result: "Arquivo carregado e preview exibido no formulário."
              },
              {
                step: "4",
                action: "Preencha o **Nome** e a **Descrição** do arquivo",
                explain: "O nome é só para sua identificação (ex: 'Cardápio Atualizado Jan/2026'). A descrição deve ser clara sobre o que o arquivo contém — ela ajuda a IA a decidir quando usar.",
                result: "Campos preenchidos. O nome aparecerá no card da mídia."
              },
              {
                step: "5",
                action: "Escreva a instrução **Quando usar** com detalhes",
                explain: "Este é o campo mais importante! Seja específico: 'Envie quando o cliente perguntar pelo cardápio, quiser ver os preços, ou perguntar o que você vende'. Instruções vagas como 'envie quando relevante' fazem a IA enviar no momento errado.",
                screenshot: "09-biblioteca-midias.png",
                result: "Instrução salva. A IA usará este texto para decidir quando enviar o arquivo."
              },
              {
                step: "6",
                action: "Clique em **Salvar**",
                explain: "A mídia é cadastrada e aparece na lista. A partir deste momento, o agente já pode enviá-la automaticamente nas conversas com os clientes.",
                result: "Novo card aparece na Biblioteca de Mídias. Teste no simulador enviando uma mensagem que deveria acionar o arquivo."
              },
            ] as any,
          },
          {
            type: "list",
            heading: "Tipos de arquivo suportados:",
            content: [
              "🖼️ **Imagem**: JPG, PNG, WebP — até 5MB (cardápio, foto do produto, localização)",
              "🎵 **Áudio**: MP3, OGG, M4A — até 10MB (enviado como mensagem de voz no WhatsApp)",
              "🎬 **Vídeo**: MP4 — até 16MB (demo do produto, tutorial)",
              "📄 **Documento**: PDF, XLSX, DOCX — até 10MB (tabela de preços, contrato, proposta)",
            ],
          },
          {
            type: "tip",
            content:
              "Use áudio para dar um toque humano ao atendimento. Grave um áudio de boas-vindas seu mesmo (ou da sua equipe) e instrua o agente a enviá-lo na primeira interação. Aumenta muito a conexão e a taxa de resposta.",
          },
        ],
      },
      {
        id: "ai-agent-flow",
        title: "Aba Fluxo — Chatbot estruturado sem IA",
        description: "Crie roteiros fixos de conversa para menus e coleta de dados",
        tags: ["fluxo", "chatbot", "automação", "menu", "bot", "sem ia", "construtor", "roteiro"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O Fluxo é um chatbot baseado em regras — diferente da IA que improvisa, o fluxo segue exatamente o roteiro que você definiu. Ideal para: menus numéricos ('Digite 1 para pedidos, 2 para suporte'), coleta de dados (nome, CPF, endereço), ou fluxos comerciais previsíveis (cotação, agendamento).",
          },
          {
            type: "visual-steps",
            heading: "Como criar um fluxo de conversa",
            content: [
              {
                step: "1",
                action: "Acesse **Meu Agente IA** → aba **Fluxo** (ou menu Ferramentas → Construtor de Fluxo)",
                explain: "O Construtor de Fluxo exibe os fluxos existentes em cards. Cada fluxo tem um nome, uma palavra-gatilho e um status (ativo/inativo). Clique em '+ Novo Fluxo' para criar.",
                result: "Você vê a lista de fluxos cadastrados ou uma tela vazia se for o primeiro."
              },
              {
                step: "2",
                action: "Defina o **nome** do fluxo e a **palavra-gatilho**",
                explain: "A palavra-gatilho é o que ativa este fluxo. Quando o cliente digitar essa palavra, o chatbot entra no fluxo automaticamente. Exemplos de boas palavras-gatilho: 'menu', 'pedido', 'oi', 'começar', 'cardápio'.",
                result: "Nome e gatilho configurados. Você pode avançar para criar os nós."
              },
              {
                step: "3",
                action: "Adicione o primeiro **nó de mensagem** (o agente fala)",
                explain: "Um nó de mensagem envia um texto para o cliente. Exemplo: 'Olá! Escolha uma opção: 1 - Ver cardápio | 2 - Falar com atendente | 3 - Horários'. Este é normalmente o primeiro nó do fluxo.",
                result: "Nó criado no canvas do construtor."
              },
              {
                step: "4",
                action: "Adicione um **nó de pergunta** (aguarda resposta do cliente)",
                explain: "O nó de pergunta pausa o fluxo e espera o cliente digitar. Você pode criar ramificações — se o cliente digitar '1', vai para um caminho; se digitar '2', vai para outro. Conecte os nós arrastando as setas.",
                result: "Ramificações configuradas. O fluxo bifurca conforme a resposta do cliente."
              },
              {
                step: "5",
                action: "Finalize com um **nó de saída** para retornar ao agente IA",
                explain: "IMPORTANTE: sempre termine o fluxo com um nó de saída (finalizar). Sem ele, o cliente fica 'preso' no fluxo para sempre, mesmo depois de terminar o atendimento.",
                result: "Fluxo completo com início, meio e saída."
              },
              {
                step: "6",
                action: "Ative o fluxo com o toggle e teste no simulador",
                explain: "Com o fluxo ativo, qualquer cliente que digitar a palavra-gatilho entra no roteiro. O fluxo tem prioridade sobre a IA enquanto estiver ativo. Teste usando a palavra-gatilho no simulador.",
                result: "Fluxo rodando. O simulador executa o roteiro passo a passo conforme as respostas."
              },
            ] as any,
          },
          {
            type: "warning",
            content:
              "Quando um fluxo está ativo e é acionado, a IA para de responder até o fluxo terminar. Crie sempre um nó de saída claro ao final do fluxo para liberar o cliente de volta ao atendimento normal.",
          },
          {
            type: "tip",
            content:
              "Combine Fluxo + IA: use o fluxo para coletar dados iniciais (nome, tipo de serviço, urgência) e, ao final, entregue o contexto coletado para a IA continuar o atendimento de forma personalizada.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 5. CONEXÃO (WhatsApp)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "connection",
    title: "Conexão WhatsApp",
    description: "Conecte, gerencie e resolva problemas com seu WhatsApp",
    icon: Smartphone,
    color: "text-green-700",
    articles: [
      {
        id: "connection-qrcode",
        title: "Conectar via QR Code — Passo a passo detalhado",
        description: "Instruções completas para conectar o WhatsApp",
        tags: ["qrcode", "conectar", "whatsapp", "celular", "conexão"],
        difficulty: "beginner",
        content: [
          {
            type: "screenshot",
            src: "02-conexao.png",
            caption: "Tela de Conexão — status da conexão e botão para conectar seu WhatsApp via QR Code",
          },
          {
            type: "visual-steps",
            heading: "Passo a passo para conectar:",
            content: [
              {
                step: "1",
                action: 'Acesse **"Conexão"** no menu lateral esquerdo',
                explain: "Clique em 'Conexão' no menu. Você pode acessar diretamente pelo link: agentezap.online/conexao",
                screenshot: "02-conexao.png",
                result: "A tela de Conexão é exibida mostrando o status atual e o botão de conexão."
              },
              {
                step: "2",
                action: 'Clique em **"Conectar WhatsApp"**',
                explain: "Um QR Code único será gerado para você. Este código é válido por 60 segundos — depois disso, expira automaticamente por segurança.",
                screenshot: "02-conexao.png",
                result: "O QR Code aparece na tela, pronto para ser escaneado."
              },
              {
                step: "3",
                action: "No celular, abra o **WhatsApp** → toque nos **3 pontinhos (⋮)** → **Aparelhos conectados** → **Conectar um aparelho**",
                explain: "No iPhone: WhatsApp → Configurações → Aparelhos conectados → Adicionar aparelho. Este processo é idêntico ao WhatsApp Web.",
                result: "A câmera do celular abre pronta para escanear."
              },
              {
                step: "4",
                action: "Aponte a câmera do celular para o QR Code na tela",
                explain: "Posicione o QR Code dentro da moldura da câmera. Mantenha firme por 2-3 segundos até o reconhecimento automático.",
                result: "O celular vibra/pisca confirmando a leitura."
              },
              {
                step: "5",
                action: "Aguarde a confirmação — até 30 segundos",
                explain: "A tela atualiza automaticamente. Você não precisa recarregar a página.",
                screenshot: "02-conexao.png",
                result: "Status muda para 'Conectado' em verde com o número do seu WhatsApp exibido."
              },
            ] as any,
          },
          {
            type: "warning",
            content:
              "Se aparecer 'QR Code expirado', clique em 'Recarregar' para gerar um novo. O código expira em 60 segundos por segurança.",
          },
        ],
      },
      {
        id: "connection-disconnect",
        title: "Desconectar e reconectar WhatsApp",
        description: "Quando e como reiniciar a conexão",
        tags: ["desconectar", "reconectar", "problema", "queda", "offline"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A conexão pode cair por várias razões: reinício do celular, queda de internet, ou porque o WhatsApp foi aberto em outro dispositivo.",
          },
          {
            type: "steps",
            heading: "Como reconectar:",
            content: [
              "Vá em Conexão.",
              'Se aparecer "Desconectado", clique em "Reconectar".',
              "Escaneie o QR Code novamente.",
            ],
          },
          {
            type: "tip",
            content:
              "Se a conexão cair frequentemente, verifique se o celular não está com bateria acabando, modo de economia de bateria ativo, ou se o WhatsApp não está sendo forçado a fechar pelo sistema.",
          },
        ],
      },
      {
        id: "connection-multiple",
        title: "Gerenciar múltiplas conexões",
        description: "Conecte mais de um número de WhatsApp",
        tags: ["múltiplos números", "mais de um chip", "segunda conexão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Dependendo do seu plano, você pode conectar mais de um número de WhatsApp. Isso é útil para separar atendimento por departamento ou produto.",
          },
          {
            type: "steps",
            heading: "Adicionar nova conexão:",
            content: [
              'Em "Conexão", clique em "Adicionar Conexão".',
              "Escanear QR Code do novo número.",
              "Nomeie a conexão (ex: 'Vendas', 'Suporte').",
            ],
          },
          {
            type: "tip",
            content:
              "Cada conexão tem seu próprio agente de IA configurável. Assim você pode ter um agente de vendas e um de suporte com comportamentos diferentes.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. FERRAMENTAS — Envio em Massa / Campanhas
  // ══════════════════════════════════════════════════════════════════
  {
    id: "mass-send",
    title: "Envio em Massa & Campanhas",
    description: "Envie mensagens para centenas de contatos de uma vez",
    icon: Send,
    color: "text-blue-500",
    articles: [
      {
        id: "mass-send-overview",
        title: "O que é e quando usar o Envio em Massa",
        description: "Diferença entre Envio em Massa e Campanhas",
        tags: ["envio em massa", "campanhas", "disparo", "mensagem em massa"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Envio em Massa e Campanhas permitem enviar mensagens para múltiplos contatos. A diferença é:",
          },
          {
            type: "list",
            heading: "Diferenças:",
            content: [
              "**Envio em Massa** — disparo único e imediato para uma lista de números. Ideal para promoções e avisos pontuais.",
              "**Campanhas** — disparos agendados com sequência de mensagens. Ideal para funis de nutrição e follow-up programado.",
            ],
          },
          {
            type: "warning",
            content:
              "Cuidado com disparos muito agressivos. O WhatsApp pode banir números que enviam muitas mensagens não solicitadas. Use com moderação e sempre para pessoas que consentiram.",
          },
        ],
      },
      {
        id: "mass-send-setup",
        title: "Como fazer um Envio em Massa",
        description: "Passo a passo para disparar mensagens para sua lista",
        tags: ["envio em massa", "disparo", "lista", "contatos"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Envio em Massa é o disparo de mensagens para múltiplos contatos de uma vez. Funciona em 4 etapas: Destinatários → Mensagem → Configurações → Revisar & Enviar.",
          },
          {
            type: "screenshot",
            src: "07-envio-massa.png",
            caption: "Tela de Envio em Massa — Passo 1: selecionar os destinatários",
          },
          {
            type: "visual-steps",
            heading: "Passo a passo — Envio em Massa",
            content: [
              {
                step: "1",
                action: "Acesse **Ferramentas → Envio em Massa** no menu lateral",
                explain: "A tela de Envio em Massa abre no Passo 1: Destinatários. Você tem 4 opções para adicionar quem receberá a mensagem: Inserir Manualmente, Listas de Contatos, Contatos Seguros ou Grupos do WhatsApp.",
                screenshot: "07-envio-massa.png",
                result: "Você vê os 4 cards de opção de destinatários e o indicador de progresso no topo (1 → 2 → 3 → 4)."
              },
              {
                step: "2",
                action: "Escolha a origem dos contatos e avance para **Mensagem**",
                explain: "**Inserir Manualmente**: cole uma lista no formato 'Nome, Número' (um por linha). **Contatos Seguros**: pessoas que já conversaram com você (recomendado — menor risco de bloqueio). **Grupos do WhatsApp**: envia para todos os membros de grupos. **Listas**: usa listas salvas em Ferramentas → Listas de Contatos.",
                result: "Contatos selecionados. Botão 'Próximo' fica ativo."
              },
              {
                step: "3",
                action: "Na aba **Mensagem**, escreva o texto e adicione variáveis",
                explain: "Escreva a mensagem que será enviada. Use a variável [nome] para personalizar automaticamente com o nome de cada contato. Ex: 'Oi [nome]! Temos uma condição especial hoje.' O sistema substitui [nome] pelo nome real de cada pessoa.",
                result: "Preview da mensagem aparece à direita com os dados preenchidos."
              },
              {
                step: "4",
                action: "Revise as **regras automáticas de envio** aplicadas pelo sistema",
                explain: "O envio em massa usa variação obrigatória com IA, simulação de digitando, intervalo aleatório de 1 a 5 minutos entre mensagens e pausas de lote aleatórias de 10 a 20 minutos a cada 10 contatos para proteger o canal.",
                result: "Configuração de timing salva."
              },
              {
                step: "5",
                action: "Revise o resumo na aba **Revisar** e clique em **Enviar**",
                explain: "A aba de revisão mostra: total de destinatários, preview da mensagem e regras de proteção aplicadas. Confirme tudo antes de disparar ou agendar.",
                result: "Disparo iniciado. Barra de progresso mostra o avanço em tempo real: X enviados de Y total."
              },
            ] as any,
          },
          {
            type: "warning",
            content:
              "Nunca envie para mais de 500 contatos de uma vez sem histórico de uso. Comece com listas pequenas (50-100) e aumente gradualmente. WhatsApp pode banir números com comportamento de spam.",
          },
          {
            type: "tip",
            content:
              "Use [nome] na mensagem para personalizar com o nome do contato. Ex: 'Olá [nome], temos uma condição especial para você hoje!'",
          },
        ],
      },
      {
        id: "campaigns-setup",
        title: "Como criar uma Campanha",
        description: "Crie sequências de mensagens agendadas",
        tags: ["campanha", "sequência", "agendamento", "follow-up", "nutrição"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Criar campanha:",
            content: [
              'Vá em "Ferramentas → Campanhas".',
              'Clique em "Nova Campanha".',
              "Dê um nome à campanha.",
              "Selecione a lista de destinatários.",
              "Adicione mensagens com intervalos de tempo entre elas.",
              "Defina a data/hora de início.",
              'Ative a campanha.',
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 7. FERRAMENTAS — Kanban / Funil
  // ══════════════════════════════════════════════════════════════════
  {
    id: "kanban-funnel",
    title: "Kanban & Funil de Vendas",
    description: "Visualize e gerencie a jornada dos seus clientes",
    icon: Kanban,
    color: "text-orange-500",
    articles: [
      {
        id: "kanban-overview",
        title: "Como usar o Kanban CRM",
        description: "Organize conversas por etapa do funil de vendas com drag-and-drop",
        tags: ["kanban", "funil", "pipeline", "etapa", "lead", "crm"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Kanban CRM organiza seus contatos em colunas que representam etapas do funil de vendas. Você arrasta os cards de uma coluna para outra conforme avança no processo comercial.",
          },
          {
            type: "screenshot",
            src: "11-kanban.png",
            caption: "Kanban CRM — colunas Inbox, Novos, Prospectando. Arraste os cards entre as colunas.",
          },
          {
            type: "visual-steps",
            heading: "Como usar o Kanban",
            content: [
              {
                step: "1",
                action: "Acesse **Ferramentas → Kanban** no menu lateral",
                explain: "O Kanban exibe suas colunas (Inbox, Novos, Prospectando, etc.) com os cards de contato em cada uma. A coluna Inbox tem todos os contatos ainda não categorizados — é seu ponto de partida.",
                screenshot: "11-kanban.png",
                result: "Você vê o painel com todas as colunas e os cards dos contatos."
              },
              {
                step: "2",
                action: "Crie novas **etapas** (colunas) clicando em **+ Nova Etapa**",
                explain: "Personalize as etapas de acordo com seu processo de vendas. Exemplos: Novo Lead → Qualificado → Proposta Enviada → Negociando → Fechado/Ganho → Perdido. Use nomes que façam sentido para o seu negócio.",
                result: "Nova coluna adicionada ao Kanban."
              },
              {
                step: "3",
                action: "Arraste os cards entre as colunas conforme o avanço de cada contato",
                explain: "Clique e segure um card, depois arraste para a coluna desejada. O card vai para a nova etapa automaticamente. Você pode clicar em um card para ver o histórico de conversas daquele contato.",
                screenshot: "11-kanban.png",
                result: "Card movido para a nova etapa. O contador de cada coluna atualiza automaticamente."
              },
              {
                step: "4",
                action: "Clique no **card** para ver detalhes e abrir a conversa",
                explain: "Dentro do card você vê: última mensagem, data de contato, etiquetas e um botão para abrir a conversa completa no painel de Conversas. Tudo integrado — você não precisa sair do Kanban.",
                result: "Painel de detalhes abre ao lado ou você é redirecionado para a conversa."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Use o Kanban como ritual diário: toda manhã revise o Inbox e classifique os contatos novos. Contatos sem categoria perdem-se facilmente. Mova os que avançaram nas negociações antes de começar o dia.",
          },
        ],
      },
      {
        id: "funnel-overview",
        title: "Qualificação de Lead com IA",
        description: "A IA classifica automaticamente seus contatos em Quentes, Mornos e Frios",
        tags: ["funil", "vendas", "conversão", "qualificação", "lead", "quente", "morno", "frio"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "A Qualificação de Lead usa IA para analisar o histórico de cada conversa e classificar automaticamente cada contato como Quente 🔥 (pronto para comprar), Morno ☀️ (interessado mas não decidido) ou Frio ❄️ (baixo engajamento).",
          },
          {
            type: "screenshot",
            src: "10-qualificacao-lead.png",
            caption: "Qualificação de Lead — 3 colunas: Leads Quentes, Mornos e Frios. Cada card mostra o contato, análise da IA e ações disponíveis.",
          },
          {
            type: "visual-steps",
            heading: "Como usar a Qualificação de Lead",
            content: [
              {
                step: "1",
                action: "Acesse **Ferramentas → Qualificação de Lead**",
                explain: "A tela mostra os contatos em 3 colunas: Leads Quentes (alta intenção de compra), Leads Mornos (interesse moderado) e Leads Frios (baixo engajamento). Cada card mostra o nome, número, última mensagem e a análise da IA.",
                screenshot: "10-qualificacao-lead.png",
                result: "Você vê os leads classificados nas 3 colunas com a justificativa da IA para cada classificação."
              },
              {
                step: "2",
                action: "Clique em **Atualizar com IA** para reclassificar todos os leads",
                explain: "O botão 'Atualizar com IA' faz a IA analisar todas as conversas recentes e atualizar as classificações. Use este botão toda manhã ou após um período de conversas intenso.",
                result: "IA processa as conversas e redistribui os leads nas colunas. Leads que esquentaram ou esfriaram mudam de coluna."
              },
              {
                step: "3",
                action: "Clique em **Ver conversa** para abrir o chat daquele lead",
                explain: "O botão 'Ver conversa' em cada card abre o histórico completo da conversa. Use para entender o contexto antes de entrar em contato.",
                result: "Painel de conversa abre com o histórico completo."
              },
              {
                step: "4",
                action: "Clique em **Entrar em contato** para abrir a conversa no painel de envio",
                explain: "Direto do card de qualificação você pode abrir a conversa e enviar uma mensagem. Isso agiliza o processo: identifique um lead quente → clique → envie uma proposta.",
                result: "Abre a conversa pronta para resposta."
              },
              {
                step: "5",
                action: "Use **Reclassificar** para corrigir manualmente uma classificação errada",
                explain: "Se a IA classificou errado (ex: marcou como Frio um lead que você sabe que está quente), clique em Reclassificar e escolha a categoria correta. Isso também alimenta o aprendizado do sistema.",
                result: "Lead movido para a categoria correta."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Foque 80% do seu tempo nos Leads Quentes. São os que têm maior probabilidade de conversão hoje. Leads Mornos precisam de um empurrão — use o Envio em Massa ou Follow-up para reaquecê-los.",
          },
          {
            type: "warning",
            content:
              "A classificação é baseada em conversas existentes. Se um lead novo acabou de entrar, ele pode aparecer como Frio até ter mais histórico de conversa. Use 'Atualizar com IA' periodicamente.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 8. FERRAMENTAS — Contatos / Etiquetas
  // ══════════════════════════════════════════════════════════════════
  {
    id: "contacts",
    title: "Contatos & Etiquetas",
    description: "Gerencie sua base de contatos e organize com etiquetas",
    icon: Users,
    color: "text-teal-600",
    articles: [
      {
        id: "contacts-overview",
        title: "Gerenciamento de Contatos",
        description: "Visualize, edite e organize seus contatos",
        tags: ["contatos", "lista", "telefone", "nome", "importar"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A área de Contatos reúne todos os números que já conversaram com seu WhatsApp, mais os contatos sincronizados do celular.",
          },
          {
            type: "list",
            heading: "O que você pode fazer:",
            content: [
              "Visualizar todos os contatos com foto, nome e número.",
              "Editar nome e informações de contato.",
              "Adicionar etiquetas para classificação.",
              "Buscar contatos por nome ou número.",
              "Exportar lista de contatos.",
            ],
          },
        ],
      },
      {
        id: "contacts-custom-fields",
        title: "Campos Personalizados de Contato",
        description: "Armazene informações extras sobre seus contatos",
        tags: ["campos personalizados", "dados", "informações", "contato", "custom field"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Campos personalizados permitem guardar informações adicionais sobre os contatos (CPF, data de nascimento, segmento, etc.).",
          },
          {
            type: "steps",
            heading: "Criar campo personalizado:",
            content: [
              'Vá em "Ferramentas → Campos Personalizados".',
              'Clique em "Novo Campo".',
              "Defina nome, tipo (texto, número, data, sim/não) e se é obrigatório.",
              "Salve.",
              "Agora o campo aparece no painel de detalhes de cada contato.",
            ],
          },
        ],
      },
      {
        id: "tags-overview",
        title: "Como criar e usar Etiquetas",
        description: "Classifique contatos e conversas por categoria",
        tags: ["etiquetas", "tag", "classificar", "filtrar", "cor"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Criar etiqueta:",
            content: [
              'Vá em "Ferramentas → Etiquetas".',
              'Clique em "Nova Etiqueta".',
              "Defina nome e cor.",
              "Salve.",
              "Agora você pode aplicar esta etiqueta em conversas e contatos.",
            ],
          },
          {
            type: "tip",
            content:
              "Crie etiquetas como: '🔥 Lead Quente', '💰 Cliente VIP', '🚫 Não Perturbar', '⏳ Aguardando Proposta'.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 9. FERRAMENTAS — Agendamentos
  // ══════════════════════════════════════════════════════════════════
  {
    id: "scheduling",
    title: "Agendamentos",
    description: "Gerencie agenda e compromissos via WhatsApp",
    icon: CalendarClock,
    color: "text-indigo-600",
    articles: [
      {
        id: "scheduling-overview",
        title: "Como funciona o módulo de Agendamentos",
        description: "Configure e gerencie agendamentos pelo WhatsApp",
        tags: ["agendamento", "agenda", "horário", "marcar", "compromisso"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O módulo de Agendamentos permite que a IA marque compromissos com clientes automaticamente, respeitando sua disponibilidade de horários.",
          },
          {
            type: "steps",
            heading: "Configurar agendamentos:",
            content: [
              'Acesse "Ferramentas → Agendamentos".',
              "Configure os serviços disponíveis (nome, duração, preço).",
              "Defina os horários de funcionamento por dia da semana.",
              "Bloqueie datas/horários de folga ou feriados.",
              "Pronto! A IA já pode marcar horários automaticamente.",
            ],
          },
          {
            type: "tip",
            content:
              "Ative a confirmação automática por WhatsApp: o sistema envia uma mensagem confirmando o agendamento assim que for marcado.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 10. DELIVERY
  // ══════════════════════════════════════════════════════════════════
  {
    id: "delivery",
    title: "Delivery",
    description: "Cardápio, pedidos e relatórios para delivery via WhatsApp",
    icon: UtensilsCrossed,
    color: "text-red-500",
    articles: [
      {
        id: "delivery-menu",
        title: "Criar Cardápio de Delivery",
        description: "Configure categorias, produtos e preços",
        tags: ["delivery", "cardápio", "produto", "preço", "categoria", "comida", "pedido"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O módulo de Delivery permite criar um cardápio completo que a IA usa para receber pedidos pelo WhatsApp.",
          },
          {
            type: "steps",
            heading: "Criar cardápio:",
            content: [
              'Acesse "Ferramentas → 🍕 Delivery → Cardápio".',
              'Clique em "Adicionar Categoria" (ex: Lanches, Bebidas, Sobremesas).',
              'Dentro da categoria, clique em "Adicionar Item".',
              "Preencha: nome, descrição, preço e foto (opcional).",
              "Marque os itens disponíveis ou indisponíveis.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Adicione fotos aos itens para aumentar o apetite dos clientes e reduzir dúvidas sobre o produto.",
          },
        ],
      },
      {
        id: "delivery-orders",
        title: "Gerenciar Pedidos de Delivery",
        description: "Acompanhe e processe pedidos em tempo real",
        tags: ["pedidos", "delivery", "acompanhar", "status", "pedido em andamento"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Gerenciar pedidos:",
            content: [
              'Acesse "Ferramentas → 🍕 Delivery → Pedidos".',
              "Veja os pedidos recebidos com status: Novo, Em preparo, Saiu para entrega, Entregue.",
              "Clique no pedido para ver detalhes: itens, endereço, forma de pagamento.",
              "Atualize o status conforme o pedido avança.",
              "O cliente recebe notificação automática a cada mudança de status.",
            ],
          },
        ],
      },
      {
        id: "delivery2-overview",
        title: "Configurar o Delivery 2.0",
        description: "Prompt principal, extracao de pedidos, som e impressao no PDV online",
        tags: ["delivery 2.0", "prompt", "pdv", "pedidos", "som", "impressao", "cardapio", "relatorios"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Delivery 2.0 nao usa fluxo proprio. O cliente conversa com o prompt principal do agente e, quando o pedido fecha de verdade, o modulo extrai o resumo para o painel online.",
          },
          {
            type: "steps",
            heading: "Ativar do jeito certo:",
            content: [
              'Acesse "Ferramentas -> Delivery 2.0".',
              'Na aba "Configuracoes", ative o modulo.',
              'Na mesma aba "Configuracoes", monte a sequencia do cardapio com imagens e PDF na ordem certa.',
              'Abra "Meu Agente IA" e ajuste o prompt com cardapio, regras de meio a meio, bordas, adicionais, entrega, pagamento e confirmacao final do pedido.',
              'Volte para a aba "Pedidos" e deixe o painel aberto para receber os novos pedidos extraidos.',
            ],
          },
          {
            type: "steps",
            heading: "Cardapio em midia:",
            content: [
              'Use a area "Sequencia de midias do cardapio" para definir o que sai em primeiro, segundo e terceiro.',
              'Ative o envio na primeira saudacao se quiser mandar o cardapio logo no "oi".',
              'Deixe o envio quando pedirem cardapio ligado para responder automaticamente a menu, sabores, precos e PDF.',
            ],
          },
          {
            type: "steps",
            heading: "Som e impressao:",
            content: [
              'Ative "Som" para tocar alerta quando chegar pedido novo.',
              'Ative "Auto impressao" apenas na maquina que realmente vai imprimir.',
              'Use o botao "Imprimir" dentro do pedido quando quiser disparar manualmente.',
            ],
          },
          {
            type: "steps",
            heading: "Relatorios:",
            content: [
              'Abra a aba "Relatorios" dentro do Delivery 2.0.',
              'Escolha hoje, ontem, semana, mes ou um periodo personalizado.',
              'Consulte faturamento bruto, ticket medio, cancelamentos e vendas por dia sem sair do modulo.',
            ],
          },
          {
            type: "tip",
            content:
              "Se o pedido ainda estiver incompleto no chat, ele nao entra no painel. O Delivery 2.0 so registra pedidos realmente fechados.",
          },
        ],
      },
      {
        id: "delivery-billing-fees",
        title: "Configurar Pix, troco e taxa de entrega",
        description: "Entenda onde cadastrar Pix e como cobrar taxa fixa ou por distancia",
        tags: ["delivery", "pix", "troco", "taxa", "distancia", "entrega", "pagamento"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              'Acesse "Ferramentas -> Delivery -> Cardapio -> Configuracoes". O bloco "Cobranca e pagamento" e o lugar certo para configurar Pix, troco no dinheiro e a taxa de entrega.',
          },
          {
            type: "steps",
            heading: "Como configurar Pix e troco:",
            content: [
              'Ative "Pix" para a IA enviar a chave automaticamente no resumo do pedido.',
              "Preencha tipo da chave, chave Pix, titular e banco.",
              'Se quiser, ative "Pedir comprovante".',
              'Ative "Dinheiro" e marque "Perguntar sobre troco" para a IA perguntar se precisa de troco e para quanto.',
            ],
          },
          {
            type: "steps",
            heading: "Como configurar taxa fixa:",
            content: [
              'Em "Como cobrar a entrega", escolha "Taxa fixa".',
              'No campo "Valor da entrega em R$", digite o valor unico cobrado em qualquer entrega.',
              "Salve as alteracoes.",
            ],
          },
          {
            type: "steps",
            heading: "Como configurar taxa por distancia:",
            content: [
              'Em "Como cobrar a entrega", escolha "Taxa por distancia".',
              'Preencha o "Valor inicial em R$". Exemplo: 5,00.',
              'Preencha "Km ja incluidos na taxa base". Exemplo: 2.',
              'Preencha "Valor por km extra em R$". Exemplo: 1,50.',
              'Informe o endereco da loja para o sistema calcular a distancia.',
              'Opcional: defina a distancia maxima aceita e o valor fallback se a distancia nao puder ser calculada.',
            ],
          },
          {
            type: "tip",
            content:
              "Exemplo pratico: taxa base de R$ 5,00 com 2 km incluidos e R$ 1,50 por km extra. Se a entrega tiver 4 km, a taxa fica R$ 8,00.",
          },
        ],
      },
      {
        id: "delivery-reports",
        title: "Relatórios de Delivery",
        description: "Acompanhe faturamento e métricas de vendas",
        tags: ["relatórios", "delivery", "faturamento", "vendas", "métricas"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              'Os relatórios de delivery mostram um resumo de vendas por período, ticket médio, itens mais vendidos e faturamento total. Acesse em "Delivery → Relatórios".',
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 11. SALÃO DE BELEZA
  // ══════════════════════════════════════════════════════════════════
  {
    id: "salon",
    title: "Salão de Beleza",
    description: "Agendamentos automáticos para salões, clínicas e estúdios",
    icon: CalendarClock,
    color: "text-pink-500",
    articles: [
      {
        id: "salon-setup",
        title: "Configurar Salão de Beleza",
        description: "Configure serviços, profissionais e horários",
        tags: ["salão", "beleza", "serviço", "profissional", "horário", "barbearia", "clínica"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Configurar salão:",
            content: [
              'Acesse "Ferramentas → 💇 Salão de Beleza → Configuração".',
              "Adicione os profissionais (nome, especialidade, foto).",
              "Adicione os serviços com duração e preço (ex: Corte 30min R$45).",
              "Configure a grade de horários por profissional.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "A IA verificará automaticamente a disponibilidade e confirmará o agendamento com o cliente sem precisar da sua intervenção.",
          },
        ],
      },
      {
        id: "salon-appointments",
        title: "Ver Agendamentos do Salão",
        description: "Visualize a agenda do dia, semana e mês",
        tags: ["agendamentos", "salão", "agenda", "calendário"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela de agendamentos do salão mostra toda a agenda em formato de lista ou calendário. Acesse em "Salão de Beleza → Agendamentos".',
          },
          {
            type: "list",
            heading: "Ações disponíveis:",
            content: [
              "Visualizar agendamentos do dia, semana ou mês.",
              "Confirmar ou cancelar agendamentos.",
              "Ver dados do cliente e serviço agendado.",
              "Bloquear horários (férias, folga).",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 12. FOLLOW-UP INTELIGENTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "followup",
    title: "Follow-up Inteligente",
    description: "Recupere conversas e clientes inativos automaticamente",
    icon: Sparkles,
    color: "text-amber-500",
    articles: [
      {
        id: "followup-overview",
        title: "O que é e para que serve o Follow-up",
        description: "Automatize o acompanhamento de clientes que pararam de responder",
        tags: ["follow-up", "recuperar", "inativo", "reengajar", "automático"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Follow-up Inteligente envia mensagens automáticas quando um cliente para de responder. Configura-se o tempo de espera e as mensagens a enviar.",
          },
          {
            type: "list",
            heading: "Exemplos de uso:",
            content: [
              "Cliente não respondeu em 2h → enviar 'Ficou com alguma dúvida?'",
              "Abandono no meio do pedido → 'Você esqueceu algo no carrinho?'",
              "Não converteu na primeira conversa → 'Podemos oferecer um desconto especial para você!'",
            ],
          },
        ],
      },
      {
        id: "followup-setup",
        title: "Como configurar o Follow-up Inteligente",
        description: "Passo a passo para ativar o acompanhamento automático de clientes",
        tags: ["follow-up", "configurar", "ativar", "mensagem", "tempo", "agenda"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Follow-up Inteligente envia mensagens automáticas para clientes que pararam de responder. Você vê todos os follow-ups agendados no calendário e pode gerenciar cada um individualmente.",
          },
          {
            type: "screenshot",
            src: "06-followup.png",
            caption: "Follow-up Inteligente — painel com estatísticas (enviados, pendentes, hoje, cancelados) e calendário visual",
          },
          {
            type: "visual-steps",
            heading: "Como configurar o Follow-up",
            content: [
              {
                step: "1",
                action: "Acesse **Ferramentas → Follow-up Inteligente**",
                explain: "A tela do Follow-up mostra estatísticas no topo (Enviados, Pendentes, Hoje, Cancelados) e o calendário com os follow-ups agendados. O toggle 'Follow-up Ativado' controla se o sistema está ativo.",
                screenshot: "06-followup.png",
                result: "Você vê o painel completo com o calendário de Fevereiro e os follow-ups marcados em cada dia."
              },
              {
                step: "2",
                action: "Clique na aba **Configuração** para definir os parâmetros",
                explain: "Na Configuração você define: tempo de espera antes do primeiro follow-up (ex: 2 horas), quantidade de tentativas (ex: 3 mensagens), e intervalos entre tentativas.",
                result: "Formulário de configuração aberto."
              },
              {
                step: "3",
                action: "Configure o **tempo de espera** e as **mensagens**",
                explain: "Defina: '2h sem resposta → enviar primeira mensagem'. Escreva as mensagens de cada tentativa. Dica: seja empático, não insistente. 1ª tentativa: dúvida. 2ª tentativa: benefício extra. 3ª tentativa: última chance gentil.",
                result: "Sequência de mensagens configurada."
              },
              {
                step: "4",
                action: "Configure os **Horários** permitidos para envio",
                explain: "Na aba Horários, defina em quais dias e faixas horárias o follow-up pode ser enviado. Nunca envie fora do horário comercial — causa irritação e pode gerar bloqueio.",
                result: "Horários definidos. Follow-ups fora da faixa são automaticamente reagendados para o próximo horário permitido."
              },
              {
                step: "5",
                action: "Ative o toggle **Follow-up Ativado** no topo da tela",
                explain: "Com o toggle ativo, o sistema monitora todas as conversas e agenda follow-ups automaticamente quando detecta inatividade no tempo configurado.",
                screenshot: "06-followup.png",
                result: "Toggle verde = sistema ativo. Os próximos follow-ups aparecem no calendário."
              },
            ] as any,
          },
          {
            type: "warning",
            content:
              "O follow-up para automaticamente se o cliente responder — o timer é reiniciado. Nunca configure mais de 3 tentativas ou intervalos menores que 2 horas. Excesso de follow-up resulta em bloqueio.",
          },
          {
            type: "tip",
            content:
              "Use a aba Pendentes para revisar os follow-ups antes que sejam enviados. Se um cliente não deve receber, você pode cancelar individualmente sem desativar o sistema inteiro.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 13. FALAR POR AUDIO
  // ══════════════════════════════════════════════════════════════════
  {
    id: "audio",
    title: "Falar por Audio",
    description: "Configure o agente para responder com mensagens de voz",
    icon: Mic,
    color: "text-rose-500",
    articles: [
      {
        id: "audio-overview",
        title: "Falar por Áudio — Configure a voz do seu agente",
        description: "Faça seu agente responder com mensagens de voz realistas",
        tags: ["áudio", "voz", "falar por áudio", "mensagem de voz", "voz do agente"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O recurso **Falar por Áudio** permite que o seu agente de IA responda os clientes com mensagens de voz — além (ou no lugar) de texto. Você escolhe o tipo de voz, a velocidade da fala e quando o agente deve enviar áudio.",
          },
          {
            type: "screenshot",
            src: "12-falar-por-audio.png",
            caption: "Tela Falar por Áudio — escolha a voz, velocidade e ative/desative o recurso",
          },
          {
            type: "visual-steps",
            heading: "Como ativar e configurar o Falar por Áudio",
            content: [
              {
                step: "1",
                action: 'No menu lateral, clique em **Ferramentas** para expandir, depois clique em **Falar por Áudio**',
                explain: "Você pode acessar diretamente pelo link: agentezap.online/falar-por-audio",
                screenshot: "12-falar-por-audio.png",
                result: "A tela de Falar por Áudio é exibida com o painel de Uso Diário e Configurações de Áudio."
              },
              {
                step: "2",
                action: "Ative as **Configurações de Áudio** pelo toggle no canto superior direito do painel",
                explain: "O toggle fica na seção 'Configurações de Áudio'. Quando desativado, o agente responde apenas por texto. Ao ativar, o agente começa a enviar mensagens de voz de acordo com as configurações que você definir.",
                screenshot: "12-falar-por-audio.png",
                result: "O toggle muda para 'Ativado' e as opções de configuração ficam disponíveis para edição."
              },
              {
                step: "3",
                action: "Escolha o **Tipo de Voz**: **Voz feminina** ou **Voz masculina**",
                explain: "Clique no card da voz desejada para selecioná-la. Escolha a voz que mais combina com o perfil do seu negócio e público-alvo.",
                screenshot: "12-falar-por-audio.png",
                result: "O card da voz selecionada fica destacado com borda colorida."
              },
              {
                step: "4",
                action: "Ajuste a **Velocidade da Fala** pelo slider (recomendado: 1.0x Normal)",
                explain: "Arraste o slider para a esquerda para fala mais lenta (0.5x) ou para a direita para mais rápida (2.0x). A velocidade normal (1.0x) é adequada para a maioria dos casos. Você pode usar os botões de atalho: Lento (0.75x), Normal (1x), Rápido (1.25x) ou Muito Rápido (1.5x).",
                screenshot: "12-falar-por-audio.png",
                result: "O valor de velocidade é atualizado ao lado do slider."
              },
              {
                step: "5",
                action: "Clique no botão **Salvar Configurações** para aplicar as mudanças",
                explain: "Após salvar, o agente passará a enviar respostas em áudio. O limite de uso diário aparece no topo da tela (ex: 30/30 por dia). O contador reseta à meia-noite.",
                result: "Mensagem de confirmação 'Configurações salvas' é exibida. O agente agora responde com voz."
              },
            ] as any,
          },
          {
            type: "tip",
            heading: "Dicas de uso",
            content:
              "Vozes humanizadas aumentam o engajamento nas conversas. Experimente enviar uma mensagem de teste pelo WhatsApp para ver como soa. O uso diário é limitado — o contador reseta à meia-noite automaticamente.",
          },
          {
            type: "warning",
            content:
              "Se o indicador mostrar 'Limite atingido', aguarde o reset da meia-noite ou desative temporariamente o Falar por Áudio para o agente continuar respondendo por texto.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 14. NOTIFICADOR INTELIGENTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "notifier",
    title: "Notificador Inteligente",
    description: "Envie notificações automáticas por eventos ou integração",
    icon: Bell,
    color: "text-yellow-600",
    articles: [
      {
        id: "notifier-overview",
        title: "Notificador Inteligente — Como configurar",
        description: "Receba alertas no WhatsApp quando clientes precisam de atenção",
        tags: ["notificador", "notificação", "automação", "gatilho", "api", "evento", "alerta"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O Notificador Inteligente monitora as conversas e envia um alerta para o seu WhatsApp pessoal quando detectar algo que precisa da sua atenção — como um cliente pedindo PIX, fazendo reclamação, ou qualquer situação que você definir.",
          },
          {
            type: "screenshot",
            src: "08-notificador.png",
            caption: "Notificador Inteligente — configure o número que receberá os alertas e o modo de detecção",
          },
          {
            type: "visual-steps",
            heading: "Como configurar o Notificador",
            content: [
              {
                step: "1",
                action: "Acesse **Ferramentas → Notificador Inteligente**",
                explain: "A tela do Notificador mostra: o toggle de ativação, o número que receberá os alertas, e as opções de modo de detecção. O número deve incluir o código do país (ex: 5511999888777).",
                screenshot: "08-notificador.png",
                result: "Você vê a tela com Status do Notificador e o campo de número preenchível."
              },
              {
                step: "2",
                action: "Configure o **Número para Notificação** (seu WhatsApp pessoal)",
                explain: "Digite o número que vai receber os alertas no formato 55 + DDD + número (ex: 5517991956944). É o seu número pessoal ou de um responsável pelo atendimento.",
                result: "Número salvo no campo."
              },
              {
                step: "3",
                action: "Escolha o **Modo de Detecção**",
                explain: "3 opções disponíveis: **IA** (recomendado) — a IA analisa o contexto e decide quando notificar, mais preciso. **Palavras-chave manual** — notifica quando detectar palavras específicas que você cadastra. **Ambos** — usa IA + palavras-chave para máxima cobertura.",
                screenshot: "08-notificador.png",
                result: "Modo selecionado. Se escolheu IA ou Ambos, o campo 'Gatilho da IA' aparece."
              },
              {
                step: "4",
                action: "Escreva o **Gatilho da IA** em linguagem natural",
                explain: "Descreva em português o que você quer monitorar. Ex: 'Me notifique quando um cliente pedir o PIX', 'Avise quando alguém reclamar de entrega', 'Alerte quando cliente perguntar por gerente'. A IA entende a intenção.",
                screenshot: "08-notificador.png",
                result: "Gatilho cadastrado. A IA usará este texto para decidir quando disparar o alerta."
              },
              {
                step: "5",
                action: "Ative o toggle **Status do Notificador**",
                explain: "Com o toggle ligado (verde), o sistema monitora todas as conversas em tempo real. Quando detectar o gatilho, você recebe uma mensagem no seu WhatsApp pessoal com o contexto da conversa.",
                result: "Notificador ativo. Você receberá alertas automaticamente."
              },
            ] as any,
          },
          {
            type: "tip",
            content:
              "Use o modo 'Ambos (IA + Manual)' para garantir cobertura total. Configure o gatilho da IA para situações complexas e as palavras-chave para termos diretos ('pix', 'cancelar', 'reclamação'). Custo de falsos positivos é baixo, mas falta de alerta pode perder vendas.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 15. BIBLIOTECA DE MÍDIAS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "media",
    title: "Biblioteca de Mídias",
    description: "Gerenciar arquivos do agente: imagens, áudios, vídeos e documentos",
    icon: Upload,
    color: "text-cyan-600",
    articles: [
      {
        id: "media-overview",
        title: "Como usar a Biblioteca de Mídias",
        description: "Upload e gerenciamento de arquivos do agente",
        tags: ["mídias", "arquivo", "upload", "imagem", "vídeo", "áudio", "documento"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "A Biblioteca de Mídias centraliza todos os arquivos que o agente pode enviar: cardápios em PDF, tabelas de preços, fotos de produtos, áudios de apresentação etc.",
          },
          {
            type: "steps",
            heading: "Upload de mídia:",
            content: [
              'Acesse "Ferramentas → Biblioteca de Mídias".',
              'Clique em "Upload".',
              "Selecione o arquivo (suporta: JPG, PNG, PDF, MP3, MP4, etc.).",
              "Preencha o nome e a descrição.",
              "Defina 'Quando usar' (instrução para a IA).",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Limite de tamanho por arquivo: imagens até 5MB, vídeos até 16MB, áudios até 10MB, documentos até 10MB.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 16. LISTA DE EXCLUSÃO
  // ══════════════════════════════════════════════════════════════════
  {
    id: "exclusion",
    title: "Lista de Exclusão",
    description: "Números que a IA não deve responder automaticamente",
    icon: Ban,
    color: "text-red-600",
    articles: [
      {
        id: "exclusion-overview",
        title: "O que é a Lista de Exclusão",
        description: "Bloqueie números específicos do atendimento automático",
        tags: ["exclusão", "bloquear", "ia", "não responder", "lista negra"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A Lista de Exclusão contém números que a IA deve ignorar. Mensagens desses números não recebem resposta automática, mas ainda aparecem em Conversas para atendimento manual.",
          },
          {
            type: "list",
            heading: "Quando usar:",
            content: [
              "Seus próprios números (para não responder a si mesmo)",
              "Fornecedores e parceiros que não devem receber atendimento automático",
              "Números de teste",
              "Pessoas que solicitaram exclusão da automação",
            ],
          },
          {
            type: "steps",
            heading: "Adicionar à lista:",
            content: [
              'Acesse "Ferramentas → Lista de Exclusão".',
              "Digite o número no formato internacional (5511999999999).",
              'Clique em "Adicionar".',
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 17. LISTAS DE CONTATOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "contact-lists",
    title: "Listas de Contatos",
    description: "Organize contatos em listas para envios segmentados",
    icon: BookUser,
    color: "text-teal-500",
    articles: [
      {
        id: "contact-lists-overview",
        title: "Como criar e gerenciar Listas de Contatos",
        description: "Agrupe contatos para envios direcionados",
        tags: ["lista de contatos", "segmentação", "grupo", "envio segmentado"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Listas de Contatos permitem agrupar números para envio em massa ou campanha direcionada. Ex: 'Clientes VIP', 'Leads de Outubro', 'Alunos Turma A'.",
          },
          {
            type: "steps",
            heading: "Criar lista:",
            content: [
              'Vá em "Ferramentas → Listas de Contatos".',
              'Clique em "Nova Lista".',
              "Dê um nome à lista.",
              "Adicione contatos manualmente ou via importação CSV.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Importe um CSV com colunas: nome, numero (com DDI). Ex: 'Maria, 5511999991234'.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 18. CATÁLOGO DE PRODUTOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "products",
    title: "Catálogo de Produtos",
    description: "Liste produtos e preços que a IA pode consultar e indicar",
    icon: Package,
    color: "text-violet-600",
    articles: [
      {
        id: "products-overview",
        title: "Como criar um Catálogo de Produtos",
        description: "Cadastre produtos para a IA recomendar e tirar dúvidas",
        tags: ["catálogo", "produto", "preço", "estoque", "ia", "lista"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Catálogo de Produtos é uma referência para a IA. Quando configurado, o agente pode responder perguntas de preço, disponibilidade e características sem você precisar colocar tudo no prompt.",
          },
          {
            type: "steps",
            heading: "Cadastrar produto:",
            content: [
              'Acesse "Ferramentas → Catálogo de Produtos".',
              'Clique em "Novo Produto".',
              "Preencha: nome, descrição, preço, categoria.",
              "Se quiser que a IA respeite saldo real, ative o controle de estoque do produto.",
              "Adicione foto se desejar.",
              "Se quiser que a IA envie a descrição automaticamente depois das fotos, ative a opção de enviar descrição junto das imagens.",
              "Se o controle de estoque estiver ativo e o saldo zerar, a IA responderá que o item está indisponível sem enviar fotos automaticamente.",
              "Salve.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 19. INTEGRAÇÕES
  // ══════════════════════════════════════════════════════════════════
  {
    id: "integrations",
    title: "Integrações",
    description: "Conecte o AgenteZap a outros sistemas e ferramentas",
    icon: Plug,
    color: "text-emerald-600",
    articles: [
      {
        id: "integrations-overview",
        title: "Quais integrações estão disponíveis",
        description: "Conecte com ferramentas como Google Calendar, Webhooks e mais",
        tags: ["integração", "webhook", "api", "google calendar", "externo", "sistema"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O AgenteZap se integra com outras ferramentas para enriquecer o atendimento automatizado.",
          },
          {
            type: "list",
            heading: "Integrações disponíveis:",
            content: [
              "**Google Calendar** — sincronize agendamentos com sua agenda Google.",
              "**Webhooks** — envie/receba eventos em tempo real para seu sistema.",
              "**API REST** — use a API do AgenteZap para automatizações personalizadas.",
            ],
          },
          {
            type: "tip",
            content:
              "Integrações avançadas geralmente requerem um desenvolvedor. Consulte a documentação da API em nossa central de suporte técnico.",
          },
        ],
      },
      {
        id: "scheduling-maton-google-calendar",
        title: "Google Calendario - conexao direta",
        description: "Conecte a conta Google direto no AgenteZap e mantenha a agenda sincronizada nos dois lados",
        tags: ["google calendario", "google agenda", "agenda", "oauth", "agendamentos"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Essa integracao e simples. O cliente conecta a propria conta Google direto no AgenteZap, autoriza o acesso e escolhe a agenda que sera sincronizada.",
          },
          {
            type: "steps",
            heading: "Passo a passo:",
            content: [
              'Abra "Ferramentas -> Agendamentos -> Google Calendario" ou a area operacional do Agendamento 2.0.',
              "Clique em `Conectar com Google` para abrir a autorizacao segura do Google.",
              "Escolha a conta correta, aprove as permissoes e aguarde o popup confirmar a conexao.",
              'Volte ao AgenteZap em "Ferramentas -> Agendamentos -> Google Calendario".',
              "Depois escolha qual agenda Google deve ser usada para bloqueios, criacao e reconciliacao dos eventos.",
            ],
          },
          {
            type: "tip",
            content:
              "Nao existe mais chave externa intermediaria neste fluxo. A mesma conta Google do cliente passa a alimentar o painel e a agenda externa.",
          },
          {
            type: "warning",
            content:
              "Se a conta Google for desconectada ou perder permissao, a sincronizacao para ate uma nova autorizacao ser concluida.",
          },
        ],
      },
      {
        id: "integrations-meta-formulario-google-drive",
        title: "Formulário Meta - Google Drive direto",
        description: "Salve as credenciais Google, conecte o Drive e escolha a planilha da Meta pelo nome",
        tags: ["meta", "formulario", "google drive", "google sheets", "oauth", "planilha", "lead ads"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Essa tela foi feita para o fluxo do Formulário Meta com Google direto. Você salva a API key, o Client ID e o Client Secret da conta Google, conecta o Google Drive e depois escolhe a planilha da Meta pelo nome, sem precisar colar o ID manualmente.',
          },
          {
            type: "steps",
            heading: "Passo a passo:",
            content: [
              'Acesse "Ferramentas -> Formulário Meta".',
              'Abra a aba "Configurações Google".',
              "Cole a API key, o Client ID e o Client Secret do Google Cloud.",
              'Clique em "Salvar credenciais Google".',
              'Depois clique em "Conectar Google Drive" e autorize a conta Google que possui as planilhas.',
              'Volte para a aba "Planilhas" e digite o nome da planilha ou deixe a busca em branco para listar as mais recentes.',
              "Escolha a planilha correta, selecione a conexão do WhatsApp e salve.",
            ],
          },
          {
            type: "tip",
            content:
              "A leitura usa automaticamente a primeira aba padrão criada pelo Meta, então você não precisa preencher GID da aba nem número de destino manualmente.",
          },
          {
            type: "warning",
            content:
              "Sem conectar o Google Drive da conta certa, o sistema não consegue listar as planilhas pelo nome. Salvar só a API key não basta para acessar planilhas privadas do cliente.",
          },
        ],
      },
      {
        id: "integrations-grupo-zap-imoveis",
        title: "Imobiliaria - Como usar feed XML e e-mail do ZAP com Maton",
        description: "Configure o catalogo de imoveis via XML e traga os leads do e-mail do ZAP para o WhatsApp",
        tags: ["grupo zap", "grupo olx", "viva real", "zap imoveis", "olx", "imobiliaria", "xml", "maton", "gmail"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A ferramenta "Ferramentas -> Imobiliaria" agora trabalha com duas bases: o feed XML/Canal Pro para abastecer o catalogo de imoveis da IA e a Maton para ler os e-mails de lead vindos do ZAP/Viva Real/OLX no Gmail do cliente.',
          },
          {
            type: "list",
            heading: "O que cada parte faz:",
            content: [
              "**Feed XML** - traz os imoveis para o estoque/catalogo que a IA consulta no Meu Agente IA e no simulador.",
              "**Maton + Gmail** - le os e-mails do `@comunica.zapimoveis.com.br` e transforma isso em lead dentro do AgenteZap.",
              "**WhatsApp** - recebe a conversa do lead e envia a primeira mensagem automatica.",
              "**Kanban/Funil** - opcional, apenas se voce quiser criar negocio no CRM.",
            ],
          },
          {
            type: "steps",
            heading: "Passo a passo da configuracao:",
            content: [
              'Acesse "Ferramentas -> Imobiliaria".',
              "Cole a URL do feed XML/Canal Pro do cliente.",
              "Salve e clique em `Sincronizar catalogo` para trazer os imoveis.",
              "Peça ao cliente a chave da Maton e conecte na Maton o app `Google Mail` com o Gmail que recebe os leads.",
              "Preencha no AgenteZap a chave da Maton, o e-mail exato da caixa conectada na Maton e o filtro de remetente.",
              "Escolha o WhatsApp que vai receber o lead e ajuste a mensagem inicial.",
              "Se quiser CRM, ligue a opcao do funil e selecione o funil e a etapa.",
              "Clique em `Buscar leads do e-mail` para processar os e-mails do ZAP.",
            ],
          },
          {
            type: "tip",
            content:
              "A mensagem automatica inicial sai como mensagem da propria IA do sistema. Ela nao conta como mensagem manual do dono, entao a IA e o follow-up continuam ativos normalmente.",
          },
          {
            type: "list",
            heading: "Variaveis da mensagem inicial:",
            content: [
              "{{nome}}, {{portal}}, {{lead_type}}, {{imovel_codigo}}, {{imovel_titulo}}, {{cidade}}",
              "{{bairro}}, {{preco}}, {{tipo_transacao}}, {{url_anuncio}}, {{telefone}}, {{email}}, {{mensagem}}",
            ],
          },
          {
            type: "warning",
            content:
              "A chave da Maton so funciona se o cliente realmente tiver conectado o Google Mail dentro da conta dele na Maton. O campo de e-mail deve ser o Gmail conectado na Maton, nao apenas o e-mail cadastrado no AgenteZap. Sem isso, o AgenteZap nao consegue ler os e-mails. Ja no XML, se o feed nao estiver acessivel ou estiver vazio, a IA nao tera o estoque imobiliario para consultar.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 20. CONFIGURAÇÕES
  // ══════════════════════════════════════════════════════════════════
  {
    id: "settings",
    title: "Configurações",
    description: "Conta, equipe, membros, senha e preferências",
    icon: Settings,
    color: "text-gray-600",
    articles: [
      {
        id: "settings-profile",
        title: "Configurações de Perfil",
        description: "Altere nome, e-mail e senha da conta",
        tags: ["configurações", "perfil", "senha", "nome", "e-mail", "conta"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Alterar dados de perfil:",
            content: [
              'Acesse "Configurações → Configurações".',
              "Edite nome ou e-mail.",
              'Clique em "Salvar alterações".',
            ],
          },
          {
            type: "steps",
            heading: "Alterar senha:",
            content: [
              'Acesse "Configurações → Configurações".',
              "Role até a seção 'Alterar Senha'.",
              "Preencha senha atual e nova senha.",
              'Clique em "Alterar Senha".',
            ],
          },
        ],
      },
      {
        id: "settings-notifications",
        title: "Como ativar as notificações de novas mensagens",
        description: "Saiba onde ativar, como funciona no celular e o limite do navegador fechado",
        tags: ["notificação", "notificações", "som", "push", "navegador", "celular", "alerta", "mensagens"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Os alertas de novas mensagens ficam em Configurações da conta. Esse recurso é diferente do Notificador Inteligente: aqui você ativa avisos do navegador para a sua própria tela de atendimento.",
          },
          {
            type: "steps",
            heading: "Onde ativar:",
            content: [
              'Acesse "Configurações → Configurações".',
              "Role até o card 'Notificações'.",
              "Ligue o toggle 'Som de notificação' para ouvir um aviso ao chegar mensagem nova.",
              "Ligue o toggle 'Push do navegador' e aceite a permissão do navegador quando ela aparecer.",
            ],
          },
          {
            type: "tip",
            content:
              "No celular, esse alerta depende do navegador onde o AgenteZap está aberto. Se o navegador do aparelho permitir notificações do site, você pode receber o aviso por ele mesmo enquanto estiver usando outro app.",
          },
          {
            type: "warning",
            content:
              "Hoje não existe um aplicativo nativo separado para push. Se o navegador do celular estiver totalmente fechado, esse alerta pode não aparecer. Se a permissão tiver sido negada, será preciso reativá-la nas configurações do navegador. O Notificador Inteligente envia alertas para WhatsApp com base em gatilhos da IA e é o caminho certo quando você precisa receber no celular sem depender do navegador aberto.",
          },
        ],
      },
      {
        id: "settings-team",
        title: "Membros da Equipe",
        description: "Adicione colaboradores com acesso limitado",
        tags: ["membros", "equipe", "acesso", "colaborador", "permissão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Você pode adicionar membros da equipe que terão acesso às conversas sem acesso às configurações do agente ou informações financeiras.",
          },
          {
            type: "steps",
            heading: "Adicionar membro:",
            content: [
              'Acesse "Configurações → Configurações" → aba "Membros".',
              'Clique em "Convidar Membro".',
              "Insira o e-mail do colaborador.",
              "Defina as permissões (ver conversas, enviar mensagens, etc.).",
              "O colaborador receberá um link de acesso.",
            ],
          },
        ],
      },
      {
        id: "settings-sectors",
        title: "Setores de Atendimento",
        description: "Organize o atendimento por departamento",
        tags: ["setores", "departamento", "organização", "atendimento"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Setores permitem organizar as conversas por departamento (Vendas, Suporte, Financeiro) e controlar quais membros atendem quais setores.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 21. ASSINATURA / PLANOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "subscription",
    title: "Assinatura & Planos",
    description: "Planos, pagamentos e histórico de faturamento",
    icon: CreditCard,
    color: "text-blue-700",
    articles: [
      {
        id: "subscription-plans",
        title: "Conhecendo os planos disponíveis",
        description: "Entenda as diferenças entre os planos e o que cada um oferece",
        tags: ["plano", "assinatura", "preço", "mensalidade", "upgrade"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Acesse "Configurações → Planos" para ver todos os planos disponíveis com preços e funcionalidades incluídas.',
          },
          {
            type: "tip",
            content:
              "Planos anuais têm desconto em relação ao mensal. Se você planeja usar por mais de 6 meses, o anual já vale mais a pena.",
          },
        ],
      },
      {
        id: "subscription-manage",
        title: "Minha Assinatura — Como gerenciar",
        description: "Ver, renovar ou cancelar assinatura",
        tags: ["assinatura", "cancelar", "renovar", "pagamento", "boleto", "pix", "cartão"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Gerenciar assinatura:",
            content: [
              'Acesse "Configurações → Minha Assinatura".',
              "Veja status, data de vencimento e próxima cobrança.",
              'Para renovar: clique em "Pagar" se estiver vencida.',
              'Para fazer upgrade: clique em "Mudar Plano".',
            ],
          },
          {
            type: "list",
            heading: "Formas de pagamento aceitas:",
            content: [
              "💳 Cartão de crédito (aprovação imediata)",
              "⚡ PIX (aprovação em minutos)",
              "📋 Boleto bancário (processamento em até 1–3 dias úteis)",
            ],
          },
        ],
      },
      {
        id: "subscription-history",
        title: "Histórico de Pagamentos",
        description: "Veja todos os pagamentos realizados",
        tags: ["histórico", "pagamento", "fatura", "recibo", "nota fiscal"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'O histórico de pagamentos fica em "Configurações → Histórico de Pagamentos". Lá você pode ver todas as transações realizadas e baixar comprovantes.',
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 22. CONTATO & SUPORTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "support-tickets",
    title: "Contato & Suporte",
    description: "Fale com nosso suporte diretamente pelo WhatsApp",
    icon: Ticket,
    color: "text-orange-600",
    articles: [
      {
        id: "support-whatsapp",
        title: "Como falar com o suporte pelo WhatsApp",
        description: "Entre em contato direto com nossa equipe via WhatsApp",
        tags: ["suporte", "whatsapp", "ajuda", "contato", "atendimento", "problema"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Nossa equipe de suporte está disponível diretamente pelo WhatsApp. É a forma mais rápida e eficiente de resolver dúvidas, relatar problemas ou solicitar ajuda personalizada.",
          },
          {
            type: "steps",
            heading: "Como entrar em contato:",
            content: [
              "Clique no botão verde 'Falar no WhatsApp' abaixo — ou salve o número +55 17 99164-8288.",
              "Envie uma mensagem descrevendo o problema ou dúvida.",
              "Informe: seu nome, e-mail de cadastro e o que está acontecendo.",
              "Nossa equipe responde em horário comercial (segunda a sexta, 9h–18h).",
            ],
          },
          {
            type: "tip",
            content:
              "Para agilizar o atendimento, envie também um print da tela com o problema. Isso ajuda muito nossa equipe a entender e resolver mais rápido!",
          },
          {
            type: "list",
            heading: "Exemplos de como descrever bem o problema:",
            content: [
              "✅ BOM: 'Meu agente parou de responder desde ontem às 14h. O WhatsApp está conectado mas nenhuma mensagem está sendo respondida. Testei no simulador e deu erro.'",
              "✅ BOM: 'Preciso de ajuda para configurar o cardápio do delivery. Tenho 3 categorias e não sei como organizar.'",
              "❌ RUIM: 'Não funciona' — sem contexto, muito difícil de ajudar.",
              "❌ RUIM: 'Tem um erro' — qual erro? Em qual tela?",
            ],
          },
        ],
      },
      {
        id: "support-self-help",
        title: "Resolução rápida — problemas comuns",
        description: "Soluções para os problemas mais frequentes sem precisar contatar o suporte",
        tags: ["problema", "erro", "não funciona", "solucionar", "whatsapp desconectado", "agente não responde"],
        difficulty: "beginner",
        content: [
          {
            type: "list",
            heading: "Problemas mais comuns e soluções:",
            content: [
              "🔌 **WhatsApp desconectado** → Vá em 'Conexão' e reconecte escaneando o QR Code. Verifique se o celular está com internet.",
              "🤖 **Agente não responde** → Verifique se o toggle 'Agente Ativo' está ligado em 'Meu Agente IA', se a IA desta conexão está ativa em 'Conexão' e se o número não está na Lista de Exclusão.",
              "📵 **QR Code não aparece** → Atualize a página (F5). Se persistir, limpe o cache do navegador.",
              "📨 **Mensagens em massa não enviam** → Verifique se a lista de contatos está preenchida e se o WhatsApp está conectado.",
              "🔐 **Não consigo fazer login** → Use 'Esqueci minha senha' na tela de login. Verifique o spam do e-mail.",
              "💳 **Problema com pagamento** → Verifique se o cartão não está bloqueado ou com limite insuficiente. Tente PIX como alternativa.",
            ],
          },
          {
            type: "tip",
            content:
              "Mais de 80% dos problemas são resolvidos reconectando o WhatsApp ou verificando se o agente está ativo. Sempre comece por aí antes de contatar o suporte.",
          },
        ],
      },
      {
        id: "support-hours",
        title: "Horários e política de atendimento",
        description: "Saiba quando e como nossa equipe está disponível",
        tags: ["horário", "atendimento", "suporte", "disponibilidade", "prazo", "resposta"],
        difficulty: "beginner",
        content: [
          {
            type: "list",
            heading: "Informações de atendimento:",
            content: [
              "📅 **Dias**: Segunda a Sexta-feira",
              "⏰ **Horário**: 9h às 18h (horário de Brasília)",
              "📱 **Canal**: WhatsApp +55 17 99164-8288",
              "⚡ **Tempo médio de resposta**: até 4 horas úteis",
              "🚨 **Urgências técnicas** (sistema fora do ar): Tratamos com prioridade máxima",
            ],
          },
          {
            type: "tip",
            content:
              "Fora do horário comercial, nossa Central de Ajuda (este guia) tem resposta para os problemas mais comuns. A maioria das dúvidas pode ser resolvida consultando os artigos antes mesmo de precisar do suporte.",
          },
        ],
      },
    ],
  },
];
