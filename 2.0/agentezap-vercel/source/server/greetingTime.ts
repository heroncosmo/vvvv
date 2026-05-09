export type BrazilGreeting = "Bom dia" | "Boa tarde" | "Boa noite";

const TIME_BASED_GREETINGS: BrazilGreeting[] = ["Bom dia", "Boa tarde", "Boa noite"];
const OPENING_GREETING_PLACEHOLDER = "{{saudacao_horario}}";
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_UTC_OFFSET_MINUTES = -3 * 60;

export interface BrazilTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getBrazilTimeParts(now: Date = new Date()): BrazilTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year") || "0"),
    month: Number(byType.get("month") || "0"),
    day: Number(byType.get("day") || "0"),
    hour: Number(byType.get("hour") || "0"),
    minute: Number(byType.get("minute") || "0"),
    second: Number(byType.get("second") || "0"),
  };
}

export function getBrazilTimeDate(now: Date = new Date()): Date {
  const parts = getBrazilTimeParts(now);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
}

function getBrazilTimeDateByUtcOffset(now: Date = new Date()): Date {
  const localOffsetMinutes = now.getTimezoneOffset();
  const offsetDeltaMinutes = localOffsetMinutes + BRAZIL_UTC_OFFSET_MINUTES;
  return new Date(now.getTime() + offsetDeltaMinutes * 60 * 1000);
}

function getReliableBrazilGreetingHour(now: Date = new Date()): number {
  const intlHour = getBrazilTimeDate(now).getHours();
  const fallbackHour = getBrazilTimeDateByUtcOffset(now).getHours();

  if (Math.abs(intlHour - fallbackHour) <= 1) {
    return intlHour;
  }

  return fallbackHour;
}

export function getBrazilGreetingForHour(hour: number): BrazilGreeting {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function getBrazilGreeting(now: Date = new Date()): BrazilGreeting {
  return getBrazilGreetingForHour(getReliableBrazilGreetingHour(now));
}

export function buildBrazilGreetingPromptInstruction(now: Date = new Date()): string {
  const brazilHour = getReliableBrazilGreetingHour(now);
  const currentGreeting = getBrazilGreetingForHour(brazilHour);

  return [
    "REGRA GLOBAL DE SAUDACAO PELO HORARIO DE BRASILIA:",
    `Horario atual oficial de Brasilia para esta resposta: ${String(brazilHour).padStart(2, "0")}:00.`,
    `Se voce escolher usar saudacao na primeira resposta util da conversa, a saudacao correta neste momento e: "${currentGreeting}".`,
    "Nunca copie automaticamente a saudacao escrita pelo cliente quando ela estiver errada para o horario atual.",
    'Exemplo: se forem 11:32 em Brasilia e o cliente escrever "boa tarde", responda com "Bom dia".',
    "Faixas oficiais de saudacao:",
    "- 05:00 ate 11:59 -> Bom dia",
    "- 12:00 ate 17:59 -> Boa tarde",
    "- 18:00 ate 04:59 -> Boa noite",
    "Depois da primeira resposta util, nao repita saudacao sem necessidade.",
  ].join("\n");
}

export function getBrazilOpeningGreetingForHour(hour: number): string {
  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  if (hour >= 18 && hour < 24) return "Boa noite";
  return "Olá, tudo bem?";
}

function replaceLiteralToken(source: string, token: string, replacement: string): string {
  if (!source || !token) {
    return source;
  }

  return source.split(token).join(replacement);
}

function isWhitespaceCharacter(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isGreetingBoundaryCharacter(char: string): boolean {
  return (
    isWhitespaceCharacter(char) ||
    char === "!" ||
    char === "," ||
    char === "." ||
    char === "?" ||
    char === ";" ||
    char === ":" ||
    char === "(" ||
    char === ")" ||
    char === "-" ||
    char === "—"
  );
}

function trimLeadingWhitespace(source: string): { leadingWhitespace: string; trimmedSource: string } {
  let leadingWhitespaceLength = 0;

  while (
    leadingWhitespaceLength < source.length &&
    isWhitespaceCharacter(source[leadingWhitespaceLength])
  ) {
    leadingWhitespaceLength += 1;
  }

  return {
    leadingWhitespace: source.slice(0, leadingWhitespaceLength),
    trimmedSource: source.slice(leadingWhitespaceLength),
  };
}

function splitLeadingInlineMarkup(source: string): { openingMarkup: string; content: string } {
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char !== "*" && char !== "_") {
      break;
    }
    index += 1;
  }

  return {
    openingMarkup: source.slice(0, index),
    content: source.slice(index),
  };
}

function getTimedOpeningGreetingForHour(hour: number): string {
  return getBrazilGreetingForHour(hour);
}

function startsWithGreeting(text: string, greeting: string): boolean {
  const source = String(text || "");
  if (!source.trim()) {
    return false;
  }

  const { trimmedSource } = trimLeadingWhitespace(source);
  const { content } = splitLeadingInlineMarkup(trimmedSource);
  const loweredSource = content.toLocaleLowerCase("pt-BR");
  const loweredGreeting = greeting.toLocaleLowerCase("pt-BR");

  if (!loweredSource.startsWith(loweredGreeting)) {
    return false;
  }

  const boundaryCharacter = content[loweredGreeting.length];
  return (
    boundaryCharacter === undefined ||
    isGreetingBoundaryCharacter(boundaryCharacter)
  );
}

function replaceLeadingGreetingByHour(text: string, hour: number): string {
  const source = String(text || "");
  if (!source.trim()) {
    return source;
  }

  const currentGreeting = getTimedOpeningGreetingForHour(hour);
  const { leadingWhitespace, trimmedSource } = trimLeadingWhitespace(source);
  const { openingMarkup, content } = splitLeadingInlineMarkup(trimmedSource);
  const loweredSource = content.toLocaleLowerCase("pt-BR");
  const candidateGreetings = ["Bom dia", "Boa tarde", "Boa noite", "Olá", "Ola", "Oi"];

  for (const greeting of candidateGreetings) {
    const loweredGreeting = greeting.toLocaleLowerCase("pt-BR");
    if (!loweredSource.startsWith(loweredGreeting)) {
      continue;
    }

    const boundaryCharacter = content[loweredGreeting.length];
    if (
      boundaryCharacter !== undefined &&
      !isGreetingBoundaryCharacter(boundaryCharacter)
    ) {
      continue;
    }

    return `${leadingWhitespace}${openingMarkup}${currentGreeting}${content.slice(loweredGreeting.length)}`;
  }

  return source;
}

export function normalizeConfiguredGreetingByHour(text: string, hour: number): string {
  const source = String(text || "");
  if (!source.trim()) {
    return source;
  }

  const currentGreeting = getBrazilGreetingForHour(hour);
  const { leadingWhitespace, trimmedSource } = trimLeadingWhitespace(source);
  const loweredSource = trimmedSource.toLocaleLowerCase("pt-BR");

  for (const greeting of TIME_BASED_GREETINGS) {
    const loweredGreeting = greeting.toLocaleLowerCase("pt-BR");
    if (!loweredSource.startsWith(loweredGreeting)) {
      continue;
    }

    const boundaryCharacter = trimmedSource[loweredGreeting.length];
    if (
      boundaryCharacter !== undefined &&
      !isGreetingBoundaryCharacter(boundaryCharacter)
    ) {
      continue;
    }

    return `${leadingWhitespace}${currentGreeting}${trimmedSource.slice(loweredGreeting.length)}`;
  }

  return source;
}

export function normalizeConfiguredGreetingForBrazilTime(text: string, now: Date = new Date()): string {
  const brazilHour = getReliableBrazilGreetingHour(now);
  const withDynamicOpeningGreeting = replaceLiteralToken(
    String(text || ""),
    OPENING_GREETING_PLACEHOLDER,
    getBrazilOpeningGreetingForHour(brazilHour),
  );

  return normalizeConfiguredGreetingByHour(withDynamicOpeningGreeting, brazilHour);
}

export function ensureOpeningGreetingForBrazilTime(text?: string | null, now: Date = new Date()): string {
  const brazilHour = getReliableBrazilGreetingHour(now);
  const timedGreeting = `${getTimedOpeningGreetingForHour(brazilHour)}!`;
  const source = String(text || "");

  if (!source.trim()) {
    return timedGreeting;
  }

  const sourceWithDynamicGreeting = replaceLiteralToken(
    source,
    OPENING_GREETING_PLACEHOLDER,
    getTimedOpeningGreetingForHour(brazilHour),
  );
  const normalized = replaceLeadingGreetingByHour(sourceWithDynamicGreeting, brazilHour);

  if (startsWithGreeting(sourceWithDynamicGreeting, getTimedOpeningGreetingForHour(brazilHour))) {
    return sourceWithDynamicGreeting;
  }

  if (normalized !== sourceWithDynamicGreeting) {
    return normalized;
  }

  const { leadingWhitespace, trimmedSource } = trimLeadingWhitespace(source);
  return `${leadingWhitespace}${timedGreeting} ${trimmedSource}`.trimEnd();
}
