const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const GREETING_PLACEHOLDER_PATTERN = /\[(?:saudacao|sauda(?:c|\u00e7)(?:a|\u00e3)o|cumprimento)\]/gi;

function getBrazilHour(date: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: BRAZIL_TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hourText = parts.find((part) => part.type === "hour")?.value;
    const hour = Number(hourText);
    if (Number.isFinite(hour)) return hour % 24;
  } catch (_error) {
    // Fall back to the runtime hour if Intl/timezone data is unavailable.
  }
  return date.getHours();
}

export function resolveBroadcastGreetingForDate(date: Date = new Date()): string {
  const hour = getBrazilHour(date);
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function applyBroadcastTemplate(
  template: string,
  name?: string | null,
  options?: { now?: Date },
): string {
  const safeName = String(name || "Cliente").trim() || "Cliente";
  return String(template || "")
    .replace(/\[nome\]/gi, safeName)
    .replace(GREETING_PLACEHOLDER_PATTERN, resolveBroadcastGreetingForDate(options?.now));
}
