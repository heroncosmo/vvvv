export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  precoMensal: number;
  precoAnual: number;
  economiaAnual: number;
  destaque?: boolean;
  badge?: string;
  recursos: string[];
  cta: string;
  limites?: {
    conversas: string;
    usuarios: string;
    numeros: string;
    campanhas: string;
    contatos: string;
  };
}

export const planosData: Plano[] = [
  {
    id: "starter",
    nome: "Starter",
    descricao: "Para empreendedores solo e pequenos negócios",
    precoMensal: 97,
    precoAnual: 970,
    economiaAnual: 194,
    recursos: [
      "Atendimento com IA 24/7",
      "Até 500 conversas/mês",
      "1 número de WhatsApp",
      "1 usuário",
      "CRM básico",
      "Agendamentos simples",
      "Suporte por email"
    ],
    limites: {
      conversas: "500/mês",
      usuarios: "1",
      numeros: "1",
      campanhas: "2/mês",
      contatos: "1.000"
    },
    cta: "Começar grátis"
  },
  {
    id: "pro",
    nome: "Pro",
    descricao: "Para quem já tem volume diário no WhatsApp",
    precoMensal: 197,
    precoAnual: 1970,
    economiaAnual: 394,
    destaque: true,
    badge: "Mais escolhido",
    recursos: [
      "Tudo do Starter +",
      "Até 2.000 conversas/mês",
      "Até 3 números de WhatsApp",
      "Até 3 usuários",
      "CRM completo com funil",
      "Campanhas em massa ilimitadas",
      "Agendamentos avançados",
      "Métricas e relatórios",
      "Suporte prioritário 24/7"
    ],
    limites: {
      conversas: "2.000/mês",
      usuarios: "3",
      numeros: "3",
      campanhas: "Ilimitadas",
      contatos: "5.000"
    },
    cta: "Testar 14 dias grátis"
  },
  {
    id: "scale",
    nome: "Scale",
    descricao: "Para times e empresas com alto volume",
    precoMensal: 397,
    precoAnual: 3970,
    economiaAnual: 794,
    recursos: [
      "Tudo do Pro +",
      "Conversas ilimitadas",
      "Números de WhatsApp ilimitados",
      "Usuários ilimitados",
      "API completa",
      "Integrações avançadas",
      "Webhooks personalizados",
      "Dedicado success manager",
      "SLA de 99.9% uptime",
      "Treinamento personalizado"
    ],
    limites: {
      conversas: "Ilimitadas",
      usuarios: "Ilimitados",
      numeros: "Ilimitados",
      campanhas: "Ilimitadas",
      contatos: "Ilimitados"
    },
    cta: "Falar com especialista"
  }
];
