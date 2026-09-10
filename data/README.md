# September 2026 daily data — staged, NOT deployed

These two files are the patched September data for the manager Daily tab. They
are **staged artifacts only**. Nothing in this repo ships them, and they are not
live. See "Why this is not deployed" below.

- `daily_september.json` — live copy as of 2026-09-10 17:18 UTC, with the
  null-purchase cells filled in.
- `manager.json` — live copy with every station's `mtd` recomputed from the
  September days in `daily_september.json`.

## What changed

Seventeen cells across five stations, on incomplete last days:

| Station | Dates | Change |
| --- | --- | --- |
| 42048 San Diego | 09-05 … 09-08 | `purch` null → 0 (other fields untouched) |
| 42281 Charleston | 09-08 | `purch` 0, `store_profit` 2341.83, `margin` 1.0, `total_profit` 3745.52 |
| 42282 Oakey Las Vegas Blvd | 09-08 | `purch` 0, `store_profit` 923.14, `margin` 1.0, `total_profit` 1562.29 |
| 42439 Lamb | 09-08 | `purch` null → 0 (other fields untouched) |
| 42642 La Mesa | 09-08 | `purch` 0, `store_profit` 4335.81, `margin` 1.0, `total_profit` 6145.64 |

`through` and `as_of` stay at `2026-09-08`, the last real operating day. No
September 9+ rows were added — the Excel books are blank there.

`mtd` was recomputed for the 15 stations that have September days. Paradise
(42359) and ExtraMile carry no September daily rows and their MTD comes from
another feed, so they were left untouched rather than zeroed.

## Why this is not deployed

`https://smartsolutionsai.us/data/daily_september.json` is a **static asset of
the `smartsolutions-site` Worker**, whose source is not in this repository — not
on any branch here, and not in any other repo under the `distassy-art` org. This
repo only builds `smartsolutions-admin`, the `/new` console, which reads
`/data/daily_september.json` from production rather than shipping it.

Redeploying `smartsolutions-site` from this VM is not possible safely: the API
token cannot download the Worker script, and Cloudflare exposes no way to
enumerate a deployed Worker's asset manifest. A deploy with a partial asset set
deletes every file not in it, which would take the live site down.

Apply these files from the box that holds the `smartsolutions-site` checkout.

## Important: this patch alone will not fix the Daily tab

The reported symptom — Daily tab blank for all clients — is **not** caused by
these nulls. `mgr-dash.js` builds its day rows as:

```js
allDays(id) = mergeDays(staticDays(id), overlayStation(id).days)
```

and `mergeDays` resolves collisions with `Object.assign(by[date], d)`, which
copies `null` values. The overlay therefore wins, nulls included. The books
overlay in KV (`SS_BOOKS/overlay`) carries September rows whose `sales`,
`store_profit`, `margin` and `total_profit` are explicitly null, so it clobbers
the good figures in this file.

Arco Db (42352) shows it plainly. Its static row is already complete:

```
09-08  sales 3980.88  purch 0  store_profit 3980.88  total_profit 6083.55
```

and what the Daily tab actually renders after the merge is:

```
09-08  sales null     purch 0  store_profit null     total_profit null
```

Simulating the merge against the live overlay, 55 of 120 September station-days
lose their C-store figures. Six stations — Arco Placentia, Westminster, Arco HB,
Arco Db, La Mesa and Tustin — go blank for the whole month; seven more go blank
on 09-08.

Fixing it needs one of:

1. clearing the null September fields out of the `SS_BOOKS/overlay` KV value, or
2. changing `mergeDays` to skip null-valued fields when merging the overlay.

Option 2 is the durable fix, but the overlay feeds every books page, so option 1
should be checked against those before being applied.
