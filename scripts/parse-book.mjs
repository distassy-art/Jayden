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
process.stdout.write(JSON.stringify(json, null, 2) + "\n");
