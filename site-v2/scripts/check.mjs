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

import {
  buildModel, departmentRollup, portfolioTotals, resolveTimeframe,
  scopeDays, shortMonths, storeDays, sumDays, timeframes,
} from "../public/assets/analytics.js";
import { bucketDays, buildOwners, resolveScope } from "../public/assets/scope.js";
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
import { buildVendors } from "../public/assets/vendors.js";
import { renderVendors } from "../public/assets/views/vendors.js";
import { renderTrends } from "../public/assets/views/trends.js";
import { renderLeaks } from "../public/assets/views/leaks.js";
import { renderPayroll } from "../public/assets/views/payroll.js";
import { renderProfile } from "../public/assets/views/profile.js";
import { PUBLIC_ROUTES, renderLogin } from "../public/assets/views/site.js";
import { isNum, money, pct } from "../public/assets/ui.js";

// The trends wall prints margins to one decimal place.
const pctText = (ratio) => pct(ratio, { digits: 1 });

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

  const [overlay, billing, tickets, days, s2k, orders, pricing, owners, manager,
    monthly, vendorSpend, openDays, depts] = await Promise.all([
    get("/api/books-overlay"),
    get("/api/billing").catch(() => null),
    get("/api/mgr-tickets").catch(() => null),
    get("/api/mgr-days").catch(() => null),
    get("/api/data/s2k-invoices.json").catch(() => null),
    get("/api/data/vendor-orders.json").catch(() => null),
    get("/api/data/pricing.json").catch(() => null),
    get("/api/data/owners.json").catch(() => null),
    get("/api/data/manager.json").catch(() => null),
    get("/api/data/monthly.json").catch(() => null),
    get("/api/data/vendor-spend.json").catch(() => null),
    get("/api/data/daily-open.json").catch(() => null),
    get("/api/data/depts.json").catch(() => null),
  ]);

  const data = {
    overlay, billing, tickets, days, s2k, orders, pricing, owners, manager,
    monthly, vendorSpend, openDays, depts, errors: {},
  };
  const model = buildModel(overlay, { monthly, openDays, depts });
  model.owners = buildOwners(owners?.accounts || [], model);
  const current = buildCurrent(manager);
  data.vendors = buildVendors(vendorSpend);

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

  /*
   * Departments must come from the reconciled `depts.json`, not the older
   * snapshot the overlay bundles. That snapshot covered fewer stores on mixed
   * Jan–Jul/YTD spans and put the all-stores beer margin near 58% — almost
   * double the truth. The feed ships its own verified all-stores beer margin,
   * so the rollup is asserted straight against it.
   */
  process.stdout.write("\nDepartments\n");
  if (depts && typeof depts.verified_all_stores_beer_margin === "number") {
    const rollup = departmentRollup(model);
    const beer = rollup.find((row) => row.name.toUpperCase() === "BEER");
    const verified = depts.verified_all_stores_beer_margin;
    assert(Boolean(beer), "departments: no BEER row in the all-stores rollup");
    assert(beer && Math.abs(beer.y2026.margin - verified) < 0.005,
      `departments: all-stores beer margin ${beer ? (beer.y2026.margin * 100).toFixed(2) : "?"}% `
      + `does not match the feed's verified ${(verified * 100).toFixed(2)}% `
      + "(overlay's stale snapshot is being used instead of depts.json)");

    // The feed puts every store on one period; a mix means the stale overlay
    // snapshot leaked back in and a portfolio margin would sum unequal spans.
    const periods = new Set(model.stations
      .filter((station) => station.departments.length)
      .map((station) => station.deptPeriods.y2026));
    assert(periods.size === 1,
      `departments: stores report on mixed period spans (${[...periods].join(", ")})`);

    // A "TOTAL"/metric artifact must never survive into the rollup, or every
    // real department would be counted twice.
    const artifact = rollup.find((row) => /^(total|metric|sales amount)/i.test(row.name));
    assert(!artifact, `departments: an artifact row survived the rollup (${artifact?.name})`);
    process.stdout.write(`  ok — all-stores beer margin ${(beer.y2026.margin * 100).toFixed(2)}%, `
      + `${rollup.length} departments, one period basis (${[...periods][0]})\n`);
  } else {
    process.stdout.write("  skipped — depts.json unavailable\n");
  }

  inspect("rankings", renderRankings(ctx()));
  inspect("rankings?metric=store_margin", renderRankings(ctx("metric=store_margin")));

  /*
   * Every timeframe the picker offers, on every page that carries it. These
   * pages were pinned to the running year, so a month or a finished year is
   * the first thing to break if a series is indexed by calendar position
   * rather than by the selected keys.
   */
  process.stdout.write("\nTimeframes\n");
  const timed = [
    ["profit", renderProfit], ["fuel", renderFuel],
    ["purchases", renderPurchases], ["rankings", renderRankings],
    ["trends", renderTrends],
  ];
  const options = timeframes(model);
  let rendered = 0;
  for (const option of options) {
    for (const [name, render] of timed) {
      const markup = render(ctx(`t=${option.id}`));
      assert(markup.length > 400, `${name} at ${option.id}: rendered almost nothing`);
      assert(!/NaN|undefined|\[object/.test(markup), `${name} at ${option.id}: malformed output`);
      rendered += 1;
    }
  }
  process.stdout.write(`  ok    ${rendered} renders across ${options.length} timeframes\n`);

  /*
   * A timeframe has to actually change the figures. If the picker were wired
   * to nothing the pages would still render, so compare two of them and
   * require the output to differ.
   */
  const months = options.filter((o) => o.group === "Month").slice(0, 2).map((o) => o.id);
  if (months.length === 2) {
    const [a, b] = months.map((id) => renderProfit(ctx(`t=${id}`)));
    assert(a !== b, `profit renders identically for ${months[0]} and ${months[1]}`);
    process.stdout.write(`  ok    ${months[0]} and ${months[1]} differ\n`);
  }

  /*
   * A single month must report that month, not the year it sits in. This is
   * the part-against-whole trap in its other form: the picker says August and
   * the page shows January-through-August.
   */
  const oneMonth = options.find((o) => o.group === "Month");
  if (oneMonth) {
    const tf = resolveTimeframe(model, oneMonth.id);
    assert(tf.keys.length === 1, `${oneMonth.id} resolves to ${tf.keys.length} months, not 1`);
    const direct = portfolioTotals(model, [oneMonth.id], null);
    const viaYtd = portfolioTotals(model, model.ytdKeys, null);
    assert(Math.abs(direct.total_profit) < Math.abs(viaYtd.total_profit),
      `${oneMonth.id} totals match the whole year to date`);
    process.stdout.write(`  ok    ${oneMonth.id} is one month `
      + `(${Math.round(direct.total_profit).toLocaleString()}), not the year\n`);
  }

  /*
   * A finished year takes all twelve of its months, and each is compared with
   * the same month a year earlier rather than with whatever sits alongside it.
   */
  const fullYear = options.find((o) => o.group === "Year" && o.id !== "ytd");
  if (fullYear) {
    const tf = resolveTimeframe(model, fullYear.id);
    assert(tf.keys.length === 12, `${fullYear.id} covers ${tf.keys.length} months, not 12`);
    assert(tf.keys.every((key) => key.startsWith(`${fullYear.id}-`)),
      `${fullYear.id} pulls in months from another year`);
    assert(tf.priorKeys.every((key) => key.startsWith(`${Number(fullYear.id) - 1}-`)),
      `${fullYear.id} compares against something other than the prior year`);
    process.stdout.write(`  ok    ${fullYear.id} covers 12 months, compared with `
      + `${tf.priorKeys.length} from ${Number(fullYear.id) - 1}\n`);
  }
  /*
   * The trends wall exists to put every measure on screen at once, so "it
   * rendered" is not enough — a metric silently dropped would still leave a
   * tidy page. Each expected title must appear, each must bring a chart, and
   * the headline figure must be the same total the Profit page prints, or the
   * two pages disagree about the same months.
   */
  /*
   * The four-grain rollup only means anything if the grains nest: a day sits
   * inside its week, that week inside its month. Sales and gallons cannot go
   * negative, so for those the containment is a hard inequality — profit is
   * excluded because a bad day genuinely can exceed its month.
   *
   * The year column is drawn from the monthly books rather than the daily
   * ones, which is the part most likely to be wired up wrongly, so it is
   * checked to cover at least the month sitting beside it.
   */
  process.stdout.write("\nDay rolls into week rolls into month\n");
  const dayRows = scopeDays(model, null);
  const lastBucket = (period) => {
    const buckets = bucketDays(dayRows, period);
    const last = buckets[buckets.length - 1];
    return last ? { key: last[0], ...sumDays(last[1]) } : null;
  };
  const oneDay = lastBucket("day");
  const itsWeek = lastBucket("week");
  const itsMonth = lastBucket("month");
  const theYear = portfolioTotals(model, model.ytdKeys, null);

  for (const measure of ["sales", "purchases", "gas_vol"]) {
    assert(oneDay[measure] <= itsWeek[measure] + 1,
      `${measure}: the latest day (${Math.round(oneDay[measure])}) exceeds its week `
      + `(${Math.round(itsWeek[measure])})`);
    assert(itsWeek[measure] <= itsMonth[measure] + 1,
      `${measure}: the latest week (${Math.round(itsWeek[measure])}) exceeds its month `
      + `(${Math.round(itsMonth[measure])})`);
  }
  assert(oneDay.days <= itsWeek.days && itsWeek.days <= itsMonth.days,
    "store-days do not nest across the three grains");
  assert(theYear.sales >= itsMonth.sales,
    `year to date sales (${Math.round(theYear.sales)}) are below the latest month `
    + `(${Math.round(itsMonth.sales)}) — the year column is not the monthly books`);
  process.stdout.write(`  ok    ${oneDay.key} (${oneDay.days} store-days) sits inside `
    + `its week (${itsWeek.days}) inside its month (${itsMonth.days}), `
    + `inside ${model.ytdKeys.length} months of books\n`);

  // And the page has to print those figures, not merely compute them.
  const dailyPage = renderDaily(ctx("period=day"));
  assert(dailyPage.includes("Your latest day, rolled up"),
    "daily: the rollup table is missing");
  assert(dailyPage.includes(money(theYear.total_profit)),
    `daily: rollup does not print the year total ${money(theYear.total_profit)}`);
  process.stdout.write(`  ok    the page prints the year column as ${money(theYear.total_profit)}\n`);

  /*
   * Daily purchases are not booked day by day, so the page must not fake a store
   * margin from them. Instead it shows the real month-to-date store P&L from the
   * books feed, and prints that store profit rather than the daily proxy.
   */
  const mtdFiled = currentStores(current, resolveScope(model, new URLSearchParams("period=day")))
    .filter((store) => store.onPeriod);
  const mtd = rollupMtd(mtdFiled);
  if (mtd) {
    assert(dailyPage.includes("This month so far"),
      "daily: the month-to-date store P&L summary is missing");
    assert(dailyPage.includes(money(mtd.store_profit)),
      `daily: does not print the real month-to-date store profit ${money(mtd.store_profit)}`);
    assert(!dailyPage.includes("Sales against purchases"),
      "daily: still shows the misleading sales-against-purchases chart");
    process.stdout.write("  ok    daily shows the real month-to-date store P&L, not a daily proxy\n");
  }

  /*
   * The leaks page rests on one fact about these books: a day's store profit
   * is its sales minus what it bought in, so a delivery day looks like a large
   * loss and is not one. That is asserted here rather than assumed, because if
   * the feed ever started carrying a true daily gross margin the page should be
   * rewritten to use it — and if it does not, nothing on the page may flag a
   * single day.
   */
  /*
   * Fuel revenue is gone, and has to stay gone.
   *
   * It was the one measure whose feed did not cover the months it was shown
   * against — one store in July, none in August — so every figure derived from
   * it carried a caveat about which stores and which months it covered, and a
   * cost of goods that took eight months of profit off six of revenue. A field
   * reappearing upstream must not quietly put the block back.
   */
  process.stdout.write("\nFuel revenue is not reported\n");
  const revenueLeak = model.stations.flatMap((station) => model.closedMonths
    .filter((key) => isNum(station.months[key]?.gas_sales))
    .map((key) => `${station.id} ${key}`));
  assert(revenueLeak.length === 0,
    `fuel revenue: gas_sales is back in the model (${revenueLeak.slice(0, 3).join(", ")})`);
  const fuelPage = renderFuel(ctx());
  for (const page of [["fuel", fuelPage], ["trends", renderTrends(ctx())]]) {
    assert(!/Fuel revenue|Cost of the fuel|Kept from revenue/.test(page[1]),
      `${page[0]}: still shows a fuel revenue figure`);
  }
  process.stdout.write("  ok    no page reports what fuel sold for, only gallons, "
    + "cents per gallon and profit\n");

  /*
   * A month that closed with a fraction of a store's own trade in it.
   *
   * Garden Grove's August closed at 11% of its run rate on 1% of its usual
   * buying — figures that agree with each other, so every reconciliation above
   * passes. They are counted, because nothing here invents a figure a feed does
   * not state, but the page has to name them or a client report goes out on half
   * a month.
   */
  process.stdout.write("\nPart-months\n");
  const short = shortMonths(model);
  for (const row of short) {
    assert(row.sales < row.typical,
      `${row.station.id} ${row.key}: flagged short at ${row.sales} against ${row.typical}`);
    // Both halves short by the same stretch is what a partial posting looks
    // like. A real collapse in sales would not halve the buying with it.
    assert(!isNum(row.purchases) || row.purchases <= row.typical,
      `${row.station.id} ${row.key}: bought a full month against short sales`);
  }
  const healthPage = renderHealth(ctx());
  if (short.length) {
    assert(/Months that closed short/.test(healthPage),
      "health: part-months are not reported");
    for (const row of short) {
      assert(healthPage.includes(money(row.sales)),
        `health: does not name ${row.station.name}'s ${row.key} at ${money(row.sales)}`);
    }
    // And they must still be inside the totals, not quietly dropped.
    const flagged = short.filter((row) => row.key === model.latestMonth);
    for (const row of flagged) {
      const counted = portfolioTotals(model, [row.key], [row.station.id]).sales;
      assert(Math.abs(Number(counted) - row.sales) < 0.01,
        `${row.station.id} ${row.key}: flagged short and then excluded from the totals`);
    }
    process.stdout.write(`  ok    ${short.length} part-months named on data health, `
      + `all still counted (${short.map((r) => `${r.station.name} ${r.key}`).join(", ")})\n`);
  } else {
    process.stdout.write("  ok    no month closed short of its store's run rate\n");
  }

  process.stdout.write("\nLeaks\n");
  // Per store, not summed across them: a date where one store reported sales
  // and another did not breaks the identity in the aggregate without any store
  // having broken it. Scoped to closed months, too: the open month's daily feed
  // reports true store profit (a real margin), not the sales-minus-purchases
  // proxy the closed daily book uses, and it is the closed book the leaks page
  // reasons over.
  const priced = storeDays(model, null)
    .filter((row) => row.date.slice(0, 7) <= model.latestMonth)
    .filter((row) => isNum(row.sales) && isNum(row.purchases) && isNum(row.store_profit));
  const identity = priced.filter((row) =>
    Math.abs(row.store_profit - (row.sales - row.purchases)) < 1).length;
  assert(identity / priced.length > 0.9,
    `daily store profit is no longer sales minus purchases (${identity}/${priced.length})`
    + " — the leaks page assumes it is");
  process.stdout.write(`  ok    daily profit is sales minus purchases on `
    + `${identity}/${priced.length} closed-month dates, so a delivery day is not a loss\n`);

  const leaks = renderLeaks(ctx());
  const singleDayLoss = priced.filter((row) => row.store_profit < 0).length;
  assert(singleDayLoss > 0, "expected some delivery days to look like losses");
  assert(!/days? (in the red|that lost money)/i.test(leaks),
    `leaks: flags single loss-making days, of which delivery timing produces ${singleDayLoss}`);

  // The ratio it leads with has to be the one the rest of the console reports.
  const book = portfolioTotals(model, model.ytdKeys, null);
  const bought = pctText(book.purchases / book.sales);
  assert(leaks.includes(bought), `leaks: bought-per-dollar-sold is not ${bought}`);
  const kept = pctText(book.store_profit / book.sales);
  assert(leaks.includes(kept), `leaks: the kept share is not ${kept}`);
  process.stdout.write(`  ok    leads with ${bought} bought per dollar sold, `
    + `keeping ${kept} — the same margin the trends wall prints\n`);

  process.stdout.write("\nTrends wall\n");
  const wall = renderTrends(ctx());
  const expected = ["Fuel volume", "Fuel margin", "Fuel profit",
    "Store sales", "Purchases", "Store margin", "Store profit", "Total profit"];
  const missingMetric = expected.filter((title) => !wall.includes(`<h3>${title}</h3>`));
  assert(missingMetric.length === 0, `trends: missing ${missingMetric.join(", ")}`);

  /*
   * Closed months only. The wall carried the running month scaled to a full
   * month, and a year-end estimate built on it, above eight columns of actuals.
   * Nothing projected may appear here again, and no chart may reach into a month
   * that has not closed.
   */
  for (const phrase of ["This month so far", "Year-end estimate", "on pace"]) {
    assert(!wall.includes(phrase), `trends: still shows "${phrase}" — closed months only`);
  }
  const openMonth = model.allMonths.filter((key) => key > model.latestMonth);
  assert(openMonth.every((key) => !model.closedMonths.includes(key)),
    `trends: ${openMonth.join(", ")} has not closed but is in the charted months`);
  process.stdout.write(`  ok    closed months only, ${model.latestMonth} back`
    + `${openMonth.length ? `, holding ${openMonth.join(", ")} out` : ""}\n`);

  // Every metric on the wall has to reach the newest closed month. Fuel profit
  // charted as a gap over July and August because the working overlay names it
  // `gas_profit` there and drops `fuel_profit`; both feeds are reconciled now.
  for (const metric of ["fuel_profit", "gas_profit", "gas_vol", "sales",
    "purchases", "store_profit", "total_profit"]) {
    const latest = portfolioTotals(model, [model.latestMonth], null)[metric];
    assert(isNum(latest) && Number(latest) !== 0,
      `${metric}: nothing reported for ${model.latestMonth}`);
    const gaps = model.ytdKeys.filter((key) => !isNum(portfolioTotals(model, [key], null)[metric]));
    assert(gaps.length === 0, `${metric}: no figure for ${gaps.join(", ")}`);
  }
  process.stdout.write(`  ok    every measure reports all ${model.ytdKeys.length} `
    + `closed months of ${model.currentYear}\n`);

  const charts = (wall.match(/class="chart"/g) || []).length;
  assert(charts >= expected.length,
    `trends: ${expected.length} metrics but only ${charts} charts drawn`);

  const ytdTotals = portfolioTotals(model, model.ytdKeys, null);
  const headline = money(ytdTotals.total_profit);
  assert(wall.includes(headline),
    `trends: total profit headline is not ${headline}`);

  process.stdout.write(`  ok    ${expected.length} metrics, ${charts} charts, `
    + `total profit reads ${headline}\n`);

  /*
   * Margins are divided out of summed dollars, not averaged across stores. An
   * averaged store margin lands a couple of points away from the real one, so
   * the page's figure is compared with the ratio recomputed here.
   */
  const trueMargin = ytdTotals.store_profit / ytdTotals.sales;
  assert(wall.includes(pctText(trueMargin)),
    `trends: store margin is not ${pctText(trueMargin)} — likely averaged per store`);
  process.stdout.write(`  ok    store margin ${pctText(trueMargin)} recomputed from totals\n`);

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
  inspect("trends", renderTrends(ctx()));
  inspect("leaks", renderLeaks(ctx()));
  inspect("vendors", renderVendors(ctx()));
  for (const key of (data.vendors?.keys || [])) {
    inspect(`vendors?m=${key}`, renderVendors(ctx(`m=${key}`)));
  }

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
    inspect(`vendors scoped to ${owner.id}`, renderVendors(ctx(`owner=${owner.id}`)));
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
    ["daily", renderDaily], ["buy", renderBudget], ["vendors", renderVendors],
    ["trends", renderTrends], ["leaks", renderLeaks],
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
  const mgrModel = buildModel(overlay, { stores: [single], monthly, openDays, depts });
  mgrModel.owners = buildOwners(owners?.accounts || [], mgrModel);
  const mgrCurrent = buildCurrent(manager, { stores: [single] });
  // A synthetic scoped bill, shaped like /api/billing-mine, so the manager
  // dashboard's billing card is exercised (and checked for leaks).
  const mgrData = {
    ...data,
    billing: null,
    myBilling: {
      ok: true, applicable: true, store: single, month: current?.month || null,
      rate: 750, updatedAt: null,
      invoices: [{
        id: `inv_${single}_demo`, month: current?.month || "2026-09", date: "2026-09-05",
        kind: "s2k_per_line", description: "September 2026 S2K invoicing", status: "unpaid",
        total: 15.1, pdf: null, lines: [],
      }],
      total: 15.1, unpaidTotal: 15.1,
    },
  };
  const mgrUser = { role: "manager", email: "arcodb", client: "Arco DB", stores: [single] };
  const mgrCtx = (query = "", params = {}) => {
    const search = new URLSearchParams(query);
    return {
      user: mgrUser,
      model: mgrModel,
      data: mgrData,
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

  /*
   * Payroll and profiles.
   * The accountant's console is timesheets only, so it must render with no
   * financial feeds and never name the credentials export (admin-only). Profiles
   * render for every console role.
   */
  process.stdout.write("\nPayroll and profiles\n");
  const adminUser = { role: "owner", email: "smartsolutionsai", client: "Smart Solutions AI", stores: [] };
  const acctUser = {
    role: "accountant", email: "accountant", client: "Payroll Accountant", stores: [], accountantId: "acct_default",
  };
  const withUser = (user, query = "") => ({ ...ctx(query), user });

  const acctPage = renderPayroll(withUser(acctUser));
  inspect("payroll (accountant)", acctPage);
  assert(!acctPage.includes("Download logins"),
    "payroll: the accountant must not see the credentials export");
  assert(/id="pay-roster"/.test(acctPage),
    "payroll: the accountant page is missing the per-employee totals container");

  const adminPage = renderPayroll(withUser(adminUser));
  inspect("payroll (admin)", adminPage);
  assert(adminPage.includes("Download logins"),
    "payroll: the admin should see the credentials export");

  inspect("profile (admin)", renderProfile(withUser(adminUser)));
  inspect("profile (manager)", renderProfile(mgrCtx()));
  inspect("profile (accountant)", renderProfile(withUser(acctUser)));
  process.stdout.write("  ok    payroll and profile pages render for admin, accountant and manager\n");

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
