/* Client billing, manager tickets and data health. */

import {
  dateLabel, daysSince, downloadCsv, emptyState, esc, icon, isNum, money,
  monthLabel, num, timeAgo,
} from "../ui.js";
import { dataHealth } from "../analytics.js";
import { inScope, invoiceStores } from "../scope.js";

function amountOf(invoice) {
  const candidates = [invoice.total, invoice.amount, invoice.grandTotal];
  const found = candidates.find(isNum);
  if (isNum(found)) return Number(found);
  return (invoice.lines || []).reduce((sum, line) => sum + (Number(line.amount ?? line.total) || 0), 0);
}

function isPaid(invoice) {
  return String(invoice.status || "").toLowerCase() === "paid" || invoice.paid === true;
}

/* -------------------------------------------------------------------------
   Billing
   ------------------------------------------------------------------------- */

export function renderBilling(ctx) {
  const { data, query } = ctx;
  const billing = data.billing;
  if (!billing) {
    return `<div class="page-head"><h2>Billing</h2></div>
      <div class="error-box">${icon("alert")}<div><b>Billing unavailable</b>
      <div>${esc(data.errors?.billing || "The billing feed did not load.")}</div></div></div>`;
  }

  // An invoice covers a whole client, so it is matched on the stores named in
  // its line items rather than on a single store field.
  const invoices = inScope(ctx.model, ctx.scope, billing.invoices, invoiceStores);
  const expenses = billing.expenses || [];

  const month = query.get("month") || "";
  const client = query.get("client") || "";
  const status = query.get("status") || "";

  const filtered = invoices.filter((invoice) => (!month || String(invoice.month || "") === month)
    && (!client || String(invoice.client || "") === client)
    && (!status || (status === "paid" ? isPaid(invoice) : !isPaid(invoice))));

  const billed = invoices.reduce((sum, invoice) => sum + amountOf(invoice), 0);
  const collected = invoices.filter(isPaid).reduce((sum, invoice) => sum + amountOf(invoice), 0);
  const outstanding = billed - collected;
  const spend = expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const months = [...new Set(invoices.map((i) => String(i.month || "")).filter(Boolean))].sort().reverse();
  const clients = [...new Set(invoices.map((i) => String(i.client || "")).filter(Boolean))].sort();

  const rows = filtered
    .slice()
    .sort((a, b) => String(b.date || b.month).localeCompare(String(a.date || a.month)))
    .map((invoice) => {
      const paid = isPaid(invoice);
      const age = paid ? null : daysSince(invoice.date);
      return `<tr>
        <td class="nowrap">${esc(dateLabel(invoice.date))}</td>
        <td class="strong">${esc(invoice.client || "—")}</td>
        <td class="nowrap muted">${esc(monthLabel(invoice.month, true))}</td>
        <td class="truncate" style="max-width:38ch" title="${esc(invoice.description || "")}">${esc(invoice.description || "—")}</td>
        <td class="num strong">${esc(money(amountOf(invoice), { cents: true }))}</td>
        <td><span class="badge ${paid ? "pos" : "warn"}">${paid ? "Paid" : "Unpaid"}</span></td>
        <td class="num muted">${age != null && age > 0 ? `${esc(num(age))}d` : ""}</td>
      </tr>`;
    }).join("");

  return `
    <div class="page-head">
      <h2>Billing</h2>
      <p>Invoices issued to clients and what Smart Solutions has collected.
      ${billing.rate ? `Standard setup fee <b>${esc(money(billing.rate))}</b>.` : ""}
      ${billing.updatedAt ? `Updated ${esc(timeAgo(billing.updatedAt))}.` : ""}</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:16px">
      ${figure("Billed", money(billed), `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`)}
      ${figure("Collected", money(collected), `${invoices.filter(isPaid).length} paid`, "pos")}
      ${figure("Outstanding", money(outstanding), `${invoices.filter((i) => !isPaid(i)).length} unpaid`, outstanding > 0 ? "warn" : "pos")}
      ${figure("Expenses", money(spend), `${expenses.length} recorded`)}
    </div>

    <section class="card">
      <div class="card-head">
        <h3>Client invoices</h3>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-csv>${icon("download")}CSV</button>
      </div>
      <div class="card-body" style="padding-bottom:0">
        <div class="filter-bar">
          <div class="field"><label for="month">Month</label>
            <select class="select" id="month" data-filter="month">
              <option value="">All months</option>
              ${months.map((key) => `<option value="${esc(key)}"${key === month ? " selected" : ""}>${esc(monthLabel(key))}</option>`).join("")}
            </select></div>
          <div class="field"><label for="client">Client</label>
            <select class="select" id="client" data-filter="client">
              <option value="">All clients</option>
              ${clients.map((name) => `<option value="${esc(name)}"${name === client ? " selected" : ""}>${esc(name)}</option>`).join("")}
            </select></div>
          <div class="field"><label for="status">Status</label>
            <select class="select" id="status" data-filter="status">
              <option value="">All</option>
              <option value="unpaid"${status === "unpaid" ? " selected" : ""}>Unpaid</option>
              <option value="paid"${status === "paid" ? " selected" : ""}>Paid</option>
            </select></div>
        </div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Date</th><th>Client</th><th>Period</th><th>Description</th>
          <th class="num">Amount</th><th>Status</th><th class="num">Age</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${emptyState("No invoices match these filters")}</td></tr>`}</tbody>
        <tfoot><tr>
          <td colspan="4">${esc(filtered.length)} shown</td>
          <td class="num">${esc(money(filtered.reduce((sum, i) => sum + amountOf(i), 0), { cents: true }))}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table></div>
    </section>

    ${expenses.length ? `<section class="card" style="margin-top:16px">
      <div class="card-head"><h3>Expenses</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Category</th><th>Payee</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${expenses.map((row) => `<tr>
          <td class="nowrap">${esc(dateLabel(row.date))}</td>
          <td>${esc(row.category || "—")}</td>
          <td>${esc(row.payee || "—")}</td>
          <td class="num">${esc(money(row.amount, { cents: true }))}</td>
          <td class="muted truncate" style="max-width:36ch">${esc(row.notes || "")}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>` : ""}
  `;
}

export function bindBilling(root, ctx) {
  root.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      const params = new URLSearchParams(ctx.query);
      if (select.value) params.set(select.dataset.filter, select.value);
      else params.delete(select.dataset.filter);
      ctx.navigate(`#/billing?${params.toString()}`);
    });
  });

  const csv = root.querySelector("[data-csv]");
  if (csv) {
    csv.addEventListener("click", () => {
      const invoices = inScope(ctx.model, ctx.scope, ctx.data.billing?.invoices, invoiceStores);
      downloadCsv("client-invoices.csv",
        ["Date", "Client", "Month", "Description", "Amount", "Status"],
        invoices.map((invoice) => [invoice.date, invoice.client, invoice.month,
          invoice.description, amountOf(invoice), isPaid(invoice) ? "Paid" : "Unpaid"]));
    });
  }
}

/* -------------------------------------------------------------------------
   Tickets and approvals
   ------------------------------------------------------------------------- */

export function renderTickets(ctx) {
  const { data } = ctx;
  const tickets = inScope(ctx.model, ctx.scope, data.tickets?.tickets,
    (row) => row.store ?? row.station_id);
  const pending = inScope(ctx.model, ctx.scope, data.days?.items,
    (row) => row.store ?? row.station_id);

  const open = tickets.filter((t) => String(t.status || "open").toLowerCase() !== "closed");
  const closed = tickets.filter((t) => String(t.status || "").toLowerCase() === "closed");

  const ticketCard = (ticket) => `<article class="card">
    <div class="card-head">
      <h3>${esc(ticket.subject || ticket.title || "Manager ticket")}</h3>
      <span class="badge ${String(ticket.status).toLowerCase() === "closed" ? "" : "warn"}">${esc(ticket.status || "open")}</span>
      <span class="spacer"></span>
      <span class="hint">${esc(ticket.store || "")} ${ticket.createdAt ? `· ${esc(timeAgo(ticket.createdAt))}` : ""}</span>
    </div>
    <div class="card-body">
      ${(ticket.messages || []).map((message) => `<div class="msg">
        <div class="msg-meta"><b>${esc(message.from || message.author || "—")}</b>
          <span class="muted">${esc(message.at ? dateLabel(message.at) : "")}</span></div>
        <div>${esc(message.text || message.body || "")}</div>
      </div>`).join("") || `<p class="muted">${esc(ticket.body || ticket.text || "No message body.")}</p>`}
    </div>
  </article>`;

  return `
    <div class="page-head">
      <h2>Tickets and approvals</h2>
      <p>Questions raised by store managers, and days submitted for sign-off.
      This view is read-only in the preview — replies still happen on the live site.</p>
    </div>

    <div class="grid cols-3" style="margin-bottom:16px">
      ${figure("Open tickets", num(open.length), "Waiting on Smart Solutions", open.length ? "warn" : "pos")}
      ${figure("Days awaiting approval", num(pending.length), "Submitted by managers", pending.length ? "warn" : "pos")}
      ${figure("Closed tickets", num(closed.length), "Resolved")}
    </div>

    ${pending.length ? `<section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Awaiting approval</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Store</th><th>Submitted by</th><th>Status</th></tr></thead>
        <tbody>${pending.map((item) => `<tr>
          <td class="nowrap">${esc(dateLabel(item.date))}</td>
          <td>${esc(item.store || item.station || "—")}</td>
          <td>${esc(item.by || item.email || "—")}</td>
          <td><span class="badge warn">${esc(item.status || "pending")}</span></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>` : ""}

    <div class="stack">
      ${open.length ? open.map(ticketCard).join("") : `<section class="card"><div class="card-body">
        ${emptyState("No open tickets", "Every manager question has been answered.", "check")}</div></section>`}
    </div>

    ${closed.length ? `<details style="margin-top:16px">
      <summary class="btn btn-ghost" style="display:inline-flex">Closed tickets (${esc(closed.length)})</summary>
      <div class="stack" style="margin-top:12px">${closed.map(ticketCard).join("")}</div>
    </details>` : ""}
  `;
}

/* -------------------------------------------------------------------------
   Data health
   ------------------------------------------------------------------------- */

export function renderHealth(ctx) {
  const { model, data } = ctx;
  const health = dataHealth(model);

  const behind = health.filter((row) => !row.closedLatest);
  const withGaps = health.filter((row) => row.dayGaps.length);
  const staleDays = health.filter((row) => {
    const age = daysSince(row.lastDay);
    return age != null && age > 10;
  });

  const rows = health.map((row) => {
    const dayAge = daysSince(row.lastDay);
    const stale = dayAge != null && dayAge > 10;
    return `<tr class="is-clickable" data-href="#/store/${esc(row.station.id)}">
      <td><div class="cell-main"><span class="store-tag">${esc(row.station.id)}</span>
        <span class="strong">${esc(row.station.name)}</span></div></td>
      <td>${row.closedLatest
        ? `<span class="badge pos">${icon("check")}Closed</span>`
        : '<span class="badge neg">Not closed</span>'}</td>
      <td class="nowrap">${esc(monthLabel(row.lastMonth, true))}
        ${row.aheadMonths.length
          ? `<span class="badge info" title="Part-month, kept out of trends until it closes">${esc(monthLabel(row.aheadMonths[0], true))} in progress</span>`
          : ""}</td>
      <td class="num">${esc(num(row.monthsCovered))}</td>
      <td class="nowrap">${esc(row.lastDay ? dateLabel(row.lastDay) : "—")}
        ${stale ? `<span class="badge warn" style="margin-left:6px">${esc(num(dayAge))}d old</span>` : ""}</td>
      <td class="num">${esc(num(row.daysCovered))}</td>
      <td class="num">${row.dayGaps.length
        ? `<span class="badge warn">${esc(num(row.dayGaps.reduce((sum, gap) => sum + gap.days, 0)))} missing</span>`
        : '<span class="badge pos">None</span>'}</td>
      <td>${row.hasDepartments ? `<span class="dot pos"></span>` : `<span class="dot warn"></span>`}</td>
    </tr>`;
  }).join("");

  const feedRows = [
    ["Books overlay", data.overlay, model.updatedAt],
    ["S2K invoice audit", data.s2k, data.s2k?.updatedAt],
    ["Vendor orders", data.orders, data.orders?.updatedAt],
    ["Billing", data.billing, data.billing?.updatedAt],
    ["Pricing", data.pricing, data.pricing?.updatedAt],
    ["Manager tickets", data.tickets, null],
    ["Day approvals", data.days, null],
  ].map(([name, payload, updated]) => `<tr>
    <td class="strong">${esc(name)}</td>
    <td>${payload
      ? `<span class="badge pos">${icon("check")}Loaded</span>`
      : `<span class="badge neg">Failed</span>`}</td>
    <td class="muted">${esc(updated ? `${dateLabel(updated)} · ${timeAgo(updated)}` : payload ? "No timestamp" : data.errors?.[name] || "")}</td>
  </tr>`).join("");

  return `
    <div class="page-head">
      <h2>Data health</h2>
      <p>Where the numbers come from and what is missing. Gaps here are the reason a client report
      can look wrong, so this is the first place to check when a figure looks off.
      Trends run through <b>${esc(monthLabel(model.latestMonth))}</b>, the newest month most stores
      have closed; anything filed beyond it is a part-month and is flagged below.</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:16px">
      ${figure("Stores reporting", num(model.stations.length), "In the books feed")}
      ${figure("Not closed", num(behind.length), `For ${monthLabel(model.latestMonth, true)}`, behind.length ? "warn" : "pos")}
      ${figure("Stale daily data", num(staleDays.length), "No day filed in over 10 days", staleDays.length ? "warn" : "pos")}
      ${figure("Stores with day gaps", num(withGaps.length), "Missing dates inside the range", withGaps.length ? "warn" : "pos")}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Coverage by store</h3>
        <span class="hint">Latest closed month is ${esc(monthLabel(model.latestMonth))}</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Store</th><th>${esc(monthLabel(model.latestMonth, true))}</th><th>Last month</th>
          <th class="num">Months</th><th>Last day</th><th class="num">Days</th>
          <th class="num">Day gaps</th><th>Depts</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Feeds</h3><span class="hint">Every source this console reads</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Feed</th><th>Status</th><th>Last updated</th></tr></thead>
        <tbody>${feedRows}</tbody>
      </table></div>
    </section>
  `;
}

/* ------------------------------------------------------------------------- */

function figure(label, value, detail, tone = "") {
  return `<div class="stat" style="min-height:96px">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot">${tone ? `<span class="dot ${esc(tone)}"></span>` : ""}<span>${esc(detail || "")}</span></div>
  </div>`;
}
