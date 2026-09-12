/* Admin command centre: what changed, what needs attention, and where. */

import {
  barList, change, deltaBadge, emptyState, esc, icon, isNum, lineChart,
  money, moneyShort, monthLabel, num, dateLabel, pct, perGallon, sparkline, timeAgo,
} from "../ui.js";
import {
  attentionItems, portfolioSeries, portfolioTotals, scopeDays, stationScorecards, sumDays,
} from "../analytics.js";
import { inScope, invoiceStores } from "../scope.js";
import {
  currentStores, partitionByPeriod, rollupDeptBudget, rollupLastYear,
  rollupMtd, rollupProjection, rollupWeeks,
} from "../current.js";
import { apiUrl, isAdmin } from "../data.js";

const SEVERITY_TONE = { high: "neg", medium: "warn", low: "info" };

function statCard({ label, value, delta, deltaLabel, higherIsBetter = true, spark, tone }) {
  return `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone ? ` ${tone}` : ""}">${esc(value)}</div>
    <div class="stat-foot">
      ${isNum(delta) ? deltaBadge(delta, { higherIsBetter }) : ""}
      <span>${esc(deltaLabel || "")}</span>
    </div>
    ${spark || ""}
  </div>`;
}

function attentionRow(item) {
  const tone = SEVERITY_TONE[item.severity] || "";
  return `<a class="attn" href="${esc(item.href)}">
    <span class="dot ${tone === "neg" ? "neg" : tone === "warn" ? "warn" : ""}"></span>
    <span class="attn-body">
      <b>${esc(item.title)}</b>
      <span class="attn-detail truncate">${esc(item.detail || "")}</span>
    </span>
    ${isNum(item.value) ? `<span class="attn-value num">${esc(money(item.value))}</span>` : ""}
    <span class="badge ${tone}">${esc(item.kind)}</span>
    ${icon("chevron", "ico attn-go")}
  </a>`;
}

/* -------------------------------------------------------------------------
   This month so far, and the days behind it
   -------------------------------------------------------------------------
   The command centre used to open on the last *closed* month, which on the 8th
   of a new month is five weeks stale. These two sections put the running month
   up front: the month-to-date totals for whatever is in scope, and the day-by-
   day sales and purchases that make them up — the table the old manager
   dashboard led with.
   ------------------------------------------------------------------------- */

/** Month-to-date totals for the filed stores in scope, with a pace projection. */
function currentMonthSection(ctx) {
  const { current } = ctx;
  if (!current) return "";
  const filed = partitionByPeriod(currentStores(current, ctx.scope)).filed;
  const mtd = rollupMtd(filed);
  if (!mtd) return "";

  const projection = rollupProjection(filed);
  const lastYear = rollupLastYear(filed);
  const through = mtd.through ? dateLabel(mtd.through) : "";
  const label = current.label || monthLabel(current.month);

  const stat = (labelText, value, foot, tone = "") => `<div class="stat">
    <div class="stat-label">${esc(labelText)}</div>
    <div class="stat-value${tone}" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot">${foot}</div>
  </div>`;

  // A part-month total against last year's whole month is meaningless, so the
  // year-over-year read is only ever put on the pace projection, and labelled.
  //
  // The pace is drawn on fuel profit, not total profit. Total profit needs the
  // store side, and the store side of an open month is only as complete as the
  // invoices keyed into it — pacing it projected the missing paperwork as if it
  // were margin. Fuel is metered daily and complete, so it can be paced.
  const paced = projection && lastYear && lastYear.wholeMonth;
  const pace = paced
    ? `<div class="stat-foot">${deltaBadge(change(projection.gas_profit, lastYear.gas_profit))}
       <span>fuel profit on pace for ${esc(moneyShort(projection.gas_profit))} vs
       ${esc(moneyShort(lastYear.gas_profit))} in ${esc(lastYear.label)}. Store profit settles
       when the books close.</span></div>`
    : `<div class="stat-foot"><span class="muted">Straight-line pace needs a full month last year to compare</span></div>`;

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>This month so far</h3>
      <span class="hint">${esc(label)}${through ? ` · through ${esc(through)}` : ""}${mtd.stores > 1 ? ` · ${esc(num(mtd.stores))} stores filed` : ""}</span>
      <span class="spacer"></span>
      <a class="btn btn-sm btn-ghost" href="#/daily">Daily sales ${icon("chevron")}</a>
    </div>
    <div class="card-body">
      <div class="grid cols-4">
        ${stat("Store sales", money(mtd.sales), `<span class="muted">Merchandise, month to date</span>`)}
        ${stat("Gallons", num(mtd.gas_vol), `<span class="muted">Fuel pumped</span>`)}
        ${stat("Fuel profit", money(mtd.gas_profit),
          `<span class="muted">${esc(perGallon(mtd.gas_margin))} /gal</span>`)}
        ${stat("Purchases keyed", money(mtd.purchases),
          `<span class="muted">${esc(pct(mtd.sales ? mtd.purchases / mtd.sales : null))} of sales so far</span>`)}
      </div>
      ${pace}
    </div>
  </section>`;
}

/* The running month, its straight-line month-end estimate, and both against the
   same month last year — the three reads the manager asked to lead with. The
   year-over-year column is only drawn when last year's *whole* month is on file
   for the stores in scope, so a part-month is never compared to a full one. */
function monthEstimateSection(ctx) {
  const { current } = ctx;
  if (!current) return "";
  const filed = partitionByPeriod(currentStores(current, ctx.scope)).filed;
  const mtd = rollupMtd(filed);
  if (!mtd) return "";

  const projection = rollupProjection(filed);
  const lastYear = rollupLastYear(filed);
  const label = current.label || monthLabel(current.month);
  const through = mtd.through ? dateLabel(mtd.through) : "";
  const canYoY = Boolean(lastYear && lastYear.wholeMonth);

  // Store profit and total profit are left blank for the open month and its
  // estimate. Both are sales minus purchases, and the month's purchases are only
  // the invoices keyed so far — so the figure rises and falls with the paperwork
  // rather than the trade, and pacing it carries that error to month end. Last
  // year's closed column still shows them, because those books are finished.
  const OPEN_MONTH_BLANK = new Set(["store_profit", "total_profit"]);
  // Purchases keyed is a real figure but it measures paperwork, not trade, so it
  // is shown and not paced. A store with nothing keyed yet was otherwise carried
  // to month end as $0 of cost and reported as 100% down on last year.
  const NOT_PACED = new Set(["purchases"]);
  const metrics = [
    ["Store sales", "sales", true],
    ["Purchases keyed", "purchases", false],
    ["Store profit", "store_profit", true],
    ["Fuel profit", "gas_profit", true],
    ["Total profit", "total_profit", true],
  ];
  const neg = (v) => (Number(v) < 0 ? " neg-text" : "");
  const rows = metrics.map(([name, key, higherIsBetter]) => {
    const blank = OPEN_MONTH_BLANK.has(key);
    const cur = blank ? null : mtd[key];
    const est = blank || NOT_PACED.has(key) || !projection ? null : projection[key];
    const ly = lastYear ? lastYear[key] : null;
    const delta = canYoY && isNum(est) && isNum(ly) ? change(est, ly) : null;
    return `<tr>
      <td class="strong">${esc(name)}</td>
      <td class="num${neg(cur)}">${blank ? `<span class="muted" title="Settles when the books close">—</span>` : esc(money(cur))}</td>
      <td class="num strong${neg(est)}">${isNum(est) ? esc(money(est)) : `<span class="muted">—</span>`}</td>
      <td class="num">${isNum(ly) ? esc(money(ly)) : "—"}</td>
      <td class="num">${delta != null ? deltaBadge(delta, { higherIsBetter }) : `<span class="muted">—</span>`}</td>
    </tr>`;
  }).join("");

  const pace = projection
    ? `Estimated at this month's pace — ${esc(num(mtd.days))} of ${esc(num(projection.daysInMonth))} days filed.
       Store profit and total profit are blank until the books close, because the month's
       purchases are only the invoices keyed so far`
    : "The month is essentially complete, so the month-to-date is the month";
  const yoyNote = canYoY
    ? `The last-year column and change compare against ${esc(lastYear.label)}, the whole month.`
    : (lastYear
      ? "Last year's full month isn't on file for every store in view, so the change is left out."
      : "No year-ago figures were reported for this store.");

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>This month &amp; month-end estimate</h3>
      <span class="hint">${esc(label)}${through ? ` · through ${esc(through)}` : ""}</span>
      <span class="spacer"></span>
      <a class="btn btn-sm btn-ghost" href="#/trends">Trends ${icon("chevron")}</a>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Measure</th><th class="num">Month to date</th>
        <th class="num">Est. month end</th>
        <th class="num">${esc(canYoY ? lastYear.label : "Last year")}</th>
        <th class="num">Est. vs last year</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="card-body"><p class="muted tiny" style="margin:0">${pace}. ${yoyNote}</p></div>
  </section>`;
}

/** Day-by-day sales, purchases and profit for the running month, newest first. */
function dailyNumbersSection(ctx) {
  const { model, current } = ctx;
  // Only days whose sales sheet has actually been posted belong here. Fuel
  // volume auto-posts a day or two ahead of the sheet, so the overlay can carry
  // a gas-only day (e.g. today's) with sales still null; showing it would put a
  // dash under "Sales" that reads as missing data. The /daily page filters the
  // same way, so the two views agree on the latest posted day.
  const all = scopeDays(model, ctx.scope.stationIds)
    .filter((row) => isNum(row.sales) && row.sales !== 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!all.length) return "";

  // Prefer the open month. If the stores in scope haven't filed a single day of
  // it yet (a store still closing out last month), fall back to the most recent
  // month they did file, and say so, rather than showing an empty table.
  let month = current?.month || null;
  let rows = month ? all.filter((row) => row.date.slice(0, 7) === month) : all;
  let behind = false;
  if (!rows.length) {
    month = all[0].date.slice(0, 7);
    rows = all.filter((row) => row.date.slice(0, 7) === month);
    behind = true;
  }

  const many = (ctx.scope.count || model.stations.length) > 1;
  const body = rows.map((row) => `<tr>
    <td class="strong">${esc(dateLabel(row.date))}</td>
    ${many ? `<td class="num muted">${esc(num(row.stores))}</td>` : ""}
    <td class="num">${esc(num(row.gas_vol))}</td>
    <td class="num strong">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.gas_profit))}</td>
    <td class="num">${esc(perGallon(row.gas_margin))}</td>
  </tr>`).join("");

  const totals = sumDays(rows);
  const hint = behind
    ? `${monthLabel(month)} · the current month isn't filed for this store yet`
    : `${current?.label || monthLabel(month)} · newest first`;

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>Daily sales</h3>
      <span class="hint">${esc(hint)}</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Day</th>${many ? `<th class="num">Stores</th>` : ""}
        <th class="num">Gallons</th><th class="num">Sales</th>
        <th class="num">Fuel profit</th><th class="num">$/gal</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <td>${esc(behind ? monthLabel(month, true) : "Month to date")}</td>${many ? `<td class="num muted">${esc(num(totals.days))}</td>` : ""}
        <td class="num">${esc(num(totals.gas_vol))}</td>
        <td class="num strong">${esc(money(totals.sales))}</td>
        <td class="num">${esc(money(totals.gas_profit))}</td>
        <td class="num">${esc(perGallon(totals.gas_margin))}</td>
      </tr></tfoot>
    </table></div>
    <div class="card-foot tiny muted">
      A day appears here once its sales sheet is posted; fuel volume can lead store
      sales by a day or two, so the newest fuel day may not be listed yet. Purchases and
      store profit are booked when the month's books close — the month-to-date store
      profit and margin are in <b>This month so far</b> above.
    </div>
  </section>`;
}

/* -------------------------------------------------------------------------
   The manager's own dashboard
   -------------------------------------------------------------------------
   A manager holds one store and lives in the running month, not the closed
   books an owner reads. Their command centre is that store: the month to date,
   the daily sales and purchases, this week's buying ceiling, and the bill for
   the month. Team schedule and payroll timesheets stay on their own pages,
   not on this desk.
   ------------------------------------------------------------------------- */

function managerAlert(store) {
  if (!store?.alert || !store.alert.notes.length) return "";
  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>${esc(store.alert.heading || "Weekly alert")}</h3>
      <span class="hint">${esc(store.alert.storeLine || "")}</span></div>
    <div class="card-body"><ul class="plain-list">
      ${store.alert.notes.map((note) => `<li>${esc(note)}</li>`).join("")}
    </ul></div>
  </section>`;
}

function managerWeeksCard(store) {
  const weeks = (store?.weeks || []).filter((week) => isNum(week.maximum));
  if (!weeks.length) return "";
  const rows = weeks.map((week) => {
    const over = isNum(week.over) ? week.over : null;
    const tone = over != null && over > 0 ? " neg-text" : "";
    return `<tr>
      <td class="strong">${esc(week.label)}</td>
      <td class="num">${esc(money(week.maximum))}</td>
      <td class="num">${esc(week.started ? money(week.actual) : "—")}</td>
      <td class="num${tone}">${week.started && isNum(week.over)
        ? esc((week.over > 0 ? "+" : "") + money(week.over)) : "—"}</td>
    </tr>`;
  }).join("");
  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>This month's buying budget</h3>
      <span class="hint">Weekly purchase ceilings</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Week</th><th class="num">Budget</th><th class="num">Spent</th><th class="num">Over / under</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

/** The manager's own store bill, scoped server-side to their store only. */
function managerBillingCard(data) {
  const billing = data.myBilling;
  if (!billing || !billing.applicable) return "";
  const invoices = billing.invoices || [];

  const statusBadge = (status) => {
    const paid = String(status || "").toLowerCase() === "paid";
    return `<span class="badge ${paid ? "pos" : "warn"}">${esc(paid ? "Paid" : "Unpaid")}</span>`;
  };

  const list = invoices.length
    ? invoices.map((invoice) => `<tr>
        <td class="strong">${esc(monthLabel(invoice.month))}</td>
        <td>${esc(invoice.description || invoice.kind || "Service")}</td>
        <td class="num strong">${esc(money(invoice.total))}</td>
        <td>${statusBadge(invoice.status)}</td>
        <td>${invoice.pdf ? `<a class="btn btn-sm btn-ghost" href="${esc(apiAsset(invoice.pdf))}" target="_blank" rel="noopener">${icon("invoice")}PDF</a>` : ""}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">${emptyState("No invoices yet", "Nothing has been billed to this store.")}</td></tr>`;

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>Your bill</h3>
      <span class="hint">What Smart Solutions has billed this store</span>
    </div>
    <div class="card-body">
      <div class="grid cols-2" style="margin-bottom:12px">
        <div class="stat">
          <div class="stat-label">Outstanding</div>
          <div class="stat-value${billing.unpaidTotal > 0 ? " neg-text" : ""}" style="font-size:22px">${esc(money(billing.unpaidTotal))}</div>
          <div class="stat-foot"><span class="muted">Unpaid across ${esc(num(invoices.filter((i) => String(i.status || "").toLowerCase() !== "paid").length))} invoice(s)</span></div>
        </div>
        <div class="stat">
          <div class="stat-label">Billed in total</div>
          <div class="stat-value" style="font-size:22px">${esc(money(billing.total))}</div>
          <div class="stat-foot"><span class="muted">${esc(num(invoices.length))} invoice(s) on file</span></div>
        </div>
      </div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Month</th><th>What for</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${list}</tbody>
    </table></div>
  </section>`;
}

/** Turn an upstream `/data/...` pdf path into a console asset URL. */
function apiAsset(path) {
  const clean = String(path || "");
  return apiUrl(`/api/asset${clean.startsWith("/") ? "" : "/"}${clean}`);
}

function renderManagerDashboard(ctx) {
  const { model, current } = ctx;
  const store = current?.stores?.[0] || null;
  const name = store?.name || model.stations[0]?.name || "Your store";

  const head = `<div class="page-head">
    <h2>${esc(name)}</h2>
    <p>Where your store stands in <b>${esc(current?.label || "the current month")}</b>.
      ${current?.lastClosedMonth ? `Last closed month was ${esc(current.lastClosedMonth)}.` : ""}</p>
  </div>`;

  return `${head}
    ${currentMonthSection(ctx)}
    ${monthEstimateSection(ctx)}
    ${managerAlert(store)}
    ${dailyNumbersSection(ctx)}
    ${managerWeeksCard(store)}
    ${managerBillingCard(ctx.data)}`;
}

export function renderDashboard(ctx) {
  const { model, data, current } = ctx;

  if (!model.stations.length) {
    return emptyState("No store data available", "The books feed returned no stations.", "health");
  }

  // A manager gets a store-focused command centre; owners and admins get the
  // portfolio one below.
  if (ctx.user && !isAdmin(ctx.user) && ctx.user.role === "manager") {
    return renderManagerDashboard(ctx);
  }

  const { latestMonth, previousMonth, yearAgoMonth, ytdKeys, priorYtdKeys } = model;
  const month = portfolioTotals(model, latestMonth ? [latestMonth] : []);
  const prevMonth = portfolioTotals(model, previousMonth ? [previousMonth] : []);
  const yearAgo = portfolioTotals(model, yearAgoMonth ? [yearAgoMonth] : []);
  const ytd = portfolioTotals(model, ytdKeys);
  const priorYtd = portfolioTotals(model, priorYtdKeys);

  // Trailing window for the sparklines on the stat cards.
  const trail = model.closedMonths.slice(-12);
  const spark = (metric) => sparkline(portfolioSeries(model, trail, metric));

  const cards = [
    statCard({
      label: "Total profit",
      value: money(month.total_profit),
      delta: change(month.total_profit, yearAgo.total_profit),
      deltaLabel: yearAgoMonth ? `vs ${monthLabel(yearAgoMonth, true)}` : "",
      spark: spark("total_profit"),
    }),
    statCard({
      label: "Fuel profit",
      value: money(month.fuel_profit),
      delta: change(month.fuel_profit, yearAgo.fuel_profit),
      deltaLabel: yearAgoMonth ? `vs ${monthLabel(yearAgoMonth, true)}` : "",
      spark: spark("fuel_profit"),
    }),
    statCard({
      label: "Store profit",
      value: money(month.store_profit),
      delta: change(month.store_profit, yearAgo.store_profit),
      deltaLabel: yearAgoMonth ? `vs ${monthLabel(yearAgoMonth, true)}` : "",
      tone: Number(month.store_profit) < 0 ? "neg-text" : "",
      spark: spark("store_profit"),
    }),
    statCard({
      label: "Store margin",
      value: pct(month.store_margin),
      delta: isNum(month.store_margin) && isNum(yearAgo.store_margin)
        ? (Number(month.store_margin) - Number(yearAgo.store_margin)) * 100
        : null,
      deltaLabel: "pts vs last year",
    }),
  ].join("");

  // The feeds arrive whole; the attention list must only rank work for stores
  // this account can see, or a manager is told about another client's invoices.
  // The open month is already limited to stores the account holds; the scope
  // narrows it again to whatever the user is looking at, and stores still
  // sitting on last month are left out so their figures cannot be added in.
  const buyStores = current
    ? partitionByPeriod(currentStores(current, ctx.scope)).filed
    : [];
  const attention = attentionItems(model, {
    ...data,
    buy: buyStores.length ? {
      departments: rollupDeptBudget(buyStores),
      weeks: rollupWeeks(buyStores),
    } : null,
    s2k: data.s2k && {
      ...data.s2k,
      missing: inScope(model, ctx.scope, data.s2k.missing),
      entered: inScope(model, ctx.scope, data.s2k.entered),
    },
    billing: data.billing && {
      ...data.billing,
      invoices: inScope(model, ctx.scope, data.billing.invoices, invoiceStores),
    },
    orders: data.orders && {
      ...data.orders,
      sends: inScope(model, ctx.scope, data.orders.sends),
    },
    pricing: data.pricing && {
      ...data.pricing,
      days: inScope(model, ctx.scope, data.pricing.days),
    },
    tickets: data.tickets && {
      ...data.tickets,
      tickets: inScope(model, ctx.scope, data.tickets.tickets, (row) => row.store ?? row.station_id),
    },
    days: data.days && {
      ...data.days,
      items: inScope(model, ctx.scope, data.days.items, (row) => row.store ?? row.station_id),
    },
  });
  const attentionBody = attention.length
    ? `<div class="attn-list">${attention.map(attentionRow).join("")}</div>`
    : emptyState("Nothing needs attention",
      "Nothing over budget, no missing invoices, no unpaid bills, no open tickets.", "check");

  // Profit trend for the portfolio.
  const trendKeys = model.closedMonths.slice(-18);
  const trend = lineChart(
    trendKeys.map((key) => monthLabel(key, true)),
    [
      { name: "Fuel profit", color: "var(--cyan-500)", values: portfolioSeries(model, trendKeys, "fuel_profit") },
      { name: "Store profit", color: "var(--navy-600)", values: portfolioSeries(model, trendKeys, "store_profit") },
    ],
    { height: 280 },
  );

  // Movers for the latest closed month, against the same month last year.
  const cards2 = stationScorecards(model).filter((card) => card.filed && isNum(card.totalProfitDelta));
  const ranked = cards2.slice().sort((a, b) => b.totalProfitDelta - a.totalProfitDelta);
  const risers = ranked.slice(0, 5).map((card) => ({
    label: card.station.name,
    value: card.totalProfitDelta,
    href: `#/store/${card.station.id}`,
    color: "var(--pos-line)",
  }));
  const fallers = ranked.slice(-5).reverse().map((card) => ({
    label: card.station.name,
    value: card.totalProfitDelta,
    href: `#/store/${card.station.id}`,
    color: "var(--neg-line)",
  }));
  const formatPts = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  const contributors = stationScorecards(model)
    .filter((card) => card.filed && isNum(card.month.total_profit))
    .sort((a, b) => Number(b.month.total_profit) - Number(a.month.total_profit))
    .slice(0, 8)
    .map((card) => ({
      label: card.station.name,
      value: Number(card.month.total_profit),
      href: `#/store/${card.station.id}`,
    }));

  const feedNotes = Object.entries(data.errors || {});

  return `
    <div class="page-head">
      <h2>Command centre</h2>
      <p>${current?.label ? `<b>${esc(current.label)}</b> up top, then the ` : "The "}portfolio position for
      <b>${esc(monthLabel(latestMonth))}</b>, the newest month most stores have closed.
      ${model.updatedAt ? `Books last published ${esc(timeAgo(model.updatedAt))}.` : ""}</p>
    </div>

    ${feedNotes.length ? `<div class="error-box no-print" style="margin-bottom:16px">${icon("alert")}<div>
        <b>Some feeds did not load</b>
        <div>${esc(feedNotes.map(([name, message]) => `${name}: ${message}`).join(" · "))}</div>
        <div class="tiny" style="margin-top:4px">Everything else on this page is still accurate.</div>
      </div></div>` : ""}

    ${currentMonthSection(ctx)}

    <div class="grid cols-4" style="margin-bottom:16px">${cards}</div>

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head">
          <h3>Profit trend</h3>
          <span class="hint">Last ${trendKeys.length} months, all stores</span>
          <span class="spacer"></span>
          <a class="btn btn-sm btn-ghost" href="#/stores">All stores ${icon("chevron")}</a>
        </div>
        <div class="card-body">${trend}</div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Needs attention</h3>
          <span class="spacer"></span>
          ${attention.length ? `<span class="badge ${attention.some((a) => a.severity === "high") ? "neg" : "warn"}">${attention.length}</span>` : `<span class="badge pos">${icon("check")}Clear</span>`}
        </div>
        <div class="card-body flush">${attentionBody}</div>
      </section>
    </div>

    ${dailyNumbersSection(ctx)}

    <div class="grid cols-3">
      <section class="card">
        <div class="card-head"><h3>Biggest gains</h3><span class="hint">vs same month last year</span></div>
        <div class="card-body">${barList(risers, { valueFormat: formatPts, max: Math.max(...ranked.map((c) => Math.abs(c.totalProfitDelta)), 1) })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Biggest drops</h3><span class="hint">vs same month last year</span></div>
        <div class="card-body">${barList(fallers, { valueFormat: formatPts, max: Math.max(...ranked.map((c) => Math.abs(c.totalProfitDelta)), 1) })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Top contributors</h3><span class="hint">${esc(monthLabel(latestMonth, true))} total profit</span></div>
        <div class="card-body">${barList(contributors)}</div>
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <h3>Year to date</h3>
        <span class="hint">${esc(model.currentYear)} through ${esc(monthLabel(latestMonth, true))}, against the same months last year</span>
      </div>
      <div class="card-body">
        <div class="grid cols-4">
          ${ytdSummary("Total profit", ytd.total_profit, priorYtd.total_profit)}
          ${ytdSummary("Fuel profit", ytd.fuel_profit, priorYtd.fuel_profit)}
          ${ytdSummary("Store sales", ytd.sales, priorYtd.sales)}
          ${ytdSummary("Store profit", ytd.store_profit, priorYtd.store_profit)}
        </div>
      </div>
    </section>
  `;
}

function ytdSummary(label, current, prior) {
  return `<div>
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" style="font-size:21px">${esc(money(current))}</div>
    <div class="stat-foot">
      ${deltaBadge(change(current, prior))}
      <span>from ${esc(moneyShort(prior))}</span>
    </div>
  </div>`;
}
