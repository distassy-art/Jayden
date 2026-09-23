# S2K report pull schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total + DailyAPInvoice (collapsed). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **S2K → site + Excel** | `scripts/sync_from_s2k.py`: Daily Book + **DLY** (purch by Inv Date) + **DPT** (staged) → publish books overlay **and** fill `* Daily.xlsx`. S2K is source of truth; Excel is output only. Store margin = (sales − purch) / sales. | Mon / Wed / Fri / Sun **8:00 AM** (after Daily + DLY/DPT pull) | `0 15 * * 1,3,5,0` |

## Source of truth

- **Open-month daily rows on the website** come from S2K Daily Book + DLY PDFs (`sync_from_s2k.py` → `publish-books.mjs`), not from Excel extracts.
- **Purchases / store margin**: DLY expand (None Fuel Invoice Total) summed by Inv Date per TSO. DPT is pulled with DLY for department cost audit.
- **Daily Excel** is filled from the same PDF parses so sheets stay aligned; it is no longer required for the site to update.
- `sync_books_scheduled.py` (Excel walker) remains for Monthly / ExtraMile and as a fallback only.

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- **Wednesday 8:00 AM**: DLY/DPT first, then `sync_from_s2k.py` (site + Excel).
- **Sunday**: DLY/DPT at 4:00 AM; S2K→site+Excel at 8:00 AM.
- Day-behind rule: as of calendar day D, pull through end of D−1.
- Do not invent numbers: empty S2K shells (no Station Total) are skipped.
