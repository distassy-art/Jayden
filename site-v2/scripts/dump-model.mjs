#!/usr/bin/env node
/*
 * Dump the figures the console displays, as JSON, so they can be compared
 * against an independent recomputation from the raw feed.
 *
 *   node scripts/dump-model.mjs > /tmp/console-figures.json
 */

import { buildModel, departmentRollup, marginSeries, scopeTotals, yearSeries } from "../public/assets/analytics.js";

const BASE = process.env.CHECK_BASE || "http://localhost:8787";

const overlay = await fetch(`${BASE}/api/books-overlay`, {
  headers: { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" },
}).then((r) => r.json());

const model = buildModel(overlay);
const year = Number(model.currentYear);
const prior = year - 1;

const METRICS = ["total_profit", "fuel_profit", "gas_profit", "store_profit", "sales", "purchases", "gas_vol"];

const pick = (totals) => Object.fromEntries(
  METRICS.map((key) => [key, totals[key] ?? null])
    .concat([["store_margin", totals.store_margin ?? null], ["gas_margin", totals.gas_margin ?? null]]),
);

process.stdout.write(JSON.stringify({
  latestMonth: model.latestMonth,
  previousMonth: model.previousMonth,
  yearAgoMonth: model.yearAgoMonth,
  currentYear: model.currentYear,
  closedMonths: model.closedMonths,
  ytdKeys: model.ytdKeys,
  priorYtdKeys: model.priorYtdKeys,
  stationIds: model.stations.map((s) => s.id),

  portfolio: { ytd: pick(scopeTotals(model, year)), prior: pick(scopeTotals(model, prior)) },

  byStore: Object.fromEntries(model.stations.map((station) => [station.id, {
    name: station.name,
    ytd: pick(scopeTotals(model, year, [station.id])),
    prior: pick(scopeTotals(model, prior, [station.id])),
  }])),

  series: {
    total_profit: yearSeries(model, year, "total_profit"),
    gas_vol: yearSeries(model, year, "gas_vol"),
    sales: yearSeries(model, year, "sales"),
    purchases: yearSeries(model, year, "purchases"),
    gasMargin: marginSeries(model, year),
  },

  departments: departmentRollup(model).map((row) => ({
    name: row.name,
    stores: row.stores,
    sales: row.y2026.sales,
    purchases: row.y2026.purchases,
    profit: row.y2026.profit,
    margin: row.y2026.margin,
  })),
}, null, 1));
