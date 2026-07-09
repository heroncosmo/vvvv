import type { Express, NextFunction, Request, Response } from "express";

import {
  getStatefulJobCronGroup,
  triggerStatefulJobCronGroup,
} from "./statefulJobCron";
import {
  delegateToVercelHttpHandler,
  handleWithVercelHttpParity,
  isVercelHttpParityEnabled,
} from "./vercelHttpParity";

function resolveCronTokens() {
  return [
    process.env.CRON_SECRET,
    process.env.STATEFUL_JOBS_RUNNER_TOKEN,
    process.env.APP_STATEFUL_JOBS_TOKEN,
    process.env.STATEFUL_JOBS_TOKEN,
  ]
    .map((value) => String(value || "").trim())
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function isAuthorizedCronRequest(req: Request) {
  const tokens = resolveCronTokens();
  if (!tokens.length) {
    return false;
  }

  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (tokens.includes(token)) {
      return true;
    }
  }

  const cronHeader = String(req.headers["x-cron-secret"] || "").trim();
  const jobHeader = String(req.headers["x-stateful-job-token"] || "").trim();
  return tokens.includes(cronHeader) || tokens.includes(jobHeader);
}

function requireCronAuth(req: Request, res: Response) {
  if (isAuthorizedCronRequest(req)) {
    return true;
  }

  res.status(401).json({
    success: false,
    message: "Unauthorized cron request",
  });
  return false;
}

function requireCronMethod(req: Request, res: Response) {
  if (req.method === "GET" || req.method === "POST") {
    return true;
  }

  res.status(405).json({
    success: false,
    message: "Cron route accepts GET or POST only",
  });
  return false;
}

function parseDispatchBody(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function shouldDispatchAsync(req: Request) {
  const body = parseDispatchBody((req as any).body);
  const raw =
    body.async ??
    (req.query as any)?.async ??
    req.headers["x-stateful-job-async"];
  const normalized = String(raw ?? "true").trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "no" && normalized !== "off";
}

async function dispatchCronGroup(req: Request, res: Response, groupId: string) {
  if (!requireCronMethod(req, res) || !requireCronAuth(req, res)) {
    return;
  }

  const group = getStatefulJobCronGroup(groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: `Unknown cron group: ${groupId}`,
    });
  }

  try {
    const result = await triggerStatefulJobCronGroup(group, {
      async: shouldDispatchAsync(req),
    });

    let dispatchBody: unknown = result.bodyText;
    try {
      dispatchBody = result.bodyText ? JSON.parse(result.bodyText) : null;
    } catch {
      dispatchBody = result.bodyText || null;
    }

    return res.status(result.ok ? 200 : result.status).json({
      success: result.ok,
      cronGroup: group.id,
      path: group.path,
      jobs: group.jobs,
      targetUrl: result.targetUrl,
      dispatchStatus: result.status,
      dispatchBody,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      cronGroup: group.id,
      path: group.path,
      jobs: group.jobs,
      message: error?.message || "Failed to dispatch cron group",
    });
  }
}

async function delegateVercelOnlyCron(req: Request, res: Response, next: NextFunction) {
  if (!requireCronMethod(req, res) || !requireCronAuth(req, res)) {
    return;
  }

  if (!isVercelHttpParityEnabled()) {
    return res.status(503).json({
      success: false,
      message: "ENABLE_VPS_VERCEL_HTTP_PARITY is required for this Vercel-only cron route",
    });
  }

  return handleWithVercelHttpParity(req, res, next);
}

async function delegateBuiltInVercelCron(req: Request, res: Response, next: NextFunction) {
  if (!requireCronMethod(req, res) || !requireCronAuth(req, res)) {
    return;
  }

  return delegateToVercelHttpHandler(req, res, next);
}

export function registerVpsCronRoutes(app: Express) {
  app.all("/api/cron/stateful-jobs/lead-sync", delegateBuiltInVercelCron);
  app.all("/api/cron/stateful-jobs/user-followup", delegateBuiltInVercelCron);

  app.all("/api/cron/stateful-jobs/:groupId", (req: Request, res: Response) => {
    void dispatchCronGroup(req, res, String(req.params.groupId || "").trim());
  });

  app.all("/api/cron/broadcast-campaigns", (req: Request, res: Response) => {
    void dispatchCronGroup(req, res, "broadcast-campaigns");
  });

  app.all("/api/cron/status-posts", (req: Request, res: Response) => {
    void dispatchCronGroup(req, res, "status-posts");
  });

  app.all("/api/cron/wa-gateway-reconcile", delegateVercelOnlyCron);
  app.all("/api/cron/google-calendar-sync", delegateVercelOnlyCron);
  app.all("/api/cron/google-contacts-sync", delegateVercelOnlyCron);
}
