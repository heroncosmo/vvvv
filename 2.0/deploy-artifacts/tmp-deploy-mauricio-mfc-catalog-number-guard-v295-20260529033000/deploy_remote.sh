#!/usr/bin/env bash
set -euo pipefail

artifact=/tmp/tmp-deploy-mauricio-mfc-catalog-number-guard-v295-20260529033000.tgz
workdir=/tmp/tmp-deploy-mauricio-mfc-catalog-number-guard-v295-20260529033000
tag=agentezap-app:mauricio-mfc-catalog-number-guard-v295-20260529033000
base=agentezap-app:mauricio-mfc-50x50-promo-v294-20260529030500

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
  printf 'COPY dist /app/dist\n'
  printf 'LABEL agentezap.patch="mauricio-mfc-catalog-number-guard-v295"\n'
} > "$workdir/Dockerfile"

test ! -d "$workdir/dist/public"
grep -aR -m 1 'mauricio_mfc_50x50_promo' "$workdir/dist" >/dev/null
grep -aR -m 1 'isCatalogOperationalNumberContext' "$workdir/dist" >/dev/null
grep -aR -m 1 'painel|paineis|redondo' "$workdir/dist" >/dev/null

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
printf 'PUBLIC_PWA_VERSION='
curl -fsS https://agentezap.online/pwa-version.json
echo
printf 'MARKER='
docker exec agentezap-app sh -lc "grep -aR -m 1 'isCatalogOperationalNumberContext' /app/dist >/dev/null && grep -aR -m 1 'mauricio_mfc_50x50_promo' /app/dist >/dev/null && echo mauricio-mfc-catalog-number-guard-ok"

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
