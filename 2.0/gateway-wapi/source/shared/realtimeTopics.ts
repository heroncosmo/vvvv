const DEFAULT_USER_TOPIC_PREFIX = "app:user:";
const DEFAULT_ADMIN_TOPIC_PREFIX = "app:admin:";

function normalizePrefix(value: string | undefined | null, fallback: string): string {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

export function buildUserRealtimeTopic(userId: string, prefix?: string | null): string {
  return `${normalizePrefix(prefix, DEFAULT_USER_TOPIC_PREFIX)}${String(userId || "").trim()}`;
}

export function buildAdminRealtimeTopic(adminId: string, prefix?: string | null): string {
  return `${normalizePrefix(prefix, DEFAULT_ADMIN_TOPIC_PREFIX)}${String(adminId || "").trim()}`;
}
