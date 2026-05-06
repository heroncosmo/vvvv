import { z } from "zod";

import {
  clampScore,
  extractFirstJsonObject,
  trimText,
} from "./leadIntelligenceHelpers";

export const agendamento2InsightSchema = z.object({
  hasScheduledConversation: z.boolean(),
  status: z.enum(["scheduled", "not_scheduled", "cancelled"]),
  agreedSchedule: z.string().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  scheduledTime: z.string().nullable().optional(),
  summary: z.string().min(1),
  evidence: z.array(z.string()).max(6).default([]),
  followUpQuestionSuggestion: z.string().nullable().optional(),
  confidence: z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, z.number().min(0).max(100)),
});

export type Agendamento2InsightPayload = z.infer<typeof agendamento2InsightSchema>;

export function parseAgendamento2Insight(raw: string) {
  const jsonText = extractFirstJsonObject(String(raw || ""));
  const parsed = agendamento2InsightSchema.parse(JSON.parse(jsonText));

  return {
    hasScheduledConversation:
      parsed.status === "scheduled" ? true : parsed.hasScheduledConversation,
    status: parsed.status,
    agreedSchedule: trimText(parsed.agreedSchedule || "", 180) || null,
    scheduledDate: trimText(parsed.scheduledDate || "", 20) || null,
    scheduledTime: trimText(parsed.scheduledTime || "", 10) || null,
    summary: trimText(parsed.summary, 260),
    evidence: parsed.evidence
      .map((entry) => trimText(entry, 140))
      .filter(Boolean)
      .slice(0, 4),
    followUpQuestionSuggestion:
      trimText(parsed.followUpQuestionSuggestion || "", 160) || null,
    confidence: clampScore(parsed.confidence),
  };
}
