interface SaveMediaPendingActionInput {
  mediaUrl?: string | null;
  whenToUse?: string | null;
  mediaType?: string | null;
  flowItems?: Array<{
    type?: string | null;
    text?: string | null;
    mediaUrl?: string | null;
    storageUrl?: string | null;
  }> | null;
}

interface AskForMediaResendInput {
  messageText?: string | null;
  mediaUrl?: string | null;
  pendingMediaUrl?: string | null;
  lastReceivedMediaUrl?: string | null;
}

function normalizeText(value: string): string {
  return Array.from(String(value || "").toLowerCase().normalize("NFD"))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code < 0x300 || code > 0x36f;
    })
    .join("")
    .trim();
}

function includesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

export function canConfirmSaveMediaPendingAction(
  input: SaveMediaPendingActionInput,
): boolean {
  const normalizedMediaType = normalizeText(String(input.mediaType || ""));
  if (normalizedMediaType === "flow") {
    const items = Array.isArray(input.flowItems) ? input.flowItems : [];
    if (!String(input.whenToUse || "").trim() || items.length < 2) return false;

    return items.every((item) => {
      const itemType = normalizeText(String(item?.type || ""));
      if (itemType === "text") {
        return Boolean(String(item?.text || "").trim());
      }
      if (itemType === "media") {
        return Boolean(String(item?.mediaUrl || item?.storageUrl || "").trim());
      }
      return false;
    });
  }

  return Boolean(
    String(input.mediaUrl || "").trim() &&
    String(input.whenToUse || "").trim(),
  );
}

export function shouldAskForMediaResend(
  input: AskForMediaResendInput,
): boolean {
  const text = normalizeText(String(input.messageText || ""));
  if (!text) return false;

  const hasAvailableMedia = Boolean(
    String(input.mediaUrl || "").trim() ||
    String(input.pendingMediaUrl || "").trim() ||
    String(input.lastReceivedMediaUrl || "").trim(),
  );
  if (hasAvailableMedia) return false;

  const mentionsSaveIntent = includesAny(text, [
    "salva",
    "salvar",
    "guarda",
    "guardar",
    "cadastro",
    "cadastrar",
    "cadastra",
    "adiciona",
    "adicionar",
    "coloca essa",
    "colocar essa",
    "usa essa",
    "usar essa",
    "manda essa",
  ]);

  const mentionsMedia = includesAny(text, [
    "midia",
    "m?dia",
    "imagem",
    "foto",
    "audio",
    "a?udio",
    "video",
    "v?deo",
    "arquivo",
    "documento",
    "pdf",
  ]);

  return mentionsSaveIntent && mentionsMedia;
}
