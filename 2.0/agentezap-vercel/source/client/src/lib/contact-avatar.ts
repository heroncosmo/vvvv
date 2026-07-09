const failedContactAvatarUrls = new Set<string>();

function isTemporaryWhatsAppAvatarUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "pps.whatsapp.net" || hostname.endsWith(".pps.whatsapp.net");
  } catch {
    return false;
  }
}

export function getRenderableContactAvatar(url: string | null | undefined): string | null {
  if (!url || failedContactAvatarUrls.has(url) || isTemporaryWhatsAppAvatarUrl(url)) {
    return null;
  }

  return url;
}

export function markContactAvatarFailed(url: string | null | undefined) {
  if (url) {
    failedContactAvatarUrls.add(url);
  }
}
