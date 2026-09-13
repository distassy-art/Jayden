# S2K report pull schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **Daily Book + DLY + DPT** | Daily Book Summary (`DailyTotal+Summary`, `ShowCost=1`) plus DLY (None Fuel Invoice Total) and DPT (DailyAPInvoice collapsed). Daily PDFs accumulate; DLY/DPT keep latest MTD only (delete older `*dly*` / `*dpt*` in that month folder). | **Every day 2:00 PM** | `0 21 * * *` |
| **Daily Excel update** | Scripted fill of each client `* Daily.xlsx` from Daily Book Summary PDFs (main rows + secondary tables). **Not Copilot.** Blank Net Purchases → **0** until DLY/DPT supplies real totals. | Mon / Wed / Fri / Sun **8:00 AM** | `0 15 * * 1,3,5,0` |

## Daily.xlsx method (standard)

**Use scripted PDF → Excel only.** Do not use Copilot (or manual bulk entry) for Daily.xlsx going forward.

1. If day-behind Daily Book PDFs are missing, pull them first (same runner as DLY/DPT):
   `python3 scripts/fill_daily_dly_dpt.py --mode daily`
2. Main table (gas vol/profit, c-store total, tax/scratch/lotto/card; restore blank formulas; blank Net Purchases → 0):
   `python3 scripts/fill_daily_excel.py`
3. Secondary tables (Receipt LOTTERY/LOTTO, Top N departments, Source dept tables):
   `python3 scripts/fill_daily_excel_secondary.py`

Rules:
- Fill **blank cells only** — never overwrite existing values.
- Blank **Net Purchases** on a day that already has sales → set **0** temporarily until the next DLY/DPT run.
- Day-behind: as of calendar day D, fill through end of D−1.
- Optional: `--through YYYY-MM-DD` / `--dry-run` on both Excel scripts.

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` and `scripts/fill_daily_excel.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- **Every day 2:00 PM**: run Daily Book, then DLY, then DPT (same day-behind through date).
- Excel at 8:00 AM may need a Daily Book pull first when the prior afternoon job was missed.
