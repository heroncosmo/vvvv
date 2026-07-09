import { z } from "zod";

import {
  clampScore,
  extractFirstJsonObject,
  trimText,
} from "./leadIntelligenceHelpers";

export const courseSchedulingInsightSchema = z.object({
  hasScheduledConversation: z.boolean(),
  status: z.enum(["scheduled", "not_scheduled", "cancelled"]),
  agreedSchedule: z.string().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  scheduledTime: z.string().nullable().optional(),
  summary: z.string().min(1),
  evidence: z.array(z.string()).max(6).default([]),
  followUpQuestionSuggestion: z.string().nullable().optional(),
  confidence: z.coerce.number().min(0).max(100),
});

export type CourseSchedulingInsightPayload = z.infer<typeof courseSchedulingInsightSchema>;

export function parseCourseSchedulingInsight(raw: string) {
  const jsonText = extractFirstJsonObject(String(raw || ""));
  const parsed = courseSchedulingInsightSchema.parse(JSON.parse(jsonText));

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
