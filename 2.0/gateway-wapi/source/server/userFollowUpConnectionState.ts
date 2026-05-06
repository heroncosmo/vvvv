export const WAITING_FOR_WHATSAPP_CONNECTION_REASON = "🔄 Aguardando conexão WhatsApp...";

export function shouldRecoverWaitingConnectionReason(
  followupDisabledReason: string | null | undefined,
  isConnectionActive: boolean,
): boolean {
  return isConnectionActive && followupDisabledReason === WAITING_FOR_WHATSAPP_CONNECTION_REASON;
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
