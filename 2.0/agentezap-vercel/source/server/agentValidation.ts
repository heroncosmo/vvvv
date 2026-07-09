import type { BusinessAgentConfig } from "@db/schema";

export interface OffTopicResult {
  isOffTopic: boolean;
  confidence: number;
  reason?: string;
  suggestedRedirect?: string;
}

const offTopicCache = new Map<string, { result: OffTopicResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function detectOffTopic(
  message: string,
  _allowedTopics: string[],
  _prohibitedTopics: string[],
  config: BusinessAgentConfig,
): Promise<OffTopicResult> {
  const cacheKey = `${String(message || "").toLowerCase()}_${config.id}`;
  const cached = offTopicCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const result: OffTopicResult = {
    isOffTopic: false,
    confidence: 0,
    reason: "off_topic_detector_disabled_codex_context_only",
  };

  offTopicCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

export interface JailbreakResult {
  isJailbreakAttempt: boolean;
  confidence: number;
  type?: string;
  severity: "low" | "medium" | "high";
}

const JAILBREAK_PATTERNS = [
  /ignore (all|previous) (instructions|rules|commands)/i,
  /forget (everything|all|what) (you|i) (told|said|mentioned)/i,
  /you are now|act as|pretend to be|simulate/i,
  /disregard (your|the) (role|identity|system)/i,
  /new (instructions|system|prompt|rules)/i,
  /override (previous|system|current)/i,
  /(start|begin) (new|fresh) (conversation|session)/i,
  /system:\s*|admin:\s*|root:\s*/i,
  /show (me )?(your|the) (prompt|instructions|system|rules)/i,
  /what (are|is) (your|the) (instructions|system prompt|rules)/i,
  /repeat (your|the) (instructions|prompt)/i,
];

export function detectJailbreak(message: string): JailbreakResult {
  const normalized = String(message || "").toLowerCase();

  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isJailbreakAttempt: true,
        confidence: 0.9,
        type: determineJailbreakType(normalized),
        severity: "high",
      };
    }
  }

  const suspiciousKeywords = [
    "ignore",
    "forget",
    "pretend",
    "act as",
    "you are now",
    "system",
    "admin",
    "override",
    "new instructions",
  ];

  const keywordCount = suspiciousKeywords.filter((keyword) =>
    normalized.includes(keyword),
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
    confidence: 0,
    severity: "low",
  };
}

function determineJailbreakType(message: string): string {
  if (/act as|pretend|simulate|you are now/.test(message)) {
    return "role-play-attack";
  }
  if (/ignore|forget|disregard/.test(message)) {
    return "instruction-override";
  }
  if (/show.*prompt|repeat.*instructions/.test(message)) {
    return "information-extraction";
  }
  if (/system:|admin:|override/.test(message)) {
    return "prompt-injection";
  }

  return "unknown";
}

export function generateOffTopicResponse(
  _config: BusinessAgentConfig,
  _offTopicResult: OffTopicResult,
): string {
  return "";
}

export interface ResponseValidation {
  isValid: boolean;
  maintainsIdentity: boolean;
  staysInScope: boolean;
  issues: string[];
}

export function validateAgentResponse(
  response: string,
  config: BusinessAgentConfig,
): ResponseValidation {
  const issues: string[] = [];
  let maintainsIdentity = true;
  let staysInScope = true;
  const text = String(response || "");

  const wrongIdentityPatterns = [
    /eu sou (claude|gpt|chatgpt|assistant|ai)/i,
    /como (uma |um )?(ia|inteligencia artificial|modelo de linguagem)/i,
    /nao tenho (nome|identidade|personalidade)/i,
  ];

  for (const pattern of wrongIdentityPatterns) {
    if (pattern.test(text)) {
      maintainsIdentity = false;
      issues.push("Resposta nao mantem identidade correta do agente");
      break;
    }
  }

  const systemLeakPatterns = [
    /system prompt|instrucoes do sistema/i,
    /foi programado para|fui treinado para/i,
    /meu criador|openai|anthropic|mistral/i,
  ];

  for (const pattern of systemLeakPatterns) {
    if (pattern.test(text)) {
      issues.push("Resposta contem vazamento de informacoes do sistema");
      staysInScope = false;
      break;
    }
  }

  const maxResponseLength = Number(config.maxResponseLength || 0);
  if (maxResponseLength > 0 && text.length > maxResponseLength * 1.2) {
    issues.push("Resposta muito longa (>20% do limite)");
  }

  if (config.prohibitedTopics && config.prohibitedTopics.length > 0) {
    const responseLower = text.toLowerCase();
    const mentionedProhibited = config.prohibitedTopics.find((topic) =>
      responseLower.includes(String(topic || "").toLowerCase()),
    );

    if (mentionedProhibited) {
      issues.push(`Resposta menciona topico proibido: ${mentionedProhibited}`);
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

export function cleanupOffTopicCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  offTopicCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => offTopicCache.delete(key));
  console.log(`[Cache Cleanup] Removed ${keysToDelete.length} expired entries`);
}

setInterval(cleanupOffTopicCache, 10 * 60 * 1000);
