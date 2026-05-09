import { alignDateToBusinessWindow, type UserFollowUpScheduleConfig } from "./userFollowUpScheduling";

export const USER_FOLLOWUP_DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

type TimingConfig = {
  intervalsMinutes?: number[] | null;
} | null | undefined;

export type UserFollowUpDecisionWindowState =
  | "awaiting_company_reply"
  | "cooldown_after_company_reply"
  | "eligible_after_company_reply";

export type UserFollowUpAllowedAction = "send" | "wait" | "abort" | "schedule";

type ResetScheduleOptions = {
  randomizeDate?: (date: Date) => Date;
};

export function getConfiguredDelayMinutesForStage(
  config: TimingConfig,
  stage: number,
): number {
  const intervals =
    config?.intervalsMinutes?.filter((value) => Number.isFinite(value) && value > 0) ||
    USER_FOLLOWUP_DEFAULT_INTERVALS;
  const normalizedStage = Math.max(0, Number.isFinite(stage) ? Math.floor(stage) : 0);

  return intervals[Math.min(normalizedStage, intervals.length - 1)] || USER_FOLLOWUP_DEFAULT_INTERVALS[0];
}

export function buildResetFollowUpSchedule(
  config: TimingConfig,
  referenceTime: Date = new Date(),
  options: ResetScheduleOptions = {},
): { followupStage: number; nextFollowupAt: Date; delayMinutes: number } {
  const delayMinutes = getConfiguredDelayMinutesForStage(config, 0);
  const baseTime = Number.isNaN(referenceTime.getTime()) ? new Date() : referenceTime;
  const rawNextDate = new Date(baseTime.getTime() + delayMinutes * 60 * 1000);
  const alignedNextDate = alignDateToBusinessWindow(
    rawNextDate,
    config as UserFollowUpScheduleConfig | null | undefined,
  );
  const nextFollowupAt = options.randomizeDate ? options.randomizeDate(alignedNextDate) : alignedNextDate;

  return {
    followupStage: 0,
    nextFollowupAt,
    delayMinutes,
  };
}

export function buildStageCooldownDeadline(
  config: TimingConfig,
  stage: number,
  referenceTime: Date = new Date(),
): { delayMinutes: number; nextAllowedAt: Date } {
  const delayMinutes = Math.max(1, getConfiguredDelayMinutesForStage(config, stage));
  const baseTime = Number.isNaN(referenceTime.getTime()) ? new Date() : referenceTime;

  return {
    delayMinutes,
    nextAllowedAt: new Date(baseTime.getTime() + delayMinutes * 60 * 1000),
  };
}

export function resolveUserFollowUpDecisionWindow(params: {
  lastMessageWasOurs: boolean;
  minutesSinceOur: number;
  minutesSinceClient: number;
  thresholdMinutes: number;
}): {
  state: UserFollowUpDecisionWindowState;
  authoritativeSilenceMinutes: number;
  thresholdMinutes: number;
  allowedActions: UserFollowUpAllowedAction[];
} {
  const thresholdMinutes = Math.max(
    1,
    Number.isFinite(params.thresholdMinutes) ? Math.floor(params.thresholdMinutes) : 1,
  );
  const minutesSinceOur = Math.max(
    0,
    Number.isFinite(params.minutesSinceOur) ? Math.floor(params.minutesSinceOur) : 0,
  );
  const minutesSinceClient = Math.max(
    0,
    Number.isFinite(params.minutesSinceClient) ? Math.floor(params.minutesSinceClient) : 0,
  );

  if (!params.lastMessageWasOurs) {
    return {
      state: "awaiting_company_reply",
      authoritativeSilenceMinutes: minutesSinceClient,
      thresholdMinutes,
      allowedActions: ["wait"],
    };
  }

  if (minutesSinceOur < thresholdMinutes) {
    return {
      state: "cooldown_after_company_reply",
      authoritativeSilenceMinutes: minutesSinceOur,
      thresholdMinutes,
      allowedActions: ["wait", "abort", "schedule"],
    };
  }

  return {
    state: "eligible_after_company_reply",
    authoritativeSilenceMinutes: minutesSinceOur,
    thresholdMinutes,
    allowedActions: ["send", "abort", "schedule"],
  };
}
