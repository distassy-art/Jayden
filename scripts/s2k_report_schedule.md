# S2K report pull schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total + DailyAPInvoice (collapsed). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **Daily Excel update** | Scripted fill of each client `* Daily.xlsx` from Daily Book Summary PDFs (main rows + secondary tables). **Not Copilot.** Leave Net Purchases alone. | Mon / Wed / Fri / Sun **8:00 AM** | `0 15 * * 1,3,5,0` |

## Daily.xlsx method (standard)

**Use scripted PDF → Excel only.** Do not use Copilot (or manual bulk entry) for Daily.xlsx going forward.

1. If day-behind Daily Book PDFs are missing, pull them first:
   `python3 scripts/fill_daily_dly_dpt.py --mode daily`
2. Main table (gas vol/profit, c-store total, tax/scratch/lotto/card; restore blank formulas):
   `python3 scripts/fill_daily_excel.py`
3. Secondary tables (Receipt LOTTERY/LOTTO, Top N departments, Source dept tables):
   `python3 scripts/fill_daily_excel_secondary.py`

Rules:
- Fill **blank cells only** — never overwrite existing values.
- **Never** overwrite Net Purchases / purchase-ledger columns.
- Day-behind: as of calendar day D, fill through end of D−1.
- Optional: `--through YYYY-MM-DD` / `--dry-run` on both Excel scripts.

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` and `scripts/fill_daily_excel.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- **Wednesday 8:00 AM**: DLY/DPT and Daily Excel both run — run DLY/DPT first, then Excel.
- **Sunday**: DLY/DPT at 4:00 AM; Excel at 8:00 AM.
- Excel at 8:00 AM may need a Daily Book pull first because the daily PDF job is 2:00 PM day-behind.
