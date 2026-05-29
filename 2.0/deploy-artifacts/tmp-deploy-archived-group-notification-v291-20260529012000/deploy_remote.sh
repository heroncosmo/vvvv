#!/usr/bin/env bash
set -euo pipefail

artifact=/tmp/tmp-deploy-archived-group-notification-v291-20260529012000.tgz
workdir=/tmp/tmp-deploy-archived-group-notification-v291-20260529012000
tag=agentezap-app:archived-group-notification-v291-20260529012000
base=agentezap-app:card-cnpj-recurring-v290-20260528143559

running_before="$(docker inspect agentezap-app --format '{{.Config.Image}}' 2>/dev/null || true)"
if [ "$running_before" != "$base" ]; then
  echo "ABORT_BASE_MISMATCH expected=$base running=$running_before" >&2
  exit 42
fi

ag_creds_before=$(find /data/agentezap/sessions -name creds.json 2>/dev/null | wc -l)
legacy_creds_before=$(find /data/whatsapp-sessions -name creds.json 2>/dev/null | wc -l)

rm -rf "$workdir"
mkdir -p "$workdir"
tar -xzf "$artifact" -C "$workdir"

{
  printf 'FROM %s\n' "$base"
  printf 'WORKDIR /app\n'
  printf "RUN find /app/dist -maxdepth 1 -type f -name '*.js' -delete && rm -rf /app/dist/api\n"
  printf 'COPY dist/*.js /app/dist/\n'
  printf 'COPY dist/api /app/dist/api\n'
  printf 'COPY dist/public/index.html /app/dist/public/index.html\n'
  printf 'COPY dist/public/assets/index-DDpCrENk.js /app/dist/public/assets/index-DDpCrENk.js\n'
  printf 'COPY dist/public/assets/index-BNlMGiFX.js /app/dist/public/assets/index-BNlMGiFX.js\n'
  printf 'COPY dist/public/assets/index-Bxu0_nhv.js /app/dist/public/assets/index-Bxu0_nhv.js\n'
  printf 'COPY dist/public/assets/index-onQ5e4E0.js /app/dist/public/assets/index-onQ5e4E0.js\n'
  printf 'COPY dist/public/assets/web-OPlJZlBG.js /app/dist/public/assets/web-OPlJZlBG.js\n'
  printf 'COPY dist/public/assets/main-DvcVRf65.js /app/dist/public/assets/main-DvcVRf65.js\n'
  printf 'COPY dist/public/assets/main-DvL3yQNR.css /app/dist/public/assets/main-DvL3yQNR.css\n'
  printf 'LABEL agentezap.patch="archived-group-notification-v291"\n'
} > "$workdir/Dockerfile"

grep -aR -m 1 'if (!nextIsArchived)' "$workdir/dist/api/http.js" >/dev/null
grep -aR -m 1 'isArchived===!0;if(!' "$workdir/dist/public/assets/main-DvcVRf65.js" >/dev/null

docker build -f "$workdir/Dockerfile" -t "$tag" "$workdir"

cd /opt/agentezap-single/compose
test -f compose.host-nginx.yml
./scripts/deploy-service.sh app "$tag"

printf 'LOCAL_HEALTH='
curl -fsS http://127.0.0.1:5000/healthz
echo
printf 'LOCAL_API_HEALTH='
curl -fsS http://127.0.0.1:5000/api/health
echo
printf 'PUBLIC_HEALTH='
curl -fsS https://agentezap.online/healthz
echo
printf 'PUBLIC_API_HEALTH='
curl -fsS https://agentezap.online/api/health
echo
printf 'MARKER='
docker exec agentezap-app sh -lc "grep -aR -m 1 'if (!nextIsArchived)' /app/dist/api/http.js >/dev/null && grep -aR -m 1 'isArchived===!0;if(!' /app/dist/public/assets/main-DvcVRf65.js >/dev/null && echo archived-group-notification-ok"

ag_creds_after=$(find /data/agentezap/sessions -name creds.json 2>/dev/null | wc -l)
legacy_creds_after=$(find /data/whatsapp-sessions -name creds.json 2>/dev/null | wc -l)

echo "BASE_IMAGE=$base"
echo "NEW_IMAGE=$tag"
echo "RUNNING_BEFORE=$running_before"
echo "RUNNING_IMAGE=$(docker inspect agentezap-app --format '{{.Config.Image}}')"
echo "AGENTEZAP_CREDS_BEFORE=$ag_creds_before"
echo "AGENTEZAP_CREDS_AFTER=$ag_creds_after"
echo "LEGACY_CREDS_BEFORE=$legacy_creds_before"
echo "LEGACY_CREDS_AFTER=$legacy_creds_after"
echo "PORTS=$(docker port agentezap-app 2>/dev/null | tr '\n' ',')"
