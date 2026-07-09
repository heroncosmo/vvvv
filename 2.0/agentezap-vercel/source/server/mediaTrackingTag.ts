export function buildMediaTrackingTag(mediaName?: string | null): string {
  const normalizedMediaName = String(mediaName || "").trim();
  return `MEDIA_NAME:${normalizedMediaName || "URL"}`;
}
