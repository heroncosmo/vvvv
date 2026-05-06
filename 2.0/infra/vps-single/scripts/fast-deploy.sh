#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:-}"
IMAGE_TAG="${2:-}"
IMAGE_OWNER="${IMAGE_OWNER:-}"
REGISTRY="${REGISTRY:-ghcr.io}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/agentezap-single/compose}"

if [[ -z "${SERVICE}" || -z "${IMAGE_TAG}" || -z "${IMAGE_OWNER}" ]]; then
  echo "Usage: IMAGE_OWNER=<owner> fast-deploy.sh <web|api|worker|gateway|app|all> <image-tag>" >&2
  exit 2
fi

APP_IMAGE="${REGISTRY}/${IMAGE_OWNER}/agentezap-app:${IMAGE_TAG}"
GATEWAY_IMAGE="${REGISTRY}/${IMAGE_OWNER}/agentezap-gateway:${IMAGE_TAG}"

deploy_one() {
  local service="$1"
  local image="$2"
  "${COMPOSE_DIR}/scripts/deploy-service.sh" "${service}" "${image}"
}

case "${SERVICE}" in
  web|api|worker)
    deploy_one "${SERVICE}" "${APP_IMAGE}"
    ;;
  gateway)
    deploy_one gateway "${GATEWAY_IMAGE}"
    ;;
  app)
    deploy_one api "${APP_IMAGE}"
    deploy_one worker "${APP_IMAGE}"
    deploy_one web "${APP_IMAGE}"
    ;;
  all)
    deploy_one gateway "${GATEWAY_IMAGE}"
    deploy_one api "${APP_IMAGE}"
    deploy_one worker "${APP_IMAGE}"
    deploy_one web "${APP_IMAGE}"
    ;;
  *)
    echo "Invalid service: ${SERVICE}" >&2
    exit 2
    ;;
esac

"${COMPOSE_DIR}/scripts/health.sh" || true
