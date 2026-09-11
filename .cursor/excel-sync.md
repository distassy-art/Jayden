# Client Excel → smartsolutionsai.us

**Always stay on Smart Solutions.** Use EV Buzz only if the user explicitly says to.

- OneDrive: `minamorcos@smartsolutionsai26.onmicrosoft.com` (`Documents/Clients`)
- Live site: **https://smartsolutionsai.us** (Cloudflare Worker `smartsolutions-site`, KV `ss-books`)
- EV Buzz / `sales@evbuzzapp.com` / charging stations: off-limits unless the user says to go there.

## Schedule

Wednesday and Sunday at **10:00 AM Pacific**.

## OneDrive

Account: `MinaMorcos@smartsolutionsai26.onmicrosoft.com`  
Library: `Documents/Clients`  
(`https://smartsolutionsai26-my.sharepoint.com/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents/Clients`)

Skip `Client Scans` (invoice images). Read **Daily** and **Monthly** `.xlsx` workbooks for every store.

Known station IDs:

| ID | Name |
| --- | --- |
| 42004 | Arco Placentia |
| 42021 | Westminster |
| 42048 | San Diego |
| 42073 | Laguna |
| 42098 | Brookhurst 75 |
| 42179 | Arco HB |
| 42246 | Arco GG |
| 42279 | Koval |
| 42280 | Spring Mtn |
| 42281 | Charleston |
| 42282 | Oakey Las Vegas Blvd |
| 42352 | Arco Db |
| 42359 | Paradise |
| 42399 | Garden Grove |
| 42438 | Vista |
| 42439 | Lamb |
| 42642 | La Mesa |
| 42674 | Tustin |
| extramile | ExtraMile |

## Publish to the live site

`/new` reads the **same** live books overlay as `/` (`/new/api/books-overlay` → same KV). One successful publish updates both. `/new` is read-only for writes.

**Write path:** `POST /.netlify/functions/books` with `{ email, role, stations }`.  
Do **not** rely on `books-save` + `patches` — that only bumps `updated_at` and does not merge days.

1. GET `https://smartsolutionsai.us/.netlify/functions/books-overlay` (current KV overlay).
2. Build station day rows (from `books-parse`, or `extract-daily-month-sheets.py` when `DATE()` cells have empty caches).
3. Publish:

```
POST https://smartsolutionsai.us/.netlify/functions/books
{
  "email": "smartsolutionsai",
  "role": "owner",
  "stations": [
    {
      "file": "Arco HB Daily.xlsx",
      "kind": "daily",
      "id": "42179",
      "name": "Arco HB",
      "period": "2026-09",
      "days": [ { "date": "2026-09-09", "gas_vol": …, "gas_profit": …, "purch": 0 } ],
      "months": {},
      "kpis": {}
    }
  ]
}
```

Or pipe patches/stations through:

```
node scripts/publish-books.mjs --file stations.json
```

(`publish-books.mjs` accepts `stations[]` or legacy `patches[]` and always posts to `books`.)

4. GET overlay again (and `/new/api/books-overlay`) and confirm each store’s `days` through the target date.
5. Spot-check https://smartsolutionsai.us/yearly.html and https://smartsolutionsai.us/new/ (owner session) if a browser is available.

Skip Store Services workbooks. Merge is additive by date/month; do not wipe other stations.

If `books-parse` returns empty `months` for a Monthly Summary that still has a **Fuel Summary** sheet with Excel serial dates (Westminster 42021, San Diego 42048), extract and save with:

```
python3 scripts/extract-fuel-summary-months.py <file.xlsx> <storeId> <storeName> | node scripts/publish-books.mjs --file /dev/stdin
```

If `books-parse` reports `thru` in the current month but `patch.daily` still ends on the previous month, the date cells are `DATE()` formulas with empty cached values (common on September+ sheets). Extract those days and **overwrite the same dates** in `patch.daily` (do not skip dates that already have sales-only rows):

```
python3 scripts/extract-daily-month-sheets.py <Daily.xlsx> --min-month 2026-09
```

San Diego Daily values live on `* Calculations` sheets. Brookhurst Daily values live on `* Source` sheets. The extractor reads both. Skip empty placeholder months (Paradise September was still all zeros).

## Fuel revenue (`gas_sales`)

Fuel revenue is the **Fuel Sales ($)** column of the Monthly Summary fuel sheets —
what the fuel sold for, as opposed to the gallons and the cents per gallon that
`gas_vol` / `gas_margin` / `gas_profit` carry. It reconciles to the cent with the
`FUEL Total:` **Sales Rev.** line of that month's `Monthly Reports/Sales/MMYYYY.pdf`
("Sales Report by Station"), which is the upstream source for both.

`extract-fuel-summary-months.py` finds fuel columns by header text, so it reads
both workbook layouts (the single `20xx Fuel` sheets and the two-block
`Fuel Summary` sheet) and carries `gas_sales` through.

**There is currently no way to publish fuel revenue to the live site.**

- `POST /.netlify/functions/books` merges **day rows only**; it ignores `months`
  in the payload, so `gas_sales` never reaches KV. Verified by posting a month
  carrying `gas_sales` (and `fuel_profit`) and reading back
  `GET /.netlify/functions/books`: neither field was stored.
- `/data/monthly.json` is the only feed the site reads `gas_sales` from, and it
  is a static asset in the site deploy, not writable over the API.

So fuel revenue has to be merged into `monthly.json` and deployed. Generate the
figures with:

```
python3 scripts/emit-fuel-sales-feed.py <storeId>:<file.xlsx> … > data/fuel-sales.json
```

`data/fuel-sales.json` holds every store-month with a workbook figure and flags
the ones `monthly.json` has no value for. As of 2026-09-11 that is **47
store-months, $26,315,219.62** of fuel revenue absent from the site: Westminster
and San Diego for 2026-01..08, Paradise 2026-01..07, Placentia 2026-08, Arco HB
2026-07, and 2026-07 plus 2026-08 for the other eleven fuel stores. The 264
store-months `monthly.json` does carry agree with the workbooks to the cent.

Once the write path accepts months, `backfill-fuel-sales.py` builds the publish
payload (only the months `monthly.json` lacks, each carrying its existing
overlay fields plus `gas_sales`):

```
python3 scripts/backfill-fuel-sales.py <storeId>:<file.xlsx> … > stations.json
node scripts/publish-books.mjs --file stations.json
```

### No fuel revenue in the source

- **ExtraMile** — the workbook's `GAS SALES` row is gallons, not dollars (it
  equals `gas_vol`), there is no revenue column, and ExtraMile has no
  `Monthly Reports` PDFs. All 20 of its months lack fuel revenue at source.
- **Arco HB and Paradise, 2026-08** — the workbook fuel sheets stop at 2026-07
  and neither store has an `082026.pdf` under `Monthly Reports/Sales`. Their
  August fuel revenue cannot be recovered until one of those lands.

### Publishing with `kind: "monthly"` recomputes the open month

Re-posting a station's existing day rows with `kind: "monthly"` makes the server
recompute that station's open month from those days. On Arco Db this replaced an
all-zero `2026-09` with the real September gas volume, profit and purchases. The
other stores' September months were still zeros while holding days through
2026-09-10, so the routine day publish does not refresh them.

Skip ExtraMile **Daily.xlsx** / **Monthly.xlsx** when they are still the `#00000` / Store Name templates. Skip `_Archived` (Laguna, Arco GG).

ExtraMile’s live book is the operational workbook `Extramile.xlsx` (month sheets `JULY26`, `AUG26`, …). The Worker `books-parse` path does not read that layout. Extract and save with:

```
python3 scripts/extract-extramile-book.py <Extramile.xlsx> | node scripts/publish-books.mjs --file /dev/stdin
```

The extractor drops empty placeholder days (unfilled Oct–Dec sheets) so those months are not treated as closed.

## ExtraMile copy from Hotmail OneDrive (every 3 days)

Do this **in order**. Do not update the website until ExtraMile OneDrive is replaced.

1. **Source:** `distassy@hotmail.com` personal OneDrive (`https://onedrive.live.com`). The live book is **`Extramile.xlsx`** at the Hotmail drive root (same filename every time).
2. **Replace, do not add a copy:** overwrite the existing Smart Solutions file with the same name:
   - `Documents/Clients/ExtraMile/Extramile.xlsx` (item id `01RVKKZLXN3PT7Z3V5G5EYKEYGZ2NLOYFS`)
   - also overwrite `Documents/Extramile.xlsx` if that same-name file is still at the Documents root (`01RVKKZLQPPAXVXYZTPNDIZX4UQ2RJKACQ`)
   Use OneDrive `create_or_update_file` with the existing `itemId` (or the same path). Never upload `Extramile (1).xlsx` or a dated filename.
3. **Then** publish to https://smartsolutionsai.us with `extract-extramile-book.py` → `publish-books.mjs`. Then run the rest of the client Excel sync if that is also due.

Keep the Cursor **OneDrive** connector on Smart Solutions (`minamorcos@smartsolutionsai26.onmicrosoft.com`). Do **not** switch it to Hotmail for the whole job (that drops the destination). Do **not** use Outlook if it is `sales@evbuzzapp.com` (EV Buzz). Gmail (`distassy@gmail.com`) is not the ExtraMile book source.

If Hotmail OneDrive is not signed in (Chrome at `https://onedrive.live.com` as `distassy@hotmail.com`), stop the ExtraMile copy. Do not use EV Buzz. Leave a note and continue the Smart Solutions client sync if that is also due.

## If OneDrive MCP is the wrong tenant

The Cursor OneDrive connector must be signed in as **Smart Solutions** (`minamorcos@smartsolutionsai26.onmicrosoft.com`). If it is signed into EV Buzz, stop. Do not list, search, or publish from that account.
