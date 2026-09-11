#!/usr/bin/env node
/**
 * Parse one Daily or Monthly .xlsx through the live Cloudflare Worker
 * and print the books-parse JSON (including patch) to stdout.
 *
 * Usage: node scripts/parse-book.mjs /path/to/file.xlsx
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const SITE = "https://smartsolutionsai.us";
const ADMIN = { email: "smartsolutionsai", role: "owner" };

/** Filename → store when the workbook header does not parse an id/name. */
const FILE_STORE = {
  "La Mesa Daily.xlsx": { id: "42642", name: "La Mesa" },
  "La Mesa Monthly Summary.xlsx": { id: "42642", name: "La Mesa" },
  "Vista Daily.xlsx": { id: "42438", name: "Vista" },
  "Vista Monthly Summary.xlsx": { id: "42438", name: "Vista" },
};

function walkFix(obj, id, name) {
  if (Array.isArray(obj)) {
    obj.forEach((v) => walkFix(v, id, name));
    return;
  }
  if (!obj || typeof obj !== "object") return;
  if ("id" in obj) {
    const badId = obj.id == null || obj.id === "" || obj.id === "00000";
    if (badId) obj.id = id;
    if (String(obj.id) === String(id)) {
      const badName =
        !obj.name ||
        obj.name === "Unknown store" ||
        String(obj.name).includes("CONTENTS PURPOSE");
      if (badName) obj.name = name;
    }
  }
  for (const v of Object.values(obj)) walkFix(v, id, name);
}

function applyStoreFix(json, filename) {
  const fix = FILE_STORE[filename];
  if (!fix) return json;
  json.store = { ...(json.store || {}), id: fix.id, name: fix.name };
  if (json.patch) walkFix(json.patch, fix.id, fix.name);
  return json;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/parse-book.mjs <file.xlsx>");
  process.exit(1);
}

const buf = await readFile(file);
const name = basename(file);
if (!/\.xlsx$/i.test(name)) {
  console.error("xlsx only:", name);
  process.exit(1);
}

const res = await fetch(SITE + "/.netlify/functions/books-parse", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ss-email": ADMIN.email,
    "x-ss-role": ADMIN.role,
  },
  body: JSON.stringify({
    ...ADMIN,
    name,
    content: buf.toString("base64"),
  }),
});
const json = await res.json();
if (!res.ok || json.ok === false) {
  console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}
applyStoreFix(json, name);
process.stdout.write(JSON.stringify(json, null, 2) + "\n");
