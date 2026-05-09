/**
 * Humanization Module
 * Sistema para tornar respostas mais naturais e humanas
 * Inclui variação de saudações, conectores e tom natural
 */

// ═══════════════════════════════════════════════════════════
// 💬 VARIAÇÕES DE SAUDAÇÕES
// ═══════════════════════════════════════════════════════════

const SAUDACOES = {
  formal: [
    "Olá",
    "Bom dia",
    "Boa tarde",
    "Boa noite",
    "Seja bem-vindo(a)",
  ],
  informal: [
    "Oi",
    "Olá",
    "Opa",
    "E aí",
    "Fala",
    "Olá! 👋",
  ],
  moderado: [
    "Olá",
    "Oi",
    "Olá! 😊",
    "Oi!",
    "Bem-vindo(a)",
  ],
};

const DESPEDIDAS = {
  formal: [
    "Até logo",
    "Tenha um ótimo dia",
    "Fico à disposição",
    "Qualquer dúvida, estou por aqui",
  ],
  informal: [
    "Até mais",
    "Falou",
    "Qualquer coisa é só chamar",
    "Tchau! 👋",
    "Até breve",
  ],
  moderado: [
    "Até logo",
    "Até mais",
    "Estou por aqui se precisar",
    "Qualquer dúvida, me chama 😊",
  ],
};

const CONECTORES = {
  confirmacao: [
    "Entendi",
    "Perfeito",
    "Certo",
    "Ótimo",
    "Beleza",
    "Compreendi",
    "Entendido",
  ],
  pensamento: [
    "Veja bem",
    "Deixa eu te explicar",
    "É o seguinte",
    "Olha só",
    "Bom",
    "Então",
  ],
  transicao: [
    "Além disso",
    "Também",
    "Outra coisa",
    "Ah, e",
    "Por sinal",
  ],
  empatia: [
    "Entendo sua preocupação",
    "Sei como é",
    "Te entendo perfeitamente",
    "Compreendo",
    "Imagino",
  ],
};

// ═══════════════════════════════════════════════════════════
// 🎲 FUNÇÕES DE VARIAÇÃO
// ═══════════════════════════════════════════════════════════

type FormalityLevel = "formal" | "informal" | "moderado";

function determineFormalityLevel(formalityScore: number): FormalityLevel {
  if (formalityScore >= 7) return "formal";
  if (formalityScore <= 3) return "informal";
  return "moderado";
}

export function getRandomGreeting(formalityLevel: number): string {
  const level = determineFormalityLevel(formalityLevel);
  const options = SAUDACOES[level];
  return options[Math.floor(Math.random() * options.length)];
}

export function getRandomFarewell(formalityLevel: number): string {
  const level = determineFormalityLevel(formalityLevel);
  const options = DESPEDIDAS[level];
  return options[Math.floor(Math.random() * options.length)];
}

export function getRandomConnector(type: keyof typeof CONECTORES): string {
  const options = CONECTORES[type];
  return options[Math.floor(Math.random() * options.length)];
}

// ═══════════════════════════════════════════════════════════
// 🎭 ADICIONAR ELEMENTOS HUMANOS À RESPOSTA
// ═══════════════════════════════════════════════════════════

export interface HumanizationOptions {
  formalityLevel: number;
  useEmojis: "nunca" | "raro" | "moderado" | "frequente";
  customerName?: string;
  isFirstMessage?: boolean;
}

/**
 * Adiciona saudação natural no início se apropriado
 */
export function addGreeting(response: string, options: HumanizationOptions): string {
  // Só adicionar saudação se:
  // 1. Resposta ainda não tem saudação
  // 2. É primeira mensagem OU resposta é curta (< 100 chars)
  
  const hasGreeting = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí)/i.test(response);
  
  if (hasGreeting) {
    return response; // Já tem saudação
  }
  
  const shouldAddGreeting = options.isFirstMessage || response.length < 100;
  
  if (!shouldAddGreeting) {
    return response;
  }
  
  const greeting = getRandomGreeting(options.formalityLevel);
  
  if (options.customerName && options.formalityLevel >= 5) {
    return `${greeting}, ${options.customerName}! ${response}`;
  }
  
  return `${greeting}! ${response}`;
}

/**
 * Adiciona conectores naturais para tornar mais fluido
 */
export function addConnectors(response: string, options: HumanizationOptions): string {
  // 🎯 PRESERVAR QUEBRAS DE LINHA - Se a resposta tem quebras de linha intencionais, não processar
  if (response.includes('\n')) {
    return response; // Resposta já formatada com quebras de linha, preservar
  }
  
  // Se resposta tem múltiplas frases, adicionar conectores entre elas
  const sentences = response.split(/\. /).filter(s => s.length > 10);
  
  if (sentences.length <= 1) {
    return response; // Muito curto, não precisa
  }
  
  // Adicionar conector apenas na segunda frase (não exagerar)
  if (sentences.length >= 2 && Math.random() > 0.5) {
    const connector = getRandomConnector("transicao");
    sentences[1] = `${connector}, ${sentences[1].charAt(0).toLowerCase()}${sentences[1].slice(1)}`;
  }
  
  return sentences.join('. ') + (response.endsWith('.') ? '' : '.');
}

/**
 * Adiciona emojis com base na frequência configurada
 */
export function addEmojis(response: string, options: HumanizationOptions): string {
  if (options.useEmojis === "nunca") {
    return response;
  }
  
  // Já tem emojis? Não adicionar mais
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
  if (emojiRegex.test(response)) {
    return response;
  }
  
  const probability = {
    raro: 0.2,
    moderado: 0.5,
    frequente: 0.8,
  }[options.useEmojis];
  
  if (Math.random() > probability) {
    return response; // Não adicionar desta vez
  }
  
  // Emojis contextuais baseados em palavras-chave
  const emojiMap: Record<string, string> = {
    obrigad: "😊",
    ajud: "🤝",
    pergun: "❓",
    produto: "📦",
    preço: "💰",
    entrega: "🚚",
    disponível: "✅",
    não: "❌",
    sim: "✔️",
    ótimo: "😄",
    perfeito: "👌",
    legal: "😊",
    desculp: "😔",
    aguard: "⏰",
  };
  
  // Encontrar emoji contextual
  const responseLower = response.toLowerCase();
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (responseLower.includes(keyword)) {
      // Adicionar no final
      return response + ` ${emoji}`;
    }
  }
  
  // Emoji genérico amigável se nenhum contextual foi encontrado
  const genericEmojis = ["😊", "🙂", "✨"];
  const randomEmoji = genericEmojis[Math.floor(Math.random() * genericEmojis.length)];
  
  return response + ` ${randomEmoji}`;
}

// ═══════════════════════════════════════════════════════════
// 🎨 FUNÇÃO PRINCIPAL: HUMANIZAR RESPOSTA
// ═══════════════════════════════════════════════════════════

export function humanizeResponse(response: string, options: HumanizationOptions): string {
  let humanized = response;
  
  // 1. Adicionar saudação se apropriado
  humanized = addGreeting(humanized, options);
  
  // 2. Adicionar conectores para fluência
  humanized = addConnectors(humanized, options);
  
  // 3. Adicionar emojis se configurado
  humanized = addEmojis(humanized, options);
  
  return humanized;
}

// ═══════════════════════════════════════════════════════════
// 🧠 DETECÇÃO DE EMOÇÃO SIMPLES (sem LLM)
// ═══════════════════════════════════════════════════════════

export type EmotionType = "neutral" | "positive" | "negative" | "frustrated" | "excited";

export function detectEmotion(message: string): EmotionType {
  const messageLower = message.toLowerCase();
  
  // Palavras de frustração
  const frustratedKeywords = [
    "não funciona", "problema", "erro", "bug", "ruim",
    "péssimo", "horrível", "demora", "demorado", "lento",
    "não consigo", "não entendi", "confuso"
  ];
  
  // Palavras positivas
  const positiveKeywords = [
    "obrigado", "obrigada", "agradeço", "gostei", "amei",
    "perfeito", "ótimo", "excelente", "maravilhoso", "legal"
  ];
  
  // Palavras de empolgação
  const excitedKeywords = [
    "quero", "preciso", "urgente", "rápido", "agora",
    "animado", "ansioso", "mal posso esperar"
  ];
  
  // Palavras negativas
  const negativeKeywords = [
    "não", "nunca", "nada", "nenhum", "impossível",
    "difícil", "complicado"
  ];
  
  // Contar matches
  const frustratedCount = frustratedKeywords.filter(k => messageLower.includes(k)).length;
  const positiveCount = positiveKeywords.filter(k => messageLower.includes(k)).length;
  const excitedCount = excitedKeywords.filter(k => messageLower.includes(k)).length;
  const negativeCount = negativeKeywords.filter(k => messageLower.includes(k)).length;
  
  // Determinar emoção dominante
  if (frustratedCount > 0) return "frustrated";
  if (positiveCount > 0) return "positive";
  if (excitedCount >= 2) return "excited";
  if (negativeCount >= 2) return "negative";
  
  return "neutral";
}

/**
 * Ajustar tom de resposta baseado na emoção detectada
 */
export function adjustToneForEmotion(response: string, emotion: EmotionType, formalityLevel: number): string {
  const level = determineFormalityLevel(formalityLevel);
  
  switch (emotion) {
    case "frustrated":
      // Adicionar empatia
      const empathy = getRandomConnector("empatia");
      return `${empathy}. ${response} Estou aqui para ajudar! 🤝`;
      
    case "positive":
      // Reforçar positividade
      return response + " Fico feliz em ajudar! 😊";
      
    case "excited":
      // Manter energia
      if (level === "informal") {
        return response + " Vamos nessa! 🚀";
      }
      return response;
      
    case "negative":
      // Ser mais cuidadoso
      return `${response} Se tiver alguma dúvida, estou à disposição.`;
      
    default:
      return response;
  }
}
