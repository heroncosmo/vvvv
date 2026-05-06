export type StatefulJobCronGroupId =
  | "fast-core"
  | "lead-sync"
  | "media-cleanup"
  | "payment-reminders"
  | "daily-contact-sync"
  | "blog-automation";

export type StatefulJobCronGroupDefinition = {
  id: StatefulJobCronGroupId;
  path: string;
  description: string;
  jobs: string[];
  defaultSchedule: string;
  scheduleEnvVar: string;
  planHint: "daily-compatible" | "pro-recommended";
  enabledByDefault: boolean;
};

const STATEFUL_JOB_CRON_GROUPS: Record<StatefulJobCronGroupId, StatefulJobCronGroupDefinition> = {
  "fast-core": {
    id: "fast-core",
    path: "/api/cron/stateful-jobs/fast-core",
    description:
      "Ciclos frequentes do runtime stateful para follow-up, lembretes, scheduler de status, notificacoes e recovery.",
    jobs: [
      "admin-followup",
      "user-followup",
      "appointment-reminders",
      "status-scheduler",
      "auto-reactivate",
      "notification-scheduler",
      "owner-workspace",
      "meta-lead-google-sheets",
      "admin-broadcast-recovery",
    ],
    defaultSchedule: "*/5 * * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_FAST_CORE_SCHEDULE",
    planHint: "pro-recommended",
    enabledByDefault: true,
  },
  "lead-sync": {
    id: "lead-sync",
    path: "/api/cron/stateful-jobs/lead-sync",
    description: "Sincronizacao automatica de leads da imobiliaria.",
    jobs: ["grupo-olx-lead-sync"],
    defaultSchedule: "*/10 * * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_LEAD_SYNC_SCHEDULE",
    planHint: "pro-recommended",
    enabledByDefault: true,
  },
  "media-cleanup": {
    id: "media-cleanup",
    path: "/api/cron/stateful-jobs/media-cleanup",
    description: "Limpeza de midias expiradas no storage.",
    jobs: ["media-cleanup"],
    defaultSchedule: "*/15 * * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_MEDIA_CLEANUP_SCHEDULE",
    planHint: "pro-recommended",
    enabledByDefault: true,
  },
  "payment-reminders": {
    id: "payment-reminders",
    path: "/api/cron/stateful-jobs/payment-reminders",
    description: "Lembretes diarios de pagamento.",
    jobs: ["payment-reminders"],
    defaultSchedule: "0 12 * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_PAYMENT_REMINDERS_SCHEDULE",
    planHint: "daily-compatible",
    enabledByDefault: true,
  },
  "daily-contact-sync": {
    id: "daily-contact-sync",
    path: "/api/cron/stateful-jobs/daily-contact-sync",
    description: "Sincronizacao completa diaria de contatos elegiveis.",
    jobs: ["daily-contact-sync"],
    defaultSchedule: "0 6 * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_DAILY_CONTACT_SYNC_SCHEDULE",
    planHint: "daily-compatible",
    enabledByDefault: true,
  },
  "blog-automation": {
    id: "blog-automation",
    path: "/api/cron/stateful-jobs/blog-automation",
    description: "Pipeline manual do blog em lote unico.",
    jobs: ["blog-automation"],
    defaultSchedule: "0 */6 * * *",
    scheduleEnvVar: "STATEFUL_JOB_CRON_BLOG_AUTOMATION_SCHEDULE",
    planHint: "pro-recommended",
    enabledByDefault: false,
  },
};

function normalizeCsvList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function listStatefulJobCronGroups(): StatefulJobCronGroupDefinition[] {
  return Object.values(STATEFUL_JOB_CRON_GROUPS);
}

export function getStatefulJobCronGroup(groupId: string): StatefulJobCronGroupDefinition | null {
  if (!groupId) {
    return null;
  }

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

export function buildStatefulJobVercelCrons(
  env: NodeJS.ProcessEnv = process.env,
): Array<{ path: string; schedule: string }> {
  if (!isTruthyFlag(env.ENABLE_STATEFUL_JOB_VERCEL_CRONS)) {
    return [];
  }

  return resolveEnabledStatefulJobCronGroups(env)
    .map((group) => {
      const configuredSchedule = String(env[group.scheduleEnvVar] || "").trim();
      const schedule = configuredSchedule || group.defaultSchedule;
      return {
        path: group.path,
        schedule,
      };
    })
    .filter((entry) => Boolean(entry.schedule));
}

export function resolveStatefulJobsBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(
    env.STATEFUL_JOBS_BASE_URL || env.APP_STATEFUL_JOBS_BASE_URL || env.VERCEL_STATEFUL_JOBS_BASE_URL || "",
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

export function resolveVercelCronSecret(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.CRON_SECRET || "").trim();
}

export function isAuthorizedVercelCronRequest(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = resolveVercelCronSecret(env);
  if (!secret) {
    return true;
  }

  const authHeader = String(request.headers.get("authorization") || "").trim();
  return authHeader === `Bearer ${secret}`;
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
