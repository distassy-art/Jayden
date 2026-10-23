import assert from "node:assert/strict";
import test from "node:test";
import { finalizeMetrics } from "../src/lib/calendar.ts";
import {
  defaultStationFromFilename,
  parseCsv,
  parseDateCell,
  parseHtmlTables,
} from "../src/lib/parse.ts";
import { sampleDay, sampleSeed } from "../src/lib/seed.ts";

const CSV = `Date,Gas Volume,Gas Profit,C-Store Sales,Purchase,Store Profit,Total Profit
2026-09-10,5000,700,2500,1600,900,1600
9/11/2026,4100,610,2200,1500,700,1310
`;

const HTML = `<table>
<tr><th>Date</th><th>Gas Volume</th><th>C-Store Sales</th><th>Purchase</th></tr>
<tr><td>2026-08-02</td><td>3,200</td><td>$1,800</td><td>1,200</td></tr>
</table>`;

test("CSV import reads Arco Daily headers and Excel-style dates", () => {
  const days = parseCsv(CSV);
  assert.equal(days.length, 2);
  assert.equal(days[0].day, "2026-09-10");
  assert.equal(days[0].gas_vol, 5000);
  assert.equal(days[0].sales, 2500);
  assert.equal(days[1].day, "2026-09-11");
  assert.equal(days[0].store_profit, 900);
  assert.equal(days[0].total_profit, 1600);
});

test("HTML table import fills derived store profit", () => {
  const days = parseHtmlTables(HTML);
  assert.equal(days.length, 1);
  assert.equal(days[0].day, "2026-08-02");
  assert.equal(days[0].gas_vol, 3200);
  assert.equal(days[0].store_profit, 600);
  assert.equal(days[0].sales, 1800);
});

test("filename hints pick HB vs DB without mixing them", () => {
  assert.equal(defaultStationFromFilename("Arco HB Daily.xlsx"), "hb");
  assert.equal(defaultStationFromFilename("arco-db-export.html"), "db");
});

test("Excel serial dates convert", () => {
  assert.equal(parseDateCell("46275"), "2026-09-10");
});

test("sample HB and DB days differ so the station switch is visible", () => {
  const hb = sampleDay("hb", "2026-09-10");
  const db = sampleDay("db", "2026-09-10");
  assert.notEqual(hb.gas_vol, db.gas_vol);
  assert.ok((hb.gas_vol ?? 0) > (db.gas_vol ?? 0));
  assert.equal(sampleSeed().length, 88);
});

test("finalizeMetrics derives profit fields", () => {
  const m = finalizeMetrics({ sales: 100, purch: 40, gas_profit: 12 });
  assert.equal(m.store_profit, 60);
  assert.equal(m.total_profit, 72);
  assert.equal(m.margin, 0.6);
});
