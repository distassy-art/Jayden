# Dept YoY staleness — command-category-yoy.json

## Problem
Command Center category YoY (`/command-category-yoy.json`) scaled **last-year** pace using one **global** partial-month fraction (e.g. 28/30 from `depts.json` `as_of`). Stores whose **department books lag** (Arco HB, Garden Grove, San Diego, Paradise) looked like **40–50% sales declines** vs LY even when MTD was fine.

## Fix (generator)
Script: `scripts/build_command_category_yoy.py`

1. **Per-store `deptDataThrough`** (ISO date): last posted dept day for that store.
   - Prefer last day in `daily_september.json` for that store when the books month matches `depts.as_of`.
   - Else `depts.as_of`.
2. **LY YTD pace** for each category: `(y2025 annual ÷ 12) × months_elapsed_store`, where  
   `months_elapsed_store = (calendar_month − 1) + (day / days_in_month)` from **`deptDataThrough`**, not global `as_of`.
3. **TY latest month & YTD**: scale the current month’s dept bucket by the same store day fraction when adjusting from `y2026.sales` totals.
4. **`salesLyMonthPace` / `purchLyMonthPace`**: full calendar-month LY pace (`y2025 ÷ 12`) — unchanged (MTD flags compare to full LY month).
5. **Paradise #42359**: use `months_sales` / `months_purch` for `2026-09` when present (do not zero September because `period_2026` still says Jan–Aug).
6. **Koval #42279**: when `y2025.sales` is null, leave LY fields null and set store `lyBaselineMissing: true` (no fake YoY).
7. Optional enrich pass: `scripts/enrich_command_category_yoy.py` (margin + purch budget fields).

## Publish
- Output (identical bytes):  
  `site-publish/public/command-category-yoy.json`  
  `site-publish/public/data/command-category-yoy.json`  
  `site-publish/api/cf-dist/data/command-category-yoy.json`
- Bridge allows `public/command-category-yoy.json`.

## UI
Each store object includes **`deptDataThrough`**. Badge stale when `deptDataThrough < asOf` (global dept file date). Command Center should show that badge on store tabs / category YoY header.

## Regenerate
```bash
python3 scripts/build_command_category_yoy.py \
  --depts site-publish/public/data/depts.json \
  --daily site-publish/public/data/daily_september.json \
  --out site-publish/public/command-category-yoy.json
cp site-publish/public/command-category-yoy.json site-publish/public/data/command-category-yoy.json
cp site-publish/public/command-category-yoy.json site-publish/api/cf-dist/data/command-category-yoy.json
python3 scripts/enrich_command_category_yoy.py --live site-publish/public/command-category-yoy.json \
  --dept-budgets site-publish/public/data/dept-purchase-budgets.json \
  --vendor-mix site-publish/public/data/vendor-mix.json \
  --out site-publish/public/command-category-yoy.json
# re-copy to data/ + api/ after enrich
```
