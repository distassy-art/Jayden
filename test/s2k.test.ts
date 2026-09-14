import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  comparablePriorDays,
  dayDetailRows,
  remainingDayDetailRows,
  emptyS2k,
  filledCount,
  grandTotal,
  CELL_FIELDS,
  gridCellMetrics,
  parseS2k,
  setS2kField,
  S2K_COUNT,
  s2kSlots,
  sumS2k,
  summarizeMonth,
  type DayRow,
} from "../src/lib/calendar.ts";

function blankMetrics() {
  return {
    gas_vol: null,
    gas_profit: null,
    sales: null,
    purch: null,
    store_profit: null,
    margin: null,
    total_profit: null,
  };
}

function day(date: string, values: Array<number | null>): DayRow {
  const s2k = emptyS2k();
  values.forEach((v, i) => {
    s2k[i] = v;
  });
  return { day: date, ...blankMetrics(), s2k };
}

test("exactly 17 Mina-named slots; 18 and 19 are gone", () => {
  const slots = s2kSlots();
  assert.equal(S2K_COUNT, 17);
  assert.equal(slots.length, 17);
  assert.equal(slots[0].label, "Gas Inventory from S2K");
  assert.equal(slots[7].label, "Net Cstore Sales");
  assert.equal(slots[9].label, "Lotto Sales");
  assert.equal(slots[10].label, "Scratchers Sales");
  assert.equal(slots[11].label, "Lotto Payout");
  assert.equal(slots[12].label, "Lottery Payout");
  assert.equal(slots[13].label, "Cashier Over/Short");
  assert.equal(slots[14].label, "Payouts");
  assert.equal(slots[15].label, "Fuel Deposit");
  assert.equal(
    slots[16].label,
    "Credit + Debit + EBT + Mobile + Prepaid Gift − fees",
  );
  assert.equal(slots.at(-1)?.index, 17);
});

test("parse and set one field at a time without filling the rest", () => {
  let fields = parseS2k(null);
  assert.equal(fields.length, 17);
  assert.equal(filledCount(fields), 0);
  fields = setS2kField(fields, 1, 10);
  fields = setS2kField(fields, 17, 5);
  assert.equal(filledCount(fields), 2);
  assert.equal(fields[0], 10);
  assert.equal(fields[16], 5);
  assert.equal(grandTotal(fields), 15);
});

test("month totals and trend roll up all 17 slots", () => {
  const currentVals = Array.from({ length: 17 }, (_, i) => i + 1);
  const priorVals = Array.from({ length: 17 }, () => 1);
  const current = [day("2026-09-01", currentVals), day("2026-09-02", currentVals)];
  const prior: DayRow[] = [];
  for (let d = 1; d <= 31; d++) {
    prior.push(day(`2026-08-${String(d).padStart(2, "0")}`, priorVals));
  }
  const slice = comparablePriorDays(current, prior, 30);
  assert.equal(slice.length, 2);
  const summary = summarizeMonth(2026, 9, current, prior);
  assert.equal(summary.totals[0], 2);
  assert.equal(summary.totals[16], 34);
  assert.equal(summary.grand, ((17 * 18) / 2) * 2);
  assert.equal(summary.priorGrand, 17 * 2);
  assert.equal(summary.trend.field, "s2k_total");
  assert.equal(summary.comparable, true);
});

test("sumS2k leaves unused slots null", () => {
  const sums = sumS2k([day("2026-09-01", [3])]);
  assert.equal(sums[0], 3);
  assert.equal(sums[1], null);
  assert.equal(filledCount(sums), 1);
});

test("month-grid cells list all 17 named fields and leave empty blank", () => {
  const s2k = emptyS2k();
  s2k[0] = 20891;
  s2k[3] = 9223;
  const lines = gridCellMetrics(s2k);
  assert.equal(lines.length, 17);
  assert.deepEqual(
    lines.filter((row) => row.value != null).map((row) => [row.index, row.short, row.value]),
    [
      [1, "Gas Inv", 20891],
      [4, "Safe drop", 9223],
    ],
  );
  s2k[5] = 5584.53;
  s2k[7] = 800;
  s2k[8] = 90;
  s2k[14] = 40;
  s2k[16] = 100;
  const filled = gridCellMetrics(s2k).filter((row) => row.value != null);
  assert.deepEqual(
    filled.map((row) => row.short),
    ["Gas Inv", "Safe drop", "Gallons", "C-store", "Tax1+4", "Payouts", "C+D+EBT"],
  );
  assert.equal(gridCellMetrics(emptyS2k()).length, 17);
  assert.ok(gridCellMetrics(emptyS2k()).every((row) => row.value == null));
});

test("day squares reserve all 17 slots", () => {
  assert.equal(CELL_FIELDS.length, 17);
  assert.deepEqual(
    CELL_FIELDS.map((field) => field.index),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  );
  const full = emptyS2k().map((_, i) => i + 1);
  assert.equal(gridCellMetrics(full).length, 17);
});

test("day details pair each named field with that category's month total", () => {
  const dayVals = emptyS2k();
  dayVals[0] = 20891;
  dayVals[3] = 9223;
  const monthVals = emptyS2k();
  monthVals[0] = 171863;
  monthVals[3] = 80327;
  const rows = dayDetailRows(dayVals, monthVals);
  assert.equal(rows.length, 17);
  assert.equal(rows[0].label, "Gas Inventory from S2K");
  assert.equal(rows[0].day, 20891);
  assert.equal(rows[0].month, 171863);
  assert.equal(rows[3].label, "Safe drop");
  assert.equal(rows[3].day, 9223);
  assert.equal(rows[3].month, 80327);
  assert.equal(rows[1].day, null);
  assert.equal(rows[1].month, null);
  const rest = remainingDayDetailRows(dayVals, monthVals);
  assert.equal(rest.length, 15);
  assert.ok(rest.every((row) => row.day == null));
  assert.ok(!rest.some((row) => [1, 4].includes(row.index)));
});

test("calendar UI is view-only with no Add control, file input, or Save", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  for (const src of [html, js]) {
    assert.doesNotMatch(src, /add field/i);
    assert.doesNotMatch(src, /\+ Add\b/);
    assert.doesNotMatch(src, /\bAdd\b/);
    assert.doesNotMatch(src, /id="add"/i);
    assert.doesNotMatch(src, /id="save-day"/);
    assert.doesNotMatch(src, /<input\b/i);
    assert.doesNotMatch(src, /type="file"/i);
  }
  assert.match(html, /Display only/);
  assert.doesNotMatch(html, /id="add-field"/i);
  assert.doesNotMatch(html, /\bSave\b/);
});
