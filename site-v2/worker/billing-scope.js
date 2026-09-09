/*
 * Scope the company-wide billing feed down to a single store.
 *
 * The upstream `/billing` endpoint refuses managers outright, so a manager's
 * own bill would be invisible in the console. The static `/data/billing.json`
 * is readable, but it carries every client's invoices — handing it to a
 * manager's browser would leak the rest of the portfolio. This narrows it to
 * one store on the server, returning only that store's own invoice lines and
 * its totals, so nothing another client owns ever reaches the manager's device.
 *
 * Shared verbatim by the deployed worker and the local dev server, so the
 * preview and production behave identically.
 */

function str(value) {
  return value == null ? "" : String(value);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** The station id a manager's login maps to, from the logins directory. */
export function stationForEmail(logins, email) {
  const want = str(email).trim().toLowerCase();
  if (!want) return "";
  const at = want.indexOf("@");
  const local = at === -1 ? want : want.slice(0, at);
  for (const account of logins?.accounts || []) {
    const stored = str(account.email || account.username).trim().toLowerCase();
    if (!stored) continue;
    const storedLocal = stored.indexOf("@") === -1 ? stored : stored.slice(0, stored.indexOf("@"));
    if (stored === want || storedLocal === want || stored === local || storedLocal === local) {
      return str(account.station_id);
    }
  }
  return "";
}

/**
 * A store-scoped billing view: only this store's invoice lines, and its totals.
 *
 * An invoice that belongs entirely to this store keeps its real total (which can
 * include a percentage-of-profit line, not just the per-line fees). A mixed
 * invoice — lines from more than one store on one document — is reduced to this
 * store's lines and their fees, and no other store's line is carried through.
 */
export function billingForStore(billing, store) {
  const id = str(store);
  const invoices = [];

  for (const invoice of billing?.invoices || []) {
    const allLines = invoice.lines || [];
    const mine = allLines.filter((line) => str(line.store) === id);
    const foreign = allLines.filter((line) => str(line.store) && str(line.store) !== id);
    const namesStore = str(invoice.store) === id
      || (Array.isArray(invoice.stores) && invoice.stores.map(str).includes(id));

    if (!mine.length && !namesStore) continue;

    // Whole-store invoice: trust its own total. Mixed: sum only our lines' fees.
    const wholeStore = foreign.length === 0;
    const total = wholeStore
      ? Number(invoice.total) || mine.reduce((sum, line) => sum + (Number(line.fee) || 0), 0)
      : mine.reduce((sum, line) => sum + (Number(line.fee) || 0), 0);

    invoices.push({
      id: invoice.id,
      month: invoice.month,
      date: invoice.date,
      kind: invoice.kind,
      description: invoice.description,
      invoiceCount: invoice.invoiceCount ?? null,
      status: invoice.status,
      paidAt: invoice.paidAt || null,
      total: round2(total),
      pdf: invoice.pdf || null,
      lines: mine.map((line) => ({
        store: id,
        date: line.date,
        vendor: line.vendor,
        invoice: line.invoice,
        amount: line.amount ?? null,
        billableLines: line.billableLines ?? null,
        unitCost: line.unitCost ?? null,
        fee: line.fee ?? null,
        description: line.description,
      })),
    });
  }

  invoices.sort((a, b) => str(b.date).localeCompare(str(a.date)));

  const total = invoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const unpaidTotal = invoices
    .filter((invoice) => str(invoice.status).toLowerCase() !== "paid")
    .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);

  return {
    ok: true,
    applicable: true,
    store: id,
    month: billing?.month || null,
    rate: billing?.rate ?? null,
    rateNote: billing?.rateNote || null,
    updatedAt: billing?.updatedAt || null,
    invoices,
    total: round2(total),
    unpaidTotal: round2(unpaidTotal),
  };
}
