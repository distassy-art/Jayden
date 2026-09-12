# S2K report pull schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total + DailyAPInvoice (collapsed). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **Daily Excel update** | Fill missing days in each client `* Daily.xlsx` from Daily Book Summary PDFs (gas vol/profit, c-store total, tax/scratch/lotto/card). Leave Net Purchases alone. | Mon / Wed / Fri / Sun **8:00 AM** | `0 15 * * 1,3,5,0` |
| **Scanned invoices + Copilot audit** | Pull/OCR-rename client scans to `Clients/.../Scans/YYYY-MM Month/` as `Vendor DDMM.ext`. Stage Daily Book Summary + DLY + scans into Microsoft Copilot Chat Files (`Audit_{Client}_{date}_*`). Append OCR rows into `{Client} Audit.xlsx`. | **Every day 8:00 PM** | `0 3 * * *` (PDT) / `0 4 * * *` (PST) |

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- **Wednesday 8:00 AM**: DLY/DPT and Daily Excel both run — run DLY/DPT first, then Excel.
- **Sunday**: DLY/DPT at 4:00 AM; Excel at 8:00 AM.
- Day-behind rule: as of calendar day D, pull through end of D−1.

- **Everyday 8:00 PM**: scanned-invoice rename, then per-client Copilot audit staging (Daily Book Summary + scanned invoices + DLY) and Audit.xlsx OCR append.
