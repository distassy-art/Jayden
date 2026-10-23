# Publishing to smartsolutionsai.us from Jayden

You can't push to `distassy-art/ss-unified-proto` from here, and you don't need to. A bridge
workflow (`.github/workflows/publish-to-site.yml`) does the publish for you.

1. **Put the file under `site-publish/` at the same path it has in ss-unified-proto.**
   `api/cf-dist/data/daily_september.json` goes to `site-publish/api/cf-dist/data/daily_september.json`.
   `public/inventory/42282/2026-09-28/count.pdf` goes to `site-publish/public/inventory/42282/2026-09-28/count.pdf`.
2. **Commit and push** (any branch). The bridge copies only the files your push changed, runs
   ss-unified-proto's checks (`node scripts/check-app-data.mjs pre` + tests), then pushes one commit to
   its `main` (`bridge: <your sha> <your message>`). ss-unified-proto's own GitHub Actions deploy it.
   Check the **publish-to-site** run under this repo's Actions tab. Green means it's live. Red means
   nothing was published, and the log says why.
   If your branch was created before the bridge existed, run `git merge origin/main` first. A push
   only starts the workflow if your branch has `.github/workflows/publish-to-site.yml`.
3. **Allowed destinations:** `public/data/**`, `api/cf-dist/data/**`, `public/inventory/**`,
   `public/reports/**`, `public/order-comparisons/**`, `public/orders.json`, `public/billing-live.json`.
   Data file types only: json pdf txt csv xlsx xls png jpg jpeg webp. Everything else is refused,
   including `.github/`, `api/src/`, `/new`, `/new1`, `app.html` / `_locked-shell`, and worker, wrangler,
   package, and manifest files. The bridge regenerates `api/MANIFEST.sha256` itself.

Rules:
- **Never touch Cloudflare.** No wrangler, no `npm run deploy*`, no `safe-deploy-*.sh`, no dashboard or API.
- **Follow `docs/INVENTORY-PUBLISH.md`** in ss-unified-proto for inventory (folder layout + one
  `public/inventory/index.json` entry) and the same conventions for every other data file.
- **Never invent numbers.** Every value has to come from S2K, the books, or a real file. If you don't
  have it, leave it out and say so.
- **Start from the live file.** You can't read ss-unified-proto, so fetch the current copy from
  `https://smartsolutionsai.us/data/<file>` (or `/inventory/index.json` and similar), change only what
  you mean to, and put the result under `site-publish/`. For `daily_*.json` the bridge only **adds**
  days. If any day already on main differs in your copy, the whole publish is refused. Publish both
  `public/data/daily_<month>.json` and `api/cf-dist/data/daily_<month>.json` with the same bytes.
- **No purchases for a day = purch 0 (never null).** `store_profit` follows that store's Excel month margin. Where Excel's month profit is sales minus purchases, `store_profit = sales - purch` (a blank purchase counts as zero). Where Excel leaves that day's store profit blank and the month margin sums the daily profit column, leave `store_profit` null. Charleston is that case: September 20's purchase cell is empty, so its profit stays blank.
- Billing: `public/billing-live.json` and `public/data/billing.json` must be the same bytes, and
  incomeTotal never drops. La Mesa 42642 is never published. Never force-push.
- Deleting a file under `site-publish/` deletes it on the site. Deleting a data JSON file is refused.
