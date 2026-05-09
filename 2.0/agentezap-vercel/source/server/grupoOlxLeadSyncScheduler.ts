import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "./db";
import { syncMatonLeadEmailsForIntegration } from "./routes_grupo_olx";
import { grupoOlxIntegrations } from "@shared/schema";

const LEAD_SYNC_INTERVAL_MS = 10 * 60 * 1000;

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let syncInProgress = false;

async function updateAutomaticLeadSyncStatus(
  integrationId: string,
  patch: {
    lastLeadSyncStatus: string;
    lastLeadSyncMessage: string;
    lastLeadSyncAt?: Date;
  },
) {
  await db
    .update(grupoOlxIntegrations)
    .set({
      lastLeadSyncAt: patch.lastLeadSyncAt,
      lastLeadSyncStatus: patch.lastLeadSyncStatus,
      lastLeadSyncMessage: patch.lastLeadSyncMessage,
      updatedAt: new Date(),
    })
    .where(eq(grupoOlxIntegrations.id, integrationId));
}

export async function runGrupoOlxLeadSyncCycle() {
  if (syncInProgress) {
    console.log("[Imobiliaria] Sincronizacao automatica ignorada porque a execucao anterior ainda nao terminou.");
    return;
  }

  syncInProgress = true;

  try {
    const integrations = await db
      .select()
      .from(grupoOlxIntegrations)
      .where(
        and(
          eq(grupoOlxIntegrations.active, true),
          eq(grupoOlxIntegrations.leadEmailSyncEnabled, true),
          isNotNull(grupoOlxIntegrations.matonApiKey),
          isNotNull(grupoOlxIntegrations.matonConnectionId),
          isNotNull(grupoOlxIntegrations.connectionId),
        ),
      );

    if (!integrations.length) {
      console.log("[Imobiliaria] Nenhuma integracao ativa para sincronizacao automatica de leads.");
      return;
    }

    for (const integration of integrations) {
      try {
        await updateAutomaticLeadSyncStatus(integration.id, {
          lastLeadSyncStatus: "running",
          lastLeadSyncMessage: "Sincronizacao automatica em andamento...",
        });

        const result = await syncMatonLeadEmailsForIntegration(integration, {
          maxResults: 10,
          newerThanDays: 2,
        });
        const retrySuffix = result.retried.attempted > 0
          ? ` ${result.retried.succeeded} reenviados com sucesso, ${result.retried.failed} ainda com erro.`
          : "";

        await updateAutomaticLeadSyncStatus(integration.id, {
          lastLeadSyncAt: new Date(),
          lastLeadSyncStatus: "success",
          lastLeadSyncMessage: `Sincronizacao automatica concluida com ${result.processed} e-mails processados.${retrySuffix}`,
        });

        console.log(
          `[Imobiliaria] Sync automatico OK para user=${integration.userId} integration=${integration.id} processed=${result.processed} retried=${result.retried.succeeded}/${result.retried.attempted}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido na sincronizacao automatica";
        await updateAutomaticLeadSyncStatus(integration.id, {
          lastLeadSyncAt: new Date(),
          lastLeadSyncStatus: "error",
          lastLeadSyncMessage: message,
        });
        console.error(`[Imobiliaria] Erro no sync automatico da integracao ${integration.id}:`, error);
      }
    }
  } finally {
    syncInProgress = false;
  }
}

export function startGrupoOlxLeadSyncScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  void runGrupoOlxLeadSyncCycle();
  schedulerTimer = setInterval(() => {
    void runGrupoOlxLeadSyncCycle();
  }, LEAD_SYNC_INTERVAL_MS);

  console.log("[Imobiliaria] Scheduler automatico de leads iniciado (intervalo de 10 minutos).");
}

export function stopGrupoOlxLeadSyncScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}
