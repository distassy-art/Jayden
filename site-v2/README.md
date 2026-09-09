# Smart Solutions AI — Admin console (preview)

A redesigned, admin-first console for the data behind
[smartsolutionsai.us](https://smartsolutionsai.us), built to run on its own URL
**alongside** the existing site.

## The live site is never touched

This is a separate application. It reads production data and writes nothing:

- It is a **new Cloudflare Worker** (`smartsolutions-admin-preview`). The worker
  serving `smartsolutionsai.us` (`smartsolutions-site`) is not modified, not
  redeployed, and not reconfigured.
- Every request to production goes through the worker's `/api/*` proxy, which
  **only issues GET** and only against an explicit allowlist of read endpoints.
  Any other method returns `405 read_only` before it leaves the preview.
- No upstream cookies are forwarded or stored.

Deleting the preview worker leaves nothing behind.

## Sign in

The same usernames and passwords as the live site. Credentials are checked
against the same sources (`/data/owners.json`, `/data/logins.json` and the
`login-hashes` overlay) using the same SHA-256 scheme, so nothing new needs to
be issued or maintained.

## What it does

Built around what an administrator needs first:

| Page | What it answers |
| --- | --- |
| **Command centre** | Where does the portfolio stand this month, and what needs attention today? |
| **Stores** | How is every store doing, sortable by any figure, month or year-to-date? |
| **Store detail** | Full history for one store: profit trend, buying against selling, departments, recent days. |
| **S2K invoices** | Which invoices never reached S2K, and how much cost is unaccounted for? |
| **Vendor orders** | What did the assistant order, what actually arrived, and what is still unreconciled? |
| **Pricing** | Which price-change sheets have been published. |
| **Billing** | What has been billed, collected, and is still outstanding. |
| **Tickets** | Manager questions and days waiting for approval. |
| **Data health** | Which stores have not closed the month, where the day gaps are, which feeds are stale. |

The **Needs attention** feed on the command centre is the core of the redesign:
it ranks missing invoices, unpaid bills, open tickets, unclosed months and
stores losing money inside the store, worst first, each linking straight to the
page that resolves it.

## Design

- The existing logo is kept. The source artwork ships as ~500 KB opaque PNGs, so
  `scripts/build-logos.py` unmixes the baked-in background into real
  transparency and rebuilds them at web sizes — 525 KB down to about 7 KB each.
- Light and dark themes, following the system setting until it is overridden.
- Fully responsive, keyboard navigable, and printable.
- `⌘K` / `Ctrl+K` jumps to any page or store.

## Stability

Deliberate choices, since the current site is fragile in these exact places:

- **No CDN dependencies.** Charts are hand-rolled SVG rather than Chart.js from
  jsDelivr, so an unreachable CDN cannot blank a page.
- **One data load, shared by every view.** The books payload is fetched once and
  cached, instead of being refetched by each page.
- **Feeds fail independently.** A dead billing endpoint shows a notice on the
  billing card; every other number on the page stays correct.
- **No build step.** Plain ES modules — nothing to compile, nothing to go stale.

## Run it locally

```bash
cd site-v2
npm run dev            # http://localhost:8787
```

The dev server mirrors the worker exactly, including the read-only proxy.

## Check it

```bash
npm run check          # renders every view against live data and asserts the output
```

This exercises all views, every store's detail page, and the degraded-feed
paths, checking for `undefined` / `NaN` leaks and unbalanced markup.

## Access gate

`workers.dev` URLs are reachable by anyone who has them, and these pages show
real client financials, so the worker holds visitors at a passphrase before
anything else loads.

Only the SHA-256 of the phrase is stored, in `PREVIEW_ACCESS_SHA256` in
`wrangler.toml`. To change it:

```bash
node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "your new phrase"
```

Put the result in `wrangler.toml` and redeploy. Remove the variable to drop the
gate — appropriate only if the worker already sits behind Cloudflare Access.

## Deploy

### Into your own Cloudflare account

Requires an API token with **Workers Scripts: Edit**. This creates a *new*
worker and leaves `smartsolutions-site` alone.

```bash
cd site-v2
npm install
CLOUDFLARE_API_TOKEN=... npx wrangler deploy
```

Publishes to `https://smartsolutions-admin-preview.<your-subdomain>.workers.dev`.

To remove it:

```bash
CLOUDFLARE_API_TOKEN=... npx wrangler delete smartsolutions-admin-preview
```

### Throwaway deploy, no credentials

```bash
npx wrangler deploy --temporary
```

Publishes to a temporary Cloudflare account that expires in about an hour. The
command prints a claim URL that moves the worker into a real account and makes
it permanent. Temporary deployments also sit behind a Cloudflare bot check,
which asks visitors to tick a box on first load; claiming removes it.

## Layout

```
site-v2/
  worker/index.js        Worker: static assets + read-only /api proxy
  public/
    index.html           Shell
    assets/
      app.js             Router, chrome, sign-in, command palette
      data.js            Auth and fetching
      analytics.js       Roll-ups, comparisons, attention feed, data health
      ui.js              Formatting, icons, SVG charts
      base.css           Design tokens and components
      views/             One module per page
  scripts/
    dev-server.mjs       Local mirror of the worker
    check.mjs            Renders every view against live data
    build-logos.py       Rebuilds the logo assets from brand-src/
  brand-src/             Original logo artwork, unmodified
```
