export type AutomatedSendOrigin = "user_follow_up" | "ai_agent";

export function resolveAutomatedSendOrigin(source?: string | null): AutomatedSendOrigin {
  const normalized = String(source || "").trim();

  if (
    normalized === "followup" ||
    normalized === "userFollowUpService" ||
    normalized === "user_follow_up"
  ) {
    return "user_follow_up";
  }

  return "ai_agent";
}
