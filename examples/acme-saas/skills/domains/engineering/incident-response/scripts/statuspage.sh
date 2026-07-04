#!/usr/bin/env bash
# Print current component status. Replace STATUS_URL with your status page API.
set -euo pipefail
STATUS_URL="${STATUS_URL:-https://status.example.com/api/v2/components.json}"
curl -fsSL "$STATUS_URL"
