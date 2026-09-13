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

Daily 10am numbers will come from an **S2K login / report URL** (chosen). Report URL, login, whether HB and DB are two reports or one switch, and timezone are still waiting on Mina. Do not invent credentials. Do not scrape. The 17-slot day editor stays as the manual path. File import stays as a fallback.

When login arrives, store it only as Cloudflare Worker secrets (`npx wrangler secret put …` on `farsai-calendar`). Never commit secrets or `.dev.vars`.

Upload Excel, CSV, or HTML if you have a Daily export. Sample files:

- `public/sample-hb.csv`
- `public/sample-db.html`

Empty databases seed realistic HB and DB days for August 1–September 13, 2026.
