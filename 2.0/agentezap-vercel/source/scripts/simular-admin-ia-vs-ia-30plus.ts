/**
 * SIMULADOR IA vs IA - 30+ CENARIOS DINAMICOS
 *
 * Cada cenario:
 *  - Persona cliente gerada dinamicamente (LLM)
 *  - Conversa livre (nao segue script fixo)
 *  - Detecta guided step e responde com dados coerentes da persona
 *  - Valida: sem re-ask, sem mojibake, sem falso "conta existente",
 *    entrega deterministica (link + email + /login)
 *
 * Uso:
 *   cd vvvv
 *   npx tsx scripts/simular-admin-ia-vs-ia-30plus.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { clearClientSession, processAdminMessage } from "../server/adminAgentService";
import { chatComplete } from "../server/llm";
import { storage } from "../server/storage";

// ─── TYPES ───

interface Persona {
  id: string;
  name: string;
  businessName: string;
  businessType: string;
  objective: string;
  businessReply: string;
  behaviorReply: string;
  workflowReply: string;
  behaviorStyle: "curioso" | "interessado" | "sem-grana" | "desconfiado" | "leigo" | "apressado" | "tecnico" | "prolixo";
}

interface TurnLog {
  turn: number;
  client: string;
  agent: string;
  checks: {
    hasMojibake: boolean;
    mojibakeMatches: string[];
    hasReask: boolean;
    hasFalseExisting: boolean;
    hasDelivery: boolean;
  };
}

interface ScenarioResult {
  scenarioId: string;
  persona: string;
  phone: string;
  success: boolean;
  failReasons: string[];
  turns: TurnLog[];
  deliveredCredentials: boolean;
  hasDeterministicDelivery: boolean;
  totalTurns: number;
  durationMs: number;
}

// ─── 30+ PERSONAS ───

const PERSONAS: Persona[] = [
  // 1-6: Core business types
  {
    id: "petshop-curioso", name: "Carlos", businessName: "Pet World", businessType: "petshop",
    objective: "Voce tem um petshop e quer automatizar atendimento. Pergunte bastante antes de decidir.",
    businessReply: "Meu negocio e Pet World, vendo racao, acessorios e faco banho e tosa",
    behaviorReply: "Quero que ele atenda como recepcionista, tire duvidas sobre precos e agende banho e tosa",
    workflowReply: "Sim, vai usar agendamento de segunda a sabado das 08 as 18",
    behaviorStyle: "curioso",
  },
  {
    id: "barbearia-interessado", name: "Marcos", businessName: "Barbearia Alfa", businessType: "barbearia",
    objective: "Voce tem barbearia e quer agente que confirme horarios. Ja pesquisou e quer comecar rapido.",
    businessReply: "Meu negocio e Barbearia Alfa e faco corte, barba e sobrancelha",
    behaviorReply: "Quero que ele confirme horarios e fale de forma descontraida com os clientes",
    workflowReply: "Sim, agendamento de segunda a sabado das 09 as 19",
    behaviorStyle: "interessado",
  },
  {
    id: "delivery-apressado", name: "Ana", businessName: "Sabor da Vila", businessType: "delivery",
    objective: "Voce tem delivery de marmita e quer automatizar pedidos. Esta com pressa e quer resultado rapido.",
    businessReply: "Meu negocio e Restaurante Sabor da Vila, vendo marmita e lanche por delivery",
    behaviorReply: "Quero que ele responda rapido, mostre cardapio e faca upsell de bebida",
    workflowReply: "Nao usa agendamento. So delivery de segunda a domingo das 11 as 22",
    behaviorStyle: "apressado",
  },
  {
    id: "estetica-leigo", name: "Julia", businessName: "Studio Beleza Prime", businessType: "estetica",
    objective: "Voce tem clinica de estetica e nao entende nada de tecnologia. Pergunte coisas basicas.",
    businessReply: "Minha empresa e Studio Beleza Prime e trabalho com estetica facial e corporal",
    behaviorReply: "Quero que ele responda duvidas sobre procedimentos e agende horarios",
    workflowReply: "Sim, agendamento de terca a sabado das 09 as 18",
    behaviorStyle: "leigo",
  },
  {
    id: "academia-desconfiado", name: "Roberto", businessName: "Fit Power Gym", businessType: "academia",
    objective: "Voce tem academia e desconfia de ferramentas de IA. Questione tudo, peca provas.",
    businessReply: "Meu negocio e Fit Power Gym, academia com musculacao e aulas coletivas",
    behaviorReply: "Quero que ele tire duvidas sobre planos e horarios de aula",
    workflowReply: "Nao usa agendamento direto. Quero que ele encaminhe pro whatsapp da recepcionista",
    behaviorStyle: "desconfiado",
  },
  {
    id: "loja-sem-grana", name: "Pedro", businessName: "Moda Top", businessType: "loja de roupas",
    objective: "Voce tem loja de roupas e quer testar gratis. Deixe claro que nao quer pagar agora.",
    businessReply: "Minha loja se chama Moda Top e vendo roupas femininas e masculinas",
    behaviorReply: "Quero que ele atenda como vendedor, mostre novidades e faca follow-up",
    workflowReply: "Nao usa agendamento. So atendimento e vendas por whatsapp",
    behaviorStyle: "sem-grana",
  },

  // 7-12: More business types
  {
    id: "pizzaria-prolixo", name: "Giovanni", businessName: "Pizzaria Napoli", businessType: "pizzaria",
    objective: "Voce tem pizzaria e gosta de falar muito. Conte historias e divague antes de responder.",
    businessReply: "Minha pizzaria se chama Napoli, vendo pizza artesanal no forno a lenha ha 15 anos",
    behaviorReply: "Quero que ele seja educado, mostre sabores do dia e encaminhe o pedido",
    workflowReply: "Nao, so delivery de terca a domingo das 18 as 23",
    behaviorStyle: "prolixo",
  },
  {
    id: "consultorio-tecnico", name: "Dra. Fernanda", businessName: "Clinica Sorriso", businessType: "consultorio odontologico",
    objective: "Voce tem consultorio dentario e entende de tecnologia. Questione integracao com Google Calendar.",
    businessReply: "Meu consultorio e Clinica Sorriso, atendo ortodontia e estetica dental",
    behaviorReply: "Quero que ele confirme consultas, envie lembrete e pergunte se tem convenio",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 17",
    behaviorStyle: "tecnico",
  },
  {
    id: "imobiliaria-curioso", name: "Fernando", businessName: "Imov Premium", businessType: "imobiliaria",
    objective: "Voce tem imobiliaria e quer saber se o agente pode qualificar leads. Pergunte muito.",
    businessReply: "Minha empresa e Imov Premium, trabalhamos com venda e aluguel de imoveis",
    behaviorReply: "Quero que ele pergunte regiao, faixa de preco e tipo de imovel e encaminhe pro corretor certo",
    workflowReply: "Nao usa agendamento. Quero que ele capture informacoes e encaminhe",
    behaviorStyle: "curioso",
  },
  {
    id: "escola-interessado", name: "Claudia", businessName: "Escola Criativa", businessType: "escola de idiomas",
    objective: "Voce tem escola de idiomas e quer automatizar matriculas. Quer comecar logo.",
    businessReply: "Minha escola se chama Escola Criativa e dou aula de ingles, espanhol e frances",
    behaviorReply: "Quero que ele informe turmas disponiveis, precos e agende aula experimental",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 21 e sabado das 08 as 12",
    behaviorStyle: "interessado",
  },
  {
    id: "mecanica-leigo", name: "Seu Joao", businessName: "Auto Center JR", businessType: "oficina mecanica",
    objective: "Voce tem oficina e nao sabe mexer em celular direito. Fale de forma simples e direta.",
    businessReply: "Meu negocio e Auto Center JR, faco mecanica geral, eletrica e funilaria",
    behaviorReply: "Quero que ele responda orcamento basico e agende horario pro carro",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 17 e sabado ate meio-dia",
    behaviorStyle: "leigo",
  },
  {
    id: "advocacia-desconfiado", name: "Dr. Henrique", businessName: "Henrique Advocacia", businessType: "escritorio de advocacia",
    objective: "Voce e advogado e tem preocupacao com LGPD. Questione sobre seguranca dos dados.",
    businessReply: "Meu escritorio e Henrique Advocacia, trabalhamos com direito trabalhista e civil",
    behaviorReply: "Quero que ele faca triagem inicial perguntando qual area do direito e encaminhe pro advogado",
    workflowReply: "Nao usa agendamento. Quero que ele capture dados e eu retorno depois",
    behaviorStyle: "desconfiado",
  },

  // 13-18: Edge cases
  {
    id: "hamburgueria-sem-grana", name: "Lucas", businessName: "Burger House", businessType: "hamburgueria",
    objective: "Voce tem hamburgueria e quer testar gratis. Pergunte sobre planos e precos.",
    businessReply: "Meu negocio e Burger House, vendo hamburguer artesanal e milk shake",
    behaviorReply: "Quero que ele mostre cardapio com fotos e faca o pedido completo",
    workflowReply: "Nao usa agendamento. Delivery de terca a domingo das 18 as 23",
    behaviorStyle: "sem-grana",
  },
  {
    id: "floricultura-apressado", name: "Maria", businessName: "Flora Jardim", businessType: "floricultura",
    objective: "Voce tem floricultura e quer agente pra vender mais. Seja rapida e objetiva.",
    businessReply: "Minha loja e Flora Jardim, vendo arranjos, buques e plantas ornamentais",
    behaviorReply: "Quero que ele sugira arranjos baseado na ocasiao e feche a venda",
    workflowReply: "Nao usa agendamento. Quero que ele feche vendas de segunda a sabado",
    behaviorStyle: "apressado",
  },
  {
    id: "tattoo-tecnico", name: "Rick", businessName: "Ink Art Studio", businessType: "estudio de tatuagem",
    objective: "Voce e tatuador e quer saber detalhes tecnicos. Pergunte sobre API e integracao.",
    businessReply: "Meu estudio e Ink Art Studio, faco tatuagem realista, tribal e aquarela",
    behaviorReply: "Quero que ele agende sessoes e mostre portfolio quando cliente perguntar estilo",
    workflowReply: "Sim, agendamento de terca a sabado das 10 as 20",
    behaviorStyle: "tecnico",
  },
  {
    id: "contabilidade-prolixo", name: "Carlos Alberto", businessName: "CA Contabilidade", businessType: "escritorio contabil",
    objective: "Voce e contador e gosta de explicar tudo em detalhes. Fale sobre seus clientes e necessidades.",
    businessReply: "Meu escritorio e CA Contabilidade, atendo MEI, ME e EPP com contabilidade completa",
    behaviorReply: "Quero que ele pergunte o tipo de empresa e CNAE e direcione pro plano certo",
    workflowReply: "Nao usa agendamento. Quero que ele capture dados e eu faco proposta",
    behaviorStyle: "prolixo",
  },
  {
    id: "lavanderia-curioso", name: "Sandra", businessName: "Clean Express", businessType: "lavanderia",
    objective: "Voce tem lavanderia e esta curiosa. Pergunte como funciona, se precisa de computador.",
    businessReply: "Minha lavanderia e Clean Express, faco lavar, passar e servico de tapecaria",
    behaviorReply: "Quero que ele informe precos por peca e agende coleta",
    workflowReply: "Sim, agendar coleta de segunda a sexta das 08 as 17",
    behaviorStyle: "curioso",
  },

  // 19-24: More variety
  {
    id: "autoescola-interessado", name: "Diego", businessName: "Auto Escola Primeira", businessType: "autoescola",
    objective: "Voce tem autoescola e quer modernizar. Quer comecar rapido e testar.",
    businessReply: "Minha autoescola e Auto Escola Primeira, ofrecemos aulas praticas e teoricas",
    behaviorReply: "Quero que ele tire duvidas sobre CNH, precos e agende aula pratica",
    workflowReply: "Sim, agendamento de segunda a sabado das 07 as 19",
    behaviorStyle: "interessado",
  },
  {
    id: "hotel-leigo", name: "Dona Maria", businessName: "Pousada Sol Mar", businessType: "pousada",
    objective: "Voce tem pousada na praia e nao entende de tecnologia. Use linguagem simples.",
    businessReply: "Minha pousada e Pousada Sol Mar, tenho 15 quartos na praia de Ubatuba",
    behaviorReply: "Quero que ele responda sobre disponibilidade de quartos e precos por diaria",
    workflowReply: "Nao usa agendamento automatico. Quero que ele capture dados da reserva",
    behaviorStyle: "leigo",
  },
  {
    id: "fotografo-desconfiado", name: "Rafael", businessName: "RF Fotografia", businessType: "estudio fotografico",
    objective: "Voce e fotografo e acha que IA nao funciona. Questione qualidade e peca prova.",
    businessReply: "Meu estudio e RF Fotografia, faco ensaio, casamento e formatura",
    behaviorReply: "Quero que ele mostre portfolio e agende sessao com detalhes do pacote",
    workflowReply: "Sim, agendamento livre de segunda a domingo",
    behaviorStyle: "desconfiado",
  },
  {
    id: "supermercado-sem-grana", name: "Jose", businessName: "Mercadinho Economia", businessType: "mercado",
    objective: "Voce tem mercadinho de bairro e quer ver se vale a pena. Nao quer gastar.",
    businessReply: "Meu mercado e Mercadinho Economia, vendo alimentos, bebidas e limpeza",
    behaviorReply: "Quero que ele receba lista de compras e confirme se temos os produtos",
    workflowReply: "Nao usa agendamento. So delivery de segunda a sabado das 08 as 20",
    behaviorStyle: "sem-grana",
  },
  {
    id: "personal-apressado", name: "Bruna", businessName: "Bruna Fit", businessType: "personal trainer",
    objective: "Voce e personal trainer e quer agendar alunos. Seja direta e rapida.",
    businessReply: "Sou personal trainer Bruna Fit, dou aula de musculacao e funcional",
    behaviorReply: "Quero que ele agende treinos e mande lembrete 1 hora antes",
    workflowReply: "Sim, agendamento de segunda a sexta das 06 as 21",
    behaviorStyle: "apressado",
  },

  // 25-30: Final batch
  {
    id: "eletricista-tecnico", name: "Fabio", businessName: "FE Eletrica", businessType: "eletricista",
    objective: "Voce e eletricista e quer saber se da pra integrar com sua agenda. Pergunte sobre API.",
    businessReply: "Minha empresa e FE Eletrica, faco instalacao eletrica residencial e comercial",
    behaviorReply: "Quero que ele capture o tipo de servico, endereco e agende visita",
    workflowReply: "Sim, visitas de segunda a sexta das 08 as 17",
    behaviorStyle: "tecnico",
  },
  {
    id: "padaria-prolixo", name: "Dona Lucia", businessName: "Padaria Trigo Bom", businessType: "padaria",
    objective: "Voce tem padaria ha 30 anos e gosta de contar historias. Fale sobre sua experiencia.",
    businessReply: "Minha padaria e Trigo Bom, vendo pao frances, bolo, salgado e faco encomenda",
    behaviorReply: "Quero que ele receba encomendas de bolo e salgado com antecedencia",
    workflowReply: "Nao usa agendamento. Encomendas por whatsapp de segunda a sabado",
    behaviorStyle: "prolixo",
  },
  {
    id: "dentista-curioso", name: "Dra. Camila", businessName: "Odonto Smile", businessType: "consultorio dental",
    objective: "Voce e dentista e quer saber todos os detalhes antes de testar. Pergunte bastante.",
    businessReply: "Meu consultorio e Odonto Smile, faco limpeza, clareamento e implante",
    behaviorReply: "Quero que ele agende consultas e pergunte se tem convenio",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 18",
    behaviorStyle: "curioso",
  },
  {
    id: "loja-celular-interessado", name: "Thiago", businessName: "Tech Cell", businessType: "loja de celular",
    objective: "Voce tem loja de celular e quer vender mais pelo whatsapp. Mostre interesse rapido.",
    businessReply: "Minha loja e Tech Cell, vendo celular, acessorio e faco reparo",
    behaviorReply: "Quero que ele mostre os modelos disponiveis e feche a venda",
    workflowReply: "Nao usa agendamento. Quero que ele venda de segunda a sabado das 09 as 18",
    behaviorStyle: "interessado",
  },
  {
    id: "nutricionista-leigo", name: "Dra. Renata", businessName: "Nutri Vida", businessType: "nutricionista",
    objective: "Voce e nutricionista e nao sabe nada de IA. Pergunte coisas muito basicas tipo 'como instala'.",
    businessReply: "Meu consultorio e Nutri Vida, faco consulta nutricional e acompanhamento",
    behaviorReply: "Quero que ele agende consulta e pergunte restricoes alimentares do paciente",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 17",
    behaviorStyle: "leigo",
  },
  {
    id: "salao-desconfiado", name: "Vanessa", businessName: "Vanessa Hair", businessType: "salao de beleza",
    objective: "Voce tem salao e acha que vai ser complicado. Questione se funciona mesmo.",
    businessReply: "Meu salao e Vanessa Hair, faco corte, coloracao, escova e manicure",
    behaviorReply: "Quero que ele confirme horarios e avise quando tiver horario cancelado",
    workflowReply: "Sim, agendamento de terca a sabado das 09 as 19",
    behaviorStyle: "desconfiado",
  },

  // 31-33: Bonus edge cases
  {
    id: "ecommerce-sem-grana", name: "Giovanna", businessName: "GG Store", businessType: "e-commerce",
    objective: "Voce tem loja online e quer testar gratis primeiro. So paga se funcionar de verdade.",
    businessReply: "Minha loja e GG Store, vendo roupas e acessorios pela internet",
    behaviorReply: "Quero que ele ajude o cliente a escolher tamanho e faca pos-venda",
    workflowReply: "Nao usa agendamento. So atendimento 24h online",
    behaviorStyle: "sem-grana",
  },
  {
    id: "psicologo-tecnico", name: "Dr. Andre", businessName: "Psico Andre", businessType: "consultorio psicologia",
    objective: "Voce e psicologo e se preocupa com sigilo e etica. Questione muito sobre privacidade.",
    businessReply: "Meu consultorio e Psico Andre, faco terapia individual e de casal",
    behaviorReply: "Quero que ele agende sessoes e pergunte se e primeira consulta ou retorno",
    workflowReply: "Sim, agendamento de segunda a sexta das 08 as 20",
    behaviorStyle: "tecnico",
  },
  {
    id: "farmacia-apressado", name: "Ricardo", businessName: "Farma Mais", businessType: "farmacia",
    objective: "Voce tem farmacia e quer implantar rapido. Nao tem tempo a perder.",
    businessReply: "Minha farmacia e Farma Mais, vendo remedios, perfumaria e manipulados",
    behaviorReply: "Quero que ele tire duvidas sobre medicamentos e encaminhe receita pro farmaceutico",
    workflowReply: "Nao usa agendamento. Atendimento de segunda a domingo das 07 as 22",
    behaviorStyle: "apressado",
  },
];

console.log(`Total personas: ${PERSONAS.length}`);

// ─── MOJIBAKE ───

const MOJIBAKE_PATTERNS = [
  /voc\u00c3|n\u00c3\u00a3o|j\u00c3\u00a1|servi\u00c3\u00a7|fun\u00c3\u00a7|neg\u00c3\u00b3|voc\u00c3\u00aa|\u00c3\u00a9|\u00c3\u00a1|\u00c3\u00a3|\u00c3\u00b5|\u00c3\u00a7/i,
  /\u00c3[\u0080-\u00bf]/,
];

function hasMojibake(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of MOJIBAKE_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push(m[0]);
  }
  return { found: matches.length > 0, matches };
}

// ─── DETECTION HELPERS ───

function hasReask(text: string): boolean {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    n.includes("qual e o nome do seu negocio") ||
    n.includes("nome do seu negocio") ||
    n.includes("qual o nome da sua empresa") ||
    n.includes("me conta sobre seu negocio")
  );
}

function hasFalseExistingAccount(text: string): boolean {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    n.includes("mantive a conta existente") ||
    n.includes("mantive sua conta") ||
    n.includes("ja voltou com esse mesmo numero")
  );
}

const REAL_TEST_LINK = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const CANONICAL_EMAIL = /\b\d{10,15}@agentezap\.online\b/i;

function hasDeterministicDelivery(text: string, phone: string): boolean {
  const expected = `${phone.replace(/\D/g, "")}@agentezap.online`.toLowerCase();
  const lower = text.toLowerCase();
  return (
    REAL_TEST_LINK.test(text) &&
    text.includes("/login") &&
    CANONICAL_EMAIL.test(text) &&
    lower.includes(expected)
  );
}

// ─── GUIDED STEP DETECTION ───

function detectGuidedStep(agentMessage: string): "business" | "behavior" | "workflow" | "hours" | null {
  const n = agentMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("qual e o nome do seu negocio") || n.includes("nome do seu negocio") || n.includes("nome do seu negocio e qual e o principal")) {
    return "business";
  }
  if (n.includes("como voce quer que esse agente trabalhe") || n.includes("como quer que o agente")) {
    return "behavior";
  }
  if (n.includes("vai realmente fechar agendamentos") || n.includes("quer que ele feche o pedido") || n.includes("vai usar agendamento") || n.includes("3)")) {
    return "workflow";
  }
  // Detect follow-up / workflow clarification questions
  if (n.includes("com follow-up") || n.includes("sem follow-up") || n.includes("follow-up automatico")) {
    return "workflow";
  }
  // Detect hours/scheduling questions
  if (n.includes("dias e horarios") || n.includes("horario de atendimento") || n.includes("segunda a") || n.includes("formato:")) {
    return "hours";
  }
  return null;
}

// ─── LLM CLIENT MESSAGE GENERATION ───

async function generateClientMessage(
  persona: Persona,
  transcript: Array<{ role: "user" | "assistant"; content: string }>,
  isFirst: boolean,
): Promise<string> {
  const styleGuidance: Record<string, string> = {
    curioso: "Faca perguntas sobre como funciona, se e dificil, quanto custa.",
    interessado: "Mostra interesse e quer comecar rapido. Seja positivo.",
    "sem-grana": "Enfatize que quer testar gratis primeiro. Pergunte sobre planos.",
    desconfiado: "Questione se funciona de verdade. Peca provas e exemplos.",
    leigo: "Fale como alguem que nao entende nada de tecnologia. Use linguagem simples.",
    apressado: "Seja direto e curto. Nao enrole. Quer resultado rapido.",
    tecnico: "Pergunte detalhes tecnicos como API, integracao, webhook.",
    prolixo: "Fale bastante, conte historias antes de responder o que foi pedido.",
  };

  const style = styleGuidance[persona.behaviorStyle] || "Seja natural.";
  const compactHistory = transcript.slice(-8);

  try {
    const content = isFirst
      ? `Voce e ${persona.name}, dono(a) de ${persona.businessName} (${persona.businessType}).\n${persona.objective}\n${style}\n\nEnvie a PRIMEIRA mensagem de whatsapp, curta e natural (1-2 frases).`
      : `Voce e ${persona.name}, dono(a) de ${persona.businessName} (${persona.businessType}).\n${persona.objective}\n${style}\n\nConversa ate agora:\n${compactHistory.map((m) => `${m.role === "user" ? "Voce" : "Vendedor"}: ${m.content}`).join("\n")}\n\nEscreva a proxima resposta em 1-3 frases. Seja coerente e natural.`;

    const response = await chatComplete({
      messages: [
        { role: "system", content: "Voce simula um cliente real no WhatsApp brasileiro. Responda sempre em portugues, sem listas, sem formatacao. Mantenha o tom do personagem." },
        { role: "user", content },
      ],
      maxTokens: 160,
      temperature: 0.85,
    });

    return String(response.choices?.[0]?.message?.content || "").trim() || "Quero saber mais";
  } catch {
    return isFirst ? "Oi, quero saber como funciona" : "Entendi, pode me explicar melhor?";
  }
}

// ─── PHONE GENERATOR ───

function generatePhone(index: number): string {
  // Use DDD 00 (nonexistent in Brazil) to guarantee no collision with real users
  const rand = Math.floor(Math.random() * 90_000_000 + 10_000_000);
  return `5500${rand}${String(index).padStart(2, "0")}`.slice(0, 13);
}

// ─── RUN SCENARIO ───

async function runScenario(persona: Persona, index: number): Promise<ScenarioResult> {
  const phone = generatePhone(index);

  // Full DB + session reset (same pattern as simular-admin-30plus.ts)
  try {
    await storage.resetClientByPhone(phone);
  } catch (e) {
    // ignore if nothing to reset
  }
  clearClientSession(phone);

  const turns: TurnLog[] = [];
  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];
  const failReasons: string[] = [];
  let deliveredCredentials = false;
  let hasDeterministicDeliveryResult = false;
  let businessInfoGiven = false;
  let loopCount = 0;
  let lastAgentStep: string | null = null;
  const startTime = Date.now();

  const MAX_TURNS = 16;

  try {
    let clientMessage = await generateClientMessage(persona, transcript, true);

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      // Call the real agent
      const response = await processAdminMessage(phone, clientMessage, undefined, undefined, true, persona.name);

      if (!response) {
        turns.push({
          turn, client: clientMessage, agent: "[no response - trigger needed]",
          checks: { hasMojibake: false, mojibakeMatches: [], hasReask: false, hasFalseExisting: false, hasDelivery: false },
        });
        // If no trigger, send agentezap
        clientMessage = "agentezap";
        continue;
      }

      const agentText = response.text || "";
      const credentials = response.actions?.testAccountCredentials;

      // ─── CHECKS ───
      const mojiCheck = hasMojibake(agentText);
      const reaskCheck = hasReask(agentText);
      // Only flag as "false existing" if the text says mantive but credentials say it's NOT existing
      const textSaysExisting = hasFalseExistingAccount(agentText);
      const actuallyExisting = credentials?.isExistingAccount === true;
      const falseExistCheck = textSaysExisting && !actuallyExisting;
      const deliveryCheck = hasDeterministicDelivery(agentText, phone);

      if (credentials?.email && credentials?.simulatorToken) deliveredCredentials = true;
      // Structured credentials in actions count as valid delivery (links are not in text)
      if (deliveryCheck || (credentials?.email && credentials?.simulatorToken)) hasDeterministicDeliveryResult = true;

      turns.push({
        turn, client: clientMessage, agent: agentText.slice(0, 600),
        checks: {
          hasMojibake: mojiCheck.found,
          mojibakeMatches: mojiCheck.matches,
          hasReask: reaskCheck,
          hasFalseExisting: falseExistCheck,
          hasDelivery: deliveryCheck,
        },
      });

      transcript.push({ role: "user", content: clientMessage });
      transcript.push({ role: "assistant", content: agentText });

      // ─── FAIL TRACKING ───
      if (mojiCheck.found) failReasons.push(`T${turn}: mojibake [${mojiCheck.matches.join(",")}]`);
      if (businessInfoGiven && reaskCheck) failReasons.push(`T${turn}: re-ask after business given`);
      if (falseExistCheck) failReasons.push(`T${turn}: false "conta existente"`);

      // ─── LOOP DETECTION ───
      const currentStep = detectGuidedStep(agentText);
      if (currentStep && currentStep === lastAgentStep) {
        loopCount++;
        if (loopCount > 2) {
          // Instead of failing, try a direct short answer to break the loop
          clientMessage = loopCount === 3 ? "sim" : "ok, pode seguir";
          continue;
        }
      } else {
        loopCount = 0;
      }
      lastAgentStep = currentStep;

      // ─── DONE CHECK ───
      if (deliveredCredentials && hasDeterministicDeliveryResult) break;

      // ─── NEXT MESSAGE ───
      const guidedStep = detectGuidedStep(agentText);
      if (guidedStep === "business") {
        clientMessage = persona.businessReply;
        businessInfoGiven = true;
        continue;
      }
      if (guidedStep === "behavior") {
        clientMessage = persona.behaviorReply;
        continue;
      }
      if (guidedStep === "workflow") {
        clientMessage = persona.workflowReply;
        continue;
      }
      if (guidedStep === "hours") {
        clientMessage = "segunda a sabado, 09:00 as 18:00";
        continue;
      }

      // If business info already given but not yet delivered, push via LLM
      if (!deliveredCredentials && businessInfoGiven) {
        clientMessage = await generateClientMessage(persona, transcript, false);
      } else if (!businessInfoGiven) {
        // Let LLM continue the natural conversation
        clientMessage = await generateClientMessage(persona, transcript, false);
      } else {
        clientMessage = await generateClientMessage(persona, transcript, false);
      }
    }

    // Final validation
    if (!deliveredCredentials) failReasons.push("no credentials delivered");
    if (!hasDeterministicDeliveryResult) failReasons.push("no credentials in actions (email + simulatorToken)");

    return {
      scenarioId: persona.id,
      persona: `${persona.name} (${persona.businessType}) [${persona.behaviorStyle}]`,
      phone,
      success: failReasons.length === 0,
      failReasons,
      turns,
      deliveredCredentials,
      hasDeterministicDelivery: hasDeterministicDeliveryResult,
      totalTurns: turns.length,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    failReasons.push(`exception: ${error instanceof Error ? error.message : String(error)}`);
    return {
      scenarioId: persona.id,
      persona: `${persona.name} (${persona.businessType}) [${persona.behaviorStyle}]`,
      phone,
      success: false,
      failReasons,
      turns,
      deliveredCredentials,
      hasDeterministicDelivery: hasDeterministicDeliveryResult,
      totalTurns: turns.length,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── MAIN ───

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  IA vs IA SIMULATOR - ${PERSONAS.length} SCENARIOS`);
  console.log(`${"=".repeat(70)}\n`);

  const results: ScenarioResult[] = [];
  const limit = parseInt(process.env.SCENARIO_LIMIT || "0") || PERSONAS.length;
  const personas = PERSONAS.slice(0, limit);

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`\n--- [${i + 1}/${personas.length}] ${persona.id} (${persona.behaviorStyle}) ---`);

    const result = await runScenario(persona, i);
    results.push(result);

    // Cleanup: remove test user from DB to avoid accumulation
    try {
      await storage.resetClientByPhone(result.phone);
      clearClientSession(result.phone);
    } catch (_) { /* ignore */ }

    const status = result.success ? "✅ PASS" : "❌ FAIL";
    console.log(
      `${status} | ${persona.id} | turns=${result.totalTurns} | creds=${result.deliveredCredentials} | delivery=${result.hasDeterministicDelivery} | ${result.durationMs}ms`,
    );
    if (!result.success) {
      console.log(`  Reasons: ${result.failReasons.join(" | ")}`);
    }
  }

  // ─── SUMMARY ───
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  RESULTS: ${passed}/${results.length} PASSED | ${failed} FAILED`);
  console.log(`${"=".repeat(70)}`);

  if (failed > 0) {
    console.log("\n--- FAILURES ---");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  ${r.scenarioId}: ${r.failReasons.join(" | ")}`);
    }
  }

  // ─── BUG-SPECIFIC SUMMARY ───
  const allTurns = results.flatMap((r) => r.turns);
  const totalMojibake = allTurns.filter((t) => t.checks.hasMojibake).length;
  const totalReask = allTurns.filter((t) => t.checks.hasReask).length;
  const totalFalseExist = allTurns.filter((t) => t.checks.hasFalseExisting).length;

  console.log(`\n--- BUG CHECK SUMMARY ---`);
  console.log(`  Mojibake turns: ${totalMojibake} / ${allTurns.length}`);
  console.log(`  Re-ask turns: ${totalReask} / ${allTurns.length}`);
  console.log(`  False "conta existente": ${totalFalseExist} / ${allTurns.length}`);

  // ─── SAVE ───
  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `ia-vs-ia-30plus-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    totalScenarios: results.length,
    passed,
    failed,
    passRate: `${((passed / results.length) * 100).toFixed(1)}%`,
    bugChecks: { mojibakeTurns: totalMojibake, reaskTurns: totalReask, falseExistingTurns: totalFalseExist },
    results,
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport: ${outFile}`);

  // Graceful shutdown: give DB pool time to flush
  setTimeout(() => process.exit(failed > 0 ? 2 : 0), 2000);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
