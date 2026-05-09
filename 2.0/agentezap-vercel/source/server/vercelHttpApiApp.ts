import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import type { Server } from "http";

import { repairMojibakeDeep, repairMojibakeText } from "@shared/mojibake";
import { registerWebOnlyRoutes } from "./httpWebRoutes";
import { describeAppRuntimeProfile } from "./runtimeProfile";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

let processHandlersRegistered = false;

function registerProcessHandlersOnce() {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });
}

function resolveAllowedOrigins() {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [process.env.FRONTEND_URL || "http://localhost:5173", "http://localhost:5000"];
}

function logApiLine(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [express] ${message}`);
}

function applyApiLogging(app: Express) {
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

      logApiLine(logLine);
    });

    next();
  });
}

function mountHealthRoutes(app: Express) {
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
}

export async function createVercelHttpApiApp(): Promise<{ app: Express; server: Server }> {
  const app = express();
  const allowedOrigins = resolveAllowedOrigins();

  registerProcessHandlersOnce();

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

  app.use(
    express.json({
      limit: "50mb",
      verify: (req: any, _res: any, buf: any) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: "50mb", extended: false }));

  applyApiLogging(app);

  const server = await registerWebOnlyRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  mountHealthRoutes(app);

  return { app, server };
}
