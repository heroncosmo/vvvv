export const ADMIN_WHATSAPP_REPLY_MAX_CHARS = 700;

function normalizeReplyWhitespace(text: string): string {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeComparisonText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampAdminReplyLength(
  text: string,
  maxChars: number = ADMIN_WHATSAPP_REPLY_MAX_CHARS,
): string {
  const normalized = normalizeReplyWhitespace(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const urls = normalized.match(/https?:\/\/[^\s"'()>]+/gi) || [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  let result = "";
  for (const paragraph of paragraphs) {
    const candidate = result ? `${result}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      result = candidate;
      continue;
    }
    break;
  }

  if (!result) {
    const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
    for (const sentence of sentences) {
      const candidate = result ? `${result} ${sentence.trim()}` : sentence.trim();
      if (candidate.length <= maxChars) {
        result = candidate;
        continue;
      }
      break;
    }
  }

  if (!result) {
    result = normalized.slice(0, maxChars);
  }

  const partialUrl = result.match(/https?:\/\/[^\s"'()>]*$/i)?.[0];
  if (partialUrl) {
    const fullUrl = urls.find((url) => url.startsWith(partialUrl));
    if (fullUrl && fullUrl !== partialUrl) {
      result = result.slice(0, result.length - partialUrl.length).trimEnd();
    }
  }

  if (result.length < normalized.length) {
    result = result.replace(/[,:;\-\s]+$/g, "").trimEnd();
    if (!/[.!?…]$/.test(result)) {
      result = `${result}...`;
    }
  }

  return result.trim();
}

export function buildAdminPanelPitch(panelUrl: string): string {
  return `Você também pode ajustar direto no sistema e conhecer CRM/Kanban, conversas, notificador inteligente, fluxos e a conexão do WhatsApp: ${panelUrl}`;
}

export function isPostTestSalesMessage(message: string): boolean {
  const normalized = normalizeComparisonText(message);
  if (!normalized) return false;

  const hasPositiveFeedback =
    /\b(testei|testei aqui|vi|vi sim|gostei|curti|funcionou|ficou bom|ficou legal|show|top|massa|aprovado|rodou|deu certo)\b/.test(
      normalized,
    );
  const asksImmediateEdit =
    /\b(editar|edita|alterar|ajustar|mudar|corrigir|mexer|arrumar|configurar)\b/.test(normalized);

  return hasPositiveFeedback && !asksImmediateEdit && normalized.length <= 140;
}

export function buildPostTestSalesReply(panelUrl: string): string {
  return clampAdminReplyLength(
    `Boa. Se gostou, o próximo passo é colocar no ar no seu número. ${buildAdminPanelPitch(panelUrl)} Se fizer sentido, eu já te ajudo a assinar ou conectar o WhatsApp agora.`,
  );
}
