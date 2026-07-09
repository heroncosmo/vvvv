import {
  clampScore,
  extractFirstJsonObject,
  trimText,
} from "./leadIntelligenceHelpers";

export type Agendamento3ExtractionDecision = {
  hasScheduledConversation: boolean;
  status: "scheduled" | "not_scheduled" | "cancelled";
  action: "book" | "reschedule" | "cancel" | "none";
  agreedSchedule: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  serviceName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  summary: string;
  evidence: string[];
  confidence: number;
};

function normalizeDateValue(value: unknown): string | null {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeTimeValue(value: unknown): string | null {
  const text = String(value || "").trim();
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function normalizeAction(value: unknown): "book" | "reschedule" | "cancel" | "none" {
  const text = String(value || "").trim().toLowerCase();
  if (text === "reschedule") return "reschedule";
  return text === "book" || text === "cancel" ? text : "none";
}

function normalizeStatus(value: unknown): "scheduled" | "not_scheduled" | "cancelled" {
  const text = String(value || "").trim().toLowerCase();
  if (text === "scheduled" || text === "cancelled") return text;
  return "not_scheduled";
}

export function parseAgendamento3Extraction(rawText: string): Agendamento3ExtractionDecision {
  const parsed = JSON.parse(extractFirstJsonObject(rawText));
  const status = normalizeStatus(parsed.status);
  const confidence = clampScore(Number(parsed.confidence), 0);
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.map((item: unknown) => trimText(item, 180)).filter(Boolean).slice(0, 6)
    : [];

  return {
    hasScheduledConversation: Boolean(parsed.hasScheduledConversation) && status === "scheduled",
    status,
    action: normalizeAction(parsed.action),
    agreedSchedule: trimText(parsed.agreedSchedule, 220) || null,
    scheduledDate: normalizeDateValue(parsed.scheduledDate),
    scheduledTime: normalizeTimeValue(parsed.scheduledTime),
    serviceName: trimText(parsed.serviceName, 160) || null,
    clientName: trimText(parsed.clientName, 120) || null,
    clientPhone: trimText(parsed.clientPhone, 60) || null,
    summary: trimText(parsed.summary, 260) || "Analise de agendamento sem resumo.",
    evidence,
    confidence,
  };
}
