# S2K SoftSP reports — game plan

**Goal:** Know which of SoftSP’s ~262 reports we actually pull, why, and in what order — so Excel stays SoT for the site and we don’t invent numbers.

**Login:** SoftSP `store.s2kprime.com` (gmail / hotmail / Placentia groups — see `fill_daily_dly_dpt.py`).

**SoT chain:** SoftSP PDFs → fill Daily Excel → `sync_from_excel.py` → Cloudflare books overlay → website MTD.

Related: `scripts/s2k_report_schedule.md` (timers), `scripts/fill_daily_dly_dpt.py` / `scripts/pull_s2k_reports.py` (pull CLI).

---

## How we implement (code)

| Step | Where |
|------|-------|
| SoftSP login + PDF pull | `scripts/fill_daily_dly_dpt.py` → class `S2K` (`store.s2kprime.com/report?rpt=…`) |
| Report registry (kind → rpt / dates / folder) | `REPORTS` dict in same file |
| OneDrive upload / recycle | class `SharePoint` (FedAuth cookies `/tmp/od_cookies.json`) |
| CLI | `python3 scripts/pull_s2k_reports.py --show\|--list\|--kinds …\|--phase N` |
| Excel fill (Phase 0 only) | separate agent jobs reading Daily / DLY PDFs into `* Daily.xlsx` |
| Website | `sync_from_excel.py` → Cloudflare books overlay (Excel SoT) |

**Show destinations (no pull):**

```bash
python3 scripts/pull_s2k_reports.py --show --phase 0
python3 scripts/pull_s2k_reports.py --show --kinds bos,recon --only 42352
python3 scripts/pull_s2k_reports.py --list
```

**Pull for real:**

```bash
python3 scripts/pull_s2k_reports.py --mode daily          # Phase 0 daily
python3 scripts/pull_s2k_reports.py --kinds dly,dpt       # Phase 0 DLY+DPT
python3 scripts/pull_s2k_reports.py --phase 1 --only 42352  # validate pack, Arco Db
```

---

## Phase 0 — Always on (already automated)

These three feed Excel and the weekly books sync. Do not skip.

| # | SoftSP report | `rpt=` id | Why we need it | Cadence | Output |
|---|---------------|-----------|----------------|---------|--------|
| 1 | **Daily Book Summary** | `DailyTotal+Summary` (+ `ShowCost=1`) | Day-behind sales, gas vol/profit, c-store total, tax/lottery pieces that become Excel **C-Store Sales** and related daily cells. | Every day **2:00 PM PT** | Accumulate `MMDDYYYY.pdf` per store / BD PDF daily folder |
| 2 | **Non-Fuel Invoice Summary by Station/Vendor** | `None Fuel Invoice Total` (`None+Fuel+Invoice+Total`) | MTD non-fuel AP → Excel **Net Daily Purchases**. | Wed **8:00 AM**, Sun **4:00 AM** | Latest `*dly.pdf` only (delete older in month) |
| 3 | **Non-Fuel Invoices by Vendor/Dept** | `DailyAPInvoice` | Collapsed vendor/dept purchase rollup; audit Deduct + DLY; Financial Audit leave-2 Sundays. | Wed **8:00 AM**, Sun **4:00 AM** | Latest `*dpt.pdf` only (delete older in month) |

**After pulls:** Always pull **DLY + DPT** together. Then fill Daily Excel from Daily Book sales + **DLY invoices × Excel Deduct rules** → Net Daily Purchases (column F). DPT is kept for dept/vendor audit (and Financial Audit leave-2); F is always overwritten from DLY+Deduct (empty countable day → blank, never leftover formula). Then `sync_from_excel.py --publish`.

```bash
python3 scripts/pull_s2k_reports.py --kinds dly,dpt
python3 scripts/fill_daily_excel_from_softsp.py \
  --xlsx-dir /path/to/Daily.xlsx \
  --pdf-dir /path/to/daily_pdfs \
  --dly-dir /tmp/s2k/exports/dly_dpt_run \
  --days 2026-09-22,2026-09-23 \
  --out-dir /tmp/books_fill \
  --refresh-rules --purchases-all-dly-days
python3 scripts/sync_from_excel.py --xlsx-dir /tmp/books_fill --month 2026-09 --publish
# publishes books overlay AND rebuilds/deploys /data/daily_september.json (MTD through)
```

### Net Daily Purchases rule (Excel ``Deduct`` sheet)

We do **not** dump SoftSP vendor totals into Excel. Purchases come from SoftSP **DLY** (dated invoice expand) + **DPT** pulled for audit, applying each store's Deduct sheet:

| SoftSP invoice | Treatment |
|----------------|-----------|
| Vendor on Deduct col A | **Excluded** — not a purchase |
| Negative amount | **$0** — never reduces the day |
| Vendor on col B "Ignore" | **Ignored** (same as excluded) |
| Vendor on col B "Add" (Marathon / Inventory Adj, …) | **Add back** positive amount |
| All other positive invoices | **Include** |
| No countable invoices that day | **null** — blank Net Daily Purchases (not 0; clear any old formula) |

Canonical text (Koval Deduct): *Net Purchases = total positive invoices − positive amounts for vendors in column A. Negative invoices equal zero; column B vendors are excluded.*

```bash
python3 scripts/store_purchase_rules.py --from-excel /path/to/Daily.xlsx/folder --write
python3 scripts/store_purchase_rules.py --show --store 42352 --demo
```

Snapshot: `scripts/data/store_purchase_rules.json`. Apply via `apply_invoices()` in `fill_daily_excel_from_softsp.py` — **purchases always refresh** after every SoftSP DLY/DPT pull.

**Rule:** blank SoftSP / blank Excel day = skip sales (no invented numbers). Purchases still clear/overwrite from Deduct nets. Day-behind: as of calendar day D, Excel through D−1 when SoftSP has Station Total.

---

## Phase 1 — Validation layer (favorites + quick checks)

Use when Daily Book / Excel look wrong, SoftSP NonFuel was edited, or margin swings.

| SoftSP report | `rpt=` id | Why | When |
|---------------|-----------|-----|------|
| **Daily BOS Sales and Receipts** | `DailyBosSales` | Already favorited. POS/BOS sales+receipts vs Daily Book sales. | Any day Excel ≠ SoftSP feel |
| **Daily Report** | `DailyReconciliation` | Already favorited. Cash/shift recon day view. | Cash O/S or shift disputes |
| **Daily Report-Fuel** | `DailyTotal+Summary-Fuel` | Fuel-only companion to Daily Book. | Fuel gallons/profit mismatch |
| **Daily Sales Summary By Department** | `Daily+Sales+Summary+By+Department` | Dept sales for Top10 / dept Excel tables. | Filling or auditing dept rows |
| **Non-Fuel Invoice Full Detail** | `NonFuelInvoiceFull` | Line-level invoices when SoftSP NonFuel ADD/EDIT / scan match needs proof. | Arco Db (and peers) NonFuel billing sessions |

---

## Phase 2 — Fuel ops (separate from non-fuel DLY)

Non-fuel DLY does **not** cover gas BOLs. Pull these when fuel Excel columns or tank O/S matter.

| SoftSP report | `rpt=` id | Why | When |
|---------------|-----------|-----|------|
| **Fuel Sales by Grade (w/ Profit/Margin)** | `Fuel+Sales+By+Grade` | Grade-level gallons, $ and margin for fuel KPIs. | Weekly fuel review / site fuel cards |
| **Fuel Purchase Invoices** | `FuelRecDetail` | Fuel vendor invoices / deliveries. | Fuel purch audit (not NonFuel SoftSP) |
| **Fuel Inventory Daily** | `Monthly+Fuel+Inventory+Detail` | Tank book vs stick / O/S. | Inventory Sundays or large O/S |
| **Fuel Profit Analysis** | `Fuel+Profit+Analysis+Report` | Station fuel P&L snap. | Month-end or owner ask |

---

## Phase 3 — Owner / month-end pack

| SoftSP report | `rpt=` id | Why | When |
|---------------|-----------|-----|------|
| **Key Performance Indicator** | `KeyPerformIndicator` | Compact station KPI pack. | Month-end / owner brief |
| **Station Period Summary** | `Station+Period+Summary+Report` | Period rollup vs Excel MTD. | Month close |
| **Sales Tax Summary** | `Sales+Tax+Summary+Report` | Tax filings / audit. | Month-end tax |
| **Tax Report on C-Store Sales** | `CStore+Sales+(Tax)` | C-store tax cross-check. | Tax variance |
| **AP Aging** | `apaging` | Vendor payables aging. | Pay-run / month-end |
| **Vendor Account Status** | `vendoraccountstatus` | Vendor balance status. | Vendor disputes |

---

## Phase 4 — Merch / SKU (optional, on demand)

Only when Mina asks for merch deep-dives — not part of daily Excel→site.

- **SKU Sales Detail By Station/Department** (`SKU+Detail`)
- **SKU Sales Margin by Department** (`Department+Margin+Report`)
- **Best Selling SKU by Station** (`Top+SKU+Detail+By+Station`)
- **Purchase Vs Sales** (`Purchase+Vs+Sales+Report`)
- **Bought But Never Sold** / **Slow Movement SKU** — shrink & ordering

---

## Explicitly out of scope (for now)

| Category | Why skip |
|----------|----------|
| **BP Report** group duplicates | Same data as core reports; BP-branded labels only |
| **Wholesale / BOL / Jobber** (group 9) | Only if we run wholesale fuel hauling ops |
| **Site Inspection** | Not financial Excel inputs |
| Deep **SKU price list / pack size** tooling | Pricebook project, not Daily Excel |
| Most **EFT credit-batch** detail | Unless card settlement disputes |

---

## Weekly operating rhythm

```
Sun 04:00  DLY + DPT pull → OD
Sun        Financial Audit leave-2 (when scheduled) using DPT/Excel
Mon/Wed/Fri/Sun  Fill Daily Excel (sales + DLY×Deduct purch always) → OD → publish
Wed 08:00  DLY + DPT pull → OD
Daily 14:00  Daily Book Summary → OD (accumulate)
Wed/Sun 10:00  Excel → site books sync (--min-month current)
As needed  Phase 1–3 reports for variances / fuel / month-end
```

---

## Decision rule (what to pull)

1. **Need website MTD / Excel daily rows?** → Phase 0 only.  
2. **Sales or purch look wrong?** → Phase 1 (BOS + Daily Report + Full Detail).  
3. **Fuel gallons / tank / fuel $?** → Phase 2 (not DLY).  
4. **Owner / tax / AP question?** → Phase 3.  
5. **SKU / merch?** → Phase 4 on request only.

---

## SoftSP favorites (account)

Pinned today: `DailyReconciliation`, `DailyBosSales`, `DailyTotal+Summary` — aligns with Phase 0 #1 + Phase 1.

---

## Catalog note

Full SoftSP catalog (~262 reports, 17 groups) was extracted from SoftSP `reportList` (2026-09-24). This game plan is the **subset we commit to using**, not the full menu.
