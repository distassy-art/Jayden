import assert from "node:assert/strict";
import test from "node:test";
import {
  comparablePriorDays,
  isOwnerSearch,
  parseStation,
  roleFromSearch,
  sumMetrics,
  summarizeMonth,
  type DayRow,
} from "../src/lib/calendar.ts";

function day(date: string, profit: number): DayRow {
  return {
    day: date,
    gas_vol: 100,
    gas_profit: 10,
    sales: 200,
    purch: 100,
    store_profit: 100,
    margin: 0.5,
    total_profit: profit,
  };
}

test("Farsai is the default role; owner is a query flag", () => {
  assert.equal(roleFromSearch(""), "farsai");
  assert.equal(roleFromSearch("station=db"), "farsai");
  assert.equal(isOwnerSearch("owner=1"), true);
  assert.equal(roleFromSearch("?view=owner"), "owner");
  assert.equal(roleFromSearch("role=owner"), "owner");
});

test("HB and DB parse from short and Arco labels", () => {
  assert.equal(parseStation("hb"), "hb");
  assert.equal(parseStation("DB"), "db");
  assert.equal(parseStation("arco_db"), "db");
  assert.equal(parseStation("arco_hb"), "hb");
  assert.equal(parseStation("other"), null);
});

test("month totals recompute margin from summed profit and sales", () => {
  const totals = sumMetrics([
    day("2026-09-01", 50),
    day("2026-09-02", 70),
  ]);
  assert.equal(totals.total_profit, 120);
  assert.equal(totals.sales, 400);
  assert.equal(totals.store_profit, 200);
  assert.equal(totals.margin, 0.5);
});

test("open month trends against the same days last month", () => {
  const current = [day("2026-09-01", 110), day("2026-09-02", 90)];
  const prior: DayRow[] = [];
  for (let d = 1; d <= 31; d++) {
    prior.push(day(`2026-08-${String(d).padStart(2, "0")}`, 100));
  }
  const slice = comparablePriorDays(current, prior, 30);
  assert.equal(slice.length, 2);
  const summary = summarizeMonth(2026, 9, current, prior);
  assert.equal(summary.comparable, true);
  assert.equal(summary.trend.label, "vs same days last month");
  assert.equal(summary.trend.prior, 200);
  assert.equal(summary.trend.current, 200);
  assert.equal(summary.trend.delta, 0);
});

test("full month trends against the whole prior month", () => {
  const current: DayRow[] = [];
  const prior: DayRow[] = [];
  for (let d = 1; d <= 31; d++) {
    current.push(day(`2026-08-${String(d).padStart(2, "0")}`, 120));
    prior.push(day(`2026-07-${String(d).padStart(2, "0")}`, 100));
  }
  const summary = summarizeMonth(2026, 8, current, prior);
  assert.equal(summary.comparable, false);
  assert.equal(summary.trend.label, "vs last month");
  assert.equal(summary.trend.delta, 620);
});
