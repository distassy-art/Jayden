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
 */
export function buildModel(overlay) {
  const raw = overlay?.overlay?.stations || {};
  const stations = Object.entries(raw)
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

  const currentYear = latestMonth ? latestMonth.slice(0, 4) : String(new Date().getFullYear());
  const ytdKeys = allMonths.filter((key) => key.startsWith(currentYear)
    && (!latestMonth || key <= latestMonth));
  const priorYtdKeys = priorYearKeys(ytdKeys);

  return {
    stations,
    byId: new Map(stations.map((s) => [s.id, s])),
    allMonths,
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
      trend: seriesFor(station, model.allMonths.slice(-12), "total_profit"),
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
  const { s2k, billing, tickets, days, pricing, orders } = extras;

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
    const expected = model.allMonths.filter((key) => key >= (station.monthKeys[0] || key));
    const missingMonths = expected.filter((key) => !station.months[key]);

    const dayGaps = [];
    for (let i = 1; i < station.days.length; i += 1) {
      const previous = new Date(`${station.days[i - 1].date}T00:00:00`);
      const current = new Date(`${station.days[i].date}T00:00:00`);
      const gap = Math.round((current - previous) / 86400000);
      if (gap > 1) dayGaps.push({ from: station.days[i - 1].date, to: station.days[i].date, days: gap - 1 });
    }

    return {
      station,
      monthsCovered: station.monthKeys.length,
      missingMonths,
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
