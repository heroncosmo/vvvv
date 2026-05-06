export const PROMPT_EDIT_REQUEST_MAX_ATTEMPTS = 10;
export const PROMPT_EDIT_REQUEST_RETRY_BASE_DELAY_MS = 4000;
export const PROMPT_EDIT_REQUEST_RETRY_MAX_DELAY_MS = 15000;

const RETRYABLE_PROMPT_EDIT_HTTP_STATUSES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
  520,
  521,
  522,
  523,
  524,
]);

function normalizeRetryMessage(message?: string | null): string {
  return String(message || "").trim().toLocaleLowerCase("pt-BR");
}

export function isRetryablePromptEditStatus(status: number): boolean {
  return RETRYABLE_PROMPT_EDIT_HTTP_STATUSES.has(status);
}

export function isRetryablePromptEditMessage(message?: string | null): boolean {
  const normalized = normalizeRetryMessage(message);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("temporariamente ocupado") ||
    normalized.includes("temporariamente indisponivel") ||
    normalized.includes("temporariamente indisponível") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("temporarily busy") ||
    normalized.includes("overloaded") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("connection") ||
    normalized.includes("network") ||
    normalized.includes("streaming da edicao") ||
    normalized.includes("streaming da edição") ||
    normalized.includes("stream da edicao") ||
    normalized.includes("stream da edição") ||
    normalized.includes("sistema esta processando") ||
    normalized.includes("sistema está processando") ||
    normalized.includes("proxima tentativa") ||
    normalized.includes("próxima tentativa") ||
    normalized.includes("aguardando fila")
  );
}

export function getPromptEditRetryDelayMs(attempt: number): number {
  return Math.min(
    PROMPT_EDIT_REQUEST_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)),
    PROMPT_EDIT_REQUEST_RETRY_MAX_DELAY_MS,
  );
}
