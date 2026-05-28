import { getBrazilTimeParts } from "./greetingTime";

export const BRAZIL_TEMPORAL_TIME_ZONE = "America/Sao_Paulo";

const WEEKDAY_LABELS = [
  "domingo",
  "segunda-feira",
  "ter\u00e7a-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "s\u00e1bado",
] as const;

export interface BrazilTemporalDay {
  dateKey: string;
  datePtBr: string;
  weekday: string;
}

export interface BrazilTemporalContext {
  timeZone: string;
  nowIso: string;
  dateKey: string;
  datePtBr: string;
  time: string;
  weekday: string;
  today: BrazilTemporalDay;
  tomorrow: BrazilTemporalDay;
  dayAfterTomorrow: BrazilTemporalDay;
  upcomingDays: BrazilTemporalDay[];
}

export interface BrazilTemporalToolResult {
  toolName: "resolveBrazilTemporalContext";
  source: "runtime";
  timeZone: string;
  nowIso: string;
  nowBrazil: {
    dateKey: string;
    datePtBr: string;
    weekday: string;
    time: string;
  };
  relativeDates: {
    today: BrazilTemporalDay;
    tomorrow: BrazilTemporalDay;
    dayAfterTomorrow: BrazilTemporalDay;
  };
  upcomingDays: BrazilTemporalDay[];
  dateMentions: Array<{
    raw: string;
    dateKey: string;
    datePtBr: string;
    weekday: string;
    relation: string;
    offsetDays: number | null;
    isToday: boolean;
    isTomorrow: boolean;
    isDayAfterTomorrow: boolean;
  }>;
  constraints: string[];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildDayFromUtcNoon(baseUtcNoon: number, offsetDays: number): BrazilTemporalDay {
  const date = new Date(baseUtcNoon + offsetDays * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    dateKey: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
    datePtBr: `${pad2(day)}/${pad2(month)}/${String(year).padStart(4, "0")}`,
    weekday: WEEKDAY_LABELS[date.getUTCDay()],
  };
}

export function getBrazilTemporalContext(now: Date = new Date()): BrazilTemporalContext {
  const parts = getBrazilTimeParts(now);
  const baseUtcNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const today = buildDayFromUtcNoon(baseUtcNoon, 0);
  const tomorrow = buildDayFromUtcNoon(baseUtcNoon, 1);
  const dayAfterTomorrow = buildDayFromUtcNoon(baseUtcNoon, 2);
  const upcomingDays = Array.from({ length: 7 }, (_, index) => buildDayFromUtcNoon(baseUtcNoon, index));
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}`;

  return {
    timeZone: BRAZIL_TEMPORAL_TIME_ZONE,
    nowIso: now.toISOString(),
    dateKey: today.dateKey,
    datePtBr: today.datePtBr,
    time,
    weekday: today.weekday,
    today,
    tomorrow,
    dayAfterTomorrow,
    upcomingDays,
  };
}

export function buildBrazilTemporalPromptBlock(now: Date = new Date()): string {
  const context = getBrazilTemporalContext(now);

  return [
    "=== DATA E HORA OFICIAL DO BRASIL PARA ESTA RESPOSTA ===",
    `Fuso oficial: ${context.timeZone} (horario de Brasilia).`,
    `Agora no Brasil: ${context.weekday}, ${context.datePtBr}, ${context.time}.`,
    "Mapa obrigatorio de datas relativas:",
    `- hoje = ${context.today.datePtBr} (${context.today.weekday})`,
    `- amanha/amanh\u00e3 = ${context.tomorrow.datePtBr} (${context.tomorrow.weekday})`,
    `- depois de amanha/depois de amanh\u00e3 = ${context.dayAfterTomorrow.datePtBr} (${context.dayAfterTomorrow.weekday})`,
    "Calendario dos proximos 7 dias:",
    ...context.upcomingDays.map((day, index) => {
      const relation = index === 0 ? "hoje" : index === 1 ? "amanha/amanh\u00e3" : index === 2 ? "depois de amanha/depois de amanh\u00e3" : `em ${index} dias`;
      return `- ${day.datePtBr} (${day.weekday}) = ${relation}`;
    }),
    "Regras obrigatorias:",
    "- Use este mapa para interpretar hoje, amanha/amanh\u00e3, depois de amanha/depois de amanh\u00e3, mais tarde e dias da semana.",
    "- Nao use memoria interna do modelo para calcular data atual, dia da semana ou horario.",
    "- Se uma data absoluta do prompt ou historico nao for igual ao mapa de amanha, nao chame essa data de amanha.",
    "- Para agenda, disponibilidade, evento, lembrete ou confirmacao de horario, confira a data e o dia da semana por este bloco antes de responder.",
    "=== FIM DA DATA E HORA OFICIAL ===",
  ].join("\n");
}

type BrazilTemporalMention = BrazilTemporalDay & {
  raw: string;
  offsetDays: number | null;
  relation: string;
};

function normalizeFold(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseDateKey(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

function offsetDaysFromContext(context: BrazilTemporalContext, dateKey: string): number | null {
  const base = parseDateKey(context.dateKey);
  const target = parseDateKey(dateKey);
  if (!Number.isFinite(base) || !Number.isFinite(target)) return null;
  return Math.round((target - base) / (24 * 60 * 60 * 1000));
}

function relationForOffset(offsetDays: number | null): string {
  if (offsetDays === 0) return "hoje";
  if (offsetDays === 1) return "amanh\u00e3";
  if (offsetDays === 2) return "depois de amanh\u00e3";
  if (typeof offsetDays === "number" && offsetDays > 2) return `em ${offsetDays} dias`;
  if (offsetDays === -1) return "ontem";
  if (typeof offsetDays === "number" && offsetDays < -1) return `h\u00e1 ${Math.abs(offsetDays)} dias`;
  return "data informada";
}

function buildDayFromDateParts(day: number, month: number, year: number): BrazilTemporalDay | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    dateKey: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
    datePtBr: `${pad2(day)}/${pad2(month)}/${String(year).padStart(4, "0")}`,
    weekday: WEEKDAY_LABELS[date.getUTCDay()],
  };
}

function uniqueMentions(mentions: BrazilTemporalMention[]): BrazilTemporalMention[] {
  const seen = new Set<string>();
  const unique: BrazilTemporalMention[] = [];
  for (const mention of mentions) {
    if (seen.has(mention.dateKey)) continue;
    seen.add(mention.dateKey);
    unique.push(mention);
  }
  return unique;
}

export function extractBrazilTemporalDateMentions(
  text: string,
  now: Date = new Date(),
): BrazilTemporalMention[] {
  const context = getBrazilTemporalContext(now);
  const mentions: BrazilTemporalMention[] = [];
  const pattern = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(String(text || ""))) !== null) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const yearRaw = match[3];
    const year = yearRaw
      ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw)
      : Number(context.dateKey.slice(0, 4));
    const temporalDay = buildDayFromDateParts(day, month, year);
    if (!temporalDay) continue;
    const offsetDays = offsetDaysFromContext(context, temporalDay.dateKey);
    mentions.push({
      ...temporalDay,
      raw: match[0],
      offsetDays,
      relation: relationForOffset(offsetDays),
    });
  }

  return uniqueMentions(mentions);
}

export function shouldUseBrazilTemporalToolContract(referenceText: string): boolean {
  const raw = String(referenceText || "");
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(raw)) return true;
  if (/\b\d{1,2}\s*h(?:\d{2})?\b/i.test(raw)) return true;

  const folded = normalizeFold(raw);
  return /\b(hoje|amanha|depois\s+de\s+amanha|ontem|agora|mais\s+tarde|data|horario|hora|agenda|agendar|agendamento|marcar|remarcar|evento|disponibilidade|disponivel|lembrete|compromisso|peneira|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(folded);
}

export function buildBrazilTemporalToolResult(params: {
  referenceText?: string;
  now?: Date;
} = {}): BrazilTemporalToolResult {
  const now = params.now || new Date();
  const context = getBrazilTemporalContext(now);
  const dateMentions = extractBrazilTemporalDateMentions(params.referenceText || "", now).map((mention) => ({
    raw: mention.raw,
    dateKey: mention.dateKey,
    datePtBr: mention.datePtBr,
    weekday: mention.weekday,
    relation: mention.relation,
    offsetDays: mention.offsetDays,
    isToday: mention.dateKey === context.today.dateKey,
    isTomorrow: mention.dateKey === context.tomorrow.dateKey,
    isDayAfterTomorrow: mention.dateKey === context.dayAfterTomorrow.dateKey,
  }));

  return {
    toolName: "resolveBrazilTemporalContext",
    source: "runtime",
    timeZone: context.timeZone,
    nowIso: context.nowIso,
    nowBrazil: {
      dateKey: context.dateKey,
      datePtBr: context.datePtBr,
      weekday: context.weekday,
      time: context.time,
    },
    relativeDates: {
      today: context.today,
      tomorrow: context.tomorrow,
      dayAfterTomorrow: context.dayAfterTomorrow,
    },
    upcomingDays: context.upcomingDays,
    dateMentions,
    constraints: [
      "Use America/Sao_Paulo as the only current time source.",
      "Never call an absolute date 'amanha' unless it equals relativeDates.tomorrow.dateKey.",
      "Never call an absolute date 'hoje' unless it equals relativeDates.today.dateKey.",
      "For scheduling, availability, event and reminder answers, resolve relative dates with this result before answering.",
      "Do not mention tool, API, SDK, prompt or internal runtime details to the customer.",
    ],
  };
}

export function buildBrazilTemporalToolContractBlock(params: {
  referenceText?: string;
  now?: Date;
} = {}): string {
  const referenceText = String(params.referenceText || "");
  const result = buildBrazilTemporalToolResult({
    referenceText,
    now: params.now,
  });
  const activeSignal = shouldUseBrazilTemporalToolContract(referenceText);

  return [
    "=== CONTRATO TEMPORAL ESTRUTURADO DO MOTOR ===",
    "Ferramenta deterministica: resolveBrazilTemporalContext.",
    activeSignal
      ? "Status: sinal temporal detectado; este resultado e obrigatorio para responder datas/horarios."
      : "Status: resultado preventivo disponivel para qualquer data/horario que apareca na resposta.",
    "Resultado runtime em JSON:",
    JSON.stringify(result, null, 2),
    "Contrato:",
    "- Use o JSON acima como fonte de verdade para hoje, amanha, depois de amanha, dia da semana e horario.",
    "- Se houver conflito entre prompt/historico e este JSON, prevalece este JSON para data/hora atual.",
    "- Nao exponha ao cliente que houve ferramenta, JSON, SDK, API, prompt ou regra interna.",
    "=== FIM DO CONTRATO TEMPORAL ===",
  ].join("\n");
}

function textClaimsTodayForEvent(text: string): boolean {
  const folded = normalizeFold(text);
  return /\b(?:e|eh|sera|fica|acontece|vai ser)\s+\*?hoje\b/.test(folded) || /\bhoje\s*\(/.test(folded);
}

function textClaimsTomorrowForEvent(text: string): boolean {
  const folded = normalizeFold(text);
  return /\b(?:e|eh|sera|fica|acontece|vai ser)\s+\*?amanha\b/.test(folded) || /\bamanha\s+mesmo\b/.test(folded);
}

function mentionConflictsWithRelativeText(mention: BrazilTemporalMention, text: string): boolean {
  const folded = normalizeFold(text);
  const hasToday = /\bhoje\b/.test(folded);
  const hasTomorrow = /\bamanha\b/.test(folded);
  const hasDayAfter = /\bdepois\s+de\s+amanha\b/.test(folded);
  if (hasToday && mention.offsetDays !== 0) return true;
  if (hasDayAfter && mention.offsetDays !== 2) return true;
  if (hasTomorrow && !hasDayAfter && mention.offsetDays !== 1) return true;
  return false;
}

function buildTemporalCorrectionText(
  datesToExplain: BrazilTemporalMention[],
  context: BrazilTemporalContext,
): string {
  const extraDates = uniqueMentions(datesToExplain)
    .filter((mention) => mention.dateKey !== context.today.dateKey && mention.dateKey !== context.tomorrow.dateKey)
    .map((mention) => `O dia ${mention.datePtBr} \u00e9 ${mention.weekday}, ${mention.relation}.`);

  return [
    "Corrigindo a data:",
    `Hoje \u00e9 ${context.today.datePtBr} (${context.today.weekday}).`,
    `Amanh\u00e3 \u00e9 ${context.tomorrow.datePtBr} (${context.tomorrow.weekday}).`,
    ...extraDates,
  ].join("\n");
}

function weekdayStem(weekday: string): string {
  return normalizeFold(weekday).replace(/\s*-\s*feira\b/g, "").trim();
}

function hasWrongWeekdayForRelativeDate(
  text: string,
  relationPattern: RegExp,
  expectedWeekday: string,
): boolean {
  const folded = normalizeFold(text);
  const expectedStem = weekdayStem(expectedWeekday);
  const weekdayStems = WEEKDAY_LABELS.map(weekdayStem);
  let match: RegExpExecArray | null;

  relationPattern.lastIndex = 0;
  while ((match = relationPattern.exec(folded)) !== null) {
    const windowStart = Math.max(0, match.index - 40);
    const windowEnd = Math.min(folded.length, match.index + 140);
    const localWindow = folded.slice(windowStart, windowEnd);

    const mentionedWeekdays = weekdayStems.filter((stem) => new RegExp(`\\b${stem}\\b`).test(localWindow));
    if (mentionedWeekdays.some((stem) => stem !== expectedStem)) {
      return true;
    }

    if (match[0].length === 0) relationPattern.lastIndex += 1;
  }

  return false;
}

function hasRelativeWeekdayConflict(text: string, context: BrazilTemporalContext): boolean {
  return (
    hasWrongWeekdayForRelativeDate(text, /\bhoje\b/g, context.today.weekday) ||
    hasWrongWeekdayForRelativeDate(text, /\bamanha\b/g, context.tomorrow.weekday) ||
    hasWrongWeekdayForRelativeDate(text, /\bdepois\s+de\s+amanha\b/g, context.dayAfterTomorrow.weekday)
  );
}

const WEEKDAY_REPAIR_PATTERNS = [
  { stem: "domingo", pattern: "domingo(?:-feira)?" },
  { stem: "segunda", pattern: "segunda(?:-feira)?" },
  { stem: "terca", pattern: "ter(?:c|\\u00e7)a(?:-feira)?" },
  { stem: "quarta", pattern: "quarta(?:-feira)?" },
  { stem: "quinta", pattern: "quinta(?:-feira)?" },
  { stem: "sexta", pattern: "sexta(?:-feira)?" },
  { stem: "sabado", pattern: "s(?:a|\\u00e1)bado" },
] as const;

const AMANHA_REPAIR_PATTERN = "amanh(?:a|\\u00e3)";
const DEPOIS_DE_AMANHA_REPAIR_PATTERN = `depois\\s+de\\s+${AMANHA_REPAIR_PATTERN}`;
const AMANHA_SEM_DEPOIS_REPAIR_PATTERN = `(?<!depois\\s+de\\s+)${AMANHA_REPAIR_PATTERN}`;

function relativeRepairToken(relationPattern: string): string {
  return `\\b${relationPattern}(?=\\s|[,.;:!?]|$)`;
}

function repairWrongWeekdayForRelativeDate(
  text: string,
  relationPattern: string,
  expectedWeekday: string,
): string {
  const expectedStem = weekdayStem(expectedWeekday);
  let repaired = text;
  const relationToken = relativeRepairToken(relationPattern);

  for (const weekday of WEEKDAY_REPAIR_PATTERNS) {
    if (weekday.stem === expectedStem) continue;

    const afterRelation = new RegExp(`(${relationToken}[^.!?\\n]{0,90}?)\\b${weekday.pattern}\\b`, "gi");
    repaired = repaired.replace(afterRelation, `$1${expectedWeekday}`);

    const beforeRelation = new RegExp(`\\b${weekday.pattern}\\b([^.!?\\n]{0,90}?${relationToken})`, "gi");
    repaired = repaired.replace(beforeRelation, `${expectedWeekday}$1`);
  }

  return repaired;
}

function buildDayFromDateText(rawDate: string, context: BrazilTemporalContext): BrazilTemporalDay | null {
  const match = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(String(rawDate || ""));
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearRaw = match[3];
  const year = yearRaw
    ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw)
    : Number(context.dateKey.slice(0, 4));
  return buildDayFromDateParts(day, month, year);
}

function repairWrongDateForRelativeDate(
  text: string,
  relationPattern: string,
  expectedDay: BrazilTemporalDay,
  context: BrazilTemporalContext,
): string {
  const datePattern = "(\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b)";
  let repaired = text;
  const relationToken = relativeRepairToken(relationPattern);

  const afterRelation = new RegExp(`(${relationToken}[^.!?\\n]{0,120}?)${datePattern}`, "gi");
  repaired = repaired.replace(afterRelation, (full, prefix: string, rawDate: string) => {
    const mentionedDay = buildDayFromDateText(rawDate, context);
    if (!mentionedDay || mentionedDay.dateKey === expectedDay.dateKey) return full;
    return `${prefix}${expectedDay.datePtBr}`;
  });

  const beforeRelation = new RegExp(`${datePattern}([^.!?\\n]{0,120}?${relationToken})`, "gi");
  repaired = repaired.replace(beforeRelation, (full, rawDate: string, suffix: string) => {
    const mentionedDay = buildDayFromDateText(rawDate, context);
    if (!mentionedDay || mentionedDay.dateKey === expectedDay.dateKey) return full;
    return `${expectedDay.datePtBr}${suffix}`;
  });

  return repaired;
}

function repairRelativeWeekdayText(text: string, context: BrazilTemporalContext): string {
  let repaired = text;
  repaired = repairWrongWeekdayForRelativeDate(repaired, "hoje", context.today.weekday);
  repaired = repairWrongWeekdayForRelativeDate(repaired, DEPOIS_DE_AMANHA_REPAIR_PATTERN, context.dayAfterTomorrow.weekday);
  repaired = repairWrongWeekdayForRelativeDate(repaired, AMANHA_SEM_DEPOIS_REPAIR_PATTERN, context.tomorrow.weekday);
  return repaired;
}

function repairRelativeDateText(text: string, context: BrazilTemporalContext): string {
  let repaired = text;
  repaired = repairWrongDateForRelativeDate(repaired, "hoje", context.today, context);
  repaired = repairWrongDateForRelativeDate(repaired, DEPOIS_DE_AMANHA_REPAIR_PATTERN, context.dayAfterTomorrow, context);
  repaired = repairWrongDateForRelativeDate(repaired, AMANHA_SEM_DEPOIS_REPAIR_PATTERN, context.tomorrow, context);
  return repairRelativeWeekdayText(repaired, context);
}

function firstReferenceLine(referenceText: string | undefined): string {
  return String(referenceText || "").split(/\n/)[0] || "";
}

function localWindowAroundRawText(text: string, raw: string, before = 120, after = 160): string {
  const escapedRaw = String(raw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawIndex = String(text || "").search(new RegExp(escapedRaw));
  if (rawIndex < 0) return String(text || "");
  return String(text || "").slice(
    Math.max(0, rawIndex - before),
    Math.min(String(text || "").length, rawIndex + after),
  );
}

function selectReferenceConflictsForRelativeClaim(
  mentions: BrazilTemporalMention[],
  referenceText: string | undefined,
  expectedOffsetDays: number,
): BrazilTemporalMention[] {
  const conflictingMentions = mentions.filter((mention) => mention.offsetDays !== expectedOffsetDays);
  if (conflictingMentions.length <= 1 && mentions.length === 1) {
    return conflictingMentions;
  }

  const fullReference = String(referenceText || "");
  return conflictingMentions.filter((mention) => {
    const localWindow = localWindowAroundRawText(fullReference, mention.raw);
    return mentionConflictsWithRelativeText(mention, localWindow);
  });
}

function hasAbsoluteDateText(text: string): boolean {
  return /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(String(text || ""));
}

function primaryReferenceRequestsTomorrow(primaryReference: string): boolean {
  const folded = normalizeFold(primaryReference);
  return /\bamanha\b/.test(folded) && !/\bdepois\s+de\s+amanha\b/.test(folded);
}

function responseLooksLikeSchedulingOffer(text: string): boolean {
  const folded = normalizeFold(text);
  return /\b(horario|periodo|manha|tarde|pre-agendamento|agendamento|marcar|consulta|atendimento|disponivel|prefere|consegue|vaga)\b/.test(folded);
}

function repairRelativeRelationFromPrimaryReference(
  responseText: string,
  primaryReference: string,
  context: BrazilTemporalContext,
): string {
  if (!primaryReferenceRequestsTomorrow(primaryReference)) return responseText;
  const foldedResponse = normalizeFold(responseText);
  if (!responseLooksLikeSchedulingOffer(responseText)) return responseText;
  if (!/\bhoje\b/.test(foldedResponse) || /\bamanha\b/.test(foldedResponse)) return responseText;

  return responseText.replace(/\bhoje\b(?:\s*\([^)]*\))?/gi, `amanhã (${context.tomorrow.weekday})`);
}

export function enforceBrazilTemporalConsistency(params: {
  responseText: string;
  referenceText?: string;
  now?: Date;
}): string {
  const responseText = String(params.responseText || "").trim();
  if (!responseText) return responseText;

  const now = params.now || new Date();
  const context = getBrazilTemporalContext(now);
  const responseMentions = extractBrazilTemporalDateMentions(responseText, now);
  const referenceMentions = extractBrazilTemporalDateMentions(params.referenceText || "", now);
  const responseConflicts: BrazilTemporalMention[] = [];
  const referenceConflicts: BrazilTemporalMention[] = [];
  const primaryReference = firstReferenceLine(params.referenceText);

  const relationRepairedResponseText = repairRelativeRelationFromPrimaryReference(
    responseText,
    primaryReference,
    context,
  );
  if (relationRepairedResponseText !== responseText) {
    return repairRelativeDateText(relationRepairedResponseText, context);
  }

  for (const mention of responseMentions) {
    const localWindow = localWindowAroundRawText(responseText, mention.raw);
    if (mentionConflictsWithRelativeText(mention, localWindow)) {
      responseConflicts.push(mention);
    }
  }

  if (textClaimsTodayForEvent(responseText)) {
    referenceConflicts.push(
      ...selectReferenceConflictsForRelativeClaim(referenceMentions, params.referenceText, 0),
    );
  }

  if (textClaimsTomorrowForEvent(responseText)) {
    referenceConflicts.push(
      ...selectReferenceConflictsForRelativeClaim(referenceMentions, params.referenceText, 1),
    );
  }

  const uniqueResponseConflicts = uniqueMentions(responseConflicts);
  const uniqueReferenceConflicts = uniqueMentions(referenceConflicts);
  const uniqueConflicts = uniqueMentions([...uniqueResponseConflicts, ...uniqueReferenceConflicts]);
  const relativeWeekdayConflict = hasRelativeWeekdayConflict(responseText, context);
  if (uniqueConflicts.length === 0 && !relativeWeekdayConflict) return responseText;

  const hasPrimaryReference = primaryReference.trim().length > 0;
  const canRepairRelativeDatesInPlace =
    !hasAbsoluteDateText(primaryReference) &&
    uniqueReferenceConflicts.length === 0 &&
    (relativeWeekdayConflict || (hasPrimaryReference && uniqueResponseConflicts.length > 0));

  if (canRepairRelativeDatesInPlace) {
    const repaired = repairRelativeDateText(responseText, context);
    if (repaired !== responseText) return repaired;
  }

  return buildTemporalCorrectionText(uniqueConflicts, context);
}
