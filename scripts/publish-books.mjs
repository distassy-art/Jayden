#!/usr/bin/env node
/**
 * Publish Daily/Monthly Excel data to the live site https://smartsolutionsai.us
 * (and /new — same books overlay).
 *
 * The live write path is POST /.netlify/functions/books with `stations`.
 * books-save / patch payloads only bump updated_at and do not merge days.
 *
 * Input JSON (stdin or --file) — either shape works:
 *
 * 1) Stations (preferred):
 * {
 *   "stations": [
 *     { "file": "Arco HB Daily.xlsx", "kind": "daily", "id": "42179", "name": "Arco HB",
 *       "period": "2026-09", "days": [ { "date": "2026-09-09", "gas_vol": 1, ... } ],
 *       "months": {}, "kpis": {} }
 *   ]
 * }
 *
 * 2) Legacy books-parse patches (converted automatically):
 * {
 *   "patches": [
 *     { "file": "Arco HB Daily.xlsx", "type": "daily", "store": { "id": "42179", "name": "Arco HB" },
 *       "period": "2026-09", "patch": { "daily": [ ... ], "dailySeptember": [ { id, name, days } ] } }
 *   ]
 * }
 */
const SITE = "https://smartsolutionsai.us";
const ADMIN = { email: "smartsolutionsai", role: "owner" };

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const dry = args.includes("--dry-run");

async function readInput() {
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(args[fileIdx + 1], "utf8"));
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("no input");
  return JSON.parse(raw);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(SITE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-ss-email": ADMIN.email,
      "x-ss-role": ADMIN.role,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.ok === false) {
    const err = new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    err.response = json;
    throw err;
  }
  return json;
}

function summarize(overlay) {
  const stations = (overlay && overlay.stations) || {};
  return Object.keys(stations)
    .sort()
    .map((id) => {
      const st = stations[id] || {};
      const days = Array.isArray(st.days) ? st.days : [];
      const last = days.length ? days[days.length - 1].date : "—";
      const months = st.months && typeof st.months === "object" ? Object.keys(st.months).sort() : [];
      return `${id} ${st.name || ""} days=${days.length} last=${last} months=${months.slice(-4).join(",") || "—"}`;
    });
}

/** Collect day rows from a books-parse patch (flat daily + monthly packs). */
function daysFromPatch(patch) {
  if (!patch || typeof patch !== "object") return [];
  const byDate = new Map();
  const add = (rows) => {
    for (const d of rows || []) {
      if (!d || !d.date) continue;
      byDate.set(d.date, d);
    }
  };
  add(patch.daily);
  for (const [key, val] of Object.entries(patch)) {
    if (!key.startsWith("daily") || key === "daily") continue;
    if (!Array.isArray(val)) continue;
    for (const pack of val) {
      if (pack && Array.isArray(pack.days)) add(pack.days);
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function stationsFromPatches(patches) {
  const out = [];
  for (const p of patches) {
    if (!p || !p.patch) continue;
    const id = String((p.store && p.store.id) || "").trim();
    if (!id) continue;
    const days = daysFromPatch(p.patch);
    const months = (p.patch && p.patch.monthly) || {};
    if (!days.length && (!months || !Object.keys(months).length)) continue;
    out.push({
      file: p.file || `${id}.xlsx`,
      kind: p.type || "daily",
      id,
      name: (p.store && p.store.name) || id,
      period: p.period || (days.length ? days[days.length - 1].date.slice(0, 7) : ""),
      days,
      months: typeof months === "object" && !Array.isArray(months) ? months : {},
      kpis: p.kpis || {},
    });
  }
  return out;
}

const input = await readInput();
let stations = Array.isArray(input.stations) ? input.stations.filter((s) => s && s.id) : [];
if (!stations.length && Array.isArray(input.patches)) {
  stations = stationsFromPatches(input.patches);
}
if (!stations.length) {
  console.error("No stations to publish. Provide stations[] or patches[].");
  process.exit(1);
}

const before = await api("/.netlify/functions/books-overlay");
console.log("overlay before", before.updated_at);
console.log(summarize(before.overlay).join("\n") || "(empty)");

if (dry) {
  console.log(`dry-run: would publish ${stations.length} stations via /.netlify/functions/books`);
  for (const s of stations) {
    const n = Array.isArray(s.days) ? s.days.length : 0;
    const last = n ? s.days[n - 1].date : "—";
    console.log(`  ${s.id} ${s.name || ""} days=${n} last=${last}`);
  }
  process.exit(0);
}

const saved = await api("/.netlify/functions/books", {
  method: "POST",
  body: { ...ADMIN, stations },
});
console.log(
  "saved",
  saved.updated_at,
  "published",
  (saved.published || []).map((p) => `${p.id}:${p.days}`).join(", ") || "(none)"
);

const after = await api("/.netlify/functions/books-overlay");
console.log("overlay after", after.updated_at);
console.log(summarize(after.overlay).join("\n") || "(empty)");
