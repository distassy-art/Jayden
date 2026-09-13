# Farsai calendar

Click a day to enter the **17 S2K numbers** (Mina’s names). The day editor has those 17 fields. Month-end shows **totals + trend only**, not 17 line items. Values save on the Worker (D1). Fields 18 and 19 were cancelled.

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

Daily 10am numbers come from **S2K Prime** (one shared login for Arco DB and Arco HB). Confirm **DB first**, then HB. Username/password are Cloudflare Worker secrets only — never git. The 17-slot day editor stays. File import stays as a fallback. Do not invent S2K field mappings.

Upload Excel, CSV, or HTML if you have a Daily export. Sample files:

- `public/sample-hb.csv`
- `public/sample-db.html`

Empty databases seed realistic HB and DB days for August 1–September 13, 2026.
