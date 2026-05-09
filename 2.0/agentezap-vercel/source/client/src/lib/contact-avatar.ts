const failedContactAvatarUrls = new Set<string>();

export function getRenderableContactAvatar(url: string | null | undefined): string | null {
  if (!url || failedContactAvatarUrls.has(url)) {
    return null;
  }

  return url;
}

export function markContactAvatarFailed(url: string | null | undefined) {
  if (url) {
    failedContactAvatarUrls.add(url);
  }
}
