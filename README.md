# Farsai calendar

Click a day to enter the **17 S2K numbers** (Mina’s names). Month totals and trend roll those 17 up. Values save on the Worker (D1). Fields 18 and 19 were cancelled.

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

How the 17 numbers arrive at 10am is still open (Excel/HTML export, an S2K report URL Mina provides, or paste in the day editor). Do not scrape S2K. File import and the 17-slot editor both stay.

Upload Excel, CSV, or HTML if you have a Daily export. Sample files:

- `public/sample-hb.csv`
- `public/sample-db.html`

Empty databases seed realistic HB and DB days for August 1–September 13, 2026.
