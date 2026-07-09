export function resolvePendingAIResponseRetryDelaySeconds(params: {
  retryCount: number;
  responseDelaySeconds?: number | null;
  connectionClosed?: boolean;
}): number {
  const retryCount = Math.max(1, Math.floor(Number(params.retryCount || 1)));

  if (params.connectionClosed) {
    return Math.min(5 * Math.pow(2, retryCount - 1), 30);
  }

  const configuredDelay = Number(params.responseDelaySeconds);
  const hasFastConfiguredDelay = Number.isFinite(configuredDelay) && configuredDelay <= 5;
  const hasModerateConfiguredDelay = Number.isFinite(configuredDelay) && configuredDelay <= 10;
  const baseDelaySeconds = hasFastConfiguredDelay ? 5 : hasModerateConfiguredDelay ? 10 : 30;
  const maxDelaySeconds = hasFastConfiguredDelay ? 30 : hasModerateConfiguredDelay ? 60 : 300;

  return Math.min(baseDelaySeconds * Math.pow(2, retryCount - 1), maxDelaySeconds);
}
