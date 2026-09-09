/*
 * Derivations over the raw books overlay.
 *
 * The upstream payload is per-station buckets of months, days, departments and
 * a profit summary. Views need portfolio roll-ups, comparable periods and a
 * ranked list of things that need attention, so all of that is computed here
 * once rather than being recalculated inside each view.
 */

import { change, isNum } from "./ui.js";

/** Months a station reports but which hold no usable figures are dropped. */
function isRealMonth(entry) {
  if (!entry) return false;
  return ["sales", "purchases", "store_profit", "gas_vol", "fuel_profit", "total_profit"]
    .some((key) => isNum(entry[key]) && Number(entry[key]) !== 0);
}

/** Normalise one station into a shape the views can rely on. */
function normaliseStation(id, raw) {
  const months = {};
  Object.entries(raw?.months || {}).forEach(([key, value]) => {
    if (isRealMonth(value)) months[key] = value;
  });

  const monthKeys = Object.keys(months).sort();
  const days = (raw?.days || [])
    .filter((day) => day && day.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    id: String(id),
    name: raw?.name || String(id),
    group: raw?.profit?.group || "",
    months,
    monthKeys,
    days,
    departments: raw?.depts?.departments || [],
    deptPeriods: {
      y2025: raw?.depts?.period_2025 || "2025",
      y2026: raw?.depts?.period_2026 || "2026",
    },
    profit: raw?.profit || null,
    lastMonth: monthKeys.length ? monthKeys[monthKeys.length - 1] : null,
    lastDay: days.length ? days[days.length - 1].date : null,
  };
}

const METRICS = [
  "gas_vol", "gas_profit", "fuel_profit", "sales", "purchases",
  "store_profit", "total_profit",
];

function addInto(target, source) {
  METRICS.forEach((key) => {
    if (isNum(source?.[key])) target[key] = (target[key] || 0) + Number(source[key]);
  });
  return target;
}

/** Derived ratios that must be recomputed after summing, never averaged. */
function withRatios(totals) {
  const out = { ...totals };
  out.store_margin = isNum(out.sales) && Number(out.sales) !== 0
    ? Number(out.store_profit || 0) / Number(out.sales)
    : null;
  out.gas_margin = isNum(out.gas_vol) && Number(out.gas_vol) !== 0
    ? Number(out.gas_profit || out.fuel_profit || 0) / Number(out.gas_vol)
    : null;
  if (!isNum(out.fuel_profit) && isNum(out.gas_profit)) out.fuel_profit = out.gas_profit;
  if (!isNum(out.total_profit)) {
    out.total_profit = Number(out.fuel_profit || 0) + Number(out.store_profit || 0);
  }
  return out;
}

/** Sum a single station across a set of month keys. */
export function sumMonths(station, keys) {
  const totals = {};
  keys.forEach((key) => {
    if (station.months[key]) addInto(totals, station.months[key]);
  });
  return withRatios(totals);
}

/** The same calendar months one year earlier, for like-for-like comparison. */
export function priorYearKeys(keys) {
  return keys.map((key) => {
    const [year, month] = key.split("-");
    return `${Number(year) - 1}-${month}`;
  });
}

/**
 * Build the workspace model every view reads from.
 *
 * `stores` narrows the model to a list of station ids, so a client owner's
 * console cannot roll up another client's figures even if the feed returns them.
 */
export function buildModel(overlay, { stores = null } = {}) {
  const raw = overlay?.overlay?.stations || {};
  const only = stores ? new Set(stores.map(String)) : null;
  const stations = Object.entries(raw)
    .filter(([id]) => !only || only.has(String(id)))
    .map(([id, value]) => normaliseStation(id, value))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Every month any station reports, newest last.
  const allMonths = [...new Set(stations.flatMap((s) => s.monthKeys))].sort();

  // The newest month at least half the reporting stations have closed. A single
  // station filing early should not make the whole portfolio look like a cliff.
  const reporting = stations.filter((s) => s.monthKeys.length);
  let latestMonth = null;
  for (let i = allMonths.length - 1; i >= 0; i -= 1) {
    const key = allMonths[i];
    const filed = reporting.filter((s) => s.months[key]).length;
    if (reporting.length && filed >= Math.ceil(reporting.length / 2)) { latestMonth = key; break; }
  }
  if (!latestMonth && allMonths.length) latestMonth = allMonths[allMonths.length - 1];

  const previousMonth = latestMonth
    ? allMonths[allMonths.indexOf(latestMonth) - 1] || null
    : null;
  const yearAgoMonth = latestMonth
    ? `${Number(latestMonth.slice(0, 4)) - 1}-${latestMonth.slice(5)}`
    : null;

  // Months past `latestMonth` exist only because one or two stations file ahead
  // of everyone else. Charting them makes the portfolio look like it fell off a
  // cliff, so every trend and roll-up works from the closed months instead.
  const closedMonths = latestMonth
    ? allMonths.filter((key) => key <= latestMonth)
    : allMonths;

  const currentYear = latestMonth ? latestMonth.slice(0, 4) : String(new Date().getFullYear());
  const ytdKeys = closedMonths.filter((key) => key.startsWith(currentYear));
  const priorYtdKeys = priorYearKeys(ytdKeys);

  return {
    stations,
    byId: new Map(stations.map((s) => [s.id, s])),
    allMonths,
    closedMonths,
    latestMonth,
    previousMonth,
    yearAgoMonth,
    currentYear,
    ytdKeys,
    priorYtdKeys,
    updatedAt: overlay?.updated_at || overlay?.overlay?.updated_at || null,
  };
}

/** Portfolio totals for a set of month keys, restricted to `stationIds`. */
export function portfolioTotals(model, keys, stationIds = null) {
  const totals = {};
  const scope = stationIds
    ? model.stations.filter((s) => stationIds.includes(s.id))
    : model.stations;
  scope.forEach((station) => {
    keys.forEach((key) => {
      if (station.months[key]) addInto(totals, station.months[key]);
    });
  });
  return withRatios(totals);
}

/** A station's month series aligned to `keys`, with nulls for gaps. */
export function seriesFor(station, keys, metric) {
  return keys.map((key) => {
    const entry = station.months[key];
    return entry && isNum(entry[metric]) ? Number(entry[metric]) : null;
  });
}

/** Portfolio-wide month series, summing across stations. */
export function portfolioSeries(model, keys, metric, stationIds = null) {
  const scope = stationIds
    ? model.stations.filter((s) => stationIds.includes(s.id))
    : model.stations;
  return keys.map((key) => {
    let total = null;
    scope.forEach((station) => {
      const entry = station.months[key];
      if (entry && isNum(entry[metric])) total = (total || 0) + Number(entry[metric]);
    });
    return total;
  });
}

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Stations in scope; `null` or an empty list means the whole portfolio. */
export function scopeOf(model, stationIds) {
  if (!stationIds || !stationIds.length) return model.stations;
  return model.stations.filter((station) => stationIds.includes(station.id));
}

/**
 * The calendar months the current year has closed, as "01".."12".
 *
 * Every year-over-year figure is restricted to this window. Comparing eight
 * closed months of this year against a full twelve of last year would show a
 * healthy portfolio as collapsing.
 */
export function comparableMonths(model) {
  return model.ytdKeys.map((key) => key.slice(5));
}

/**
 * One calendar year of a metric, indexed Jan–Dec, summed over the scope.
 * Months outside the comparable window, and months with nothing reported, stay
 * null so charts break rather than plotting a zero that reads as a collapse.
 */
export function yearSeries(model, year, metric, stationIds = null, { comparableOnly = true } = {}) {
  const scope = scopeOf(model, stationIds);
  const allowed = comparableOnly ? new Set(comparableMonths(model)) : null;

  return MONTH_ABBR.map((_, index) => {
    const mm = String(index + 1).padStart(2, "0");
    if (allowed && !allowed.has(mm)) return null;
    const key = `${year}-${mm}`;
    let total = null;
    scope.forEach((station) => {
      const entry = station.months[key];
      if (entry && isNum(entry[metric])) total = (total || 0) + Number(entry[metric]);
    });
    return total;
  });
}

/**
 * Fuel margin has to be recomputed from the summed dollars and gallons.
 * Averaging each store's cents-per-gallon would weight a tiny site the same as
 * the busiest one.
 */
export function marginSeries(model, year, stationIds = null) {
  const profit = yearSeries(model, year, "gas_profit", stationIds);
  const volume = yearSeries(model, year, "gas_vol", stationIds);
  return profit.map((value, i) => (isNum(value) && isNum(volume[i]) && Number(volume[i]) !== 0
    ? Number(value) / Number(volume[i])
    : null));
}

/**
 * Year-to-date totals for a scope.
 *
 * Restricted to the comparable window, so asking for last year returns the same
 * eight months this year has closed rather than all twelve. Without that, a
 * portfolio up 18% reads as down 23%.
 */
export function scopeTotals(model, year, stationIds = null, { comparableOnly = true } = {}) {
  const allowed = comparableOnly ? new Set(comparableMonths(model)) : null;
  const keys = model.closedMonths.filter((key) => key.startsWith(`${year}-`)
    && (!allowed || allowed.has(key.slice(5))));
  return portfolioTotals(model, keys, stationIds && stationIds.length ? stationIds : null);
}

/**
 * Departments summed by name across the scope. Each station reports its own
 * department list, so the same name has to be folded together rather than
 * listed once per store.
 */
export function departmentRollup(model, stationIds = null) {
  const merged = new Map();

  scopeOf(model, stationIds).forEach((station) => {
    station.departments.forEach((dept) => {
      const name = String(dept.name || "").trim();
      if (!name) return;
      if (!merged.has(name)) {
        merged.set(name, {
          name,
          stores: 0,
          y2026: { sales: 0, purchases: 0, profit: 0 },
          y2025: { sales: 0, purchases: 0, profit: 0 },
        });
      }
      const row = merged.get(name);
      row.stores += 1;
      ["y2026", "y2025"].forEach((period) => {
        ["sales", "purchases", "profit"].forEach((field) => {
          const value = dept[period]?.[field];
          if (isNum(value)) row[period][field] += Number(value);
        });
      });
    });
  });

  return [...merged.values()].map((row) => {
    const margin = (period) => (row[period].sales ? row[period].profit / row[period].sales : null);
    const now = margin("y2026");
    const before = margin("y2025");
    return {
      ...row,
      y2026: { ...row.y2026, margin: now },
      y2025: { ...row.y2025, margin: before },
      marginPts: isNum(now) && isNum(before) ? (now - before) * 100 : null,
      profitDelta: change(row.y2026.profit, row.y2025.profit),
    };
  }).sort((a, b) => b.y2026.profit - a.y2026.profit);
}

/** The department period labels, which differ from calendar years. */
export function departmentPeriods(model, stationIds = null) {
  const station = scopeOf(model, stationIds).find((s) => s.departments.length);
  return station ? station.deptPeriods : { y2025: "2025", y2026: "2026" };
}

/* -------------------------------------------------------------------------
   Day grain
   -------------------------------------------------------------------------
   Day records use their own field names — `purch` rather than `purchases`, and
   `margin` rather than `store_margin` — so they are normalised here once
   instead of in each view.
   ------------------------------------------------------------------------- */

const DAY_METRICS = ["gas_vol", "gas_profit", "sales", "purchases", "store_profit", "total_profit"];

function normaliseDay(day) {
  return {
    date: String(day.date),
    gas_vol: isNum(day.gas_vol) ? Number(day.gas_vol) : null,
    gas_profit: isNum(day.gas_profit) ? Number(day.gas_profit) : null,
    sales: isNum(day.sales) ? Number(day.sales) : null,
    purchases: isNum(day.purch) ? Number(day.purch) : (isNum(day.purchases) ? Number(day.purchases) : null),
    store_profit: isNum(day.store_profit) ? Number(day.store_profit) : null,
    total_profit: isNum(day.total_profit) ? Number(day.total_profit) : null,
  };
}

/** Every day in scope, summed across stores, one row per calendar date. */
export function scopeDays(model, stationIds = null) {
  const byDate = new Map();

  scopeOf(model, stationIds).forEach((station) => {
    station.days.forEach((raw) => {
      const day = normaliseDay(raw);
      if (!byDate.has(day.date)) byDate.set(day.date, { date: day.date, stores: 0 });
      const row = byDate.get(day.date);
      row.stores += 1;
      DAY_METRICS.forEach((key) => {
        if (isNum(day[key])) row[key] = (row[key] || 0) + day[key];
      });
    });
  });

  return [...byDate.values()]
    .map((row) => ({
      ...row,
      // Recomputed from the summed dollars; averaging each store's own margin
      // would weight a quiet site the same as the busiest one.
      margin: isNum(row.sales) && row.sales !== 0 ? row.store_profit / row.sales : null,
      gas_margin: isNum(row.gas_vol) && row.gas_vol !== 0 ? row.gas_profit / row.gas_vol : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Sum a set of day rows, recomputing the ratios afterwards. */
export function sumDays(rows) {
  const totals = {};
  rows.forEach((row) => {
    DAY_METRICS.forEach((key) => {
      if (isNum(row[key])) totals[key] = (totals[key] || 0) + Number(row[key]);
    });
  });
  totals.margin = isNum(totals.sales) && totals.sales !== 0
    ? totals.store_profit / totals.sales : null;
  totals.gas_margin = isNum(totals.gas_vol) && totals.gas_vol !== 0
    ? totals.gas_profit / totals.gas_vol : null;
  // Store-days, not calendar days: a week where fifteen of seventeen stores
  // filed is not the same as one where all of them did.
  totals.days = rows.reduce((sum, row) => sum + (row.stores || 1), 0);
  totals.dates = rows.length;
  return totals;
}

/**
 * Per-station scorecard for the latest closed month plus year-to-date.
 */
export function stationScorecards(model) {
  return model.stations.map((station) => {
    const month = model.latestMonth ? station.months[model.latestMonth] || null : null;
    const prior = model.yearAgoMonth ? station.months[model.yearAgoMonth] || null : null;
    const ytd = sumMonths(station, model.ytdKeys);
    const priorYtd = sumMonths(station, model.priorYtdKeys);

    return {
      station,
      month,
      prior,
      ytd,
      priorYtd,
      filed: Boolean(month),
      totalProfitDelta: change(month?.total_profit, prior?.total_profit),
      storeProfitDelta: change(month?.store_profit, prior?.store_profit),
      ytdProfitDelta: change(ytd.total_profit, priorYtd.total_profit),
      marginDelta: isNum(month?.store_margin) && isNum(prior?.store_margin)
        ? (Number(month.store_margin) - Number(prior.store_margin)) * 100
        : null,
      trend: seriesFor(station, model.closedMonths.slice(-12), "total_profit"),
    };
  });
}

/* -------------------------------------------------------------------------
   Attention feed
   ------------------------------------------------------------------------- */

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Rank everything that plausibly needs an admin's attention today.
 * Purely derived and read-only: this flags, it never changes anything.
 */
export function attentionItems(model, extras = {}) {
  const items = [];
  const { s2k, billing, tickets, days, pricing, orders, buy } = extras;

  /*
   * Overspending in the open month.
   * This outranks everything else on the page because it is the only entry
   * that is still preventable — the rest describe money already spent.
   */
  const blown = (buy?.departments || []).filter((row) => isNum(row.left) && row.left < 0);
  if (blown.length) {
    const over = blown.reduce((sum, row) => sum + Math.abs(row.left), 0);
    items.push({
      severity: "high",
      kind: "The buy",
      title: `${blown.length} department${blown.length === 1 ? "" : "s"} past the month's budget`,
      detail: `${blown.slice(0, 3).map((row) => row.name).join(", ")}`
        + `${blown.length > 3 ? ` and ${blown.length - 3} more` : ""}`
        + " — every further order deepens it.",
      value: over,
      href: "#/buy",
      action: "Open the buy",
    });
  }

  const tight = (buy?.departments || [])
    .filter((row) => isNum(row.used) && row.used >= 0.9 && row.used <= 1);
  if (tight.length && !blown.length) {
    items.push({
      severity: "medium",
      kind: "The buy",
      title: `${tight.length} department${tight.length === 1 ? "" : "s"} nearly out of budget`,
      detail: `${tight.slice(0, 3).map((row) => row.name).join(", ")} — over 90% spent.`,
      value: tight.reduce((sum, row) => sum + (row.left || 0), 0),
      href: "#/buy",
      action: "Open the buy",
    });
  }

  const overWeek = (buy?.weeks || []).filter((week) => week.started && week.over > 0);
  if (overWeek.length) {
    items.push({
      severity: overWeek.length > 1 ? "high" : "medium",
      kind: "The buy",
      title: `${overWeek.length} week${overWeek.length === 1 ? "" : "s"} bought past the ceiling`,
      detail: overWeek.map((week) => week.label).join(", "),
      value: overWeek.reduce((sum, week) => sum + week.over, 0),
      href: "#/buy",
      action: "Open the buy",
    });
  }

  // Money sitting outside S2K.
  const missing = s2k?.missing || [];
  if (missing.length) {
    const total = missing.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    items.push({
      severity: missing.length > 20 ? "high" : "medium",
      kind: "S2K",
      title: `${missing.length} invoice${missing.length === 1 ? "" : "s"} missing from S2K`,
      detail: "Logged against a store but never entered, so cost of goods is understated.",
      value: total,
      href: "#/invoices?tab=missing",
      action: "Review missing",
    });
  }

  // Unpaid client billing.
  const unpaid = (billing?.invoices || []).filter((inv) => String(inv.status || "").toLowerCase() !== "paid");
  if (unpaid.length) {
    const total = unpaid.reduce((sum, inv) => sum + (Number(inv.total ?? inv.amount) || 0), 0);
    items.push({
      severity: unpaid.length > 8 ? "high" : "medium",
      kind: "Billing",
      title: `${unpaid.length} client invoice${unpaid.length === 1 ? "" : "s"} unpaid`,
      detail: "Issued to clients and still outstanding.",
      value: total,
      href: "#/billing?status=unpaid",
      action: "Open billing",
    });
  }

  // Manager tickets waiting on a reply.
  const openTickets = (tickets?.tickets || []).filter((t) => String(t.status || "open").toLowerCase() !== "closed");
  if (openTickets.length) {
    items.push({
      severity: "high",
      kind: "Tickets",
      title: `${openTickets.length} manager ticket${openTickets.length === 1 ? "" : "s"} open`,
      detail: "A store manager is waiting on Smart Solutions.",
      href: "#/tickets",
      action: "Open tickets",
    });
  }

  // Days submitted for approval.
  const pending = days?.items || [];
  if (pending.length) {
    items.push({
      severity: "medium",
      kind: "Approvals",
      title: `${pending.length} day${pending.length === 1 ? "" : "s"} awaiting approval`,
      detail: "Submitted by managers and not yet approved.",
      href: "#/tickets",
      action: "Review",
    });
  }

  // Vendor orders sent but never reconciled against an invoice.
  const awaiting = (orders?.sends || []).filter((send) => /awaiting/i.test(String(send.status || "")));
  if (awaiting.length) {
    const total = awaiting.reduce((sum, send) => sum + (Number(send.aiAmount) || 0), 0);
    items.push({
      severity: "low",
      kind: "Orders",
      title: `${awaiting.length} vendor order${awaiting.length === 1 ? "" : "s"} awaiting an invoice`,
      detail: "Sent to the vendor with no invoice logged back yet.",
      value: total,
      href: "#/orders",
      action: "Open orders",
    });
  }

  // Stations that did not file the month everyone else filed.
  if (model.latestMonth) {
    const behind = model.stations.filter((s) => s.monthKeys.length && !s.months[model.latestMonth]);
    if (behind.length) {
      items.push({
        severity: "medium",
        kind: "Data",
        title: `${behind.length} store${behind.length === 1 ? "" : "s"} have not closed ${model.latestMonth}`,
        detail: behind.map((s) => s.name).join(", "),
        href: "#/health",
        action: "Data health",
      });
    }
  }

  // Stores losing money inside the store, where fuel is masking the problem.
  const losers = stationScorecards(model)
    .filter((card) => card.month && isNum(card.month.store_profit) && Number(card.month.store_profit) < 0);
  if (losers.length) {
    const total = losers.reduce((sum, card) => sum + Number(card.month.store_profit), 0);
    items.push({
      severity: "high",
      kind: "Margin",
      title: `${losers.length} store${losers.length === 1 ? "" : "s"} lost money inside the store`,
      detail: losers.map((c) => c.station.name).join(", "),
      value: total,
      href: "#/stores?sort=storeProfit",
      action: "Open stores",
    });
  }

  // Pricing work that has been published but not reviewed recently.
  const priceDays = pricing?.days || [];
  if (priceDays.length) {
    items.push({
      severity: "low",
      kind: "Pricing",
      title: `${priceDays.length} price change${priceDays.length === 1 ? "" : "s"} published`,
      detail: "Price-change sheets available for client stores.",
      href: "#/pricing",
      action: "Open pricing",
    });
  }

  return items.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return Math.abs(b.value || 0) - Math.abs(a.value || 0);
  });
}

/* -------------------------------------------------------------------------
   Data health
   ------------------------------------------------------------------------- */

/**
 * Per-station freshness and coverage, so gaps are visible before they turn
 * into wrong numbers on a client report.
 */
export function dataHealth(model) {
  return model.stations.map((station) => {
    // Only months since this station started reporting, and only closed ones.
    const expected = model.closedMonths.filter((key) => key >= (station.monthKeys[0] || key));
    const missingMonths = expected.filter((key) => !station.months[key]);

    const dayGaps = [];
    for (let i = 1; i < station.days.length; i += 1) {
      const previous = new Date(`${station.days[i - 1].date}T00:00:00`);
      const current = new Date(`${station.days[i].date}T00:00:00`);
      const gap = Math.round((current - previous) / 86400000);
      if (gap > 1) dayGaps.push({ from: station.days[i - 1].date, to: station.days[i].date, days: gap - 1 });
    }

    // Months this station has started filing ahead of everyone else. They are
    // kept out of every trend because they are part-months, so they are
    // reported here instead rather than silently disappearing.
    const aheadMonths = model.latestMonth
      ? station.monthKeys.filter((key) => key > model.latestMonth)
      : [];

    return {
      station,
      monthsCovered: station.monthKeys.length,
      missingMonths,
      aheadMonths,
      daysCovered: station.days.length,
      dayGaps,
      lastMonth: station.lastMonth,
      lastDay: station.lastDay,
      hasDepartments: station.departments.length > 0,
      hasProfit: Boolean(station.profit),
      closedLatest: Boolean(model.latestMonth && station.months[model.latestMonth]),
    };
  });
}
