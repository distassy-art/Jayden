/*
 * Daily close, and the profit and loss statement.
 *
 * The old site had four separate pages — Daily, Weekly, Monthly, Yearly —
 * showing the same report at four grains, numbered like filing steps. Here the
 * grain is a control, so one page answers all four and can also be scoped to a
 * client or a single store.
 */

import {
  barChart, change, dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon,
  isNum, lineChart, money, moneyShort, monthLabel, num, pct, perGallon,
} from "../ui.js";
import {
  MONTH_ABBR, scopeDays, scopeTotals, sumDays, yearSeries,
} from "../analytics.js";
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

/* -------------------------------------------------------------------------
   Profit and loss
   ------------------------------------------------------------------------- */

/** One statement line. `derived` rows are subtotals and are styled apart. */
function line(label, values, { indent = false, derived = false, note = "", format = money, negIsBad = true } = {}) {
  return { label, values, indent, derived, note, format, negIsBad };
}

export function renderPnl(ctx) {
  const { model, scope } = ctx;
  const year = Number(model.currentYear);
  const before = year - 1;

  const ytd = scopeTotals(model, year, scope.stationIds);
  const prior = scopeTotals(model, before, scope.stationIds);

  const fuel = yearSeries(model, year, "fuel_profit", scope.stationIds);
  const sales = yearSeries(model, year, "sales", scope.stationIds);
  const purchases = yearSeries(model, year, "purchases", scope.stationIds);
  const storeProfit = yearSeries(model, year, "store_profit", scope.stationIds);
  const total = yearSeries(model, year, "total_profit", scope.stationIds);

  const at = (series, i) => (isNum(series[i]) ? Number(series[i]) : null);

  /*
   * The feed reports fuel as profit already net of cost, so the statement runs
   * the store side gross-to-net and brings fuel in as a single earned line
   * rather than inventing a fuel revenue figure that is not in the data.
   */
  const rows = [
    line("Store sales", sales, { note: "Merchandise rung up inside the store" }),
    line("Cost of goods bought", purchases, { indent: true, note: "Purchases logged against the store" }),
    line("Store profit", storeProfit, { derived: true, note: "Sales less what was bought" }),
    line("Fuel profit", fuel, { note: "Reported net of fuel cost" }),
    line("Total profit", total, { derived: true, note: "Store plus fuel" }),
  ];

  const ytdOf = (label) => ({
    "Store sales": ytd.sales,
    "Cost of goods bought": ytd.purchases,
    "Store profit": ytd.store_profit,
    "Fuel profit": ytd.fuel_profit,
    "Total profit": ytd.total_profit,
  }[label]);

  const priorOf = (label) => ({
    "Store sales": prior.sales,
    "Cost of goods bought": prior.purchases,
    "Store profit": prior.store_profit,
    "Fuel profit": prior.fuel_profit,
    "Total profit": prior.total_profit,
  }[label]);

  const months = MONTH_ABBR.map((label, i) => ({ label, i }))
    .filter(({ i }) => isNum(total[i]) || isNum(sales[i]));

  const body = rows.map((row) => `<tr class="${row.derived ? "pnl-derived" : ""}">
    <th scope="row" class="${row.indent ? "pnl-indent" : ""}">
      ${esc(row.label)}<span class="cell-sub">${esc(row.note)}</span>
    </th>
    ${months.map(({ i }) => `<td class="num">${esc(row.format(at(row.values, i)))}</td>`).join("")}
    <td class="num strong pnl-total">${esc(row.format(ytdOf(row.label)))}</td>
    <td class="num muted">${esc(row.format(priorOf(row.label)))}</td>
    <td class="num">${deltaBadge(change(ytdOf(row.label), priorOf(row.label)),
      { higherIsBetter: row.label !== "Cost of goods bought" })}</td>
  </tr>`).join("");

  const marginRow = `<tr class="pnl-ratio">
    <th scope="row">Store margin<span class="cell-sub">Store profit as a share of sales</span></th>
    ${months.map(({ i }) => `<td class="num">${esc(pct(isNum(sales[i]) && sales[i]
      ? storeProfit[i] / sales[i] : null))}</td>`).join("")}
    <td class="num strong pnl-total">${esc(pct(ytd.store_margin))}</td>
    <td class="num muted">${esc(pct(prior.store_margin))}</td>
    <td class="num">${deltaBadge(isNum(ytd.store_margin) && isNum(prior.store_margin)
      ? (ytd.store_margin - prior.store_margin) * 100 : null, { suffix: " pts" })}</td>
  </tr>
  <tr class="pnl-ratio">
    <th scope="row">Buy ratio<span class="cell-sub">Bought as a share of sold — the number to hold down</span></th>
    ${months.map(({ i }) => `<td class="num">${esc(pct(isNum(sales[i]) && sales[i]
      ? purchases[i] / sales[i] : null))}</td>`).join("")}
    <td class="num strong pnl-total">${esc(pct(ytd.sales ? ytd.purchases / ytd.sales : null))}</td>
    <td class="num muted">${esc(pct(prior.sales ? prior.purchases / prior.sales : null))}</td>
    <td class="num">${deltaBadge(ytd.sales && prior.sales
      ? ((ytd.purchases / ytd.sales) - (prior.purchases / prior.sales)) * 100 : null,
      { higherIsBetter: false, suffix: " pts" })}</td>
  </tr>`;

  return `
    <div class="page-head">
      <h2>Profit and loss</h2>
      <p>The statement for <b>${esc(scope.label)}</b>, month by month, with the year to date
        against the same months last year. Fuel is reported net of its cost, so it enters as one
        earned line rather than as revenue and cost.</p>
    </div>
    ${scopeBar(model, scope, { period: false })}

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Total profit</div>
        <div class="stat-value">${esc(money(ytd.total_profit))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.total_profit, prior.total_profit))}
          <span>from ${esc(moneyShort(prior.total_profit))}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Store sales</div>
        <div class="stat-value">${esc(money(ytd.sales))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.sales, prior.sales))}
          <span>${esc(pct(ytd.store_margin))} kept as profit</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Bought</div>
        <div class="stat-value">${esc(money(ytd.purchases))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.purchases, prior.purchases), { higherIsBetter: false })}
          <span>${esc(pct(ytd.sales ? ytd.purchases / ytd.sales : null))} of sales</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Fuel profit</div>
        <div class="stat-value">${esc(money(ytd.fuel_profit))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.fuel_profit, prior.fuel_profit))}
          <span>${esc(perGallon(ytd.gas_margin))} on ${esc(num(ytd.gas_vol))} gal</span></div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <h3>${esc(year)} statement</h3>
        <span class="hint">Closed months through ${esc(monthLabel(model.latestMonth, true))}</span>
      </div>
      <div class="table-wrap"><table class="table table-pnl">
        <thead><tr>
          <th>Line</th>
          ${months.map(({ label }) => `<th class="num">${esc(label)}</th>`).join("")}
          <th class="num pnl-total">${esc(year)} YTD</th>
          <th class="num">${esc(before)} YTD</th>
          <th class="num">Change</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="4">${emptyState("No closed months")}</td></tr>`}</tbody>
        <tfoot>${marginRow}</tfoot>
      </table></div>
    </section>`;
}

export function bindPnl(root, ctx) {
  ctx.csv = () => {
    const { model, scope } = ctx;
    const year = Number(model.currentYear);
    const pull = (metric) => yearSeries(model, year, metric, scope.stationIds);
    const series = {
      "Store sales": pull("sales"),
      "Cost of goods bought": pull("purchases"),
      "Store profit": pull("store_profit"),
      "Fuel profit": pull("fuel_profit"),
      "Total profit": pull("total_profit"),
    };
    downloadCsv(`pnl-${year}-${scope.station?.id || scope.owner?.id || "all"}.csv`,
      ["Line", ...MONTH_ABBR],
      Object.entries(series).map(([label, values]) => [label, ...values.map((v) => v ?? "")]));
  };
  bindScopeBar(root, ctx);
}
