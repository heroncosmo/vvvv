export type WhatsappRuntimeConnectionSnapshot = {
  phoneNumber?: string | null;
  isConnected?: boolean;
};

type WhatsappRuntimeConnectionResolver = (
  connectionId: string,
  userId?: string,
) => WhatsappRuntimeConnectionSnapshot | null | undefined;

let runtimeConnectionResolver: WhatsappRuntimeConnectionResolver | null = null;

export function registerWhatsappRuntimeConnectionResolver(
  resolver: WhatsappRuntimeConnectionResolver,
): void {
  runtimeConnectionResolver = resolver;
}

export function clearWhatsappRuntimeConnectionResolver(): void {
  runtimeConnectionResolver = null;
}

export function getWhatsappRuntimeConnectionSnapshot(
  connectionId: string,
  userId?: string,
): WhatsappRuntimeConnectionSnapshot | null {
  if (!runtimeConnectionResolver) {
    return null;
  }

  return runtimeConnectionResolver(connectionId, userId) || null;
}
