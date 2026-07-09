const humanizedCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(humanizedCache.entries());
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      humanizedCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

function generateHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return hash.toString(16);
}

export async function humanizeMessageWithAI(
  originalMessage: string,
  context?: {
    type?: "followup" | "bulk" | "response" | "group";
    recipientName?: string;
    previousVariations?: string[];
  },
): Promise<string> {
  const text = String(originalMessage || "");
  const cacheKey = generateHash(text + JSON.stringify(context || {}));
  const cached = humanizedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  humanizedCache.set(cacheKey, { result: text, timestamp: Date.now() });
  return text;
}

export async function humanizeMessagesBatch(
  messages: { text: string; recipientName?: string }[],
  context?: { type?: "followup" | "bulk" | "response" | "group" },
): Promise<string[]> {
  const results: string[] = [];

  for (const msg of messages) {
    results.push(
      await humanizeMessageWithAI(msg.text, {
        ...context,
        recipientName: msg.recipientName,
      }),
    );
  }

  return results;
}

export async function testHumanizer(): Promise<{
  success: boolean;
  original: string;
  humanized: string;
  error?: string;
}> {
  const testMessage =
    "Ola! Gostaria de saber se voce ainda tem interesse em nosso produto. Posso te ajudar com mais informacoes?";

  return {
    success: false,
    original: testMessage,
    humanized: testMessage,
    error: "Humanizador LLM desativado; fala publica deve vir do Codex ou do texto original do operador.",
  };
}

export function clearHumanizerCache(): void {
  humanizedCache.clear();
}

export function getHumanizerStats(): { cacheSize: number; cacheTTL: number } {
  return {
    cacheSize: humanizedCache.size,
    cacheTTL: CACHE_TTL_MS,
  };
}
