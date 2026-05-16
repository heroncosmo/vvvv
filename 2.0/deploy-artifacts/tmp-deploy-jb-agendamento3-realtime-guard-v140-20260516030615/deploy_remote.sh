#!/usr/bin/env bash
set -euo pipefail

TAG="agentezap-app:jb-agendamento3-realtime-guard-v140-20260516030615"
EXPECTED_BASE="agentezap-app:rprado-followup-toggle-v139b-20260516022104"
COMPOSE_DIR="/opt/agentezap-single/compose"
DEPLOY_DIR="/tmp/tmp-deploy-jb-agendamento3-realtime-guard-v140-20260516030615"
SESSIONS_DIR="/data/agentezap/sessions"

check_marker() {
  local label="$1"
  shift
  echo "[deploy] check=${label}"
  "$@"
}

cd "$COMPOSE_DIR"

before_auth="$(find "$SESSIONS_DIR" -maxdepth 1 -type d -name 'auth_*' | wc -l)"
before_creds="$(find "$SESSIONS_DIR" -path '*/creds.json' | wc -l)"
current_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
current_health="$(docker inspect agentezap-app --format '{{.State.Health.Status}}' 2>/dev/null || true)"
current_restart="$(docker inspect agentezap-app --format '{{.RestartCount}}' 2>/dev/null || true)"
current_entrypoint="$(docker inspect agentezap-app --format '{{json .Config.Entrypoint}}')"
current_cmd="$(docker inspect agentezap-app --format '{{json .Config.Cmd}}')"

echo "[deploy] current_image=${current_image}"
echo "[deploy] current_health=${current_health}"
echo "[deploy] current_restart=${current_restart}"
echo "[deploy] current_entrypoint=${current_entrypoint}"
echo "[deploy] current_cmd=${current_cmd}"
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

check_marker base_rprado_owner docker exec agentezap-app sh -lc "grep -aR -m 1 'isMonolithRuntime2() && !hasRemoteGatewayConfigured()' /app/dist >/dev/null"
check_marker base_grupoolx_native docker exec agentezap-app sh -lc "grep -aR -m 1 'shouldDelegateGrupoOlxRoutesToVercelHttp' /app/dist >/dev/null"
check_marker base_followup_toggle docker exec agentezap-app sh -lc "grep -aR -m 1 'Conversa sem usuario dono confirmado para follow-up' /app/dist >/dev/null"
check_marker base_gli80_web docker exec agentezap-app sh -lc "grep -aR -m 1 'WEB_ONLY_GLI80_STAGE5_RE' /app/dist/api/http.js >/dev/null"
check_marker base_gli80_runtime docker exec agentezap-app sh -lc "grep -aR -m 1 'GLI80_RUNTIME_STAGE5_RE' /app/dist >/dev/null"
check_marker base_member_agenda docker exec agentezap-app sh -lc "grep -aR -m 1 'canViewAgenda' /app/dist/api/http.js >/dev/null"
check_marker base_concrete_opening docker exec agentezap-app sh -lc "grep -aR -m 1 'openingFlowActionsForConcreteRequest' /app/dist/api/http.js >/dev/null"
check_marker base_manual_cutoff docker exec agentezap-app sh -lc "grep -aR -m 1 'lastManualReconnectCutoff' /app/dist/*.js >/dev/null"
check_marker base_pwa docker exec agentezap-app sh -lc "grep -aR -m 1 'agentezap:pwa-update-dismissed-version' /app/dist/public >/dev/null"
check_marker base_theme_ai docker exec agentezap-app sh -lc "grep -aR -m 1 'Personalize com IA' /app/dist/public >/dev/null"
check_marker base_theme_simulator docker exec agentezap-app sh -lc "grep -aR -m 1 'Simulador WhatsApp' /app/dist/public >/dev/null"

cd "$DEPLOY_DIR"
test -f dist/index.js
test -f dist/api/http.js
if [ -d dist/public ]; then
  echo "[deploy] ERROR: backend-only artifact must not include dist/public" >&2
  exit 1
fi

check_marker artifact_rprado_owner grep -aR -m 1 'isMonolithRuntime2() && !hasRemoteGatewayConfigured()' dist
check_marker artifact_grupoolx_native grep -aR -m 1 'shouldDelegateGrupoOlxRoutesToVercelHttp' dist
check_marker artifact_followup_toggle grep -aR -m 1 'Conversa sem usuario dono confirmado para follow-up' dist
check_marker artifact_web_gli80_stage grep -aR -m 1 'WEB_ONLY_GLI80_STAGE5_RE' dist/api/http.js
check_marker artifact_runtime_gli80_stage grep -aR -m 1 'GLI80_RUNTIME_STAGE5_RE' dist
check_marker artifact_member_agenda grep -aR -m 1 'canViewAgenda' dist/api/http.js
check_marker artifact_concrete_opening grep -aR -m 1 'openingFlowActionsForConcreteRequest' dist/api/http.js
check_marker artifact_manual_cutoff grep -aR -m 1 'lastManualReconnectCutoff' dist
check_marker artifact_audio_msedge grep -aR -m 1 'msedge_tts' dist/api/http.js
check_marker artifact_jb_agendamento3_bridge grep -aR -m 1 'runAgendamento3DirectTurnBridge' dist
check_marker artifact_jb_agendamento3_preview grep -aR -m 1 'agendamento3CustomerPreview' dist/api/http.js
check_marker artifact_jb_realtime_guard grep -aR -m 1 'Resposta de Agendamento 3.0 revalidada' dist

cat > Dockerfile <<EOF
FROM ${current_image}
COPY dist/ /app/dist/
EOF
docker build -t "$TAG" .

cd "$COMPOSE_DIR"
pre_switch_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
if [ "$pre_switch_image" != "$EXPECTED_BASE" ]; then
  echo "[deploy] ERROR: active image changed while building (${pre_switch_image} != ${EXPECTED_BASE}). Not switching app." >&2
  exit 1
fi

cp .env.runtime ".env.runtime.backup-jb-agendamento3-realtime-guard-v140"
python3 - "$TAG" <<'PY'
from pathlib import Path
import sys

tag = sys.argv[1]
path = Path('.env.runtime')
desired = {
    'AGENTEZAP_APP_IMAGE': tag,
    'NODE_OPTIONS': '--max-old-space-size=4096',
    'WA_PENDING_TIMERS_START_DURING_RESTORE': 'false',
}
lines = path.read_text().splitlines()
out = []
seen = set()
for line in lines:
    key = line.split('=', 1)[0] if '=' in line else ''
    if key in desired:
        out.append(f'{key}={desired[key]}')
        seen.add(key)
    else:
        out.append(line)
for key, value in desired.items():
    if key not in seen:
        out.append(f'{key}={value}')
path.write_text('\n'.join(out) + '\n')
PY

docker compose --env-file .env.runtime -f compose.yml up -d --no-deps --wait app

after_auth="$(find "$SESSIONS_DIR" -maxdepth 1 -type d -name 'auth_*' | wc -l)"
after_creds="$(find "$SESSIONS_DIR" -path '*/creds.json' | wc -l)"
running_image="$(docker inspect agentezap-app --format '{{.Config.Image}}')"
running_health="$(docker inspect agentezap-app --format '{{.State.Health.Status}}')"
running_restart="$(docker inspect agentezap-app --format '{{.RestartCount}}')"
running_entrypoint="$(docker inspect agentezap-app --format '{{json .Config.Entrypoint}}')"
running_cmd="$(docker inspect agentezap-app --format '{{json .Config.Cmd}}')"

echo "[deploy] running_image=${running_image}"
echo "[deploy] running_health=${running_health}"
echo "[deploy] running_restart=${running_restart}"
echo "[deploy] running_entrypoint=${running_entrypoint}"
echo "[deploy] running_cmd=${running_cmd}"
echo "[deploy] sessions_after=${after_auth}/${after_creds}"

if [ "$after_auth" -lt "$before_auth" ] || [ "$after_creds" -lt "$before_creds" ]; then
  echo "[deploy] ERROR: session count dropped during app deploy" >&2
  exit 1
fi
if [ "$running_image" != "$TAG" ]; then
  echo "[deploy] ERROR: app did not switch to expected image ${TAG}" >&2
  exit 1
fi
if [ "$running_entrypoint" != '["docker-entrypoint.sh"]' ] || [ "$running_cmd" != '["node","dist/index.js"]' ]; then
  echo "[deploy] ERROR: deployed app has unexpected entrypoint/cmd" >&2
  exit 1
fi

check_marker deployed_rprado_owner docker exec agentezap-app sh -lc "grep -aR -m 1 'isMonolithRuntime2() && !hasRemoteGatewayConfigured()' /app/dist >/dev/null"
check_marker deployed_grupoolx_native docker exec agentezap-app sh -lc "grep -aR -m 1 'shouldDelegateGrupoOlxRoutesToVercelHttp' /app/dist >/dev/null"
check_marker deployed_followup_toggle docker exec agentezap-app sh -lc "grep -aR -m 1 'Conversa sem usuario dono confirmado para follow-up' /app/dist >/dev/null"
check_marker deployed_web_gli80_stage docker exec agentezap-app sh -lc "grep -aR -m 1 'WEB_ONLY_GLI80_STAGE5_RE' /app/dist/api/http.js >/dev/null"
check_marker deployed_runtime_gli80_stage docker exec agentezap-app sh -lc "grep -aR -m 1 'GLI80_RUNTIME_STAGE5_RE' /app/dist >/dev/null"
check_marker deployed_member_agenda docker exec agentezap-app sh -lc "grep -aR -m 1 'canViewAgenda' /app/dist/api/http.js >/dev/null"
check_marker deployed_concrete_opening docker exec agentezap-app sh -lc "grep -aR -m 1 'openingFlowActionsForConcreteRequest' /app/dist/api/http.js >/dev/null"
check_marker deployed_manual_cutoff docker exec agentezap-app sh -lc "grep -aR -m 1 'lastManualReconnectCutoff' /app/dist/*.js >/dev/null"
check_marker deployed_pwa docker exec agentezap-app sh -lc "grep -aR -m 1 'agentezap:pwa-update-dismissed-version' /app/dist/public >/dev/null"
check_marker deployed_theme_ai docker exec agentezap-app sh -lc "grep -aR -m 1 'Personalize com IA' /app/dist/public >/dev/null"
check_marker deployed_theme_simulator docker exec agentezap-app sh -lc "grep -aR -m 1 'Simulador WhatsApp' /app/dist/public >/dev/null"
check_marker deployed_jb_agendamento3_bridge docker exec agentezap-app sh -lc "grep -aR -m 1 'runAgendamento3DirectTurnBridge' /app/dist >/dev/null"
check_marker deployed_jb_agendamento3_preview docker exec agentezap-app sh -lc "grep -aR -m 1 'agendamento3CustomerPreview' /app/dist/api/http.js >/dev/null"
check_marker deployed_jb_realtime_guard docker exec agentezap-app sh -lc "grep -aR -m 1 'Resposta de Agendamento 3.0 revalidada' /app/dist >/dev/null"
docker exec agentezap-app node -e "fetch('http://127.0.0.1:5000/healthz').then(async r=>{console.log('[deploy] container_healthz='+r.status+' '+(await r.text()).slice(0,120)); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"
docker exec agentezap-app node -e "fetch('http://127.0.0.1:5000/api/health').then(async r=>{console.log('[deploy] container_api_health='+r.status+' '+(await r.text()).slice(0,300)); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"

echo "[deploy] done"
