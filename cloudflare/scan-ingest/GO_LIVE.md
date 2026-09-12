# Go-live: station auto-upload → Mina OneDrive (Cloudflare)

This VM cannot log into your Cloudflare account, so secrets/deploy must be run on your machine (or after you provide `CLOUDFLARE_API_TOKEN`).

## 1) Entra / Azure AD (one time)
App used by Worker Graph secrets (`GRAPH_CLIENT_ID`):

1. Azure Portal → App registrations → that app  
2. **API permissions** → Add → Microsoft Graph → **Application** → **Files.ReadWrite.All**  
3. **Grant admin consent**  
4. Confirm existing mail permission still present if you use send-summary

## 2) Put scan-ingest into the live Worker
Site Worker name: `smartsolutions-site` (domain `smartsolutionsai.us`).

Files already prepared under `cloudflare/scan-ingest/` and wired in the local `/tmp/ss-site` copy:

- `src/handlers/scan-ingest.js`
- `src/handlers/stations.js`
- route in `src/worker.js`: `POST /api/scan-ingest`

Deploy your normal site Worker build that includes those files.

## 3) Set Worker secrets
From this repo (after `npx wrangler login`):

```bash
# tokens already generated on this agent VM:
#   cloudflare/scan-ingest/station-tokens.local.json  (gitignored)

export GRAPH_DRIVE_USER='MinaMorcos@smartsolutionsai26.onmicrosoft.com'
bash cloudflare/scan-ingest/deploy-secrets.sh
```

If tokens are missing:

```bash
python3 cloudflare/scan-ingest/generate_tokens.py
```

Existing secrets (keep): `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`.

## 4) Smoke test
```bash
python3 - <<'PY'
import json
print(json.load(open('cloudflare/scan-ingest/station-tokens.local.json'))['42179'])
PY
# then:
curl -sS -X POST https://smartsolutionsai.us/api/scan-ingest \
  -H "X-Station-Id: 42179" \
  -H "X-Station-Token: PASTE_TOKEN" \
  -H "X-Filename: probe.pdf" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/t.pdf
```

Expect JSON `{"ok":true,"folder":"Clients/.../Scans/..."}` and the file in your OneDrive.

## 5) Install on each store PC
Per-station zip packs (with tokens baked in) are on this VM at:

`/tmp/station-uploader-packs/*.zip`

Or install manually from `station-uploader/`:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-ScanUploader.ps1 `
  -StationId 42179 `
  -StationToken "TOKEN_FROM_station-tokens.local.json" `
  -WatchFolder "C:\Scans" `
  -ApiUrl "https://smartsolutionsai.us/api/scan-ingest"
```

Tell managers: **save scans into `C:\Scans` only.**

## Blockers on this agent
- No Cloudflare login / `CLOUDFLARE_API_TOKEN` → cannot push secrets or deploy from here  
- Graph **Files.ReadWrite.All** must be consented in your tenant  

If you paste a Cloudflare API token (Account Workers Scripts Edit + Secrets edit) into the environment, I can run deploy + secret put for you next.
