interface PromptEditCalibrationSummary {
  sucesso?: boolean;
  scoreGeral?: number;
  edicoesAplicadas?: number;
}

export function buildPromptEditCalibrationMessage(
  calibrationResult?: PromptEditCalibrationSummary | null,
  fallbackMessage?: string | null,
): string {
  if (calibrationResult) {
    const score = Number(calibrationResult.scoreGeral || 0);
    const edits = Number(calibrationResult.edicoesAplicadas || 0);
    const label = calibrationResult.sucesso ? "Validação" : "Calibração";
    return `\n\n${label}: Score ${score}/100 (${edits} edições)`;
  }

  const normalizedFallback = String(fallbackMessage || "").trim();
  if (!normalizedFallback) {
    return "";
  }

  return `\n\n${normalizedFallback}`;
}

export function buildPromptEditAssistantFeedback(input: {
  baseMessage: string;
  calibrationResult?: PromptEditCalibrationSummary | null;
  calibrationFallbackMessage?: string | null;
  editQuotaMessage?: string | null;
}): string {
  const parts = [
    String(input.baseMessage || "").trim(),
    buildPromptEditCalibrationMessage(input.calibrationResult, input.calibrationFallbackMessage).trim(),
    String(input.editQuotaMessage || "").trim(),
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function isPromptEditFreeQuotaNotice(value: string | null | undefined): boolean {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;

  const mentionsCredits = text.includes("crédito") || text.includes("credito");
  const mentionsFreePlan =
    text.includes("no gratuito são") ||
    text.includes("no gratuito sao") ||
    text.includes("plano gratuito");
  const mentionsDailyLimit =
    text.includes("alterações por dia") ||
    text.includes("alteracoes por dia");

  return mentionsCredits && mentionsFreePlan && mentionsDailyLimit && text.includes("hoje");
}

export function stripPromptEditFreeQuotaNoticeForPaidUser(content: string | null | undefined): string {
  const original = String(content || "");
  if (!original.trim()) return original;

  const parts = original.split("\n\n");
  const visibleParts = parts
    .map((part) => part.trim())
    .filter((part) => part && !isPromptEditFreeQuotaNotice(part));

  return visibleParts.join("\n\n");
}
