/**
 * Full application entry point.
 *
 * Loaded by index.ts whenever SERVICE_MODE is not "proxy" or "wa-gateway".
 */
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import {
  closeAllSessions,
  restoreAdminSessions,
  restoreExistingSessions,
  restorePendingAITimers,
  startAutoRecoveryCron,
  startConnectionHealthCheck,
  startPendingTimersCron,
  stopAutoRecoveryCron,
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
import { closeDbPool } from "./db";
import { repairMojibakeDeep, repairMojibakeText } from "@shared/mojibake";
import { ensureWhatsAppRuntimeSchema } from "./whatsappRuntimeMigrations";
import {
  areStatefulAppServicesEnabled,
  describeAppRuntimeProfile,
} from "./runtimeProfile";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function startStatefulAppServices() {
  startWhatsAppLeaderElection({
    onLeader: async () => {
      restoreExistingSessions().catch((error) => {
        console.error("Failed to restore WhatsApp sessions:", error);
      });
      startConnectionHealthCheck();

      restoreAdminSessions().catch((error) => {
        console.error("Failed to restore admin WhatsApp sessions:", error);
      });

      setTimeout(() => {
        restorePendingAITimers().catch((error) => {
          console.error("Failed to restore pending AI timers:", error);
        });
        startPendingTimersCron();
        startAutoRecoveryCron();
      }, 10000);

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
  stopAutoStartedStatefulIntervalJobs();
  stopPendingTimersCron();
  stopAutoRecoveryCron();
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

  const app = express();

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [process.env.FRONTEND_URL || "http://localhost:5173", "http://localhost:5000"];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });

  app.use(
    express.json({
      limit: "50mb",
      verify: (req: any, _res: any, buf: any) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: "50mb", extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined;

    const originalResSend = res.send.bind(res);
    const originalResJson = res.json;

    res.send = function patchedSend(body, ...args) {
      if (!reqPath.startsWith("/api")) {
        return originalResSend(body, ...args);
      }

      if (typeof body === "string") {
        return originalResSend(repairMojibakeText(body), ...args);
      }

      if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
        return originalResSend(repairMojibakeDeep(body), ...args);
      }

      return originalResSend(body, ...args);
    };

    res.json = function patchedJson(bodyJson, ...args) {
      const normalizedBody = repairMojibakeDeep(bodyJson);
      capturedJsonResponse = normalizedBody;
      return originalResJson.apply(res, [normalizedBody, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (!reqPath.startsWith("/api")) {
        return;
      }

      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = `${logLine.slice(0, 79)}...`;
      }

      log(logLine);
    });

    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  const uploadsPath = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsPath));

  const findeasThemePath = path.join(process.cwd(), "findeas theme");
  const clientPublicAssetsPath = path.join(process.cwd(), "client", "public", "assets");

  if (fs.existsSync(clientPublicAssetsPath)) {
    app.use("/assets", express.static(clientPublicAssetsPath));
  }
  if (fs.existsSync(path.join(findeasThemePath, "assets"))) {
    app.use("/assets", express.static(path.join(findeasThemePath, "assets")));
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      mode: process.env.SERVICE_MODE || "monolith",
      runtimeProfile: describeAppRuntimeProfile(),
    });
  });
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).send("ok");
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    async () => {
      log(`serving on port ${port}`);
      console.log(`[FULL APP] Runtime profile: ${describeAppRuntimeProfile()}`);

      await ensureWhatsAppRuntimeSchema();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        await seedDatabase();
      } catch (error) {
        console.error("Failed to seed database:", error);
      }

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

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (areStatefulAppServicesEnabled()) {
        startStatefulAppServices();
      } else {
        console.log("[FULL APP] Stateful services disabled for this runtime profile");
      }

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
