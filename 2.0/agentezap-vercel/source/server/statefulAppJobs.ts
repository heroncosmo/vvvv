import { runAutoReactivationCheck } from "./autoReactivateService";
import { resumeSendingAdminBroadcasts } from "./adminBroadcastRunner";
import { appointmentReminderService } from "./appointmentReminderService";
import { discoverBlogTopics, refreshBlogPost, runDiscoveryGenerationPublishCycle } from "./blogService";
import { runBroadcastCampaignRecoveryOnce } from "./broadcastService";
import { followUpService } from "./followUpService";
import { scheduleFullSyncForAllClients } from "./fullContactSyncService";
import { runGrupoOlxLeadSyncCycle } from "./grupoOlxLeadSyncScheduler";
import { runCleanup } from "./mediaCleanupService";
import { runMetaLeadGoogleSheetsSyncCycle } from "./metaLeadGoogleSheetsScheduler";
import { runNotificationSchedulerCycle } from "./notificationSchedulerService";
import { processAllOwnerWorkspaces } from "./ownerNotificationWorkspaceService";
import { paymentReminderService } from "./paymentReminderService";
import { statusSchedulerService } from "./statusSchedulerService";
import { userFollowUpService } from "./userFollowUpService";

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalsyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

export function areStatefulIntervalJobsAutoStartEnabled(): boolean {
  const explicitEnable = String(process.env.ENABLE_STATEFUL_INTERVAL_JOBS || "").trim();
  if (explicitEnable) {
    return isTruthyFlag(explicitEnable);
  }

  return !isFalsyFlag(process.env.DISABLE_STATEFUL_INTERVAL_JOBS);
}

export type StatefulJobExecutionResult = {
  accepted: boolean;
  skipped?: string;
  details?: Record<string, any> | null;
};

type StatefulJobDefinition = {
  description: string;
  requiresStatefulRuntime: boolean;
  run: () => Promise<StatefulJobExecutionResult>;
};

function getRunCycleOnce(service: unknown): ((...args: any[]) => Promise<any>) | null {
  const candidate = (service as any)?.runCycleOnce;
  return typeof candidate === "function" ? candidate.bind(service) : null;
}

function missingRunCycleResult(serviceName: string): StatefulJobExecutionResult {
  return {
    accepted: false,
    skipped: `${serviceName}_run_cycle_once_unavailable`,
  };
}

function isMonolithRuntime() {
  return String(process.env.SERVICE_MODE || "").trim().toLowerCase() === "monolith";
}

function resolveUserFollowUpCronOptions() {
  const includeRepairsEnv = String(process.env.USER_FOLLOWUP_CRON_INCLUDE_REPAIRS || "").trim();
  const includeRepairs = includeRepairsEnv
    ? !isFalsyFlag(includeRepairsEnv)
    : !isMonolithRuntime();
  const defaultRepairLimit = isMonolithRuntime() ? 100 : 5000;
  const repairLimit = Math.max(
    1,
    Number(process.env.USER_FOLLOWUP_CRON_REPAIR_LIMIT || defaultRepairLimit),
  );

  return { includeRepairs, repairLimit };
}

function resolveVpsCronHttpBaseUrl() {
  return String(
    process.env.VPS_CRON_TARGET_BASE_URL ||
      process.env.APP_API_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.APP_URL ||
      "",
  )
    .trim()
    .replace(/\/+$/, "");
}

function resolveVpsCronHttpToken() {
  return String(
    process.env.CRON_SECRET ||
      process.env.STATEFUL_JOBS_RUNNER_TOKEN ||
      process.env.APP_STATEFUL_JOBS_TOKEN ||
      process.env.STATEFUL_JOBS_TOKEN ||
      "",
  ).trim();
}

async function runVpsCronHttpPath(path: string, source: string): Promise<StatefulJobExecutionResult> {
  const baseUrl = resolveVpsCronHttpBaseUrl();
  const token = resolveVpsCronHttpToken();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!baseUrl || !token) {
    return {
      accepted: false,
      skipped: !baseUrl ? "missing_vps_cron_target_base_url" : "missing_vps_cron_token",
      details: {
        path: normalizedPath,
        baseUrlConfigured: Boolean(baseUrl),
        tokenConfigured: Boolean(token),
      },
    };
  }

  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-vps-cron-source": source,
    },
    body: JSON.stringify({ source }),
  });
  const bodyText = await response.text();
  let body: unknown = bodyText;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  return {
    accepted: response.ok,
    skipped: response.ok ? undefined : `http_${response.status}`,
    details: {
      path: normalizedPath,
      status: response.status,
      body,
    },
  };
}

const STATEFUL_JOB_DEFINITIONS: Record<string, StatefulJobDefinition> = {
  "admin-followup": {
    description: "Roda um ciclo do follow-up administrativo e tenta reparar agendas faltantes.",
    requiresStatefulRuntime: true,
    run: async () => {
      const runCycleOnce = getRunCycleOnce(followUpService);
      if (!runCycleOnce) {
        return missingRunCycleResult("admin_followup");
      }

      const result = await runCycleOnce({ includeRepairs: true, repairLimit: 1000 });
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: result.repairs ? { repairs: result.repairs } : null,
      };
    },
  },
  "user-followup": {
    description: "Roda um ciclo do follow-up dos clientes e tenta reparar filas inconsistentes.",
    requiresStatefulRuntime: true,
    run: async () => {
      const { includeRepairs, repairLimit } = resolveUserFollowUpCronOptions();
      const result = await userFollowUpService.runCycleOnce({ includeRepairs, repairLimit });
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: result.repairs
          ? { repairs: result.repairs, includeRepairs, repairLimit }
          : { includeRepairs, repairLimit },
      };
    },
  },
  "appointment-reminders": {
    description: "Roda um ciclo unico dos lembretes de agendamento.",
    requiresStatefulRuntime: true,
    run: async () => {
      const runCycleOnce = getRunCycleOnce(appointmentReminderService);
      if (!runCycleOnce) {
        return missingRunCycleResult("appointment_reminders");
      }

      const result = await runCycleOnce();
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "payment-reminders": {
    description: "Roda um ciclo diario dos lembretes de pagamento.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await paymentReminderService.runCycleOnce({ force: true });
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "status-scheduler": {
    description: "Roda um ciclo do scheduler de status agendados e rotacoes.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await statusSchedulerService.runCycleOnce();
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "status-posts": {
    description: "Compatibilidade com o cron /api/cron/status-posts da Vercel.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await statusSchedulerService.runCycleOnce();
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "broadcast-campaigns": {
    description: "Compatibilidade com o cron /api/cron/broadcast-campaigns da Vercel.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await runBroadcastCampaignRecoveryOnce();
      return {
        accepted: true,
        details: result,
      };
    },
  },
  "wa-gateway-reconcile": {
    description: "Compatibilidade com o cron /api/cron/wa-gateway-reconcile da Vercel.",
    requiresStatefulRuntime: false,
    run: async () => runVpsCronHttpPath("/api/cron/wa-gateway-reconcile", "stateful-job:wa-gateway-reconcile"),
  },
  "google-calendar-sync": {
    description: "Compatibilidade com o cron /api/cron/google-calendar-sync da Vercel.",
    requiresStatefulRuntime: false,
    run: async () => runVpsCronHttpPath("/api/cron/google-calendar-sync", "stateful-job:google-calendar-sync"),
  },
  "google-contacts-sync": {
    description: "Compatibilidade com o cron /api/cron/google-contacts-sync da Vercel.",
    requiresStatefulRuntime: false,
    run: async () => runVpsCronHttpPath("/api/cron/google-contacts-sync", "stateful-job:google-contacts-sync"),
  },
  "media-cleanup": {
    description: "Executa uma rodada da limpeza de midias expiradas.",
    requiresStatefulRuntime: false,
    run: async () => {
      const result = await runCleanup();
      return {
        accepted: true,
        details: {
          stats: result,
        },
      };
    },
  },
  "auto-reactivate": {
    description: "Executa uma verificacao unica da auto-reativacao de conversas pausadas.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await runAutoReactivationCheck();
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "grupo-olx-lead-sync": {
    description: "Roda um ciclo unico de sincronizacao automatica dos leads da imobiliaria.",
    requiresStatefulRuntime: false,
    run: async () => {
      const delegated = await runVpsCronHttpPath("/api/cron/stateful-jobs/lead-sync", "stateful-job:grupo-olx-lead-sync");
      if (
        delegated.accepted ||
        !["missing_vps_cron_target_base_url", "missing_vps_cron_token"].includes(String(delegated.skipped || ""))
      ) {
        return delegated;
      }

      await runGrupoOlxLeadSyncCycle();
      return {
        accepted: true,
        details: {
          fallback: "legacy_maton_without_direct_google",
        },
      };
    },
  },
  "meta-lead-google-sheets": {
    description: "Roda um ciclo unico da sincronizacao Meta Forms -> Google Sheets -> WhatsApp.",
    requiresStatefulRuntime: false,
    run: async () => {
      await runMetaLeadGoogleSheetsSyncCycle();
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "notification-scheduler": {
    description: "Roda um ciclo unico do scheduler de notificacoes.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await runNotificationSchedulerCycle();
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: null,
      };
    },
  },
  "owner-workspace": {
    description: "Roda um ciclo unico do processamento do owner workspace.",
    requiresStatefulRuntime: false,
    run: async () => {
      await processAllOwnerWorkspaces();
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "daily-contact-sync": {
    description: "Agenda um ciclo de sincronizacao completa de contatos para todos os clientes elegiveis.",
    requiresStatefulRuntime: false,
    run: async () => {
      const result = await scheduleFullSyncForAllClients();
      return {
        accepted: true,
        details: {
          stats: result,
        },
      };
    },
  },
  "admin-broadcast-recovery": {
    description: "Retoma campanhas admin em execucao que ficaram penduradas.",
    requiresStatefulRuntime: true,
    run: async () => {
      await resumeSendingAdminBroadcasts("manual-job");
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "blog-automation": {
    description: "Roda uma passada manual do pipeline do blog.",
    requiresStatefulRuntime: false,
    run: async () => {
      const discovered = await discoverBlogTopics(5);
      const pipeline = await runDiscoveryGenerationPublishCycle();
      const refreshed = await refreshBlogPost();
      return {
        accepted: true,
        details: {
          discovered,
          pipeline,
          refreshedPostId: refreshed?.id || null,
        },
      };
    },
  },
};

export function listStatefulJobs() {
  return Object.entries(STATEFUL_JOB_DEFINITIONS).map(([name, definition]) => ({
    name,
    description: definition.description,
    requiresStatefulRuntime: definition.requiresStatefulRuntime,
  }));
}

export function getStatefulJobDefinition(jobName: string): StatefulJobDefinition | null {
  return STATEFUL_JOB_DEFINITIONS[jobName] || null;
}

export async function runStatefulJob(jobName: string): Promise<StatefulJobExecutionResult> {
  const definition = getStatefulJobDefinition(jobName);
  if (!definition) {
    throw new Error(`Unknown stateful job: ${jobName}`);
  }

  return definition.run();
}

export function startAutoStartedStatefulIntervalJobs() {
  if (!areStatefulIntervalJobsAutoStartEnabled()) {
    console.log("[STATEFUL JOBS] Interval autostart disabled. Use cron/internal job endpoints.");
    return;
  }

  followUpService.start();
  userFollowUpService.start();
  appointmentReminderService.start();
  paymentReminderService.start();
}

export function stopAutoStartedStatefulIntervalJobs() {
  followUpService.stop();
  userFollowUpService.stop();
  appointmentReminderService.stop();
  paymentReminderService.stop();
}
