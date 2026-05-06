#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:-}"
IMAGE="${2:-}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/agentezap-single/compose}"
RUNTIME_ENV="${RUNTIME_ENV:-${COMPOSE_DIR}/.env.runtime}"

if [[ -z "${SERVICE}" || -z "${IMAGE}" ]]; then
  echo "Usage: deploy-service.sh <web|api|worker|gateway> <image>" >&2
  exit 2
fi

case "${SERVICE}" in
  web) VAR_NAME="AGENTEZAP_WEB_IMAGE" ;;
  api) VAR_NAME="AGENTEZAP_API_IMAGE" ;;
  worker) VAR_NAME="AGENTEZAP_WORKER_IMAGE" ;;
  gateway) VAR_NAME="AGENTEZAP_GATEWAY_IMAGE" ;;
  *)
    echo "Invalid service: ${SERVICE}" >&2
    exit 2
    ;;
esac

cd "${COMPOSE_DIR}"
test -f compose.yml
test -f "${RUNTIME_ENV}"

PREVIOUS_IMAGE="$(grep -E "^${VAR_NAME}=" "${RUNTIME_ENV}" | tail -n 1 | cut -d= -f2- || true)"
if [[ -n "${PREVIOUS_IMAGE}" ]]; then
  echo "${PREVIOUS_IMAGE}" > ".previous-${SERVICE}.image"
fi

if grep -qE "^${VAR_NAME}=" "${RUNTIME_ENV}"; then
  sed -i "s|^${VAR_NAME}=.*|${VAR_NAME}=${IMAGE}|" "${RUNTIME_ENV}"
else
  printf "\n%s=%s\n" "${VAR_NAME}" "${IMAGE}" >> "${RUNTIME_ENV}"
fi

docker compose --env-file "${RUNTIME_ENV}" -f compose.yml pull "${SERVICE}"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml up -d --no-deps --wait "${SERVICE}"
docker compose --env-file "${RUNTIME_ENV}" -f compose.yml ps "${SERVICE}"

echo "Deploy finished: ${SERVICE} -> ${IMAGE}"
