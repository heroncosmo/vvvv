#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/opt/agentezap-single/compose"
EXPECTED_IMAGE="agentezap-app:policy-audit-dryrun-v876-20260707213802"
APP_ENV="${COMPOSE_DIR}/env/app.env"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
APP_ENV_BACKUP=""
ROLLBACK_NEEDED="0"

rollback_on_exit() {
  local code="$?"
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$ROLLBACK_NEEDED" = "1" ]; then
    echo "POLICY_AUDIT_TIMEOUT_ROLLBACK_START code=${code}"
    if [ -n "$APP_ENV_BACKUP" ] && [ -f "$APP_ENV_BACKUP" ]; then
      cp "$APP_ENV_BACKUP" "$APP_ENV"
    fi
    docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml up -d --no-deps --wait app >/tmp/policy-audit-timeout-rollback-compose.log 2>&1 || true
    echo "POLICY_AUDIT_TIMEOUT_ROLLBACK_DONE"
  fi
  exit "$code"
}
trap rollback_on_exit EXIT

echo "POLICY_AUDIT_TIMEOUT_UPDATE_START"

cd "$COMPOSE_DIR"
test -f "$APP_ENV"

APP_CONTAINER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "app_container_found=no"
  exit 1
fi

docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER"
current_image="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER")"
if [ "$current_image" != "$EXPECTED_IMAGE" ]; then
  echo "POLICY_AUDIT_TIMEOUT_ABORT_IMAGE_CHANGED current=${current_image}"
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
  policyAuditEnabled: env.AGENTEZAP_POLICY_AUDIT_ENABLED || null,
  policyAuditDryRun: env.AGENTEZAP_POLICY_AUDIT_DRY_RUN || null,
  policyAuditMaxCandidates: env.AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES || null,
  policyAuditTimeoutMs: env.AGENTEZAP_POLICY_AUDIT_CODEX_TIMEOUT_MS || null,
  policyAuditModel: env.AGENTEZAP_POLICY_AUDIT_CODEX_MODEL || null,
  policyAuditReasoning: env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT || null
};
console.log(`pre_env=${JSON.stringify(snapshot)}`);
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_MISSING_JOB_GUARD");
  process.exit(3);
}
if (snapshot.policyAuditEnabled !== "true" || snapshot.policyAuditDryRun !== "false" || snapshot.policyAuditMaxCandidates !== "1") {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_ENV_NOT_ACTIVE_GRADUAL");
  process.exit(4);
}
if (snapshot.policyAuditModel !== "gpt-5.5" || snapshot.policyAuditReasoning !== "xhigh") {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_MODEL_POLICY");
  process.exit(5);
}
NODE'

SERVICE_CODEX_HOME="$(docker exec "$APP_CONTAINER" sh -lc 'node - <<'"'"'NODE'"'"'
const path = require("path");
const root = path.resolve(process.env.AGENTEZAP_CODEX_CLI_PROJECT_ROOT || process.cwd());
console.log(path.resolve(process.env.AGENTEZAP_CODEX_CLI_HOME || path.join(root, ".codex-runs", "agentezap-codex-chatgpt-home")));
NODE')"
docker exec -e CODEX_HOME="$SERVICE_CODEX_HOME" "$APP_CONTAINER" sh -lc 'codex login status >/tmp/policy-audit-codex-status.txt 2>&1 && echo codex_login_status_service_home=ok || { echo codex_login_status_service_home=fail; exit 6; }; rm -f /tmp/policy-audit-codex-status.txt'

APP_ENV_BACKUP="${APP_ENV}.before-policy-audit-timeout-v881-${TIMESTAMP}"
cp "$APP_ENV" "$APP_ENV_BACKUP"
echo "backup_created=yes"
ROLLBACK_NEEDED="1"

node - "$APP_ENV" <<'NODE'
const fs = require("fs");
const [appEnvPath] = process.argv.slice(2);
let text = fs.readFileSync(appEnvPath, "utf8");
const newline = text.includes("\r\n") ? "\r\n" : "\n";
const key = "AGENTEZAP_POLICY_AUDIT_CODEX_TIMEOUT_MS";
const line = `${key}=600000`;
const pattern = new RegExp(`^${key}=.*$`, "m");
if (pattern.test(text)) {
  text = text.replace(pattern, line);
} else {
  if (text.length && !text.endsWith("\n")) text += newline;
  text += line + newline;
}
fs.writeFileSync(appEnvPath, text);
NODE

docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml config >/tmp/policy-audit-timeout-compose-config.txt
docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml up -d --no-deps --wait app

APP_CONTAINER_AFTER="$(docker compose --env-file .env.runtime -f compose.yml -f compose.host-nginx.yml ps -q app)"
if [ -z "$APP_CONTAINER_AFTER" ]; then
  echo "app_container_after_found=no"
  exit 7
fi

docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}}' "$APP_CONTAINER_AFTER"
current_image_after="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER_AFTER")"
if [ "$current_image_after" != "$EXPECTED_IMAGE" ]; then
  echo "POLICY_AUDIT_TIMEOUT_ABORT_IMAGE_CHANGED_AFTER current=${current_image_after}"
  exit 8
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
  policyAuditEnabled: env.AGENTEZAP_POLICY_AUDIT_ENABLED || null,
  policyAuditDryRun: env.AGENTEZAP_POLICY_AUDIT_DRY_RUN || null,
  policyAuditMaxCandidates: env.AGENTEZAP_POLICY_AUDIT_MAX_CANDIDATES || null,
  policyAuditTimeoutMs: env.AGENTEZAP_POLICY_AUDIT_CODEX_TIMEOUT_MS || null,
  policyAuditModel: env.AGENTEZAP_POLICY_AUDIT_CODEX_MODEL || null,
  policyAuditReasoning: env.AGENTEZAP_POLICY_AUDIT_CODEX_REASONING_EFFORT || null
};
console.log(`post_env=${JSON.stringify(snapshot)}`);
if (!snapshot.cronSecretPresent || !snapshot.appTokenPresent || !snapshot.statefulGroupsHasPolicyAudit) {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_POST_MISSING_JOB_GUARD");
  process.exit(9);
}
if (snapshot.policyAuditEnabled !== "true" || snapshot.policyAuditDryRun !== "false" || snapshot.policyAuditMaxCandidates !== "1") {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_POST_ENV_NOT_ACTIVE_GRADUAL");
  process.exit(10);
}
if (snapshot.policyAuditTimeoutMs !== "600000") {
  console.error("POLICY_AUDIT_TIMEOUT_ABORT_POST_TIMEOUT_NOT_SET");
  process.exit(11);
}
NODE'

ROLLBACK_NEEDED="0"
echo "POLICY_AUDIT_TIMEOUT_UPDATE_OK"
