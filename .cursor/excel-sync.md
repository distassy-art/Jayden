# Client Excel → smartsolutionsai.us

Do **not** use Gmail. Source files are on **Smart Solutions OneDrive**. The live site is **https://smartsolutionsai.us** (Cloudflare Worker `smartsolutions-site`, KV `ss-books`).

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

## Publish to the live site

1. GET `https://smartsolutionsai.us/.netlify/functions/books-overlay` (current KV overlay).
2. For each Daily/Monthly `.xlsx`, POST parse:

```
POST https://smartsolutionsai.us/.netlify/functions/books-parse
{ "email": "smartsolutionsai", "role": "owner", "name": "<filename.xlsx>", "content": "<base64>" }
```

3. Collect successful `{ file, type, store, period, patch }` results.
4. POST save:

```
POST https://smartsolutionsai.us/.netlify/functions/books-save
{ "email": "smartsolutionsai", "role": "owner", "patches": [ ... ] }
```

5. GET overlay again and confirm each store’s `days` / `months` updated.
6. Spot-check https://smartsolutionsai.us/yearly.html (owner session) if a browser is available.

Skip Store Services workbooks. Merge is additive by date/month; do not wipe other stations.

## If OneDrive MCP is the wrong tenant

The Cursor OneDrive connector must be signed in as **Smart Solutions** (`MinaMorcos@smartsolutionsai26.onmicrosoft.com`), not EV Buzz (`sales@evbuzzapp.com`). The EV Buzz tenant has no SharePoint license and cannot list these files.
