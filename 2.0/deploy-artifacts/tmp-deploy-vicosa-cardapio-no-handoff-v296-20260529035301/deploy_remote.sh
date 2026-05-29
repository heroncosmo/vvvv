#!/usr/bin/env bash
set -euo pipefail

artifact=/tmp/tmp-deploy-vicosa-cardapio-no-handoff-v296-20260529035301.tgz
workdir=/tmp/tmp-deploy-vicosa-cardapio-no-handoff-v296-20260529035301
tag=agentezap-app:vicosa-cardapio-no-handoff-v296-20260529035301
base=agentezap-app:mauricio-mfc-catalog-number-guard-v295-20260529033000

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
  printf 'LABEL agentezap.patch="vicosa-cardapio-no-handoff-v296"\n'
} > "$workdir/Dockerfile"

test ! -d "$workdir/dist/public"
grep -aR -m 1 'calibracao_vicosa_cardapio_sem_handoff_2026_05_29' "$workdir/dist" >/dev/null
grep -aR -m 1 'ensureVicosaPizzaMenuMediaAction' "$workdir/dist" >/dev/null
grep -aR -m 1 'CARDAPIO_VICOSA' "$workdir/dist" >/dev/null

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
docker exec agentezap-app sh -lc "grep -aR -m 1 'calibracao_vicosa_cardapio_sem_handoff_2026_05_29' /app/dist >/dev/null && grep -aR -m 1 'ensureVicosaPizzaMenuMediaAction' /app/dist >/dev/null && grep -aR -m 1 'CARDAPIO_VICOSA' /app/dist >/dev/null && echo vicosa-cardapio-no-handoff-ok"

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
