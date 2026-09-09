/*
 * Trends: every profitability measure, one chart each, this period against the
 * same period a year earlier.
 *
 * The other Performance pages each answer one question well and show the two or
 * three charts that question needs. What none of them gives is the whole board
 * at once — the view where fuel volume, store sales, purchases and the margins
 * are all on screen together, so a month that looks fine on profit can be seen
 * to have got there by buying less rather than by selling more.
 *
 * One metric per chart, deliberately. Putting gallons and dollars on shared
 * axes makes the smaller series a flat line against the bottom, and stacking
 * fuel and store profit hides the fact that one can rise while the other falls.
 *
 * Margins are recomputed from summed dollars month by month rather than
 * averaged across stores, so each line agrees with the total printed above it.
 */

import {
  barChart, change, deltaBadge, esc, isNum, money, moneyShort, num, pct, perGallon,
} from "../ui.js";
import { bindScopeBar } from "../scope.js";
import { head, scopeIds, view } from "./analysis.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";

/*
 * Definitions rather than markup, so the charts, the summary line under each
 * and the CSV all read from one place.
 *
 * `ratio` metrics have no month column of their own and are divided out of two
 * that do. `higherIsBetter` is false only for purchases: buying more is not an
 * achievement on its own, and the arrow should not be green when it climbs.
 */
const METRICS = [
  {
    group: "Fuel",
    key: "gas_vol",
    title: "Fuel volume",
    unit: "Gallons sold",
    format: num,
  },
  {
    group: "Fuel",
    key: "gas_sales",
    title: "Fuel revenue",
    unit: "What the fuel sold for",
    format: moneyShort,
    full: money,
    /*
     * This feed lags the others and covers fewer stores, so last year has to
     * be taken over the same stores and months. Left to the ordinary path it
     * would put thirteen stores against sixteen and report a fall that is
     * really a difference in who filed.
     */
    paired: true,
  },
  {
    group: "Fuel",
    key: "gas_margin",
    title: "Fuel margin",
    unit: "Kept per gallon",
    ratio: ["gas_profit", "gas_vol"],
    format: perGallon,
    // Cents on a gallon, so the change is stated in cents rather than percent.
    delta: (now, before) => (isNum(now) && isNum(before)
      ? { value: (now - before) * 100, suffix: "\u00a2" }
      : null),
  },
  {
    group: "Fuel",
    key: "fuel_profit",
    title: "Fuel profit",
    unit: "What the fuel earned",
    format: moneyShort,
    full: money,
  },
  {
    group: "The store",
    key: "sales",
    title: "Store sales",
    unit: "Merchandise, not fuel",
    format: moneyShort,
    full: money,
  },
  {
    group: "The store",
    key: "purchases",
    title: "Purchases",
    unit: "What was bought in",
    format: moneyShort,
    full: money,
    higherIsBetter: false,
  },
  {
    group: "The store",
    key: "store_margin",
    title: "Store margin",
    unit: "Kept on every sales dollar",
    ratio: ["store_profit", "sales"],
    format: (value) => pct(value, { digits: 1 }),
    delta: (now, before) => (isNum(now) && isNum(before)
      ? { value: (now - before) * 100, suffix: " pts" }
      : null),
  },
  {
    group: "The store",
    key: "store_profit",
    title: "Store profit",
    unit: "What the shop earned",
    format: moneyShort,
    full: money,
  },
  {
    group: "Together",
    key: "total_profit",
    title: "Total profit",
    unit: "Fuel and store combined",
    format: moneyShort,
    full: money,
  },
];

/** Both series for one metric, plus the period totals either side. */
function measure(metric, v, ids) {
  if (metric.ratio) {
    const [top, bottom] = metric.ratio;
    const totals = v.totals(ids);
    const prior = v.priorTotals(ids);
    const ratio = (source) => (isNum(source[top]) && isNum(source[bottom])
      && Number(source[bottom]) !== 0
      ? Number(source[top]) / Number(source[bottom])
      : null);
    return {
      values: v.ratio(top, bottom, ids),
      prior: v.priorRatio(top, bottom, ids),
      now: ratio(totals),
      before: ratio(prior),
    };
  }
  /*
   * Not every measure reaches as far back as the rest. Fuel revenue comes from
   * its own feed and lags the books by a couple of months, so its card totals
   * fewer months than the picker names. Counting them here lets the card say
   * so, rather than presenting a short year as a bad one.
   */
  const months = v.keys.filter((key) => {
    const totals = v.totalsFor([key], ids);
    return isNum(totals[metric.key]);
  });

  const common = {
    values: v.series(metric.key, ids),
    prior: v.priorSeries(metric.key, ids),
    months: months.length,
    ofMonths: v.keys.length,
  };

  if (metric.paired) {
    const now = v.revenue(ids);
    const before = now ? v.priorRevenue(now) : null;
    return {
      ...common,
      now: now ? now.sales : null,
      // Withheld rather than approximated when the two spans do not match.
      before: before && before.keys.length === now.keys.length
        && before.stores === now.stores
        ? before.sales
        : null,
      stores: now ? now.stores : null,
      ofStores: now ? now.ofStores : null,
    };
  }

  return {
    ...common,
    now: v.totals(ids)[metric.key],
    before: v.priorTotals(ids)[metric.key],
  };
}

/*
 * A measure with nothing in it is dropped rather than drawn as an empty frame.
 * Fuel revenue is the case that matters: it comes from its own feed and does
 * not reach back as far as the rest, so on an early month it genuinely has
 * nothing to say.
 */
function reported(m) {
  return m.values.some(isNum) || isNum(m.now);
}

function card(metric, m, v) {
  const format = metric.full || metric.format;
  const custom = metric.delta ? metric.delta(m.now, m.before) : null;
  const badge = custom
    ? deltaBadge(custom.value, {
      higherIsBetter: metric.higherIsBetter !== false,
      suffix: custom.suffix,
    })
    : deltaBadge(change(m.now, m.before), {
      higherIsBetter: metric.higherIsBetter !== false,
    });

  // Ratios are not undercounted by a missing month, only totals are.
  const short = !metric.ratio && m.months < m.ofMonths;

  return `<section class="card">
    <div class="card-head">
      <h3>${esc(metric.title)}</h3>
      <span class="hint">${esc(metric.unit)}</span>
    </div>
    <div class="card-body">
      <div class="trend-figure">
        <div>
          <div class="trend-value">${esc(format(m.now))}</div>
          <div class="trend-foot">${isNum(m.before)
    ? `${badge}<span class="muted">from ${esc(format(m.before))}
       in ${esc(v.beforeLabel)}</span>`
    : `<span class="muted">Nothing comparable in ${esc(v.beforeLabel)}</span>`}</div>
        </div>
      </div>
      ${short ? `<p class="tiny muted" style="margin:-8px 0 12px">
        Reported for ${esc(num(m.months))} of ${esc(num(m.ofMonths))} months in
        this period${isNum(m.stores) && m.stores < m.ofStores
    ? ` by ${esc(num(m.stores))} of ${esc(num(m.ofStores))} stores` : ""},
        so the total is for those only.</p>` : ""}
      ${barChart(v.labels, [
    { name: String(v.nowLabel), values: m.values, color: CYAN },
    { name: String(v.beforeLabel), values: m.prior, color: NAVY },
  ], { height: 210, valueFormat: metric.format })}
    </div>
  </section>`;
}

export function renderTrends(ctx) {
  const { model, scope } = ctx;
  const ids = scopeIds(scope);
  const v = view(model, scope);

  const measured = METRICS
    .map((metric) => ({ metric, m: measure(metric, v, ids) }))
    .filter((entry) => reported(entry.m));

  const heading = head("Trends",
    "Every measure that moves store profit, each on its own chart, against the "
    + "same months a year earlier. Read down a column and a good month shows "
    + "which side of the business produced it.",
    model, scope, v);

  if (!measured.length) {
    return `${heading}<section class="card"><div class="card-body">
      <p class="muted">No figures reported for this selection.</p>
    </div></section>`;
  }

  const groups = [...new Set(measured.map((entry) => entry.metric.group))];

  const sections = groups.map((group) => {
    const cards = measured
      .filter((entry) => entry.metric.group === group)
      .map((entry) => card(entry.metric, entry.m, v))
      .join("");
    return `<h3 class="section-heading">${esc(group)}</h3>
      <div class="grid cols-2 trend-grid">${cards}</div>`;
  }).join("");

  return `${heading}${sections}`;
}

export function bindTrends(root, ctx) {
  bindScopeBar(root, ctx);
}
