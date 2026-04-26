#!/usr/bin/env bash
# Run `next dev` locally pointed at the homelander k8s cluster.
#
# The backend is already published via Ingress at
# https://royal-dispatch-home.quybits.com/api/* (see
# gitops-rackspace/apps/royal-dispatch/overlays/homelander/ingress-patch.yaml),
# so no kubectl port-forward is needed.
#
# If a service ever stops being published, add a port-forward like:
#   kubectl -n <ns> port-forward svc/<svc> <local>:<remote> &
#   trap 'kill %1' EXIT
# and point BACKEND_URL at the forwarded localhost port.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Trailing `/api` is required: Next.js rewrites strip `/api/` from the
# inbound path before forwarding, so the destination must add it back
# for the ingress's `/api/(.*)` rule to match.
BACKEND_URL="${BACKEND_URL:-https://royal-dispatch-home.quybits.com/api}"

echo "→ Probing backend at $BACKEND_URL/story/today ..."
if ! curl -fsS -o /dev/null --max-time 10 "$BACKEND_URL/story/today"; then
  echo "✗ Backend unreachable at $BACKEND_URL" >&2
  echo "  Check: kubectl -n royal-dispatch get ingress,svc,pod" >&2
  exit 1
fi
echo "✓ Backend reachable"

cd "$SCRIPT_DIR"
export INTERNAL_API_URL="$BACKEND_URL"
echo "→ INTERNAL_API_URL=$INTERNAL_API_URL"
exec pnpm dev
