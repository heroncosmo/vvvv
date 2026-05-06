export interface SseMessageParseResult {
  events: string[];
  remainder: string;
}

export function extractSseDataEvents(
  buffer: string,
  options?: { flush?: boolean },
): SseMessageParseResult {
  const normalizedBuffer = String(buffer || "").replace(/\r\n/g, "\n");
  const parts = normalizedBuffer.split("\n\n");
  const flush = options?.flush === true;
  const completeEventCount = flush ? parts.length : Math.max(0, parts.length - 1);
  const events: string[] = [];

  for (let index = 0; index < completeEventCount; index += 1) {
    const rawEvent = parts[index];
    if (!rawEvent) {
      continue;
    }

    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length > 0) {
      events.push(dataLines.join("\n"));
    }
  }

  return {
    events,
    remainder: flush ? "" : parts[parts.length - 1] || "",
  };
}
