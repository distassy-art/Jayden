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
import {
  buildCurrent, currentStores, partitionByPeriod, rollupDeptBudget, rollupMtd,
  rollupWeeks,
} from "../public/assets/current.js";
import { renderDashboard } from "../public/assets/views/dashboard.js";
import { renderStore, renderStores } from "../public/assets/views/stores.js";
import { renderOwner, renderOwners } from "../public/assets/views/owners.js";
import { renderInvoices, renderOrders, renderPricing } from "../public/assets/views/operations.js";
import { renderBilling, renderHealth, renderTickets } from "../public/assets/views/finance.js";
import {
  renderDepartments, renderFuel, renderProfit, renderPurchases, renderRankings,
} from "../public/assets/views/analysis.js";
import { renderDaily } from "../public/assets/views/periods.js";
import { renderBudget } from "../public/assets/views/budget.js";
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

  const [overlay, billing, tickets, days, s2k, orders, pricing, owners, manager] = await Promise.all([
    get("/api/books-overlay"),
    get("/api/billing").catch(() => null),
    get("/api/mgr-tickets").catch(() => null),
    get("/api/mgr-days").catch(() => null),
    get("/api/data/s2k-invoices.json").catch(() => null),
    get("/api/data/vendor-orders.json").catch(() => null),
    get("/api/data/pricing.json").catch(() => null),
    get("/api/data/owners.json").catch(() => null),
    get("/api/data/manager.json").catch(() => null),
  ]);

  const data = { overlay, billing, tickets, days, s2k, orders, pricing, owners, manager, errors: {} };
  const model = buildModel(overlay);
  model.owners = buildOwners(owners?.accounts || [], model);
  const current = buildCurrent(manager);

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

  /*
   * The open month.
   * A part-month next to last year's whole month is the easiest wrong number to
   * publish, so the shape of that comparison is asserted rather than trusted.
   */
  if (current) {
    process.stdout.write("\nOpen month\n");
    assert(current.stores.length > 0, "open month: no stores in the manager feed");

    const known = new Set(model.stations.map((station) => station.id));
    const strangers = current.stores.map((store) => store.id).filter((id) => !known.has(id));
    assert(strangers.length === 0,
      `open month: ${strangers.join(", ")} are not in the books overlay`);

    for (const store of current.stores) {
      // A "Total" row left in the department budget double-counts every line.
      const totals = store.deptBudget.filter((row) => /^total/i.test(row.name));
      assert(totals.length === 0,
        `open month ${store.id}: a total row survived into the department budget`);

      if (store.mtd && store.projection) {
        assert(store.projection.days === store.mtd.days,
          `open month ${store.id}: projection is built off a different day count`);
        assert(store.projection.days < store.projection.daysInMonth,
          `open month ${store.id}: projected a month that is already complete`);
        assert(Number(store.projection.sales) >= Number(store.mtd.sales || 0) - 0.01,
          `open month ${store.id}: pace lands below what is already filed`);
      }

      for (const row of store.deptBudget) {
        if (!Number.isFinite(row.budget)) continue;
        const left = row.budget - row.spent;
        assert(Math.abs(left - row.left) < 0.02,
          `open month ${store.id} ${row.name}: headroom ${row.left} does not equal `
          + `${row.budget} - ${row.spent}`);
      }
    }

    /*
     * Nothing may be summed across two months. A store that has filed nothing
     * since August still reports a full August in `mtd`, and adding that to
     * stores which have filed a week of September gives a total belonging to
     * no month at all.
     */
    const split = partitionByPeriod(current.stores);
    assert(split.filed.every((store) => store.month === current.month),
      "open month: a store outside the open month was counted as filed");
    assert(split.behind.every((store) => store.month !== current.month),
      "open month: a store inside the open month was counted as behind");

    // Roll-ups have to reconcile to the parts they were summed from.
    const all = partitionByPeriod(currentStores(current, { stationIds: null })).filed;
    const rolled = rollupMtd(all);
    if (rolled) {
      const bySales = all.reduce((sum, store) => sum + (store.mtd?.sales || 0), 0);
      assert(Math.abs(rolled.sales - bySales) < 0.02,
        `open month: rolled sales ${rolled.sales} does not equal the ${all.length} parts ${bySales}`);
      assert(rolled.days <= 31, `open month: ${rolled.days} days summed rather than taken as a span`);
      const ratio = rolled.sales ? rolled.purchases / rolled.sales : null;
      assert(Math.abs(ratio - rolled.buy_ratio) < 1e-9,
        "open month: the buy ratio was averaged rather than recomputed");
    }

    const rolledBudget = rollupDeptBudget(all);
    const partsSpent = all.reduce((sum, store) =>
      sum + store.deptBudget.reduce((inner, row) => inner + row.spent, 0), 0);
    const rolledSpent = rolledBudget.reduce((sum, row) => sum + row.spent, 0);
    assert(Math.abs(rolledSpent - partsSpent) < 0.02,
      `open month: rolled spend ${rolledSpent} does not equal the parts ${partsSpent}`);

    const weeks = rollupWeeks(all);
    assert(weeks.every((week, i) => week.index === i),
      "open month: weekly ceilings came back out of order");

    process.stdout.write(`  ok    ${split.filed.length} stores in ${current.month} through `
      + `${current.asOf} (${split.behind.length} behind), ${rolledBudget.length} departments `
      + `budgeted, ${weeks.length} weeks\n`);
  }

  const ctx = (query = "", params = {}) => {
    const search = new URLSearchParams(query);
    return {
      model,
      data,
      query: search,
      params,
      pathname: "/",
      scope: resolveScope(model, search),
      current,
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
  inspect("buy", renderBudget(ctx()));

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
    inspect(`buy scoped to ${owner.id}`, renderBudget(ctx(`owner=${owner.id}`)));
    inspect(`schedule scoped to ${owner.id}`, renderSchedule(ctx(`owner=${owner.id}`)));
  }
  inspect("owner/unknown", renderOwner(ctx("", { id: "no-such-client" })));

  /*
   * Scoping to an owner has to actually narrow the page.
   * These pages each carried their own flat store picker for a while, which
   * silently ignored `owner=` — every check above still passed, because the
   * page rendered fine, just for the wrong seventeen stores. Naming another
   * client's store is the symptom that catches it.
   */
  process.stdout.write("\nOwner scoping narrows the page\n");
  const failuresBefore = failures;
  const scopedViews = [
    ["profit", renderProfit], ["fuel", renderFuel], ["purchases", renderPurchases],
    ["departments", renderDepartments], ["rankings", renderRankings],
    ["daily", renderDaily], ["buy", renderBudget],
  ];
  for (const owner of model.owners) {
    const outside = model.stations
      .filter((station) => !owner.stationIds.includes(station.id))
      .map((station) => station.name)
      .filter((name) => name.length > 3);

    for (const [name, render] of scopedViews) {
      const markup = render(ctx(`owner=${owner.id}`));
      // The scope bar lists every store by design, so it is excluded first.
      const body = markup.replace(/<div class="scopebar[\s\S]*?<\/div>\s*<\/div>/, "");
      const leaked = outside.filter((storeName) => body.includes(`>${storeName}<`));
      assert(leaked.length === 0,
        `${name} scoped to ${owner.id}: names stores outside that client (${leaked.join(", ")})`);
    }
  }
  if (failures === failuresBefore) {
    process.stdout.write(`  ok    ${scopedViews.length} pages narrow correctly for `
      + `${model.owners.length} clients\n`);
  }

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
  const mgrCurrent = buildCurrent(manager, { stores: [single] });
  const mgrCtx = (query = "", params = {}) => {
    const search = new URLSearchParams(query);
    return {
      model: mgrModel,
      data,
      query: search,
      params,
      pathname: "/",
      scope: resolveScope(mgrModel, search),
      current: mgrCurrent,
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
    ["buy", renderBudget(mgrCtx())],
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
  inspect("manager buy", renderBudget(mgrCtx()));
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
  inspect("buy (open month down)", renderBudget(bareCtx));

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
