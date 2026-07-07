#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/opt/agentezap-single/compose"
EXPECTED_IMAGE="agentezap-app:policy-audit-dryrun-v876-20260707213802"
RUNTIME_ENV="${COMPOSE_DIR}/.env.runtime"
APP_ENV="${COMPOSE_DIR}/env/app.env"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUNTIME_BACKUP=""
APP_ENV_BACKUP=""
ROLLBACK_NEEDED="0"

rollback_on_exit() {
  local code="$?"
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$ROLLBACK_NEEDED" = "1" ]; then
    echo "POLICY_AUDIT_ACTIVATE_ROLLBACK_START code=${code}"
    if [ -n "$RUNTIME_BACKUP" ] && [ -f "$RUNTIME_BACKUP" ]; then
      cp "$RUNTIME_BACKUP" "$RUNTIME_ENV"
    fi
    if [ -n "$APP_ENV_BACKUP" ] && [ -f "$APP_ENV_BACKUP" ]; then
      cp "$APP_ENV_BACKUP" "$APP_ENV"
    fi
    docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml up -d --no-deps --wait app >/tmp/policy-audit-activate-rollback-compose.log 2>&1 || true
    echo "POLICY_AUDIT_ACTIVATE_ROLLBACK_DONE"
  fi
  exit "$code"
}
trap rollback_on_exit EXIT

echo "POLICY_AUDIT_ACTIVATE_START"

cd "$COMPOSE_DIR"
test -f "$RUNTIME_ENV"
test -f "$APP_ENV"

APP_CONTAINER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "app_container_found=no"
  exit 1
fi

image_status="$(docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER")"
echo "$image_status"
current_image="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER")"
if [ "$current_image" != "$EXPECTED_IMAGE" ]; then
  echo "POLICY_AUDIT_ACTIVATE_ABORT_IMAGE_CHANGED current=${current_image}"
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
  policyAuditReasoning: env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT || null
};
console.log(`pre_env=${JSON.stringify(snapshot)}`);
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_MISSING_JOB_GUARD");
  process.exit(3);
}
if (snapshot.policyAuditEnabled !== "false" || snapshot.policyAuditDryRun !== "true" || snapshot.policyAuditMaxCandidates !== "1") {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_UNEXPECTED_PRE_ENV");
  process.exit(4);
}
if (snapshot.policyAuditModel !== "gpt-5.5" || snapshot.policyAuditReasoning !== "xhigh") {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_MODEL_POLICY");
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
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_DB_URL_MISSING");
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
    console.error("POLICY_AUDIT_ACTIVATE_ABORT_OWNER_CONNECTION");
    process.exit(8);
  }
})().catch(async (error) => {
  try { await client.end(); } catch {}
  console.error(`POLICY_AUDIT_ACTIVATE_ABORT_OWNER_CHECK ${error && error.message || error}`);
  process.exit(9);
});
NODE'

cron_status="$(curl -sS -o /tmp/policy-audit-cron-unauth-body.txt -w '%{http_code}' --max-time 10 http://127.0.0.1:5000/api/cron/stateful-jobs/policy-audit || true)"
rm -f /tmp/policy-audit-cron-unauth-body.txt
echo "cron_without_token_status=${cron_status}"
if [ "$cron_status" != "401" ]; then
  echo "POLICY_AUDIT_ACTIVATE_ABORT_CRON_AUTH_WEAK"
  exit 10
fi

RUNTIME_BACKUP="${RUNTIME_ENV}.before-policy-audit-activate-v879-${TIMESTAMP}"
APP_ENV_BACKUP="${APP_ENV}.before-policy-audit-activate-v879-${TIMESTAMP}"
cp "$RUNTIME_ENV" "$RUNTIME_BACKUP"
cp "$APP_ENV" "$APP_ENV_BACKUP"
echo "backups_created=yes"

node - "$RUNTIME_ENV" "$APP_ENV" <<'NODE'
const fs = require("fs");
const [runtimePath, appEnvPath] = process.argv.slice(2);

function upsertEnv(filePath, updates) {
  let text = fs.readFileSync(filePath, "utf8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      if (text.length && !text.endsWith("\n")) text += newline;
      text += line + newline;
    }
  }
  fs.writeFileSync(filePath, text);
}

upsertEnv(runtimePath, {
  AGENTEZAP_POLICY_AUDIT_ENABLED: "true",
  AGENTEZAP_POLICY_AUDIT_DRY_RUN: "false",
});

upsertEnv(appEnvPath, {
  AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES: "1",
  AGENTEZAP_POLICY_AUDIT_CONVERSATION_LIMIT: "25",
  AGENTEZAP_POLICY_AUDIT_MEDIA_EVIDENCE_LIMIT: "40",
  AGENTEZAP_POLICY_AUDIT_OWNER_EMAIL: "rodrigo4@gmail.com",
  AGENTEZAP_POLICY_AUDIT_OWNER_PHONE: "5517991956944",
});
NODE

ROLLBACK_NEEDED="1"

docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml config >/tmp/policy-audit-activate-compose-config.txt
docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml up -d --no-deps --wait app

APP_CONTAINER_AFTER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER_AFTER" ]; then
  echo "app_container_after_found=no"
  exit 11
fi

docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER_AFTER"
current_image_after="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER_AFTER")"
if [ "$current_image_after" != "$EXPECTED_IMAGE" ]; then
  echo "POLICY_AUDIT_ACTIVATE_ABORT_IMAGE_CHANGED_AFTER current=${current_image_after}"
  exit 12
fi

printf 'healthz_after='
curl -fsS --max-time 10 http://127.0.0.1:5000/healthz
echo
printf 'api_health_after='
curl -fsS --max-time 10 http://127.0.0.1:5000/api/health
echo

docker exec "$APP_CONTAINER_AFTER" sh -lc 'node - <<'"'"'NODE'"'"'
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
console.log(`post_env=${JSON.stringify(snapshot)}`);
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_POST_MISSING_JOB_GUARD");
  process.exit(13);
}
if (snapshot.policyAuditEnabled !== "true" || snapshot.policyAuditDryRun !== "false" || snapshot.policyAuditMaxCandidates !== "1") {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_POST_ENV_NOT_ACTIVE");
  process.exit(14);
}
if (snapshot.policyAuditModel !== "gpt-5.5" || snapshot.policyAuditReasoning !== "xhigh") {
  console.error("POLICY_AUDIT_ACTIVATE_ABORT_POST_MODEL_POLICY");
  process.exit(15);
}
NODE'

SERVICE_CODEX_HOME_AFTER="$(docker exec "$APP_CONTAINER_AFTER" sh -lc 'node - <<'"'"'NODE'"'"'
const path = require("path");
const root = path.resolve(process.env.AGENTEZAP_CODEX_CLI_PROJECT_ROOT || process.cwd());
console.log(path.resolve(process.env.AGENTEZAP_CODEX_CLI_HOME || path.join(root, ".codex-runs", "agentezap-codex-chatgpt-home")));
NODE')"
docker exec -e CODEX_HOME="$SERVICE_CODEX_HOME_AFTER" "$APP_CONTAINER_AFTER" sh -lc 'codex login status >/tmp/policy-audit-codex-status.txt 2>&1 && echo post_codex_login_status_service_home=ok || { echo post_codex_login_status_service_home=fail; exit 16; }; rm -f /tmp/policy-audit-codex-status.txt'

cron_status_after="$(curl -sS -o /tmp/policy-audit-cron-unauth-body.txt -w '%{http_code}' --max-time 10 http://127.0.0.1:5000/api/cron/stateful-jobs/policy-audit || true)"
rm -f /tmp/policy-audit-cron-unauth-body.txt
echo "post_cron_without_token_status=${cron_status_after}"
if [ "$cron_status_after" != "401" ]; then
  echo "POLICY_AUDIT_ACTIVATE_ABORT_POST_CRON_AUTH_WEAK"
  exit 17
fi

ROLLBACK_NEEDED="0"
echo "POLICY_AUDIT_ACTIVATE_OK"
