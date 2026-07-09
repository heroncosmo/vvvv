function parseSubscriptionMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  if (typeof metadata !== "string") return null;

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function shouldSkipBillingNotificationsForSubscription(metadata: unknown): boolean {
  const parsed = parseSubscriptionMetadata(metadata);
  if (!parsed) return false;

  return Boolean(parsed.supportRecoveryWindow || parsed.missionRecoveryDeclined);
}
