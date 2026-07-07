#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/opt/agentezap-single/compose"

echo "POLICY_AUDIT_READONLY_VALIDATE_START"

cd "$COMPOSE_DIR"
APP_CONTAINER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "app_container_found=no"
  exit 1
fi

echo "app_container_found=yes"
docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER"

printf 'healthz='
curl -fsS --max-time 10 http://127.0.0.1:5000/healthz
echo
printf 'api_health='
curl -fsS --max-time 10 http://127.0.0.1:5000/api/health
echo

docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
const env = process.env;
const snapshot = {
  cronSecretPresent: Boolean(env.CRON_SECRET),
  appTokenPresent: Boolean(env.STATEFUL_JOBS_TOKEN || env.APP_STATEFUL_JOBS_TOKEN || env.STATEFUL_JOBS_RUNNER_TOKEN),
  statefulGroupsHasPolicyAudit: String(env.STATEFUL_JOB_CRON_GROUPS || "").split(",").includes("policy-audit"),
  policyAuditEnabled: env.AGENTEZAP_POLICY_AUDIT_ENABLED || null,
  policyAuditDryRun: env.AGENTEZAP_POLICY_AUDIT_DRY_RUN || null,
  policyAuditMaxCandidates: env.AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES || null,
  policyAuditMediaEvidenceLimit: env.AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT || null,
  policyAuditModel: env.AGENTEZAP_POLICY_AUDIT_CODEX_MODEL || null,
  policyAuditReasoning: env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT || null
};
console.log(JSON.stringify(snapshot));
const enabled = String(env.AGENTEZAP_POLICY_AUDIT_ENABLED || "").trim().toLowerCase();
const dryRun = String(env.AGENTEZAP_POLICY_AUDIT_DRY_RUN || "").trim().toLowerCase();
if (enabled !== "false" || dryRun !== "true") {
  console.error("POLICY_AUDIT_READONLY_ABORT_NOT_DRYRUN");
  process.exit(2);
}
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_READONLY_ABORT_MISSING_JOB_GUARD");
  process.exit(3);
}
NODE'

docker exec "$APP_CONTAINER" sh -lc 'codex login status >/tmp/policy-audit-codex-status.txt 2>&1 && echo codex_login_status=ok || echo codex_login_status=fail; rm -f /tmp/policy-audit-codex-status.txt'

cron_status="$(curl -sS -o /tmp/policy-audit-cron-unauth-body.txt -w '%{http_code}' --max-time 10 http://127.0.0.1:5000/api/cron/stateful-jobs/policy-audit || true)"
rm -f /tmp/policy-audit-cron-unauth-body.txt
echo "cron_without_token_status=${cron_status}"
if [ "$cron_status" != "401" ]; then
  echo "POLICY_AUDIT_READONLY_ABORT_CRON_AUTH_WEAK"
  exit 4
fi

docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
async function main() {
  const token = process.env.STATEFUL_JOBS_TOKEN || process.env.APP_STATEFUL_JOBS_TOKEN || process.env.STATEFUL_JOBS_RUNNER_TOKEN || process.env.CRON_SECRET;
  if (!token) {
    console.log(JSON.stringify({ internalJobTokenPresent: false }));
    process.exit(5);
  }
  const res = await fetch("http://127.0.0.1:5000/api/internal/stateful-jobs/policy-audit/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
  const json = await res.json().catch(() => ({}));
  const result = json && (json.result || json);
  const results = Array.isArray(result?.results) ? result.results : [];
  const summary = {
    httpStatus: res.status,
    success: json?.success ?? null,
    job: json?.job ?? null,
    accepted: result?.accepted ?? null,
    enabled: result?.enabled ?? null,
    dryRun: result?.dryRun ?? null,
    candidates: result?.candidates ?? null,
    processed: result?.processed ?? null,
    suspended: result?.suspended ?? null,
    ownerNotificationRetries: result?.ownerNotificationRetries ?? null,
    anySuspensionApplied: results.some((item) => item && item.suspensionApplied),
    anyNotificationSent: results.some((item) => item && item.notificationSent),
    decisions: results.map((item) => ({
      decision: item?.decision,
      applied: item?.applied,
      skipped: item?.skipped,
      violations: Array.isArray(item?.violations) ? item.violations.slice(0, 4) : []
    }))
  };
  console.log(JSON.stringify(summary));
  if (summary.httpStatus !== 200 || summary.enabled !== false || summary.dryRun !== true) {
    console.error("POLICY_AUDIT_READONLY_ABORT_JOB_NOT_DRYRUN");
    process.exit(6);
  }
  if (summary.suspended !== 0 || summary.anySuspensionApplied || summary.anyNotificationSent) {
    console.error("POLICY_AUDIT_READONLY_ABORT_SIDE_EFFECT_DETECTED");
    process.exit(7);
  }
}
main().catch((error) => {
  console.log(JSON.stringify({ error: String(error && error.message || error) }));
  process.exit(8);
});
NODE'

echo "POLICY_AUDIT_READONLY_VALIDATE_OK"
