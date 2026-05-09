/**
 * Full application entry point.
 *
 * Loaded by index.ts whenever SERVICE_MODE is not "proxy" or "wa-gateway".
 */
import {
  closeAllSessions,
  isAdminRestoreInProgress,
  isRestoringInProgress,
  restoreAdminSessions,
  restoreExistingSessions,
  restorePendingAITimers,
  startAutoRecoveryCron,
  startConnectionHealthCheck,
  startPendingTimersCron,
  stopAutoRecoveryCron,
  stopConnectionHealthCheck,
  stopPendingTimersCron,
} from "./whatsapp";
import { startWhatsAppLeaderElection } from "./whatsappLeaderLock";
import {
  areStatefulIntervalJobsAutoStartEnabled,
  startAutoStartedStatefulIntervalJobs,
  stopAutoStartedStatefulIntervalJobs,
} from "./statefulAppJobs";
import { statusSchedulerService } from "./statusSchedulerService";
import {
  startAutoReactivationService,
  stopAutoReactivationService,
} from "./autoReactivateService";
import {
  startAdminBroadcastRecoveryLoop,
  stopAdminBroadcastRecoveryLoop,
} from "./adminBroadcastRunner";
import { startDailySyncCron, stopDailySyncCron } from "./fullContactSyncService";
import {
  startMediaCleanupService,
  stopMediaCleanupService,
} from "./mediaCleanupService";
import {
  startNotificationScheduler,
  stopNotificationScheduler,
} from "./notificationSchedulerService";
import {
  startOwnerWorkspaceScheduler,
  stopOwnerWorkspaceScheduler,
} from "./ownerNotificationWorkspaceService";
import { blogAutomationService } from "./blogAutomationService";
import {
  startGrupoOlxLeadSyncScheduler,
  stopGrupoOlxLeadSyncScheduler,
} from "./grupoOlxLeadSyncScheduler";
import {
  startMetaLeadGoogleSheetsScheduler,
  stopMetaLeadGoogleSheetsScheduler,
} from "./metaLeadGoogleSheetsScheduler";
import { seedDatabase } from "./seed";
import { closeDbPool, runtimeAutoMigrationsEnabled } from "./db";
import { ensureWhatsAppRuntimeSchema } from "./whatsappRuntimeMigrations";
import {
  areLocalWhatsAppRuntimeServicesEnabled,
  areStatefulAppServicesEnabled,
  describeAppRuntimeProfile,
  isWorkerAppRuntime,
} from "./runtimeProfile";
import { createHttpApp } from "./httpApp";
import {
  flushPendingWhatsAppSessionSnapshots,
  restoreWhatsAppSessionSnapshotsFromStorage,
  startWhatsAppSessionSnapshotCron,
  stopWhatsAppSessionSnapshotCron,
  syncAllWhatsAppSessionSnapshots,
} from "./whatsappSessionSnapshotService";
import { startVpsCronScheduler, stopVpsCronScheduler } from "./vpsCronScheduler";

function getWhatsAppRestorePauseReason(): string | null {
  if (isRestoringInProgress()) {
    return "whatsapp-session-restore";
  }
  if (isAdminRestoreInProgress()) {
    return "admin-whatsapp-session-restore";
  }
  return null;
}

function runAfterWhatsAppRestore(label: string, action: () => void | Promise<void>) {
  const run = () => {
    const pauseReason = getWhatsAppRestorePauseReason();
    if (pauseReason) {
      console.log(`[FULL APP] Delaying ${label}; ${pauseReason} is still active.`);
      setTimeout(run, 15_000);
      return;
    }

    void Promise.resolve(action()).catch((error) => {
      console.error(`[FULL APP] Failed to start ${label}:`, error);
    });
  };

  setTimeout(run, 10_000);
}

function startPendingAIRecoveryServicesDuringRestore() {
  const startupDelayMs = Math.max(
    Number(process.env.WA_PENDING_TIMERS_CRON_STARTUP_DELAY_MS || 15_000),
    5_000,
  );

  setTimeout(() => {
    console.log(
      `[FULL APP] Starting pending AI timers during WhatsApp restore after ${Math.round(startupDelayMs / 1000)}s.`,
    );

    void restorePendingAITimers().catch((error) => {
      console.error("[FULL APP] Failed to restore pending AI timers during startup:", error);
    });
    startPendingTimersCron();
    startAutoRecoveryCron();
  }, startupDelayMs);
}

function armStartupRestoreBootstrapGuard() {
  if (
    process.env.SKIP_WHATSAPP_RESTORE === "true" ||
    !areLocalWhatsAppRuntimeServicesEnabled()
  ) {
    return;
  }

  const guardMs = Math.max(
    Number(process.env.WA_RESTORE_BOOT_GUARD_MS || 5 * 60_000),
    30_000,
  );
  process.env.WA_RESTORE_BOOT_GUARD_UNTIL = String(Date.now() + guardMs);
  console.log(
    `[FULL APP] Dashboard bootstrap restore guard armed for ${Math.round(guardMs / 1000)}s while WhatsApp restore starts.`,
  );
}

function startStatefulAppServices() {
  startWhatsAppLeaderElection({
    onLeader: async () => {
      await restoreWhatsAppSessionSnapshotsFromStorage({
        includeAdmins: true,
        missingOnly: true,
        reason: "full-app-leader-boot",
      }).catch((error) => {
        console.error("Failed to restore WhatsApp session snapshots:", error);
      });

      restoreExistingSessions().catch((error) => {
        console.error("Failed to restore WhatsApp sessions:", error);
      });
      startConnectionHealthCheck();
      startPendingAIRecoveryServicesDuringRestore();

      restoreAdminSessions().catch((error) => {
        console.error("Failed to restore admin WhatsApp sessions:", error);
      });

      startWhatsAppSessionSnapshotCron(true);

      startAutoStartedStatefulIntervalJobs();
      if (areStatefulIntervalJobsAutoStartEnabled()) {
        statusSchedulerService.start();
        startAutoReactivationService();
        startDailySyncCron();
        startMediaCleanupService();
        startNotificationScheduler();
        startOwnerWorkspaceScheduler();
        startAdminBroadcastRecoveryLoop();
        startGrupoOlxLeadSyncScheduler();
        startMetaLeadGoogleSheetsScheduler();
        blogAutomationService.start().catch((error) => {
          console.error("Failed to start blog automation:", error);
        });
      } else {
        console.log("[STATEFUL JOBS] Legacy scheduler autostart disabled. Waiting for cron/internal dispatch.");
      }
    },
  });
}

function stopStatefulAppServices() {
  stopVpsCronScheduler();
  stopAutoStartedStatefulIntervalJobs();
  stopConnectionHealthCheck();
  stopPendingTimersCron();
  stopAutoRecoveryCron();
  stopWhatsAppSessionSnapshotCron();
  statusSchedulerService.stop();
  stopAutoReactivationService();
  stopDailySyncCron();
  stopMediaCleanupService();
  stopNotificationScheduler();
  stopOwnerWorkspaceScheduler();
  stopAdminBroadcastRecoveryLoop();
  blogAutomationService.stop();
  stopGrupoOlxLeadSyncScheduler();
  stopMetaLeadGoogleSheetsScheduler();
}

export async function startFullApp() {
  if (process.env.SKIP_WHATSAPP_RESTORE === "true") {
    console.log("");
    console.log("[DEV PROTECTION] SKIP_WHATSAPP_RESTORE=true");
    console.log("[DEV PROTECTION] Production WhatsApp sessions will not be restored here.");
    console.log("");
  }

  const { server } = await createHttpApp({
    mountFrontend: !isWorkerAppRuntime(),
    mountUploads: true,
  });

  armStartupRestoreBootstrapGuard();

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    async () => {
      console.log(`[FULL APP] serving on port ${port}`);
      console.log(`[FULL APP] Runtime profile: ${describeAppRuntimeProfile()}`);

      await ensureWhatsAppRuntimeSchema();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        await seedDatabase();
      } catch (error) {
        console.error("Failed to seed database:", error);
      }

      if (runtimeAutoMigrationsEnabled) {
        try {
          const { pool } = await import("./db");
          await pool.query(
            "ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true",
          );
          console.log("[MIGRATION] ai_enabled column ensured on whatsapp_connections");
        } catch (migrationError) {
          console.error(
            "[MIGRATION] Error adding ai_enabled column on whatsapp_connections:",
            migrationError,
          );
        }

        try {
          const { pool } = await import("./db");
          await pool.query(
            "ALTER TABLE admin_whatsapp_connection ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true",
          );
          console.log("[MIGRATION] ai_enabled column ensured on admin_whatsapp_connection");
        } catch (migrationError) {
          console.error(
            "[MIGRATION] Error adding ai_enabled column on admin_whatsapp_connection:",
            migrationError,
          );
        }
      } else {
        console.log("[MIGRATION] Direct startup ALTER TABLE statements skipped by runtime auto-migration flag");
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (areLocalWhatsAppRuntimeServicesEnabled()) {
        startStatefulAppServices();
      } else if (areStatefulAppServicesEnabled()) {
        console.log(
          "[FULL APP] Stateful job runtime enabled without local WhatsApp restore/services for this profile",
        );
      } else {
        console.log("[FULL APP] Stateful services disabled for this runtime profile");
      }
      startVpsCronScheduler({
        getPauseReason: getWhatsAppRestorePauseReason,
      });

      let shuttingDown = false;
      const gracefulShutdown = async (signal: string) => {
        if (shuttingDown) {
          return;
        }

        shuttingDown = true;
        stopStatefulAppServices();
        console.log(`[GRACEFUL SHUTDOWN] Received ${signal}`);

        try {
          server.close(() => console.log("[GRACEFUL SHUTDOWN] HTTP server closed"));
          await closeAllSessions();
          await flushPendingWhatsAppSessionSnapshots();
          await syncAllWhatsAppSessionSnapshots({
            includeAdmins: true,
            reason: `full-app-shutdown:${signal}`,
          });
          await closeDbPool();
          console.log("[GRACEFUL SHUTDOWN] Shutdown completed");
        } catch (error) {
          console.error("[GRACEFUL SHUTDOWN] Error:", error);
        }

        process.exit(0);
      };

      process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
      process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
      process.on("message", (message) => {
        if (message === "shutdown") {
          void gracefulShutdown("PM2_SHUTDOWN_MESSAGE");
        }
      });

      if (typeof process.send === "function") {
        process.send("ready");
      }
    },
  );
}
