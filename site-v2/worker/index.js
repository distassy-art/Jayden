/*
 * Preview worker for the Smart Solutions AI admin console.
 *
 * Two jobs:
 *   1. Serve the static console from the bundled assets.
 *   2. Proxy `/api/*` to the production site.
 *
 * The proxy is deliberately one-way. Only GET reaches the origin, and only for
 * an explicit allowlist of read endpoints, so running this preview can never
 * change anything on smartsolutionsai.us.
 */

const UPSTREAM = "https://smartsolutionsai.us";

/** Read endpoints, mapped from the console's `/api/...` path to the origin's. */
const ENDPOINTS = new Map([
  ["/api/books-overlay", "/.netlify/functions/books-overlay"],
  ["/api/billing", "/.netlify/functions/billing"],
  ["/api/mgr-tickets", "/.netlify/functions/mgr-tickets"],
  ["/api/mgr-days", "/.netlify/functions/mgr-days"],
  ["/api/login-hashes", "/.netlify/functions/login-hashes"],
  ["/api/data/owners.json", "/data/owners.json"],
  ["/api/data/logins.json", "/data/logins.json"],
  ["/api/data/admin-stores.json", "/data/admin-stores.json"],
  ["/api/data/s2k-invoices.json", "/data/s2k-invoices.json"],
  ["/api/data/vendor-orders.json", "/data/vendor-orders.json"],
  ["/api/data/billing.json", "/data/billing.json"],
  ["/api/data/pricing.json", "/data/pricing.json"],
]);

/** Binary assets (invoice and pricing PDFs) served straight through. */
const ASSET_PREFIX = "/api/asset/";
const ASSET_ALLOWED = /^\/data\/[A-Za-z0-9._/-]+\.(pdf|png|jpg|jpeg|webp|csv|xlsx)$/i;

const FORWARD_HEADERS = ["x-ss-email", "x-ss-role"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Resolve an incoming request path to an upstream path, or null if not allowed. */
function resolveUpstream(pathname) {
  const mapped = ENDPOINTS.get(pathname);
  if (mapped) return mapped;

  if (pathname.startsWith(ASSET_PREFIX)) {
    // Normalise so `..` cannot escape the /data/ prefix.
    const raw = `/${pathname.slice(ASSET_PREFIX.length)}`.replace(/\/+/g, "/");
    const candidate = new URL(raw, "https://x").pathname;
    if (ASSET_ALLOWED.test(candidate)) return candidate;
  }
  return null;
}

async function proxy(request, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, error: "read_only", detail: "This preview cannot modify live data." }, 405);
  }

  const upstreamPath = resolveUpstream(pathname);
  if (!upstreamPath) {
    return json({ ok: false, error: "not_allowed", detail: `${pathname} is not a permitted read endpoint.` }, 404);
  }

  const headers = new Headers({ accept: "application/json,*/*" });
  FORWARD_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });

  let response;
  try {
    response = await fetch(`${UPSTREAM}${upstreamPath}`, {
      method: "GET",
      headers,
      redirect: "follow",
      cf: { cacheTtl: 60, cacheEverything: false },
    });
  } catch (failure) {
    return json({ ok: false, error: "upstream_unreachable", detail: String(failure) }, 502);
  }

  const out = new Headers(response.headers);
  out.delete("set-cookie");
  out.set("cache-control", "no-store");
  out.set("x-preview-source", `${UPSTREAM}${upstreamPath}`);

  return new Response(response.body, { status: response.status, headers: out });
}

/** Deny indexing and tighten the browser's own guardrails. */
function harden(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return json({ ok: true, service: "smartsolutions-admin-preview", upstream: UPSTREAM });
    }

    if (url.pathname.startsWith("/api/")) {
      return harden(await proxy(request, url.pathname));
    }

    const asset = await env.ASSETS.fetch(request);
    // Single-page app: unknown paths fall back to the shell so deep links work.
    if (asset.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
      const shell = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
      return harden(new Response(shell.body, { status: 200, headers: shell.headers }));
    }
    return harden(asset);
  },
};
