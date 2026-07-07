#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/opt/agentezap-single/compose"
EXPECTED_IMAGE="agentezap-app:policy-audit-dryrun-v876-20260707213802"

echo "POLICY_AUDIT_REAL_CYCLE_START"

cd "$COMPOSE_DIR"
APP_CONTAINER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "app_container_found=no"
  exit 1
fi

docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER"
current_image="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER")"
if [ "$current_image" != "$EXPECTED_IMAGE" ]; then
  echo "POLICY_AUDIT_REAL_CYCLE_ABORT_IMAGE_CHANGED current=${current_image}"
  exit 2
fi

printf 'healthz_before='
curl -fsS --max-time 10 http://127.0.0.1:5000/healthz
echo
printf 'api_health_before='
curl -fsS --max-time 10 http://127.0.0.1:5000/api/health
echo

docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
const env = process.env;
const snapshot = {
  cronSecretPresent: Boolean(env.CRON_SECRET),
  appTokenPresent: Boolean(env.STATEFUL_JOBS_TOKEN || env.APP_STATEFUL_JOBS_TOKEN || env.STATEFUL_JOBS_RUNNER_TOKEN),
  statefulGroupsHasPolicyAudit: String(env.STATEFUL_JOB_CRON_GROUPS || "").split(",").includes("policy-audit"),
  policyAuditSchedule: env.STATEFUL_JOB_CRON_POLICY_AUDIT_SCHEDULE || null,
  policyAuditEnabled: env.AGENTEZAP_POLICY_AUDIT_ENABLED || null,
  policyAuditDryRun: env.AGENTEZAP_POLICY_AUDIT_DRY_RUN || null,
  policyAuditMaxCandidates: env.AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES || null,
  policyAuditMediaEvidenceLimit: env.AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT || null,
  policyAuditModel: env.AGENTEZAP_POLICY_AUDIT_CODEX_MODEL || null,
  policyAuditReasoning: env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT || null,
  ownerEmailConfigured: Boolean(env.AGENTEZAP_POLICY_AUDIT_OWNER_EMAIL),
  ownerPhoneConfigured: Boolean(env.AGENTEZAP_POLICY_AUDIT_OWNER_PHONE)
};
console.log(`real_cycle_env=${JSON.stringify(snapshot)}`);
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_MISSING_JOB_GUARD");
  process.exit(3);
}
if (snapshot.policyAuditEnabled !== "true" || snapshot.policyAuditDryRun !== "false" || snapshot.policyAuditMaxCandidates !== "1") {
  console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_ENV_NOT_ACTIVE_GRADUAL");
  process.exit(4);
}
if (snapshot.policyAuditModel !== "gpt-5.5" || snapshot.policyAuditReasoning !== "xhigh") {
  console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_MODEL_POLICY");
  process.exit(5);
}
NODE'

SERVICE_CODEX_HOME="$(docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
const path = require("path");
const root = path.resolve(process.env.AGENTEZAP_CODEX_CLI_PROJECT_ROOT || process.cwd());
console.log(path.resolve(process.env.AGENTEZAP_CODEX_CLI_HOME || path.join(root, ".codex-runs", "agentezap-codex-chatgpt-home")));
NODE')"
docker exec -e CODEX_HOME="$SERVICE_CODEX_HOME" "$APP_CONTAINER" sh -lc 'codex login status >/tmp/policy-audit-codex-status.txt 2>&1 && echo codex_login_status_service_home=ok || { echo codex_login_status_service_home=fail; exit 6; }; rm -f /tmp/policy-audit-codex-status.txt'

docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
const { Client } = require("pg");
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_DB_URL_MISSING");
  process.exit(7);
}
const client = new Client({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const result = await client.query(`
    SELECT
      u.id AS user_id,
      u.email,
      COUNT(wc.id)::int AS connection_count,
      COUNT(wc.id) FILTER (WHERE wc.is_connected IS TRUE)::int AS active_connection_count
    FROM users u
    LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id
    WHERE u.email = $1
    GROUP BY u.id, u.email
  `, ["rodrigo4@gmail.com"]);
  await client.end();
  const row = result.rows[0] || null;
  const summary = {
    ownerUserFound: Boolean(row),
    ownerEmail: row?.email || null,
    connectionCount: row?.connection_count || 0,
    activeConnectionCount: row?.active_connection_count || 0,
    canNotifyViaExistingOwnerConnection: Boolean(row && Number(row.active_connection_count) > 0)
  };
  console.log(`owner_readonly=${JSON.stringify(summary)}`);
  if (!summary.canNotifyViaExistingOwnerConnection) {
    console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_OWNER_CONNECTION");
    process.exit(8);
  }
})().catch(async (error) => {
  try { await client.end(); } catch {}
  console.error(`POLICY_AUDIT_REAL_CYCLE_ABORT_OWNER_CHECK ${error && error.message || error}`);
  process.exit(9);
});
NODE'

cron_status="$(curl -sS -o /tmp/policy-audit-cron-unauth-body.txt -w '%{http_code}' --max-time 10 http://127.0.0.1:5000/api/cron/stateful-jobs/policy-audit || true)"
rm -f /tmp/policy-audit-cron-unauth-body.txt
echo "cron_without_token_status=${cron_status}"
if [ "$cron_status" != "401" ]; then
  echo "POLICY_AUDIT_REAL_CYCLE_ABORT_CRON_AUTH_WEAK"
  exit 10
fi

docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
async function main() {
  const token = process.env.STATEFUL_JOBS_TOKEN || process.env.APP_STATEFUL_JOBS_TOKEN || process.env.STATEFUL_JOBS_RUNNER_TOKEN || process.env.CRON_SECRET;
  if (!token) {
    console.log(JSON.stringify({ internalJobTokenPresent: false }));
    process.exit(11);
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
  const wrapper = json && (json.result || json);
  const result = wrapper?.details || wrapper?.result?.details || wrapper?.result || wrapper;
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
    anySuspensionWithoutNotification: results.some((item) => item && item.suspensionApplied && !item.notificationSent),
    decisions: results.map((item) => ({
      decision: item?.decision,
      applied: item?.applied,
      skipped: item?.skipped,
      suspensionApplied: Boolean(item?.suspensionApplied),
      notificationSent: Boolean(item?.notificationSent),
      violations: Array.isArray(item?.violations) ? item.violations.slice(0, 4) : []
    }))
  };
  console.log(`real_cycle_summary=${JSON.stringify(summary)}`);
  if (summary.httpStatus !== 200 || summary.accepted !== true || summary.enabled !== true || summary.dryRun !== false) {
    console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_JOB_NOT_REAL");
    process.exit(12);
  }
  if (summary.anySuspensionWithoutNotification) {
    console.error("POLICY_AUDIT_REAL_CYCLE_ABORT_NOTIFICATION_MISSING");
    process.exit(13);
  }
}
main().catch((error) => {
  console.log(JSON.stringify({ error: String(error && error.message || error) }));
  process.exit(14);
});
NODE'

printf 'healthz_after='
curl -fsS --max-time 10 http://127.0.0.1:5000/healthz
echo
printf 'api_health_after='
curl -fsS --max-time 10 http://127.0.0.1:5000/api/health
echo

echo "POLICY_AUDIT_REAL_CYCLE_OK"
