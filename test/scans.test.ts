import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { scanHref, scansForDay, scansForMonth } from "../src/lib/scans.ts";

test("HB Sept 12 and 13 expose Worker-hosted PDFs for fields 4, 12, and 13", () => {
  const d12 = scansForDay("hb", "2026-09-12");
  const d13 = scansForDay("hb", "2026-09-13");
  assert.equal(d12[4], "/scans/hb-2026-09-12-safedrop.pdf");
  assert.equal(d12[12], "/scans/hb-2026-09-12-13-lotto.pdf");
  assert.equal(d12[13], "/scans/hb-2026-09-12-lottery.pdf");
  assert.equal(d13[4], "/scans/hb-2026-09-13-safedrop.pdf");
  assert.equal(d13[12], "/scans/hb-2026-09-12-13-lotto.pdf");
  assert.equal(d13[13], "/scans/hb-2026-09-13-lottery.pdf");
  for (const href of Object.values({ ...d12, ...d13 })) {
    assert.ok(href.startsWith("/scans/"));
    assert.ok(existsSync(new URL(`../public${href}`, import.meta.url)));
  }
});

test("scan PDFs stay off DB days and off other HB days", () => {
  assert.deepEqual(scansForDay("db", "2026-09-12"), {});
  assert.deepEqual(scansForDay("hb", "2026-09-11"), {});
  assert.equal(scanHref("hb", "2026-09-12", 1), null);
  assert.equal(scanHref("hb", "2026-09-12", 4), "/scans/hb-2026-09-12-safedrop.pdf");
  const sept = scansForMonth("hb", 2026, 9);
  assert.deepEqual(Object.keys(sept).sort(), ["2026-09-12", "2026-09-13"]);
  assert.deepEqual(scansForMonth("hb", 2026, 8), {});
  assert.deepEqual(scansForMonth("db", 2026, 9), {});
});

test("day details render a PDF link; month-grid cells do not", () => {
  const js = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /function scanPdfLink\(/);
  assert.match(js, /class="scan-pdf"/);
  assert.match(js, /fmtNum\(value\)\}\$\{scan\}/);
  const gridChunk = js.slice(js.indexOf("function renderGrid"), js.indexOf("function gridCellMetrics"));
  assert.doesNotMatch(gridChunk, /scan-pdf/);
  assert.doesNotMatch(gridChunk, /scanPdfLink/);
});
