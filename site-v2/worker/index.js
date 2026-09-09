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
  ["/api/data/manager.json", "/data/manager.json"],
]);

/** Binary assets (invoice and pricing PDFs) served straight through. */
const ASSET_PREFIX = "/api/asset/";
const ASSET_ALLOWED = /^\/data\/[A-Za-z0-9._/-]+\.(pdf|png|jpg|jpeg|webp|csv|xlsx)$/i;

const FORWARD_HEADERS = ["x-ss-email", "x-ss-role"];

/* -------------------------------------------------------------------------
   Preview gate
   -------------------------------------------------------------------------
   A preview URL is reachable by anyone who has it, and these pages show real
   client financials. `PREVIEW_ACCESS_SHA256` holds the SHA-256 of a passphrase;
   only its hash lives in the repository. Leave the variable unset to disable
   the gate entirely (useful when the worker already sits behind Cloudflare
   Access).
   ------------------------------------------------------------------------- */

const ACCESS_COOKIE = "ssv2_access";

/* Served before the gate: the gate page's own logo, plus the icons and manifest
   the browser requests on its own (sometimes without cookies, which would
   otherwise fill the console with failures). None of them reveal any data. */
const PUBLIC_PATHS = new Set([
  "/assets/logo-mark.png",
  "/assets/favicon-32.png",
  "/assets/apple-touch-icon.png",
  "/manifest.webmanifest",
]);

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

/** Constant-time-ish comparison so the gate does not leak the hash byte by byte. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function gatePage(message = "") {
  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Preview access · Smart Solutions AI</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#08182c;
         font:15px/1.5 "Segoe UI",system-ui,sans-serif; color:#e8eef6 }
  form { width:min(340px,calc(100vw - 40px)); text-align:center }
  img { width:64px; margin:0 auto 22px }
  h1 { font-size:19px; font-weight:650; margin:0 0 6px }
  p { color:#9fb2c8; font-size:13.5px; margin:0 0 22px }
  input { width:100%; box-sizing:border-box; height:44px; padding:0 12px; font-size:15px;
          border:1px solid #52708f; border-radius:10px; background:#0c1a2d; color:#e8eef6 }
  input:focus { outline:2px solid #13b3a8; outline-offset:2px }
  button { width:100%; height:44px; margin-top:10px; border:0; border-radius:10px; cursor:pointer;
           background:#13b3a8; color:#04231f; font-size:15px; font-weight:650 }
  .err { min-height:20px; margin-top:10px; color:#ff8d86; font-size:13px }
</style></head>
<body><form method="GET" action="/__access">
  <img src="/assets/logo-mark.png" alt="Smart Solutions AI">
  <h1>Preview access</h1>
  <p>This build is not public. Enter the access phrase you were given.</p>
  <input name="key" type="password" autofocus autocomplete="current-password" aria-label="Access phrase">
  <button type="submit">Continue</button>
  <div class="err">${message}</div>
</form></body></html>`, {
    status: message ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

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

    const required = env.PREVIEW_ACCESS_SHA256;
    if (required) {
      if (url.pathname === "/__access") {
        const supplied = await sha256(url.searchParams.get("key") || "");
        if (!sameSecret(supplied, required)) return gatePage("That phrase was not recognised.");
        return new Response(null, {
          status: 302,
          headers: {
            location: "/",
            "set-cookie": `${ACCESS_COOKIE}=${required}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
          },
        });
      }
      if (!PUBLIC_PATHS.has(url.pathname) && !sameSecret(readCookie(request, ACCESS_COOKIE), required)) {
        return url.pathname.startsWith("/api/")
          ? json({ ok: false, error: "locked" }, 401)
          : gatePage();
      }
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
