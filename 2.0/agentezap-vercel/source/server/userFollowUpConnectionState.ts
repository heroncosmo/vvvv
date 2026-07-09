export const WAITING_FOR_WHATSAPP_CONNECTION_REASON = "🔄 Aguardando conexão WhatsApp...";

export function shouldRecoverWaitingConnectionReason(
  followupDisabledReason: string | null | undefined,
  isConnectionActive: boolean,
): boolean {
  return isConnectionActive && followupDisabledReason === WAITING_FOR_WHATSAPP_CONNECTION_REASON;
}

const FOLLOWUP_CONNECTED_PROVIDER_STATUSES = new Set(["connected", "open", "ready", "authenticated"]);
const FOLLOWUP_HARD_DISCONNECTED_PROVIDER_STATUSES = new Set([
  "auth_failed",
  "deleted",
  "invalid_session",
  "logged_out",
  "logout",
  "pairing_required",
  "qr_required",
  "removed",
]);

function normalizeFollowUpProviderStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function connectionRecordLooksConnectedForFollowUp(connection: any): boolean {
  if (!connection) {
    return false;
  }

  const providerStatus = normalizeFollowUpProviderStatus(connection.providerStatus);
  if (FOLLOWUP_HARD_DISCONNECTED_PROVIDER_STATUSES.has(providerStatus)) {
    return false;
  }

  return (
    connection.isConnected === true ||
    !providerStatus ||
    FOLLOWUP_CONNECTED_PROVIDER_STATUSES.has(providerStatus)
  );
}

export function resolveUserFollowUpSocketFromSessions(
  sessions: Map<string, any>,
  userId: string,
  preferredConnectionId?: string,
) {
  if (preferredConnectionId) {
    const preferred = sessions.get(preferredConnectionId);
    if (preferred?.userId === userId && preferred.socket?.user) {
      return preferred.socket;
    }

    return null;
  }

  for (const session of Array.from(sessions.values())) {
    if (session.userId === userId && session.socket?.user) {
      return session.socket;
    }
  }

  return null;
}
