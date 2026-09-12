#!/usr/bin/env bash
# Run on a machine where you can `npx wrangler login` (or have CLOUDFLARE_API_TOKEN set).
# Deploys scan-ingest wiring secrets for smartsolutions-site.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOKENS_FILE="${1:-$ROOT/cloudflare/scan-ingest/station-tokens.local.json}"
DRIVE_USER="${GRAPH_DRIVE_USER:-MinaMorcos@smartsolutionsai26.onmicrosoft.com}"
WORKER_NAME="${WORKER_NAME:-smartsolutions-site}"

if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "Missing tokens file: $TOKENS_FILE" >&2
  echo "Generate with: python3 cloudflare/scan-ingest/generate_tokens.py" >&2
  exit 1
fi

if ! npx --yes wrangler@4 whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: npx wrangler login" >&2
  echo "Or export CLOUDFLARE_API_TOKEN=..." >&2
  exit 1
fi

echo "Setting GRAPH_DRIVE_USER=$DRIVE_USER"
printf '%s' "$DRIVE_USER" | npx --yes wrangler@4 secret put GRAPH_DRIVE_USER --name "$WORKER_NAME"

echo "Setting SCAN_STATION_TOKENS from $TOKENS_FILE"
npx --yes wrangler@4 secret put SCAN_STATION_TOKENS --name "$WORKER_NAME" < "$TOKENS_FILE"

echo
echo "NOTE: GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET should already exist"
echo "(used by send-summary). Confirm in Cloudflare dashboard → Worker → Settings → Variables."
echo
echo "Also required in Entra (Azure AD) app:"
echo "  Application permission Files.ReadWrite.All → Grant admin consent"
echo
echo "Done. Test with:"
echo "  SID=42179; TOK=\$(python3 -c \"import json;print(json.load(open('$TOKENS_FILE'))['42179'])\")"
echo "  printf '%%PDF-1.4 test' > /tmp/t.pdf"
echo "  curl -sS -X POST https://smartsolutionsai.us/api/scan-ingest \\"
echo "    -H \"X-Station-Id: \$SID\" -H \"X-Station-Token: \$TOK\" -H 'X-Filename: probe.pdf' \\"
echo "    -H 'Content-Type: application/pdf' --data-binary @/tmp/t.pdf"
