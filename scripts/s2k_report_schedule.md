# S2K / Excel report schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total + DailyAPInvoice (collapsed). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **Excel → Cloudflare site** | `scripts/sync_from_excel.py`: read each store `* Daily.xlsx` open-month sheet → publish books overlay. **Excel is source of truth** for website MTD sales/purch/margin. | After Daily Excel is filled (Mon / Wed / Fri / Sun) | run after Excel fill |

## Source of truth

- **Open-month daily rows on the website** come from **Daily Excel** (`sync_from_excel.py` → `publish-books.mjs` → Cloudflare `SS_BOOKS` KV).
- Cloudflare Workers serve MTD live from the overlay:
  - `ss-api`: `GET /api/daily-open` (also `/data/daily_september.json`)
  - `ss-unified-proto` (app UI): proxies `/data/daily_september.json` → `/api/daily-open`
- Store margin = (sales − purch) / sales using Excel **C-Store Sales ($)** and **Net Daily Purchases ($)**.
- S2K Daily / DLY / DPT remain for filling Excel and audits; they do **not** override Excel on the site once Excel is applied.
- Do not invent numbers: blank Excel days are skipped.

## Variance note (2026-09)

Arco Db Excel MTD margin was **22.27%** vs site S2K-derived **17.71%**. Main gaps: Excel Deduct/net purch lower on several days, Excel sales tweaks, and site-only days after Excel’s last filled day. Excel values were applied across all stores.

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- Day-behind rule: as of calendar day D, Excel should be filled through end of D−1 when S2K has data.
- Empty S2K shells (no Station Total) are skipped when filling Excel.
- Website hosting is **Cloudflare Workers only** (not Netlify).
