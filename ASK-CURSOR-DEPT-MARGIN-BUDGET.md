# Department margin + purchase budget fields (`command-category-yoy.json`)

Command Center reads **`command-category-yoy.json`** (also under `/data/`). Each object in `stores[].categories[]` must include these **three** fields so the dept margin / budget UI can render without client-side inference.

## Required fields (every category row)

| Field | Type | Meaning |
|-------|------|---------|
| `acceptableMargin` | number or `null` | Target **gross margin fraction** for the department (e.g. `0.30` = 30% for Beer). **`null` for pass-through** categories (lottery, taxes, deposits, card activations, etc.) and for rows with no defined target. |
| `purchBudgetMtd` | number or `null` | **Dollar purchase budget** for this department for the **latest books month** (`latestBooksMonth` / `salesLatestMonth` / `purchLatestMonth` window). Same rules as Command Center “Purch budget”: Mina/S2K **set** dept budget when present; else **share of store month purchase budget** by latest-month sales mix; else **60% of latest-month category sales** (`purchase_ratio` from `dept-purchase-budgets.json` meta). **`null` for pass-through** departments. |
| `purchActualMtd` | number or `null` | **Actual purchases MTD** for the latest books month. Same value as `purchLatestMonth` (alias for the UI). |

Existing fields (`salesLatestMonth`, `purchLatestMonth`, `purchaseBudget`, flags, etc.) stay as-is unless regenerated upstream; `purchaseBudget` may mirror `purchBudgetMtd` when the feed had no set budget.

## `acceptableMargin` source

Use the **Acceptable Margin** table from manager daily books (`mgr-dash.js` / Daily Excel), keyed by normalized department name:

- Beer `0.30`, Cigarettes packs `0.12`, Other tobacco `0.25`, Liquor/Wine `0.30`, Energy `0.45`, Packaged/Cold dispensed beverages `0.45`, Snacks `0.45`, Candy `0.50`, Hot dispensed `0.40`, AMPM hot foodservice `0.60`, Car wash `0.45`, etc.
- **Pass-through** (`pass_through: true` in `dept-purchase-budgets.json` for that store/dept): **`null`**, even if a generic lottery/scratch target exists in the table.
- Name normalization: uppercase, `&` → `AND`, collapse punctuation to spaces (same as `commandNormDeptName` in `app.html`).

## `purchBudgetMtd` source

Per store, per category (non pass-through):

1. If `dept-purchase-budgets.json` has `purchase_budget` > 0 for that dept → use it (**set budget**).
2. Else if `vendor-mix.json` / `budget-targets.json` has `month_purchase_budget` for the store and latest-month category sales > 0 →  
   `storeMonthBudget × (category salesLatestMonth / sum of salesLatestMonth for non-pass-through categories)`.
3. Else if `salesLatestMonth` > 0 → `salesLatestMonth × purchase_ratio` (default **0.60**).
4. Else → `null`.

Pass-through categories: **`null`**.

## Publish

- Enrich the live JSON, then publish via Jayden **`site-publish/`** (both twins):
  - `site-publish/public/data/command-category-yoy.json`
  - `site-publish/api/cf-dist/data/command-category-yoy.json`
  - `site-publish/public/command-category-yoy.json` (root copy the shell fetches first)
- Do not invent sales or purchases; only derive budget/margin **targets** from the rules above and existing feeds.

## Regenerate

```bash
python3 scripts/enrich_command_category_yoy.py \
  --live /tmp/command-category-yoy.json \
  --dept-budgets /tmp/dept-purchase-budgets.json \
  --vendor-mix /tmp/vendor-mix.json \
  --out site-publish/public/data/command-category-yoy.json
cp site-publish/public/data/command-category-yoy.json site-publish/api/cf-dist/data/
cp site-publish/public/data/command-category-yoy.json site-publish/public/command-category-yoy.json
```
