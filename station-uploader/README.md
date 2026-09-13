# Station scan auto-upload (Cloudflare)

Managers keep scanning into a local folder. A small Windows program sends each PDF to **your** business OneDrive through Cloudflare. No personal↔business sharing. Managers never open a website.

## What managers do
Save / scan invoices into **`C:\Scans`**. That’s it.

## What you set up once

### A) Cloudflare Worker API
1. Add Graph app permission **Files.ReadWrite.All** (application) + admin consent.
2. Copy into the site Worker:
   - `cloudflare/scan-ingest/scan-ingest.js` → `src/handlers/scan-ingest.js`
   - `cloudflare/scan-ingest/stations.js` → `src/handlers/stations.js`
3. Follow `cloudflare/scan-ingest/WORKER_WIRING.md` (route `/api/scan-ingest`).
4. Set secrets:

```text
GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET   (existing)
GRAPH_DRIVE_USER = Mina's work UPN
SCAN_STATION_TOKENS = { "42179":"...", "42352":"...", ... }
```

Use `cloudflare/scan-ingest/station-tokens.example.json` as a template (rotate values before production).

### B) Each station PC (5 minutes)
1. Copy the `station-uploader` folder to the PC.
2. In PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-ScanUploader.ps1 `
  -StationId 42179 `
  -StationToken "THAT_STATIONS_TOKEN" `
  -WatchFolder "C:\Scans"
```

3. Point the scanner “save to” path at `C:\Scans`.

Files appear in your OneDrive under that client’s Scans month folder. The nightly OCR/audit job can rename them as today.

## Uninstall on a PC
```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall-ScanUploader.ps1
```
