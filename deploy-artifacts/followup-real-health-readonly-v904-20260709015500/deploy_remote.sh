#!/usr/bin/env bash
set -euo pipefail

echo "[inspect-followup] active container"
docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}} restart={{.RestartCount}} started={{.State.StartedAt}}' agentezap-app

echo "[inspect-followup] public/local health"
curl -fsS http://127.0.0.1:5000/healthz
curl -fsS http://127.0.0.1:5000/api/health | grep -E '"mode":"monolith"|"runtimeProfile":"full"' || true

echo "[inspect-followup] env policy"
docker exec agentezap-app sh -lc '
  set -eu
  env | grep -E "^(AGENTEZAP_CODEX_CLI_(FOLLOWUP|TENANT|RODRIGO)_(MODEL|REASONING_EFFORT)|ENABLE_VPS_INTERNAL_CRONS|ENABLE_STATEFUL_INTERVAL_JOBS|STATEFUL_JOB_CRON_USER_FOLLOWUP_SCHEDULE|WEB_ONLY_FOLLOWUP_CRON_LIMIT|WEB_ONLY_FOLLOWUP_CRON_PER_USER_LIMIT|WEB_ONLY_FOLLOWUP_CRON_TIME_BUDGET_MS)=" | sort
'

echo "[inspect-followup] bundle model markers"
docker exec -i agentezap-app node - <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync("/app/dist/api/http.js", "utf8");
function block(label, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end <= start) throw new Error(`${label} block not found`);
  return source.slice(start, end);
}
const modelBlock = block("model selection", "function selectCodexModel", "function selectCodexTenantFallbackModel");
const reasoningBlock = block("reasoning selection", "function selectCodexReasoningEffort", "function buildCodexEnv");
const checks = {
  followupModelBeforeRodrigo:
    modelBlock.includes("AGENTEZAP_CODEX_CLI_FOLLOWUP_MODEL") &&
    modelBlock.indexOf("AGENTEZAP_CODEX_CLI_FOLLOWUP_MODEL") < modelBlock.indexOf("AGENTEZAP_CODEX_CLI_RODRIGO_MODEL"),
  followupDefaultMini: modelBlock.includes('"gpt-5.4-mini"'),
  followupReasoningBeforeRodrigo:
    reasoningBlock.includes("AGENTEZAP_CODEX_CLI_FOLLOWUP_REASONING_EFFORT") &&
    reasoningBlock.indexOf("AGENTEZAP_CODEX_CLI_FOLLOWUP_REASONING_EFFORT") < reasoningBlock.indexOf("AGENTEZAP_CODEX_CLI_RODRIGO_REASONING_EFFORT"),
  rodrigoNormalHigh: modelBlock.includes("AGENTEZAP_CODEX_CLI_RODRIGO_MODEL") && reasoningBlock.includes("AGENTEZAP_CODEX_CLI_RODRIGO_REASONING_EFFORT"),
  contextUsesActualModel: source.includes("model:${usedModel}"),
  followupTaskPresent: source.includes('task: "followup_plan"') || source.includes("task:\"followup_plan\""),
  asyncCronPresent: source.includes("[vercel-followup-cron] async complete"),
};
for (const [key, ok] of Object.entries(checks)) {
  if (!ok) throw new Error(`marker failed: ${key}`);
}
console.log(JSON.stringify(checks));
NODE

echo "[inspect-followup] recent cron logs"
recent="$(docker logs --since 4h agentezap-app 2>&1 || true)"
echo "$recent" | grep -aE 'VPS CRON|vercel-followup-cron|user-followup|agentic_followup|USER-FOLLOW-UP' | tail -n 120 || true

echo "[inspect-followup] recent error markers"
if echo "$recent" | grep -aE 'statement timeout|sanitizeWebOnlyAgenticToolName|structured_output_invalid|ReferenceError|AbortError|MODULE_NOT_FOUND|SyntaxError|UnhandledPromiseRejection|async failed'; then
  echo "[inspect-followup] ERROR_MARKER_FOUND" >&2
  exit 2
fi

echo "[inspect-followup] READONLY_OK"
