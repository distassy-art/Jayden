# S2K report pull schedule

**Which reports & why:** see `scripts/s2k_reports_game_plan.md`.

All times are **America/Los_Angeles** (Pacific). Cron for cloud timers uses UTC (PDT = UTC−7, PST = UTC−8).

| Job | What | Pacific | Cron (PDT / UTC−7) |
|-----|------|---------|---------------------|
| **DLY + DPT** | None Fuel Invoice Total + DailyAPInvoice (collapsed). Upload latest MTD file; delete older `*dly*` / `*dpt*` in that month folder. | Wed **8:00 AM**, Sun **4:00 AM** | `0 15 * * 3`, `0 11 * * 0` |
| **Daily Book Summary** | `DailyTotal+Summary` with `ShowCost=1`. One PDF per business day (day-behind). Accumulate; do not delete prior days. | **Every day 2:00 PM** | `0 21 * * *` |
| **Excel → Cloudflare site** | After Daily Excel is filled (Mon / Wed / Fri / Sun) | run after Excel fill |

**CLI:** `python3 scripts/pull_s2k_reports.py --show|--list|--kinds …|--phase N`  
**Registry + puller:** `scripts/fill_daily_dly_dpt.py`  
**Game plan:** `scripts/s2k_reports_game_plan.md`

## Stores / destinations

See `scripts/fill_daily_dly_dpt.py` for S2K logins, site IDs, and OneDrive folder paths.

- Arco HB / Placentia / Db + Tustin: per-store `…/YYYY-MM Month/Daily Summary/` (Phase 0); `…/Validate|Fuel|MonthEnd|SKU/` (Phases 1–4)
- Big Daddy multi-store: `Clients/BIG DADDY/PDF/{daily,dly,dpt,validate,fuel,monthend,sku}/YYYY-MM Month/`

## Overlap notes

- **Wednesday 8:00 AM**: DLY/DPT and Daily Excel both run — run DLY/DPT first, then Excel.
- **Sunday**: DLY/DPT at 4:00 AM; Excel at 8:00 AM.
- Day-behind rule: as of calendar day D, pull through end of D−1.
