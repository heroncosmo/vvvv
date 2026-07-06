#!/usr/bin/env bash
set -euo pipefail

NEW_IMAGE="agentezap-app:qr-readonly-recovery-v860-20260706115905"
EXPECTED_ACTIVE_IMAGE="agentezap-app:rodrigo-codex-whatsapp-v859-20260705233902"
TMP_CONTAINER="agentezap-qr-readonly-recovery-v860-patch-tmp"
COMPOSE_DIR="/opt/agentezap-single/compose"

count_creds() {
  find /data/whatsapp-sessions /data/admin-whatsapp-sessions /data/agentezap/sessions -name creds.json 2>/dev/null | wc -l | tr -d '[:space:]'
}

require_marker() {
  local container="$1"
  local marker="$2"
  if ! docker exec -e MARKER="$marker" "$container" sh -lc 'grep -R -a -F -l -- "$MARKER" /app/dist >/dev/null'; then
    echo "[deploy] missing marker: $marker" >&2
    exit 60
  fi
}

forbid_marker() {
  local container="$1"
  local marker="$2"
  if docker exec -e MARKER="$marker" "$container" sh -lc 'grep -R -a -F -l -- "$MARKER" /app/dist >/dev/null'; then
    echo "[deploy] forbidden marker found: $marker" >&2
    exit 61
  fi
}

patch_runtime_bundle() {
  local container="$1"
  docker exec -i "$container" node - <<'NODE'
const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(70);
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) fail(`missing patch target: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) {
    fail(`ambiguous patch target: ${label}`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const distDir = "/app/dist";
const fullAppFiles = fs.readdirSync(distDir)
  .filter((file) => /^full-app-.*\.js$/.test(file))
  .map((file) => path.join(distDir, file));
if (fullAppFiles.length !== 1) {
  fail(`expected one full-app bundle, found ${fullAppFiles.length}`);
}

const fullAppPath = fullAppFiles[0];
let fullApp = fs.readFileSync(fullAppPath, "utf8");
if (fullApp.includes("shouldRouteStartLocalSessionRecovery")) {
  fail("route recovery helper already present before patch");
}

const helperBlock = `var ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES = /* @__PURE__ */ new Set([
  "auth_failed",
  "device_removed",
  "disconnected",
  "invalid_session",
  "logged_out",
  "logout",
  "manual_disconnect",
  "manual_disconnected",
  "not_connected",
  "open_timeout",
  "pairing_failed",
  "pairing_required",
  "phone_conflict_other_user",
  "qr_required",
  "removed",
  "unauthorized"
]);
function shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth) {
  if (!hasPersistedAuth || connection.isConnected !== true) {
    return false;
  }
  const providerStatus = String(connection.providerStatus || "").trim().toLowerCase();
  if (!providerStatus) {
    return true;
  }
  if (ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES.has(providerStatus)) {
    return false;
  }
  return !/logged.?out|logout|unauthorized|invalid|removed|qr|required|timeout/.test(providerStatus);
}
`;

fullApp = replaceOnce(
  fullApp,
  "\nfunction getUserId10(req) {",
  "\n" + helperBlock + "function getUserId10(req) {",
  "insert route recovery helper"
);
fullApp = replaceOnce(
  fullApp,
  "const hasPersistedAuth = await hasPersistedAuthForConnection(userId, connection.id);\n      const localWsReadyState = activeSession?.socket?.ws?.readyState;",
  "const hasPersistedAuth = await hasPersistedAuthForConnection(userId, connection.id);\n      const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth);\n      const localWsReadyState = activeSession?.socket?.ws?.readyState;",
  "primary connection canStartRouteRecovery"
);
fullApp = replaceOnce(
  fullApp,
  "if (!hasLocalSocket && hasPersistedAuth) {",
  "if (!hasLocalSocket && canStartRouteRecovery) {",
  "primary connection no GET side-effect guard"
);
fullApp = replaceOnce(
  fullApp,
  "const isReallyConnected = hasLocalSocket;\n      const isRecovering = !isReallyConnected && hasPersistedAuth;",
  "const isReallyConnected = hasLocalSocket;\n      const isRecovering = !isReallyConnected && canStartRouteRecovery;",
  "primary connection isRecovering guard"
);
fullApp = replaceOnce(
  fullApp,
  "const hasPersistedAuth = await hasPersistedAuthForConnection(userId, conn.id);\n        const localWsReadyState = activeSession?.socket?.ws?.readyState;",
  "const hasPersistedAuth = await hasPersistedAuthForConnection(userId, conn.id);\n        const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(conn, hasPersistedAuth);\n        const localWsReadyState = activeSession?.socket?.ws?.readyState;",
  "connection list canStartRouteRecovery"
);
fullApp = replaceOnce(
  fullApp,
  "if (!hasOperationalLocalSocket && hasPersistedAuth) {",
  "if (!hasOperationalLocalSocket && canStartRouteRecovery) {",
  "connection list no GET side-effect guard"
);
fullApp = replaceOnce(
  fullApp,
  "const isReallyConnected = hasOperationalLocalSocket;\n        const isRecovering = !isReallyConnected && hasPersistedAuth;",
  "const isReallyConnected = hasOperationalLocalSocket;\n        const isRecovering = !isReallyConnected && canStartRouteRecovery;",
  "connection list isRecovering guard"
);
fs.writeFileSync(fullAppPath, fullApp);

const oldCooldownLine = 'return source.startsWith("pending_") || source.startsWith("health_");';
const newCooldownLine = 'return source.startsWith("pending_") || source.startsWith("health_") || source.startsWith("session_ensure");';
let cooldownReplacements = 0;
for (const file of walk(distDir).filter((file) => file.endsWith(".js"))) {
  let text = fs.readFileSync(file, "utf8");
  const count = text.split(oldCooldownLine).length - 1;
  if (count > 0) {
    text = text.split(oldCooldownLine).join(newCooldownLine);
    fs.writeFileSync(file, text);
    cooldownReplacements += count;
  }
}
if (cooldownReplacements < 1) {
  fail(`expected at least one cooldown replacement, found ${cooldownReplacements}`);
}

const patchedFullApp = fs.readFileSync(fullAppPath, "utf8");
for (const marker of [
  "ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES",
  "function shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth)",
  "const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth);",
  "if (!hasLocalSocket && canStartRouteRecovery) {",
  "const isRecovering = !isReallyConnected && canStartRouteRecovery;",
  "const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(conn, hasPersistedAuth);",
  "if (!hasOperationalLocalSocket && canStartRouteRecovery) {",
]) {
  if (!patchedFullApp.includes(marker)) fail(`patched full-app missing marker: ${marker}`);
}
if (patchedFullApp.includes("if (!hasLocalSocket && hasPersistedAuth) {")) {
  fail("primary GET still starts recovery from hasPersistedAuth");
}
if (patchedFullApp.includes("if (!hasOperationalLocalSocket && hasPersistedAuth) {")) {
  fail("list GET still starts recovery from hasPersistedAuth");
}

const httpPath = "/app/dist/api/http.js";
const http = fs.readFileSync(httpPath, "utf8");
if (!http.includes(newCooldownLine)) fail("api/http missing session_ensure cooldown line");
if (http.includes(oldCooldownLine)) fail("api/http still contains old cooldown line");

console.log(`[deploy] patched ${path.basename(fullAppPath)} and cooldown line`);
NODE
}

check_bundle_contract() {
  local container="$1"
  docker exec -i "$container" node - <<'NODE'
const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(72);
}

const distDir = "/app/dist";
const fullAppFiles = fs.readdirSync(distDir)
  .filter((file) => /^full-app-.*\.js$/.test(file))
  .map((file) => path.join(distDir, file));
if (fullAppFiles.length !== 1) fail(`expected one full-app bundle, found ${fullAppFiles.length}`);

const fullApp = fs.readFileSync(fullAppFiles[0], "utf8");
const http = fs.readFileSync("/app/dist/api/http.js", "utf8");
const requiredFullMarkers = [
  "ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES",
  "function shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth)",
  "connection.isConnected !== true",
  "open_timeout",
  "qr_required",
  "const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(connection, hasPersistedAuth);",
  "if (!hasLocalSocket && canStartRouteRecovery) {",
  "const isRecovering = !isReallyConnected && canStartRouteRecovery;",
  "const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery(conn, hasPersistedAuth);",
  "if (!hasOperationalLocalSocket && canStartRouteRecovery) {",
];
for (const marker of requiredFullMarkers) {
  if (!fullApp.includes(marker)) fail(`missing full-app contract marker: ${marker}`);
}
if (fullApp.includes("if (!hasLocalSocket && hasPersistedAuth) {")) {
  fail("forbidden primary GET recovery guard remains");
}
if (fullApp.includes("if (!hasOperationalLocalSocket && hasPersistedAuth) {")) {
  fail("forbidden list GET recovery guard remains");
}

const oldCooldownLine = 'return source.startsWith("pending_") || source.startsWith("health_");';
const newCooldownLine = 'return source.startsWith("pending_") || source.startsWith("health_") || source.startsWith("session_ensure");';
if (!http.includes(newCooldownLine)) fail("api/http missing exact session_ensure cooldown line");
if (http.includes(oldCooldownLine)) fail("api/http still has exact old cooldown line");

console.log("[deploy] bundle contract ok");
NODE
}

check_markers() {
  local container="$1"
  docker exec "$container" sh -lc '
    set -eu
    test -f /app/dist/index.js
    test -f /app/dist/api/http.js
    test -f /app/dist/public/index.html
    test -f /app/dist/public/sw.js
    test -f /app/dist/public/pwa-version.json
  '

  require_marker "$container" "ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES"
  require_marker "$container" "shouldRouteStartLocalSessionRecovery"
  require_marker "$container" "canStartRouteRecovery"
  require_marker "$container" 'return source.startsWith("pending_") || source.startsWith("health_") || source.startsWith("session_ensure");'
  require_marker "$container" "fetchLatestWaWebVersion"
  require_marker "$container" "ROUTE_WHATSAPP_QR_MAX_AGE_MS"
  require_marker "$container" "sanitizePersistedQrForRoute"
  require_marker "$container" 'reason: "open_timeout"'
  require_marker "$container" "qrCodeGeneratedAt: null"
  require_marker "$container" "executeRetryableCodexNoSend"
  require_marker "$container" "rawAiAgentConfig"
  require_marker "$container" "rawBusinessAgentConfig"

  forbid_marker "$container" 'return source.startsWith("pending_") || source.startsWith("health_");'
  forbid_marker "$container" "1033893291"
  forbid_marker "$container" "Preserved fresh QR after open_timeout"
  forbid_marker "$container" "buildOpenTimeoutQrPreservationPatch"
  forbid_marker "$container" "baileys_qr_open_timeout_preserved"
  forbid_marker "$container" "QR_OPEN_TIMEOUT_PRESERVE_MS"
  forbid_marker "$container" "getConnectionUpdatedAtIso"
  forbid_marker "$container" "return parseQrGeneratedAt(connection?.updatedAt)"
  forbid_marker "$container" "getConnectionQrCodeGeneratedAt(connection) || connection.updatedAt || null"

  check_bundle_contract "$container"
}

echo "[deploy] checking active image"
ACTIVE_IMAGE="$(docker inspect --format '{{.Config.Image}}' agentezap-app)"
if [ "$ACTIVE_IMAGE" != "$EXPECTED_ACTIVE_IMAGE" ]; then
  echo "[deploy] unexpected active image: $ACTIVE_IMAGE" >&2
  echo "[deploy] expected: $EXPECTED_ACTIVE_IMAGE" >&2
  exit 1
fi

test -f "${COMPOSE_DIR}/compose.yml"
test -f "${COMPOSE_DIR}/compose.host-nginx.yml"
test -f "${COMPOSE_DIR}/.env.runtime"
test -x "${COMPOSE_DIR}/scripts/deploy-service.sh"

before_creds="$(count_creds)"
echo "[deploy] creds before: ${before_creds}"

docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 || true
cleanup() { docker rm -f "$TMP_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[deploy] creating temporary container from active image"
docker create --name "$TMP_CONTAINER" "$ACTIVE_IMAGE" sh -lc 'sleep 3600' >/dev/null
docker start "$TMP_CONTAINER" >/dev/null

echo "[deploy] patching runtime bundle in temporary container"
patch_runtime_bundle "$TMP_CONTAINER"
check_markers "$TMP_CONTAINER"

echo "[deploy] committing image ${NEW_IMAGE}"
docker commit \
  --change='ENTRYPOINT ["docker-entrypoint.sh"]' \
  --change='CMD ["node","dist/index.js"]' \
  "$TMP_CONTAINER" "$NEW_IMAGE" >/dev/null

echo "[deploy] deploying app-only"
cd "$COMPOSE_DIR"
"$COMPOSE_DIR/scripts/deploy-service.sh" app "$NEW_IMAGE"

echo "[deploy] validating service"
sleep 25
docker inspect --format '{{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}} {{.RestartCount}}' agentezap-app
test "$(docker inspect --format '{{.Config.Image}}' agentezap-app)" = "$NEW_IMAGE"
test "$(docker port agentezap-app 5000/tcp)" = "127.0.0.1:5000"
curl -fsS http://127.0.0.1:5000/healthz
curl -fsS http://127.0.0.1:5000/api/health | grep -F '"mode":"monolith"' >/dev/null
curl -fsS http://127.0.0.1:5000/api/health | grep -F '"runtimeProfile":"full"' >/dev/null

after_creds="$(count_creds)"
echo "[deploy] creds after: ${after_creds}"
if [ "$after_creds" -lt "$before_creds" ]; then
  echo "[deploy] creds count decreased: before=${before_creds} after=${after_creds}" >&2
  exit 3
fi

check_markers agentezap-app
echo "[deploy] DEPLOY_OK ${NEW_IMAGE}"
