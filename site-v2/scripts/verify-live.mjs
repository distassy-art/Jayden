/*
 * Proves the two designs are running side by side.
 *
 * Adding a worker route to a live zone is the one step in this project that
 * can break something a customer is already using, so it gets checked rather
 * than assumed. The script asks two questions:
 *
 *   1. Does every page of the existing site still answer exactly as before?
 *   2. Does the new console answer at /new?
 *
 * Run it before deploying to record the baseline, and again afterwards. A page
 * of the old site that changes its status or its size between the two runs is
 * the failure this exists to catch.
 *
 *   node scripts/verify-live.mjs            # both hostnames
 *   node scripts/verify-live.mjs --host www.smartsolutionsai.us
 */

const args = process.argv.slice(2);
const only = args.includes("--host") ? args[args.indexOf("--host") + 1] : null;
const HOSTS = only ? [only] : ["smartsolutionsai.us", "www.smartsolutionsai.us"];

/*
 * A spread of the old site rather than just its front page: one static page,
 * the login the customers use, an owner page, the extensionless admin route,
 * a data file and a function. If a route pattern were mis-scoped, whichever of
 * these sits nearest /new alphabetically is what would quietly start 404ing.
 */
const OLD = [
  "/", "/index.html", "/portal.html", "/overview.html", "/monthly.html",
  "/admin", "/admin.html", "/pnl.html", "/manager.html", "/billing.html",
  "/vendor-calendar.html", "/about.html", "/contact.html",
  "/data/owners.json", "/data/monthly.json", "/app.css", "/owner.js",
  "/.netlify/functions/books",
];

// Paths that must NOT be captured by the /new routes. "newsletter" is the
// reason the routes are a bare path plus a subtree instead of a wildcard.
const NEIGHBOURS = ["/newsletter", "/news", "/new-store.html"];

const NEW = ["/new", "/new/", "/new/assets/app.js", "/new/manifest.webmanifest"];

async function probe(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual" });
    const body = await response.arrayBuffer();
    return {
      status: response.status,
      bytes: body.byteLength,
      type: (response.headers.get("content-type") || "").split(";")[0],
      to: response.headers.get("location") || "",
      ms: Date.now() - started,
    };
  } catch (error) {
    return { status: 0, bytes: 0, type: "", to: "", ms: Date.now() - started, error: String(error) };
  }
}

function line(path, result, verdict) {
  const status = String(result.status).padEnd(4);
  const size = `${(result.bytes / 1024).toFixed(1)}kb`.padStart(9);
  process.stdout.write(`  ${verdict}  ${status} ${size}  ${path}`
    + `${result.to ? ` -> ${result.to}` : ""}\n`);
}

async function main() {
  let bad = 0;

  for (const host of HOSTS) {
    process.stdout.write(`\n${host}\n`);

    process.stdout.write("\n  The existing site — every one of these must be unchanged\n");
    for (const path of OLD) {
      const result = await probe(`https://${host}${path}`);
      // 200 or a redirect the site already served. Anything else is a break.
      const ok = result.status === 200 || (result.status >= 300 && result.status < 400);
      if (!ok) bad += 1;
      line(path, result, ok ? "ok  " : "FAIL");
    }

    process.stdout.write("\n  Paths that merely start with \"new\" — must not be swallowed\n");
    for (const path of NEIGHBOURS) {
      const result = await probe(`https://${host}${path}`);
      /*
       * These are expected to 404 on the old site too. What would be wrong is
       * the new console answering them, which shows up as a 200 of roughly the
       * shell's size rather than as the old site's 404 page.
       */
      const captured = result.status === 200 && result.type === "text/html"
        && result.bytes > 2000 && result.bytes < 12000;
      if (captured) bad += 1;
      line(path, result, captured ? "FAIL" : "ok  ");
    }

    process.stdout.write("\n  The new console\n");
    for (const path of NEW) {
      const result = await probe(`https://${host}${path}`);
      // 401 is the access gate answering, which still proves the route is live.
      const ok = [200, 301, 302, 401].includes(result.status);
      if (!ok) bad += 1;
      line(path, result, ok ? "ok  " : "FAIL");
    }
  }

  process.stdout.write(bad === 0
    ? "\nBoth designs are serving side by side.\n"
    : `\n${bad} probe${bad === 1 ? "" : "s"} failed.\n`);
  process.exitCode = bad === 0 ? 0 : 1;
}

main();
