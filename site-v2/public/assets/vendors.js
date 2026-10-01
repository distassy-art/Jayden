/*
 * Who the buying went to.
 *
 * The overlay reports purchases as one number per store per month, which is
 * enough to see that buying rose and useless for doing anything about it. This
 * feed breaks the same money out by vendor, with invoice counts and dates, so
 * a month that ran over can be traced to the vendor that caused it.
 *
 * Coverage is uneven and has to be carried around rather than hidden: the
 * earliest month holds only a handful of stores, the newest is still being
 * traded, and one store is excluded upstream altogether. A page that quietly
 * summed across those would show buying collapsing and then exploding.
 */

import { isNum } from "./ui.js";

/** One store's line with one vendor, in one month. */
function normaliseLine(vendor, raw) {
  const spend = isNum(raw?.mtd_total) ? Number(raw.mtd_total) : null;
  const invoices = isNum(raw?.invoice_count) ? Number(raw.invoice_count) : null;
  return {
    vendor,
    spend,
    invoices,
    // Recomputed rather than trusted: the feed carries its own average, and a
    // stale one would disagree with the two numbers printed beside it.
    perInvoice: isNum(spend) && invoices ? spend / invoices : null,
    dates: Array.isArray(raw?.invoice_dates) ? raw.invoice_dates.slice() : [],
    lastInvoice: Array.isArray(raw?.invoice_dates) && raw.invoice_dates.length
      ? raw.invoice_dates.slice().sort().at(-1)
      : null,
  };
}

/**
 * Index the feed by month, keeping only the stores in scope.
 *
 * `stores` is the set of station ids the signed-in account may see; passing
 * null means the whole portfolio.
 */
export function buildVendors(feed, { stores = null } = {}) {
  if (!feed?.months) return null;
  const allowed = stores ? new Set(stores.map(String)) : null;

  const months = Object.entries(feed.months)
    .map(([key, value]) => {
      const byStore = new Map();
      Object.entries(value?.stores || {}).forEach(([id, vendors]) => {
        if (allowed && !allowed.has(String(id))) return;
        const lines = Object.entries(vendors || {})
          .map(([vendor, raw]) => normaliseLine(vendor, raw))
          .filter((line) => isNum(line.spend));
        if (lines.length) byStore.set(String(id), lines);
      });
      return { key, byStore };
    })
    .filter((month) => month.byStore.size)
    .sort((a, b) => a.key.localeCompare(b.key));

  if (!months.length) return null;

  return {
    months,
    keys: months.map((month) => month.key),
    // The newest month is partial by definition, so the default lands on the
    // last one that is not still being written to.
    latest: months.at(-1).key,
    settled: months.length > 1 ? months.at(-2).key : months.at(-1).key,
    excluded: (feed.missing_stores || []).map(String),
    note: feed.meta?.note || "",
  };
}

/**
 * One month, or null if the feed does not carry it.
 *
 * `stores` narrows to the current scope — an owner or a single store. It is
 * separate from the `stores` passed to `buildVendors`, which is the wider set
 * the account is allowed to see at all: an admin may see everything and still
 * be looking at one client.
 */
export function monthOf(vendors, key, { stores = null } = {}) {
  const month = vendors?.months.find((entry) => entry.key === key) || null;
  if (!month || !stores) return month;

  const wanted = new Set(stores.map(String));
  const byStore = new Map();
  month.byStore.forEach((lines, id) => {
    if (wanted.has(String(id))) byStore.set(id, lines);
  });
  return { key: month.key, byStore };
}

/** Every line in a month, flattened across the stores in scope. */
export function linesOf(month) {
  if (!month) return [];
  const out = [];
  month.byStore.forEach((lines, storeId) => {
    lines.forEach((line) => out.push({ ...line, storeId }));
  });
  return out;
}

/** Spend rolled up by vendor, biggest first. */
export function byVendor(month) {
  const merged = new Map();

  linesOf(month).forEach((line) => {
    if (!merged.has(line.vendor)) {
      merged.set(line.vendor, {
        vendor: line.vendor, spend: 0, invoices: 0, stores: new Set(), lastInvoice: null,
      });
    }
    const row = merged.get(line.vendor);
    row.spend += line.spend;
    row.invoices += line.invoices || 0;
    row.stores.add(line.storeId);
    if (line.lastInvoice && (!row.lastInvoice || line.lastInvoice > row.lastInvoice)) {
      row.lastInvoice = line.lastInvoice;
    }
  });

  const rows = [...merged.values()].map((row) => ({
    ...row,
    stores: row.stores.size,
    perInvoice: row.invoices ? row.spend / row.invoices : null,
  })).sort((a, b) => b.spend - a.spend);

  const total = rows.reduce((sum, row) => sum + row.spend, 0);
  return rows.map((row) => ({ ...row, share: total ? row.spend / total : null }));
}

/** Spend rolled up by store, biggest first. */
export function byStore(month) {
  if (!month) return [];
  const rows = [];
  month.byStore.forEach((lines, storeId) => {
    const spend = lines.reduce((sum, line) => sum + line.spend, 0);
    const invoices = lines.reduce((sum, line) => sum + (line.invoices || 0), 0);
    const top = lines.slice().sort((a, b) => b.spend - a.spend)[0] || null;
    rows.push({
      storeId,
      spend,
      invoices,
      vendors: lines.length,
      top: top ? top.vendor : null,
      topSpend: top ? top.spend : null,
    });
  });
  return rows.sort((a, b) => b.spend - a.spend);
}

/** Totals for a month across the stores in scope. */
export function totalsOf(month) {
  const lines = linesOf(month);
  const spend = lines.reduce((sum, line) => sum + line.spend, 0);
  const invoices = lines.reduce((sum, line) => sum + (line.invoices || 0), 0);
  return {
    spend,
    invoices,
    perInvoice: invoices ? spend / invoices : null,
    vendors: new Set(lines.map((line) => line.vendor)).size,
    stores: month ? month.byStore.size : 0,
  };
}
