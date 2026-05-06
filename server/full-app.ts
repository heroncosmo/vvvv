/**
 * Full Application Entry Point (Worker/Monolith mode)
 * 
 * Este módulo contém toda a lógica do servidor completo:
 * Express, routes, WhatsApp sessions, background services.
 * 
 * É carregado dinamicamente por index.ts quando SERVICE_MODE != 'proxy'
 */
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { restoreExistingSessions, restoreAdminSessions, restorePendingAITimers, startConnectionHealthCheck, startPendingTimersCron, startAutoRecoveryCron } from "./whatsapp";
import { startWhatsAppLeaderElection } from "./whatsappLeaderLock";
import { followUpService } from "./followUpService";
import { appointmentReminderService } from "./appointmentReminderService";
import { paymentReminderService } from "./paymentReminderService";
import { statusSchedulerService } from "./statusSchedulerService";
import { startAutoReactivationService } from "./autoReactivateService";
import { startDailySyncCron } from "./fullContactSyncService";
import { startMediaCleanupService } from "./mediaCleanupService";
import { startNotificationScheduler } from "./notificationSchedulerService";
import { seedDatabase } from "./seed";
import path from "path";
import fs from "fs";

function isFalsyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

// Module augmentation must be at top level
declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

export async function startFullApp() {
  // 🛡️ MODO DESENVOLVIMENTO: Aviso de proteção de produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║  🛡️  MODO DESENVOLVIMENTO ATIVO - PROTEÇÃO DE PRODUÇÃO              ║');
    console.log('║                                                                      ║');
    console.log('║  SKIP_WHATSAPP_RESTORE=true                                          ║');
    console.log('║                                                                      ║');
    console.log('║  ✅ Sessões WhatsApp do Railway NÃO serão afetadas                   ║');
    console.log('║  ✅ Conexões/desconexões de WhatsApp bloqueadas localmente           ║');
    console.log('║  ✅ Banco de dados compartilhado, mas estado WA preservado           ║');
    console.log('║                                                                      ║');
    console.log('║  Para conectar WhatsApp em dev, remova SKIP_WHATSAPP_RESTORE do .env ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('\n');
  }

  const app = express();

  // CORS: permite credenciais (cookies de sessão) para o frontend
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:5000'];

  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requests sem origin (ex: mobile, Postman) ou origins permitidas
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Em same-origin (Railway), origin é o próprio servidor
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Keep the process alive
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Keep the process alive
  });

  app.use(express.json({
    limit: '50mb',
    verify: (req: any, _res: any, buf: any) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: '50mb', extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (reqPath.startsWith("/api")) {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
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

  // Serve uploaded ticket attachments
  const uploadsPath = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));

  // Serve static assets from findeas theme and client public (fallback)
  const findeasThemePath = path.join(process.cwd(), 'findeas theme');
  const clientPublicAssetsPath = path.join(process.cwd(), 'client', 'public', 'assets');

  if (fs.existsSync(clientPublicAssetsPath)) {
    app.use('/assets', express.static(clientPublicAssetsPath));
  }
  if (fs.existsSync(path.join(findeasThemePath, 'assets'))) {
    app.use('/assets', express.static(path.join(findeasThemePath, 'assets')));
  }

  // Lightweight health endpoints for uptime checks
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', mode: process.env.SERVICE_MODE || 'monolith' });
  });
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  // Serve landing page HTML for unauthenticated root route
  app.get('/', (req: Request, res: Response, next) => {
    const hasAuthCookie = req.headers.cookie?.includes('connect.sid');
    const forceRootLanding = process.env.FORCE_ROOT_LANDING !== 'false';
    const explicitAppMode = req.query?.app === '1';
    const shouldServeLanding = !explicitAppMode && (forceRootLanding || !hasAuthCookie);

    if (shouldServeLanding) {
      const landingPath = path.join(findeasThemePath, 'landing-5.html');
      if (fs.existsSync(landingPath)) {
        return res.sendFile(landingPath);
      }
    }

    next();
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, async () => {
    log(`serving on port ${port}`);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      await seedDatabase();
    } catch (error) {
      console.error("Failed to seed database:", error);
    }
    
    // Runtime migration: add ai_enabled column to whatsapp_connections if not exists
    try {
      const { pool } = await import("./db");
      await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true`);
      console.log("[MIGRATION] ai_enabled column ensured on whatsapp_connections");
    } catch (migErr) {
      console.error("[MIGRATION] Error adding ai_enabled column (may already exist):", migErr);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const disableBackgroundJobs =
      process.env.DISABLE_BACKGROUND_SERVICES === 'true' ||
      process.env.DISABLE_BACKGROUND_JOBS === 'true' ||
      process.env.DISABLE_WHATSAPP_PROCESSING === 'true' ||
      isFalsyFlag(process.env.ENABLE_STATEFUL_INTERVAL_JOBS);

    if (disableBackgroundJobs) {
      console.log('[RUNTIME] Background jobs disabled by runtime flags');
      return;
    }

    startWhatsAppLeaderElection({
      onLeader: async () => {
        restoreExistingSessions().catch((error) => {
          console.error('Failed to restore WhatsApp sessions:', error);
        });
        startConnectionHealthCheck();

        restoreAdminSessions().catch((error) => {
          console.error('Failed to restore admin WhatsApp sessions:', error);
        });

        setTimeout(() => {
          restorePendingAITimers().catch((error) => {
            console.error('Failed to restore pending AI timers:', error);
          });
          startPendingTimersCron();
          startAutoRecoveryCron();
        }, 10000);

        followUpService.start();
        appointmentReminderService.start();
        paymentReminderService.start();
        statusSchedulerService.start();
        startAutoReactivationService();
        startDailySyncCron();
        startMediaCleanupService();
        startNotificationScheduler();
      },
    });
  });
}
