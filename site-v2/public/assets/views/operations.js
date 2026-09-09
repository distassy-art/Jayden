/* S2K invoice audit, vendor orders and pricing sheets. */

import {
  dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon, isNum, money,
  monthLabel, num, timeAgo,
} from "../ui.js";
import { apiUrl } from "../data.js";
import { inScope } from "../scope.js";

/** Options for a <select>, with `all` first. */
function options(values, selected, allLabel) {
  return [`<option value="">${esc(allLabel)}</option>`]
    .concat(values.map((value) => `<option value="${esc(value.id)}"${value.id === selected ? " selected" : ""}>${esc(value.label)}</option>`))
    .join("");
}

function monthOf(row) {
  return String(row.date || row.month || "").slice(0, 7);
}

function uniqueSorted(rows, get) {
  return [...new Set(rows.map(get).filter(Boolean))].sort();
}

function filterBar(controls) {
  return `<div class="filter-bar">${controls.join("")}</div>`;
}

function selectField(id, label, list, selected, allLabel) {
  return `<div class="field"><label for="${esc(id)}">${esc(label)}</label>
    <select class="select" id="${esc(id)}" data-filter="${esc(id)}">${options(list, selected, allLabel)}</select></div>`;
}

/* -------------------------------------------------------------------------
   S2K invoices
   ------------------------------------------------------------------------- */

export function renderInvoices(ctx) {
  const { data, query } = ctx;
  const s2k = data.s2k;
  if (!s2k) {
    return notice("S2K invoices unavailable", data.errors?.s2k || "The invoice audit feed did not load.");
  }

  const tab = query.get("tab") === "entered" ? "entered" : "missing";
  // Narrowed to the stores in view before anything is counted, so the totals
  // and the tab badges agree with the table underneath them.
  const entered = inScope(ctx.model, ctx.scope, s2k.entered);
  const missing = inScope(ctx.model, ctx.scope, s2k.missing);
  const rows = tab === "entered" ? entered : missing;

  const month = query.get("month") || "";
  const store = query.get("store") || "";
  const vendor = query.get("vendor") || "";

  const filtered = rows.filter((row) => (!month || monthOf(row) === month)
    && (!store || String(row.store) === store)
    && (!vendor || String(row.vendor) === vendor));

  const total = filtered.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const missingTotal = missing.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const months = uniqueSorted(rows, monthOf).map((key) => ({ id: key, label: monthLabel(key) }));
  const stores = uniqueSorted(rows, (row) => String(row.store || ""))
    .map((id) => ({ id, label: `${id} · ${rows.find((r) => String(r.store) === id)?.client || ""}`.trim() }));
  const vendors = uniqueSorted(rows, (row) => String(row.vendor || "")).map((id) => ({ id, label: id }));

  const body = filtered.length ? `<div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Date</th><th>Store</th><th>Vendor</th>
        ${tab === "entered" ? "<th>Invoice</th>" : "<th>Sheet</th>"}
        <th class="num">Amount</th><th>Status</th>
      </tr></thead>
      <tbody>${filtered.map((row) => `<tr>
        <td class="nowrap">${esc(dateLabel(row.date))}</td>
        <td><div class="cell-main"><span class="store-tag">${esc(row.store)}</span>
          <span>${esc(row.client || "")}</span></div></td>
        <td class="strong">${esc(row.vendor || "—")}</td>
        <td class="muted">${esc(tab === "entered" ? row.invoice || "—" : row.sheet || "—")}</td>
        <td class="num strong">${esc(money(row.amount, { cents: true }))}</td>
        <td><span class="badge ${tab === "entered" ? "pos" : "neg"}">${esc(row.status || row.audit_status || "")}</span></td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">${esc(filtered.length)} invoice${filtered.length === 1 ? "" : "s"}</td>
        <td class="num">${esc(money(total, { cents: true }))}</td><td></td></tr></tfoot>
    </table></div>`
    : emptyState("No invoices match these filters", "Clear a filter to widen the search.");

  return `
    <div class="page-head">
      <h2>S2K invoices</h2>
      <p>Invoices logged against a store, checked against what actually reached S2K.
      Anything in <b>Missing</b> is cost that has not landed in the books yet.</p>
    </div>

    <div class="grid cols-3" style="margin-bottom:16px">
      ${miniStat("Missing from S2K", num(missing.length), money(missingTotal), "neg")}
      ${miniStat("Entered in S2K", num((s2k.entered || []).length), "Confirmed against the audit export", "pos")}
      ${miniStat("Audit refreshed", s2k.updatedAt ? timeAgo(s2k.updatedAt) : "—", s2k.updatedAt ? dateLabel(s2k.updatedAt) : "")}
    </div>

    <section class="card">
      <div class="card-head">
        <div class="segmented" data-tabs>
          <button class="${tab === "missing" ? "is-active" : ""}" data-tab="missing">Missing (${esc(missing.length)})</button>
          <button class="${tab === "entered" ? "is-active" : ""}" data-tab="entered">Entered (${esc((s2k.entered || []).length)})</button>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-csv>${icon("download")}CSV</button>
      </div>
      <div class="card-body" style="padding-bottom:0">
        ${filterBar([
          selectField("month", "Month", months, month, "All months"),
          selectField("store", "Store", stores, store, "All stores"),
          selectField("vendor", "Vendor", vendors, vendor, "All vendors"),
        ])}
      </div>
      ${body}
    </section>
  `;
}

export function bindInvoices(root, ctx) {
  bindFilters(root, ctx, "#/invoices");
  const csv = root.querySelector("[data-csv]");
  if (csv) {
    csv.addEventListener("click", () => {
      const tab = ctx.query.get("tab") === "entered" ? "entered" : "missing";
      const rows = inScope(ctx.model, ctx.scope, ctx.data.s2k?.[tab]);
      downloadCsv(`s2k-${tab}.csv`,
        ["Date", "Store", "Client", "Vendor", "Invoice", "Amount", "Status"],
        rows.map((row) => [row.date, row.store, row.client, row.vendor,
          row.invoice || row.sheet || "", row.amount, row.status || row.audit_status || ""]));
    });
  }
}

/* -------------------------------------------------------------------------
   Vendor orders
   ------------------------------------------------------------------------- */

export function renderOrders(ctx) {
  const { data, query } = ctx;
  const orders = data.orders;
  if (!orders) {
    return notice("Vendor orders unavailable", data.errors?.orders || "The vendor order feed did not load.");
  }

  const tab = query.get("tab") === "schedule" ? "schedule" : "sends";
  const sends = inScope(ctx.model, ctx.scope, orders.sends);
  const schedules = inScope(ctx.model, ctx.scope, orders.schedules);

  if (tab === "schedule") {
    const cards = schedules.map((entry) => `<section class="card">
      <div class="card-head">
        <h3>${esc(entry.name)}</h3>
        <span class="store-tag">${esc(entry.store)}</span>
        <span class="spacer"></span>
        <span class="hint truncate">${esc(entry.orderTo || "")}</span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Vendor</th><th>Draft</th><th>Salesman</th><th>Delivery</th><th>Method</th></tr></thead>
        <tbody>${(entry.vendors || []).map((vendor) => `<tr>
          <td class="strong">${esc(vendor.vendor)}</td>
          <td>${esc(vendor.draftDay || "—")}${vendor.draftTime ? ` <span class="muted">${esc(vendor.draftTime)}</span>` : ""}</td>
          <td class="muted">${esc(vendor.salesman || "—")}</td>
          <td>${esc(vendor.delivery || "—")}</td>
          <td class="muted">${esc(vendor.method || "—")}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>`).join("");

    return `${ordersHead(orders, sends)}
      ${ordersTabs(tab, sends, schedules)}
      <div class="stack">${cards || emptyState("No vendor schedules on file")}</div>`;
  }

  const month = query.get("month") || "";
  const store = query.get("store") || "";
  const vendor = query.get("vendor") || "";

  const filtered = sends.filter((send) => (!month || String(send.dateSent || "").slice(0, 7) === month)
    && (!store || String(send.store || "") === store)
    && (!vendor || String(send.vendor || vendorOf(send)) === vendor));

  const months = uniqueSorted(sends, (send) => String(send.dateSent || "").slice(0, 7))
    .map((key) => ({ id: key, label: monthLabel(key) }));
  const stores = uniqueSorted(sends, (send) => String(send.store || "")).map((id) => ({ id, label: id }));
  const vendors = uniqueSorted(sends, vendorOf).map((id) => ({ id, label: id }));

  const rows = filtered.map((send) => {
    const ai = Number(send.aiAmount);
    const actual = Number(send.actualAmount ?? send.invoiceAmount);
    const diff = isNum(ai) && isNum(actual) ? actual - ai : null;
    const pending = /awaiting/i.test(String(send.status || ""));
    return `<tr>
      <td class="nowrap">${esc(dateLabel(send.dateSent))}</td>
      <td>${esc(vendorOf(send))}</td>
      <td class="truncate" style="max-width:22ch">${esc(send.emailTo || "—")}</td>
      <td class="num">${esc(money(ai, { cents: true }))}</td>
      <td class="num">${isNum(actual) ? esc(money(actual, { cents: true })) : '<span class="muted">—</span>'}</td>
      <td class="num">${isNum(diff)
        ? `<span class="badge ${diff > 0 ? "neg" : "pos"}">${diff > 0 ? "+" : ""}${esc(money(diff, { cents: true }))}</span>`
        : '<span class="muted">—</span>'}</td>
      <td class="muted">${esc(send.size || "—")}</td>
      <td><span class="badge ${pending ? "warn" : "pos"}">${esc(send.status || "—")}</span></td>
      <td>${send.pdfUrl
        ? `<a class="btn btn-sm btn-ghost" href="${esc(upstream(send.pdfUrl))}" target="_blank" rel="noopener">${icon("external")}PDF</a>`
        : ""}</td>
    </tr>`;
  }).join("");

  return `${ordersHead(orders, sends)}
    ${ordersTabs(tab, sends, schedules)}
    <section class="card">
      <div class="card-head">
        <h3>Orders sent</h3>
        <span class="hint">Difference is actual minus what the AI ordered — positive means the store took more than the plan</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-csv>${icon("download")}CSV</button>
      </div>
      <div class="card-body" style="padding-bottom:0">
        ${filterBar([
          selectField("month", "Month", months, month, "All months"),
          selectField("store", "Store", stores, store, "All stores"),
          selectField("vendor", "Vendor", vendors, vendor, "All vendors"),
        ])}
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Sent</th><th>Vendor</th><th>To</th><th class="num">AI order</th>
          <th class="num">Actual</th><th class="num">Difference</th><th>Size</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="9">${emptyState("No orders match these filters")}</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function vendorOf(send) {
  if (send.vendor) return String(send.vendor);
  // Older records only carry the subject line, which starts with the vendor.
  const subject = String(send.subject || "");
  return subject.split(/\s+/)[0] || "—";
}

function ordersHead(orders, sends) {
  const awaiting = sends.filter((send) => /awaiting/i.test(String(send.status || ""))).length;
  const planned = sends.reduce((sum, send) => sum + (Number(send.aiAmount) || 0), 0);
  return `<div class="page-head">
      <h2>Vendor orders</h2>
      <p>Orders the assistant sends on behalf of each store, and the standing draft and delivery schedule.
      ${orders.fromMailbox ? `Sent from <b>${esc(orders.fromMailbox)}</b>.` : ""}</p>
    </div>
    <div class="grid cols-3" style="margin-bottom:16px">
      ${miniStat("Orders sent", num(sends.length), orders.updatedAt ? `Updated ${timeAgo(orders.updatedAt)}` : "")}
      ${miniStat("Awaiting an invoice", num(awaiting), "Sent with nothing logged back", awaiting ? "warn" : "pos")}
      ${miniStat("Ordered value", money(planned), "Total the assistant put on order")}
    </div>`;
}

function ordersTabs(tab, sends, schedules) {
  return `<div class="segmented" data-tabs style="margin-bottom:16px">
    <button class="${tab === "sends" ? "is-active" : ""}" data-tab="sends">Orders (${esc(sends.length)})</button>
    <button class="${tab === "schedule" ? "is-active" : ""}" data-tab="schedule">Schedule (${esc(schedules.length)})</button>
  </div>`;
}

export function bindOrders(root, ctx) {
  bindFilters(root, ctx, "#/orders");
  const csv = root.querySelector("[data-csv]");
  if (csv) {
    csv.addEventListener("click", () => {
      const sends = inScope(ctx.model, ctx.scope, ctx.data.orders?.sends);
      downloadCsv("vendor-orders.csv",
        ["Sent", "Vendor", "To", "AI amount", "Actual", "Size", "Status", "Attachment"],
        sends.map((send) => [send.dateSent, vendorOf(send), send.emailTo, send.aiAmount,
          send.actualAmount ?? send.invoiceAmount ?? "", send.size, send.status, send.pdfName || ""]));
    });
  }
}

/* -------------------------------------------------------------------------
   Pricing
   ------------------------------------------------------------------------- */

export function renderPricing(ctx) {
  const { data } = ctx;
  const pricing = data.pricing;
  if (!pricing) {
    return notice("Pricing unavailable", data.errors?.pricing || "The pricing feed did not load.");
  }

  const days = inScope(ctx.model, ctx.scope, pricing.days)
    .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const rows = days.map((day) => `<tr>
    <td class="nowrap">${esc(dateLabel(day.date))}</td>
    <td><div class="cell-main"><span class="store-tag">${esc(day.store)}</span><span>${esc(day.client || "")}</span></div></td>
    <td class="num">${esc(num(day.itemCount))}</td>
    <td>${day.pdfUrl
      ? `<a class="btn btn-sm" href="${esc(upstream(day.pdfUrl))}" target="_blank" rel="noopener">${icon("external")}Open sheet</a>`
      : '<span class="muted">No sheet</span>'}</td>
  </tr>`).join("");

  return `
    <div class="page-head">
      <h2>Pricing</h2>
      <p>Price-change sheets published for client stores.${pricing.note ? ` ${esc(pricing.note)}` : ""}</p>
    </div>
    <section class="card">
      <div class="card-head">
        <h3>Published price changes</h3>
        <span class="spacer"></span>
        <span class="hint">${pricing.updatedAt ? `Updated ${esc(timeAgo(pricing.updatedAt))}` : ""}</span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Store</th><th class="num">Items</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">${emptyState("No price changes published yet")}</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

/* -------------------------------------------------------------------------
   Shared
   ------------------------------------------------------------------------- */

/** PDFs and other binaries still live on the production origin. */
function upstream(path) {
  return apiUrl(`/api/asset${String(path).startsWith("/") ? "" : "/"}${path}`);
}

function miniStat(label, value, detail, tone = "") {
  return `<div class="stat" style="min-height:96px">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${tone === "neg" ? " neg-text" : ""}" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot">${tone ? `<span class="dot ${esc(tone)}"></span>` : ""}<span>${esc(detail || "")}</span></div>
  </div>`;
}

function notice(title, detail) {
  return `<div class="page-head"><h2>${esc(title)}</h2></div>
    <div class="error-box">${icon("alert")}<div><b>${esc(title)}</b><div>${esc(detail)}</div>
    <button class="btn btn-sm" data-reload style="margin-top:10px">${icon("refresh")}Retry</button></div></div>`;
}

/** Wire tab buttons and filter selects to the URL so views stay linkable. */
function bindFilters(root, ctx, base) {
  const { navigate, query } = ctx;

  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const params = new URLSearchParams();
      params.set("tab", button.dataset.tab);
      navigate(`${base}?${params.toString()}`);
    });
  });

  root.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      const params = new URLSearchParams(query);
      if (select.value) params.set(select.dataset.filter, select.value);
      else params.delete(select.dataset.filter);
      navigate(`${base}?${params.toString()}`);
    });
  });
}

export { bindFilters };
