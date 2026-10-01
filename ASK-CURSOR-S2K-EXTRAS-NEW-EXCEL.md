# S2K extras — Daily Excel (Paradise, La Mesa, ExtraMile)

## Problem
The standard S2K SoftSP → Daily Excel → site pipeline (`fill_daily_excel_from_softsp.py` + `sync_from_excel.py`) covered the **14 live S2K stores** but not the **extra clients**:

| ID | Name | Site | Workbook |
|----|------|------|----------|
| 42359 | Paradise | **Yes** (live) | `Paradise Daily.xlsx` |
| 42642 | La Mesa | **No** (internal only) | `La Mesa Daily.xlsx` |
| extramile | ExtraMile | **Yes** | `Extramile.xlsx` (not the `#00000` Daily template) |

Paradise was in `sync_from_excel.py` but **missing from** `fill_daily_excel_from_softsp.py`, so purchases/sales never refreshed from SoftSP like the fleet stores. La Mesa had no fill wiring. ExtraMile uses a separate month-sheet book (see `.cursor/excel-sync.md`).

Machine-readable registry: `scripts/s2k_extras_stores.json`.

## OneDrive paths (Smart Solutions tenant)
Account: `minamorcos@smartsolutionsai26.onmicrosoft.com` · library `Documents/Clients`

- Paradise: `Clients/BIG DADDY/42359 (Paradise)/Paradise Daily.xlsx`
- La Mesa: `Clients/42642 (La Mesa)/La Mesa Daily.xlsx`
- ExtraMile: `Clients/ExtraMile/Extramile.xlsx` (overwrite same item id — never `Extramile (1).xlsx`)

**Excel rules** (same as books audit): update cells in place; never upload a replacement workbook; sales fill-once; purchases from expanded DLY (`Toggle=1`); dates as Excel serials.

## Paradise (42359)
- **S2K login:** Microsoft Edge only (`/usr/bin/microsoft-edge`, UA must read as Edge). If callback 502 with no session, stop and report — do not invent the day.
- **PDF export subdirs** (under your SoftSP export root): `42359_Pa/` for Daily Book, `*dly.pdf`, `*dpt.pdf`.
- **Fill:**
```bash
python3 scripts/fill_daily_dly_dpt.py --kinds dly,dpt   # if pulling fresh DLY/DPT
python3 scripts/fill_daily_excel_from_softsp.py \
  --xlsx-dir /tmp/books_xlsx \
  --pdf-dir /tmp/s2k/exports/daily \
  --dly-dir /tmp/s2k/exports/dly_dpt \
  --days 2026-09-28 \
  --only 42359 \
  --refresh-rules
```
- **Publish** (after OneDrive upload of changed cells only):
```bash
python3 scripts/sync_from_excel.py --xlsx-dir /tmp/books_xlsx --month 2026-09 --publish
```
Or use the Jayden **site-publish** bridge for `daily_september.json` when books overlay is not available in CI.

Deduct rules snapshot: `Paradise Daily.xlsx` → `store_id` **42359** in `scripts/data/store_purchase_rules.json`.

## La Mesa (42642)
- Same SoftSP fill commands as Paradise with `--only 42642` and PDF subdir `42642_LM/`.
- **Never** add `42642` to public JSON or `sync_from_excel.py` `STORE_FILES` — the site-publish bridge blocks `42642` in data files (`SITE-PUBLISH.md`).
- Excel on OneDrive is the only deliverable.

## ExtraMile
1. Copy `Extramile.xlsx` from Hotmail OneDrive (`distassy@hotmail.com`) → Smart Solutions `Clients/ExtraMile/Extramile.xlsx` (replace, do not duplicate).
2. Publish:
```bash
python3 scripts/extract-extramile-book.py Clients/ExtraMile/Extramile.xlsx \
  | node scripts/publish-books.mjs --file /dev/stdin
```
Skip template `ExtraMile Daily.xlsx` / `ExtraMile Monthly.xlsx` while still `#00000` placeholders.

## Audit
Compare Excel vs live site through yesterday (Pacific):
```bash
# Requires local copies under /tmp/books_fill_*/out and sync_from_excel on PYTHONPATH
python3 tmp_audit_site_excel_s2k.py
```
Paradise gaps vs site are expected when Edge session is down; La Mesa is excluded from site comparison.

## Related branches (history)
Full pipeline lived on `origin/cursor/excel-after-softsp-1336`; client Excel sync notes on `origin/cursor/client-excel-sync-177b`. This ASK lands the extras wiring on Jayden `main` via `scripts/` + registry above.
