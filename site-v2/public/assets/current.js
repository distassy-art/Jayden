/*
 * The open month.
 *
 * Everything else in the console works on months that have been closed. This
 * module handles the month that is still running: figures through the last
 * complete day, the purchase budgets that are meant to hold it, and the weekly
 * note the store gets.
 *
 * Two things in the upstream feed are easy to get wrong, so they are handled
 * here once:
 *
 *   1. `mtd.yoy` is last year's *whole* month. Putting a percentage between
 *      seven days and thirty is meaningless, so a change is only ever computed
 *      against a pace projection, and both are labelled as such.
 *   2. `dept_budget.items` can carry a synthetic "Total ..." row. Summing the
 *      list without dropping it double-counts every department.
 */

import { isNum } from "./ui.js";

/** Rows in the department budget that are totals rather than departments. */
const TOTAL_ROW = /^total\b/i;

const SUMMABLE = [
  "sales", "purchases", "store_profit", "gas_vol", "gas_profit", "total_profit",
];

const numOrNull = (value) => (isNum(value) ? Number(value) : null);

function addInto(target, source, keys = SUMMABLE) {
  keys.forEach((key) => {
    if (isNum(source?.[key])) target[key] = (target[key] || 0) + Number(source[key]);
  });
  return target;
}

/** Ratios are recomputed from the summed parts; averaging them is wrong. */
function withRatios(totals) {
  const out = { ...totals };
  out.margin = out.sales ? Number(out.store_profit || 0) / Number(out.sales) : null;
  out.gas_margin = out.gas_vol ? Number(out.gas_profit || 0) / Number(out.gas_vol) : null;
  out.buy_ratio = out.sales ? Number(out.purchases || 0) / Number(out.sales) : null;
  if (!isNum(out.total_profit)) {
    out.total_profit = Number(out.gas_profit || 0) + Number(out.store_profit || 0);
  }
  return out;
}

/** Days in the calendar month that a `YYYY-MM-DD` string falls in. */
function daysInMonthOf(date) {
  const match = /^(\d{4})-(\d{2})/.exec(String(date || ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

/**
 * Scale a part-month to the whole month.
 * This is a straight-line pace, not a forecast — it assumes the rest of the
 * month looks like the days already filed, which is why every view that shows
 * it says so.
 */
function project(mtd) {
  const days = Number(mtd?.days || 0);
  const total = daysInMonthOf(mtd?.through);
  if (!days || !total || days >= total) return null;

  const factor = total / days;
  const out = { days, daysInMonth: total, factor };
  SUMMABLE.forEach((key) => {
    if (isNum(mtd[key])) out[key] = Number(mtd[key]) * factor;
  });
  return withRatios(out);
}

/* -------------------------------------------------------------------------
   Per store
   ------------------------------------------------------------------------- */

function normaliseWeeks(rows) {
  return (rows || []).map((row, index) => {
    const maximum = numOrNull(row.maximum);
    const actual = numOrNull(row.actual);
    return {
      index,
      label: row.week || `Week ${index + 1}`,
      maximum,
      actual,
      // A week nobody has bought in yet is upcoming, not "under budget".
      started: isNum(actual) && Number(actual) > 0,
      over: isNum(maximum) && isNum(actual) ? Number(actual) - Number(maximum) : null,
    };
  });
}

function normaliseDeptBudget(block) {
  return (block?.items || [])
    .filter((item) => item?.name && !TOTAL_ROW.test(item.name))
    .map((item) => {
      const spent = numOrNull(item.purchases_mtd) ?? 0;
      const budget = numOrNull(item.month_budget);
      const left = isNum(item.remaining) ? Number(item.remaining)
        : (isNum(budget) ? budget - spent : null);
      return {
        name: item.name,
        spent,
        budget,
        left,
        used: budget ? spent / budget : null,
      };
    });
}

function normaliseDepartments(rows) {
  return (rows || []).map((row) => {
    const margin = numOrNull(row.margin);
    const target = numOrNull(row.target_margin);
    return {
      name: row.name,
      sales: numOrNull(row.sales),
      purchases: numOrNull(row.purchases),
      profit: numOrNull(row.profit),
      margin,
      target,
      short: isNum(margin) && isNum(target) ? margin - target : null,
    };
  });
}

function normaliseStore(raw) {
  const mtd = raw?.mtd || null;
  const gaps = raw?.gaps || [];

  return {
    id: String(raw.id),
    name: raw.name || String(raw.id),
    group: raw.group || "",
    mtd: mtd ? withRatios({
      days: Number(mtd.days || 0),
      through: mtd.through || null,
      ...Object.fromEntries(SUMMABLE.map((key) => [key, numOrNull(mtd[key])])
        .filter(([, value]) => value !== null)),
    }) : null,
    projection: mtd ? project(mtd) : null,
    lastYear: mtd?.yoy ? {
      label: mtd.yoy.compare_label || mtd.yoy.label || "Last year",
      wholeMonth: mtd.yoy.kind === "full_month_last_year",
      ...Object.fromEntries(SUMMABLE.map((key) => [key, numOrNull(mtd.yoy[key])])),
    } : null,
    yoyNote: mtd?.yoy_note || "",
    weeks: normaliseWeeks(raw?.weekly_budget),
    deptBudget: normaliseDeptBudget(raw?.dept_budget),
    departments: normaliseDepartments(raw?.departments),
    alert: raw?.weekly_alert?.found ? {
      heading: raw.weekly_alert.heading || "Weekly alert",
      storeLine: raw.weekly_alert.store_line || raw.name || "",
      notes: (raw.weekly_alert.notes || []).filter(Boolean),
      estimated: gaps.includes("alert_synthesized"),
    } : null,
    gaps,
    // Flags worth showing next to a figure rather than burying in data health.
    estimates: {
      budget: gaps.includes("dept_budget_synthesized"),
      salesFromDepartments: gaps.includes("mtd_sales_from_departments"),
      noOperatingDays: gaps.includes("no_september_operating_days"),
    },
  };
}

/**
 * Build the open-month model.
 * `stores` limits it to the ids an account may see, matching `buildModel`.
 */
export function buildCurrent(feed, { stores = null } = {}) {
  if (!feed?.stations) return null;
  const only = stores ? new Set(stores.map(String)) : null;

  const list = feed.stations
    .filter((row) => row?.id && (!only || only.has(String(row.id))))
    .map(normaliseStore)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    asOf: feed.as_of || null,
    label: feed.period?.label || "Month to date",
    lastClosedMonth: feed.period?.last_closed_month || "",
    note: feed.period?.note || "",
    stores: list,
    byId: new Map(list.map((store) => [store.id, store])),
  };
}

/* -------------------------------------------------------------------------
   Roll-ups
   ------------------------------------------------------------------------- */

/** The stores in `current` that fall inside the active scope. */
export function currentStores(current, scope) {
  if (!current) return [];
  const ids = scope?.stationIds;
  if (!ids) return current.stores;
  const wanted = new Set(ids.map(String));
  return current.stores.filter((store) => wanted.has(store.id));
}

/**
 * Sum month-to-date across stores.
 * `days` is the longest run any one store has filed, not a sum — it describes
 * how far into the month the figures reach, and adding it would be nonsense.
 */
export function rollupMtd(stores) {
  const rows = stores.map((store) => store.mtd).filter(Boolean);
  if (!rows.length) return null;

  const totals = rows.reduce((acc, row) => addInto(acc, row), {});
  totals.days = Math.max(...rows.map((row) => row.days || 0));
  totals.through = rows.map((row) => row.through).filter(Boolean).sort().pop() || null;
  totals.stores = rows.length;
  return withRatios(totals);
}

export function rollupProjection(stores) {
  const rows = stores.map((store) => store.projection).filter(Boolean);
  if (!rows.length) return null;
  const totals = rows.reduce((acc, row) => addInto(acc, row), {});
  totals.daysInMonth = Math.max(...rows.map((row) => row.daysInMonth || 0));
  totals.stores = rows.length;
  return withRatios(totals);
}

/**
 * Last year's comparable figure.
 * Only stores that reported one are summed, and the count comes back so a view
 * can say the comparison covers 14 of 17 stores rather than implying all of it.
 */
export function rollupLastYear(stores) {
  const rows = stores.map((store) => store.lastYear).filter(Boolean);
  if (!rows.length) return null;
  const totals = rows.reduce((acc, row) => addInto(acc, row), {});
  totals.stores = rows.length;
  totals.wholeMonth = rows.every((row) => row.wholeMonth);
  totals.label = rows[0].label;
  return withRatios(totals);
}

/**
 * Sum the weekly purchase ceilings by position in the month.
 * Stores do not all cut their weeks on the same day, so rolling up by label
 * would drop rows; position is stable and the disagreement is reported.
 */
export function rollupWeeks(stores) {
  const byIndex = new Map();

  stores.forEach((store) => {
    store.weeks.forEach((week) => {
      if (!byIndex.has(week.index)) {
        byIndex.set(week.index, { index: week.index, labels: new Map(), maximum: 0, actual: 0, stores: 0 });
      }
      const bucket = byIndex.get(week.index);
      bucket.labels.set(week.label, (bucket.labels.get(week.label) || 0) + 1);
      if (isNum(week.maximum)) bucket.maximum += Number(week.maximum);
      if (isNum(week.actual)) bucket.actual += Number(week.actual);
      bucket.stores += 1;
    });
  });

  return [...byIndex.values()]
    .sort((a, b) => a.index - b.index)
    .map((bucket) => {
      const labels = [...bucket.labels.entries()].sort((a, b) => b[1] - a[1]);
      return {
        index: bucket.index,
        label: labels.length === 1 ? labels[0][0] : `Week ${bucket.index + 1}`,
        mixedWeeks: labels.length > 1,
        stores: bucket.stores,
        maximum: bucket.maximum,
        actual: bucket.actual,
        started: bucket.actual > 0,
        over: bucket.actual - bucket.maximum,
      };
    });
}

/** Sum the department purchase budgets, worst headroom first. */
export function rollupDeptBudget(stores) {
  const byName = new Map();

  stores.forEach((store) => {
    store.deptBudget.forEach((row) => {
      if (!byName.has(row.name)) {
        byName.set(row.name, { name: row.name, spent: 0, budget: 0, stores: 0, estimated: false });
      }
      const bucket = byName.get(row.name);
      bucket.spent += row.spent || 0;
      if (isNum(row.budget)) bucket.budget += Number(row.budget);
      bucket.stores += 1;
      if (store.estimates.budget) bucket.estimated = true;
    });
  });

  return [...byName.values()]
    .map((row) => ({
      ...row,
      left: row.budget ? row.budget - row.spent : null,
      used: row.budget ? row.spent / row.budget : null,
    }))
    .sort((a, b) => (b.used ?? -1) - (a.used ?? -1));
}

/** Sum the department trading figures, furthest below target first. */
export function rollupDepartments(stores) {
  const byName = new Map();

  stores.forEach((store) => {
    store.departments.forEach((row) => {
      if (!byName.has(row.name)) {
        byName.set(row.name, {
          name: row.name, sales: 0, purchases: 0, profit: 0, stores: 0,
          targetWeight: 0, targetSales: 0,
        });
      }
      const bucket = byName.get(row.name);
      bucket.sales += row.sales || 0;
      bucket.purchases += row.purchases || 0;
      bucket.profit += row.profit || 0;
      bucket.stores += 1;
      // A blended target has to be weighted by sales, or a tiny store's target
      // counts as much as a large one's.
      if (isNum(row.target) && isNum(row.sales)) {
        bucket.targetWeight += row.target * Number(row.sales);
        bucket.targetSales += Number(row.sales);
      }
    });
  });

  return [...byName.values()]
    .map((row) => {
      const margin = row.sales ? row.profit / row.sales : null;
      const target = row.targetSales ? row.targetWeight / row.targetSales : null;
      return {
        name: row.name,
        sales: row.sales,
        purchases: row.purchases,
        profit: row.profit,
        stores: row.stores,
        margin,
        target,
        short: isNum(margin) && isNum(target) ? margin - target : null,
      };
    })
    .sort((a, b) => (a.short ?? Infinity) - (b.short ?? Infinity));
}
