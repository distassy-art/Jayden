/*
 * Leaks: where the buying outruns the selling.
 *
 * A caution that shapes this whole page. In these books a store's profit is
 * its sales minus what it bought in — a cash figure, not a gross margin. Over
 * a month that is meaningful, because deliveries and sales even out. Over a
 * single day it is not: a store that took a $19,000 delivery on a Tuesday
 * shows a $14,000 "loss" that Tuesday and gets it all back over the following
 * fortnight as the stock sells.
 *
 * Reading those days as losses would report 276 loss-making days costing
 * $652,000 across a portfolio that in fact earned $14m. So nothing here is
 * flagged on one day's figures. The three signals below all survive delivery
 * timing:
 *
 *   1. A whole month where a store bought in more than it sold.
 *   2. A buy ratio drifting up over the year — ordering outpacing the till.
 *   3. Departments whose margin is thin against what they turn over.
 *
 * A fourth section lists days filed with no sales at all, which is not a leak
 * but a gap in the books, and is worth seeing next to them.
 */

import {
  barChart, barList, dateLabel, emptyState, esc, icon, isNum, money, moneyShort,
  monthLabel, num, pct,
} from "../ui.js";
import {
  departmentPeriods, departmentRollup, monthSeries, storeDays, sumMonths,
} from "../analytics.js";
import { bindScopeBar, scopeBar } from "../scope.js";

const CYAN = "var(--cyan-500)";

/*
 * Above 1.0 a store bought more than it sold outright. That is the severe case
 * and it does happen, but only for a month here and there.
 *
 * The more useful test is relative. These stores are the same business selling
 * broadly the same goods, so one buying twenty points heavier than the rest is
 * the outlier worth a question even though it never crosses 1.0. A fixed
 * threshold would either flag nobody, as an absolute one does here, or flag
 * everybody the year buying gets tight across the board.
 */
const OVERBUYING = 1;
const HEAVIER = 0.05;

const ratio = (totals) => (isNum(totals.sales) && Number(totals.sales) !== 0
  ? Number(totals.purchases || 0) / Number(totals.sales)
  : null);

/** Every store's buying against its selling, over the closed months. */
function storeRatios(model, keys, stationIds) {
  const wanted = stationIds && stationIds.length
    ? new Set(stationIds.map(String))
    : null;

  return model.stations
    .filter((station) => !wanted || wanted.has(String(station.id)))
    .map((station) => {
      const totals = sumMonths(station, keys);

      // Which individual months ran over, so a store that had one bad month is
      // not read the same as one that has been over all year.
      const over = keys.filter((key) => {
        const month = station.months[key];
        return month && isNum(month.sales) && Number(month.sales) !== 0
          && Number(month.purchases || 0) > Number(month.sales);
      });

      return {
        id: station.id,
        name: station.name,
        sales: totals.sales,
        purchases: totals.purchases,
        profit: totals.store_profit,
        ratio: ratio(totals),
        over,
        months: keys.filter((key) => station.months[key]).length,
      };
    })
    .filter((row) => isNum(row.ratio))
    .sort((a, b) => b.ratio - a.ratio);
}

function stat(label, value, foot, toneClass = "") {
  return `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${toneClass}" style="font-size:23px">${esc(value)}</div>
    <div class="stat-foot">${foot}</div>
  </div>`;
}

export function renderLeaks(ctx) {
  const { model, scope } = ctx;
  const ids = scope.stationIds;
  const keys = model.ytdKeys;

  const heading = `<div class="page-head">
      <h2>Leaks</h2>
      <p>Where the buying outruns the selling at <b>${esc(scope.label)}</b>.
        Every other page reports what the business earned; this one looks for
        the money going back out.</p>
    </div>${scopeBar(model, scope, { period: false })}`;

  const rows = storeRatios(model, keys, ids);

  if (!rows.length) {
    return `${heading}
      <section class="card"><div class="card-body">
        ${emptyState("No closed months for this scope",
    "Buying is compared against selling over whole months, so at least one closed month is needed.")}
      </div></section>`;
  }

  const worst = rows[0];

  /* ---- the portfolio's own ratio, month by month ------------------------- */

  const sales = monthSeries(model, keys, "sales", ids);
  const purchases = monthSeries(model, keys, "purchases", ids);
  const monthly = sales.map((value, i) => (isNum(value) && Number(value) !== 0
    ? Number(purchases[i] || 0) / Number(value)
    : null));

  const totals = {
    sales: sales.reduce((sum, v) => sum + (isNum(v) ? v : 0), 0),
    purchases: purchases.reduce((sum, v) => sum + (isNum(v) ? v : 0), 0),
  };
  const overall = ratio(totals);

  // Everything is judged against the rest of the scope rather than a number
  // picked in advance. `over` counts whole months a store bought more than it
  // sold, which is the severe case and stands on its own.
  const heavier = rows.filter((row) => isNum(overall) && row.ratio - overall >= HEAVIER);
  const monthsOver = rows.reduce((sum, row) => sum + row.over.length, 0);
  const gap = isNum(overall) && worst ? worst.ratio - overall : null;

  const trend = barChart(
    keys.map((key) => monthLabel(key, true)),
    [{
      name: "Bought per dollar sold",
      // Plotted as the gap from break-even rather than the raw ratio, so a
      // month that overbought points the other way instead of merely being a
      // slightly taller bar than the one beside it.
      values: monthly.map((value) => (isNum(value) ? value - 1 : null)),
      color: CYAN,
      negativeColor: CYAN,
    }],
    {
      height: 200,
      valueFormat: (value) => pct(value, { digits: 0 }),
    },
  );

  /* ---- days with no sales ------------------------------------------------ */

  /*
   * Not a leak — a hole in the books. A day filed with zero sales and a real
   * purchase figure is either a closed store nobody noted or a day that was
   * never keyed, and both distort the month it sits in.
   */
  const blank = storeDays(model, ids)
    .filter((day) => isNum(day.sales) && Number(day.sales) === 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  /* ---- departments ------------------------------------------------------- */

  const period = departmentPeriods(model, ids).y2026 || "This period";
  const departments = departmentRollup(model, ids)
    .map((row) => ({ name: row.name, stores: row.stores, ...row.y2026 }))
    .filter((row) => isNum(row.margin) && isNum(row.sales) && row.sales > 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10);

  /* ---- markup ------------------------------------------------------------ */

  const storeTable = rows.map((row) => `<tr class="is-clickable"
    data-href="#/store/${esc(row.id)}">
    <td><div class="cell-main"><span class="store-tag">${esc(row.id)}</span>
      <span class="strong">${esc(row.name)}</span></div></td>
    <td class="num">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.purchases))}</td>
    <td class="num strong${isNum(overall) && row.ratio - overall >= HEAVIER
    ? " neg-text" : ""}">${esc(pct(row.ratio, { digits: 1 }))}</td>
    <td class="num${Number(row.profit) < 0 ? " neg-text" : ""}">${esc(money(row.profit))}</td>
    <td class="num${row.over.length ? " strong" : " muted"}">${esc(num(row.over.length))}
      <span class="muted tiny">of ${esc(num(row.months))}</span></td>
    <td class="muted tiny">${row.over.length
    ? esc(row.over.map((key) => monthLabel(key, true)).join(", "))
    : "—"}</td>
  </tr>`).join("");

  const blankTable = blank.slice(0, 20).map((day) => `<tr class="is-clickable"
    data-href="#/store/${esc(day.storeId)}">
    <td>${esc(dateLabel(day.date))}</td>
    <td><div class="cell-main"><span class="store-tag">${esc(day.storeId)}</span>
      <span class="strong">${esc(day.store)}</span></div></td>
    <td class="num">${esc(money(day.purchases))}</td>
    <td class="num">${esc(money(day.gas_vol ? day.gas_profit : null))}</td>
  </tr>`).join("");

  const deptTable = departments.map((row) => `<tr>
    <td class="strong">${esc(row.name)}</td>
    <td class="num">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.purchases))}</td>
    <td class="num${Number(row.profit) < 0 ? " neg-text" : ""}">${esc(money(row.profit))}</td>
    <td class="num${Number(row.margin) < 0.2 ? " neg-text strong" : ""}">
      ${esc(pct(row.margin))}</td>
  </tr>`).join("");

  return `${heading}

    <div class="grid cols-4" style="margin-bottom:16px">
      ${stat("Bought per dollar sold", pct(overall, { digits: 1 }),
    `<span class="muted">Keeping ${esc(pct(1 - overall, { digits: 1 }))} of
      ${esc(moneyShort(totals.sales))} sold</span>`)}
      ${stat("Heaviest buyer", worst ? worst.name : "—",
    worst ? `<span class="muted">${esc(pct(worst.ratio, { digits: 1 }))} of sales,
      ${esc(pct(gap, { digits: 1 }))} above the rest</span>` : "",
    gap >= HEAVIER ? " neg-text" : "")}
      ${stat("Buying heavier than the rest", num(heavier.length),
    `<span class="muted">${heavier.length
      ? `More than ${esc(pct(HEAVIER, { digits: 0 }))} above
         ${esc(pct(overall, { digits: 1 }))}`
      : "Every store is within reach of the average"}</span>`,
    heavier.length ? " neg-text" : "")}
      ${stat("Months that bought more than they sold", num(monthsOver),
    `<span class="muted">${monthsOver
      ? "Across the closed months, any store"
      : "No store overbought a whole month"}</span>`,
    monthsOver ? " neg-text" : "")}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3>How far the buying ran ahead of the selling</h3>
        <span class="hint">By month · above the line means more bought than sold</span>
      </div>
      <div class="card-body">${trend}</div>
      <div class="card-foot tiny muted">
        Each bar is what was bought for every dollar sold that month, measured
        from break-even. A month that reads &minus;30% kept thirty cents on the
        dollar. Deliveries are lumpy day to day but even out over a month, which
        is why this is drawn monthly and never daily.
      </div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>By store</h3>
        <span class="hint">Heaviest buyers first · ${esc(keys.length)} closed
          month${keys.length === 1 ? "" : "s"}</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Store</th><th class="num">Sold</th><th class="num">Bought</th>
          <th class="num">Bought / sold</th><th class="num">Store profit</th>
          <th class="num">Months over</th><th>Which</th></tr></thead>
        <tbody>${storeTable}</tbody>
        <tfoot><tr><td>${esc(num(rows.length))} store${rows.length === 1 ? "" : "s"}</td>
          <td class="num">${esc(money(totals.sales))}</td>
          <td class="num">${esc(money(totals.purchases))}</td>
          <td class="num strong">${esc(pct(overall, { digits: 1 }))}</td>
          <td class="num">${esc(money(totals.sales - totals.purchases))}</td>
          <td class="num">${esc(num(rows.reduce((sum, row) => sum + row.over.length, 0)))}</td>
          <td></td></tr></tfoot>
      </table></div>
      ${gap >= HEAVIER ? `<div class="card-foot">
        <div class="warn-box">${icon("alert")}
          <div><b>${esc(worst.name)} spent ${esc(pct(worst.ratio, { digits: 1 }))} of
            its sales on stock, against ${esc(pct(overall, { digits: 1 }))} across the
            rest.</b> Had it bought at the same rate as its neighbours over these
            ${esc(num(worst.months))} months it would have kept a further
            ${esc(money(worst.sales * (worst.ratio - overall)))}.
            Stock building on the shelf looks the same in these books as money
            walking out of the door, so the place to start is a count.</div>
        </div>
      </div>` : ""}
    </section>

    ${rows.length > 1 ? `<section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>The same picture, ranked</h3>
        <span class="hint">Bought for every dollar sold</span></div>
      <div class="card-body">${barList(rows.map((row) => ({
    label: row.name,
    value: row.ratio,
  })), {
    valueFormat: (value) => pct(value, { digits: 1 }),
    color: CYAN,
    max: Math.max(1, ...rows.map((row) => row.ratio)),
  })}</div>
    </section>` : ""}

    ${blank.length ? `<section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Days filed with no sales</h3>
        <span class="hint">Newest first${blank.length > 20
    ? ` · 20 of ${esc(num(blank.length))}` : ""}</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Store</th><th class="num">Bought that day</th>
          <th class="num">Fuel profit</th></tr></thead>
        <tbody>${blankTable}</tbody>
      </table></div>
      <div class="card-foot tiny muted">
        Not a loss — a hole in the books. A store that reports purchases and no
        sales was either shut that day or the sales were never keyed, and either
        way the month it sits in reads worse than it traded.
      </div>
    </section>` : ""}

    ${departments.length ? `<section class="card">
      <div class="card-head"><h3>Thinnest departments</h3>
        <span class="hint">${esc(period)} · lowest margin first</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Department</th><th class="num">Sales</th>
          <th class="num">Purchases</th><th class="num">Profit</th>
          <th class="num">Margin</th></tr></thead>
        <tbody>${deptTable}</tbody>
      </table></div>
      <div class="card-foot tiny muted">
        A thin margin is not automatically wrong — some categories are run close
        to cost to bring people in. It is where a price or a supplier is worth
        revisiting, especially on the lines turning over the most.
      </div>
    </section>` : ""}`;
}

export function bindLeaks(root, ctx) {
  bindScopeBar(root, ctx);
}
