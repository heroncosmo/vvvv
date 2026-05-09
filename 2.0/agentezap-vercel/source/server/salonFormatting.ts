export type BreakConfig = {
  enabled: boolean;
  start: string;
  end: string;
};

export function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

export function getBrazilToday(): string {
  const now = getBrazilNow();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDatePtBr(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function isIsoDateOnly(value: string): boolean {
  return value.length >= 10
    && value[4] === "-"
    && value[7] === "-"
    && !value.includes("/");
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseSlashDate(trimmed: string): string | null {
  const baseValue = trimmed.includes("T")
    ? trimmed.split("T")[0] || trimmed
    : trimmed.split(" ")[0] || trimmed;

  const parts = baseValue.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = parts.length === 3 ? Number(parts[2]) : getBrazilNow().getFullYear();

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const normalizedYear = year < 100 ? 2000 + year : year;
  return buildIsoDate(normalizedYear, month, day);
}

function parseDashDate(trimmed: string): string | null {
  const baseValue = trimmed.includes("T")
    ? trimmed.split("T")[0] || trimmed
    : trimmed.split(" ")[0] || trimmed;

  const parts = baseValue.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 3 || parts[0].length === 4) {
    return null;
  }

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const normalizedYear = year < 100 ? 2000 + year : year;
  return buildIsoDate(normalizedYear, month, day);
}

export function normalizeSalonDateValue(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isIsoDateOnly(trimmed)) {
    return trimmed.slice(0, 10);
  }

  if (trimmed.includes("/")) {
    const slashDate = parseSlashDate(trimmed);
    if (slashDate) {
      return slashDate;
    }
  }

  if (trimmed.includes("-")) {
    const dashDate = parseDashDate(trimmed);
    if (dashDate) {
      return dashDate;
    }
  }

  const normalizedInput = trimmed.includes(" ") && !trimmed.includes("T")
    ? trimmed.replace(" ", "T")
    : trimmed;

  const parsed = new Date(normalizedInput);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return buildIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function normalizeSalonTimeValue(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const afterT = trimmed.includes("T")
    ? trimmed.split("T")[1] || ""
    : trimmed;

  let timePortion = afterT.toLowerCase()
    .replace(" horas", "h")
    .replace(" hora", "h")
    .replace(" hrs", "h")
    .replace(" hr", "h")
    .replace(" hs", "h")
    .replace("h ", "h")
    .trim();

  if (timePortion.includes(" ")) {
    timePortion = timePortion.split(" ")[0] || timePortion;
  }

  if (timePortion.includes("h")) {
    const [rawHour, rawMinute] = timePortion.split("h");
    const hour = Number(rawHour);
    const minute = rawMinute === undefined || rawMinute === "" ? 0 : Number(rawMinute.slice(0, 2));

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  if (!timePortion.includes(":") && timePortion.length === 4) {
    const hour = Number(timePortion.slice(0, 2));
    const minute = Number(timePortion.slice(2));

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  if (!timePortion.includes(":") && timePortion.length <= 2) {
    const hour = Number(timePortion);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return null;
    }

    return `${hour.toString().padStart(2, "0")}:00`;
  }

  const parts = timePortion.split(":");
  if (parts.length < 2) {
    return null;
  }

  const hour = Number(parts[0]);
  const minute = Number((parts[1] || "").slice(0, 2));

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function createLocalDateFromIso(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatSalonContextualDate(dateStr: string, referenceDate?: string): string {
  const normalizedDate = normalizeSalonDateValue(dateStr);
  if (!normalizedDate) {
    return dateStr;
  }

  const referenceIso = normalizeSalonDateValue(referenceDate) || getBrazilToday();
  const targetDate = createLocalDateFromIso(normalizedDate);
  const baseDate = createLocalDateFromIso(referenceIso);
  const diffDays = Math.round((targetDate.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000));
  const absoluteDate = formatDatePtBr(normalizedDate);
  const weekday = targetDate.toLocaleDateString("pt-BR", { weekday: "long" });

  if (diffDays === 0) {
    return `hoje (${weekday}, ${absoluteDate})`;
  }

  if (diffDays === 1) {
    return `amanhã (${weekday}, ${absoluteDate})`;
  }

  if (diffDays === -1) {
    return `ontem (${weekday}, ${absoluteDate})`;
  }

  return `${weekday}, ${absoluteDate}`;
}

export function buildSlotDisplay(slots: string[]): string[] {
  if (slots.length <= 8) {
    return slots;
  }

  const selected: string[] = [];
  const step = Math.max(1, Math.floor((slots.length - 1) / 7));

  for (let index = 0; index < slots.length && selected.length < 8; index += step) {
    const candidate = slots[index];
    if (!selected.includes(candidate)) {
      selected.push(candidate);
    }
  }

  const lastSlot = slots[slots.length - 1];
  if (!selected.includes(lastSlot)) {
    if (selected.length >= 8) {
      selected[selected.length - 1] = lastSlot;
    } else {
      selected.push(lastSlot);
    }
  }

  return selected;
}

export function buildDeterministicSlotSuggestionMessage(options: {
  date: string;
  allowedSlots: string[];
  serviceName?: string;
  breakConfig?: BreakConfig;
}): string {
  const contextualDate = formatSalonContextualDate(options.date);
  const displayedSlots = buildSlotDisplay(options.allowedSlots);
  const label = options.serviceName
    ? `para ${options.serviceName}`
    : "para esse atendimento";

  const lines = [
    `Para ${contextualDate}, tenho estes horários disponíveis ${label}:`,
    displayedSlots.join(", "),
  ];

  if (options.breakConfig?.enabled) {
    lines.push(`No almoço (${options.breakConfig.start} às ${options.breakConfig.end}) não fazemos atendimentos.`);
  }

  lines.push("Qual horário funciona melhor para você?");
  return lines.join("\n");
}
