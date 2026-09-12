/*
 * Daily sales: one report at four grains.
 *
 * Every store files a sales sheet at the close of each day. The day and week
 * grains add those sheets up for the open operating month. The month and year
 * grains instead read the closed monthly books, which carry the booked
 * purchases and store profit the daily sheets do not — so those grains show a
 * final store P&L reaching back across every closed month, not just the open
 * one. The grain is a control, so one page answers all four and can be scoped
 * to a client or a single store. (It is not a cash-register close-out; it is
 * the sales-and-profit summary the old site split across four pages: Daily,
 * Weekly, Monthly, Yearly.)
 */

import {
  barChart, change, dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon,
  isNum, lineChart, money, monthLabel, num, pct, perGallon,
} from "../ui.js";
import { buyRatioByStation, portfolioTotals, scopeDays, sumDays } from "../analytics.js";
import { currentStores, purchaseKeying, rollupMtd } from "../current.js";
import {
  bindScopeBar, bucketDays, periodLabel, scopeBar, weekStart,
} from "../scope.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";
const DASH = "—";

/*
 * Purchases are booked when a month's books close, not day by day. So a period's
 * store side — purchases, store profit, store margin, total profit — is only real
 * once the books behind it are closed.
 *
 * This used to be tested by asking whether any purchases had been recorded for
 * the period, which is not the same question. Invoices are keyed in lumps: some
 * days carry a delivery and most carry none, so a day almost always has *some*
 * purchases and never a month's worth. The test passed, and one day of sales was
 * divided by one day of deliveries to make a 67% store margin against the 39%
 * August actually closed at. Only the closed books can answer it, so only the
 * column drawn from them is allowed to.
 */
const STORE_SIDE = new Set(["purchases", "store_profit", "total_profit"]);

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
      // Only the closed books carry a settled store side. Show the rest as
      // pending rather than dividing a day of sales by a day of deliveries.
      if (STORE_SIDE.has(row.key) && !column.book) {
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
 * Where the open month has got to, from the manager feed.
 *
 * This card used to present a month-to-date store P&L and call it the real one,
 * on the reasoning that the manager feed comes from the books. It does not: the
 * feed says of itself "do not treat September as a closed month". Its purchases
 * are the invoices keyed so far, so store profit read $205,580 and a 53.4%
 * margin when the same stores had just closed August at 39.0%.
 *
 * So the card now shows only what the open month can actually support — sales,
 * gallons and fuel profit, all posted daily — and says why the store P&L is not
 * here. Drawn only from stores that have filed into the open month, so a store
 * still closing last month doesn't drag the picture back.
 */
function mtdSummary(ctx) {
  const { current, scope, model } = ctx;
  if (!current) return "";
  const filed = currentStores(current, scope).filter((store) => store.onPeriod);
  const mtd = rollupMtd(filed);
  if (!mtd) return "";

  const label = current.label || "Month to date";
  const through = mtd.through ? dateLabel(mtd.through) : "";
  const stores = mtd.stores || filed.length;
  const stat = (lbl, value, foot) => `<div class="stat">
    <div class="stat-label">${esc(lbl)}</div>
    <div class="stat-value" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot"><span class="muted">${esc(foot)}</span></div>
  </div>`;

  const keying = purchaseKeying(filed, buyRatioByStation(model));
  const behind = keying.behind;
  // The margin the same stores actually closed August at, as the yardstick for
  // the month-to-date cost. Not a target and not a forecast — just the last
  // number that was finished.
  const lastClosed = model.latestMonth
    ? portfolioTotals(model, [model.latestMonth], scope.stationIds?.length ? scope.stationIds : null)
    : null;

  const names = behind.slice(0, 3).map((row) => row.name).join(", ");
  const more = behind.length > 3 ? ` and ${behind.length - 3} more` : "";

  return `<section class="card" style="margin-bottom:16px">
    <div class="card-head">
      <h3>This month so far</h3>
      <span class="hint">${esc(label)}${through ? ` · through ${esc(through)}` : ""}${stores > 1 ? ` · ${esc(num(stores))} stores` : ""}</span>
      <span class="spacer"></span>
      <span class="hint">Sales and fuel are posted daily</span>
    </div>
    <div class="card-body">
      <div class="grid cols-4">
        ${stat("Store sales", money(mtd.sales), "sold at the register")}
        ${stat("Gallons", num(mtd.gas_vol), "fuel pumped")}
        ${stat("Fuel profit", money(mtd.gas_profit), `${perGallon(mtd.gas_margin)} /gal`)}
        ${stat("Purchases keyed", money(mtd.purchases),
          `${pct(mtd.buy_ratio)} of sales so far`)}
      </div>
    </div>
    <div class="card-foot tiny muted">
      Store profit and store margin are not shown for an open month. Sales are posted at the
      close of each day but purchase invoices are keyed later, so subtracting one from the
      other now would overstate profit${keying.shortfall > 0
        ? ` by roughly ${esc(money(keying.shortfall))}` : ""}.
      ${behind.length
        ? `${esc(num(behind.length))} of ${esc(num(keying.counted))} stores have keyed well under
           their usual cost per dollar sold (${esc(names)}${esc(more)}).`
        : "Every store's invoices are keyed close to its usual rate."}
      ${lastClosed && isNum(lastClosed.store_margin)
        ? `${esc(monthLabel(model.latestMonth, true))} closed at
           ${esc(pct(lastClosed.store_margin))} store margin — see the Month grain for the
           finished figures.`
        : "See the Month grain for the finished figures."}
    </div>
  </section>`;
}

/* -------------------------------------------------------------------------
   Which numbers each grain is drawn from
   -------------------------------------------------------------------------
   Day and week bucket the open month's daily sheets — the only place a week can
   be formed, since the monthly books cannot be split back into weeks. The daily
   sheets carry sales and fuel but no booked purchases, so those two grains show
   fuel and store sales and leave the store P&L to "This month so far".

   Month and year come from the closed monthly books, where purchases and store
   profit are actually booked. So those grains carry a real, final store P&L —
   sales, purchases, store profit, margin and total profit — that the daily
   sheets cannot, and they reach back across every closed month rather than only
   the open one. Filling them from the daily feed instead is what made the
   monthly and yearly views show September alone.
   ------------------------------------------------------------------------- */

function bookMonths(model, ids) {
  const stationIds = ids && ids.length ? ids : null;
  return model.closedMonths.map((key) => ({
    key, settled: true, ...portfolioTotals(model, [key], stationIds),
  }));
}

function bookYears(model, ids) {
  const stationIds = ids && ids.length ? ids : null;
  const years = [...new Set(model.closedMonths.map((key) => key.slice(0, 4)))].sort();
  return years.map((year) => {
    const keys = model.closedMonths.filter((key) => key.startsWith(`${year}-`));
    return { key: year, span: keys.length, settled: true, ...portfolioTotals(model, keys, stationIds) };
  });
}

function dailyBuckets(rows, period) {
  return bucketDays(rows, period).map(([key, days]) => ({ key, settled: false, ...sumDays(days) }));
}

/** The series a grain is drawn from; `dailyRows` is the sales-bearing day feed. */
function periodSeries(model, scope, dailyRows) {
  if (scope.period === "month") return bookMonths(model, scope.stationIds);
  if (scope.period === "year") return bookYears(model, scope.stationIds);
  return dailyBuckets(dailyRows, scope.period);
}

export function renderDaily(ctx) {
  const { model, scope } = ctx;
  const bar = scopeBar(model, scope);
  const settled = scope.period === "month" || scope.period === "year";
  const grain = scope.period;
  const grainTitle = grain.charAt(0).toUpperCase() + grain.slice(1);
  const title = grain === "day" ? "Daily sales"
    : grain === "week" ? "Weekly sales"
    : grain === "month" ? "Monthly sales" : "Yearly sales";

  // The open month's daily sheets: day and week bucket these, and the rollup
  // table always reads them regardless of grain.
  const allDays = scopeDays(model, scope.stationIds);
  const dailyRows = allDays.filter((r) => isNum(r.sales) && r.sales !== 0);
  const series = periodSeries(model, scope, dailyRows);
  // Pumps report before sheets do, so there are usually a day or two of metered
  // gallons past the last sheet. Those days are not on this page — a day is only
  // shown once its store side can be stated too — so the page says where fuel has
  // reached rather than looking a couple of days stale for no stated reason.
  const meteredThrough = allDays.length ? allDays[allDays.length - 1].date : null;

  if (!series.length) {
    const message = settled
      ? "No closed monthly books for this scope yet. Day and week grains cover the open operating month."
      : "Daily sales are recorded for the open operating month. For closed months, switch the Period to Month or Year, or see the Profit page.";
    return `<div class="page-head">
        <h2>${esc(title)}</h2>
        <p>Sales, gallons and profit for <b>${esc(scope.label)}</b>.</p>
      </div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("Nothing to show for this scope yet", message)}
      </div></section>`;
  }

  const latest = series[series.length - 1];
  const previous = series[series.length - 2] || null;
  const all = settled
    ? portfolioTotals(model, model.closedMonths, scope.stationIds && scope.stationIds.length ? scope.stationIds : null)
    : sumDays(dailyRows);
  const neg = (v) => (Number(v) < 0 ? " neg-text" : "");

  // Daily sheets are entered a day or two behind, and some stores fall further
  // behind than that. When a store has not filed in a while, its "latest" day or
  // week is genuinely old — not a bug — so the page says so rather than letting a
  // three-week-old week read as this week. The month-to-date summary, which comes
  // from a separate feed, stays current regardless.
  const nowIso = new Date().toISOString().slice(0, 10);
  const lastIso = settled ? null : dailyRows[dailyRows.length - 1].date;
  const daysBehind = lastIso
    ? Math.round((Date.parse(`${nowIso}T00:00:00Z`) - Date.parse(`${lastIso}T00:00:00Z`)) / 86400000)
    : 0;
  const stale = !settled && daysBehind >= 3;
  // The current week is "in progress" until all seven days are in; comparing a
  // two-day week against a full one would read as a crash, so its delta is held.
  const currentKey = grain === "week" ? weekStart(nowIso) : grain === "day" ? nowIso : null;
  const partial = !settled && grain === "week" && latest.key === currentKey && (latest.dates || 0) < 7;

  const staleNote = stale
    ? `<section class="card" style="margin-bottom:16px">
        <div class="card-body" style="display:flex;gap:10px;align-items:flex-start">
          ${icon("alert")}
          <div>
            <b>Daily sheets are behind for ${esc(scope.label)}.</b>
            <div class="muted" style="margin-top:2px">The most recent daily sheet was filed
              ${esc(dateLabel(lastIso))}, ${esc(num(daysBehind))} days ago, so the latest ${esc(grain)}
              shown is that ${esc(grain)} — not this one.${meteredThrough && meteredThrough > lastIso
                ? ` Gallons are metered through ${esc(dateLabel(meteredThrough))}, but a day only
                    appears here once its sales sheet is in too.` : ""}</div>
          </div>
        </div>
      </section>`
    : "";

  const covered = settled
    ? `${periodLabel(series[0].key, grain)} – ${periodLabel(latest.key, grain)}`
    : `${dateLabel(dailyRows[0].date)} – ${dateLabel(dailyRows[dailyRows.length - 1].date)}`;

  // Enough bars to read; a month at day grain is ~31 of them.
  const window = series.slice(-(grain === "day" ? 31 : grain === "week" ? 16 : 12));
  const labels = window.map(({ key }) => (grain === "day" || grain === "week"
    ? dateLabel(key).replace(/,.*$/, "")
    : grain === "month" ? monthLabel(key, true) : key));

  const stat = (label, value, foot, tone = "") => `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone}" style="font-size:23px">${esc(value)}</div>
    <div class="stat-foot">${foot}</div>
  </div>`;

  const intro = settled
    ? `Sales, purchases and profit from the closed monthly books, for <b>${esc(scope.label)}</b>.
       These figures are final — purchases and store profit are booked when each month closes.
       Use the <b>Period</b> buttons above to switch grain. Showing ${esc(covered)}.`
    : `Day-by-day sales, gallons and fuel profit for the current operating month, for
       <b>${esc(scope.label)}</b>. Purchases are keyed in lumps rather than daily, so store profit
       and store margin are not shown at this grain — the Month and Year grains carry them, from
       the closed books. Use the <b>Period</b> buttons above to switch grain.
       Showing ${esc(covered)}, the days every store in scope has filed a sheet for.`;

  const statsGrid = settled
    ? `<div class="grid cols-4" style="margin-bottom:16px">
        ${stat(`Latest ${grain}`, periodLabel(latest.key, grain),
          `<span class="muted">${grain === "year" ? `${esc(num(latest.span))} months of books` : "from the closed books"}</span>`)}
        ${stat("Store sales", money(latest.sales),
          `${deltaBadge(change(latest.sales, previous?.sales))}<span>on the ${esc(grain)} before</span>`)}
        ${stat("Store profit", money(latest.store_profit),
          `${deltaBadge(change(latest.store_profit, previous?.store_profit))}<span>${esc(pct(latest.store_margin))} store margin</span>`,
          neg(latest.store_profit))}
        ${stat("Total profit", money(latest.total_profit),
          `${deltaBadge(change(latest.total_profit, previous?.total_profit))}<span>incl. ${esc(money(latest.gas_profit))} fuel</span>`,
          neg(latest.total_profit))}
      </div>`
    : `<div class="grid cols-4" style="margin-bottom:16px">
        ${stat(`Latest ${grain}`, periodLabel(latest.key, grain),
          partial
            ? `<span class="muted">${esc(num(latest.dates))} of 7 days so far</span>`
            : stale
              ? `<span class="muted">last filed · ${esc(num(latest.days))} store-day${latest.days === 1 ? "" : "s"}</span>`
              : `<span class="muted">${esc(num(latest.days))} store-day${latest.days === 1 ? "" : "s"} filed</span>`)}
        ${stat("Store sales", money(latest.sales),
          partial
            ? `<span class="muted">so far this ${esc(grain)}</span>`
            : `${deltaBadge(change(latest.sales, previous?.sales))}<span>on the ${esc(grain)} before</span>`)}
        ${stat("Gallons", num(latest.gas_vol),
          partial
            ? `<span class="muted">so far this ${esc(grain)}</span>`
            : `${deltaBadge(change(latest.gas_vol, previous?.gas_vol))}<span>fuel pumped</span>`)}
        ${stat("Fuel profit", money(latest.gas_profit),
          partial
            ? `<span class="muted">${esc(perGallon(latest.gas_margin))} /gal so far</span>`
            : `${deltaBadge(change(latest.gas_profit, previous?.gas_profit))}
               <span>${esc(perGallon(latest.gas_margin))} /gal</span>`)}
      </div>`;

  const charts = settled
    ? `<section class="card" style="margin-bottom:16px">
        <div class="card-head"><h3>Sales and purchases</h3>
          <span class="hint">By ${esc(grain)} · from the closed books</span></div>
        <div class="card-body">${barChart(labels, [
          { name: "Store sales", color: NAVY, values: window.map((r) => r.sales ?? null) },
          { name: "Purchases", color: CYAN, values: window.map((r) => r.purchases ?? null) },
        ], { height: 250 })}</div>
      </section>

      <section class="card" style="margin-bottom:16px">
        <div class="card-head"><h3>Profit</h3><span class="hint">Store and total, by ${esc(grain)}</span></div>
        <div class="card-body">${lineChart(labels, [
          { name: "Total profit", color: NAVY, values: window.map((r) => r.total_profit ?? null) },
          { name: "Store profit", color: CYAN, values: window.map((r) => r.store_profit ?? null) },
        ], { height: 250 })}</div>
      </section>`
    : `<section class="card" style="margin-bottom:16px">
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
      </section>`;

  // The per-grain table: the settled grains show the full store P&L from the
  // books, the daily grains show only what the sheets report reliably.
  const tableSection = settled
    ? `<section class="card">
        <div class="card-head"><h3>Every ${esc(grain)}</h3>
          <span class="hint">Newest first · from the closed books</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>${esc(grainTitle)}</th>
            <th class="num">Gallons</th><th class="num">Fuel profit</th><th class="num">$/gal</th>
            <th class="num">Store sales</th><th class="num">Purchases</th>
            <th class="num">Store profit</th><th class="num">Total profit</th>
          </tr></thead>
          <tbody>${series.slice().reverse().map((row) => `<tr>
            <td class="strong">${esc(periodLabel(row.key, grain))}</td>
            <td class="num">${esc(num(row.gas_vol))}</td>
            <td class="num">${esc(money(row.gas_profit))}</td>
            <td class="num">${esc(perGallon(row.gas_margin))}</td>
            <td class="num">${esc(money(row.sales))}</td>
            <td class="num">${esc(money(row.purchases))}</td>
            <td class="num${neg(row.store_profit)}">${esc(money(row.store_profit))}</td>
            <td class="num strong${neg(row.total_profit)}">${esc(money(row.total_profit))}</td>
          </tr>`).join("")}</tbody>
          <tfoot><tr>
            <td>${esc(series.length)} ${esc(grain)}${series.length === 1 ? "" : "s"}</td>
            <td class="num">${esc(num(all.gas_vol))}</td>
            <td class="num">${esc(money(all.gas_profit))}</td>
            <td class="num">${esc(perGallon(all.gas_margin))}</td>
            <td class="num">${esc(money(all.sales))}</td>
            <td class="num">${esc(money(all.purchases))}</td>
            <td class="num${neg(all.store_profit)}">${esc(money(all.store_profit))}</td>
            <td class="num strong${neg(all.total_profit)}">${esc(money(all.total_profit))}</td>
          </tr></tfoot>
        </table></div>
        <div class="card-foot tiny muted">
          Purchases and store profit are the booked figures for each closed month, so this table
          is the final store P&amp;L. $/gal is fuel profit divided by gallons, both from the same
          months, not a pump price.
        </div>
      </section>`
    : `<section class="card">
        <div class="card-head"><h3>Every ${esc(grain)}</h3><span class="hint">Newest first</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>${esc(grainTitle)}</th>
            <th class="num" title="One store's sheet for one day">Store-days</th>
            <th class="num">Gallons</th><th class="num">Fuel profit</th>
            <th class="num">$/gal</th><th class="num">Store sales</th>
          </tr></thead>
          <tbody>${series.slice().reverse().map((row) => `<tr>
            <td class="strong">${esc(periodLabel(row.key, grain))}${partial && row.key === latest.key
              ? ` <span class="tiny muted">· in progress</span>` : ""}</td>
            <td class="num muted">${esc(num(row.days))}</td>
            <td class="num">${esc(num(row.gas_vol))}</td>
            <td class="num">${esc(money(row.gas_profit))}</td>
            <td class="num">${esc(perGallon(row.gas_margin))}</td>
            <td class="num strong">${esc(money(row.sales))}</td>
          </tr>`).join("")}</tbody>
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
          Purchases, store profit and store margin settle when the month's books close, so they
          are not shown here — every closed month carries them in full on the <b>Month</b> and
          <b>Year</b> grains. A “store-day” is one store's sheet for one day.
        </div>
      </section>`;

  return `
    <div class="page-head">
      <h2>${esc(title)}</h2>
      <p>${intro}</p>
    </div>
    ${bar}

    ${staleNote}

    ${mtdSummary(ctx)}

    ${statsGrid}

    ${rollupTable(model, dailyRows, scope.stationIds)}

    ${charts}

    ${tableSection}`;
}

export function bindDaily(root, ctx) {
  ctx.csv = () => {
    const { model, scope } = ctx;
    const settled = scope.period === "month" || scope.period === "year";
    const dailyRows = scopeDays(model, scope.stationIds).filter((r) => isNum(r.sales) && r.sales !== 0);
    const series = periodSeries(model, scope, dailyRows);
    downloadCsv(`daily-${scope.period}-${scope.station?.id || scope.owner?.id || "all"}.csv`,
      ["Period", "Store days", "Gallons", "Fuel profit", "$/gal", "Store sales",
        "Purchases", "Store profit", "Store margin", "Total profit"],
      series.map((row) => [row.key, row.days ?? "", row.gas_vol ?? "", row.gas_profit ?? "",
        row.gas_margin ?? "", row.sales ?? "", row.purchases ?? "", row.store_profit ?? "",
        (settled ? row.store_margin : row.margin) ?? "", row.total_profit ?? ""]));
  };
  bindScopeBar(root, ctx);
}
