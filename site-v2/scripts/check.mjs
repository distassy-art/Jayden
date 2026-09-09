#!/usr/bin/env node
/*
 * Render every view against real production data and assert the output is sane.
 *
 * The views are pure `state -> HTML string` functions, so they can be exercised
 * in Node without a browser. That catches the failures that actually happen —
 * a missing field formatted as "undefined", a bad number, an unescaped value —
 * before anything is deployed.
 *
 *   node scripts/check.mjs [--base http://localhost:8787]
 */

import { buildModel } from "../public/assets/analytics.js";
import { buildOwners, resolveScope } from "../public/assets/scope.js";
import { renderDashboard } from "../public/assets/views/dashboard.js";
import { renderStore, renderStores } from "../public/assets/views/stores.js";
import { renderOwner, renderOwners } from "../public/assets/views/owners.js";
import { renderInvoices, renderOrders, renderPricing } from "../public/assets/views/operations.js";
import { renderBilling, renderHealth, renderTickets } from "../public/assets/views/finance.js";
import {
  renderDepartments, renderFuel, renderProfit, renderPurchases, renderRankings,
} from "../public/assets/views/analysis.js";
import { renderDaily } from "../public/assets/views/periods.js";
import { renderCalendar, renderSchedule } from "../public/assets/views/planning.js";
import { PUBLIC_ROUTES, renderLogin } from "../public/assets/views/site.js";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const BASE = baseFlag !== -1 ? args[baseFlag + 1] : "http://localhost:8787";

const HEADERS = { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" };

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) {
    failures += 1;
    process.stdout.write(`  FAIL  ${message}\n`);
  }
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
}

/** Values that mean a formatting path was missed somewhere. */
const LEAKS = [
  ["undefined", /(^|[>\s"$])undefined([<\s"]|$)/],
  ["NaN", /(^|[>\s"$])NaN([<\s"%]|$)/],
  ["[object Object]", /\[object Object\]/],
  ["null", /(^|[>\s"$])null([<\s"]|$)/],
];

function inspect(name, markup) {
  // Error notices are legitimately short; anything below this is a broken render.
  assert(typeof markup === "string" && markup.length > 250,
    `${name}: rendered ${typeof markup === "string" ? `${markup.length} chars` : typeof markup}, expected real markup`);

  for (const [label, pattern] of LEAKS) {
    const match = markup.match(pattern);
    assert(!match, `${name}: leaked ${label} — "${markup.slice(Math.max(0, (match?.index || 0) - 60), (match?.index || 0) + 60).replace(/\s+/g, " ")}"`);
  }

  // Every tag that opens must close; a blunt check, but it catches truncation.
  const opens = (markup.match(/<(div|section|table|tbody|thead|tr|td|th|svg)\b/g) || []).length;
  const closes = (markup.match(/<\/(div|section|table|tbody|thead|tr|td|th|svg)>/g) || []).length;
  assert(opens === closes, `${name}: ${opens} opening tags vs ${closes} closing tags`);

  process.stdout.write(`  ok    ${name} (${(markup.length / 1024).toFixed(1)} KB)\n`);
}

async function main() {
  process.stdout.write(`Checking against ${BASE}\n\n`);

  const [overlay, billing, tickets, days, s2k, orders, pricing, owners] = await Promise.all([
    get("/api/books-overlay"),
    get("/api/billing").catch(() => null),
    get("/api/mgr-tickets").catch(() => null),
    get("/api/mgr-days").catch(() => null),
    get("/api/data/s2k-invoices.json").catch(() => null),
    get("/api/data/vendor-orders.json").catch(() => null),
    get("/api/data/pricing.json").catch(() => null),
    get("/api/data/owners.json").catch(() => null),
  ]);

  const data = { overlay, billing, tickets, days, s2k, orders, pricing, owners, errors: {} };
  const model = buildModel(overlay);
  model.owners = buildOwners(owners?.accounts || [], model);

  process.stdout.write("Model\n");
  assert(model.stations.length > 0, "model: no stations parsed");
  assert(Boolean(model.latestMonth), "model: no latest month resolved");
  assert(model.ytdKeys.length > 0, "model: no year-to-date months");

  // A month one store has filed ahead of the rest is a part-month. Letting it
  // into a trend makes the whole portfolio look like it collapsed.
  const ahead = model.closedMonths.filter((key) => key > model.latestMonth);
  assert(ahead.length === 0, `model: closedMonths runs past ${model.latestMonth} (${ahead.join(", ")})`);
  assert(model.ytdKeys.every((key) => key <= model.latestMonth),
    "model: year-to-date includes months beyond the latest closed month");

  // The latest closed month must be one most stores actually filed.
  const filed = model.stations.filter((s) => s.months[model.latestMonth]).length;
  assert(filed >= model.stations.length / 2,
    `model: only ${filed}/${model.stations.length} stations filed ${model.latestMonth}`);

  process.stdout.write(`  ok    ${model.stations.length} stations, latest ${model.latestMonth} `
    + `(${filed} filed), ${model.closedMonths.length} closed months, ${model.ytdKeys.length} YTD\n\n`);

  // Ownership has to partition the portfolio: a store filed under no client, or
  // under two, would silently drop out of or double-count in every roll-up.
  process.stdout.write("\nOwnership\n");
  assert(model.owners.length > 0, "owners: no client groups derived");
  const owned = model.owners.flatMap((owner) => owner.stationIds);
  const duplicated = owned.filter((id, i) => owned.indexOf(id) !== i);
  assert(duplicated.length === 0, `owners: ${duplicated.join(", ")} belong to more than one client`);
  const orphans = model.stations.map((s) => s.id).filter((id) => !owned.includes(id));
  assert(orphans.length === 0, `owners: ${orphans.join(", ")} belong to no client`);
  process.stdout.write(`  ok    ${model.owners.length} clients covering ${owned.length} stores `
    + `(${model.owners.map((o) => `${o.client} ${o.stations.length}`).join(", ")})\n`);

  const ctx = (query = "", params = {}) => {
    const search = new URLSearchParams(query);
    return {
      model,
      data,
      query: search,
      params,
      pathname: "/",
      scope: resolveScope(model, search),
      navigate() {},
    };
  };

  // The public site needs no data at all, which is the point: a dead upstream
  // must not take the front of the site down with it.
  process.stdout.write("\nPublic site\n");
  for (const route of PUBLIC_ROUTES) {
    inspect(`public ${route.path}`, route.render());
  }
  inspect("public /login", renderLogin());
  inspect("public /login (error)", renderLogin("Wrong username or password."));

  process.stdout.write("\nViews\n");
  inspect("dashboard", renderDashboard(ctx()));
  inspect("owners", renderOwners(ctx()));
  inspect("stores", renderStores(ctx()));
  inspect("stores?period=ytd", renderStores(ctx("period=ytd")));
  inspect("stores?sort=margin&dir=asc", renderStores(ctx("sort=margin&dir=asc")));
  inspect("profit", renderProfit(ctx()));
  inspect("fuel", renderFuel(ctx()));
  inspect("purchases", renderPurchases(ctx()));
  inspect("departments", renderDepartments(ctx()));
  inspect("departments?sort=margin", renderDepartments(ctx("sort=margin")));
  inspect("rankings", renderRankings(ctx()));
  inspect("rankings?metric=store_margin", renderRankings(ctx("metric=store_margin")));
  inspect("rankings?metric=gas_margin&period=month", renderRankings(ctx("metric=gas_margin&period=month")));
  inspect("invoices (missing)", renderInvoices(ctx("tab=missing")));
  inspect("invoices (entered)", renderInvoices(ctx("tab=entered")));
  inspect("orders", renderOrders(ctx()));
  inspect("orders (schedule)", renderOrders(ctx("tab=schedule")));
  inspect("pricing", renderPricing(ctx()));
  inspect("billing", renderBilling(ctx()));
  inspect("billing?status=unpaid", renderBilling(ctx("status=unpaid")));
  inspect("tickets", renderTickets(ctx()));
  inspect("health", renderHealth(ctx()));
  inspect("calendar", renderCalendar(ctx()));
  inspect("schedule", renderSchedule(ctx()));

  // Every grain of the daily page, since each buckets the day feed differently.
  for (const period of ["day", "week", "month", "year"]) {
    inspect(`daily?period=${period}`, renderDaily(ctx(`period=${period}`)));
  }

  process.stdout.write("\nOwner detail (every client)\n");
  for (const owner of model.owners) {
    inspect(`owner/${owner.id}`, renderOwner(ctx("", { id: owner.id })));
    inspect(`profit scoped to ${owner.id}`, renderProfit(ctx(`owner=${owner.id}`)));
    inspect(`daily scoped to ${owner.id}`, renderDaily(ctx(`owner=${owner.id}&period=week`)));
    inspect(`calendar scoped to ${owner.id}`, renderCalendar(ctx(`owner=${owner.id}`)));
    inspect(`schedule scoped to ${owner.id}`, renderSchedule(ctx(`owner=${owner.id}`)));
  }
  inspect("owner/unknown", renderOwner(ctx("", { id: "no-such-client" })));

  process.stdout.write("\nStore detail (every station)\n");
  for (const station of model.stations) {
    inspect(`store/${station.id} ${station.name}`, renderStore(ctx("", { id: station.id })));
  }

  // The analysis pages are scoped to one store as often as to the portfolio,
  // and a single store is where sparse data shows up first.
  process.stdout.write("\nAnalysis scoped to a single store\n");
  for (const station of model.stations) {
    const scoped = `store=${station.id}`;
    inspect(`profit ${station.id}`, renderProfit(ctx(scoped)));
    inspect(`fuel ${station.id}`, renderFuel(ctx(scoped)));
    inspect(`purchases ${station.id}`, renderPurchases(ctx(scoped)));
    inspect(`departments ${station.id}`, renderDepartments(ctx(scoped)));
    inspect(`daily ${station.id}`, renderDaily(ctx(scoped)));
    inspect(`schedule ${station.id}`, renderSchedule(ctx(scoped)));
  }

  // A store manager's console is the same code against a one-station model.
  // Every "biggest / smallest / rank" path has a different shape at n=1, which
  // is exactly where a portfolio-shaped assumption breaks.
  process.stdout.write("\nStore manager (single-store model)\n");
  const single = model.stations[0].id;
  const mgrModel = buildModel(overlay, { stores: [single] });
  mgrModel.owners = buildOwners(owners?.accounts || [], mgrModel);
  const mgrCtx = (query = "", params = {}) => {
    const search = new URLSearchParams(query);
    return {
      model: mgrModel,
      data,
      query: search,
      params,
      pathname: "/",
      scope: resolveScope(mgrModel, search),
      navigate() {},
    };
  };
  assert(mgrModel.stations.length === 1,
    `manager model: ${mgrModel.stations.length} stations, expected 1`);

  /*
   * The side feeds arrive whole, covering every client. A manager's pages must
   * not mention a store they do not hold — this is the check that caught the
   * invoice list rendering all seventeen stores' rows.
   */
  const otherIds = model.stations.map((s) => s.id).filter((id) => id !== single);
  const leakScan = [
    ["invoices", renderInvoices(mgrCtx())],
    ["orders", renderOrders(mgrCtx())],
    ["pricing", renderPricing(mgrCtx())],
    ["billing", renderBilling(mgrCtx())],
    ["dashboard", renderDashboard(mgrCtx())],
    ["schedule", renderSchedule(mgrCtx())],
    ["calendar", renderCalendar(mgrCtx())],
  ];
  for (const [name, markup] of leakScan) {
    const leaked = otherIds.filter((id) => markup.includes(id));
    assert(leaked.length === 0,
      `manager ${name}: shows stores the account does not hold (${leaked.join(", ")})`);
  }
  process.stdout.write(`  ok    no other store appears on a manager's pages (${otherIds.length} checked)\n`);
  inspect("manager dashboard", renderDashboard(mgrCtx()));
  inspect("manager store", renderStore(mgrCtx("", { id: single })));
  inspect("manager profit", renderProfit(mgrCtx()));
  inspect("manager fuel", renderFuel(mgrCtx()));
  inspect("manager purchases", renderPurchases(mgrCtx()));
  inspect("manager departments", renderDepartments(mgrCtx()));
  inspect("manager daily", renderDaily(mgrCtx()));
  inspect("manager calendar", renderCalendar(mgrCtx()));
  inspect("manager schedule", renderSchedule(mgrCtx()));
  inspect("manager invoices", renderInvoices(mgrCtx()));
  inspect("manager orders", renderOrders(mgrCtx()));
  inspect("manager tickets", renderTickets(mgrCtx()));

  process.stdout.write("\nDegraded feeds\n");
  const bare = {
    overlay,
    billing: null, tickets: null, days: null, s2k: null, orders: null, pricing: null, owners: null,
    errors: { billing: "boom", s2k: "boom", orders: "boom", pricing: "boom", owners: "boom" },
  };
  const bareModel = buildModel(overlay);
  bareModel.owners = [];
  const bareCtx = {
    model: bareModel,
    data: bare,
    query: new URLSearchParams(),
    params: {},
    pathname: "/",
    scope: resolveScope(bareModel, new URLSearchParams(), { owners: [] }),
    navigate() {},
  };
  inspect("dashboard (no side feeds)", renderDashboard(bareCtx));
  inspect("owners (directory down)", renderOwners(bareCtx));
  inspect("invoices (feed down)", renderInvoices(bareCtx));
  inspect("orders (feed down)", renderOrders(bareCtx));
  inspect("billing (feed down)", renderBilling(bareCtx));
  inspect("health (feeds down)", renderHealth(bareCtx));
  inspect("calendar (feed down)", renderCalendar(bareCtx));
  inspect("schedule (feed down)", renderSchedule(bareCtx));

  process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`);
  if (failures) {
    process.stdout.write(`${failures} failed\n`);
    process.exitCode = 1;
  }
}

main().catch((failure) => {
  process.stdout.write(`\nCheck run failed: ${failure.message}\n`);
  process.exitCode = 1;
});
