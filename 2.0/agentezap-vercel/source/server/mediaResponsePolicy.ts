import type { AgentMedia } from "@shared/schema";

type MediaActionLike = {
  type?: string | null;
  media_name?: string | null;
};

function normalizeMediaActionName(value?: string | null): string {
  return String(value || "").trim().toUpperCase();
}

export function getSuppressingMediaNames(
  mediaActions: MediaActionLike[] | null | undefined,
  mediaLibrary: Array<Pick<AgentMedia, "name" | "suppressTextResponse">> | null | undefined,
): string[] {
  const actionNames = new Set(
    (mediaActions || [])
      .map((action) => normalizeMediaActionName(action?.media_name))
      .filter(Boolean),
  );

  if (actionNames.size === 0) {
    return [];
  }

  return (mediaLibrary || [])
    .filter((media) => media?.suppressTextResponse === true)
    .map((media) => String(media.name || "").trim())
    .filter((name) => actionNames.has(normalizeMediaActionName(name)));
}

export function shouldSuppressTextResponseForMediaActions(
  mediaActions: MediaActionLike[] | null | undefined,
  mediaLibrary: Array<Pick<AgentMedia, "name" | "suppressTextResponse">> | null | undefined,
): boolean {
  return getSuppressingMediaNames(mediaActions, mediaLibrary).length > 0;
}
