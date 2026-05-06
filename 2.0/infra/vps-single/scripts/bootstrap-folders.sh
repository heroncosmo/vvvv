#!/usr/bin/env bash
set -euo pipefail

sudo mkdir -p /opt/agentezap-single/compose
sudo mkdir -p /data/agentezap/sessions
sudo mkdir -p /data/agentezap/runtime/uploads
sudo mkdir -p /data/agentezap/runtime/attached_assets
sudo mkdir -p /data/agentezap/runtime/temp_audio
sudo mkdir -p /data/agentezap/runtime/logs

sudo chown -R "${USER}:${USER}" /opt/agentezap-single/compose
sudo chown -R "${USER}:${USER}" /data/agentezap/runtime

echo "Folders ready."
