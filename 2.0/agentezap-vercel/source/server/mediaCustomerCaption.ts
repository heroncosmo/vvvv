export function resolveCustomerFacingMediaCaption(
  media: { caption?: string | null } | null | undefined,
): string | undefined {
  const caption = typeof media?.caption === "string" ? media.caption.trim() : "";
  return caption || undefined;
}
