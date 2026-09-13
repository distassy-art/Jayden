import assert from "node:assert/strict";
import test from "node:test";
import {
  comparablePriorDays,
  emptyS2k,
  filledCount,
  grandTotal,
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

test("slots are numbered 1-19 with no invented names", () => {
  const slots = s2kSlots();
  assert.equal(slots.length, S2K_COUNT);
  assert.equal(slots[0].label, "1");
  assert.equal(slots[18].label, "19");
});

test("parse and set one field at a time without filling the rest", () => {
  let fields = parseS2k(null);
  assert.equal(fields.length, 19);
  assert.equal(filledCount(fields), 0);
  fields = setS2kField(fields, 1, 10);
  fields = setS2kField(fields, 19, 5);
  assert.equal(filledCount(fields), 2);
  assert.equal(fields[0], 10);
  assert.equal(fields[18], 5);
  assert.equal(grandTotal(fields), 15);
});

test("month totals and trend roll up all 19 slots", () => {
  const currentVals = Array.from({ length: 19 }, (_, i) => i + 1);
  const priorVals = Array.from({ length: 19 }, () => 1);
  const current = [day("2026-09-01", currentVals), day("2026-09-02", currentVals)];
  const prior: DayRow[] = [];
  for (let d = 1; d <= 31; d++) {
    prior.push(day(`2026-08-${String(d).padStart(2, "0")}`, priorVals));
  }
  const slice = comparablePriorDays(current, prior, 30);
  assert.equal(slice.length, 2);
  const summary = summarizeMonth(2026, 9, current, prior);
  assert.equal(summary.totals[0], 2);
  assert.equal(summary.totals[18], 38);
  assert.equal(summary.grand, (19 * 20) / 2 * 2);
  assert.equal(summary.priorGrand, 19 * 2);
  assert.equal(summary.trend.field, "s2k_total");
  assert.equal(summary.comparable, true);
});

test("sumS2k leaves unused slots null", () => {
  const sums = sumS2k([day("2026-09-01", [3])]);
  assert.equal(sums[0], 3);
  assert.equal(sums[1], null);
  assert.equal(filledCount(sums), 1);
});
