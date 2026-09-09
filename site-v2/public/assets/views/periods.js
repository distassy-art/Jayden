/*
 * Daily close: one report at four grains.
 *
 * The old site had four separate pages — Daily, Weekly, Monthly, Yearly —
 * showing the same report at four grains, numbered like filing steps. Here the
 * grain is a control, so one page answers all four and can also be scoped to a
 * client or a single store.
 */

import {
  barChart, change, dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon,
  lineChart, money, monthLabel, num, pct, perGallon,
} from "../ui.js";
import { scopeDays, sumDays } from "../analytics.js";
import {
  bindScopeBar, bucketDays, periodLabel, scopeBar,
} from "../scope.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";
const AMBER = "var(--warn-line)";

/* -------------------------------------------------------------------------
   Daily close
   ------------------------------------------------------------------------- */

export function renderDaily(ctx) {
  const { model, scope } = ctx;
  const rows = scopeDays(model, scope.stationIds);

  const bar = scopeBar(model, scope);

  if (!rows.length) {
    return `<div class="page-head">
        <h2>Daily close</h2>
        <p>What sold, what was bought, and what it left behind, for <b>${esc(scope.label)}</b>.</p>
      </div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("No day-level figures for this scope",
          "Day records are published for the last two months. Monthly figures are on the profit page.")}
      </div></section>`;
  }

  // Day and week read the day feed; month and year roll the same rows up, so
  // every grain reconciles to the same totals.
  const buckets = bucketDays(rows, scope.period);
  const series = buckets.map(([key, days]) => ({ key, ...sumDays(days) }));

  const latest = series[series.length - 1];
  const previous = series[series.length - 2] || null;
  const all = sumDays(rows);

  const covered = `${dateLabel(rows[0].date)} – ${dateLabel(rows[rows.length - 1].date)}`;
  const grain = scope.period === "day" ? "day"
    : scope.period === "week" ? "week"
    : scope.period === "month" ? "month" : "year";

  // Enough bars to read; a two-month window at day grain is 62 of them.
  const window = series.slice(-(scope.period === "day" ? 31 : scope.period === "week" ? 16 : 12));
  const labels = window.map(({ key }) => (scope.period === "day"
    ? dateLabel(key).replace(/,.*$/, "")
    : scope.period === "week" ? dateLabel(key).replace(/,.*$/, "")
    : scope.period === "month" ? monthLabel(key, true) : key));

  const table = series.slice().reverse().map((row) => `<tr>
    <td class="strong">${esc(periodLabel(row.key, scope.period))}</td>
    <td class="num muted">${esc(num(row.days))}</td>
    <td class="num">${esc(num(row.gas_vol))}</td>
    <td class="num">${esc(money(row.gas_profit))}</td>
    <td class="num">${esc(perGallon(row.gas_margin))}</td>
    <td class="num">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.purchases))}</td>
    <td class="num${Number(row.store_profit) < 0 ? " neg-text strong" : ""}">${esc(money(row.store_profit))}</td>
    <td class="num">${esc(pct(row.margin))}</td>
    <td class="num strong">${esc(money(row.total_profit))}</td>
  </tr>`).join("");

  const stat = (label, value, foot, tone = "") => `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone}" style="font-size:23px">${esc(value)}</div>
    <div class="stat-foot">${foot}</div>
  </div>`;

  return `
    <div class="page-head">
      <h2>Daily close</h2>
      <p>What sold, what was bought, and what it left behind for <b>${esc(scope.label)}</b>,
        by ${esc(grain)}. Covering ${esc(covered)}.</p>
    </div>
    ${bar}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${stat(`Latest ${grain}`, periodLabel(latest.key, scope.period),
        `<span class="muted">${esc(num(latest.days))} store-day${latest.days === 1 ? "" : "s"} filed</span>`)}
      ${stat("Store sales", money(latest.sales),
        `${deltaBadge(change(latest.sales, previous?.sales))}<span>on the ${esc(grain)} before</span>`)}
      ${stat("Bought", money(latest.purchases),
        `${deltaBadge(change(latest.purchases, previous?.purchases), { higherIsBetter: false })}
         <span>${esc(pct(latest.sales ? latest.purchases / latest.sales : null))} of sales</span>`)}
      ${stat("Total profit", money(latest.total_profit),
        `${deltaBadge(change(latest.total_profit, previous?.total_profit))}
         <span>${esc(money(latest.gas_profit))} fuel · ${esc(money(latest.store_profit))} store</span>`,
        Number(latest.total_profit) < 0 ? " neg-text" : "")}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3>Sales against purchases</h3>
        <span class="hint">The gap is store profit · last ${esc(window.length)} ${esc(grain)}${window.length === 1 ? "" : "s"}</span>
      </div>
      <div class="card-body">${barChart(labels, [
        { name: "Store sales", color: NAVY, values: window.map((r) => r.sales ?? null) },
        { name: "Purchases", color: AMBER, values: window.map((r) => r.purchases ?? null) },
      ], { height: 250 })}</div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Profit</h3><span class="hint">Fuel and store, stacked by ${esc(grain)}</span></div>
      <div class="card-body">${lineChart(labels, [
        { name: "Total", color: CYAN, values: window.map((r) => r.total_profit ?? null) },
        { name: "Fuel", color: NAVY, values: window.map((r) => r.gas_profit ?? null) },
        { name: "Store", color: AMBER, values: window.map((r) => r.store_profit ?? null) },
      ], { height: 250 })}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Every ${esc(grain)}</h3><span class="hint">Newest first</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>${esc(grain.charAt(0).toUpperCase() + grain.slice(1))}</th>
          <th class="num">Store-days</th><th class="num">Gallons</th><th class="num">Fuel profit</th>
          <th class="num">$/gal</th><th class="num">Sales</th><th class="num">Bought</th>
          <th class="num">Store profit</th><th class="num">Margin</th><th class="num">Total</th>
        </tr></thead>
        <tbody>${table}</tbody>
        <tfoot><tr>
          <td>${esc(series.length)} ${esc(grain)}${series.length === 1 ? "" : "s"}</td>
          <td class="num">${esc(num(all.days))}</td>
          <td class="num">${esc(num(all.gas_vol))}</td>
          <td class="num">${esc(money(all.gas_profit))}</td>
          <td class="num">${esc(perGallon(all.gas_margin))}</td>
          <td class="num">${esc(money(all.sales))}</td>
          <td class="num">${esc(money(all.purchases))}</td>
          <td class="num">${esc(money(all.store_profit))}</td>
          <td class="num">${esc(pct(all.margin))}</td>
          <td class="num">${esc(money(all.total_profit))}</td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

export function bindDaily(root, ctx) {
  ctx.csv = () => {
    const rows = scopeDays(ctx.model, ctx.scope.stationIds);
    const series = bucketDays(rows, ctx.scope.period)
      .map(([key, days]) => ({ key, ...sumDays(days) }));
    downloadCsv(`daily-${ctx.scope.period}-${ctx.scope.station?.id || ctx.scope.owner?.id || "all"}.csv`,
      ["Period", "Store days", "Gallons", "Fuel profit", "$/gal", "Store sales",
        "Purchases", "Store profit", "Store margin", "Total profit"],
      series.map((row) => [row.key, row.days, row.gas_vol ?? "", row.gas_profit ?? "",
        row.gas_margin ?? "", row.sales ?? "", row.purchases ?? "", row.store_profit ?? "",
        row.margin ?? "", row.total_profit ?? ""]));
  };
  bindScopeBar(root, ctx);
}
