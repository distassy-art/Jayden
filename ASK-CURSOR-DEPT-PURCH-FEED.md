# Department purchase feed vs store daily books (all stores)

## Problem
Command Center **category YoY / department purchase vs sales** reads `public/data/depts.json` by category. For several stores, **category purchase MTD is zero or missing** while **store-level daily books** (`daily_september.json`) show normal MTD purchases.

**Do not use category purchase totals for margin decisions when `deptPurchFeedReliable` is false** — use **`storeDailySalesMtd` / `storeDailyPurchMtd`** on the same store object in `command-category-yoy.json`.

**Live books through 2026-09-28** (09/29 daily not posted yet — see `UPDATES-2026-09-29.md`).

## Per-store status (Sep MTD through 2026-09-28, live audit)

| Store | ID | Dept category purch MTD | Daily purch MTD | Feed |
|-------|-----|-------------------------|-----------------|------|
| Arco Placentia | 42004 | ~$37k | ~$62k | partial |
| Westminster | 42021 | ~$13k | ~$26k | ok |
| San Diego | 42048 | $0 | ~$67k | **unreliable** |
| Brookhurst 75 | 42098 | $0 | ~$56k | **unreliable** |
| Arco HB | 42179 | ~$38k | ~$74k | partial |
| Koval | 42279 | ~$0 | ~$60k | **unreliable** |
| Spring Mtn | 42280 | $0 | ~$68k | **unreliable** |
| Charleston | 42281 | ~$27k | ~$54k | partial (usable dept mix) |
| Oakey | 42282 | ~$11k | ~$25k | partial (usable dept mix) |
| Arco Db | 42352 | ~$49k | ~$83k | partial |
| Paradise | 42359 | $0 | ~$76k | **unreliable** |
| Garden Grove | 42399 | $0 | ~$79k | **unreliable** |
| Vista | 42438 | ~$35k | ~$68k | partial (usable dept mix) |
| Lamb | 42439 | $0 | ~$66k | **unreliable** |
| Tustin | 42674 | ~$48k | ~$63k | partial |
| ExtraMile | extramile | — | ~$60k | excluded client |

**Unreliable (Vegas + others):** Koval, Spring Mtn, Lamb, Paradise — plus San Diego, Brookhurst, Garden Grove, ExtraMile.

**Partial but usable category purch:** Charleston, Oakey, Vista, Arco fleet, Tustin, Westminster — still prefer **daily** for **store margin** when category coverage is thin.

## JSON fields (every store in `command-category-yoy.json`)
- `storeDailyThrough`, `storeDailySalesMtd`, `storeDailyPurchMtd`, `storeDailyMarginMtd`
- `deptCategoryPurchMtd`, `deptCategorySalesMtd`, `deptPurchZeroCategories`
- `deptPurchFeedStatus`: `ok` | `partial` | `unreliable`
- `deptPurchFeedReliable`: boolean
- `marginDecisionSource`: `store_daily_books` | `store_daily_books_for_margin` | `dept_category_and_daily`
- `deptPurchFeedNote`: user-facing when not `ok`

## Regenerate
```bash
curl -sS -A curl -o site-publish/public/data/depts.json https://smartsolutionsai.us/data/depts.json
curl -sS -A curl -o site-publish/public/data/daily_september.json https://smartsolutionsai.us/data/daily_september.json
curl -sS -A curl -o site-publish/public/data/dept-purchase-budgets.json https://smartsolutionsai.us/dept-purchase-budgets.json
curl -sS -A curl -o site-publish/public/data/vendor-mix.json https://smartsolutionsai.us/data/vendor-mix.json

python3 scripts/build_command_category_yoy.py \
  --depts site-publish/public/data/depts.json \
  --daily site-publish/public/data/daily_september.json \
  --out site-publish/public/command-category-yoy.json
python3 scripts/enrich_command_category_yoy.py --live site-publish/public/command-category-yoy.json \
  --dept-budgets site-publish/public/data/dept-purchase-budgets.json \
  --vendor-mix site-publish/public/data/vendor-mix.json \
  --out site-publish/public/command-category-yoy.json
python3 scripts/overlay_command_store_daily.py \
  --yoy site-publish/public/command-category-yoy.json \
  --daily site-publish/public/data/daily_september.json \
  --out site-publish/public/command-category-yoy.json

cp site-publish/public/command-category-yoy.json site-publish/public/data/command-category-yoy.json
cp site-publish/public/command-category-yoy.json site-publish/api/cf-dist/data/command-category-yoy.json
```

## UI (Command Center)
When `deptPurchFeedReliable === false`, show **store daily MTD sales / purchase / margin** above category tables and suppress category purchase-driven margin alerts. Snippet: `scripts/patch_command_dept_purch_feed.js`.

## Root fix (later)
Backfill **depts.json** category `months_purch` / department buckets for stores where S2K dept purchase export is empty — do not invent numbers in Jayden.
