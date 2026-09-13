# Go-live: station auto-upload → Mina OneDrive (Cloudflare)

Status: **working end to end.** The endpoint is live at
`https://smartsolutionsai.us/api/scan-ingest`, the Graph app has drive
permission, and real PDFs land in Mina's business OneDrive. What is left is
physical: rotate tokens, build the packs, install the store PCs.

## Done

| Step | State |
|------|-------|
| `scan-ingest` wired into `smartsolutions-site` | live at 100% of traffic; see "current version" below |
| `GRAPH_DRIVE_USER` secret | set to `MinaMorcos@smartsolutionsai26.onmicrosoft.com` |
| `SCAN_STATION_TOKENS` secret | set, 17 stations |
| `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | already existed, untouched, shared with `send-summary` |
| `Files.ReadWrite.All`, admin consent | granted 2026-09-13 on **Smart Solutions Summary Mail**, `5728760e-b482-4782-8ca0-76ac7fc447fd` |
| Live upload verified | 2026-09-13, stations 42179, 42004, 42021 — `{"ok":true}`, files in OneDrive |

Current version: `11f72d13-016e-4dfc-b592-a40816939083` (151) — the wrapper from
section 2 plus the station tokens rotated during the 2026-09-13 retest.

## 1) The Graph app

`GRAPH_CLIENT_ID` is **Smart Solutions Summary Mail**
(`5728760e-b482-4782-8ca0-76ac7fc447fd`), the same app `send-summary` uses for
mail. It now holds Application permission `Files.ReadWrite.All` with admin
consent, which is what uploads need; the mail permission is still in place.

Before consent, every upload answered
`502 graph_upload_failed … mkdir_failed:/Clients:403 accessDenied` — a valid
token refused at the drive write. If that reappears, the consent was removed or
`GRAPH_CLIENT_ID` was repointed at an app without the permission.

To confirm which app the Worker is actually using without printing the value,
upload a version (no `--promote`) that returns `sha256(env.GRAPH_CLIENT_ID)` and
hit its preview URL: `sha256` of the id above is
`953191d4d562d78dc38afb449aba4876789b65d6f9f37184fcf3b2ac26d790b1`.

If you would rather not leave the mail app with drive-wide access, register a
second app for scans only — but those three secrets are shared with
`send-summary`, so splitting them means giving the scan app its own secret names
and a one-line change in `scan-ingest.js`.

## 2) How scan-ingest got into the live Worker

The `smartsolutions-site` bundle is built from a source tree that is not in this
repo, so it cannot be rebuilt here. `deploy-into-live-worker.py` therefore
downloads the bundle that is running, keeps it byte-for-byte as a module, and
uploads a new version with `worker-entry.js` in front of it. The entry module
answers the two scan-ingest paths and hands every other request to the site
untouched; assets are carried over with `keep_assets`, and the `_redirects`
rules behind `/tickets`, `/billing`, `/admin` and friends are re-stated on
upload so they survive.

```bash
export CLOUDFLARE_API_TOKEN=...    # Workers Scripts:Edit
export CLOUDFLARE_ACCOUNT_ID=...  # Distassy account, from the Cloudflare dashboard

python3 cloudflare/scan-ingest/deploy-into-live-worker.py            # upload only, prints a preview URL
python3 cloudflare/scan-ingest/deploy-into-live-worker.py --promote  # upload, then send 100% to it
```

The upload publishes nothing on its own. Test the preview URL it prints, then
promote. To undo, deploy the previous version:

```bash
# 882e7abd… is the last version before any of this; 647cecb2… is that same code
# plus the two new secrets.
python3 cloudflare/scan-ingest/deploy-into-live-worker.py \
  --deploy 647cecb2-2429-48d3-b555-363a6234a90b -m "roll back scan-ingest"
```

**When the site's own source tree is deployed again, this wrapper is replaced
and the endpoint disappears.** Wire the handler into that tree as well, per
`WORKER_WIRING.md`, or re-run the script after each site deploy.

## 3) Secrets and smoke test

```bash
python3 cloudflare/scan-ingest/generate_tokens.py       # writes station-tokens.local.json (gitignored)
export GRAPH_DRIVE_USER='MinaMorcos@smartsolutionsai26.onmicrosoft.com'
bash cloudflare/scan-ingest/deploy-secrets.sh
```

```bash
SID=42179
TOK=$(python3 -c "import json;print(json.load(open('cloudflare/scan-ingest/station-tokens.local.json'))['$SID'])")
printf '%%PDF-1.4 test padded past the sixty-four byte minimum ................' > /tmp/t.pdf
curl -sS -X POST https://smartsolutionsai.us/api/scan-ingest \
  -H "X-Station-Id: $SID" -H "X-Station-Token: $TOK" \
  -H 'X-Filename: probe.pdf' -H 'Content-Type: application/pdf' \
  --data-binary @/tmp/t.pdf
```

What the answers mean:

| Response | Meaning |
|----------|---------|
| `{"ok":true,"folder":"Clients/.../Scans/..."}` | working, file is in OneDrive |
| `401 missing_station_auth` | no id/token headers |
| `403 bad_station_token` | token does not match `SCAN_STATION_TOKENS` — routing is fine |
| `502 graph_upload_failed … accessDenied` | Files.ReadWrite.All not consented yet (section 1) |
| `502 … token_failed` | Graph tenant/client/secret wrong |
| `503 missing_GRAPH_DRIVE_USER` | secret not set |

## 4) Install on each store PC

Per-station zip packs, each with only that station's token and a one-click
`INSTALL.cmd`:

```bash
python3 cloudflare/scan-ingest/build-station-packs.py   # → /tmp/station-uploader-packs/*.zip
```

The packs and `station-tokens.local.json` hold live credentials: they are
gitignored, written to `/tmp`, and **do not survive the agent VM they were built
on**. If they are gone, regenerate rather than hunt for them — `generate_tokens.py
--force`, then `deploy-secrets.sh`, then `build-station-packs.py`. Rotating
tokens this way invalidates any pack already installed on a PC, so rotate before
you visit the stores, not after.

The tokens live on the Worker were last rotated during the 2026-09-13 retest, on
a VM that is gone, so **the packs have to be rebuilt before any install** — build
them on the machine you will carry to the stores.

Manual install, if you prefer not to use a pack:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-ScanUploader.ps1 `
  -StationId 42179 `
  -StationToken "TOKEN_FROM_station-tokens.local.json" `
  -WatchFolder "C:\Scans" `
  -ApiUrl "https://smartsolutionsai.us/api/scan-ingest"
```

Tell managers: **save scans into `C:\Scans` only.**
