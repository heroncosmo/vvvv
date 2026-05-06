import { normalizeSelectedWeekdays } from "./statusRecurrence";

type FollowUpAction = "daily" | "weekdays";

export interface StatusNowFollowUpInput {
  continueAutomationAfterNow?: boolean;
  followUpAction?: string | null;
  followUpScheduledFor?: string | null;
  followUpSelectedWeekdays?: Array<number | null | undefined> | null;
}

export interface ResolvedStatusNowFollowUp {
  action: FollowUpAction;
  scheduledFor: string;
  selectedWeekdays: number[];
}

export function resolveStatusNowFollowUp(
  input: StatusNowFollowUpInput,
): ResolvedStatusNowFollowUp | null {
  if (!input.continueAutomationAfterNow) {
    return null;
  }

  const action =
    input.followUpAction === "weekdays"
      ? "weekdays"
      : input.followUpAction === "daily"
        ? "daily"
        : null;
  if (!action) {
    return null;
  }

  const scheduledFor = String(input.followUpScheduledFor || "").trim();
  if (!scheduledFor) {
    throw new Error("Defina quando a rotina deve continuar depois do envio imediato");
  }

  const parsedScheduledFor = new Date(scheduledFor);
  if (Number.isNaN(parsedScheduledFor.getTime())) {
    throw new Error("Horario invalido para continuar no automatico");
  }

  const selectedWeekdays =
    action === "weekdays" ? normalizeSelectedWeekdays(input.followUpSelectedWeekdays) : [];
  if (action === "weekdays" && selectedWeekdays.length === 0) {
    throw new Error("Escolha ao menos um dia para continuar no automatico");
  }

  return {
    action,
    scheduledFor: parsedScheduledFor.toISOString(),
    selectedWeekdays,
  };
}
