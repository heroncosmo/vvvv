const PENDING_AUDIO_TRANSCRIPTION_TEXTS = new Set([
  "audio",
  "audio enviado",
  "audio enviado pelo cliente",
  "audio recebido",
  "audio do cliente",
  "mensagem de audio",
]);

function stripCombiningMarks(value: string): string {
  const normalized = value.normalize("NFD");
  let output = "";

  for (const char of normalized) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x0300 || codePoint > 0x036f) {
      output += char;
    }
  }

  return output;
}

function stripWrappers(value: string): string {
  let output = value.trim();
  const pairs: Array<readonly [string, string]> = [
    ["*", "*"],
    ["[", "]"],
    ["(", ")"],
  ];

  let changed = true;
  while (changed && output.length > 1) {
    changed = false;
    for (const [left, right] of pairs) {
      if (output.startsWith(left) && output.endsWith(right)) {
        output = output.slice(left.length, output.length - right.length).trim();
        changed = true;
      }
    }
  }

  return output;
}

function removeGroupSpeakerPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("*")) {
    return trimmed;
  }

  const marker = "*: ";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex <= 0 || markerIndex > 96) {
    return trimmed;
  }

  return trimmed.slice(markerIndex + marker.length).trim();
}

function getGroupSpeakerPrefix(value?: string | null): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed.startsWith("*")) {
    return null;
  }

  const marker = "*: ";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex <= 0 || markerIndex > 96) {
    return null;
  }

  const prefix = trimmed.slice(0, markerIndex + 2).trim();
  return prefix ? `${prefix} ` : null;
}

function normalizeAudioText(value: string): string {
  return stripCombiningMarks(value).trim().toLowerCase();
}

function compactAudioText(value: string): string {
  let output = "";

  for (const char of value) {
    if (
      char !== " " &&
      char !== "\t" &&
      char !== "\n" &&
      char !== "\r" &&
      char !== "[" &&
      char !== "]" &&
      char !== "(" &&
      char !== ")" &&
      char !== "*" &&
      char !== ":" &&
      char !== "?" &&
      char !== "-" &&
      char !== "_" &&
      char !== "."
    ) {
      output += char;
    }
  }

  return output;
}

export function isPendingAudioTranscriptionText(text?: string | null): boolean {
  const raw = String(text || "").trim();
  if (!raw) {
    return true;
  }

  const withoutSpeaker = removeGroupSpeakerPrefix(raw);
  const unwrapped = stripWrappers(withoutSpeaker);
  const normalized = normalizeAudioText(unwrapped);
  if (!normalized) {
    return true;
  }

  if (PENDING_AUDIO_TRANSCRIPTION_TEXTS.has(normalized)) {
    return true;
  }

  const compact = compactAudioText(normalized);
  if (PENDING_AUDIO_TRANSCRIPTION_TEXTS.has(compact)) {
    return true;
  }

  if (normalized.startsWith("audio ") && normalized.includes("enviado") && normalized.length <= 80) {
    return true;
  }

  const hasBrokenEncodingHint = raw.startsWith("??") || raw.includes("\u00c3");
  return hasBrokenEncodingHint && compact.includes("udio") && compact.length <= 48;
}

export function formatAudioMessageTextWithTranscription(
  originalText: string | null | undefined,
  transcription: string,
): string {
  const cleanTranscription = transcription.trim();
  const groupSpeakerPrefix = getGroupSpeakerPrefix(originalText);
  return groupSpeakerPrefix ? `${groupSpeakerPrefix}${cleanTranscription}` : cleanTranscription;
}
