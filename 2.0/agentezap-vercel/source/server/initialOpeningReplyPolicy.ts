const SIMPLE_GREETING_TEXTS = new Set([
  "olá",
  "ola",
  "bom dia",
  "boa tarde",
  "boa noite",
  "ei",
  "e ai",
  "eai",
  "fala",
  "tudo bem",
  "td bem",
  "blz",
  "beleza",
  "hey",
  "hello",
  "hi",
]);

function isWhitespaceCharacter(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isTrailingGreetingPunctuation(char: string): boolean {
  return (
    char === "!" ||
    char === "?" ||
    char === "." ||
    char === "," ||
    char === ";" ||
    char === ":" ||
    char === ")" ||
    char === "("
  );
}

function normalizeGreetingText(text?: string | null): string {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }

  let end = source.length;
  while (end > 0) {
    const current = source[end - 1];
    if (isTrailingGreetingPunctuation(current) || isWhitespaceCharacter(current)) {
      end -= 1;
      continue;
    }
    break;
  }

  const cleaned = source.slice(0, end);
  const words: string[] = [];
  let currentWord = "";

  for (const char of cleaned) {
    if (isWhitespaceCharacter(char)) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = "";
      }
      continue;
    }

    currentWord += char;
  }

  if (currentWord) {
    words.push(currentWord);
  }

  return words.join(" ").toLocaleLowerCase("pt-BR");
}

function isFlexibleOiGreeting(normalizedText: string): boolean {
  if (!normalizedText || normalizedText.includes(" ")) {
    return false;
  }

  if (!normalizedText.startsWith("oi")) {
    return false;
  }

  for (const char of normalizedText) {
    if (char !== "o" && char !== "i" && char !== "e") {
      return false;
    }
  }

  return true;
}

export function isSimpleGreetingMessage(text?: string | null): boolean {
  const normalizedText = normalizeGreetingText(text);
  if (!normalizedText) {
    return false;
  }

  return SIMPLE_GREETING_TEXTS.has(normalizedText) || isFlexibleOiGreeting(normalizedText);
}

export function shouldReturnOpeningOnlyResponse(params: {
  openingRuleSource?: "greeting" | "off_hours" | null;
  customerMessage?: string | null;
}): boolean {
  if (params.openingRuleSource === "off_hours") {
    return true;
  }

  const message = normalizeGreetingText(params.customerMessage);
  if (!message) {
    return true;
  }

  if (params.openingRuleSource === "greeting") {
    return isSimpleGreetingMessage(message);
  }

  return isSimpleGreetingMessage(message);
}

export function shouldForceContextualOpeningResponse(customerMessage?: string | null): boolean {
  const message = String(customerMessage || "").trim();
  if (!message) {
    return false;
  }

  return !isSimpleGreetingMessage(message);
}

export function shouldReturnOnlyGreetingOpeningFlow(customerMessage?: string | null): boolean {
  return !shouldForceContextualOpeningResponse(customerMessage);
}

function getFirstMeaningfulOpeningLine(text: string): string {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }

  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      return trimmedLine;
    }
  }

  return source;
}

export function getOpeningTextForCustomerMessage(
  openingText: string,
  customerMessage?: string | null,
): string {
  const opening = String(openingText || "").trim();
  if (!opening) {
    return opening;
  }

  if (!shouldForceContextualOpeningResponse(customerMessage)) {
    return opening;
  }

  return getFirstMeaningfulOpeningLine(opening) || opening;
}

export function prependContextualOpeningInstruction(params: {
  customerMessage?: string | null;
  baseUserMessage?: string | null;
}): string {
  const baseUserMessage = String(params.baseUserMessage || "").trim();
  const customerMessage = String(params.customerMessage || "").trim();

  if (!shouldForceContextualOpeningResponse(customerMessage)) {
    return baseUserMessage;
  }

  const preservedMessage = baseUserMessage || customerMessage;

  return `[INSTRUCAO OPERACIONAL PRIORITARIA:
Esta e a primeira resposta da conversa e o cliente ja chegou com um pedido concreto.
Responda o que o cliente pediu NESTA MESMA mensagem.
Nao envie apenas saudacao.
Nao envie apenas qualificacao como pedir nome antes de ajudar.
Nao envie apenas a midia sem texto.
Se houver abertura obrigatoria, ela deve ser breve e vir acompanhada de resposta util ao pedido.
Se ainda precisar fazer alguma pergunta, faca isso somente depois de responder o pedido inicial.]

${preservedMessage}`;
}
