#!/usr/bin/env node
/*
 * Local dev server that mirrors the preview worker: static files from public/
 * plus the same read-only `/api/*` proxy to production.
 *
 *   node scripts/dev-server.mjs [--port 8787]
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const UPSTREAM = "https://smartsolutionsai.us";

const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const PORT = Number(portFlag !== -1 ? args[portFlag + 1] : process.env.PORT || 8787);

// The deployed worker gates access with a passphrase. Locally that only gets in
// the way, so it stays off unless PREVIEW_ACCESS_SHA256 is exported.
const ACCESS_HASH = process.env.PREVIEW_ACCESS_SHA256 || "";

// Mirrors MOUNT_PATH in wrangler.toml, so `--mount /new` reproduces exactly
// what a subpath deployment does.
const mountFlag = args.indexOf("--mount");
const rawMount = mountFlag !== -1 ? args[mountFlag + 1] : process.env.MOUNT_PATH || "";
const MOUNT = !rawMount || rawMount === "/" ? "" : `/${String(rawMount).replace(/^\/+|\/+$/g, "")}`;

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
  // Fuel revenue, purchases by vendor, and the open month's days. See the
  // worker's copy of this map for why each is needed.
  ["/api/data/monthly.json", "/data/monthly.json"],
  ["/api/data/vendor-spend.json", "/data/vendor_dly_spend_2026.json"],
  ["/api/data/daily-open.json", "/data/daily_september.json"],
  ["/api/data/depts.json", "/data/depts.json"],
]);

const ASSET_PREFIX = "/api/asset/";
const ASSET_ALLOWED = /^\/data\/[A-Za-z0-9._/-]+\.(pdf|png|jpg|jpeg|webp|csv|xlsx)$/i;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolveUpstream(pathname) {
  const mapped = ENDPOINTS.get(pathname);
  if (mapped) return mapped;
  if (pathname.startsWith(ASSET_PREFIX)) {
    const candidate = normalize(`/${pathname.slice(ASSET_PREFIX.length)}`).replace(/\\/g, "/");
    if (ASSET_ALLOWED.test(candidate)) return candidate;
  }
  return null;
}

/*
 * Mirrors the worker's redaction. The billing feed carries the company's own
 * bank routing and account numbers; nothing in the console reads them, so they
 * are dropped rather than proxied to the browser.
 */
function redact(upstreamPath, buffer) {
  if (upstreamPath !== "/data/billing.json") return buffer;
  try {
    const body = JSON.parse(buffer.toString("utf8"));
    if (!body?.payment) return buffer;
    const payment = { ...body.payment };
    let hit = false;
    for (const field of ["routing", "account", "accountNumber", "iban", "swift"]) {
      if (field in payment) { delete payment[field]; hit = true; }
    }
    return hit ? Buffer.from(JSON.stringify({ ...body, payment })) : buffer;
  } catch {
    return buffer;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

async function serveFile(res, filePath, status = 200) {
  const info = await stat(filePath);

  // The shell's `<base>` decides where every relative asset resolves, so under
  // a mount it has to be rewritten — the same thing the worker does.
  if (MOUNT && extname(filePath) === ".html") {
    const html = (await readFile(filePath, "utf8"))
      .replace('<base href="/">', `<base href="${MOUNT}/">`);
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(html);
    return;
  }

  res.writeHead(status, {
    "content-type": MIME[extname(filePath)] || "application/octet-stream",
    "content-length": info.size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Strip the mount prefix once; everything below works in unprefixed paths.
  let path = url.pathname;
  if (MOUNT) {
    if (path === MOUNT) {
      res.writeHead(308, { location: `${MOUNT}/` });
      res.end();
      return;
    }
    if (!path.startsWith(`${MOUNT}/`)) {
      sendJson(res, 404, { ok: false, error: "not_found", detail: `mounted at ${MOUNT}/` });
      return;
    }
    path = path.slice(MOUNT.length);
  }

  if (path === "/healthz") {
    sendJson(res, 200, { ok: true, service: "smartsolutions-admin-preview-dev", upstream: UPSTREAM });
    return;
  }

  if (ACCESS_HASH) {
    if (path === "/__access") {
      const supplied = createHash("sha256").update(url.searchParams.get("key") || "").digest("hex");
      if (supplied !== ACCESS_HASH) {
        res.writeHead(401, { "content-type": "text/plain" });
        res.end("That phrase was not recognised.");
        return;
      }
      res.writeHead(302, {
        location: `${MOUNT}/`,
        "set-cookie": `ssv2_access=${ACCESS_HASH}; Path=${MOUNT}/; HttpOnly; SameSite=Lax; Max-Age=604800`,
      });
      res.end();
      return;
    }
    const cookie = /(?:^|;\s*)ssv2_access=([^;]+)/.exec(req.headers.cookie || "")?.[1] || "";
    if (path !== "/assets/logo-mark.png" && cookie !== ACCESS_HASH) {
      res.writeHead(401, { "content-type": "text/plain", "cache-control": "no-store" });
      res.end("Preview locked. Visit /__access?key=<phrase>");
      return;
    }
  }

  if (path.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "read_only" });
      return;
    }
    const upstreamPath = resolveUpstream(path);
    if (!upstreamPath) {
      sendJson(res, 404, { ok: false, error: "not_allowed", detail: path });
      return;
    }
    try {
      const headers = { accept: "application/json,*/*" };
      for (const name of ["x-ss-email", "x-ss-role"]) {
        if (req.headers[name]) headers[name] = req.headers[name];
      }
      const upstream = await fetch(`${UPSTREAM}${upstreamPath}`, { headers });
      const buffer = redact(upstreamPath, Buffer.from(await upstream.arrayBuffer()));
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "cache-control": "no-store",
        "x-preview-source": `${UPSTREAM}${upstreamPath}`,
      });
      res.end(buffer);
    } catch (failure) {
      sendJson(res, 502, { ok: false, error: "upstream_unreachable", detail: String(failure) });
    }
    return;
  }

  // Static files, with a single-page-app fallback to the shell.
  const requested = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(PUBLIC, requested === "/" ? "index.html" : requested);
  if (!candidate.startsWith(PUBLIC)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }

  try {
    await serveFile(res, candidate);
  } catch {
    try {
      await serveFile(res, join(PUBLIC, "index.html"), extname(requested) ? 404 : 200);
    } catch {
      sendJson(res, 404, { ok: false, error: "not_found" });
    }
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Admin console preview on http://localhost:${PORT}${MOUNT}/\n`);
  process.stdout.write(`Proxying read-only API calls to ${UPSTREAM}\n`);
});
