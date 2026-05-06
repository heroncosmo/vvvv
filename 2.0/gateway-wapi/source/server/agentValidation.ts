/**
 * Agent Validation Module
 * Sistema de guardrails, detecção off-topic e prevenção de jailbreak
 * Baseado em research de Anthropic Constitutional AI e OpenAI Safety
 */

import { getLLMClient } from "./llm";
import { resolveApiKey } from "./mistralClient";
import type { BusinessAgentConfig } from "@db/schema";

// ═══════════════════════════════════════════════════════════
// 🛡️ DETECÇÃO OFF-TOPIC
// ═══════════════════════════════════════════════════════════

export interface OffTopicResult {
  isOffTopic: boolean;
  confidence: number; // 0-1
  reason?: string;
  suggestedRedirect?: string;
}

// Cache para evitar chamadas repetidas
const offTopicCache = new Map<string, { result: OffTopicResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function detectOffTopic(
  message: string,
  allowedTopics: string[],
  prohibitedTopics: string[],
  config: BusinessAgentConfig
): Promise<OffTopicResult> {
  // Verificar cache
  const cacheKey = `${message.toLowerCase()}_${config.id}`;
  const cached = offTopicCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Criar prompt de classificação
  const classificationPrompt = `
Você é um classificador de mensagens. Analise se a mensagem está DENTRO ou FORA do escopo permitido.

TÓPICOS PERMITIDOS:
${allowedTopics.map(t => `• ${t}`).join('\n')}

TÓPICOS PROIBIDOS:
${prohibitedTopics.map(t => `• ${t}`).join('\n')}

MENSAGEM DO USUÁRIO:
"${message}"

ANÁLISE: A mensagem está dentro do escopo de "${config.companyName}"?

Responda APENAS com um JSON no formato:
{
  "isOffTopic": true/false,
  "confidence": 0.0-1.0,
  "reason": "breve explicação",
  "category": "categoria identificada"
}
`;

  try {
    // const apiKey = await resolveApiKey(); // Not needed if using getLLMClient()
    const mistral = await getLLMClient(); // Use the exported function which handles mocks

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: "user", content: classificationPrompt }
      ],
      temperature: 0.1, // Baixa temperatura para respostas consistentes
      maxTokens: 150,
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: análise baseada em keywords
      return fallbackOffTopicDetection(message, allowedTopics, prohibitedTopics);
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    const result: OffTopicResult = {
      isOffTopic: analysis.isOffTopic || false,
      confidence: analysis.confidence || 0.5,
      reason: analysis.reason,
      suggestedRedirect: analysis.isOffTopic 
        ? `Entendo! Sobre ${allowedTopics[0]}, posso te ajudar com isso?`
        : undefined,
    };

    // Salvar no cache
    offTopicCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;

  } catch (error) {
    console.error("Erro ao detectar off-topic:", error);
    // Fallback em caso de erro
    return fallbackOffTopicDetection(message, allowedTopics, prohibitedTopics);
  }
}

// Detecção fallback baseada em keywords (quando Mistral falha)
function fallbackOffTopicDetection(
  message: string,
  allowedTopics: string[],
  prohibitedTopics: string[]
): OffTopicResult {
  const messageLower = message.toLowerCase();

  // Verificar tópicos proibidos
  const prohibitedMatch = prohibitedTopics.find(topic => 
    messageLower.includes(topic.toLowerCase())
  );

  if (prohibitedMatch) {
    return {
      isOffTopic: true,
      confidence: 0.8,
      reason: `Tópico proibido detectado: ${prohibitedMatch}`,
      suggestedRedirect: `Posso te ajudar com algo relacionado aos nossos serviços?`,
    };
  }

  // Verificar tópicos permitidos
  const allowedMatch = allowedTopics.some(topic => 
    messageLower.includes(topic.toLowerCase())
  );

  if (allowedMatch) {
    return {
      isOffTopic: false,
      confidence: 0.7,
    };
  }

  // Incerto - considerar in-scope por padrão para não bloquear muito
  return {
    isOffTopic: false,
    confidence: 0.5,
    reason: "Análise incerta, mantendo in-scope",
  };
}

// ═══════════════════════════════════════════════════════════
// 🚨 DETECÇÃO DE JAILBREAK
// ═══════════════════════════════════════════════════════════

export interface JailbreakResult {
  isJailbreakAttempt: boolean;
  confidence: number;
  type?: string; // "role-play", "instruction-override", "prompt-injection", etc
  severity: "low" | "medium" | "high";
}

const JAILBREAK_PATTERNS = [
  // Role-play attacks
  /ignore (all|previous) (instructions|rules|commands)/i,
  /forget (everything|all|what) (you|i) (told|said|mentioned)/i,
  /you are now|act as|pretend to be|simulate/i,
  /disregard (your|the) (role|identity|system)/i,
  
  // Prompt injection
  /new (instructions|system|prompt|rules)/i,
  /override (previous|system|current)/i,
  /(start|begin) (new|fresh) (conversation|session)/i,
  /system:\s*|admin:\s*|root:\s*/i,
  
  // Information extraction
  /show (me )?(your|the) (prompt|instructions|system|rules)/i,
  /what (are|is) (your|the) (instructions|system prompt|rules)/i,
  /repeat (your|the) (instructions|prompt)/i,
  
  // Identity manipulation
  /you('re| are) not (really )?[a-z]+/i,
  /stop being [a-z]+/i,
  /don't be [a-z]+/i,
];

export function detectJailbreak(message: string): JailbreakResult {
  const messageLower = message.toLowerCase();

  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(messageLower)) {
      return {
        isJailbreakAttempt: true,
        confidence: 0.9,
        type: determineJailbreakType(message),
        severity: "high",
      };
    }
  }

  // Detecção de múltiplas tentativas de mudança de comportamento
  const suspiciousKeywords = [
    "ignore", "forget", "pretend", "act as", "you are now",
    "system", "admin", "override", "new instructions"
  ];

  const keywordCount = suspiciousKeywords.filter(keyword => 
    messageLower.includes(keyword)
  ).length;

  if (keywordCount >= 2) {
    return {
      isJailbreakAttempt: true,
      confidence: 0.7,
      type: "multiple-suspicious-keywords",
      severity: "medium",
    };
  }

  return {
    isJailbreakAttempt: false,
    confidence: 0.0,
    severity: "low",
  };
}

function determineJailbreakType(message: string): string {
  const messageLower = message.toLowerCase();
  
  if (/act as|pretend|simulate|you are now/.test(messageLower)) {
    return "role-play-attack";
  }
  if (/ignore|forget|disregard/.test(messageLower)) {
    return "instruction-override";
  }
  if (/show.*prompt|repeat.*instructions/.test(messageLower)) {
    return "information-extraction";
  }
  if (/system:|admin:|override/.test(messageLower)) {
    return "prompt-injection";
  }
  
  return "unknown";
}

// ═══════════════════════════════════════════════════════════
// 🔄 GERAÇÃO DE RESPOSTA OFF-TOPIC
// ═══════════════════════════════════════════════════════════

export function generateOffTopicResponse(
  config: BusinessAgentConfig,
  offTopicResult: OffTopicResult
): string {
  const responses = [
    `Entendo sua pergunta! Porém, como ${config.agentName} da ${config.companyName}, meu foco é ajudar com ${config.allowedTopics?.[0] || "nossos serviços"}. Posso te ajudar com algo relacionado?`,
    
    `Boa pergunta! Mas essa não é minha área de expertise 😊 Sou especialista em ${config.allowedTopics?.[0] || "nossos produtos e serviços"}. O que você gostaria de saber sobre isso?`,
    
    `Obrigado por perguntar! Esse assunto está um pouco fora do que eu posso ajudar. Mas tenho ótimas informações sobre ${config.allowedTopics?.[0]}. Te interessa?`,
    
    `Legal sua pergunta! Mas não sou o melhor para responder isso 😅 Agora, se quiser saber sobre ${config.allowedTopics?.[0] || "nossos serviços"}, aí eu sou expert! Como posso ajudar?`,
  ];

  // Escolher resposta baseada na formalidade
  const formalityLevel = config.formalityLevel || 5;
  
  if (formalityLevel >= 7) {
    // Resposta formal
    return `Agradeço sua mensagem. No entanto, esse tópico está fora do meu escopo de atendimento. Como ${config.agentName}, estou preparado para auxiliá-lo(a) com questões relacionadas a ${config.allowedTopics?.[0] || "nossos serviços"}. Posso ajudá-lo(a) com algo nesse sentido?`;
  } else if (formalityLevel <= 3) {
    // Resposta informal
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
  } else {
    // Resposta equilibrada
    return responses[0];
  }
}

// ═══════════════════════════════════════════════════════════
// ✅ VALIDAÇÃO DE RESPOSTA DO AGENTE
// ═══════════════════════════════════════════════════════════

export interface ResponseValidation {
  isValid: boolean;
  maintainsIdentity: boolean;
  staysInScope: boolean;
  issues: string[];
}

export function validateAgentResponse(
  response: string,
  config: BusinessAgentConfig
): ResponseValidation {
  const issues: string[] = [];
  let maintainsIdentity = true;
  let staysInScope = true;

  // 1. Verificar se mantém identidade
  const wrongIdentityPatterns = [
    /eu sou (claude|gpt|chatgpt|assistant|ai)/i,
    /como (uma |um )?(ia|inteligência artificial|modelo de linguagem)/i,
    /não tenho (nome|identidade|personalidade)/i,
  ];

  for (const pattern of wrongIdentityPatterns) {
    if (pattern.test(response)) {
      maintainsIdentity = false;
      issues.push("Resposta não mantém identidade correta do agente");
      break;
    }
  }

  // 2. Verificar se não vazou instruções do sistema
  const systemLeakPatterns = [
    /system prompt|instruções do sistema/i,
    /foi programado para|fui treinado para/i,
    /meu criador|openai|anthropic|mistral/i,
  ];

  for (const pattern of systemLeakPatterns) {
    if (pattern.test(response)) {
      issues.push("Resposta contém vazamento de informações do sistema");
      staysInScope = false;
      break;
    }
  }

  // 3. Verificar tamanho
  if (response.length > (config.maxResponseLength * 1.2)) {
    issues.push("Resposta muito longa (>20% do limite)");
  }

  // 4. Verificar se não responde sobre tópicos proibidos
  if (config.prohibitedTopics && config.prohibitedTopics.length > 0) {
    const responseLower = response.toLowerCase();
    const mentionedProhibited = config.prohibitedTopics.find(topic =>
      responseLower.includes(topic.toLowerCase())
    );
    
    if (mentionedProhibited) {
      issues.push(`Resposta menciona tópico proibido: ${mentionedProhibited}`);
      staysInScope = false;
    }
  }

  return {
    isValid: issues.length === 0,
    maintainsIdentity,
    staysInScope,
    issues,
  };
}

// ═══════════════════════════════════════════════════════════
// 🧹 LIMPEZA DE CACHE
// ═══════════════════════════════════════════════════════════

export function cleanupOffTopicCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  offTopicCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => offTopicCache.delete(key));
  
  console.log(`[Cache Cleanup] Removed ${keysToDelete.length} expired entries`);
}

// Executar cleanup a cada 10 minutos
setInterval(cleanupOffTopicCache, 10 * 60 * 1000);
