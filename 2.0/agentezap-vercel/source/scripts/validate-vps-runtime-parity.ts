import fs from "node:fs";
import path from "node:path";

import {
  listStatefulJobCronGroups,
  resolveEnabledStatefulJobCronGroups,
} from "../server/statefulJobCron";

const expectedCronPaths = [
  "/api/cron/stateful-jobs/fast-core",
  "/api/cron/stateful-jobs/user-followup",
  "/api/cron/stateful-jobs/lead-sync",
  "/api/cron/broadcast-campaigns",
  "/api/cron/status-posts",
  "/api/cron/wa-gateway-reconcile",
  "/api/cron/google-calendar-sync",
  "/api/cron/google-contacts-sync",
  "/api/cron/stateful-jobs/media-cleanup",
  "/api/cron/stateful-jobs/payment-reminders",
  "/api/cron/stateful-jobs/daily-contact-sync",
  "/api/cron/stateful-jobs/blog-automation",
];

function fail(message: string): never {
  console.error(`[vps-parity] FAIL: ${message}`);
  process.exit(1);
}

function readWorkspaceFile(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing file ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readStatefulJobNames() {
  const source = readWorkspaceFile("server/statefulAppJobs.ts");
  const marker = "const STATEFUL_JOB_DEFINITIONS";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    fail("Could not find STATEFUL_JOB_DEFINITIONS in server/statefulAppJobs.ts");
  }

  const names = new Set<string>();
  const definitionBlock = source.slice(markerIndex);
  const regex = /^\s+"([^"]+)":\s*\{/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(definitionBlock))) {
    names.add(match[1]);
  }

  if (names.size === 0) {
    fail("Could not read any stateful job names from server/statefulAppJobs.ts");
  }

  return names;
}

const groups = listStatefulJobCronGroups();
const groupsByPath = new Map(groups.map((group) => [group.path, group]));
const knownStatefulJobs = readStatefulJobNames();

for (const expectedPath of expectedCronPaths) {
  if (!groupsByPath.has(expectedPath)) {
    fail(`Missing cron path ${expectedPath}`);
  }
}

for (const group of groups) {
  const missingJobs = group.jobs.filter((jobName) => !knownStatefulJobs.has(jobName));
  if (missingJobs.length > 0) {
    fail(`Cron group ${group.id} references unknown jobs: ${missingJobs.join(", ")}`);
  }
}

const enabledGroups = resolveEnabledStatefulJobCronGroups();
const seenJobs = new Map<string, string>();
for (const group of enabledGroups) {
  for (const jobName of group.jobs) {
    const previousGroup = seenJobs.get(jobName);
    if (previousGroup) {
      fail(`Enabled cron job ${jobName} is duplicated in ${previousGroup} and ${group.id}`);
    }
    seenJobs.set(jobName, group.id);
  }
}

const compose = readWorkspaceFile("../../infra/vps-single/compose.yml");
if (!compose.includes('ENABLE_VPS_INTERNAL_CRONS: "false"')) {
  fail("compose.yml must keep ENABLE_VPS_INTERNAL_CRONS disabled before cutover");
}
if (!compose.includes('VERCEL_CRONS_STILL_ENABLED: "true"')) {
  fail("compose.yml must mark Vercel crons as still enabled before cutover");
}
if (!compose.includes('ENABLE_VPS_VERCEL_HTTP_PARITY: "true"')) {
  fail("compose.yml must enable Vercel HTTP parity on the api service");
}

const apiEnvExample = readWorkspaceFile("../../infra/vps-single/env/api.env.example");
if (!apiEnvExample.includes("ENABLE_VPS_VERCEL_HTTP_PARITY=true")) {
  fail("api.env.example must document ENABLE_VPS_VERCEL_HTTP_PARITY=true");
}
if (!apiEnvExample.includes("STATEFUL_JOBS_BASE_URL=http://worker:5000")) {
  fail("api.env.example must point stateful job dispatch to the worker");
}

const workerEnvExample = readWorkspaceFile("../../infra/vps-single/env/worker.env.example");
if (!workerEnvExample.includes("ENABLE_VPS_INTERNAL_CRONS=false")) {
  fail("worker.env.example must keep VPS internal crons disabled before cutover");
}
if (!workerEnvExample.includes("VERCEL_CRONS_STILL_ENABLED=true")) {
  fail("worker.env.example must guard against duplicate Vercel cron execution");
}
if (!workerEnvExample.includes("VPS_CRON_TARGET_BASE_URL=http://api:5000")) {
  fail("worker.env.example must target api service for cron dispatch");
}

console.log("[vps-parity] OK", {
  cronGroups: groups.length,
  enabledGroups: enabledGroups.map((group) => group.id),
  expectedCronPaths: expectedCronPaths.length,
});
