import { runAutoReactivationCheck } from "./autoReactivateService";
import { resumeSendingAdminBroadcasts } from "./adminBroadcastRunner";
import { appointmentReminderService } from "./appointmentReminderService";
import { discoverBlogTopics, refreshBlogPost, runDiscoveryGenerationPublishCycle } from "./blogService";
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
import { runAutoRecoveryCycle, runPendingTimersCronCycle } from "./whatsapp";

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

const STATEFUL_JOB_DEFINITIONS: Record<string, StatefulJobDefinition> = {
  "admin-followup": {
    description: "Roda um ciclo do follow-up administrativo e tenta reparar agendas faltantes.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await followUpService.runCycleOnce({ includeRepairs: true, repairLimit: 1000 });
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
      const result = await userFollowUpService.runCycleOnce({ includeRepairs: true, repairLimit: 5000 });
      return {
        accepted: result.accepted,
        skipped: result.skipped,
        details: result.repairs ? { repairs: result.repairs } : null,
      };
    },
  },
  "appointment-reminders": {
    description: "Roda um ciclo unico dos lembretes de agendamento.",
    requiresStatefulRuntime: true,
    run: async () => {
      const result = await appointmentReminderService.runCycleOnce();
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
      await runGrupoOlxLeadSyncCycle();
      return {
        accepted: true,
        details: null,
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
  "pending-timers-recovery": {
    description: "Executa um ciclo unico de recuperacao dos timers pendentes do WhatsApp.",
    requiresStatefulRuntime: true,
    run: async () => {
      await runPendingTimersCronCycle();
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "auto-recovery": {
    description: "Executa um ciclo unico da safety-net de respostas falhadas do WhatsApp.",
    requiresStatefulRuntime: true,
    run: async () => {
      await runAutoRecoveryCycle();
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
