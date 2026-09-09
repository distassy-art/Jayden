/*
 * Daily sales: one report at four grains.
 *
 * Every store files a sales sheet at the close of each day. This page adds those
 * sheets up and shows them by day, week, month or year — the grain is a control,
 * so one page answers all four and can also be scoped to a client or a single
 * store. (It is not a cash-register close-out; it is the sales-and-profit summary
 * the old site split across four pages: Daily, Weekly, Monthly, Yearly.)
 */

import {
  barChart, change, dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon,
  isNum, lineChart, money, monthLabel, num, pct, perGallon,
} from "../ui.js";
import { portfolioTotals, scopeDays, sumDays } from "../analytics.js";
import { currentStores, rollupMtd } from "../current.js";
import {
  bindScopeBar, bucketDays, periodLabel, scopeBar,
} from "../scope.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";
const DASH = "—";

/*
 * Purchases are booked when a month's books close, not day by day. So the open
 * month's daily sheets arrive with sales but no purchases, which would compute a
 * false 100% store margin and an inflated store and total profit. A period's
 * store side — purchases, store profit, store margin, total profit — is only real
 * once purchases have actually been booked for it, which is what this checks. The
 * true month-to-date store P&L comes from the books feed and is shown separately.
 */
const STORE_SIDE = new Set(["purchases", "store_profit", "total_profit"]);
function storeSettled(totals) {
  return Boolean(totals) && isNum(totals.purchases) && Number(totals.purchases) > 0
    && isNum(totals.store_profit);
}

/* -------------------------------------------------------------------------
   How the same numbers roll up
   -------------------------------------------------------------------------
   The single most useful thing the old site did was print one day, one week,
   one month and the year side by side for the same six measures, so a manager
   could see the day they had just filed as a share of the month it lands in.

   The four columns are not all drawn from the same place, and pretending
   otherwise would be the error worth avoiding. Day, week and month come from
   the daily book, which covers roughly the last quarter. The year comes from
   the closed monthly books, which reach back further than the daily book does.
   Filling the year column from the daily rows instead would show a year that
   started in June.
   ------------------------------------------------------------------------- */

const ROLLUP_ROWS = [
  { key: "total_profit", label: "Total profit", format: money, strong: true },
  { key: "gas_profit", label: "Fuel profit", format: money, alt: "fuel_profit" },
  { key: "store_profit", label: "Store profit", format: money },
  { key: "sales", label: "Store sales", format: money },
  { key: "purchases", label: "Purchases", format: money },
  { key: "gas_vol", label: "Fuel volume", format: num, unit: "gal" },
];

function rollupTable(model, rows, ids) {
  // Reuse the page's own bucketing rather than re-deriving week and month
  // boundaries, so this table cannot drift from the one beneath it.
  const lastOf = (period) => {
    const buckets = bucketDays(rows, period);
    const last = buckets[buckets.length - 1];
    return last ? { key: last[0], ...sumDays(last[1]) } : null;
  };

  const day = lastOf("day");
  const week = lastOf("week");
  const month = lastOf("month");
  const year = portfolioTotals(model, model.ytdKeys, ids && ids.length ? ids : null);

  const columns = [
    { head: "Latest day", sub: day ? periodLabel(day.key, "day") : "—", totals: day },
    { head: "Its week", sub: week ? periodLabel(week.key, "week") : "—", totals: week },
    { head: "Its month", sub: month ? periodLabel(month.key, "month") : "—", totals: month },
    {
      head: "Year so far",
      sub: `${monthLabel(model.ytdKeys[0], true)} – ${monthLabel(model.ytdKeys[model.ytdKeys.length - 1], true)}`,
      totals: year,
      book: true,
    },
  ];

  const body = ROLLUP_ROWS.map((row) => {
    const cells = columns.map((column) => {
      // The open month has no booked purchases yet, so its store side is not
      // real. Show it as pending rather than a false 100%-margin figure.
      if (STORE_SIDE.has(row.key) && !storeSettled(column.totals)) {
        return `<td class="num muted">${DASH}</td>`;
      }
      const source = column.totals || {};
      const value = source[row.key] ?? (row.alt ? source[row.alt] : null);
      const negative = Number(value) < 0;
      return `<td class="num${row.strong ? " strong" : ""}${negative ? " neg-text" : ""}">
        ${esc(row.format(value))}</td>`;
    }).join("");
    return `<tr><td class="strong">${esc(row.label)}${row.unit
      ? ` <span class="muted tiny">${esc(row.unit)}</span>` : ""}</td>${cells}</tr>`;
  }).join("");

  const heads = columns.map((column) => `<th class="num">${esc(column.head)}
    <div class="tiny muted" style="font-weight:500">${esc(column.sub)}</div></th>`).join("");

  const filed = [day, week, month]
    .map((totals, i) => (totals
      ? `${num(totals.days)} store-day${totals.days === 1 ? "" : "s"} in the ${["day", "week", "month"][i]}`
      : null))
    .filter(Boolean).join(", ");

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>Your latest day, rolled up</h3>
      <span class="hint">The same six numbers zoomed out from a day to the year</span>
    </div>
    <div class="card-body" style="padding-bottom:0">
      <p class="muted" style="margin:0 0 12px">Read left to right to zoom out: your most recent
        posted day, the week and the month that day falls in, and the year so far.</p>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th>${heads}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="card-foot tiny muted">
      Gallons, fuel profit and sales come from the posted daily sheets (${esc(filed)}).
      Purchases and store profit are booked when each month's books close, so they show
      only once the month is closed — that is why the day, week and open month read “—” for
      the store side while the year, from the closed books, is complete. A “store-day” is one
      store's sheet for one day.
    </div>
  </section>`;
}

/* -------------------------------------------------------------------------
   Daily sales
   ------------------------------------------------------------------------- */

/*
 * The real month-to-date store P&L, from the closed-books manager feed rather
 * than the daily sheets. Sales, purchases, store profit and the true store
 * margin belong here: the daily table can't carry them because purchases are not
 * booked day by day. Drawn only from stores that have actually filed into the
 * open month, so a store still closing last month doesn't drag the picture back.
 */
function mtdSummary(ctx) {
  const { current, scope } = ctx;
  if (!current) return "";
  const filed = currentStores(current, scope).filter((store) => store.onPeriod);
  const mtd = rollupMtd(filed);
  if (!mtd) return "";

  const label = current.label || "Month to date";
  const through = mtd.through ? dateLabel(mtd.through) : "";
  const stores = mtd.stores || filed.length;
  const neg = (v) => (Number(v) < 0 ? " neg-text" : "");
  const stat = (lbl, value, foot, tone = "") => `<div class="stat">
    <div class="stat-label">${esc(lbl)}</div>
    <div class="stat-value${tone}" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot"><span class="muted">${esc(foot)}</span></div>
  </div>`;

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>This month so far</h3>
      <span class="hint">${esc(label)}${through ? ` · through ${esc(through)}` : ""}${stores > 1 ? ` · ${esc(num(stores))} stores` : ""}</span>
      <span class="spacer"></span>
      <span class="hint">Purchases &amp; store profit from the books</span>
    </div>
    <div class="card-body">
      <div class="grid cols-4">
        ${stat("Store sales", money(mtd.sales), "sold at the register")}
        ${stat("Purchases", money(mtd.purchases), `${pct(mtd.buy_ratio)} of sales`)}
        ${stat("Store profit", money(mtd.store_profit), `${pct(mtd.margin)} store margin`, neg(mtd.store_profit))}
        ${stat("Total profit", money(mtd.total_profit), `incl. ${money(mtd.gas_profit)} fuel`, neg(mtd.total_profit))}
      </div>
    </div>
  </section>`;
}

export function renderDaily(ctx) {
  const { model, scope } = ctx;
  // This page is about days that actually recorded sales — the open operating
  // month. Historical daily sheets carry fuel and purchases but no sales, so a
  // "daily sales" page built on them would be mostly blank; the closed months are
  // covered in full by Monthly totals and the Profit page.
  const rows = scopeDays(model, scope.stationIds).filter((r) => isNum(r.sales) && r.sales !== 0);

  const bar = scopeBar(model, scope);

  if (!rows.length) {
    return `<div class="page-head">
        <h2>Daily sales</h2>
        <p>Day-by-day sales, gallons and fuel profit for the current operating month,
          for <b>${esc(scope.label)}</b>.</p>
      </div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("No daily sales for this scope yet",
          "Daily sales are recorded for the open operating month. For closed months, see Monthly totals or the Profit page.")}
      </div></section>`;
  }

  // Day and week read the day feed; month rolls the same rows up, so every grain
  // reconciles to the same totals.
  const buckets = bucketDays(rows, scope.period);
  const series = buckets.map(([key, days]) => ({ key, ...sumDays(days) }));

  const latest = series[series.length - 1];
  const previous = series[series.length - 2] || null;
  const all = sumDays(rows);

  const covered = `${dateLabel(rows[0].date)} – ${dateLabel(rows[rows.length - 1].date)}`;
  const grain = scope.period === "day" ? "day"
    : scope.period === "week" ? "week"
    : scope.period === "month" ? "month" : "year";
  const title = scope.period === "day" ? "Daily sales"
    : scope.period === "week" ? "Weekly sales"
    : scope.period === "month" ? "Monthly sales" : "Yearly sales";

  // Enough bars to read; a month at day grain is ~31 of them.
  const window = series.slice(-(scope.period === "day" ? 31 : scope.period === "week" ? 16 : 12));
  const labels = window.map(({ key }) => (scope.period === "day"
    ? dateLabel(key).replace(/,.*$/, "")
    : scope.period === "week" ? dateLabel(key).replace(/,.*$/, "")
    : scope.period === "month" ? monthLabel(key, true) : key));

  // The per-period table keeps only what the daily feed reports reliably: fuel
  // (every day) and sales (the open month). Purchases and store profit are not
  // booked day by day, so they live in the month-to-date summary above, drawn
  // from the closed-books feed, rather than being faked here.
  const table = series.slice().reverse().map((row) => `<tr>
    <td class="strong">${esc(periodLabel(row.key, scope.period))}</td>
    <td class="num muted">${esc(num(row.days))}</td>
    <td class="num">${esc(num(row.gas_vol))}</td>
    <td class="num">${esc(money(row.gas_profit))}</td>
    <td class="num">${esc(perGallon(row.gas_margin))}</td>
    <td class="num strong">${esc(money(row.sales))}</td>
  </tr>`).join("");

  const stat = (label, value, foot, tone = "") => `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone}" style="font-size:23px">${esc(value)}</div>
    <div class="stat-foot">${foot}</div>
  </div>`;

  return `
    <div class="page-head">
      <h2>${esc(title)}</h2>
      <p>Day-by-day sales, gallons and fuel profit for the current operating month, for
        <b>${esc(scope.label)}</b>. Purchases and store profit are booked when the month's books
        close, so they appear in <b>This month so far</b> below, not day by day.
        Use the <b>Period</b> buttons above to group by day, week or month. Showing ${esc(covered)}.</p>
    </div>
    ${bar}

    ${mtdSummary(ctx)}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${stat(`Latest ${grain}`, periodLabel(latest.key, scope.period),
        `<span class="muted">${esc(num(latest.days))} store-day${latest.days === 1 ? "" : "s"} filed</span>`)}
      ${stat("Store sales", money(latest.sales),
        `${deltaBadge(change(latest.sales, previous?.sales))}<span>on the ${esc(grain)} before</span>`)}
      ${stat("Gallons", num(latest.gas_vol),
        `${deltaBadge(change(latest.gas_vol, previous?.gas_vol))}<span>fuel pumped</span>`)}
      ${stat("Fuel profit", money(latest.gas_profit),
        `${deltaBadge(change(latest.gas_profit, previous?.gas_profit))}
         <span>${esc(perGallon(latest.gas_margin))} /gal</span>`)}
    </div>

    ${rollupTable(model, rows, scope.stationIds)}

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3>Store sales</h3>
        <span class="hint">By ${esc(grain)} · last ${esc(window.length)} ${esc(grain)}${window.length === 1 ? "" : "s"}</span>
      </div>
      <div class="card-body">${barChart(labels, [
        { name: "Store sales", color: NAVY, values: window.map((r) => r.sales ?? null) },
      ], { height: 250 })}</div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Fuel profit</h3><span class="hint">By ${esc(grain)}, from gallons pumped</span></div>
      <div class="card-body">${lineChart(labels, [
        { name: "Fuel profit", color: CYAN, values: window.map((r) => r.gas_profit ?? null) },
      ], { height: 250 })}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Every ${esc(grain)}</h3><span class="hint">Newest first</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>${esc(grain.charAt(0).toUpperCase() + grain.slice(1))}</th>
          <th class="num" title="One store's sheet for one day">Store-days</th>
          <th class="num">Gallons</th><th class="num">Fuel profit</th>
          <th class="num">$/gal</th><th class="num">Store sales</th>
        </tr></thead>
        <tbody>${table}</tbody>
        <tfoot><tr>
          <td>${esc(series.length)} ${esc(grain)}${series.length === 1 ? "" : "s"}</td>
          <td class="num">${esc(num(all.days))}</td>
          <td class="num">${esc(num(all.gas_vol))}</td>
          <td class="num">${esc(money(all.gas_profit))}</td>
          <td class="num">${esc(perGallon(all.gas_margin))}</td>
          <td class="num strong">${esc(money(all.sales))}</td>
        </tr></tfoot>
      </table></div>
      <div class="card-foot tiny muted">
        Purchases, store profit and store margin settle when the month's books close;
        the current-month figures are in <b>This month so far</b> above, and the closed
        months in full on the Monthly and Profit pages.
      </div>
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
