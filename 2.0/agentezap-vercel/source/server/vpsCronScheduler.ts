import {
  resolveEnabledStatefulJobCronGroups,
  type StatefulJobCronGroupDefinition,
} from "./statefulJobCron";
import { describeAppRuntimeProfile, isWorkerAppRuntime } from "./runtimeProfile";

type VpsCronEntry = {
  id: string;
  path: string;
  schedule: string;
};

type VpsCronSchedulerOptions = {
  getPauseReason?: () => string | null | undefined;
};

let cronSchedulerInterval: NodeJS.Timeout | null = null;
let cronSchedulerBootTimeout: NodeJS.Timeout | null = null;
const lastRunByEntry = new Map<string, string>();
const runningEntries = new Set<string>();
let schedulerOptions: VpsCronSchedulerOptions = {};
let lastPauseLogKey: string | null = null;

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalseFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

function isSchedulerEnabled() {
  return isTruthyFlag(process.env.ENABLE_VPS_INTERNAL_CRONS) || isTruthyFlag(process.env.ENABLE_VPS_CRON_SCHEDULER);
}

function areVercelCronsStillEnabled() {
  if (process.env.VERCEL_CRONS_STILL_ENABLED === undefined) {
    return true;
  }

  return !isFalseFlag(process.env.VERCEL_CRONS_STILL_ENABLED);
}

function resolveTargetBaseUrl() {
  return String(process.env.VPS_CRON_TARGET_BASE_URL || "http://api:5000")
    .trim()
    .replace(/\/+$/, "");
}

function resolveCronToken() {
  return String(
    process.env.CRON_SECRET ||
      process.env.STATEFUL_JOBS_RUNNER_TOKEN ||
      process.env.APP_STATEFUL_JOBS_TOKEN ||
      process.env.STATEFUL_JOBS_TOKEN ||
      "",
  ).trim();
}

function resolveRequestTimeoutMs() {
  return Math.max(10_000, Math.min(Number(process.env.VPS_CRON_REQUEST_TIMEOUT_MS || 120_000), 300_000));
}

function scheduleForGroup(group: StatefulJobCronGroupDefinition) {
  return String(process.env[group.scheduleEnvVar] || group.defaultSchedule || "").trim();
}

function buildCronEntries(): VpsCronEntry[] {
  return resolveEnabledStatefulJobCronGroups()
    .map((group) => ({
      id: group.id,
      path: group.path,
      schedule: scheduleForGroup(group),
    }))
    .filter((entry) => Boolean(entry.path && entry.schedule));
}

function matchCronField(field: string, value: number) {
  const normalized = String(field || "").trim();
  if (!normalized || normalized === "*") {
    return true;
  }

  return normalized.split(",").some((part) => {
    const item = part.trim();
    if (!item) {
      return false;
    }
    if (item.startsWith("*/")) {
      const step = Number(item.slice(2));
      return Number.isFinite(step) && step > 0 && value % step === 0;
    }
    if (item.includes("-")) {
      const [startRaw, endRaw] = item.split("-", 2);
      const start = Number(startRaw);
      const end = Number(endRaw);
      return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
    }
    const exact = Number(item);
    return Number.isFinite(exact) && value === exact;
  });
}

function matchesSchedule(schedule: string, now: Date) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.warn(`[VPS CRON] Ignoring invalid schedule "${schedule}". Expected five cron fields.`);
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    matchCronField(minute, now.getMinutes()) &&
    matchCronField(hour, now.getHours()) &&
    matchCronField(dayOfMonth, now.getDate()) &&
    matchCronField(month, now.getMonth() + 1) &&
    matchCronField(dayOfWeek, now.getDay())
  );
}

function minuteKey(now: Date) {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("");
}

async function triggerCronEntry(entry: VpsCronEntry) {
  if (runningEntries.has(entry.id)) {
    console.log(`[VPS CRON] Skipping ${entry.id}; previous run is still active.`);
    return;
  }

  const baseUrl = resolveTargetBaseUrl();
  const token = resolveCronToken();
  if (!baseUrl || !token) {
    console.error(`[VPS CRON] Missing target base URL or cron token for ${entry.id}.`);
    return;
  }

  const timeoutMs = resolveRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  runningEntries.add(entry.id);

  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}${entry.path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-vps-cron-scheduler": "true",
        "x-stateful-job-async": "true",
      },
      body: JSON.stringify({
        source: "vps-cron-scheduler",
        cronGroup: entry.id,
      }),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      console.error(`[VPS CRON] ${entry.id} failed status=${response.status} durationMs=${durationMs}: ${bodyText}`);
      return;
    }
    console.log(`[VPS CRON] ${entry.id} ok status=${response.status} durationMs=${durationMs}`);
  } catch (error) {
    console.error(`[VPS CRON] ${entry.id} request failed:`, error);
  } finally {
    clearTimeout(timeout);
    runningEntries.delete(entry.id);
  }
}

function tickCronScheduler() {
  const pauseReason = schedulerOptions.getPauseReason?.();
  if (pauseReason) {
    const now = new Date();
    const logKey = `${pauseReason}:${minuteKey(now)}`;
    if (lastPauseLogKey !== logKey) {
      lastPauseLogKey = logKey;
      console.log(`[VPS CRON] Paused while ${pauseReason} is active.`);
    }
    return;
  }

  const entries = buildCronEntries();
  const now = new Date();
  const key = minuteKey(now);

  for (const entry of entries) {
    if (!matchesSchedule(entry.schedule, now)) {
      continue;
    }

    const runKey = `${entry.id}:${key}`;
    if (lastRunByEntry.get(entry.id) === runKey) {
      continue;
    }

    lastRunByEntry.set(entry.id, runKey);
    void triggerCronEntry(entry);
  }
}

export function startVpsCronScheduler(options: VpsCronSchedulerOptions = {}) {
  if (cronSchedulerInterval || cronSchedulerBootTimeout) {
    return;
  }

  schedulerOptions = options;

  if (!isSchedulerEnabled()) {
    console.log("[VPS CRON] Scheduler disabled. Set ENABLE_VPS_INTERNAL_CRONS=true after disabling Vercel crons.");
    return;
  }

  if (!isWorkerAppRuntime() && !isTruthyFlag(process.env.ALLOW_VPS_CRON_IN_NON_WORKER)) {
    console.warn(`[VPS CRON] Scheduler not started on runtime ${describeAppRuntimeProfile()}. Use the worker service.`);
    return;
  }

  if (areVercelCronsStillEnabled() && !isTruthyFlag(process.env.ALLOW_VPS_CRON_WITH_VERCEL)) {
    console.warn("[VPS CRON] Scheduler blocked because VERCEL_CRONS_STILL_ENABLED is not false.");
    return;
  }

  const entries = buildCronEntries();
  console.log("[VPS CRON] Scheduler starting", {
    runtimeProfile: describeAppRuntimeProfile(),
    targetBaseUrl: resolveTargetBaseUrl(),
    entries: entries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      schedule: entry.schedule,
    })),
  });

  cronSchedulerBootTimeout = setTimeout(() => {
    cronSchedulerBootTimeout = null;
    tickCronScheduler();
    cronSchedulerInterval = setInterval(tickCronScheduler, 15_000);
  }, 10_000);
}

export function stopVpsCronScheduler() {
  if (cronSchedulerBootTimeout) {
    clearTimeout(cronSchedulerBootTimeout);
    cronSchedulerBootTimeout = null;
  }

  if (cronSchedulerInterval) {
    clearInterval(cronSchedulerInterval);
    cronSchedulerInterval = null;
  }

  schedulerOptions = {};
  lastPauseLogKey = null;
}
