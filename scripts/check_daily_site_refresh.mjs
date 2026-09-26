#!/usr/bin/env node
/**
 * Check the daily-book math against the live overlay and the current
 * budget / vendor-mix / manager files. Does not deploy.
 */
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(
  new URL("../cloudflare/site-daily-refresh/refresh.js", import.meta.url),
  "utf8"
);
const context = vm.createContext({
  console,
  fetch,
  Response,
  Request,
  URL,
  JSON,
  Math,
  Date,
  Object,
  Number,
  String,
  Array,
});
vm.runInContext(code, context);

const headers = { Accept: "application/json", "User-Agent": "ss-daily-refresh-check" };
async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

const overlayPayload = await getJson("https://smartsolutionsai.us/.netlify/functions/books-overlay");
const overlay = overlayPayload.overlay || overlayPayload;
const daily = context.ssBuildDailySeptember(overlay, "2026-09");
const totals = context.ssDailyTotals(daily);
const targets = context.ssRefreshBudgetTargets(
  await getJson("https://smartsolutionsai.us/budget-targets.json?v=check"),
  totals,
  daily
);
const mix = context.ssRefreshVendorMix(
  await getJson("https://smartsolutionsai.us/vendor-mix.json?v=check"),
  totals,
  daily
);
const manager = context.ssRefreshManager(
  await getJson("https://smartsolutionsai.us/data/manager.json?v=check"),
  totals,
  daily.through
);

if ((daily.stations || []).some((st) => String(st.id) === "42642")) {
  throw new Error("La Mesa was included");
}
const paradise = targets.stores["42359"];
if (!paradise || Number(paradise.month_purchase_budget) !== 0) {
  throw new Error("Paradise purchase budget was filled");
}
const rows = Object.values(totals).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
for (const tot of rows) {
  const margin = tot.sales ? ((tot.profit / tot.sales) * 100).toFixed(1) : "—";
  const bud = targets.stores[tot.id];
  const vm = (mix.stores || {})[tot.id];
  const mgr = (manager.stations || []).find((st) => String(st.id) === tot.id);
  const budget = bud ? bud.month_purchase_budget : null;
  const spent = vm ? vm.mtd_total : null;
  const mgrPurch = mgr && mgr.mtd ? mgr.mtd.purchases : null;
  const vendorSpent = vm && Array.isArray(vm.vendors_ranked)
    ? Math.round(vm.vendors_ranked.reduce((sum, v) => sum + Number(v.spent_mtd || 0), 0) * 100) / 100
    : null;
  const vendorBud = vm && Array.isArray(vm.vendors_ranked)
    ? Math.round(vm.vendors_ranked.reduce((sum, v) => sum + Number(v.budget_month || 0), 0) * 100) / 100
    : null;
  console.log(
    [
      tot.id,
      tot.name,
      `margin=${margin}`,
      `sales=${tot.sales}`,
      `purch=${tot.purch}`,
      `eom=${bud ? bud.eom_sales_estimate : "blank"}`,
      `budget=${budget == null ? "blank" : budget}`,
      `mixSpent=${spent == null ? "—" : spent}`,
      `vendorSpent=${vendorSpent == null ? "—" : vendorSpent}`,
      `vendorBud=${vendorBud == null ? "—" : vendorBud}`,
      `mgrPurch=${mgrPurch == null ? "—" : mgrPurch}`,
      `thru=${tot.lastSales}`,
    ].join(" ")
  );
  if (tot.id !== "42359" && tot.id !== "extramile" && bud) {
    const expect = Math.round(tot.sales * (30 / tot.elapsed) * 0.6 * 100) / 100;
    if (Math.abs(bud.month_purchase_budget - expect) > 0.02) {
      throw new Error(`${tot.id} budget ${bud.month_purchase_budget} != ${expect}`);
    }
    if (vm && Math.abs(Number(vm.mtd_total) - tot.purch) > 0.02) {
      throw new Error(`${tot.id} mix spent ${vm.mtd_total} != ${tot.purch}`);
    }
    if (vendorSpent != null && Math.abs(vendorSpent - tot.purch) > 0.05) {
      throw new Error(`${tot.id} vendor spent ${vendorSpent} != ${tot.purch}`);
    }
    if (vendorBud != null && Math.abs(vendorBud - bud.month_purchase_budget) > 0.05) {
      throw new Error(`${tot.id} vendor budget ${vendorBud} != ${bud.month_purchase_budget}`);
    }
  }
  if (mgr && Math.abs(Number(mgr.mtd.purchases) - tot.purch) > 0.02) {
    throw new Error(`${tot.id} manager purch ${mgr.mtd.purchases} != ${tot.purch}`);
  }
  if (mgr && mgr.mtd.yoy && mgr.mtd.yoy.purchases == null && tot.id === "42179") {
    throw new Error("HB last-year purchases were dropped");
  }
}
const laguna = (mix.stores || {})["42073"];
if (laguna && laguna.month_purchase_budget != null) {
  throw new Error("Laguna purchase budget was filled");
}
console.log("through", daily.through, "stations", daily.stations.length, "overlay", overlay.updated_at);
console.log("ok");
