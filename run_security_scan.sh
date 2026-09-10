#!/usr/bin/env bash
#
# run_security_scan.sh
# Strix AI pentest runner for SIH-206 disaster management platform.
# See header for full usage instructions.
#
# PREREQUISITES:
#   strix installed (curl -sSL https://strix.ai/install | bash  OR  pipx install strix-agent)
#   export STRIX_LLM="anthropic/claude-sonnet-4-6"
#   export LLM_API_KEY="your-api-key"
#
# USAGE:
#   bash run_security_scan.sh                          # white-box only
#   bash run_security_scan.sh http://192.168.x.x:5000 # + live black-box
#   bash run_security_scan.sh http://x.x.x.x:5000 "admin@sih.gov.in:pass"  # + auth

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-.}"
LIVE_TARGET="${1:-}"
AUTH_CREDS="${2:-}"

if [[ -z "${STRIX_LLM:-}" || -z "${LLM_API_KEY:-}" ]]; then
  echo "ERROR: STRIX_LLM and LLM_API_KEY must be set before running this script."
  echo "  export STRIX_LLM=\"anthropic/claude-sonnet-4-6\""
  echo "  export LLM_API_KEY=\"your-api-key\""
  exit 1
fi

INSTRUCTIONS="Focus on this disaster-response platform known risk areas:
(1) /api/offline/sync-batch: injection, missing auth, replay attacks, idempotency bypass.
(2) 0.0.0.0 LAN binding: CORS, which endpoints are reachable from LAN without auth.
(3) SOS and hazard POST endpoints: unauthenticated writes, GPS spoofing, rate-limit DoS.
(4) Client-side IndexedDB offline queue: unencrypted sensitive data on lost/stolen device.
(5) Service Worker cache: stale sensitive data leakage to next device user.
Rate severity by disaster-response impact, not just CVSS."

echo "== Strix: white-box source scan =="
strix --target "$PROJECT_DIR" --instructions "$INSTRUCTIONS"

if [[ -n "$LIVE_TARGET" ]]; then
  echo ""
  echo "== Strix: live instance ($LIVE_TARGET) =="
  if [[ -n "$AUTH_CREDS" ]]; then
    strix --target "$LIVE_TARGET" \
      --instructions "$INSTRUCTIONS Authenticated testing with: $AUTH_CREDS. Prioritize priv-esc between CITIZEN/VOLUNTEER/ADMIN roles."
  else
    strix --target "$LIVE_TARGET" --instructions "$INSTRUCTIONS"
  fi
fi

echo ""
echo "Done. Report saved in strix_runs/. Fix HIGH/CRITICAL on SOS, hazard, sync-batch first."
