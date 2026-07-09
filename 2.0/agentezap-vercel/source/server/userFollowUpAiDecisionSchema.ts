import { z } from "zod";

export const userFollowUpAiDecisionSchema = z.object({
  action: z.enum(["send", "wait", "abort", "schedule"]),
  reason: z.string().max(600).optional().default("Decisao estruturada do follow-up"),
  message: z.string().max(1800).optional(),
  context: z.string().max(1000).optional(),
  strategy: z.string().max(1000).optional(),
  scheduleDate: z.string().max(80).optional(),
}).passthrough();

export type UserFollowUpAiDecision = z.infer<typeof userFollowUpAiDecisionSchema>;

export function normalizeUserFollowUpAiDecisionPayload(payload: unknown): {
  ok: true;
  decision: UserFollowUpAiDecision;
} | {
  ok: false;
  reason: string;
} {
  const parsed = userFollowUpAiDecisionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "Fallback tecnico: JSON fora do contrato da IA",
    };
  }

  return {
    ok: true,
    decision: parsed.data,
  };
}

