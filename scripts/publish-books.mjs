#!/usr/bin/env node
/**
 * Publish already-parsed Daily/Monthly Excel patches to the live
 * Cloudflare site https://smartsolutionsai.us
 *
 * Input JSON (stdin or --file):
 * {
 *   "patches": [
 *     { "file": "42004 Daily.xlsx", "type": "daily", "store": { "id": "42004" }, "period": "2026-09", "patch": { ... } }
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
      const days = Array.isArray(st.days) ? st.days.length : 0;
      const months = st.months && typeof st.months === "object" ? Object.keys(st.months).sort() : [];
      return `${id} ${st.name || ""} days=${days} months=${months.slice(-4).join(",") || "—"}`;
    });
}

const input = await readInput();
const patches = Array.isArray(input.patches) ? input.patches.filter((p) => p && p.patch) : [];
if (!patches.length) {
  console.error("No patches to publish.");
  process.exit(1);
}

const before = await api("/.netlify/functions/books-overlay");
console.log("overlay before", before.updated_at);
console.log(summarize(before.overlay).join("\n") || "(empty)");

if (dry) {
  console.log(`dry-run: would save ${patches.length} patches`);
  process.exit(0);
}

const saved = await api("/.netlify/functions/books-save", {
  method: "POST",
  body: { ...ADMIN, patches },
});
console.log("saved", saved.updated_at, "files", (saved.overlay && saved.overlay.files) || []);

const after = await api("/.netlify/functions/books-overlay");
console.log("overlay after", after.updated_at);
console.log(summarize(after.overlay).join("\n") || "(empty)");
