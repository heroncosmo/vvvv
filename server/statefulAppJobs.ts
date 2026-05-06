import { forceCheckAutoReactivation } from "./autoReactivateService";
import { appointmentReminderService } from "./appointmentReminderService";
import { followUpService } from "./followUpService";
import { scheduleFullSyncForAllClients } from "./fullContactSyncService";
import { runCleanup } from "./mediaCleanupService";
import { runNotificationSchedulerCycle } from "./notificationSchedulerService";
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

async function runPrivateServiceMethod(
  service: unknown,
  methodName: string,
): Promise<StatefulJobExecutionResult> {
  const method = (service as any)?.[methodName];
  if (typeof method !== "function") {
    return {
      accepted: false,
      skipped: `missing_method:${methodName}`,
      details: null,
    };
  }

  await method.call(service);
  return {
    accepted: true,
    details: null,
  };
}

const STATEFUL_JOB_DEFINITIONS: Record<string, StatefulJobDefinition> = {
  "admin-followup": {
    description: "Run one admin follow-up scheduler cycle.",
    requiresStatefulRuntime: true,
    run: () => runPrivateServiceMethod(followUpService, "processFollowUps"),
  },
  "user-followup": {
    description: "Run one customer follow-up scheduler cycle.",
    requiresStatefulRuntime: true,
    run: () => runPrivateServiceMethod(userFollowUpService, "processFollowUps"),
  },
  "appointment-reminders": {
    description: "Run one appointment reminder scheduler cycle.",
    requiresStatefulRuntime: true,
    run: () => runPrivateServiceMethod(appointmentReminderService, "processReminders"),
  },
  "payment-reminders": {
    description: "Run one payment reminder scheduler cycle.",
    requiresStatefulRuntime: true,
    run: () => runPrivateServiceMethod(paymentReminderService, "processDailyReminders"),
  },
  "status-scheduler": {
    description: "Run one status scheduler cycle.",
    requiresStatefulRuntime: true,
    run: () => runPrivateServiceMethod(statusSchedulerService, "process"),
  },
  "media-cleanup": {
    description: "Run one expired media cleanup cycle.",
    requiresStatefulRuntime: false,
    run: async () => {
      const stats = await runCleanup();
      return {
        accepted: true,
        details: { stats },
      };
    },
  },
  "auto-reactivate": {
    description: "Run one auto-reactivation check.",
    requiresStatefulRuntime: true,
    run: async () => {
      await forceCheckAutoReactivation();
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "notification-scheduler": {
    description: "Run one smart notification scheduler cycle.",
    requiresStatefulRuntime: true,
    run: async () => {
      await runNotificationSchedulerCycle();
      return {
        accepted: true,
        details: null,
      };
    },
  },
  "daily-contact-sync": {
    description: "Schedule one full contact sync pass for eligible clients.",
    requiresStatefulRuntime: false,
    run: async () => {
      const stats = await scheduleFullSyncForAllClients();
      return {
        accepted: true,
        details: { stats },
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
