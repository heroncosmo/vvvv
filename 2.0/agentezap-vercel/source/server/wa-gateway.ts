import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";

import { closeDbPool } from "./db";
import { registerGatewayPublicApiRoutes } from "./routes_gateway_public_api";
import { registerWhatsAppGatewayInternalRoutes } from "./routes_wa_gateway_internal";
import { ensureWhatsAppRuntimeSchema } from "./whatsappRuntimeMigrations";
import {
  closeAllSessions,
  restoreExistingSessions,
  restorePendingAITimers,
  startAutoRecoveryCron,
  startConnectionHealthCheck,
  startPendingTimersCron,
  stopAutoRecoveryCron,
  stopConnectionHealthCheck,
  stopPendingTimersCron,
} from "./whatsapp";
import {
  flushPendingWhatsAppSessionSnapshots,
  restoreWhatsAppSessionSnapshotsFromStorage,
  startWhatsAppSessionSnapshotCron,
  stopWhatsAppSessionSnapshotCron,
  syncAllWhatsAppSessionSnapshots,
} from "./whatsappSessionSnapshotService";

export async function startWhatsAppGateway() {
  const app = express();

  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: false }));

  registerWhatsAppGatewayInternalRoutes(app);
  registerGatewayPublicApiRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5001", 10);
  const server = app.listen(port, "0.0.0.0", async () => {
    console.log(`[WA GATEWAY] Listening on port ${port}`);
    console.log(
      `[WA GATEWAY] Runtime version ${process.env.PWA_VERSION || process.env.VITE_PWA_VERSION || "unknown"}`,
    );

    await ensureWhatsAppRuntimeSchema();

    const disableBackgroundJobs = process.env.DISABLE_WHATSAPP_PROCESSING === "true";
    if (!disableBackgroundJobs) {
      try {
        await restoreWhatsAppSessionSnapshotsFromStorage({
          includeAdmins: false,
          missingOnly: true,
          reason: "gateway-boot",
        });
      } catch (error) {
        console.error("[WA GATEWAY] Failed to restore session snapshots:", error);
      }

      try {
        console.log("[WA GATEWAY] Starting blocking restore of customer sessions before jobs...");
        await restoreExistingSessions();
        console.log("[WA GATEWAY] Initial customer session restore finished.");
      } catch (error) {
        console.error("[WA GATEWAY] Failed to restore sessions:", error);
      }

      startConnectionHealthCheck();

      try {
        await restorePendingAITimers();
      } catch (error) {
        console.error("[WA GATEWAY] Failed to restore pending AI timers:", error);
      }

      startPendingTimersCron();
      startAutoRecoveryCron();
      startWhatsAppSessionSnapshotCron(false);
    }

    if (typeof process.send === "function") {
      process.send("ready");
    }
  });

  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[WA GATEWAY] Graceful shutdown via ${signal}`);
    try {
      stopConnectionHealthCheck();
      stopPendingTimersCron();
      stopAutoRecoveryCron();
      stopWhatsAppSessionSnapshotCron();
      server.close();
      await closeAllSessions();
      await flushPendingWhatsAppSessionSnapshots();
      await syncAllWhatsAppSessionSnapshots({
        includeAdmins: false,
        reason: `gateway-shutdown:${signal}`,
      });
      await closeDbPool();
    } catch (error) {
      console.error("[WA GATEWAY] Graceful shutdown error:", error);
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
}
