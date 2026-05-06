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
