type StageSyncInput = {
  currentStage?: unknown;
  maxSentStage?: unknown;
  maxSentAt?: Date | string | number | null;
  latestClientAfterSentAt?: Date | string | number | null;
  latestCompanyAfterClientAt?: Date | string | number | null;
};

function toValidTime(value: StageSyncInput["maxSentAt"]): number | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function shouldPreserveStageAfterCompanyReply(input: StageSyncInput): boolean {
  const maxSentTime = toValidTime(input.maxSentAt);
  const clientAfterSentTime = toValidTime(input.latestClientAfterSentAt);
  const companyAfterClientTime = toValidTime(input.latestCompanyAfterClientAt);

  return Boolean(
    maxSentTime !== null &&
    clientAfterSentTime !== null &&
    companyAfterClientTime !== null &&
    clientAfterSentTime > maxSentTime &&
    companyAfterClientTime > clientAfterSentTime,
  );
}

export function resolveStageAfterSentLogSync(input: StageSyncInput): number {
  const currentStage = Math.max(0, toFiniteNumber(input.currentStage) ?? 0);

  if (shouldPreserveStageAfterCompanyReply(input)) {
    return currentStage;
  }

  const maxSentStage = toFiniteNumber(input.maxSentStage);
  return maxSentStage === null ? currentStage : maxSentStage + 1;
}
