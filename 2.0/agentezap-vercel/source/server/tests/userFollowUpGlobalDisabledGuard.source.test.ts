import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceSource = readFileSync(join(process.cwd(), "server", "userFollowUpService.ts"), "utf8");
const routesSource = readFileSync(join(process.cwd(), "server", "routes_user_followup.ts"), "utf8");
const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

assert.match(
  serviceSource,
  /getFollowUpStats[\s\S]*const config = await this\.getFollowupConfig\(userId\);[\s\S]*pending: 0,[\s\S]*scheduledToday: 0,/,
  "stateful stats must return an empty queue when the global follow-up config is disabled",
);

assert.match(
  serviceSource,
  /getPendingFollowUps[\s\S]*const config = await this\.getFollowupConfig\(userId\);[\s\S]*return \[\];/,
  "stateful pending list must be empty when the global follow-up config is disabled",
);

assert.match(
  serviceSource,
  /scheduleManualFollowUp[\s\S]*GLOBAL_FOLLOWUP_DISABLED_REASON_ASCII[\s\S]*O Follow-up Inteligente esta desligado nesta conta/,
  "manual scheduling must not create a queue item while the global config is disabled",
);

assert.match(
  routesSource,
  /isGlobalFollowUpEnabledForUser[\s\S]*config\?\.isEnabled === true/,
  "native follow-up routes must read the global follow-up config before per-conversation actions",
);

assert.match(
  routesSource,
  /conversation\/:id\/status[\s\S]*isGlobalFollowUpEnabledForUser\(userId\)[\s\S]*active: false[\s\S]*nextFollowupAt: null/,
  "native conversation status must report inactive while the global config is disabled",
);

assert.match(
  httpSource,
  /isWebOnlyFollowupEnabledForUser[\s\S]*followup_configs[\s\S]*is_enabled = true/,
  "web-only routes must have a single global follow-up enabled check",
);

assert.match(
  httpSource,
  /handleFollowupConversationStatus[\s\S]*isWebOnlyFollowupEnabledForUser\(user\.id\)[\s\S]*active: false[\s\S]*nextFollowupAt: null/,
  "web-only conversation status must report inactive while the global config is disabled",
);

assert.match(
  httpSource,
  /handleFollowupConversationSchedule[\s\S]*isWebOnlyFollowupEnabledForUser\(user\.id\)[\s\S]*followup_active = false[\s\S]*next_followup_at = NULL/,
  "web-only manual scheduling must clear stale queue state while the global config is disabled",
);

console.log("userFollowUpGlobalDisabledGuard.source.test.ts ok");
