#!/usr/bin/env node
/*
 * Dump the figures the console displays, as JSON, so they can be compared
 * against an independent recomputation from the raw feed.
 *
 *   node scripts/dump-model.mjs > /tmp/console-figures.json
 */

import {
  buildModel, departmentRollup, marginSeries, portfolioTotals, resolveTimeframe,
  scopeDays, scopeTotals, sumDays, timeframes, yearSeries,
} from "../public/assets/analytics.js";
import { buildOwners, bucketDays } from "../public/assets/scope.js";

const BASE = process.env.CHECK_BASE || "http://localhost:8787";

const overlay = await fetch(`${BASE}/api/books-overlay`, {
  headers: { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" },
}).then((r) => r.json());

const ownersFeed = await fetch(`${BASE}/api/data/owners.json`, {
  headers: { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" },
}).then((r) => r.json()).catch(() => null);

/*
 * The model has to be built exactly as the browser builds it, extra feeds and
 * all. Dumping a plainer model would leave the verifier checking arithmetic
 * the console never performs.
 */
const side = async (path) => fetch(`${BASE}${path}`, {
  headers: { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" },
}).then((r) => r.json()).catch(() => null);

const monthly = await side("/api/data/monthly.json");
const openDays = await side("/api/data/daily-open.json");

const model = buildModel(overlay, { monthly, openDays });
model.owners = buildOwners(ownersFeed?.accounts || [], model);
const year = Number(model.currentYear);
const prior = year - 1;

const METRICS = ["total_profit", "fuel_profit", "gas_profit", "store_profit",
  "sales", "purchases", "gas_vol", "gas_sales"];

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

  owners: model.owners.map((owner) => ({
    id: owner.id,
    client: owner.client,
    stores: owner.stationIds.slice().sort(),
    ytd: pick(scopeTotals(model, year, owner.stationIds)),
    prior: pick(scopeTotals(model, prior, owner.stationIds)),
  })),

  // Day grain, at each bucket the daily page offers.
  days: Object.fromEntries(["day", "week", "month", "year"].map((period) => [
    period,
    bucketDays(scopeDays(model), period).map(([key, rows]) => {
      const totals = sumDays(rows);
      return {
        key,
        days: totals.days,
        gas_vol: totals.gas_vol ?? null,
        gas_profit: totals.gas_profit ?? null,
        sales: totals.sales ?? null,
        purchases: totals.purchases ?? null,
        store_profit: totals.store_profit ?? null,
        total_profit: totals.total_profit ?? null,
        margin: totals.margin ?? null,
      };
    }),
  ])),

  /*
   * Every timeframe the "Showing" picker offers, resolved to the months it
   * covers and the totals over them. The verifier re-derives both from the raw
   * overlay, so a month that quietly sums its whole year cannot pass.
   */
  timeframes: timeframes(model).map((option) => {
    const tf = resolveTimeframe(model, option.id);
    return {
      id: tf.id,
      kind: tf.kind,
      label: tf.label,
      keys: tf.keys,
      priorKeys: tf.priorKeys,
      totals: pick(portfolioTotals(model, tf.keys)),
      priorTotals: pick(portfolioTotals(model, tf.priorKeys)),
    };
  }),

  departments: departmentRollup(model).map((row) => ({
    name: row.name,
    stores: row.stores,
    sales: row.y2026.sales,
    purchases: row.y2026.purchases,
    profit: row.y2026.profit,
    margin: row.y2026.margin,
  })),
}, null, 1));
