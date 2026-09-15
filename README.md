# Farsai calendar

The month grid fills the page. Each day square shows **filled majors** (Gas Inv, Safe drop, Gallons, C-store, Tax1+4, Payouts, O/S, Credit). Empty stays blank, not 0. Click a day to **view** all 17 named fields plus **month totals** at the bottom. Month-end lists **per-category totals + trend** — not one mixed Total. Values live on the Worker (D1). Fields 18 and 19 were cancelled.

## Open it

- Farsai: the deployed Worker URL (default view)
- Owner: same URL with `?owner=1`

Farsai’s HB / DB switch is on the calendar. Owner has a separate switch that does not change Farsai’s saved station.

## Local

```bash
npm install
npx wrangler d1 migrations apply farsai-calendar --local
npm test
npm run dev
```

## Data

Daily 10am numbers come from **S2K Prime** (one shared login for Arco DB and Arco HB). Confirm **DB first**, then HB. Username/password are Cloudflare Worker secrets only — never git. Do not invent S2K field mappings. Do not guess the major-cell list.

Empty databases seed realistic HB and DB days for August 1–September 13, 2026.
