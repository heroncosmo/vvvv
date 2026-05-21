#!/usr/bin/env bash
set -euo pipefail

TAG="agentezap-app:tico-stateful-media-v192-20260521154420"
EXPECTED_BASE="agentezap-app:jb-slot-lock-v191-20260521152010"
EXPECTED_PUBLIC_VERSION="build-1779370265418"
COMPOSE_DIR="/opt/agentezap-single/compose"
DEPLOY_DIR="/tmp/tmp-deploy-tico-stateful-media-v192-20260521154420"
SESSIONS_DIR="/data/agentezap/sessions"

check_marker() {
  local label="$1"
  shift
  echo "[deploy] check=${label}"
  "$@"
}

http_get() {
  docker exec agentezap-app node -e "fetch(process.argv[1]).then(async r=>{const t=await r.text(); console.log(t); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})" "$1"
}

cd "$COMPOSE_DIR"

before_auth="$(find "$SESSIONS_DIR" -maxdepth 1 -type d -name 'auth_*' | wc -l)"
before_creds="$(find "$SESSIONS_DIR" -path '*/creds.json' | wc -l)"
current_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
current_health="$(docker inspect agentezap-app --format '{{.State.Health.Status}}' 2>/dev/null || true)"
current_entrypoint="$(docker inspect agentezap-app --format '{{json .Config.Entrypoint}}')"
current_cmd="$(docker inspect agentezap-app --format '{{json .Config.Cmd}}')"
current_public_version="$(http_get 'http://127.0.0.1:5000/pwa-version.json' | grep -o "build-[0-9]*" | head -n 1 || true)"

echo "[deploy] current_image=${current_image}"
echo "[deploy] current_health=${current_health}"
echo "[deploy] current_entrypoint=${current_entrypoint}"
echo "[deploy] current_cmd=${current_cmd}"
echo "[deploy] current_public_version=${current_public_version}"
echo "[deploy] sessions_before=${before_auth}/${before_creds}"

if [ "$current_image" != "$EXPECTED_BASE" ]; then
  echo "[deploy] ERROR: active image changed since validation (${current_image} != ${EXPECTED_BASE}). Rebase this deploy first." >&2
  exit 1
fi
if [ "$current_health" != "healthy" ]; then
  echo "[deploy] ERROR: app is not healthy before deploy" >&2
  exit 1
fi
if [ "$current_entrypoint" != '["docker-entrypoint.sh"]' ] || [ "$current_cmd" != '["node","dist/index.js"]' ]; then
  echo "[deploy] ERROR: active app has unexpected entrypoint/cmd." >&2
  exit 1
fi
if [ "$current_public_version" != "$EXPECTED_PUBLIC_VERSION" ]; then
  echo "[deploy] ERROR: public build changed since validation (${current_public_version} != ${EXPECTED_PUBLIC_VERSION}). Rebase this deploy first." >&2
  exit 1
fi

check_marker base_fk_runtime docker exec agentezap-app sh -lc "grep -aR -m 1 'fkSemijoiasPolicyRuntime' /app/dist >/dev/null"
check_marker base_jb_slot_lock docker exec agentezap-app sh -lc "grep -aR -m 1 'AGENDAMENTO3_SLOT_TAKEN' /app/dist >/dev/null"
check_marker base_mobile_v185 docker exec agentezap-app sh -lc "grep -aR -m 1 'button-mobile-editor-more' /app/dist/public >/dev/null"

cd "$DEPLOY_DIR"
test -f dist/index.js
test -f dist/api/http.js
test -f dist/full-app-HIYHZGNN.js
test -f dist/chunk-CZVB6EVJ.js

check_marker artifact_tico_runtime grep -aR -m 1 'Modulo TICO Locacoes aplicado no runtime stateful' dist
check_marker artifact_tico_context grep -aR -m 1 'TICO_LOCACOES_USER_ID' dist
check_marker artifact_fk_runtime grep -aR -m 1 'fkSemijoiasPolicyRuntime' dist
check_marker artifact_jb_slot_lock grep -aR -m 1 'AGENDAMENTO3_SLOT_TAKEN' dist
check_marker artifact_delivery2_resend grep -aR -m 1 'DELIVERY2_CARDAPIO' dist

cat > Dockerfile <<EOF
FROM ${current_image}
RUN find /app/dist -maxdepth 1 -type f -name '*.js' -delete && rm -rf /app/dist/api
COPY dist/ /app/dist/
EOF
docker build -t "$TAG" .

cd "$COMPOSE_DIR"
pre_switch_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
pre_switch_public_version="$(http_get 'http://127.0.0.1:5000/pwa-version.json' | grep -o "build-[0-9]*" | head -n 1 || true)"
if [ "$pre_switch_image" != "$EXPECTED_BASE" ]; then
  echo "[deploy] ERROR: active image changed while building (${pre_switch_image} != ${EXPECTED_BASE}). Not switching app." >&2
  exit 1
fi
if [ "$pre_switch_public_version" != "$EXPECTED_PUBLIC_VERSION" ]; then
  echo "[deploy] ERROR: public build changed while building (${pre_switch_public_version} != ${EXPECTED_PUBLIC_VERSION}). Not switching app." >&2
  exit 1
fi

cp .env.runtime ".env.runtime.backup-tico-stateful-media-v192"
python3 - "$TAG" <<'PY'
from pathlib import Path
import sys

tag = sys.argv[1]
path = Path(".env.runtime")
desired = {
    "AGENTEZAP_APP_IMAGE": tag,
    "NODE_OPTIONS": "--max-old-space-size=4096",
    "WA_PENDING_TIMERS_START_DURING_RESTORE": "false",
}
lines = path.read_text().splitlines()
out = []
seen = set()
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else ""
    if key in desired:
        out.append(f"{key}={desired[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in desired.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY

docker compose --env-file .env.runtime -f compose.yml up -d --no-deps --wait app

after_auth="$(find "$SESSIONS_DIR" -maxdepth 1 -type d -name 'auth_*' | wc -l)"
after_creds="$(find "$SESSIONS_DIR" -path '*/creds.json' | wc -l)"
running_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
running_health="$(docker inspect agentezap-app --format '{{.State.Health.Status}}')"
running_entrypoint="$(docker inspect agentezap-app --format '{{json .Config.Entrypoint}}')"
running_cmd="$(docker inspect agentezap-app --format '{{json .Config.Cmd}}')"
running_public_version="$(http_get 'http://127.0.0.1:5000/pwa-version.json' | grep -o "build-[0-9]*" | head -n 1 || true)"

echo "[deploy] running_image=${running_image}"
echo "[deploy] running_health=${running_health}"
echo "[deploy] running_entrypoint=${running_entrypoint}"
echo "[deploy] running_cmd=${running_cmd}"
echo "[deploy] running_public_version=${running_public_version}"
echo "[deploy] sessions_after=${after_auth}/${after_creds}"

if [ "$after_auth" -lt "$before_auth" ] || [ "$after_creds" -lt "$before_creds" ]; then
  echo "[deploy] ERROR: session count dropped during app deploy" >&2
  exit 1
fi
if [ "$running_image" != "$TAG" ]; then
  echo "[deploy] ERROR: app did not switch to expected image ${TAG}" >&2
  exit 1
fi
if [ "$running_health" != "healthy" ]; then
  echo "[deploy] ERROR: app is not healthy after deploy" >&2
  exit 1
fi
if [ "$running_entrypoint" != '["docker-entrypoint.sh"]' ] || [ "$running_cmd" != '["node","dist/index.js"]' ]; then
  echo "[deploy] ERROR: deployed app has unexpected entrypoint/cmd" >&2
  exit 1
fi
if [ "$running_public_version" != "$EXPECTED_PUBLIC_VERSION" ]; then
  echo "[deploy] ERROR: public version changed (${running_public_version} != ${EXPECTED_PUBLIC_VERSION})" >&2
  exit 1
fi

check_marker deployed_tico_runtime docker exec agentezap-app sh -lc "grep -aR -m 1 'Modulo TICO Locacoes aplicado no runtime stateful' /app/dist >/dev/null"
check_marker deployed_tico_context docker exec agentezap-app sh -lc "grep -aR -m 1 'TICO_LOCACOES_USER_ID' /app/dist >/dev/null"
check_marker deployed_fk_runtime docker exec agentezap-app sh -lc "grep -aR -m 1 'fkSemijoiasPolicyRuntime' /app/dist >/dev/null"
check_marker deployed_jb_slot_lock docker exec agentezap-app sh -lc "grep -aR -m 1 'AGENDAMENTO3_SLOT_TAKEN' /app/dist >/dev/null"
check_marker deployed_delivery2_resend docker exec agentezap-app sh -lc "grep -aR -m 1 'DELIVERY2_CARDAPIO' /app/dist >/dev/null"
check_marker deployed_mobile_v185 docker exec agentezap-app sh -lc "grep -aR -m 1 'button-mobile-editor-more' /app/dist/public >/dev/null"

docker exec agentezap-app node -e "fetch('http://127.0.0.1:5000/healthz').then(async r=>{console.log('[deploy] container_healthz='+r.status+' '+(await r.text()).slice(0,120)); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"
docker exec agentezap-app node -e "fetch('http://127.0.0.1:5000/api/health').then(async r=>{console.log('[deploy] container_api_health='+r.status+' '+(await r.text()).slice(0,300)); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"

echo "[deploy] done"
