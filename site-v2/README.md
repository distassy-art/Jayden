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

| Page | What it answers |
| --- | --- |
| **Command centre** | Where does the portfolio stand, and what needs attention today? |
| **Owners** | How is each client doing across the stores they hold? |
| **Stores** | How is every store doing, sortable by any figure, month or year-to-date? |
| **Store detail** | Full history for one store: profit trend, buying against selling, departments, recent days. |
| **Trends** | Every measure that moves profit, one chart each, against the same months last year. |
| **Profit / Fuel / Purchases / Departments / Rankings** | The performance questions, each at whatever scope is active. |
| **Leaks** | Which stores buy heaviest against what they sell, and which departments are thinnest. |
| **The buy** | What can this month still spend, by department and by week — the only page about a month you can change. |
| **Daily sales** | The same figures by day, week, month or year, and how one day rolls into the year. |
| **S2K invoices** | Which invoices never reached S2K, and how much cost is unaccounted for? |
| **Vendor orders** | What was ordered, what arrived, and what is still unreconciled. |
| **Vendors** | Which suppliers the buying actually went to, with invoice counts and dates. |
| **Delivery calendar / Schedule** | When each vendor is due, and how confident we are about it. |
| **Pricing** | Which price-change sheets have been published. |
| **Billing** | What has been billed, collected, and is still outstanding. |
| **Tickets** | Manager questions and days waiting for approval. |
| **Data health** | Which stores have not closed the month, where the day gaps are, which feeds are stale. |

Everything hangs off controls that persist across pages: a **scope** (all
stores → one owner → one store), a **period** (day, week, month, year) on the
day feed, and a **timeframe** on the performance pages — year to date, any
finished year, or any single month, always against the same span a year
earlier. The old site had a separate page per grain; here the grain is a
control, so the figures cannot disagree between pages.

### One caution about "store profit"

In these books a store's profit is its sales minus what it bought in. Over a
month that is a fair figure. Over a single day it is not: a store taking a
$19,000 delivery on a Tuesday posts a $14,000 "loss" that Tuesday and earns it
back as the stock sells. The identity holds on 1,057 of 1,090 store-days.

Nothing in the console flags a single day's profit as a loss, and `check.mjs`
fails if anything starts to. Judging a first draft of the Leaks page that way
produced 276 loss-making days costing $652,000 across a portfolio that earned
$14m.

### And one about fuel revenue

`monthly.json` carries what fuel *sold for*, which the overlay does not. It
lags the other feeds: thirteen of seventeen stores through June, one store in
July, none in August.

So every figure in the Fuel page's revenue block — revenue, cost of the fuel,
the share kept, the price per gallon — is totalled over the store-months that
report revenue, with the profit and gallons taken from exactly those same
store-months, and the card says which months and how many stores it covers.
Year-on-year uses the same stores rather than whoever reported.

Both matter. Pairing a year-to-date fuel profit with a six-month revenue put
the share kept at 19% against a true 10%. Comparing thirteen stores against
sixteen put last year at $55.7m against a like-for-like $48.4m, which reversed
the direction of the change in several months. `check.mjs` recomputes all of it
from the overlay.

The **Needs attention** feed on the command centre ranks departments over
budget, weeks bought past their ceiling, missing invoices, unpaid bills, open
tickets and stores losing money inside the shop — worst first, each linking to
the page that resolves it. Budget items lead because they are the only entries
that are still preventable.

### Roles

Routes and data are both filtered by account. A store manager's console is the
same code against a one-store model, and no other store's figures reach the
markup — `check.mjs` asserts that on every page a manager can open.

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
npm run dev                      # http://localhost:8787
npm run dev -- --mount /new      # http://localhost:8787/new/
```

The dev server mirrors the worker exactly, including the read-only proxy and
the subpath mount.

## Serving it from `smartsolutionsai.us/new`

The console works at any prefix without a rebuild. It works out where it is
being served from at runtime — the worker rewrites the shell's `<base>`, and
`data.js` derives the API prefix from its own module URL — so one build runs at
both `/` and `/new/`.

Two changes in `wrangler.toml`, both commented in place:

1. `MOUNT_PATH = "/new"`
2. Uncomment the `[[routes]]` block for `smartsolutionsai.us/new*`

This adds a route to the zone. It does **not** modify, redeploy or reconfigure
`smartsolutions-site`; that worker keeps serving every other path on the domain
exactly as it does now, and deleting the route reverts it completely.

Requests that arrive outside the mount return 404 from this worker rather than
being answered, so it cannot shadow the live site.

## Check it

```bash
npm run dev            # in one terminal — the checks read through it
npm run check          # in another
```

Three suites run in sequence:

| Suite | What it does |
| --- | --- |
| `scripts/contrast.mjs` | Audits every design-token pairing against WCAG AA, in both themes. |
| `scripts/check.mjs` | Renders every view against live data, at every scope, plus the single-store and dead-feed paths. Catches `undefined` / `NaN` leaks, unbalanced markup, and any store appearing on a manager's page. |
| `verify-numbers.py`, `verify-buy.py` | Recompute the console's figures from the raw feeds **in Python**, independently of the JavaScript that produced them. |

The Python verifiers are the important ones. The console derives its roll-ups
in `analytics.js` and `current.js`; the verifiers do the same arithmetic from
the untouched payloads, so an error has to be made twice, in two languages, to
survive. They currently reconcile about 1,900 figures — year-to-date and
monthly series, per-owner partitioning, the day grain at four resolutions,
departments, and every line of the open month.

They also assert the shape of the comparisons, not just the totals: that a
part-month is never held against a whole one, that ratios are recomputed from
summed parts rather than averaged, that blended department targets are weighted
by sales, and that a "days" figure is a span rather than a sum.

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

Both deploy targets require an API token with **Workers Scripts: Edit** (and,
for the domain, **Workers Routes: Edit**). Either way this creates a *new*
worker and leaves `smartsolutions-site` alone.

### Beside the current site, on smartsolutionsai.us/new

```bash
cd site-v2
npm install
CLOUDFLARE_API_TOKEN=... npx wrangler deploy --env live
```

The two designs then run side by side: the existing site keeps serving the
whole domain, and only `/new` reaches this worker. Nothing about
`smartsolutions-site` is modified, redeployed or reconfigured — the change is
four added routes.

Those four are `/new` and `/new/*` on **both** `smartsolutionsai.us` and
`www.smartsolutionsai.us`. The `www` host answers on its own today rather than
redirecting to the bare domain, so covering only the bare domain would leave
`www.smartsolutionsai.us/new` a 404 for anyone who types the address the way it
appears elsewhere.

Matching a bare path plus a subtree, rather than the single pattern `/new*`, is
also deliberate: the latter would capture `/newsletter` and anything else
beginning with those three letters, quietly taking paths away from the existing
site.

Cloudflare resolves overlapping routes most-specific-first, so `/new/...`
reaches this worker while every other path continues to the worker that serves
it today.

### Proving both are up

Adding a route to a live zone is the one step here that can affect something a
customer is already using, so it is checked rather than assumed:

```bash
node scripts/verify-live.mjs          # both hostnames
```

It probes a spread of the existing site — the front page, the customer login,
owner and manager pages, the extensionless `/admin` route, a data file, a
Netlify function — then the `new`-prefixed neighbours that must *not* be
captured, then the console at `/new`.

Run it **before** deploying to record the baseline. Every old-site line should
read `ok` both times; only the `/new` lines should change from `FAIL` to `ok`.
An old-site path that changes between the two runs is exactly the regression
the script exists to catch.

To take it down again, leaving the old site serving as before:

```bash
CLOUDFLARE_API_TOKEN=... npx wrangler delete --env live
```

### On a workers.dev URL

```bash
CLOUDFLARE_API_TOKEN=... npx wrangler deploy
```

Publishes to `https://smartsolutions-admin-preview.<your-subdomain>.workers.dev`
and touches no routes on the domain at all.

### Throwaway deploy, no credentials

```bash
npx wrangler deploy --temporary
```

Publishes to a temporary Cloudflare account that expires in about an hour. The
command prints a claim URL that moves the worker into a real account and makes
it permanent. Temporary deployments also sit behind a Cloudflare bot check,
which asks visitors to tick a box on first load; claiming removes it.

Unclaimed, the whole account is reclaimed when it expires, and the hostname
stops resolving rather than returning an error — a link that worked earlier
will look to a browser like the site is down. Re-running the command brings the
console back, but on a *new* hostname, because each temporary account gets its
own random subdomain. Any link shared beforehand is dead for good.

So a temporary deploy is only worth it for a look in the next hour. For a link
that keeps working, claim it, or deploy into a real account with a token.

## Layout

```
site-v2/
  worker/index.js        Worker: static assets + read-only /api proxy
  public/
    index.html           Shell
    assets/
      app.js             Router, chrome, sign-in, command palette
      data.js            Auth and fetching
      analytics.js       Closed-month roll-ups, comparisons, attention feed
      current.js         The open month: budgets, pace, weekly ceilings
      scope.js           Scope and period, and the bar that drives them
      ui.js              Formatting, icons, SVG charts
      base.css           Design tokens and components
      site.css           The public site
      views/             One module per page
  scripts/
    dev-server.mjs       Local mirror of the worker
    check.mjs            Renders every view against live data
    contrast.mjs         WCAG audit of the design tokens
    dump-model.mjs       Closed-month figures as JSON, for the verifier
    dump-buy.mjs         Open-month figures as JSON, for the verifier
    verify-numbers.py    Recomputes the closed months from the raw feed
    verify-buy.py        Recomputes the open month from the raw feed
    build-logos.py       Rebuilds the logo assets from brand-src/
  brand-src/             Original logo artwork, unmodified
```
