# Go-live: station auto-upload → Mina OneDrive (Cloudflare only)

**Status: LIVE (2026-09-13)** on Worker `smartsolutions-site` / `smartsolutionsai.us`.

Verified smoke tests:
- `mina` → `Clients/Mina PC/2026-09 September/Scans/` (HTTP 200)
- `42179` (Arco HB) → `Clients/42179 (Arco HB)/2026-09 September/Scans/` (HTTP 200)

Secrets on Worker: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_DRIVE_USER`, `SCAN_STATION_TOKENS`.

## What managers do
Save scans into **`C:\Scans`** only. The station uploader posts to:

`https://smartsolutionsai.us/api/scan-ingest`

## Install / reinstall a station
Packs (tokens baked in) are on OneDrive under **`Guide/Station Uploaders/`**.

Or manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-ScanUploader.ps1 `
  -StationId 42179 `
  -StationToken "TOKEN_FROM_station-tokens.local.json" `
  -WatchFolder "C:\Scans" `
  -ApiUrl "https://smartsolutionsai.us/api/scan-ingest"
```

Mina PC uses station id `mina` (pack: `mina_Mina_PC.zip`).

## Rotate tokens / re-put secrets
```bash
npx wrangler login   # or CLOUDFLARE_API_TOKEN
python3 cloudflare/scan-ingest/generate_tokens.py
export GRAPH_DRIVE_USER='MinaMorcos@smartsolutionsai26.onmicrosoft.com'
bash cloudflare/scan-ingest/deploy-secrets.sh
```

## Entra reminder
App (`GRAPH_CLIENT_ID`) needs Application permission **Files.ReadWrite.All** + admin consent (already working as of go-live).
