# Weekly AI pricing nudge email (managers)

## Goal
Every **Monday morning**, email each store **manager** who still has AI price recommendations **not yet entered in S2K** (site banner / scorecard “AI recs not entered”).

Each email includes:
- **Pending count** for that manager’s store(s)
- **Top 5 items by impact** (weekly profit change from `ai-pricing-impact.json` when posted; else retail gap `recommended − current`)
- **Link** to the AI Pricing tab: `https://smartsolutionsai.us/app.html#ai-pricing/<stationId>`

**From:** `orders@` via **Microsoft Graph** (same as order PDF emails).  
**Cadence:** **One email per manager per week** (dedupe via `COORDINATION-LOG.md`).

## Pending definition (match AI Pricing tab)
From `ai-pricing-weekly.json` for the current report week:
1. Finding is a **recommended increase** (`recommendedRetail > currentRetail`).
2. **Not ignored** (active ignore = same `newCost` at 4 decimals in `/api/ai-pricing/ignores`).
3. **Not entered this week** (UPC in `/api/ai-pricing/tracked` with matching `week`).
4. **Not approved this week** (UPC in `/api/ai-pricing/approvals?week=…&stationId=…`).

Manager emails: `scripts/manager_email_by_station.json` (same map as `managerEmailByStation` in `app.html`). Skip stores with blank email (e.g. Paradise #42359).

## Jayden automation
| Piece | Path |
|--------|------|
| Runner | `scripts/send_pricing_nudge_emails.py` |
| Schedule | `.github/workflows/pricing-nudge-weekly.yml` — Mondays 15:00 UTC (~8:00 AM PT) |
| Log | `COORDINATION-LOG.md` — append one line per manager per run |

### GitHub Actions secrets
| Secret | Purpose |
|--------|---------|
| `SS_ADMIN_EMAIL` / `SS_ADMIN_PASSWORD` | Admin session for ignores / approvals / tracked (or `SS_SESSION_TOKEN`) |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | Optional Graph fallback if ss-api route not live yet |
| `PRICING_NUDGE_FORCE_TO` | Optional; test override (MinaMorcos@ only, same rule as order send) |

### Manual run
```bash
# Dry-run (default): compute + log, no mail
python3 scripts/send_pricing_nudge_emails.py

# Live send (after ss-api handler deployed)
python3 scripts/send_pricing_nudge_emails.py --send
```

## ss-unified-proto (ss-api) — deploy handler
Jayden **cannot** publish `api/src/` via the site bridge. Add worker route:

- **POST** `/api/send-pricing-nudge-to-manager`
- Reference implementation: `scripts/ss-api-reference/send-pricing-nudge-to-manager.js`
- Register in worker `FN` map next to `"send-order-to-manager"`.
- Reuse `GRAPH_*` env and `ORDERS_FROM` = `orders@smartsolutionsai26.onmicrosoft.com`.

**JSON body:**
```json
{
  "managerEmail": "robertking630@gmail.com",
  "weekStart": "2026-09-21",
  "weekEnd": "2026-09-27",
  "siteBase": "https://smartsolutionsai.us",
  "stores": [
    {
      "id": "42179",
      "name": "Arco HB",
      "pendingCount": 23,
      "topItems": [
        { "item": "…", "currentRetail": 1.69, "recommendedRetail": 1.79, "impact": 0.42 }
      ]
    }
  ],
  "dryRun": false,
  "forceTo": ""
}
```

Until this route is deployed, `--send` falls back to Graph from the GitHub Action when Graph secrets are set.

## Coordination log format
```
- pricing-nudge · week 2026-09-21_2026-09-27 · email@… · sent · pending=23 · via=ss-api · subject=…
```

Duplicate **sent** lines for the same week + email are skipped on the next run.
