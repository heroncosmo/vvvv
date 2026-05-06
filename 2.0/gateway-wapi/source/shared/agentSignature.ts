const GENERIC_SIGNATURE_NAMES = new Set([
  "agente",
  "agente ia",
  "agente virtual",
  "assistente",
  "assistente ia",
  "assistente virtual",
  "atendente",
  "atendente ia",
  "atendente virtual",
  "chatbot",
  "equipe",
  "ia",
  "inteligencia artificial",
  "robo",
  "suporte",
  "time",
  "vendedor",
  "vendedora",
]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripPromptFormatting(value: string): string {
  return collapseWhitespace(
    value
      .replace(/[*_`~]/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCandidate(value: string): string {
  return stripPromptFormatting(value).toLowerCase();
}

export function normalizeAgentSignatureName(value?: string | null): string | null {
  const trimmed = collapseWhitespace(String(value || ""));
  return trimmed || null;
}

function isGenericAgentSignatureName(value?: string | null): boolean {
  const normalized = normalizeCandidate(String(value || ""));
  return !normalized || GENERIC_SIGNATURE_NAMES.has(normalized);
}

export function detectAgentSignatureNameFromPrompt(prompt?: string | null): string | null {
  const source = stripPromptFormatting(String(prompt || ""));
  if (!source) return null;

  const patterns = [
    /\bvoce e (?:o |a |um |uma )?([^,.;:\n]+?)(?:,\s*[^.;:\n]+?)?\s+da\b/i,
    /\bsou (?:o |a )?([^,.;:\n]+?)(?:,\s*[^.;:\n]+?)?\s+da\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = normalizeAgentSignatureName(match?.[1] || "");
    if (candidate && !isGenericAgentSignatureName(candidate)) {
      return toTitleCase(candidate);
    }
  }

  return null;
}

export function resolveAgentSignatureName(options: {
  configuredSignature?: string | null;
  prompt?: string | null;
}): string | null {
  const configured = normalizeAgentSignatureName(options.configuredSignature);
  if (configured) {
    return configured;
  }

  return detectAgentSignatureNameFromPrompt(options.prompt);
}

export function formatWhatsappSignaturePrefix(name: string): string {
  return `*${name}:*`;
}

function normalizeSignatureLineForComparison(value: string): string {
  return value.replace(/[*\s]/g, "").trim().toLowerCase();
}

function stripStandaloneSignatureArtifacts(body: string, name: string): string {
  const expected = `${String(name || "").trim()}:`;
  const expectedNormalized = normalizeSignatureLineForComparison(expected);
  if (!expectedNormalized) {
    return body;
  }

  const normalizedLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  while (normalizedLines.length > 0) {
    const firstLine = normalizedLines[0];
    if (normalizeSignatureLineForComparison(firstLine) !== expectedNormalized) {
      break;
    }
    normalizedLines.shift();
  }

  while (normalizedLines.length > 0) {
    const lastLine = normalizedLines[normalizedLines.length - 1];
    if (normalizeSignatureLineForComparison(lastLine) !== expectedNormalized) {
      break;
    }
    normalizedLines.pop();
  }

  return normalizedLines.join("\n").trim();
}

function stripTrailingSignatureSuffix(body: string, name: string): string {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return body;
  }

  const suffixes = [
    formatWhatsappSignaturePrefix(trimmedName),
    `${trimmedName}:*`,
    `${trimmedName}:`,
  ];

  let nextBody = body.trim();
  let changed = true;
  while (changed && nextBody) {
    changed = false;
    for (const suffix of suffixes) {
      if (!suffix) continue;
      if (!nextBody.endsWith(suffix)) continue;

      nextBody = nextBody.slice(0, -suffix.length).trimEnd();
      changed = true;
    }
  }

  return nextBody;
}

export function prependWhatsappSignature(text: string, name?: string | null): string {
  const originalBody = String(text || "").trim();
  if (!originalBody) return originalBody;

  const resolvedName = normalizeAgentSignatureName(name);
  if (!resolvedName) {
    return originalBody;
  }

  let body = stripStandaloneSignatureArtifacts(originalBody, resolvedName);
  body = stripTrailingSignatureSuffix(body, resolvedName);
  if (!body) return body;

  const prefix = formatWhatsappSignaturePrefix(resolvedName);
  if (body === prefix || body.startsWith(`${prefix}\n`) || body.startsWith(`${prefix}\r\n`)) {
    return body;
  }

  return `${prefix}\n${body}`;
}

function consumeLeadingSignature(body: string, prefix: string): string | null {
  if (!body.startsWith(prefix)) {
    return null;
  }

  let cursor = prefix.length;
  while (cursor < body.length) {
    const current = body[cursor];
    if (current === " " || current === "\t" || current === "\n" || current === "\r") {
      cursor += 1;
      continue;
    }
    break;
  }

  return body.slice(cursor).trimStart();
}

function detectGenericWhatsappSignaturePrefix(body: string): string | null {
  const firstLineBreak = body.indexOf("\n");
  const firstLine = (firstLineBreak >= 0 ? body.slice(0, firstLineBreak) : body).trim();

  if (!firstLine.startsWith("*") || !firstLine.endsWith("*")) {
    return null;
  }

  const inner = firstLine.slice(1, -1).trim();
  if (!inner.endsWith(":") || inner.length < 2 || inner.length > 80) {
    return null;
  }

  return firstLine;
}

export function stripWhatsappSignatureForSpeech(text: string, name?: string | null): string {
  const originalBody = String(text || "").trim();
  if (!originalBody) {
    return originalBody;
  }

  const resolvedName = normalizeAgentSignatureName(name);
  const body = resolvedName
    ? stripTrailingSignatureSuffix(
        stripStandaloneSignatureArtifacts(originalBody, resolvedName),
        resolvedName,
      )
    : originalBody;
  const candidatePrefixes: string[] = [];

  if (resolvedName) {
    candidatePrefixes.push(formatWhatsappSignaturePrefix(resolvedName));
    candidatePrefixes.push(`${resolvedName}:`);
  }

  const genericWhatsappPrefix = detectGenericWhatsappSignaturePrefix(body);
  if (genericWhatsappPrefix) {
    candidatePrefixes.push(genericWhatsappPrefix);
  }

  for (const prefix of candidatePrefixes) {
    const stripped = consumeLeadingSignature(body, prefix);
    if (stripped !== null) {
      return stripped;
    }
  }

  return body;
}
