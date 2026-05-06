import type { Express, Request, Response } from "express";

import { isAdmin } from "./middleware";
import {
  getStatefulJobCronGroup,
  listStatefulJobCronGroups,
  resolveStatefulJobsBaseUrl,
  triggerStatefulJobCronGroup,
  triggerStatefulJobs,
} from "./statefulJobCron";
import { getStatefulJobDefinition, listStatefulJobs } from "./statefulAppJobs";

function parseAsyncFlag(req: Request): boolean {
  const bodyValue = (req as any).body?.async;
  if (bodyValue === false || bodyValue === "false" || bodyValue === 0 || bodyValue === "0") {
    return false;
  }

  const queryValue = String((req.query as any)?.async || "").trim().toLowerCase();
  if (queryValue === "false" || queryValue === "0" || queryValue === "no") {
    return false;
  }

  return true;
}

export function registerStatefulJobDispatchRoutes(app: Express) {
  app.get("/api/admin/stateful-job-crons", isAdmin, async (_req: Request, res: Response) => {
    return res.json({
      success: true,
      baseUrlConfigured: Boolean(resolveStatefulJobsBaseUrl()),
      groups: listStatefulJobCronGroups(),
      jobs: listStatefulJobs(),
    });
  });

  app.post("/api/admin/stateful-job-crons/:groupId/run", isAdmin, async (req: Request, res: Response) => {
    const groupId = String(req.params.groupId || "").trim();
    const group = getStatefulJobCronGroup(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: `Unknown stateful cron group: ${groupId}`,
      });
    }

    try {
      const result = await triggerStatefulJobCronGroup(group, {
        async: parseAsyncFlag(req),
      });

      let parsedBody: any = null;
      try {
        parsedBody = result.bodyText ? JSON.parse(result.bodyText) : null;
      } catch {
        parsedBody = result.bodyText || null;
      }

      return res.status(result.ok ? 200 : result.status).json({
        success: result.ok,
        cronGroup: group.id,
        jobs: group.jobs,
        targetUrl: result.targetUrl,
        dispatchStatus: result.status,
        dispatchBody: parsedBody,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        cronGroup: group.id,
        jobs: group.jobs,
        message: error?.message || "Failed to dispatch stateful cron group",
      });
    }
  });

  app.post("/api/admin/stateful-jobs/dispatch", isAdmin, async (req: Request, res: Response) => {
    const jobs = Array.isArray((req as any).body?.jobs)
      ? ((req as any).body.jobs as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (jobs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide body.jobs with at least one stateful job name.",
      });
    }

    const invalidJobs = jobs.filter((jobName) => !getStatefulJobDefinition(jobName));
    if (invalidJobs.length > 0) {
      return res.status(404).json({
        success: false,
        message: `Unknown stateful jobs: ${invalidJobs.join(", ")}`,
      });
    }

    try {
      const result = await triggerStatefulJobs(jobs, {
        async: parseAsyncFlag(req),
        source: "admin-dispatch",
      });

      let parsedBody: any = null;
      try {
        parsedBody = result.bodyText ? JSON.parse(result.bodyText) : null;
      } catch {
        parsedBody = result.bodyText || null;
      }

      return res.status(result.ok ? 200 : result.status).json({
        success: result.ok,
        jobs,
        targetUrl: result.targetUrl,
        dispatchStatus: result.status,
        dispatchBody: parsedBody,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        jobs,
        message: error?.message || "Failed to dispatch stateful jobs",
      });
    }
  });
}
