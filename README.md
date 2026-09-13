# Farsai calendar

Monthly Arco **HB / DB** calendar. Day numbers are stored on this Cloudflare Worker (D1), not only shown in the browser.

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

Until a live Arco pull exists, upload an Excel, CSV, or HTML Daily export. Sample files:

- `public/sample-hb.csv`
- `public/sample-db.html`

Empty databases seed realistic HB and DB days for August 1–September 13, 2026.
