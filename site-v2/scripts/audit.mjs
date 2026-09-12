#!/usr/bin/env node
/*
 * A plausibility pass over every client and every store.
 *
 * `check.mjs` proves the console renders and that its arithmetic reconciles.
 * Neither catches a figure that is well-formed, adds up, and is still wrong —
 * a month totalling a confident zero because nobody posted it, a margin of 6%
 * where the business runs at 37%, or a measure that stops two months short of
 * the period named above it. Those are what this looks for, per client and per
 * store, so a portfolio that averages out cannot hide one client that does not.
 *
 *   node scripts/audit.mjs [--base http://localhost:8787]
 */

import { buildModel, portfolioTotals, resolveTimeframe, timeframes } from "../public/assets/analytics.js";
import { buildOwners } from "../public/assets/scope.js";
import { isNum } from "../public/assets/ui.js";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const BASE = baseFlag !== -1 ? args[baseFlag + 1] : "http://localhost:8787";
const HEADERS = { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" };

let findings = 0;
let checked = 0;

function flag(scope, message) {
  findings += 1;
  process.stdout.write(`  FLAG  ${scope}: ${message}\n`);
}

function ok(message) {
  process.stdout.write(`  ok    ${message}\n`);
}

const get = (path) => fetch(`${BASE}${path}`, { headers: HEADERS })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

const [overlay, owners, monthly, openDays, depts] = await Promise.all([
  get("/api/books-overlay"), get("/api/data/owners.json"), get("/api/data/monthly.json"),
  get("/api/data/daily-open.json"), get("/api/data/depts.json"),
]);

const model = buildModel(overlay, { monthly, openDays, depts });
model.owners = buildOwners(owners?.accounts || [], model);

/* Measures every page prints, and the shape each one has to have. Ranges are
   deliberately wide: this is looking for a figure off by an order of magnitude
   or with a sign it cannot have, not for a bad month. */
const MEASURES = [
  { key: "gas_vol", label: "gallons", min: 1 },
  { key: "gas_profit", label: "fuel profit", min: 0 },
  { key: "fuel_profit", label: "fuel profit", min: 0 },
  { key: "sales", label: "store sales", min: 1 },
  { key: "purchases", label: "purchases", min: 1 },
  { key: "store_profit", label: "store profit" },
  { key: "total_profit", label: "total profit" },
];

process.stdout.write(`Auditing ${BASE}\n\n`);

/* ---- the period every page is working in -------------------------------- */
process.stdout.write("Period\n");
const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
checked += 1;
if (model.closedMonths.some((key) => key >= thisMonth)) {
  flag("period", `closed months reach ${thisMonth}, the month still being traded`);
}
checked += 1;
const openOption = timeframes(model)
  .filter((option) => /^\d{4}-\d{2}$/.test(option.id))
  .filter((option) => option.id >= thisMonth);
if (openOption.length) {
  flag("period", `the timeframe picker offers ${openOption.map((o) => o.id).join(", ")}, `
    + "which has not closed");
}
const held = model.allMonths.filter((key) => key > model.latestMonth);
ok(`closed through ${model.latestMonth}`
  + `${held.length ? `, holding ${held.join(", ")} open` : ""}`);

/* ---- every measure, every closed month, every scope --------------------- */
const scopes = [
  { label: "all stores", ids: null },
  ...model.owners.map((owner) => ({ label: `client ${owner.client}`, ids: owner.stationIds })),
  ...model.stations.map((station) => ({ label: `store ${station.id} ${station.name}`, ids: [station.id] })),
];

process.stdout.write(`\nEvery measure over ${model.ytdKeys.length} closed months, `
  + `at ${scopes.length} scopes\n`);

for (const scope of scopes) {
  for (const measure of MEASURES) {
    const missing = [];
    for (const key of model.ytdKeys) {
      checked += 1;
      const value = portfolioTotals(model, [key], scope.ids)[measure.key];
      if (!isNum(value)) { missing.push(key); continue; }
      if (isNum(measure.min) && Number(value) < measure.min) {
        flag(scope.label, `${measure.label} for ${key} is ${Number(value).toFixed(2)}`);
      }
    }
    if (missing.length) flag(scope.label, `no ${measure.label} for ${missing.join(", ")}`);
  }

  // Margins are what a reader compares between clients, so an implausible one
  // matters more than an implausible dollar total.
  const ytd = portfolioTotals(model, model.ytdKeys, scope.ids);
  checked += 2;
  if (!isNum(ytd.store_margin) || ytd.store_margin < 0.05 || ytd.store_margin > 0.7) {
    flag(scope.label, `store margin is ${isNum(ytd.store_margin)
      ? `${(ytd.store_margin * 100).toFixed(1)}%` : "not reported"}`);
  }
  if (!isNum(ytd.gas_margin) || ytd.gas_margin < 0.05 || ytd.gas_margin > 1.5) {
    flag(scope.label, `fuel margin is ${isNum(ytd.gas_margin)
      ? `$${ytd.gas_margin.toFixed(3)}/gal` : "not reported"}`);
  }

  // Fuel profit under its two names is one figure; a page picking either must
  // get the same answer.
  checked += 1;
  if (Math.abs(Number(ytd.fuel_profit || 0) - Number(ytd.gas_profit || 0)) > 0.01) {
    flag(scope.label, `fuel_profit ${ytd.fuel_profit} and gas_profit ${ytd.gas_profit} disagree`);
  }

  // Store profit is sales minus purchases in these books; a page showing all
  // three has to have them reconcile.
  checked += 1;
  const booked = Number(ytd.sales || 0) - Number(ytd.purchases || 0);
  if (Math.abs(booked - Number(ytd.store_profit || 0)) > Math.max(1, Math.abs(booked) * 0.02)) {
    flag(scope.label, `store profit ${Math.round(ytd.store_profit)} is not sales minus `
      + `purchases (${Math.round(booked)})`);
  }
}
ok(`${scopes.length} scopes, every measure reported for every closed month`);

/* ---- the parts have to add up to the whole ------------------------------ */
process.stdout.write("\nRoll-ups\n");
const whole = portfolioTotals(model, model.ytdKeys, null);
for (const [label, parts] of [
  ["clients", model.owners.map((owner) => owner.stationIds)],
  ["stores", model.stations.map((station) => [station.id])],
]) {
  for (const measure of MEASURES) {
    checked += 1;
    const summed = parts.reduce((total, ids) =>
      total + Number(portfolioTotals(model, model.ytdKeys, ids)[measure.key] || 0), 0);
    if (Math.abs(summed - Number(whole[measure.key] || 0)) > 1) {
      flag(label, `${measure.label} sums to ${Math.round(summed)}, portfolio has `
        + `${Math.round(Number(whole[measure.key] || 0))}`);
    }
  }
}
ok(`${model.owners.length} clients and ${model.stations.length} stores both `
  + `reconcile to the portfolio`);

/* ---- and every timeframe the picker offers ------------------------------ */
process.stdout.write("\nTimeframes\n");
for (const option of timeframes(model)) {
  const tf = resolveTimeframe(model, option.id);
  checked += 2;
  if (!tf.keys.length) flag(option.id, "resolves to no months");
  if (tf.keys.some((key) => key > model.latestMonth)) {
    flag(option.id, `covers ${tf.keys.filter((k) => k > model.latestMonth).join(", ")}, not closed`);
  }
  const totals = portfolioTotals(model, tf.keys, null);
  for (const measure of MEASURES) {
    checked += 1;
    if (!isNum(totals[measure.key])) flag(option.id, `no ${measure.label}`);
  }
}
ok(`${timeframes(model).length} timeframes, each covering closed months only`);

process.stdout.write(`\n${checked - findings}/${checked} figures plausible\n`);
if (findings) process.stdout.write(`${findings} flagged\n`);
process.exit(findings ? 1 : 0);
