import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCsv, parseHtmlTables } from "../src/lib/parse.ts";

test("bundled HB CSV and DB HTML parse", () => {
  const csv = parseCsv(readFileSync(new URL("../public/sample-hb.csv", import.meta.url), "utf8"));
  const html = parseHtmlTables(
    readFileSync(new URL("../public/sample-db.html", import.meta.url), "utf8"),
  );
  assert.equal(csv.length, 3);
  assert.equal(csv[0].day, "2026-09-10");
  assert.equal(html.length, 1);
  assert.equal(html[0].day, "2026-09-08");
  assert.equal(html[0].store_profit, 695);
});
