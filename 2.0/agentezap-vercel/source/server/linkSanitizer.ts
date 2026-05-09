function trimUrlTail(url: string): string {
  let sanitized = url.trim();
  while (sanitized.length > 0 && [")", "]", ".", ",", ";"].includes(sanitized[sanitized.length - 1])) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}

export function sanitizeOutgoingLinks(text: string): string {
  if (!text) return text;

  let cleaned = text;

  cleaned = cleaned.replace(/\[(https?:\/\/[^\]\s]+)\]\(\1\)/gi, "$1");
  cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2");
  cleaned = cleaned.replace(/\[(https?:\/\/[^\]\s]+)\]/gi, "$1");

  const lines = cleaned.split("\n");
  const seenUrls = new Set<string>();
  const normalizedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      normalizedLines.push(line);
      continue;
    }

    const currentLineUrls: string[] = [];
    const replacedLine = line.replace(/https?:\/\/[^\s]+/gi, (rawUrl) => {
      const sanitizedUrl = trimUrlTail(rawUrl);
      currentLineUrls.push(sanitizedUrl.toLowerCase());
      return sanitizedUrl;
    });

    const onlyUrl = replacedLine.trim();
    const urlOnlyMatch = onlyUrl.match(/^(https?:\/\/[^\s]+)$/i);
    if (urlOnlyMatch) {
      const sanitizedUrl = trimUrlTail(urlOnlyMatch[1]);
      const fingerprint = sanitizedUrl.toLowerCase();
      if (seenUrls.has(fingerprint)) {
        continue;
      }
      seenUrls.add(fingerprint);
      normalizedLines.push(sanitizedUrl);
      continue;
    }

    for (const fingerprint of currentLineUrls) {
      seenUrls.add(fingerprint);
    }
    normalizedLines.push(replacedLine);
  }

  return normalizedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
