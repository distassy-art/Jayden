# S2K report pull schedule

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total (**View Type Expand** / `Toggle=1`) + DailyAPInvoice (**Group By Department** / `GroupBy=1`). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **Daily Excel update** | Fill missing days in each client `* Daily.xlsx` from Daily Book Summary PDFs via `scripts/update_daily_excels.py` (gas vol/profit, c-store total, tax/scratch/lotto/card). Leave Net Purchases alone. | Mon / Wed / Fri / Sun **8:00 AM** | `0 15 * * 1,3,5,0` |
| **Financial Audit fill** | Fill all client `* Financial Audit.xlsx` S2K columns from Daily Book Summary PDFs via `scripts/fill_financial_audit_from_s2k.py --all --upload`. Always leave 2 days behind. Wired into the **Sun** run of the Daily Excel timer (same cron; after Daily.xlsx). | **Sun ~8:00 AM** (with Daily Excel) | `0 15 * * 1,3,5,0` (Sun only for Financial) |

## Audit workbooks (vendor vs financial)

Each client with an Audit file now has **two** workbooks (combined `* Audit.xlsx` kept as archive):

| File | Contents |
|------|----------|
| `* Vendor Audit.xlsx` | Scanned invoices + Active S2K + Electronic/Excluded S2K |
| `* Financial Audit.xlsx` | Cashier safe-drop + Cash over/short + EOM safe-drop |

Invoice OCR append (`scripts/run_invoice_copilot_audit.py`) writes to **Vendor Audit** first.  
Split/re-split: `python3 scripts/split_audit_workbook.py --all-clients`

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/`
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt}/YYYY-MM Month/`

## Overlap notes

- **Wednesday 8:00 AM**: DLY/DPT and Daily Excel both run — run DLY/DPT first, then Excel.
- **Sunday**: DLY/DPT at 4:00 AM; Excel at 8:00 AM, then Financial Audit fill (same timer).
- Day-behind rule: as of calendar day D, pull through end of D−1.
- Financial Audit leave-2-days rule: as of calendar day D, fill through end of D−2.

## Financial Audit S2K fill (weekly)

Script: `scripts/fill_financial_audit_from_s2k.py`  
Schedule: **every Sunday** with Daily Excel (~8:00 AM America/Los_Angeles; timer `s2k-daily-excel-mwfs-8am-pt`). Agent cap is 5 timers, so Financial Audit is folded into that Sunday run rather than a separate 9:00 AM timer.

Pulls Daily Book Summary PDFs and writes S2K cashier columns for **all** Financial Audit clients:

| PDF Receipts | Financial Audit column |
|---|---|
| SAFEDROP | S2K Safe Drop |
| CREDIT+DEBIT+EBT+MOBILE+PREPAID GIFT − FEE | S2K Daily Receipt (Credit Debit) |
| abs(FEE) | EFT Fee Amount |
| CASH OVER/SHORT | Over / Short |

**Cutoff (standing rule):** always leave 2 days behind for the next round.
Fill all available days through America/Los_Angeles **today − 2**; do not fill
today or yesterday (e.g. Sep 13 run → through Sep 11). Override only for
backfills with `--through YYYY-MM-DD`.

Bank Safe Drop / Bank Credit+Debit+EBT stay blank for manual bank entry.

Weekly command:

```bash
# current calendar month in PT; leave 2 days behind; upload to OneDrive
python3 scripts/fill_financial_audit_from_s2k.py \
  --all --year YYYY --month M --upload
```

Single-store example (Placentia):

```bash
python3 scripts/fill_financial_audit_from_s2k.py \
  --station 42004 --year 2026 --month 9 --upload
```

## Overlap notes (Financial Audit)

- **Sunday ~8:00 AM**: after Daily Excel in the same timer wake; DLY/DPT already ran at 4:00 AM.
- Skips stores with no Daily Summary PDFs (currently Paradise, ExtraMile).
