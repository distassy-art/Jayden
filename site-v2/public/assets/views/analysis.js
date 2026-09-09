/*
 * Cross-store analysis: profit, fuel, purchases, departments and rankings.
 *
 * Every page here takes the same scope control — the whole portfolio or one
 * store — and compares the closed months of this year against the same months
 * last year. All figures come from the per-month data, which is complete for
 * every store.
 */

import {
  barChart, barList, change, deltaBadge, downloadCsv, emptyState, esc, icon,
  isNum, lineChart, money, moneyShort, monthLabel, num, pct, perGallon,
} from "../ui.js";
import {
  MONTH_ABBR, departmentPeriods, departmentRollup, marginSeries, scopeOf,
  scopeTotals, yearSeries,
} from "../analytics.js";
import { bindScopeBar, scopeBar } from "../scope.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";
const AMBER = "var(--warn-line)";

/* -------------------------------------------------------------------------
   Shared chrome
   ------------------------------------------------------------------------- */

/*
 * These pages used to carry their own flat store picker, which meant the owner
 * level did not exist on half the console and a scope chosen on one page was
 * dropped on arriving at another. They now use the same bar as everywhere else.
 * `stationIds` is null for the whole portfolio; the roll-ups take an empty
 * array to mean the same thing.
 */
const scopeIds = (scope) => scope.stationIds || [];

/** Wire the scope bar; every analysis page uses it. */
export const bindScope = bindScopeBar;

function kpi(label, value, detail, tone = "") {
  return `<div class="stat" style="min-height:104px">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone === "neg" ? " neg-text" : ""}" style="font-size:23px">${esc(value)}</div>
    <div class="stat-foot">${detail}</div>
  </div>`;
}

function yoyKpi(label, value, current, prior, { higherIsBetter = true, format = moneyShort } = {}) {
  return kpi(label, value,
    `${deltaBadge(change(current, prior), { higherIsBetter })}<span>from ${esc(format(prior))}</span>`,
    isNum(current) && Number(current) < 0 ? "neg" : "");
}

/** Head shared by every analysis page. */
function head(title, blurb, model, scope) {
  return `<div class="page-head">
      <h2>${esc(title)}</h2>
      <p>${blurb}</p>
    </div>
    ${scopeBar(model, scope, { period: false })}
    <p class="tiny muted" style="margin:-6px 0 16px">Closed months, ${esc(model.currentYear)}
      through ${esc(monthLabel(model.latestMonth, true))}, against the same months last year.</p>`;
}

const thisYear = (model) => Number(model.currentYear);
const lastYear = (model) => Number(model.currentYear) - 1;

/* -------------------------------------------------------------------------
   Profit
   ------------------------------------------------------------------------- */

export function renderProfit(ctx) {
  const { model, scope } = ctx;
  const ids = scopeIds(scope);
  const now = thisYear(model);
  const before = lastYear(model);

  const ytd = scopeTotals(model, now, ids);
  const prior = scopeTotals(model, before, ids);

  const total6 = yearSeries(model, now, "total_profit", ids);
  const total5 = yearSeries(model, before, "total_profit", ids);
  const fuel6 = yearSeries(model, now, "fuel_profit", ids);
  const store6 = yearSeries(model, now, "store_profit", ids);

  const filed = MONTH_ABBR
    .map((label, i) => ({ label, value: total6[i] }))
    .filter((row) => isNum(row.value));
  const strongest = filed.slice().sort((a, b) => b.value - a.value)[0];
  const weakest = filed.slice().sort((a, b) => a.value - b.value)[0];

  const mix = MONTH_ABBR.map((label, i) => {
    if (!isNum(total6[i]) && !isNum(total5[i])) return "";
    return `<tr>
      <td class="strong">${esc(label)}</td>
      <td class="num">${esc(money(fuel6[i]))}</td>
      <td class="num${Number(store6[i]) < 0 ? " neg-text" : ""}">${esc(money(store6[i]))}</td>
      <td class="num strong">${esc(money(total6[i]))}</td>
      <td class="num muted">${esc(money(total5[i]))}</td>
      <td class="num">${deltaBadge(change(total6[i], total5[i]))}</td>
    </tr>`;
  }).join("");

  const split = ytd.total_profit
    ? `<div class="split-bar">
        <div class="split-seg" style="width:${((ytd.fuel_profit / ytd.total_profit) * 100).toFixed(1)}%;background:${CYAN}"></div>
        <div class="split-seg" style="width:${((ytd.store_profit / ytd.total_profit) * 100).toFixed(1)}%;background:${NAVY}"></div>
      </div>
      <div class="legend" style="margin-top:10px">
        <span><i style="background:${CYAN}"></i>Fuel ${esc(pct(ytd.fuel_profit / ytd.total_profit, { digits: 0 }))}</span>
        <span><i style="background:${NAVY}"></i>Store ${esc(pct(ytd.store_profit / ytd.total_profit, { digits: 0 }))}</span>
      </div>`
    : "";

  return `${head("Profit", `Fuel against store against total for <b>${esc(scope.label)}</b>.
      Fuel can carry a month while the store quietly loses money, so the split matters as much as the total.`,
    model, scope)}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${yoyKpi("Total profit", money(ytd.total_profit), ytd.total_profit, prior.total_profit)}
      ${yoyKpi("Fuel profit", money(ytd.fuel_profit), ytd.fuel_profit, prior.fuel_profit)}
      ${yoyKpi("Store profit", money(ytd.store_profit), ytd.store_profit, prior.store_profit)}
      ${kpi("Best and worst month",
        strongest ? `${strongest.label} · ${moneyShort(strongest.value)}` : "—",
        `<span class="muted">Weakest ${weakest ? `${esc(weakest.label)} · ${esc(moneyShort(weakest.value))}` : "—"}</span>`)}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Total profit by month</h3><span class="hint">${esc(now)} against ${esc(before)}</span></div>
      <div class="card-body">${barChart(MONTH_ABBR, [
        { name: String(now), color: CYAN, values: total6 },
        { name: String(before), color: NAVY, values: total5 },
      ])}</div>
    </section>

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head"><h3>Where the profit comes from</h3><span class="hint">Month by month</span></div>
        <div class="card-body">${lineChart(MONTH_ABBR, [
          { name: "Fuel profit", color: CYAN, values: fuel6 },
          { name: "Store profit", color: NAVY, values: store6 },
        ], { height: 240 })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Profit mix</h3><span class="hint">Year to date</span></div>
        <div class="card-body">${split || emptyState("No profit recorded")}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h3>Month mix</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Month</th><th class="num">Fuel</th><th class="num">Store</th>
          <th class="num">Total ${esc(now)}</th><th class="num">Total ${esc(before)}</th><th class="num">Change</th></tr></thead>
        <tbody>${mix || `<tr><td colspan="6">${emptyState("No closed months")}</td></tr>`}</tbody>
        <tfoot><tr>
          <td>Year to date</td>
          <td class="num">${esc(money(ytd.fuel_profit))}</td>
          <td class="num">${esc(money(ytd.store_profit))}</td>
          <td class="num">${esc(money(ytd.total_profit))}</td>
          <td class="num">${esc(money(prior.total_profit))}</td>
          <td class="num">${deltaBadge(change(ytd.total_profit, prior.total_profit))}</td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

/* -------------------------------------------------------------------------
   Fuel
   ------------------------------------------------------------------------- */

export function renderFuel(ctx) {
  const { model, scope } = ctx;
  const ids = scopeIds(scope);
  const now = thisYear(model);
  const before = lastYear(model);

  const ytd = scopeTotals(model, now, ids);
  const prior = scopeTotals(model, before, ids);

  const vol6 = yearSeries(model, now, "gas_vol", ids);
  const vol5 = yearSeries(model, before, "gas_vol", ids);
  const profit6 = yearSeries(model, now, "gas_profit", ids);
  const profit5 = yearSeries(model, before, "gas_profit", ids);
  const margin6 = marginSeries(model, now, ids);
  const margin5 = marginSeries(model, before, ids);

  const cpg = (totals) => (totals.gas_vol ? totals.gas_profit / totals.gas_vol : null);
  const latestIndex = margin6.reduce((last, value, i) => (isNum(value) ? i : last), -1);

  const rows = MONTH_ABBR.map((label, i) => {
    if (!isNum(vol6[i]) && !isNum(vol5[i])) return "";
    return `<tr>
      <td class="strong">${esc(label)}</td>
      <td class="num">${esc(num(vol6[i]))}</td>
      <td class="num muted">${esc(num(vol5[i]))}</td>
      <td class="num">${esc(money(profit6[i]))}</td>
      <td class="num muted">${esc(money(profit5[i]))}</td>
      <td class="num strong">${esc(perGallon(margin6[i]))}</td>
      <td class="num muted">${esc(perGallon(margin5[i]))}</td>
      <td class="num">${deltaBadge(isNum(margin6[i]) && isNum(margin5[i])
        ? (margin6[i] - margin5[i]) * 100 : null, { digits: 1, suffix: "¢" })}</td>
    </tr>`;
  }).join("");

  const byStore = !ids.length ? scopeOf(model, null).map((station) => {
    const s6 = scopeTotals(model, now, [station.id]);
    const s5 = scopeTotals(model, before, [station.id]);
    return { station, s6, s5, cpg: cpg(s6) };
  }).filter((row) => isNum(row.s6.gas_vol))
    .sort((a, b) => Number(b.s6.gas_profit) - Number(a.s6.gas_profit)) : [];

  return `${head("Fuel", `Gallons, cents per gallon and fuel profit for <b>${esc(scope.label)}</b>.
      Margin is dollars earned per gallon sold, not a percentage.`, model, scope)}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${yoyKpi("Gallons", num(ytd.gas_vol), ytd.gas_vol, prior.gas_vol, { format: num })}
      ${yoyKpi("Fuel profit", money(ytd.gas_profit), ytd.gas_profit, prior.gas_profit)}
      ${kpi("Margin per gallon", perGallon(cpg(ytd)),
        `${deltaBadge(isNum(cpg(ytd)) && isNum(cpg(prior)) ? (cpg(ytd) - cpg(prior)) * 100 : null, { digits: 1, suffix: "¢" })}
         <span>from ${esc(perGallon(cpg(prior)))}</span>`)}
      ${kpi(`${latestIndex >= 0 ? MONTH_ABBR[latestIndex] : "Latest"} margin`, perGallon(margin6[latestIndex]),
        `${deltaBadge(latestIndex >= 0 && isNum(margin6[latestIndex]) && isNum(margin5[latestIndex])
          ? (margin6[latestIndex] - margin5[latestIndex]) * 100 : null, { digits: 1, suffix: "¢" })}
         <span>vs same month last year</span>`)}
    </div>

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head"><h3>Gallons sold</h3><span class="hint">${esc(now)} against ${esc(before)}</span></div>
        <div class="card-body">${barChart(MONTH_ABBR, [
          { name: String(now), color: CYAN, values: vol6 },
          { name: String(before), color: NAVY, values: vol5 },
        ], { height: 240, valueFormat: (v) => `${Math.round(v / 1000)}K` })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Margin per gallon</h3><span class="hint">Dollars per gallon</span></div>
        <div class="card-body">${lineChart(MONTH_ABBR, [
          { name: String(now), color: CYAN, values: margin6 },
          { name: String(before), color: NAVY, values: margin5 },
        ], { height: 240, valueFormat: perGallon })}</div>
      </section>
    </div>

    <section class="card"${byStore.length ? ' style="margin-bottom:16px"' : ""}>
      <div class="card-head"><h3>Closed months</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Month</th><th class="num">Gallons ${esc(now)}</th><th class="num">Gallons ${esc(before)}</th>
          <th class="num">Profit ${esc(now)}</th><th class="num">Profit ${esc(before)}</th>
          <th class="num">$/gal ${esc(now)}</th><th class="num">$/gal ${esc(before)}</th><th class="num">Change</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8">${emptyState("No fuel figures")}</td></tr>`}</tbody>
        <tfoot><tr><td>Year to date</td>
          <td class="num">${esc(num(ytd.gas_vol))}</td><td class="num">${esc(num(prior.gas_vol))}</td>
          <td class="num">${esc(money(ytd.gas_profit))}</td><td class="num">${esc(money(prior.gas_profit))}</td>
          <td class="num">${esc(perGallon(cpg(ytd)))}</td><td class="num">${esc(perGallon(cpg(prior)))}</td><td></td>
        </tr></tfoot>
      </table></div>
    </section>

    ${byStore.length ? `<section class="card">
      <div class="card-head"><h3>By store</h3><span class="hint">Year to date</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Store</th><th class="num">Gallons</th><th class="num">Fuel profit</th>
          <th class="num">$/gal</th><th class="num">Gallons ${esc(before)}</th><th class="num">vs LY</th></tr></thead>
        <tbody>${byStore.map((row) => `<tr class="is-clickable" data-href="#/store/${esc(row.station.id)}">
          <td><div class="cell-main"><span class="store-tag">${esc(row.station.id)}</span>
            <span class="strong">${esc(row.station.name)}</span></div></td>
          <td class="num">${esc(num(row.s6.gas_vol))}</td>
          <td class="num strong">${esc(money(row.s6.gas_profit))}</td>
          <td class="num">${esc(perGallon(row.cpg))}</td>
          <td class="num muted">${esc(num(row.s5.gas_vol))}</td>
          <td class="num">${deltaBadge(change(row.s6.gas_profit, row.s5.gas_profit))}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>` : ""}`;
}

/* -------------------------------------------------------------------------
   Purchases
   ------------------------------------------------------------------------- */

export function renderPurchases(ctx) {
  const { model, scope } = ctx;
  const ids = scopeIds(scope);
  const now = thisYear(model);
  const before = lastYear(model);

  const ytd = scopeTotals(model, now, ids);
  const prior = scopeTotals(model, before, ids);

  const sales6 = yearSeries(model, now, "sales", ids);
  const purch6 = yearSeries(model, now, "purchases", ids);
  const sales5 = yearSeries(model, before, "sales", ids);
  const purch5 = yearSeries(model, before, "purchases", ids);
  const store6 = yearSeries(model, now, "store_profit", ids);

  const buyRatio = (totals) => (totals.sales ? totals.purchases / totals.sales : null);
  const ratio6 = buyRatio(ytd);
  const ratio5 = buyRatio(prior);

  const rows = MONTH_ABBR.map((label, i) => {
    if (!isNum(sales6[i]) && !isNum(sales5[i])) return "";
    const m6 = isNum(sales6[i]) && sales6[i] ? store6[i] / sales6[i] : null;
    const r6 = isNum(sales6[i]) && sales6[i] ? purch6[i] / sales6[i] : null;
    const r5 = isNum(sales5[i]) && sales5[i] ? purch5[i] / sales5[i] : null;
    return `<tr>
      <td class="strong">${esc(label)}</td>
      <td class="num">${esc(money(sales6[i]))}</td>
      <td class="num">${esc(money(purch6[i]))}</td>
      <td class="num">${esc(pct(r6))}</td>
      <td class="num muted">${esc(pct(r5))}</td>
      <td class="num${Number(store6[i]) < 0 ? " neg-text strong" : ""}">${esc(money(store6[i]))}</td>
      <td class="num">${esc(pct(m6))}</td>
    </tr>`;
  }).join("");

  const overBuying = MONTH_ABBR
    .map((label, i) => {
      const r6 = isNum(sales6[i]) && sales6[i] ? purch6[i] / sales6[i] : null;
      const r5 = isNum(sales5[i]) && sales5[i] ? purch5[i] / sales5[i] : null;
      return isNum(r6) && isNum(r5) && r6 > r5 ? label : null;
    })
    .filter(Boolean);

  return `${head("Purchases", `What was bought against what was sold for <b>${esc(scope.label)}</b>.
      When buying climbs faster than sales, store profit falls — that is the whole buying-control story.`,
    model, scope)}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${yoyKpi("Purchases", money(ytd.purchases), ytd.purchases, prior.purchases, { higherIsBetter: false })}
      ${kpi("Share of sales", pct(ratio6),
        `${deltaBadge(isNum(ratio6) && isNum(ratio5) ? (ratio6 - ratio5) * 100 : null,
          { higherIsBetter: false, suffix: " pts" })}<span>from ${esc(pct(ratio5))}</span>`)}
      ${yoyKpi("Store sales", money(ytd.sales), ytd.sales, prior.sales)}
      ${kpi("Months buying outpaced last year", num(overBuying.length),
        `<span class="muted">${overBuying.length ? esc(overBuying.join(", ")) : "None — buying held"}</span>`,
        overBuying.length > 3 ? "neg" : "")}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3>Sales against purchases</h3>
        <span class="hint">The gap between the two bars is store profit</span>
      </div>
      <div class="card-body">${barChart(MONTH_ABBR, [
        { name: "Store sales", color: NAVY, values: sales6 },
        { name: "Purchases", color: AMBER, values: purch6 },
      ])}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Margin by month</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Month</th><th class="num">Sales</th><th class="num">Purchases</th>
          <th class="num">Buy ratio</th><th class="num">Buy ratio ${esc(before)}</th>
          <th class="num">Store profit</th><th class="num">Margin</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${emptyState("No purchase figures")}</td></tr>`}</tbody>
        <tfoot><tr><td>Year to date</td>
          <td class="num">${esc(money(ytd.sales))}</td>
          <td class="num">${esc(money(ytd.purchases))}</td>
          <td class="num">${esc(pct(ratio6))}</td>
          <td class="num">${esc(pct(ratio5))}</td>
          <td class="num">${esc(money(ytd.store_profit))}</td>
          <td class="num">${esc(pct(ytd.store_margin))}</td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

/* -------------------------------------------------------------------------
   Departments
   ------------------------------------------------------------------------- */

export function renderDepartments(ctx) {
  const { model, scope, query } = ctx;
  const ids = scopeIds(scope);
  const rows = departmentRollup(model, ids);
  const periods = departmentPeriods(model, ids);

  if (!rows.length) {
    return `${head("Departments", "Department performance across the portfolio.", model, scope)}
      <section class="card"><div class="card-body">
        ${emptyState("No department data for this scope", "Department breakdowns are only published for some stores.")}
      </div></section>`;
  }

  const totals = rows.reduce((acc, row) => {
    ["sales", "purchases", "profit"].forEach((field) => {
      acc.y2026[field] += row.y2026[field];
      acc.y2025[field] += row.y2025[field];
    });
    return acc;
  }, { y2026: { sales: 0, purchases: 0, profit: 0 }, y2025: { sales: 0, purchases: 0, profit: 0 } });
  totals.margin6 = totals.y2026.sales ? totals.y2026.profit / totals.y2026.sales : null;
  totals.margin5 = totals.y2025.sales ? totals.y2025.profit / totals.y2025.sales : null;

  const withMargin = rows.filter((row) => isNum(row.y2026.margin) && row.y2026.sales > 0);
  const bestMargin = withMargin.slice().sort((a, b) => b.y2026.margin - a.y2026.margin)[0];
  const slipping = rows.filter((row) => isNum(row.marginPts))
    .slice().sort((a, b) => a.marginPts - b.marginPts)[0];

  const sortKey = query.get("sort") || "profit";
  const sorted = rows.slice().sort((a, b) => {
    if (sortKey === "margin") return (b.y2026.margin || -Infinity) - (a.y2026.margin || -Infinity);
    if (sortKey === "sales") return b.y2026.sales - a.y2026.sales;
    if (sortKey === "change") return (b.marginPts ?? -Infinity) - (a.marginPts ?? -Infinity);
    return b.y2026.profit - a.y2026.profit;
  });

  const table = sorted.map((row) => `<tr>
    <td class="strong">${esc(row.name)}${ids.length ? "" : ` <span class="store-tag">${esc(row.stores)}</span>`}</td>
    <td class="num">${esc(money(row.y2026.sales))}</td>
    <td class="num">${esc(money(row.y2026.purchases))}</td>
    <td class="num${row.y2026.profit < 0 ? " neg-text strong" : ""}">${esc(money(row.y2026.profit))}</td>
    <td class="num strong">${esc(pct(row.y2026.margin))}</td>
    <td class="num muted">${esc(money(row.y2025.profit))}</td>
    <td class="num muted">${esc(pct(row.y2025.margin))}</td>
    <td class="num">${deltaBadge(row.marginPts, { suffix: " pts" })}</td>
  </tr>`).join("");

  const sortLink = (key, label) => {
    const params = new URLSearchParams(query);
    params.set("sort", key);
    return `<button class="${sortKey === key ? "is-active" : ""}" data-sort-href="#/departments?${esc(params.toString())}">${esc(label)}</button>`;
  };

  return `${head("Departments", `How each department earns for <b>${esc(scope.label)}</b>.
      <b>${esc(periods.y2026)}</b> against <b>${esc(periods.y2025)}</b> — these periods are different lengths,
      so compare the margins rather than the dollar totals.`, model, scope)}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${kpi("Departments tracked", num(rows.length),
        `<span class="muted">${ids.length ? "In this store" : `Across ${esc(model.stations.length)} stores`}</span>`)}
      ${kpi("Department profit", money(totals.y2026.profit),
        `${deltaBadge(change(totals.y2026.profit, totals.y2025.profit))}<span>${esc(periods.y2026)}</span>`)}
      ${kpi("Blended margin", pct(totals.margin6),
        `${deltaBadge(isNum(totals.margin6) && isNum(totals.margin5)
          ? (totals.margin6 - totals.margin5) * 100 : null, { suffix: " pts" })}<span>vs ${esc(periods.y2025)}</span>`)}
      ${kpi("Best margin", bestMargin ? bestMargin.name : "—",
        `<span class="muted">${bestMargin ? `${esc(pct(bestMargin.y2026.margin))} on ${esc(moneyShort(bestMargin.y2026.sales))} of sales` : ""}</span>`)}
    </div>

    ${slipping && slipping.marginPts < -1 ? `<div class="error-box" style="margin-bottom:16px">${icon("alert")}<div>
      <b>${esc(slipping.name)} margin fell ${esc(Math.abs(slipping.marginPts).toFixed(1))} points</b>
      <div>Now ${esc(pct(slipping.y2026.margin))}, was ${esc(pct(slipping.y2025.margin))} in ${esc(periods.y2025)}.
        Worth checking the buy price and the shelf price on that category.</div>
    </div></div>` : ""}

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head"><h3>Profit by department</h3><span class="hint">${esc(periods.y2026)}</span></div>
        <div class="card-body">${barList(sorted.slice(0, 12).map((row) => ({
          label: row.name, value: row.y2026.profit,
        })))}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Margin by department</h3><span class="hint">Highest earning first</span></div>
        <div class="card-body">${barList(withMargin.slice(0, 12).map((row) => ({
          label: row.name,
          value: row.y2026.margin * 100,
          color: row.y2026.margin < 0 ? "var(--neg-line)" : "var(--navy-600)",
        })), { valueFormat: (v) => `${v.toFixed(1)}%` })}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <h3>All departments</h3>
        <span class="spacer"></span>
        <div class="segmented" data-dept-sort>
          ${sortLink("profit", "Profit")}${sortLink("margin", "Margin")}
          ${sortLink("sales", "Sales")}${sortLink("change", "Change")}
        </div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Department</th>
          <th class="num">Sales ${esc(periods.y2026)}</th><th class="num">Purchases</th>
          <th class="num">Profit</th><th class="num">Margin</th>
          <th class="num">Profit ${esc(periods.y2025)}</th><th class="num">Margin ${esc(periods.y2025)}</th>
          <th class="num">Change</th>
        </tr></thead>
        <tbody>${table}</tbody>
        <tfoot><tr>
          <td>${esc(rows.length)} departments</td>
          <td class="num">${esc(money(totals.y2026.sales))}</td>
          <td class="num">${esc(money(totals.y2026.purchases))}</td>
          <td class="num">${esc(money(totals.y2026.profit))}</td>
          <td class="num">${esc(pct(totals.margin6))}</td>
          <td class="num">${esc(money(totals.y2025.profit))}</td>
          <td class="num">${esc(pct(totals.margin5))}</td>
          <td></td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

export function bindDepartments(root, ctx) {
  bindScope(root, ctx);
  root.querySelectorAll("[data-sort-href]").forEach((button) => {
    button.addEventListener("click", () => ctx.navigate(button.dataset.sortHref));
  });
}

/* -------------------------------------------------------------------------
   Rankings
   ------------------------------------------------------------------------- */

const RANK_METRICS = [
  { key: "total_profit", label: "Total profit", format: money },
  { key: "fuel_profit", label: "Fuel profit", format: money },
  { key: "store_profit", label: "Store profit", format: money },
  { key: "sales", label: "Store sales", format: money },
  { key: "purchases", label: "Purchases", format: money, higherIsBetter: false },
  { key: "gas_vol", label: "Gallons", format: num },
  { key: "store_margin", label: "Store margin", format: (v) => pct(v), derived: true },
  { key: "gas_margin", label: "Margin per gallon", format: perGallon, derived: true },
];

export function renderRankings(ctx) {
  const { model, query, scope } = ctx;
  const metricKey = query.get("metric") || "total_profit";
  const metric = RANK_METRICS.find((m) => m.key === metricKey) || RANK_METRICS[0];
  const period = query.get("period") === "month" ? "month" : "ytd";

  const now = thisYear(model);
  const before = lastYear(model);

  /*
   * Ranking one store against itself says nothing, so picking a single store
   * ranks it within its owner's stores and marks where it lands. Picking an
   * owner ranks that owner's stores against each other.
   */
  const field = scope.owner ? scope.owner.stations : model.stations;
  const marked = scope.station?.id || "";

  const rows = field.map((station) => {
    const current = period === "month"
      ? station.months[model.latestMonth] || {}
      : scopeTotals(model, now, [station.id]);
    const prior = period === "month"
      ? station.months[model.yearAgoMonth] || {}
      : scopeTotals(model, before, [station.id]);
    return {
      station,
      value: isNum(current[metric.key]) ? Number(current[metric.key]) : null,
      priorValue: isNum(prior[metric.key]) ? Number(prior[metric.key]) : null,
    };
  }).filter((row) => isNum(row.value))
    .sort((a, b) => b.value - a.value);

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const middle = rows.length ? rows[Math.floor(rows.length / 2)] : null;

  const periodLabel = period === "month" ? monthLabel(model.latestMonth) : `${now} year to date`;

  const metricTabs = RANK_METRICS.map((m) => {
    const params = new URLSearchParams(query);
    params.set("metric", m.key);
    return `<button class="${m.key === metricKey ? "is-active" : ""}"
      data-sort-href="#/rankings?${esc(params.toString())}">${esc(m.label)}</button>`;
  }).join("");

  const periodTabs = ["ytd", "month"].map((value) => {
    const params = new URLSearchParams(query);
    params.set("period", value);
    return `<button class="${value === period ? "is-active" : ""}"
      data-sort-href="#/rankings?${esc(params.toString())}">${value === "ytd" ? "Year to date" : esc(monthLabel(model.latestMonth, true))}</button>`;
  }).join("");

  return `
    <div class="page-head">
      <h2>Rankings</h2>
      <p>${esc(scope.owner ? `${scope.owner.client}'s stores` : "Every store")} against each other on
      one measure, for <b>${esc(periodLabel)}</b>.
      Ranking on margin rather than dollars is what surfaces a small store running well and a big one running badly.</p>
    </div>

    ${scopeBar(model, scope, { period: false, csv: false })}

    <div class="analysis-bar">
      <div class="segmented" data-rank>${periodTabs}</div>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-csv>${icon("download")}CSV</button>
    </div>

    <div class="rank-metrics segmented" data-rank>${metricTabs}</div>

    <div class="grid cols-3" style="margin:16px 0">
      ${kpi("Top", best ? best.station.name : "—",
        `<span class="muted">${best ? esc(metric.format(best.value)) : ""}</span>`)}
      ${kpi("Median", middle ? middle.station.name : "—",
        `<span class="muted">${middle ? esc(metric.format(middle.value)) : ""}</span>`)}
      ${kpi("Bottom", worst ? worst.station.name : "—",
        `<span class="muted">${worst ? esc(metric.format(worst.value)) : ""}</span>`)}
    </div>

    <div class="grid split">
      <section class="card">
        <div class="card-head"><h3>${esc(metric.label)}</h3><span class="hint">${esc(periodLabel)}</span></div>
        <div class="card-body">${barList(rows.map((row) => ({
          label: row.station.id === marked ? `${row.station.name} ←` : row.station.name,
          value: metric.key === "store_margin" ? row.value * 100 : row.value,
          href: `#/store/${row.station.id}`,
        })), {
          valueFormat: metric.key === "store_margin"
            ? (v) => `${v.toFixed(1)}%`
            : metric.format,
        })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Against last year</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="num">#</th><th>Store</th><th class="num">${esc(metric.label)}</th><th class="num">vs LY</th></tr></thead>
          <tbody>${rows.map((row, i) => `<tr class="is-clickable" data-href="#/store/${esc(row.station.id)}">
            <td class="num muted">${esc(i + 1)}</td>
            <td><div class="cell-main"><span class="store-tag">${esc(row.station.id)}</span>
              <span class="strong">${esc(row.station.name)}</span></div></td>
            <td class="num strong">${esc(metric.format(row.value))}</td>
            <td class="num">${deltaBadge(metric.derived
              ? (isNum(row.priorValue) ? (row.value - row.priorValue) * 100 : null)
              : change(row.value, row.priorValue),
              { higherIsBetter: metric.higherIsBetter !== false, suffix: metric.derived ? " pts" : "" })}</td>
          </tr>`).join("") || `<tr><td colspan="4">${emptyState("No stores report this measure")}</td></tr>`}</tbody>
        </table></div>
      </section>
    </div>`;
}

export function bindRankings(root, ctx) {
  bindScopeBar(root, ctx);
  root.querySelectorAll("[data-sort-href]").forEach((button) => {
    button.addEventListener("click", () => ctx.navigate(button.dataset.sortHref));
  });
  const csv = root.querySelector("[data-csv]");
  if (csv) {
    csv.addEventListener("click", () => {
      const { model } = ctx;
      downloadCsv(`rankings-${model.currentYear}.csv`,
        ["Store", "Name", "Total profit", "Fuel profit", "Store profit", "Sales", "Purchases", "Gallons", "Store margin", "$/gal"],
        model.stations.map((station) => {
          const t = scopeTotals(model, Number(model.currentYear), [station.id]);
          return [station.id, station.name, t.total_profit ?? "", t.fuel_profit ?? "",
            t.store_profit ?? "", t.sales ?? "", t.purchases ?? "", t.gas_vol ?? "",
            t.store_margin ?? "", t.gas_margin ?? ""];
        }));
    });
  }
}

/* Exported so the router can attach the scope picker to the simpler pages. */
export { scopeIds };
