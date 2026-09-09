/* Admin command centre: what changed, what needs attention, and where. */

import {
  barList, change, deltaBadge, emptyState, esc, icon, isNum, lineChart,
  money, moneyShort, monthLabel, pct, sparkline, timeAgo,
} from "../ui.js";
import {
  attentionItems, portfolioSeries, portfolioTotals, stationScorecards,
} from "../analytics.js";
import { inScope, invoiceStores } from "../scope.js";
import {
  currentStores, partitionByPeriod, rollupDeptBudget, rollupWeeks,
} from "../current.js";
import { isAdmin } from "../data.js";
import { renderTeamSchedule } from "./app.js";

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

export function renderDashboard(ctx) {
  const { model, data, current } = ctx;
  const { latestMonth, previousMonth, yearAgoMonth, ytdKeys, priorYtdKeys } = model;

  if (!model.stations.length) {
    return emptyState("No store data available", "The books feed returned no stations.", "health");
  }

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
      <p>Portfolio position for <b>${esc(monthLabel(latestMonth))}</b>, the newest month most stores have closed.
      ${model.updatedAt ? `Books last published ${esc(timeAgo(model.updatedAt))}.` : ""}</p>
    </div>

    ${feedNotes.length ? `<div class="error-box no-print" style="margin-bottom:16px">${icon("alert")}<div>
        <b>Some feeds did not load</b>
        <div>${esc(feedNotes.map(([name, message]) => `${name}: ${message}`).join(" · "))}</div>
        <div class="tiny" style="margin-top:4px">Everything else on this page is still accurate.</div>
      </div></div>` : ""}

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
    ${ctx.user && !isAdmin(ctx.user) && ctx.user.role === "manager" ? renderTeamSchedule(ctx) : ""}
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
