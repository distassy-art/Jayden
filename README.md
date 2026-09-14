# Farsai calendar

Click a day to see the **17 named S2K fields** at the bottom of the page (read-only), each with that category’s **month total** beside it. Day cells show Mina’s **8 majors** when filled. Month-end shows **totals + trend only**, not 17 line items. Values live on the Worker (D1). Fields 18 and 19 were cancelled.

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
