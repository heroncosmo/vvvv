import type { Express, NextFunction, Request, Response } from "express";
import { broadcastToUser } from "./appRealtime";

const DEFAULT_GATEWAY_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isVercelHttpParityEnabled() {
  return isTruthyFlag(process.env.ENABLE_VPS_VERCEL_HTTP_PARITY);
}

function isMonolithRuntime() {
  return String(process.env.SERVICE_MODE || "").trim().toLowerCase() === "monolith";
}

function hasRemoteGatewayConfigured() {
  return Boolean(String(process.env.WA_GATEWAY_URL || "").trim());
}

function shouldDelegateGrupoOlxRoutesToVercelHttp() {
  if (!isMonolithRuntime()) {
    return true;
  }

  return hasRemoteGatewayConfigured();
}

type VercelHttpHandler = (req: any, res: any) => Promise<void>;

let vercelHttpHandlerPromise: Promise<VercelHttpHandler> | null = null;

function loadVercelHttpHandler() {
  if (!vercelHttpHandlerPromise) {
    // Built separately by scripts/build-app.js into dist/api/http.js.
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    const runtimeModuleUrl = new URL("./api/http.js", import.meta.url).href;
    vercelHttpHandlerPromise = dynamicImport(runtimeModuleUrl).then((module) => {
      const handler = (module as { default?: VercelHttpHandler }).default;
      if (typeof handler !== "function") {
        throw new Error("dist/api/http.js does not export a default handler");
      }
      return handler;
    });
  }

  return vercelHttpHandlerPromise;
}

function isInternalGatewayEventRequest(req: Request) {
  return req.method === "POST" && req.path === "/api/internal/wa-gateway/events";
}

function isInternalGatewayEventAuthorized(req: Request) {
  const expectedToken = process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_GATEWAY_INTERNAL_TOKEN;
  const providedToken =
    req.get("x-wa-gateway-token") ||
    req.get("x-internal-token") ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  return Boolean(expectedToken && providedToken && providedToken === expectedToken);
}

function broadcastGatewayEventToLocalPortal(req: Request) {
  if (!isInternalGatewayEventRequest(req) || !isInternalGatewayEventAuthorized(req)) {
    return;
  }

  const body = req.body;
  const userId = String(body?.userId || "").trim();
  const data = body?.data;
  if (!userId || !data || typeof data !== "object" || Array.isArray(data)) {
    return;
  }

  try {
    broadcastToUser(userId, data);
  } catch (error: any) {
    console.warn("[VPS VERCEL PARITY] Failed to broadcast gateway event to portal:", {
      userId,
      type: typeof data?.type === "string" ? data.type : null,
      error: error?.message || String(error),
    });
  }
}

export async function delegateToVercelHttpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    broadcastGatewayEventToLocalPortal(req);
    const vercelHttpHandler = await loadVercelHttpHandler();
    await vercelHttpHandler(req as any, res as any);
  } catch (error) {
    if (res.headersSent) {
      console.error("[VPS VERCEL PARITY] Handler failed after headers were sent:", error);
      return;
    }
    next(error);
  }
}

export function registerVercelHttpParityRoutes(app: Express) {
  app.all("/api/internal/wa-gateway/events", delegateToVercelHttpHandler);
  app.all("/api/internal/vercel-agent-queue/status", delegateToVercelHttpHandler);
  app.all("/api/dashboard/bootstrap", delegateToVercelHttpHandler);
  app.all("/api/plans/promo-eligibility", delegateToVercelHttpHandler);
  app.post("/api/subscriptions/create", delegateToVercelHttpHandler);
  app.post("/api/subscriptions/create-pix-subscription", delegateToVercelHttpHandler);
  app.post("/api/subscriptions/create-mp-subscription", delegateToVercelHttpHandler);
  app.get("/api/subscriptions/check-pix-status/:paymentId", delegateToVercelHttpHandler);
  app.get("/api/subscriptions/:subscriptionId", delegateToVercelHttpHandler);
  app.post("/api/payment-receipts/upload", delegateToVercelHttpHandler);
  app.all("/api/test-agent/message", delegateToVercelHttpHandler);
  app.all("/api/test-agent/session", delegateToVercelHttpHandler);
  app.all("/api/agent/test", delegateToVercelHttpHandler);
  app.all("/api/agent/test-session", delegateToVercelHttpHandler);
  app.all("/api/agent/edit-prompt-stream", delegateToVercelHttpHandler);
  app.all("/api/followup/config", delegateToVercelHttpHandler);
  app.all("/api/followup/reorganize", delegateToVercelHttpHandler);
  app.all("/api/followup/stats", delegateToVercelHttpHandler);
  app.all("/api/followup/analytics", delegateToVercelHttpHandler);
  app.all("/api/followup/logs", delegateToVercelHttpHandler);
  app.all("/api/followup/pending", delegateToVercelHttpHandler);
  app.all("/api/followup/conversation/:id/status", delegateToVercelHttpHandler);
  app.all("/api/followup/conversation/:id/toggle", delegateToVercelHttpHandler);
  app.all("/api/followup/conversation/:id/schedule", delegateToVercelHttpHandler);
  app.all("/api/followup/conversation/:id/trigger", delegateToVercelHttpHandler);
  app.all("/api/scheduling/google-calendar/connect", delegateToVercelHttpHandler);
  app.all("/api/scheduling/google-calendar/status", delegateToVercelHttpHandler);
  app.all("/api/scheduling/google-calendar/calendar", delegateToVercelHttpHandler);
  app.all("/api/scheduling/google-calendar/disconnect", delegateToVercelHttpHandler);
  app.all("/api/meta-formulario/google/callback", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/callback", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/status", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/configured", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/auth", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/disconnect", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/events", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/check-availability", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/sync-appointment/:appointmentId", delegateToVercelHttpHandler);
  app.all("/api/google-calendar/event/:eventId", delegateToVercelHttpHandler);
  if (shouldDelegateGrupoOlxRoutesToVercelHttp()) {
    app.all("/api/integrations/grupo-olx", delegateToVercelHttpHandler);
    app.all("/api/integrations/grupo-olx/*", delegateToVercelHttpHandler);
  }
}

export function registerVercelHttpFallbackRoutes(app: Express) {
  if (!isVercelHttpParityEnabled()) {
    return;
  }

  app.all("/api/*", delegateToVercelHttpHandler);
}

export async function handleWithVercelHttpParity(req: Request, res: Response, next: NextFunction) {
  if (!isVercelHttpParityEnabled()) {
    return next();
  }

  return delegateToVercelHttpHandler(req, res, next);
}
