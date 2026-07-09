export type CodexNoSendRetryAIResult = {
  skipAutoReplyReason?: string | null;
  skipAutoReplyViolations?: string[] | null;
};

export type CodexNoSendRetryOutcome =
  | {
      status: "requeued";
      reason: string;
      currentRetries: number;
      backoffSec: number;
    }
  | {
      status: "failed";
      reason: string;
      currentRetries: number;
      failureReason: string;
    };

export type CodexNoSendRetryExecutorParams = {
  aiResult?: CodexNoSendRetryAIResult | null;
  conversationId: string;
  pending: { retryCount?: number | null };
  pendingMutationGuard: unknown;
  pendingRetryCounter: Map<string, number>;
  maxRetries: number;
  responseDelaySecondsForRetry: number;
  resolveDelaySeconds: (params: { retryCount: number; responseDelaySeconds: number }) => number;
  resetPendingAIResponseForRetry: (
    conversationId: string,
    delaySeconds: number,
    mutationGuard: unknown,
    patch: { lastError: string },
  ) => Promise<unknown>;
  updateConversation: (
    conversationId: string,
    patch: {
      needsHumanAttention: true;
      attentionPriority: "high";
      attentionReason: string;
      attentionQualifiedAt: Date;
    },
  ) => Promise<unknown>;
  finalizePendingState: (status: "failed", reason: string, lastError: string) => Promise<unknown>;
  onAttentionError?: (error: unknown, failureReason: string) => void;
};

export function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function resolveRetryableCodexNoSendFailure(aiResult?: CodexNoSendRetryAIResult | null): string | null {
  const reason = String(aiResult?.skipAutoReplyReason || "").trim();
  if (reason !== "codex_no_send") return null;

  const violations = Array.isArray(aiResult?.skipAutoReplyViolations)
    ? aiResult.skipAutoReplyViolations.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const combined = [reason, ...violations].join(" | ");
  const normalized = combined.toLowerCase();
  const retryableMarkers = [
    "codex_cli_failed_closed",
    "codex_cli_retry_after_timeout_before_final_json",
    "codex_cli_retry_after_sandbox_read_failure",
    "codex_cli_missing_public_output_fail_closed",
    "codex_login_status_failed",
    "timeout",
    "timed out",
    "sandbox",
    "bwrap",
  ];

  if (!retryableMarkers.some((marker) => normalized.includes(marker))) return null;
  return combined.slice(0, 500);
}

export async function executeRetryableCodexNoSend(
  params: CodexNoSendRetryExecutorParams,
): Promise<CodexNoSendRetryOutcome | null> {
  const retryableReason = resolveRetryableCodexNoSendFailure(params.aiResult);
  if (!retryableReason) return null;

  const persistedRetries = Math.max(0, Number(params.pending.retryCount || 0));
  const currentRetries = Math.max(
    (params.pendingRetryCounter.get(params.conversationId) || 0) + 1,
    persistedRetries + 1,
  );
  params.pending.retryCount = currentRetries;
  params.pendingRetryCounter.set(params.conversationId, currentRetries);

  if (currentRetries > params.maxRetries) {
    const failureReason = `codex_no_send_max_retries_${currentRetries}`;
    params.pendingRetryCounter.delete(params.conversationId);

    try {
      await params.updateConversation(params.conversationId, {
        needsHumanAttention: true,
        attentionPriority: "high",
        attentionReason: "Falha operacional do Codex apos retries; cliente pode estar sem resposta automatica.",
        attentionQualifiedAt: new Date(),
      });
    } catch (attentionError) {
      params.onAttentionError?.(attentionError, failureReason);
    }

    await params.finalizePendingState("failed", failureReason, retryableReason);
    return {
      status: "failed",
      reason: retryableReason,
      currentRetries,
      failureReason,
    };
  }

  const backoffSec = params.resolveDelaySeconds({
    retryCount: currentRetries,
    responseDelaySeconds: params.responseDelaySecondsForRetry,
  });
  await params.resetPendingAIResponseForRetry(
    params.conversationId,
    backoffSec,
    params.pendingMutationGuard,
    { lastError: retryableReason },
  );

  return {
    status: "requeued",
    reason: retryableReason,
    currentRetries,
    backoffSec,
  };
}
