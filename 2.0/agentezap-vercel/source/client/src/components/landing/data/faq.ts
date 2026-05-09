export interface FAQItem {
  id: string;
  pergunta: string;
  resposta: string;
  categoria: string;
}

export const faqData: FAQItem[] = [
  {
    id: "conhecimento-tecnico",
    pergunta: "Preciso de conhecimento técnico para usar?",
    resposta: "Não! Nossa plataforma foi desenhada para ser super intuitiva. Você só precisa saber usar WhatsApp normalmente. O setup leva menos de 5 minutos: conecte seu número com QR code, ative a IA com um clique e comece a usar. Temos tutoriais em vídeo e suporte via chat se precisar de ajuda.",
    categoria: "setup"
  },
  {
    id: "numero-atual",
    pergunta: "Funciona com meu número atual de WhatsApp?",
    resposta: "Sim! Você usa seu próprio número de WhatsApp, não criamos um novo. A plataforma se integra ao seu número existente via QR code seguro. Todas as conversas continuam no seu WhatsApp normally, só que com automação inteligente trabalhando para você 24/7.",
    categoria: "setup"
  },
  {
    id: "configuracao-ia",
    pergunta: "Como a IA é configurada e treinada no meu negócio?",
    resposta: "Nossa IA já vem pré-treinada com padrões de atendimento eficazes. Além disso, você pode personalizar: 1) Tom de voz (formal, casual, etc.), 2) Informações sobre seu negócio (horários, serviços, preços), 3) Respostas específicas para perguntas comuns. A IA aprende com suas conversas e melhora automaticamente.",
    categoria: "ia"
  },
  {
    id: "cancelamento",
    pergunta: "O que acontece se eu parar de pagar?",
    resposta: "Seu acesso continua até o final do período pago. Cancelamento é simples: um clique no painel e pronto. Seus dados (contatos, conversas, configurações) ficam salvos por 90 dias caso queira voltar. Sem multas, sem burocracia, sem surpresas.",
    categoria: "cobranca"
  },
  {
    id: "cancelamento-qualquer-momento",
    pergunta: "Posso cancelar a qualquer momento?",
    resposta: "Com certeza! Cancelamento é imediato e sem custos. Você pode pausar ou cancelar seu plano quando quiser diretamente no painel. Se cancelar no meio do período, continua acessando até o final do período pago. Sem carência, sem multa, sem retenção.",
    categoria: "cobranca"
  },
  {
    id: "seguranca-dados",
    pergunta: "Meus dados e conversas ficam seguros?",
    resposta: "Totalmente! Usamos criptografia de ponta a ponta (SSL/TLS), servidores com redundância e backup automático diário. Somente você tem acesso às suas conversas. Cumprimos LGPD e nunca vendemos ou compartilhamos seus dados. Além disso, oferecemos autenticação de dois fatores para proteger sua conta.",
    categoria: "seguranca"
  },
  {
    id: "suporte-onboarding",
    pergunta: "Como funciona o suporte e onboarding?",
    resposta: "Você nunca fica abandonado! Temos: 1) Onboarding guiado com passo a passo interativo, 2) Base de conhecimento com tutoriais em vídeo e texto, 3) Suporte por chat (resposta em até 2h durante horário comercial), 4) Webinars semanais de dicas, 5) Grupo exclusivo de clientes para troca de experiências. Nossa equipe especializada está sempre disponível.",
    categoria: "suporte"
  }
];
