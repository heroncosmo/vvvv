#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/agentezap-single/compose}"
RUNTIME_ENV="${RUNTIME_ENV:-${COMPOSE_DIR}/.env.runtime}"

cd "${COMPOSE_DIR}"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml ps

echo
echo "API:"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml exec -T api node -e "fetch('http://127.0.0.1:5000/healthz').then(async r=>{console.log(r.status, await r.text())}).catch(e=>{console.error(e);process.exit(1)})"

echo
echo "Worker:"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml exec -T worker node -e "fetch('http://127.0.0.1:5000/healthz').then(async r=>{console.log(r.status, await r.text())}).catch(e=>{console.error(e);process.exit(1)})"

echo
echo "Gateway:"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml exec -T gateway node -e "fetch('http://127.0.0.1:5001/health').then(async r=>{console.log(r.status, await r.text())}).catch(e=>{console.error(e);process.exit(1)})"
