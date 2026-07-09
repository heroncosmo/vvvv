export type OwnerBillingMessageParts = {
  mainMessage: string;
  pixCopyMessage: string | null;
};

const PIX_COPY_METADATA_KEYS = [
  "pix_copia_cola",
  "pixCopiaCola",
  "pixCode",
  "codigoPix",
  "codigo_pix",
];

const PIX_COPY_PLACEHOLDER_NAMES = [
  "pix_copia_cola",
  "pixCopiaCola",
  "pixCode",
  "codigoPix",
  "codigo_pix",
];

const PIX_COPY_PLACEHOLDERS = PIX_COPY_PLACEHOLDER_NAMES.flatMap((name) => [
  `{${name}}`,
  `{{${name}}}`,
]);

function getMetadataText(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function splitMessageLines(value: string): string[] {
  const lines: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\r") {
      lines.push(current);
      current = "";
      if (value[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }
    if (char === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  lines.push(current);
  return lines;
}

function stripCombiningMarks(value: string): string {
  const normalized = value.normalize("NFD");
  let output = "";

  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    output += char;
  }

  return output;
}

function isPixCopyLabelLine(line: string): boolean {
  const normalized = stripCombiningMarks(line).toLowerCase().trim();
  if (normalized.length === 0 || normalized.length > 120) {
    return false;
  }
  if (!normalized.includes("pix")) {
    return false;
  }
  return normalized.includes("copia") || normalized.includes("cola") || normalized.includes("codigo");
}

function lineContainsPixCopySignal(line: string, pixCopyCode: string): boolean {
  const trimmedLine = line.trim();
  if (pixCopyCode && (trimmedLine === pixCopyCode || line.includes(pixCopyCode))) {
    return true;
  }

  for (const placeholder of PIX_COPY_PLACEHOLDERS) {
    if (line.includes(placeholder)) {
      return true;
    }
  }

  return false;
}

function compactMessageLines(lines: string[]): string {
  const output: string[] = [];
  let previousBlank = true;

  for (const line of lines) {
    const cleanedLine = line.trimEnd();
    const isBlank = cleanedLine.trim().length === 0;
    if (isBlank) {
      if (!previousBlank) {
        output.push("");
      }
      previousBlank = true;
      continue;
    }

    output.push(cleanedLine);
    previousBlank = false;
  }

  while (output.length > 0 && output[output.length - 1].trim().length === 0) {
    output.pop();
  }

  return output.join("\n").trim();
}

export function getOwnerBillingPixCopyCode(metadata: Record<string, unknown>): string {
  return getMetadataText(metadata, PIX_COPY_METADATA_KEYS);
}

export function buildOwnerBillingMessageParts(
  message: string,
  metadata: Record<string, unknown>,
): OwnerBillingMessageParts {
  const rawMessage = String(message || "").trim();
  const pixCopyMessage = getOwnerBillingPixCopyCode(metadata);
  if (!pixCopyMessage) {
    return {
      mainMessage: rawMessage,
      pixCopyMessage: null,
    };
  }

  const lines = splitMessageLines(rawMessage);
  const removeLine = new Array<boolean>(lines.length).fill(false);

  for (let index = 0; index < lines.length; index += 1) {
    if (!lineContainsPixCopySignal(lines[index], pixCopyMessage)) {
      continue;
    }

    removeLine[index] = true;
    if (index > 0 && isPixCopyLabelLine(lines[index - 1])) {
      removeLine[index - 1] = true;
    }
    if (index + 1 < lines.length && lines[index + 1].trim().length === 0) {
      removeLine[index + 1] = true;
    }
  }

  const mainMessage = compactMessageLines(lines.filter((_, index) => !removeLine[index]));
  if (!mainMessage) {
    return {
      mainMessage: rawMessage,
      pixCopyMessage: null,
    };
  }

  return {
    mainMessage,
    pixCopyMessage,
  };
}
