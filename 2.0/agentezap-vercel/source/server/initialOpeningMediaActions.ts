type MediaAction = {
  type: string;
  media_name?: string;
};

function foldOpeningMediaName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function mergeInitialOpeningMediaActions<T extends MediaAction>(
  openingMediaActions: T[],
  mediaActions: T[],
): T[] {
  if (!openingMediaActions.length) {
    return mediaActions;
  }

  const merged: T[] = [...openingMediaActions];
  const seenMediaNames = new Set(
    openingMediaActions
      .map((action) => foldOpeningMediaName(String(action?.media_name || "")))
      .filter(Boolean),
  );

  for (const action of mediaActions) {
    const foldedName = foldOpeningMediaName(String(action?.media_name || ""));
    if (foldedName && seenMediaNames.has(foldedName)) {
      continue;
    }

    if (foldedName) {
      seenMediaNames.add(foldedName);
    }

    merged.push(action);
  }

  return merged;
}
