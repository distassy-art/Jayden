# Wire scan-ingest into the site Cloudflare Worker

## Copy files
```
src/handlers/scan-ingest.js  ← cloudflare/scan-ingest/scan-ingest.js
src/handlers/stations.js     ← cloudflare/scan-ingest/stations.js
```

## Patch `src/worker.js`
```js
import { handleScanIngest } from "./handlers/scan-ingest.js";

// inside fetch(), BEFORE any text-body adapter:
if (path === "/api/scan-ingest" || path === "/.netlify/functions/scan-ingest") {
  return handleScanIngest(request, env);
}
```

Use the raw `Request` (binary PDF). Do not parse the body as text.

## Secrets / vars
| Name | Purpose |
|------|---------|
| `GRAPH_TENANT_ID` | Existing Graph app |
| `GRAPH_CLIENT_ID` | Existing |
| `GRAPH_CLIENT_SECRET` | Existing |
| `GRAPH_DRIVE_USER` | Mina work UPN (business OneDrive) |
| `SCAN_STATION_TOKENS` | JSON `{"42179":"token",...}` |

Template: `station-tokens.example.json` (rotate before production).

## Graph permission
Application permission **Files.ReadWrite.All**, admin consent required.
