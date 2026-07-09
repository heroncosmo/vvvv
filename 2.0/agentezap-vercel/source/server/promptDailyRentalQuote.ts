export type PromptDailyRentalGroup = {
  group: string;
  dailyRate: number;
  modelLabel: string;
  aliases: Array<{ value: string; source: "model" | "mapping" | "off_table" }>;
};

export type PromptDailyRentalQuoteResult = {
  text: string;
  reason: string;
  group: PromptDailyRentalGroup;
  days: number;
  hours: number;
  subtotal: number;
  fee: number;
  total: number;
};

export type PromptDailyRentalGroupListResult = {
  text: string;
  reason: string;
  groups: PromptDailyRentalGroup[];
  fee: number;
};

type PromptDailyRentalSelection = {
  group: PromptDailyRentalGroup;
  alias: string;
  source: "model" | "mapping" | "off_table" | "explicit_group";
  score: number;
};

type PromptDailyRentalDateTime = {
  date: Date;
  raw: string;
  hasTime: boolean;
};

type PromptDailyRentalHistoryEntry = {
  text?: unknown;
  content?: unknown;
  fromMe?: boolean | null;
  isFromAgent?: boolean | null;
  role?: unknown;
};

const PROMPT_DAILY_RENTAL_BRANDS = new Set([
  "chevrolet",
  "fiat",
  "ford",
  "hyundai",
  "jeep",
  "nissan",
  "renault",
  "toyota",
  "volkswagen",
]);

function normalizePromptDailyRentalText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePromptDailyRentalMoney(value: unknown): number | null {
  let cleaned = String(value ?? "")
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+(?:\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPromptDailyRentalMoney(value: number): string {
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  return `R$ ${rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function splitPromptDailyRentalTerms(value: unknown): string[] {
  return String(value || "")
    .replace(/\boutra?\b/gi, " ")
    .replace(/\bmodelos?\b/gi, " ")
    .split(/,|;|\/|\bou\b|\be\b/gi)
    .map((item) => item.replace(/[."“”'`]/g, "").trim())
    .filter((item) => normalizePromptDailyRentalText(item).length >= 2);
}

function addPromptDailyRentalAlias(
  aliases: Array<{ value: string; source: "model" | "mapping" | "off_table" }>,
  value: string,
  source: "model" | "mapping" | "off_table",
) {
  const normalized = normalizePromptDailyRentalText(value);
  if (normalized.length < 2) return;
  if (aliases.some((item) => normalizePromptDailyRentalText(item.value) === normalized)) return;
  aliases.push({ value: value.trim(), source });
}

function buildPromptDailyRentalModelAliases(modelLabel: string): Array<{ value: string; source: "model" }> {
  const aliases: Array<{ value: string; source: "model" }> = [];
  for (const model of splitPromptDailyRentalTerms(modelLabel.replace(/\b\d+\s+lugares?\b/gi, (match) => `, ${match}`))) {
    addPromptDailyRentalAlias(aliases, model, "model");
    const normalizedWords = normalizePromptDailyRentalText(model).split(/\s+/g).filter(Boolean);
    if (normalizedWords.length > 1 && PROMPT_DAILY_RENTAL_BRANDS.has(normalizedWords[0])) {
      addPromptDailyRentalAlias(aliases, normalizedWords.slice(1).join(" "), "model");
    }
    const lastWord = normalizedWords[normalizedWords.length - 1];
    if (lastWord && lastWord.length >= 2 && !PROMPT_DAILY_RENTAL_BRANDS.has(lastWord)) {
      addPromptDailyRentalAlias(aliases, lastWord, "model");
    }
  }
  return aliases;
}

export function extractPromptDailyRentalGroups(prompt: unknown): PromptDailyRentalGroup[] {
  const source = String(prompt || "").replace(/\r\n/g, "\n");
  const groupsById = new Map<string, PromptDailyRentalGroup>();
  const groupPattern =
    /(?:^|\n)\s*Grupo\s+([A-Z0-9]+)\s*[-–—]\s*R\$\s*([\d.,]+)\s*\/\s*(?:dia|diaria|diária)\s*\n\s*Modelos?:\s*([^\n]+)/gi;
  const dailyWordPattern = String.raw`(?:dia|diaria|di\u00e1ria)`;
  const groupPatterns = [
    groupPattern,
    new RegExp(
      String.raw`(?:^|\n)\s*(?:[-\u2022]\s*)?Grupo\s+([A-Z0-9]+)\s*[:\-\u2013\u2014]\s*R\$\s*([\d.,]+)\s*(?:\/\s*|por\s+)${dailyWordPattern}\.?\s*(?:Exemplos?|Modelos?)\s*:\s*([^\n]+)`,
      "gi",
    ),
  ];
  let match: RegExpExecArray | null;
  for (const currentGroupPattern of groupPatterns) {
    while ((match = currentGroupPattern.exec(source)) !== null) {
      const group = String(match[1] || "").trim().toUpperCase();
      const dailyRate = parsePromptDailyRentalMoney(match[2]);
      const modelLabel = String(match[3] || "").replace(/\.$/, "").trim();
      if (!group || !Number.isFinite(dailyRate || NaN) || !modelLabel) continue;
      if (groupsById.has(group)) continue;
      groupsById.set(group, {
        group,
        dailyRate: dailyRate as number,
        modelLabel,
        aliases: buildPromptDailyRentalModelAliases(modelLabel),
      });
    }
  }

  const addAliasesToGroup = (
    groupId: string,
    terms: string[],
    sourceType: "mapping" | "off_table",
  ) => {
    const group = groupsById.get(String(groupId || "").trim().toUpperCase());
    if (!group) return;
    for (const term of terms) {
      addPromptDailyRentalAlias(group.aliases, term, sourceType);
    }
  };

  const mappingPattern = /[-•]\s*([^=\n]+?)\s*=>\s*Grupo\s+([A-Z0-9]+)/gi;
  while ((match = mappingPattern.exec(source)) !== null) {
    addAliasesToGroup(match[2], splitPromptDailyRentalTerms(match[1]), "mapping");
  }

  for (const line of source.split("\n")) {
    const groupMatch = line.match(/\bGrupo\s+([A-Z0-9]+)\b/i);
    if (!groupMatch || !/\bSe\s+o\s+cliente\s+pedir\b/i.test(line)) continue;
    const termsMatch = line.match(/\bSe\s+o\s+cliente\s+pedir\s+(.+?)(?:\s+fora\s+da\s+tabela|[.;]|$)/i);
    if (!termsMatch) continue;
    addAliasesToGroup(groupMatch[1], splitPromptDailyRentalTerms(termsMatch[1]), "off_table");
  }

  return Array.from(groupsById.values());
}

function promptDailyRentalContainsTerm(normalizedText: string, normalizedTerm: string): boolean {
  if (!normalizedText || !normalizedTerm || normalizedTerm.length < 2) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(normalizedText);
}

function selectPromptDailyRentalGroup(
  message: unknown,
  groups: PromptDailyRentalGroup[],
): PromptDailyRentalSelection | null {
  const rawMessage = String(message || "");
  const normalizedMessage = normalizePromptDailyRentalText(rawMessage);
  if (!normalizedMessage || groups.length === 0) return null;

  const explicitGroup = rawMessage.match(/\bgrupo\s+([A-Z0-9]+)\b/i);
  if (explicitGroup) {
    const group = groups.find((item) => item.group === explicitGroup[1].toUpperCase());
    if (group) {
      return { group, alias: `grupo ${group.group}`, source: "explicit_group", score: 9999 };
    }
  }

  const leadingGroupToken = rawMessage.match(/^\s*([A-Z0-9]+)(?:\s+|[,;:.\-)\]]+\s*|$)(.*)$/i);
  if (leadingGroupToken) {
    const group = groups.find((item) => item.group === leadingGroupToken[1].toUpperCase());
    const remainder = String(leadingGroupToken[2] || "").trim();
    const startsWithRentalDate = /^\d{1,2}\s*[\/.-]\s*\d{1,2}\b/.test(remainder);
    if (group && (!remainder || startsWithRentalDate)) {
      return { group, alias: group.group, source: "explicit_group", score: 9998 };
    }
  }

  const trailingGroupToken = rawMessage.match(/(?:^|[\s,;:.\-)\]])([A-Z0-9]+)\s*$/i);
  if (trailingGroupToken) {
    const group = groups.find((item) => item.group === trailingGroupToken[1].toUpperCase());
    const withoutTrailingToken = rawMessage.slice(0, trailingGroupToken.index).trim();
    const hasCompleteRentalPeriod = parsePromptDailyRentalDateTimes(withoutTrailingToken).filter((item) => item.hasTime).length >= 2;
    if (group && withoutTrailingToken && hasCompleteRentalPeriod) {
      return { group, alias: group.group, source: "explicit_group", score: 9997 };
    }
  }

  let best: PromptDailyRentalSelection | null = null;
  for (const group of groups) {
    for (const alias of group.aliases) {
      const normalizedAlias = normalizePromptDailyRentalText(alias.value);
      if (!promptDailyRentalContainsTerm(normalizedMessage, normalizedAlias)) continue;
      const sourceWeight = alias.source === "model" ? 1000 : alias.source === "mapping" ? 500 : 300;
      const score = sourceWeight + normalizedAlias.length;
      if (!best || score > best.score) {
        best = { group, alias: alias.value, source: alias.source, score };
      }
    }
  }
  return best;
}

function hasPromptDailyRentalDateSignal(message: unknown, now = new Date()): boolean {
  return parsePromptDailyRentalDateTimes(message, now).length > 0;
}

function hasPromptDailyRentalCompletePeriod(message: unknown, now = new Date()): boolean {
  return parsePromptDailyRentalDateTimes(message, now).filter((item) => item.hasTime).length >= 2;
}

function getPromptDailyRentalHistoryText(entry: PromptDailyRentalHistoryEntry): string {
  return String(entry?.text ?? entry?.content ?? "").trim();
}

function isPromptDailyRentalCustomerHistory(entry: PromptDailyRentalHistoryEntry): boolean {
  if (entry?.fromMe === true || entry?.isFromAgent === true) return false;
  if (String(entry?.role || "").toLowerCase() === "assistant") return false;
  return true;
}

function buildPromptDailyRentalMessageCandidates(params: {
  message: unknown;
  history?: PromptDailyRentalHistoryEntry[];
  groups: PromptDailyRentalGroup[];
  now: Date;
}): string[] {
  const currentMessage = String(params.message || "").trim();
  if (!currentMessage) return [];

  const candidates = [currentMessage];
  const currentHasGroup = selectPromptDailyRentalGroup(currentMessage, params.groups) !== null;
  const currentHasDate = hasPromptDailyRentalDateSignal(currentMessage, params.now);
  if (!currentHasGroup && !currentHasDate) return candidates;

  const recentCustomerMessages = (params.history || [])
    .filter(isPromptDailyRentalCustomerHistory)
    .map(getPromptDailyRentalHistoryText)
    .filter(Boolean)
    .slice(-4);

  if (recentCustomerMessages.length > 0) {
    const recentThenCurrent = [...recentCustomerMessages, currentMessage].join("\n").trim();
    const currentThenRecent = [currentMessage, ...recentCustomerMessages].join("\n").trim();
    for (const combined of [recentThenCurrent, currentThenRecent]) {
      if (combined && combined !== currentMessage && !candidates.includes(combined)) {
        candidates.push(combined);
      }
    }
  }

  return candidates;
}

export function parsePromptDailyRentalDateTimes(message: unknown, now = new Date()): PromptDailyRentalDateTime[] {
  const text = String(message || "");
  const currentYear = now.getFullYear();
  const items: PromptDailyRentalDateTime[] = [];
  const pattern =
    /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?(?:\s*(?:as|às|a|,|-)?\s*(\d{1,2})(?:(?::|h)(\d{2}))?\s*h?)?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const rawYear = match[3] ? Number(match[3]) : currentYear;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hasTime = match[4] !== undefined && match[4] !== "";
    const hour = hasTime ? Number(match[4]) : 0;
    const minute = hasTime && match[5] ? Number(match[5]) : 0;
    if (
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (Number.isNaN(date.getTime())) continue;
    items.push({ date, raw: match[0], hasTime });
  }
  return items;
}

function formatPromptDailyRentalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} as ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function extractPromptDailyRentalFee(prompt: unknown): number {
  const source = String(prompt || "");
  const feeMatch = source.match(/taxa\s+de\s+lavagem(?:\s+fixa)?\s*[:=-]?\s*R\$\s*([\d.,]+)/i);
  const fee = feeMatch ? parsePromptDailyRentalMoney(feeMatch[1]) : null;
  return Number.isFinite(fee || NaN) ? Math.max(0, fee as number) : 0;
}

function extractPromptDailyRentalCompany(prompt: unknown): string | null {
  const source = String(prompt || "").replace(/\r\n/g, "\n");
  const patterns = [
    /consultor(?:a)?\s+virtual\s+d[ao]\s+([^\n.]+?)(?:\s+em\b|[.\n])/i,
    /orcamento\s+([A-Z0-9][^\n:]{2,80})\s*:/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const raw = String(match?.[1] || "").trim();
    if (!raw) continue;
    const words = raw
      .replace(/\s+/g, " ")
      .split(" ")
      .map((word) => {
        const normalized = normalizePromptDailyRentalText(word);
        if (["a", "e", "de", "da", "do", "das", "dos"].includes(normalized)) return normalized;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    return words.join(" ").trim();
  }
  return null;
}

function shouldBuildPromptDailyRentalGroupList(message: unknown): boolean {
  const normalizedMessage = normalizePromptDailyRentalText(message);
  if (!normalizedMessage) return false;

  const exactListRequests = new Set([
    "1",
    "um",
    "opcao 1",
    "opcao um",
    "fazer orcamento",
    "fazer um orcamento",
    "quero orcamento",
    "quero fazer orcamento",
    "quero um orcamento",
  ]);
  if (exactListRequests.has(normalizedMessage)) return true;

  const asksForList =
    /\b(grupos?|modelos?|tabela|valores?|precos?|preco|diarias?|orcamento|orcamentos|orc[ao]r|cotacao|cotar)\b/.test(
      normalizedMessage,
    );
  if (!asksForList) return false;

  return /\b(carros?|veiculos?|locacao|locar|alugar|aluguel|diaria|reserva|grupo|modelo|orcamento|orcamentos)\b/.test(
    normalizedMessage,
  );
}

export function buildPromptDailyRentalGroupList(params: {
  prompt: unknown;
  message: unknown;
}): PromptDailyRentalGroupListResult | null {
  const groups = extractPromptDailyRentalGroups(params.prompt);
  if (groups.length === 0) return null;
  if (selectPromptDailyRentalGroup(params.message, groups)) return null;
  const missingGroupForCompletePeriod = hasPromptDailyRentalCompletePeriod(params.message);
  if (!shouldBuildPromptDailyRentalGroupList(params.message) && !missingGroupForCompletePeriod) return null;

  const fee = extractPromptDailyRentalFee(params.prompt);
  const groupLines = groups.map((group) => `Grupo ${group.group}: ${formatPromptDailyRentalMoney(group.dailyRate)}/dia - ${group.modelLabel}`);
  const splitAt = Math.max(1, Math.ceil(groupLines.length / 2));
  const firstBubbleLines = missingGroupForCompletePeriod
    ? ["Consegui identificar retirada e devolucao, mas falta o grupo do carro para calcular certo.", "Valores por grupo:"]
    : ["Valores por grupo:"];
  const firstBubble = [...firstBubbleLines, ...groupLines.slice(0, splitAt)].join("\n");
  const secondBubbleLines = groupLines.slice(splitAt);
  if (fee > 0) {
    secondBubbleLines.push(`Taxa de lavagem: ${formatPromptDailyRentalMoney(fee)} por orcamento.`);
  }
  const thirdBubble = missingGroupForCompletePeriod
    ? "Qual grupo voce quer? Pode responder so com A, B, C, D, G ou H."
    : "Para calcular o total, me envie o grupo, data e horario de retirada e devolucao.";

  return {
    text: [firstBubble, secondBubbleLines.join("\n"), thirdBubble].filter((part) => part.trim()).join("\n[BOLHA]\n"),
    reason: missingGroupForCompletePeriod
      ? "prompt_daily_rental_group_list:missing_group_for_complete_period"
      : "prompt_daily_rental_group_list",
    groups,
    fee,
  };
}

export function buildPromptDailyRentalQuote(params: {
  prompt: unknown;
  message: unknown;
  now?: Date;
  history?: PromptDailyRentalHistoryEntry[];
}): PromptDailyRentalQuoteResult | null {
  const groups = extractPromptDailyRentalGroups(params.prompt);
  if (groups.length === 0) return null;

  const now = params.now || new Date();
  const candidates = buildPromptDailyRentalMessageCandidates({
    message: params.message,
    history: params.history,
    groups,
    now,
  });

  for (const candidate of candidates) {
    const selection = selectPromptDailyRentalGroup(candidate, groups);
    if (!selection) continue;

    const dates = parsePromptDailyRentalDateTimes(candidate, now);
    if (dates.length < 2 || !dates[0].hasTime || !dates[1].hasTime) continue;
    const [start, end] = dates;
    const hours = (end.date.getTime() - start.date.getTime()) / 36e5;
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const days = Math.max(1, Math.ceil(hours / 24));
    const subtotal = selection.group.dailyRate * days;
    const fee = extractPromptDailyRentalFee(params.prompt);
    const total = subtotal + fee;
    const company = extractPromptDailyRentalCompany(params.prompt);
    const companyLabel = company ? ` ${company}` : "";
    const dailyRate = formatPromptDailyRentalMoney(selection.group.dailyRate);
    const dayLabel = `${days} diaria${days === 1 ? "" : "s"}`;

    const lines = [
      `Orcamento${companyLabel}:`,
      `Grupo: ${selection.group.group} - ${selection.group.modelLabel}`,
      `Retirada: ${formatPromptDailyRentalDateTime(start.date)}`,
      `Devolucao: ${formatPromptDailyRentalDateTime(end.date)}`,
      `Diarias: ${dayLabel}`,
      `Valor da diaria: ${dailyRate}`,
      `Subtotal: ${formatPromptDailyRentalMoney(subtotal)} (${days} x ${dailyRate})`,
    ];

    if (fee > 0) {
      lines.push(`Taxa de lavagem: ${formatPromptDailyRentalMoney(fee)}`);
    }

    lines.push(
      `Total: ${formatPromptDailyRentalMoney(total)}`,
      "Quer seguir com a reserva?",
    );

    return {
      text: lines.join("\n"),
      reason: `prompt_daily_rental_quote:${selection.source}:${normalizePromptDailyRentalText(selection.alias)}`,
      group: selection.group,
      days,
      hours,
      subtotal,
      fee,
      total,
    };
  }

  return null;
}
