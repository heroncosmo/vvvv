import { buildFollowUpStageScheduleDate } from "./userFollowUpScheduling";

const GLOBAL_FOLLOWUP_REASON_TEXT = "Usuário desativou follow-up global";
const GLOBAL_FOLLOWUP_REASON_TEXT_ASCII = "Usuario desativou follow-up global";
const GLOBAL_FOLLOWUP_REASON_SEPARATOR = "||";
const GLOBAL_FOLLOWUP_REASON_CODE = "global_followup_disabled";

interface GlobalFollowUpPauseSnapshot {
  code: string;
  pausedAt: string;
  pausedStage: number;
  pausedNextFollowupAt: string | null;
}

function parseSnapshotPayload(payload: string | null | undefined): GlobalFollowUpPauseSnapshot | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<GlobalFollowUpPauseSnapshot>;
    if (parsed.code !== GLOBAL_FOLLOWUP_REASON_CODE) {
      return null;
    }

    return {
      code: GLOBAL_FOLLOWUP_REASON_CODE,
      pausedAt: String(parsed.pausedAt || ""),
      pausedStage: Math.max(0, Number(parsed.pausedStage || 0)),
      pausedNextFollowupAt: parsed.pausedNextFollowupAt ? String(parsed.pausedNextFollowupAt) : null,
    };
  } catch {
    return null;
  }
}

export function buildGlobalFollowUpPauseReason(params: {
  currentStage: number | null | undefined;
  nextFollowupAt: Date | string | null | undefined;
  pausedAt?: Date;
}): string {
  const snapshot: GlobalFollowUpPauseSnapshot = {
    code: GLOBAL_FOLLOWUP_REASON_CODE,
    pausedAt: (params.pausedAt || new Date()).toISOString(),
    pausedStage: Math.max(0, Number(params.currentStage || 0)),
    pausedNextFollowupAt: params.nextFollowupAt
      ? new Date(params.nextFollowupAt).toISOString()
      : null,
  };

  return `${GLOBAL_FOLLOWUP_REASON_TEXT}${GLOBAL_FOLLOWUP_REASON_SEPARATOR}${JSON.stringify(snapshot)}`;
}

export function isGlobalFollowUpPauseReason(reason: string | null | undefined): boolean {
  if (!reason) {
    return false;
  }

  return reason.startsWith(GLOBAL_FOLLOWUP_REASON_TEXT) || reason.startsWith(GLOBAL_FOLLOWUP_REASON_TEXT_ASCII);
}

export function parseGlobalFollowUpPauseReason(reason: string | null | undefined): GlobalFollowUpPauseSnapshot | null {
  if (!isGlobalFollowUpPauseReason(reason)) {
    return null;
  }

  const parts = String(reason).split(GLOBAL_FOLLOWUP_REASON_SEPARATOR);
  if (parts.length < 2) {
    return null;
  }

  return parseSnapshotPayload(parts.slice(1).join(GLOBAL_FOLLOWUP_REASON_SEPARATOR));
}

export function resolveRecoveredGlobalFollowUpDate(params: {
  reason: string | null | undefined;
  currentStage: number | null | undefined;
  config: any;
  now?: Date;
  randomFn?: () => number;
}): Date | null {
  const now = params.now || new Date();
  const snapshot = parseGlobalFollowUpPauseReason(params.reason);

  if (snapshot?.pausedNextFollowupAt) {
    const preserved = new Date(snapshot.pausedNextFollowupAt);
    if (Number.isFinite(preserved.getTime()) && preserved.getTime() > now.getTime()) {
      return preserved;
    }
  }

  const stageIndex = snapshot
    ? Math.max(0, Number(snapshot.pausedStage || 0))
    : Math.max(0, Number(params.currentStage || 0));

  return buildFollowUpStageScheduleDate({
    config: params.config,
    stageIndex,
    now,
    randomFn: params.randomFn,
  });
}

export const GLOBAL_FOLLOWUP_DISABLED_REASON = GLOBAL_FOLLOWUP_REASON_TEXT;
export const GLOBAL_FOLLOWUP_DISABLED_REASON_ASCII = GLOBAL_FOLLOWUP_REASON_TEXT_ASCII;
