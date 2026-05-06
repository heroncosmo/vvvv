import type { Express, Request, Response } from "express";

import {
  areStatefulIntervalJobsAutoStartEnabled,
  getStatefulJobDefinition,
  listStatefulJobs,
  runStatefulJob,
} from "./statefulAppJobs";
import { areStatefulAppServicesEnabled, describeAppRuntimeProfile } from "./runtimeProfile";

function resolveStatefulJobToken(): string {
  return String(
    process.env.APP_STATEFUL_JOBS_TOKEN ||
      process.env.STATEFUL_JOBS_TOKEN ||
      process.env.CRON_SECRET ||
      "",
  ).trim();
}

function isAuthorizedStatefulJobRequest(req: Request): boolean {
  const expectedToken = resolveStatefulJobToken();
  if (!expectedToken) {
    return false;
  }

  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token === expectedToken) {
      return true;
    }
  }

  const headerToken = String(req.headers["x-stateful-job-token"] || "").trim();
  return headerToken === expectedToken;
}

function requireStatefulJobAuth(req: Request, res: Response): boolean {
  if (isAuthorizedStatefulJobRequest(req)) {
    return true;
  }

  res.status(401).json({
    success: false,
    message: "Unauthorized stateful job request",
  });
  return false;
}

function shouldRunStatefulJobAsync(req: Request): boolean {
  const queryAsync = String((req.query as any)?.async || "").trim().toLowerCase();
  if (queryAsync === "1" || queryAsync === "true" || queryAsync === "yes") {
    return true;
  }

  const headerAsync = String(req.headers["x-stateful-job-async"] || "").trim().toLowerCase();
  if (headerAsync === "1" || headerAsync === "true" || headerAsync === "yes") {
    return true;
  }

  const bodyAsync = (req as any).body?.async;
  return bodyAsync === true || bodyAsync === "true" || bodyAsync === 1 || bodyAsync === "1";
}

function dispatchStatefulJobAsync(jobName: string) {
  setImmediate(async () => {
    const startedAt = Date.now();

    try {
      const result = await runStatefulJob(jobName);
      console.log(
        `[STATEFUL JOBS] Async job completed job=${jobName} durationMs=${Date.now() - startedAt} result=${JSON.stringify(result)}`,
      );
    } catch (error: any) {
      console.error(`[STATEFUL JOBS] Async job failed job=${jobName}:`, error);
    }
  });
}

function dispatchStatefulJobBatchAsync(jobNames: string[]) {
  setImmediate(async () => {
    for (const jobName of jobNames) {
      const startedAt = Date.now();
      try {
        const result = await runStatefulJob(jobName);
        console.log(
          `[STATEFUL JOBS] Async batch job completed job=${jobName} durationMs=${Date.now() - startedAt} result=${JSON.stringify(result)}`,
        );
      } catch (error: any) {
        console.error(`[STATEFUL JOBS] Async batch job failed job=${jobName}:`, error);
      }
    }
  });
}

export function registerStatefulJobRoutes(app: Express) {
  app.get("/api/internal/stateful-jobs", async (req: Request, res: Response) => {
    if (!requireStatefulJobAuth(req, res)) {
      return;
    }

    res.json({
      success: true,
      runtimeProfile: describeAppRuntimeProfile(),
      statefulRuntimeEnabled: areStatefulAppServicesEnabled(),
      autoStartEnabled: areStatefulIntervalJobsAutoStartEnabled(),
      jobs: listStatefulJobs(),
    });
  });

  app.post("/api/internal/stateful-jobs/:jobName/run", async (req: Request, res: Response) => {
    if (!requireStatefulJobAuth(req, res)) {
      return;
    }

    const jobName = String(req.params.jobName || "").trim();
    const definition = getStatefulJobDefinition(jobName);
    if (!definition) {
      return res.status(404).json({
        success: false,
        message: `Unknown stateful job: ${jobName}`,
      });
    }

    if (definition.requiresStatefulRuntime && !areStatefulAppServicesEnabled()) {
      return res.status(409).json({
        success: false,
        message: "This job requires a stateful runtime with background services enabled.",
        runtimeProfile: describeAppRuntimeProfile(),
        statefulRuntimeEnabled: false,
      });
    }

    if (shouldRunStatefulJobAsync(req)) {
      dispatchStatefulJobAsync(jobName);
      return res.status(202).json({
        success: true,
        accepted: true,
        async: true,
        job: jobName,
        runtimeProfile: describeAppRuntimeProfile(),
      });
    }

    const startedAt = Date.now();
    try {
      const result = await runStatefulJob(jobName);
      return res.json({
        success: true,
        job: jobName,
        runtimeProfile: describeAppRuntimeProfile(),
        durationMs: Date.now() - startedAt,
        ...result,
      });
    } catch (error: any) {
      console.error(`[STATEFUL JOBS] Error running ${jobName}:`, error);
      return res.status(500).json({
        success: false,
        job: jobName,
        message: error?.message || "Failed to run stateful job",
      });
    }
  });

  app.post("/api/internal/stateful-jobs/run", async (req: Request, res: Response) => {
    if (!requireStatefulJobAuth(req, res)) {
      return;
    }

    const requestedJobs = Array.isArray((req as any).body?.jobs)
      ? ((req as any).body.jobs as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (requestedJobs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide body.jobs with at least one stateful job name.",
      });
    }

    const invalidJobs = requestedJobs.filter((jobName) => !getStatefulJobDefinition(jobName));
    if (invalidJobs.length > 0) {
      return res.status(404).json({
        success: false,
        message: `Unknown stateful jobs: ${invalidJobs.join(", ")}`,
      });
    }

    const blockedJobs = requestedJobs.filter((jobName) => {
      const definition = getStatefulJobDefinition(jobName);
      return Boolean(definition?.requiresStatefulRuntime) && !areStatefulAppServicesEnabled();
    });
    if (blockedJobs.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Current runtime cannot execute: ${blockedJobs.join(", ")}`,
        runtimeProfile: describeAppRuntimeProfile(),
        statefulRuntimeEnabled: false,
      });
    }

    if (shouldRunStatefulJobAsync(req)) {
      dispatchStatefulJobBatchAsync(requestedJobs);
      return res.status(202).json({
        success: true,
        accepted: true,
        async: true,
        runtimeProfile: describeAppRuntimeProfile(),
        jobs: requestedJobs,
      });
    }

    const results: Record<string, any> = {};
    for (const jobName of requestedJobs) {
      const startedAt = Date.now();
      results[jobName] = {
        ...(await runStatefulJob(jobName)),
        durationMs: Date.now() - startedAt,
      };
    }

    return res.json({
      success: true,
      runtimeProfile: describeAppRuntimeProfile(),
      results,
    });
  });
}
