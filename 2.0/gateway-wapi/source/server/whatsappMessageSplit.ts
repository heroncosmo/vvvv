export function stripDanglingTrailingListLines(message: string): string {
  const lines = message
    .replace(/\r\n/g, "\n")
    .split("\n");

  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1]?.trim() || "";
    if (!lastLine) {
      lines.pop();
      continue;
    }

    if (/^\d{1,3}[.)]?$/.test(lastLine) || /^[-*â€¢]+$/.test(lastLine)) {
      lines.pop();
      continue;
    }

    break;
  }

  return lines.join("\n").trim();
}

const BUBBLE_MARKER = "[BOLHA]";

function matchesBubbleMarker(source: string, startIndex: number): boolean {
  if (startIndex + BUBBLE_MARKER.length > source.length) {
    return false;
  }

  for (let offset = 0; offset < BUBBLE_MARKER.length; offset += 1) {
    const current = source[startIndex + offset];
    const expected = BUBBLE_MARKER[offset];

    if (!current || current.toUpperCase() !== expected) {
      return false;
    }
  }

  return true;
}

export function parseExplicitBubbleMessages(message: string): {
  hasExplicitBubbles: boolean;
  parts: string[];
} {
  const source = String(message || "");
  const parts: string[] = [];
  let cursor = 0;
  let segmentStart = 0;
  let foundMarker = false;

  while (cursor < source.length) {
    if (matchesBubbleMarker(source, cursor)) {
      foundMarker = true;
      const part = source.slice(segmentStart, cursor).trim();
      if (part) {
        parts.push(part);
      }
      cursor += BUBBLE_MARKER.length;
      segmentStart = cursor;
      continue;
    }

    cursor += 1;
  }

  if (!foundMarker) {
    const trimmed = source.trim();
    return {
      hasExplicitBubbles: false,
      parts: trimmed ? [trimmed] : [],
    };
  }

  const tail = source.slice(segmentStart).trim();
  if (tail) {
    parts.push(tail);
  }

  return {
    hasExplicitBubbles: true,
    parts,
  };
}

export function joinBubbleMessages(parts: string[]): string {
  return parts
    .map((part) => String(part || "").trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function sanitizeAgentResponseTail(message: string): string {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return "";
  }

  let sanitized = stripDanglingTrailingListLines(trimmed);
  if (!sanitized) {
    sanitized = trimmed;
  }

  if (/[:;,]\s*$/.test(sanitized)) {
    sanitized = sanitized.replace(/[:;,]\s*$/, ".").trim();
  }

  return sanitized;
}
