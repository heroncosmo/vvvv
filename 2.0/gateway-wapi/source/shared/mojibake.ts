const WINDOWS_1252_CODEPOINT_TO_BYTE = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const SUSPICIOUS_FRAGMENTS = [
  "\u00c3\u0192\u00c2",
  "\u00c3\u0192",
  "\u00c3\u00b0\u00c5\u00b8",
  "\u00f0\u0178",
  "\u00e2\u20ac",
  "\u00e2\u2020",
  "\u00ef\u00bf\u00bd",
  "\ufffd",
  "\u00c2\u00a0",
  "\u00c3\u00a7",
  "\u00c3\u00a3",
  "\u00c3\u00a9",
  "\u00c3\u00aa",
  "\u00c3\u00a1",
  "\u00c3\u00ad",
  "\u00c3\u00b3",
  "\u00c3\u00ba",
  "\u00c3\u00b4",
  "\u00c3\u00b5",
  "\u00c3\u0020",
  "\u00c3\u2030",
  "\u00c3\u201c",
  "\u00c3\u0161",
];

const EXPLICIT_REPAIRS: Array<[string, string]> = [
  ["\u00c2\u00a0", " "],
  ["\u00c3\u00a0", "\u00e0"],
  ["\u00c3\u00a1", "\u00e1"],
  ["\u00c3\u00a2", "\u00e2"],
  ["\u00c3\u00a3", "\u00e3"],
  ["\u00c3\u00a7", "\u00e7"],
  ["\u00c3\u00a8", "\u00e8"],
  ["\u00c3\u00a9", "\u00e9"],
  ["\u00c3\u00aa", "\u00ea"],
  ["\u00c3\u00ad", "\u00ed"],
  ["\u00c3\u00b3", "\u00f3"],
  ["\u00c3\u00b4", "\u00f4"],
  ["\u00c3\u00b5", "\u00f5"],
  ["\u00c3\u00ba", "\u00fa"],
  ["\u00c3\u0080", "\u00c0"],
  ["\u00c3\u0081", "\u00c1"],
  ["\u00c3\u0082", "\u00c2"],
  ["\u00c3\u0083", "\u00c3"],
  ["\u00c3\u0087", "\u00c7"],
  ["\u00c3\u0088", "\u00c8"],
  ["\u00c3\u0089", "\u00c9"],
  ["\u00c3\u008a", "\u00ca"],
  ["\u00c3\u008d", "\u00cd"],
  ["\u00c3\u0093", "\u00d3"],
  ["\u00c3\u0094", "\u00d4"],
  ["\u00c3\u0095", "\u00d5"],
  ["\u00c3\u009a", "\u00da"],
  ["\u00e2\u0080\u008b", ""],
  ["\u00e2\u0080\u008c", ""],
  ["\u00e2\u0080\u008d", ""],
  ["\u00e2\u2020\u2019", "\u2192"],
];

function countOccurrences(value: string, fragment: string): number {
  if (!fragment) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (index < value.length) {
    const nextIndex = value.indexOf(fragment, index);
    if (nextIndex === -1) {
      break;
    }

    count += 1;
    index = nextIndex + fragment.length;
  }

  return count;
}

function scoreLikelyMojibake(value: string): number {
  if (!value) {
    return 0;
  }

  return SUSPICIOUS_FRAGMENTS.reduce(
    (total, fragment) => total + countOccurrences(value, fragment),
    0,
  );
}

function applyExplicitRepairs(value: string): string {
  let repaired = String(value || "");

  for (const [from, to] of EXPLICIT_REPAIRS) {
    repaired = repaired.split(from).join(to);
  }

  return repaired;
}

function decodeWindows1252Utf8(value: string): string | null {
  const bytes: number[] = [];

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mappedByte = WINDOWS_1252_CODEPOINT_TO_BYTE.get(codePoint);
    if (mappedByte === undefined) {
      return null;
    }

    bytes.push(mappedByte);
  }

  return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
}

export function isLikelyMojibake(value?: string | null): boolean {
  return scoreLikelyMojibake(String(value || "")) > 0;
}

export const looksLikeMojibake = isLikelyMojibake;

function repairMojibakeToken(value: string, maxPasses = 3): string {
  let best = applyExplicitRepairs(value);
  let bestScore = scoreLikelyMojibake(best);

  if (!best || bestScore === 0) {
    return best;
  }

  for (let round = 0; round < maxPasses; round += 1) {
    const decoded = decodeWindows1252Utf8(best);
    if (!decoded || decoded === best || decoded.includes("\ufffd")) {
      break;
    }

    const cleaned = applyExplicitRepairs(decoded);
    const cleanedScore = scoreLikelyMojibake(cleaned);
    if (cleanedScore > bestScore) {
      break;
    }

    best = cleaned;
    bestScore = cleanedScore;
    if (bestScore === 0) {
      break;
    }
  }

  return best;
}

export function repairMojibakeText(value?: string | null, maxPasses = 3): string {
  const original = applyExplicitRepairs(String(value || ""));
  if (!original || !isLikelyMojibake(original)) {
    return original;
  }

  return original
    .split(/(\s+)/)
    .map((part) => (/\s+/.test(part) ? part : repairMojibakeToken(part, maxPasses)))
    .join("");
}

export function repairMojibakeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return repairMojibakeText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairMojibakeDeep(item)) as T;
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  let changed = false;
  const repaired: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    const nextValue = repairMojibakeDeep(entryValue);
    repaired[key] = nextValue;
    if (nextValue !== entryValue) {
      changed = true;
    }
  }

  return (changed ? repaired : value) as T;
}

export const repairMojibakeInData = repairMojibakeDeep;
