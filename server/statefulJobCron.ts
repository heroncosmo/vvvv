export type StatefulJobCronGroupId =
  | "fast-core"
  | "media-cleanup"
  | "payment-reminders"
  | "daily-contact-sync";

export type StatefulJobCronGroupDefinition = {
  id: StatefulJobCronGroupId;
  path: string;
  description: string;
  jobs: string[];
  defaultSchedule: string;
  scheduleEnvVar: string;
  enabledByDefault: boolean;
};

const STATEFUL_JOB_CRON_GROUPS: Record<StatefulJobCronGroupId, StatefulJobCronGroupDefinition> = {
  "fast-core": {
    id: "fast-core",
    path: "/api/cron/stateful-jobs/fast-core",
    description: "Frequent stateful worker cycles for follow-up, reminders, status and notifications.",
    jobs: [
      "admin-followup",
      "user-followup",
      "appointment-reminders",
      "status-scheduler",
      "auto-reactivate",
      "notification-scheduler",
    ],
    defaultSchedule: "*/5 * * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_FAST_CORE_SCHEDULE",
    enabledByDefault: true,
  },
  "media-cleanup": {
    id: "media-cleanup",
    path: "/api/cron/stateful-jobs/media-cleanup",
    description: "Expired media cleanup.",
    jobs: ["media-cleanup"],
    defaultSchedule: "*/15 * * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_MEDIA_CLEANUP_SCHEDULE",
    enabledByDefault: true,
  },
  "payment-reminders": {
    id: "payment-reminders",
    path: "/api/cron/stateful-jobs/payment-reminders",
    description: "Daily payment reminders.",
    jobs: ["payment-reminders"],
    defaultSchedule: "0 12 * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_PAYMENT_REMINDERS_SCHEDULE",
    enabledByDefault: true,
  },
  "daily-contact-sync": {
    id: "daily-contact-sync",
    path: "/api/cron/stateful-jobs/daily-contact-sync",
    description: "Daily full contact sync.",
    jobs: ["daily-contact-sync"],
    defaultSchedule: "0 6 * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_DAILY_CONTACT_SYNC_SCHEDULE",
    enabledByDefault: true,
  },
};

function normalizeCsvList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listStatefulJobCronGroups(): StatefulJobCronGroupDefinition[] {
  return Object.values(STATEFUL_JOB_CRON_GROUPS);
}

export function getStatefulJobCronGroup(groupId: string): StatefulJobCronGroupDefinition | null {
  return STATEFUL_JOB_CRON_GROUPS[groupId as StatefulJobCronGroupId] || null;
}

export function resolveEnabledStatefulJobCronGroups(
  env: NodeJS.ProcessEnv = process.env,
): StatefulJobCronGroupDefinition[] {
  const explicitGroups =
    normalizeCsvList(env.STATEFUL_JOB_CRON_GROUPS).length > 0
      ? normalizeCsvList(env.STATEFUL_JOB_CRON_GROUPS)
      : normalizeCsvList(env.STATEFUL_JOBS_VERCEL_CRON_GROUPS);

  const selectedGroups =
    explicitGroups.length > 0
      ? explicitGroups
      : listStatefulJobCronGroups()
          .filter((group) => group.enabledByDefault)
          .map((group) => group.id);

  return selectedGroups
    .map((groupId) => getStatefulJobCronGroup(groupId))
    .filter((group): group is StatefulJobCronGroupDefinition => Boolean(group));
}

export function resolveStatefulJobsBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(
    env.STATEFUL_JOBS_BASE_URL ||
      env.APP_STATEFUL_JOBS_BASE_URL ||
      env.VERCEL_STATEFUL_JOBS_BASE_URL ||
      "",
  )
    .trim()
    .replace(/\/+$/, "");
}

export function resolveStatefulJobsRunnerToken(env: NodeJS.ProcessEnv = process.env): string {
  return String(
    env.STATEFUL_JOBS_RUNNER_TOKEN ||
      env.APP_STATEFUL_JOBS_TOKEN ||
      env.STATEFUL_JOBS_TOKEN ||
      env.CRON_SECRET ||
      "",
  ).trim();
}

export async function triggerStatefulJobs(
  jobs: string[],
  options?: {
    baseUrl?: string;
    token?: string;
    async?: boolean;
    signal?: AbortSignal;
    cronGroup?: string;
    source?: string;
  },
): Promise<{
  targetUrl: string;
  status: number;
  ok: boolean;
  bodyText: string;
}> {
  const normalizedJobs = Array.isArray(jobs)
    ? jobs.map((jobName) => String(jobName || "").trim()).filter(Boolean)
    : [];
  if (normalizedJobs.length === 0) {
    throw new Error("Provide at least one stateful job to dispatch.");
  }

  const baseUrl = String(options?.baseUrl || resolveStatefulJobsBaseUrl()).trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Missing STATEFUL_JOBS_BASE_URL for cron dispatch.");
  }

  const token = String(options?.token || resolveStatefulJobsRunnerToken()).trim();
  if (!token) {
    throw new Error("Missing STATEFUL_JOBS_RUNNER_TOKEN or APP_STATEFUL_JOBS_TOKEN for cron dispatch.");
  }

  const targetUrl = `${baseUrl}/api/internal/stateful-jobs/run`;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options?.cronGroup ? { "x-stateful-job-cron-group": options.cronGroup } : {}),
    },
    body: JSON.stringify({
      jobs: normalizedJobs,
      async: options?.async !== false,
      source: options?.source || "cron",
      cronGroup: options?.cronGroup || null,
    }),
    signal: options?.signal,
  });

  const bodyText = await response.text();

  return {
    targetUrl,
    status: response.status,
    ok: response.ok,
    bodyText,
  };
}

export async function triggerStatefulJobCronGroup(
  group: StatefulJobCronGroupDefinition,
  options?: {
    baseUrl?: string;
    token?: string;
    async?: boolean;
    signal?: AbortSignal;
  },
): Promise<{
  targetUrl: string;
  status: number;
  ok: boolean;
  bodyText: string;
}> {
  return triggerStatefulJobs(group.jobs, {
    ...options,
    cronGroup: group.id,
    source: "cron",
  });
}
