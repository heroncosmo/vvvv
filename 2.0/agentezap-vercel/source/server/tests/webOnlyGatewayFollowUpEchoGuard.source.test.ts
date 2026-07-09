import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

assert.match(
  source,
  /shouldScheduleFollowUpForTrackedSharedAutomaticSource/,
  "web-only gateway must reuse the shared source policy for follow-up echoes",
);

assert.match(
  source,
  /last_message_time IS NULL\s+OR last_message_time <= \$3::timestamp/s,
  "stale outgoing echoes must not overwrite newer conversation summaries",
);

assert.match(
  source,
  /summaryUpdate\.rowCount > 0\s+&&\s+sourceAllowsFollowUpSchedule\s+&&\s+isWebOnlyFollowupWaitingForCompanyReplyReset/s,
  "gateway agent echo scheduling must require a fresh summary update and a non-follow-up source",
);

assert.match(
  source,
  /stale_agent_outgoing_echo/,
  "stale gateway echoes should report a distinct reason",
);

console.log("webOnlyGatewayFollowUpEchoGuard.source.test.ts ok");
