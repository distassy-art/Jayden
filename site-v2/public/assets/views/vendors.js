/*
 * Vendors: who the money was actually paid to.
 *
 * The buy page answers "how much is left in each department". This one answers
 * the question that follows it — which supplier took the money — because a
 * department that ran over did so through a named vendor on named dates, and
 * that is the level at which an order can actually be changed.
 */

import {
  barList, downloadCsv, emptyState, esc, icon, isNum, money, moneyShort, num, pct,
} from "../ui.js";
import {
  byStore, byVendor, monthOf, totalsOf,
} from "../vendors.js";
import { bindScopeBar, scopeBar } from "../scope.js";

const CYAN = "var(--cyan-500)";

/** Sep 2026, from a 2026-09 key. */
function label(key) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(key.slice(5, 7)) - 1] || key} ${key.slice(0, 4)}`;
}

/*
 * Coverage differs month to month: the earliest holds a handful of stores, the
 * newest is mid-flight. Saying so is the difference between a reader trusting
 * a fall in spending and being misled by one.
 */
function coverageNote(vendors, month, scope) {
  const bits = [];
  const inScope = scope.stationIds ? scope.stationIds.length : null;

  if (month.key === vendors.latest) {
    bits.push("This month is still being traded, so the total will keep rising.");
  }
  if (isNum(inScope) && month.byStore.size < inScope) {
    bits.push(`${month.byStore.size} of ${inScope} stores in scope have invoices in this month.`);
  }
  if (vendors.excluded.length) {
    bits.push(`${vendors.excluded.length} store${vendors.excluded.length === 1 ? " is" : "s are"} `
      + "excluded from this feed upstream.");
  }
  return bits.length
    ? `<div class="warn-box" style="margin-bottom:16px">${icon("alert")}
        <div>${bits.map((bit) => esc(bit)).join(" ")}</div></div>`
    : "";
}

export function renderVendors(ctx) {
  const { model, scope, data, query } = ctx;
  const vendors = data?.vendors;

  const bar = scopeBar(model, scope, { period: false });
  const heading = `<div class="page-head">
      <h2>Vendors</h2>
      <p>Which suppliers the buying went to for <b>${esc(scope.label)}</b>.
        Purchases show as one figure a month everywhere else; this is the same money
        split by who was paid, and how many invoices it took.</p>
    </div>${bar}`;

  if (!vendors) {
    return `${heading}
      <section class="card"><div class="card-body">
        ${emptyState("No vendor invoices for this scope",
          "This feed covers the delivery invoices collected for the current quarter.")}
      </div></section>`;
  }

  const wanted = query.get("m");
  const key = vendors.keys.includes(wanted) ? wanted : vendors.settled;
  const month = monthOf(vendors, key, { stores: scope.stationIds });

  if (!month || !month.byStore.size) {
    return `${heading}
      <section class="card"><div class="card-body">
        ${emptyState(`No invoices in ${label(key)} for this scope`)}
      </div></section>`;
  }

  const totals = totalsOf(month);
  const vendorRows = byVendor(month);
  const storeRows = byStore(month);
  const biggest = vendorRows[0] || null;

  const months = vendors.keys.map((option) => `<button
    class="${option === key ? "is-active" : ""}"
    data-sort-href="#/vendors?${esc(new URLSearchParams({ ...Object.fromEntries(query), m: option }).toString())}"
    >${esc(label(option))}</button>`).join("");

  const vendorTable = vendorRows.map((row) => `<tr>
    <td class="strong">${esc(row.vendor)}</td>
    <td class="num">${esc(money(row.spend))}</td>
    <td class="num">${esc(pct(row.share, { digits: 1 }))}</td>
    <td class="num muted">${esc(num(row.invoices))}</td>
    <td class="num">${esc(money(row.perInvoice))}</td>
    <td class="num muted">${esc(num(row.stores))}</td>
    <td class="num muted">${esc(row.lastInvoice || "—")}</td>
  </tr>`).join("");

  const storeTable = storeRows.map((row) => {
    const station = model.byId.get(row.storeId);
    return `<tr class="is-clickable" data-href="#/store/${esc(row.storeId)}">
      <td><div class="cell-main"><span class="store-tag">${esc(row.storeId)}</span>
        <span class="strong">${esc(station?.name || row.storeId)}</span></div></td>
      <td class="num">${esc(money(row.spend))}</td>
      <td class="num muted">${esc(num(row.invoices))}</td>
      <td class="num muted">${esc(num(row.vendors))}</td>
      <td>${esc(row.top || "—")}</td>
      <td class="num muted">${esc(moneyShort(row.topSpend))}</td>
    </tr>`;
  }).join("");

  return `${heading}

    <div class="rank-metrics segmented" data-rank style="margin-bottom:16px">${months}</div>

    ${coverageNote(vendors, month, scope)}

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Bought in ${esc(label(key))}</div>
        <div class="stat-value">${esc(money(totals.spend))}</div>
        <div class="stat-foot"><span class="muted">Across ${esc(num(totals.stores))}
          store${totals.stores === 1 ? "" : "s"}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Biggest supplier</div>
        <div class="stat-value" style="font-size:23px">${esc(biggest ? biggest.vendor : "—")}</div>
        <div class="stat-foot"><span class="muted">${biggest
          ? `${esc(moneyShort(biggest.spend))} · ${esc(pct(biggest.share, { digits: 0 }))} of the buy`
          : ""}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Invoices</div>
        <div class="stat-value">${esc(num(totals.invoices))}</div>
        <div class="stat-foot"><span class="muted">From ${esc(num(totals.vendors))}
          supplier${totals.vendors === 1 ? "" : "s"}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Average invoice</div>
        <div class="stat-value">${esc(money(totals.perInvoice))}</div>
        <div class="stat-foot"><span class="muted">Spend divided by invoice count</span></div>
      </div>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Where the money went</h3>
        <span class="hint">${esc(label(key))}</span></div>
      <div class="card-body">${barList(vendorRows.map((row) => ({
        label: row.vendor,
        value: row.spend,
      })), { color: CYAN })}</div>
    </section>

    <section class="card"${storeRows.length > 1 ? ' style="margin-bottom:16px"' : ""}>
      <div class="card-head"><h3>By supplier</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Supplier</th><th class="num">Spend</th><th class="num">Share</th>
          <th class="num">Invoices</th><th class="num">Per invoice</th>
          <th class="num">Stores</th><th class="num">Last invoice</th></tr></thead>
        <tbody>${vendorTable}</tbody>
        <tfoot><tr><td>${esc(label(key))}</td>
          <td class="num">${esc(money(totals.spend))}</td>
          <td class="num">100%</td>
          <td class="num">${esc(num(totals.invoices))}</td>
          <td class="num">${esc(money(totals.perInvoice))}</td>
          <td class="num">${esc(num(totals.stores))}</td>
          <td></td>
        </tr></tfoot>
      </table></div>
    </section>

    ${storeRows.length > 1 ? `<section class="card">
      <div class="card-head"><h3>By store</h3>
        <span class="hint">Who each store's money went to</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Store</th><th class="num">Spend</th><th class="num">Invoices</th>
          <th class="num">Suppliers</th><th>Biggest</th><th class="num">Of which</th></tr></thead>
        <tbody>${storeTable}</tbody>
      </table></div>
    </section>` : ""}`;
}

export function bindVendors(root, ctx) {
  bindScopeBar(root, ctx);

  root.querySelectorAll("[data-sort-href]").forEach((button) => {
    button.addEventListener("click", () => ctx.navigate(button.dataset.sortHref));
  });

  root.querySelectorAll("tr[data-href]").forEach((row) => {
    row.addEventListener("click", () => ctx.navigate(row.dataset.href));
  });

  const csv = root.querySelector("[data-csv]");
  if (csv) {
    csv.addEventListener("click", () => {
      const vendors = ctx.data?.vendors;
      if (!vendors) return;
      const wanted = ctx.query.get("m");
      const key = vendors.keys.includes(wanted) ? wanted : vendors.settled;
      downloadCsv(`vendor-spend-${key}.csv`,
        ["Supplier", "Spend", "Share", "Invoices", "Per invoice", "Stores", "Last invoice"],
        byVendor(monthOf(vendors, key)).map((row) => [
          row.vendor, row.spend, row.share ?? "", row.invoices,
          row.perInvoice ?? "", row.stores, row.lastInvoice || "",
        ]));
    });
  }
}
