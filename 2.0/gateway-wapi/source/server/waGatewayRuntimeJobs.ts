import {
  restoreWhatsAppSessionSnapshotsFromStorage,
  syncAllWhatsAppSessionSnapshots,
} from "./whatsappSessionSnapshotService";

export type GatewayRuntimeJobExecutionResult = {
  accepted: boolean;
  details?: Record<string, any> | null;
};

type GatewayRuntimeJobDefinition = {
  description: string;
  run: () => Promise<GatewayRuntimeJobExecutionResult>;
};

const GATEWAY_RUNTIME_JOB_DEFINITIONS: Record<string, GatewayRuntimeJobDefinition> = {
  "session-snapshots-sync": {
    description: "Sincroniza snapshots remotos das sessoes auth_* do gateway para o Supabase Storage.",
    run: async () => {
      const result = await syncAllWhatsAppSessionSnapshots({
        includeAdmins: false,
        reason: "runtime-job",
      });
      return {
        accepted: true,
        details: result,
      };
    },
  },
  "session-snapshots-restore": {
    description: "Restaura snapshots remotos das sessoes auth_* do gateway para o disco local.",
    run: async () => {
      const result = await restoreWhatsAppSessionSnapshotsFromStorage({
        includeAdmins: false,
        missingOnly: false,
        reason: "runtime-job",
      });
      return {
        accepted: true,
        details: result,
      };
    },
  },
};

export function listGatewayRuntimeJobs() {
  return Object.entries(GATEWAY_RUNTIME_JOB_DEFINITIONS).map(([name, definition]) => ({
    name,
    description: definition.description,
  }));
}

export function getGatewayRuntimeJobDefinition(jobName: string): GatewayRuntimeJobDefinition | null {
  return GATEWAY_RUNTIME_JOB_DEFINITIONS[jobName] || null;
}

export async function runGatewayRuntimeJob(jobName: string): Promise<GatewayRuntimeJobExecutionResult> {
  const definition = getGatewayRuntimeJobDefinition(jobName);
  if (!definition) {
    throw new Error(`Unknown gateway runtime job: ${jobName}`);
  }

  return definition.run();
}
