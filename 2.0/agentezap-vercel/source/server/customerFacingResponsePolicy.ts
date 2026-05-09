import { repairMojibakeText } from "@shared/mojibake";

const INTERNAL_PLACEHOLDER_PREFIXES = [
  "ENVIAR_FOTOS:",
  "MEDIA:",
  "AGENDAR:",
  "CANCELAR:",
  "PEDIDO_DELIVERY:",
];

const INTERNAL_HEADER_MARKERS = [
  "calibracao",
  "prioridade maxima",
  "regras:",
  "mensagem_atual",
  "resposta_do_agente",
  "historico_recente",
  "produtos_com_foto",
  "formato de apresentacao",
  "catalogo de produtos/servicos",
];

const INTERNAL_HEADER_WITH_PAYLOAD_MARKERS = [
  "mensagem_atual:",
  "resposta_do_agente:",
  "historico_recente:",
  "produtos_com_foto:",
];

const INTERNAL_NUMBERED_MARKERS = [
  "a ia deve",
  "pergunta atual",
  "mensagem atual",
  "catalogo ativo",
  "responda no_image",
  "nunca invente",
  "se o cliente mudar de assunto",
  "quando a pergunta atual for",
  "depois que o cliente escolhe",
];

const OPERATIONAL_MEDIA_MARKERS = [
  "pix",
  "qr code",
  "qrcode",
  "endereco",
  "localizacao",
  "mapa",
  "como chegar",
  "onde fica",
  "fachada",
  "foto da loja",
];

function normalizePolicyText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function removeInternalPlaceholders(text: string): string {
  let cleaned = text;
  let cursor = 0;

  while (true) {
    const startIndex = cleaned.indexOf("[", cursor);
    if (startIndex === -1) {
      break;
    }

    const endIndex = cleaned.indexOf("]", startIndex + 1);
    if (endIndex === -1) {
      break;
    }

    const content = cleaned.slice(startIndex + 1, endIndex).trim().toUpperCase();
    const shouldStrip = INTERNAL_PLACEHOLDER_PREFIXES.some((prefix) => content.startsWith(prefix));
    if (!shouldStrip) {
      cursor = endIndex + 1;
      continue;
    }

    cleaned = `${cleaned.slice(0, startIndex)}${cleaned.slice(endIndex + 1)}`;
    cursor = startIndex;
  }

  return cleaned;
}

function startsWithNumberedItem(line: string): boolean {
  const trimmed = String(line || "").trimStart();
  if (!trimmed) {
    return false;
  }

  let index = 0;
  while (index < trimmed.length && trimmed[index] >= "0" && trimmed[index] <= "9") {
    index += 1;
  }

  if (index === 0 || index >= trimmed.length) {
    return false;
  }

  const separator = trimmed[index];
  return separator === "." || separator === ")";
}

function isInternalPromptLeakLine(line: string): boolean {
  const normalized = normalizePolicyText(line);
  if (!normalized) {
    return false;
  }

  if (INTERNAL_HEADER_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  if (!startsWithNumberedItem(line)) {
    return false;
  }

  return INTERNAL_NUMBERED_MARKERS.some((marker) => normalized.includes(marker));
}

export function isExplicitOperationalMediaRequest(source: string | null | undefined): boolean {
  const normalized = normalizePolicyText(source);
  if (!normalized) {
    return false;
  }

  return OPERATIONAL_MEDIA_MARKERS.some((marker) => normalized.includes(marker));
}

export function sanitizeCustomerFacingResponseText(source: string | null | undefined): string | null {
  if (!source) {
    return null;
  }

  let cleaned = repairMojibakeText(String(source || ""));
  cleaned = removeInternalPlaceholders(cleaned);

  const keptLines: string[] = [];
  let skipNextPayloadLine = false;

  for (const rawLine of cleaned.split("\n")) {
    const line = rawLine.trimEnd();
    const normalizedLine = normalizePolicyText(line);

    if (skipNextPayloadLine) {
      skipNextPayloadLine = false;
      if (normalizedLine) {
        continue;
      }
    }

    if (INTERNAL_HEADER_WITH_PAYLOAD_MARKERS.includes(normalizedLine)) {
      skipNextPayloadLine = true;
      continue;
    }

    if (isInternalPromptLeakLine(line)) {
      continue;
    }

    keptLines.push(line);
  }

  cleaned = keptLines.join("\n");
  cleaned = repairMojibakeText(cleaned)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return cleaned || null;
}
