import { repairMojibakeText } from "@shared/mojibake";

const INTERNAL_PLACEHOLDER_PREFIXES = [
  "ENVIAR_FOTOS:",
  "MEDIA:",
  "AGENDAR:",
  "CANCELAR:",
  "PEDIDO_DELIVERY:",
];

const INTERNAL_HEADER_MARKERS = [
  "aqui vai a resposta",
  "aqui vai o json de atencao",
  "calibracao",
  "prioridade maxima",
  "### atencao",
  "regras:",
  "regras a serem obedecidas nesta resposta",
  "mensagem_atual",
  "resposta_do_agente",
  "resposta atual",
  "resposta ao pedido concreto",
  "historico_recente",
  "produtos_com_foto",
  "formato de apresentacao",
  "catalogo de produtos/servicos",
  "atendimento via ia finalizado",
  "regra suprema",
  "primeira resposta e idioma",
  "esta regra tem prioridade",
  "funil antigo",
  "funil normal agentezap",
  "reset de escopo",
  "identidade visivel",
  "midia adicional",
  "se aplicavel, use a tag",
  "opcoes para resposta do cliente",
  "resposta para o cliente",
  "formatada de acordo com as regras fornecidas",
  "resposta do assistente",
  "se o cliente escolher",
  "exemplo de resposta",
  "observacao interna",
  "observacoes para o atendente",
  "to do atendente humano",
  "nao enviar ao cliente",
  "fim do registro",
  "novo atendimento",
  "\"tools\"",
  "tools:",
  "etapa atual",
  "dados anteriores",
  "aguardar resposta do cliente",
  "aguardar resposta da empresa",
  "minha resposta baseada na sua opcao",
  "exemplo de como prosseguira baseado",
  "baseado na resposta do cliente",
  "proxima acao esperada do cliente",
  "proxima acao do agente",
  "para atender as regras de qualificacao inicial",
  "acao corretiva",
  "attention_json",
  "actions_json",
  "routing_json",
  "assistant_response",
  "atencao_json",
  "atencao_humana_json",
  "human_attention_json",
  "needshumanattention",
  "prioridade do contexto atual",
  "fim da prioridade do contexto atual",
  "prompt/config atual",
  "fonte autorizada",
  "mensagens antigas do assistente",
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
  "entender necessidade",
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

const GENERIC_MEDIA_REQUEST_TERMS = [
  "video",
  "videos",
  "audio",
  "audios",
  "imagem",
  "imagens",
  "foto",
  "fotos",
  "arquivo",
  "pdf",
  "documento",
  "anexo",
  "midia",
  "catalogo",
  "catologo",
  "material",
];

const INTERNAL_TAIL_BLOCK_MARKERS = [
  "observacoes para o atendente",
  "to do atendente humano",
  "observacao interna",
  "nao enviar ao cliente",
  "fim do registro",
  "novo atendimento",
  "\"tools\"",
  "tools:",
  "opcoes para resposta do cliente",
  "resposta do assistente",
  "regras a serem obedecidas nesta resposta",
  "minha resposta baseada na sua opcao",
  "exemplo de como prosseguira baseado",
  "baseado na resposta do cliente",
  "proxima acao esperada do cliente",
  "proxima acao do agente",
  "resposta ao pedido concreto",
  "para atender as regras de qualificacao inicial",
  "acao corretiva",
  "attention_json",
  "actions_json",
  "routing_json",
  "assistant_response",
  "atencao_json",
  "atencao_humana_json",
  "human_attention_json",
  "needshumanattention",
  "prioridade do contexto atual",
  "fim da prioridade do contexto atual",
  "prompt/config atual",
  "fonte autorizada",
  "aguarde a resposta do cliente",
];

const INTERNAL_AUDIT_LINE_MARKERS = [
  "adesao as regras",
  "anti-alucinacao",
  "escopo fechado",
  "estilo de resposta",
  "formato e estilo",
  "resultado da conversa",
  "acao futura",
  "pergunta necessaria",
  "proximo passo",
  "observacao:",
  "observacao",
  "mantem o tom",
  "resposta atual",
  "resposta ao pedido concreto",
  "baseado na resposta do cliente",
  "para atender as regras de qualificacao inicial",
  "proxima acao esperada do cliente",
  "proxima acao do agente",
  "acao corretiva",
  "regras a serem obedecidas nesta resposta",
  "nao repetir a apresentacao",
  "sim oferecer opcoes claras",
  "aplicou a oferta",
  "enviou os precos",
  "resposta atendeu",
];

function normalizePolicyText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasGenericMediaRequestTerm(normalized: string): boolean {
  return GENERIC_MEDIA_REQUEST_TERMS.some((term) => normalized.includes(term));
}

function hasExplicitGenericMediaRequest(normalized: string): boolean {
  if (!hasGenericMediaRequestTerm(normalized)) {
    return false;
  }

  const mediaTermPattern =
    "(?:video|videos|audio|audios|imagem|imagens|foto|fotos|arquivo|pdf|documento|anexo|midia|catalogo|catologo|material)";

  const requestBeforeMedia = new RegExp(
    `\\b(?:me\\s+)?(?:manda|mande|mandar|envia|envie|enviar|passa|passe|passar|mostra|mostre|mostrar|ver|vejo|quero|queria|gostaria|preciso)\\b.{0,80}\\b${mediaTermPattern}\\b`,
  );
  if (requestBeforeMedia.test(normalized)) {
    return true;
  }

  const availabilityBeforeMedia = new RegExp(
    `\\b(?:tem|temos|possui|existe|consegue|conseguem|pode|poderia)\\b.{0,80}\\b${mediaTermPattern}\\b`,
  );
  if (availabilityBeforeMedia.test(normalized)) {
    return true;
  }

  const mediaBeforeObject = new RegExp(
    `\\b${mediaTermPattern}\\b.{0,80}\\b(?:produto|produtos|item|itens|modelo|modelos|peca|pecas|servico|servicos|cardapio|catalogo|catologo|material|antes\\s+e\\s+depois)\\b`,
  );
  if (mediaBeforeObject.test(normalized)) {
    return true;
  }

  return new RegExp(`\\b${mediaTermPattern}\\b\\s*\\?$`).test(normalized);
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

function dropInternalTotalFormula(text: string): string {
  const trimmed = String(text || "").trim();
  if (!/^\*?\s*total\s+final\b/i.test(trimmed) || !normalizePolicyText(trimmed).includes("internamente")) {
    return text;
  }

  return "";
}

function stripCustomerFacingLeakLines(text: string): string {
  const keptLines: string[] = [];
  let droppingAdjustmentLeakBlock = false;

  for (const rawLine of String(text || "").split("\n")) {
    const foldedLine = normalizePolicyText(rawLine);
    if (/a\s+resposta\s+ja\s+esta\s+ajustad.*regras?/.test(foldedLine)) {
      droppingAdjustmentLeakBlock = true;
      continue;
    }
    if (/^ajustad[ao]?\s+para\s+o\s+formato\s+correto/.test(foldedLine)) {
      continue;
    }
    if (
      droppingAdjustmentLeakBlock &&
      (!foldedLine || /^---+$/.test(foldedLine) || /^>$/.test(foldedLine) || /<\/?a\b|www\./i.test(rawLine))
    ) {
      continue;
    }

    droppingAdjustmentLeakBlock = false;
    keptLines.push(rawLine);
  }

  return keptLines.join("\n");
}

function stripInternalWrapperPrefixes(text: string): string {
  let cleaned = String(text || "");
  const beforeWrapper = cleaned;
  cleaned = cleaned
    .replace(/^\s*formatad[ao]?\s+de\s+acordo\s+com\s+as\s+regras[^\n:]*:\s*/iu, "")
    .replace(/^\s*>\s*/gmu, "")
    .replace(
      /^\s*\*{0,3}\s*(?:resposta(?!\s+atual\b)(?:\s+(?:final|(?:para|ao)\s+(?:o\s+)?cliente))?|mensagem\s+(?:para|ao)\s+(?:o\s+)?cliente)\s*\*{0,3}\s*:?\s*/iu,
      "",
    );
  if (cleaned !== beforeWrapper) {
    cleaned = cleaned.replace(/^\s*\*([^*\n]{1,160})\*\s*/u, "$1 ");
  }
  return cleaned;
}

function stripCurrentContextPriorityBlocks(text: string): string {
  const keptLines: string[] = [];
  let droppingCurrentContextBlock = false;

  for (const rawLine of String(text || "").split("\n")) {
    const foldedLine = normalizePolicyText(rawLine);
    if (droppingCurrentContextBlock && foldedLine.includes("fim da prioridade do contexto atual")) {
      droppingCurrentContextBlock = false;
      continue;
    }

    if (foldedLine.includes("prioridade do contexto atual")) {
      droppingCurrentContextBlock = true;
      continue;
    }

    if (droppingCurrentContextBlock) {
      continue;
    }

    keptLines.push(rawLine);
  }

  return keptLines.join("\n");
}

function findInternalTailBlockStartIndex(line: string): number {
  const normalizedLine = normalizePolicyText(line);
  if (!normalizedLine) {
    return -1;
  }

  let matchIndex = -1;
  for (const marker of INTERNAL_TAIL_BLOCK_MARKERS) {
    const index = normalizedLine.indexOf(marker);
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
    }
  }

  if (matchIndex >= 0) {
    return Math.min(matchIndex, line.length);
  }

  return -1;
}

function isInternalWrapperOnlyPrefix(line: string): boolean {
  const compact = normalizePolicyText(line).replace(/[\s[\]#*_:;,.|(){}-]+/g, "");
  if (!compact) {
    return true;
  }

  return [
    "final",
    "saidafinal",
    "resposta",
    "respostafinal",
    "respostaparaocliente",
  ].includes(compact);
}

function stripInternalTailBlocks(text: string): string {
  const keptLines: string[] = [];

  for (const rawLine of String(text || "").split("\n")) {
    const cutIndex = findInternalTailBlockStartIndex(rawLine);
    if (cutIndex >= 0) {
      const publicPrefix = rawLine
        .slice(0, cutIndex)
        .replace(/[<#*_\s:;,.|(){}-]+$/g, "")
        .trimEnd();
      if (publicPrefix && !isInternalWrapperOnlyPrefix(publicPrefix)) {
        keptLines.push(publicPrefix);
      }
      break;
    }

    keptLines.push(rawLine);
  }

  return keptLines.join("\n");
}

function stripInlineInternalPromptLeaks(text: string): string {
  return String(text || "")
    .replace(
      /\b(?:rodrigo\s+da\s+|o\s+)?primeira\s+resposta\s+e\s+idioma\s+esta\s+regra\s+tem\s+prioridade\s+sobre\s+(?:to(?:do)?|tudo|todo\s+o\s+resto|o\s+resto)(?:\s+aqui)?\.?/giu,
      "",
    )
    .replace(
      /\bregra\s+suprema\s+da\s+primeira\s+resposta\s+e\s+idioma\b[^\n.?!]*[.?!]?/giu,
      "",
    )
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n");
}

function extractQuotedCustomerReplyFromInternalEnvelope(text: string): string | null {
  const matches = Array.from(String(text || "").matchAll(
    /(?:^|\n)\s*\*{0,3}\s*resposta(?:\s+final)?[^"'\n]{0,80}(?:\n|\r|\s)*["']([^"'\n][\s\S]{15,700}?)["']/giu,
  ));
  for (const match of matches) {
    const candidate = repairMojibakeText(String(match[1] || ""))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const folded = normalizePolicyText(candidate);
    if (
      candidate &&
      !folded.includes("regras") &&
      !folded.includes("prompt") &&
      !folded.includes("checklist") &&
      !folded.includes("observacao") &&
      !folded.includes("resposta final")
    ) {
      return candidate;
    }
  }
  return null;
}

function stripPlainTextMarkdownFormatting(text: string): string {
  return String(text || "")
    .replace(/(^|\n)\s*>\s*/g, "$1")
    .replace(/\*{1,3}([^*\n]{1,280})\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_\n]{1,280})_{1,3}/g, "$1")
    .replace(/(?:^|\n)\s*[-*]\s+/g, "\n")
    .replace(/(?:^|\n)\s*\d{1,3}[.)]\s+/g, "\n")
    .replace(/([:;])\s*\d{1,3}[.)]\s+/g, "$1 ")
    .replace(/\s+\d{1,3}[.)]\s+/g, "; ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type CustomerFacingResponsePolicyOptions = {
  referenceText?: string | null;
  plainText?: boolean;
};

export function customerFacingPromptRequestsPlainText(source: string | null | undefined): boolean {
  const folded = normalizePolicyText(source);
  if (!folded) {
    return false;
  }
  return (
    folded.includes("texto comum") ||
    folded.includes("texto puro") ||
    folded.includes("plain text") ||
    /\bsem\s+(?:markdown|asterisco|asteriscos|negrito|listas?|tabela|formatacao)\b/.test(folded)
  );
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

  const normalizedWithoutListPrefix = normalized
    .replace(/^[-*•\s]+/, "")
    .replace(/^\d{1,3}[.)]\s+/, "");

  if (INTERNAL_HEADER_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  if (
    (normalized.startsWith("###") || normalized.startsWith("*") || normalized.startsWith("-") || normalized.startsWith("•")) &&
    INTERNAL_AUDIT_LINE_MARKERS.some((marker) => normalizedWithoutListPrefix.includes(marker))
  ) {
    return true;
  }

  if (
    normalizedWithoutListPrefix.startsWith("lembre-se:") &&
    (normalizedWithoutListPrefix.includes("regras") || normalizedWithoutListPrefix.includes("opcao escolhida"))
  ) {
    return true;
  }

  if (normalizedWithoutListPrefix.startsWith("{") || normalizedWithoutListPrefix.startsWith("\"tools\"")) {
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

  return (
    OPERATIONAL_MEDIA_MARKERS.some((marker) => normalized.includes(marker)) ||
    hasExplicitGenericMediaRequest(normalized)
  );
}

function stripUnexpectedCjkFromCustomerFacingText(source: string): string {
  return String(source || "")
    .split("\u652f\u6301").join("suporta")
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/g, " ");
}

export function sanitizeCustomerFacingResponseText(
  source: string | null | undefined,
  options: CustomerFacingResponsePolicyOptions = {},
): string | null {
  if (!source) {
    return null;
  }

  let cleaned = stripUnexpectedCjkFromCustomerFacingText(repairMojibakeText(String(source || "")));
  cleaned = stripCurrentContextPriorityBlocks(cleaned);
  cleaned = dropInternalTotalFormula(cleaned);
  cleaned = stripInlineInternalPromptLeaks(cleaned);
  cleaned = stripInternalWrapperPrefixes(cleaned);
  const quotedCustomerReply = extractQuotedCustomerReplyFromInternalEnvelope(cleaned);
  if (quotedCustomerReply) {
    cleaned = quotedCustomerReply;
  }
  const foldedInitialText = normalizePolicyText(cleaned);
  if (
    foldedInitialText.includes("atendimento via ia finalizado") ||
    foldedInitialText.includes("midia adicional") ||
    /se\s+aplicavel.{0,80}use\s+a\s+tag/.test(foldedInitialText) ||
    /opcoes\s+para\s+resposta\s+do\s+cliente/.test(foldedInitialText) ||
    /resposta\s+do\s+assistente/.test(foldedInitialText) ||
    /se\s+o\s+cliente\s+escolher/.test(foldedInitialText)
  ) {
    cleaned = cleaned.replace(
      /(?:^|\n)\s*(?:aguarde\s+a\s+resposta\s+do\s+atendente\s+humano|se\s+precisar\s+de\s+algo,\s*basta\s+perguntar)[\s\S]*$/iu,
      "\n",
    );
    cleaned = cleaned.replace(/(?:^|\n)\s*se\s+precisar\s+de\s+ajuda\s+para\s+chegar[\s\S]*$/iu, "\n");
  }
  cleaned = stripInternalTailBlocks(cleaned);
  cleaned = cleaned
    .replace(/<audio\b[\s\S]*?<\/audio>/giu, "")
    .replace(/<video\b[\s\S]*?<\/video>/giu, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/giu, "")
    .replace(/<source\b[^>]*>/giu, "")
    .replace(/<img\b[^>]*>/giu, "")
    .replace(/<[^>\n]+>/g, "");
  cleaned = cleaned
    .replace(/(?:^|\n)\s*```[a-z0-9_-]*\s*(?=\n)/giu, "\n")
    .replace(/(?:^|\n)\s*```\s*(?=\n|$)/giu, "\n");
  cleaned = removeInternalPlaceholders(cleaned);
  cleaned = cleaned
    .replace(/(?:^|\n)\s*\*{0,2}\s*final\s+com\s+base\s+nas\s+regras\s+citadas\s*\*{0,2}\s*:?\s*/giu, "\n")
    .replace(/\n\s*\*ASSISTENTE\s+VIRTUAL[^\n:]{0,120}:\*\s*/giu, "\n");

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
  cleaned = stripUnexpectedCjkFromCustomerFacingText(repairMojibakeText(cleaned))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  cleaned = stripCustomerFacingLeakLines(cleaned);
  if (options.plainText === true || customerFacingPromptRequestsPlainText(options.referenceText)) {
    cleaned = stripPlainTextMarkdownFormatting(cleaned);
  }
  cleaned = stripUnexpectedCjkFromCustomerFacingText(repairMojibakeText(cleaned))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return cleaned || null;
}
