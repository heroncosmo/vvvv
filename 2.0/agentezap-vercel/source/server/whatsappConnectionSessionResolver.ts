import type { WhatsappConnection } from "@shared/schema";

export type GetWhatsAppSession = (key: string) => any;

interface ResolveConnectionScopedSessionOptions {
  allowUserFallback?: boolean;
}

export function resolveConnectionScopedSession(
  connection: Pick<WhatsappConnection, "id" | "userId">,
  getSession: GetWhatsAppSession,
  options: ResolveConnectionScopedSessionOptions = {},
) {
  const sessionByConnection = getSession(connection.id);
  if (sessionByConnection) {
    return sessionByConnection;
  }

  if (options.allowUserFallback && connection.userId) {
    return getSession(connection.userId);
  }

  return undefined;
}
