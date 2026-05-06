#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:-}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/agentezap-single/compose}"

if [[ -z "${SERVICE}" ]]; then
  echo "Usage: rollback-service.sh <web|api|worker|gateway>" >&2
  exit 2
fi

PREVIOUS_FILE="${COMPOSE_DIR}/.previous-${SERVICE}.image"
if [[ ! -f "${PREVIOUS_FILE}" ]]; then
  echo "No previous image recorded for ${SERVICE}" >&2
  exit 1
fi

IMAGE="$(cat "${PREVIOUS_FILE}")"
"${COMPOSE_DIR}/scripts/deploy-service.sh" "${SERVICE}" "${IMAGE}"
