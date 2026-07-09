import { formatStatusBrazilTime } from "./statusBrazilTime";

const TRANSIENT_RETRY_BASE_SECONDS = 15;
const TRANSIENT_RETRY_MAX_SECONDS = 5 * 60;
export const TRANSIENT_RETRY_LIMIT = 8;

export function isStatusSendTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "StatusSendTimeoutError";
}

export function isTransientStatusPublishError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("connection closed") ||
    normalized.includes("whatsapp nao conectado") ||
    normalized.includes("whatsapp não conectado") ||
    normalized.includes("conexao selecionada") ||
    normalized.includes("conexão selecionada") ||
    normalized.includes("not connected") ||
    normalized.includes("socket") ||
    normalized.includes("websocket") ||
    normalized.includes("timed out") ||
    normalized.includes("stream errored out") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("429")
  );
}

export function shouldRetryStatusPublishError(error: unknown): boolean {
  return isStatusSendTimeoutError(error) || isTransientStatusPublishError(error);
}

export function computeTransientRetryDelaySeconds(attempt: number) {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(
    TRANSIENT_RETRY_MAX_SECONDS,
    TRANSIENT_RETRY_BASE_SECONDS * Math.max(1, 2 ** safeAttempt),
  );
}

export function buildRetryMessage(error: unknown, nextRetryAt: Date, attempt: number) {
  const reason = error instanceof Error ? error.message : String(error || "Falha temporaria");
  return `Instabilidade no WhatsApp. Tentando novamente as ${formatStatusBrazilTime(nextRetryAt)}. Tentativa ${attempt}/${TRANSIENT_RETRY_LIMIT}. Motivo: ${reason}`;
}

export function buildNonRetryableStatusErrorMessage(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error || "Falha ao enviar status");

  if (isStatusSendTimeoutError(error)) {
    return `O envio demorou demais e foi interrompido para evitar repostagem automatica duplicada. Confira no WhatsApp se o status ja entrou antes de tentar novamente. Motivo: ${reason}`;
  }

  return reason;
}
