#!/usr/bin/env bash
set -euo pipefail

NEW_IMAGE="${NEW_IMAGE:-agentezap-app:plano-pro-300-v871-20260707121500}"
EXPECTED_ACTIVE_IMAGE="${EXPECTED_ACTIVE_IMAGE:-agentezap-app:codex-inline-tenant-prompt-v870-20260707075426}"
TMP_CONTAINER="${TMP_CONTAINER:-agentezap-plano-pro-300-v871-tmp}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/agentezap-single/compose}"
DRY_RUN="${DRY_RUN:-0}"

count_creds() {
  find /data/whatsapp-sessions /data/admin-whatsapp-sessions /data/agentezap/sessions -name creds.json 2>/dev/null | wc -l | tr -d '[:space:]'
}

patch_dist() {
  local container="$1"
  docker exec -i "$container" node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = "/app/dist";
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith(".js")) jsFiles.push(file);
  }
}
walk(root);

const replacements = [
  {
    name: "frontend_pro_base_offer",
    from: "t===FN?349.99:0",
    to: "t===FN?300:0",
    expected: 2,
  },
  {
    name: "frontend_pro_intro_offer",
    from: "introOfferPrice:349.99",
    to: "introOfferPrice:300",
    expected: 1,
  },
  {
    name: "frontend_free_order",
    from: 'className:"order-2 h-full md:order-1"',
    to: 'className:"order-2 h-full"',
    expected: 1,
  },
  {
    name: "frontend_paid_order",
    from: 'className:"order-1 h-full md:order-2"',
    to: 'className:"order-1 h-full"',
    expected: 1,
  },
  {
    name: "backend_pro_plain_offer",
    from: "if (id === CHECKOUT_PUBLIC_PRO_PLAN_ID) return 349.99;",
    to: "if (id === CHECKOUT_PUBLIC_PRO_PLAN_ID) return 300;",
    expected: 4,
  },
  {
    name: "backend_legacy_last_paid_normalizer",
    from: "const lastPaidAmount = highestPaid ? roundCurrencyAmount(parseMoneyAmount(highestPaid.monthly_amount)) : 0;",
    to: "const rawLastPaidAmount = highestPaid ? roundCurrencyAmount(parseMoneyAmount(highestPaid.monthly_amount)) : 0;\n  const lastPaidAmount = Math.abs(rawLastPaidAmount - 349.99) < 0.01 && inferHistoricalPlanName(highestPaid?.plan_name, rawLastPaidAmount) === \"IA Ilimitada Pro\" ? 300 : rawLastPaidAmount;",
    expected: 2,
  },
  {
    name: "backend_last_paid_audit_raw",
    from: "lastPaidAmount: lastPaidAmount > 0 ? lastPaidAmount : null,",
    to: "lastPaidAmount: rawLastPaidAmount > 0 ? rawLastPaidAmount : null,",
    expected: 2,
  },
  {
    name: "backend_pending_checkout_reprice",
    from: "if (expectedAmount <= 0 || currentAmount >= expectedAmount - 0.01) {",
    to: "if (expectedAmount <= 0 || currentAmount > 0 && Math.abs(currentAmount - expectedAmount) < 0.01) {",
    expected: 2,
  },
];

const counts = Object.fromEntries(replacements.map((item) => [item.name, 0]));
const patched = [];

for (const file of jsFiles) {
  let text = fs.readFileSync(file, "utf8");
  const original = text;
  for (const item of replacements) {
    const before = text.split(item.from).length - 1;
    if (before > 0) {
      counts[item.name] += before;
      text = text.split(item.from).join(item.to);
    }
  }
  if (text !== original) {
    fs.writeFileSync(file, text);
    patched.push(file);
  }
}

console.log(JSON.stringify({ patched, counts }, null, 2));
const failures = replacements.filter((item) => counts[item.name] !== item.expected);
if (failures.length > 0) {
  console.error("unexpected patch counts", JSON.stringify(failures.map((item) => ({
    name: item.name,
    expected: item.expected,
    actual: counts[item.name],
  })), null, 2));
  process.exit(64);
}
NODE
}

check_markers() {
  local container="$1"
  docker exec -i "$container" node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = "/app/dist";
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith(".js")) jsFiles.push(file);
  }
}
walk(root);

const text = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const checks = {
  frontendProBase300: (text.match(/t===FN\?300:0/g) || []).length === 2,
  frontendIntro300: text.includes("introOfferPrice:300"),
  frontendOldIntroAbsent: !text.includes("introOfferPrice:349.99"),
  frontendOldOrderAbsent: !text.includes("order-2 h-full md:order-1") && !text.includes("order-1 h-full md:order-2"),
  backendPro300Returns: (text.match(/if \(id === CHECKOUT_PUBLIC_PRO_PLAN_ID\) return 300;/g) || []).length === 4,
  backendOldPro349Absent: !text.includes("if (id === CHECKOUT_PUBLIC_PRO_PLAN_ID) return 349.99;"),
  backendKeepsRecurring499: (text.match(/if \(id === CHECKOUT_PUBLIC_PRO_PLAN_ID\) return 499.99;/g) || []).length === 2,
  backendLegacyNormalizer: (text.match(/rawLastPaidAmount - 349\.99/g) || []).length === 2,
  backendLastPaidAuditRaw: (text.match(/lastPaidAmount: rawLastPaidAmount > 0 \? rawLastPaidAmount : null/g) || []).length === 2,
  backendPendingCheckoutReprice: (text.match(/Math\.abs\(currentAmount - expectedAmount\) < 0\.01/g) || []).length === 2,
  backendOldPendingGuardAbsent: !text.includes("currentAmount >= expectedAmount - 0.01"),
};
console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((ok) => ok !== true)) {
  process.exit(65);
}
NODE
}

check_node_parse() {
  local container="$1"
  docker exec "$container" sh -lc '
    set -eu
    node --check /app/dist/api/http.js
    node --check /app/dist/index.js
    full_app="$(ls /app/dist/full-app-*.js | head -n 1)"
    test -n "$full_app"
    node --check "$full_app"
  '
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

echo "[deploy] applying plano pro 300 patch"
patch_dist "$TMP_CONTAINER"
check_markers "$TMP_CONTAINER"
check_node_parse "$TMP_CONTAINER"

if [ "$DRY_RUN" = "1" ]; then
  echo "[deploy] DRY_RUN_OK ${NEW_IMAGE}"
  exit 0
fi

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

if docker logs --since 2m agentezap-app 2>&1 | grep -a -E 'SyntaxError|ReferenceError|Range out of order|UnhandledPromiseRejection|MODULE_NOT_FOUND'; then
  echo "[deploy] boot errors detected" >&2
  exit 62
fi

after_creds="$(count_creds)"
echo "[deploy] creds after: ${after_creds}"
if [ "$after_creds" -lt "$before_creds" ]; then
  echo "[deploy] creds count decreased: before=${before_creds} after=${after_creds}" >&2
  exit 3
fi

check_markers agentezap-app
check_node_parse agentezap-app
echo "[deploy] DEPLOY_OK ${NEW_IMAGE}"
