/* Client billing, manager tickets and data health. */

import {
  dateLabel, daysSince, downloadCsv, emptyState, esc, icon, isNum, money,
  monthLabel, num, pct, timeAgo, toast,
} from "../ui.js";
import { dataHealth, shortMonths } from "../analytics.js";
import { isAccountant, isAdmin } from "../data.js";
import {
  addTicket, addTicketMessage, listTickets, setTicketStatus,
} from "../appstore.js";
import { inScope, invoiceStores } from "../scope.js";

function roleOf(user) {
  if (!user) return "none";
  if (isAdmin(user)) return "admin";
  if (isAccountant(user)) return "accountant";
  return user?.role === "manager" ? "manager" : "owner";
}

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
   Tickets
   -------------------------------------------------------------------------
   A two-way support thread. A manager or an owner opens a ticket with a
   question; an admin sees every ticket and answers; either side can add a
   follow-up until the ticket is closed. The threads live in the on-device
   store (appstore.js) — the console has no upstream write endpoint — so the
   page renders a shell and `bindTickets` fills and wires it, the same pattern
   the schedule and tasks use. The read-only tickets from the live site are
   still shown below, so nothing already on the live console is lost.
   ------------------------------------------------------------------------- */

export function renderTickets(ctx) {
  const { data, user } = ctx;
  const role = roleOf(user);
  const canOpen = role === "manager" || role === "owner";

  const pending = inScope(ctx.model, ctx.scope, data.days?.items,
    (row) => row.store ?? row.station_id);
  const upstream = inScope(ctx.model, ctx.scope, data.tickets?.tickets,
    (row) => row.store ?? row.station_id);

  const scope = ctx.scope;
  const store = scope.station || (ctx.model.stations.length === 1 ? ctx.model.stations[0] : null);
  const where = store ? store.name : scope.owner ? scope.owner.client : "";

  const openForm = canOpen
    ? `<section class="card" style="margin-bottom:16px">
        <div class="card-head"><h3>Open a ticket</h3>
          <span class="hint">${where ? `For ${esc(where)}` : "Ask Smart Solutions a question"}</span></div>
        <div class="card-body">
          <div class="field"><label for="nt-subject">Subject</label>
            <input class="input" id="nt-subject" maxlength="120" placeholder="What do you need help with?"></div>
          <div class="field" style="margin-top:10px"><label for="nt-body">Message</label>
            <textarea class="input" id="nt-body" rows="3" placeholder="Describe it in a sentence or two…"></textarea></div>
          <div style="margin-top:12px"><button class="btn btn-sm btn-primary" id="nt-send">${icon("mail")}Send to Smart Solutions</button></div>
        </div>
      </section>`
    : "";

  return `
    <div class="page-head">
      <h2>Tickets</h2>
      <p>${role === "admin"
        ? "Questions from store managers and owners. Answer here — they see your reply the next time they open this page."
        : "Ask Smart Solutions a question and read the answer here. Open a ticket and we'll reply."}</p>
    </div>

    <div id="tickets-stats" class="grid cols-3" style="margin-bottom:16px"></div>

    ${openForm}

    <div id="tickets-app">${loadingCard("Loading tickets…")}</div>

    ${pending.length ? `<section class="card" style="margin:16px 0">
      <div class="card-head"><h3>Awaiting approval</h3>
        <span class="hint">Days submitted by managers</span></div>
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

    ${upstream.length ? `<details style="margin-top:16px">
      <summary class="btn btn-ghost" style="display:inline-flex">From the live site — read-only (${esc(upstream.length)})</summary>
      <div class="stack" style="margin-top:12px">${upstream.map(upstreamCard).join("")}</div>
    </details>` : ""}
  `;
}

function loadingCard(text = "Loading…") {
  return `<section class="card"><div class="card-body"><p class="muted">${esc(text)}</p></div></section>`;
}

/* A read-only card for a ticket that came from the live upstream feed. */
function upstreamCard(ticket) {
  return `<article class="card">
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
}

/* One interactive thread from the on-device store. */
function ticketThread(ticket, role, myEmail) {
  const closed = String(ticket.status || "").toLowerCase() === "closed";
  const mine = ticket.createdBy?.email
    && String(ticket.createdBy.email).toLowerCase() === String(myEmail || "").toLowerCase();
  const canAct = role === "admin" || mine;
  const who = [ticket.storeName || ticket.client, ticket.createdBy?.role]
    .filter(Boolean).join(" · ");

  const messages = (ticket.messages || []).map((message) => {
    const fromAdmin = String(message.role || "").toLowerCase() === "admin";
    return `<div class="msg">
      <div class="msg-meta">
        <b>${esc(message.from || "—")}</b>
        ${fromAdmin ? `<span class="badge info">Smart Solutions</span>` : ""}
        <span class="muted">${esc(message.at ? timeAgo(message.at) : "")}</span>
      </div>
      <div>${esc(message.text || "")}</div>
    </div>`;
  }).join("") || `<p class="muted">No messages yet.</p>`;

  const footer = closed
    ? (canAct ? `<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-ticket-reopen="${esc(ticket.id)}">Reopen</button></div>` : "")
    : `<div style="margin-top:12px">
        <textarea class="input" data-ticket-text="${esc(ticket.id)}" rows="2"
          placeholder="${role === "admin" ? "Write an answer…" : "Add a message…"}"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-primary" data-ticket-reply="${esc(ticket.id)}">${icon("mail")}Send</button>
          ${canAct ? `<button class="btn btn-ghost btn-sm" data-ticket-close="${esc(ticket.id)}">Close ticket</button>` : ""}
        </div>
      </div>`;

  return `<article class="card" style="margin-bottom:12px">
    <div class="card-head">
      <h3>${esc(ticket.subject || "Ticket")}</h3>
      <span class="badge ${closed ? "" : "warn"}">${closed ? "Closed" : "Open"}</span>
      <span class="spacer"></span>
      <span class="hint">${esc(who)}${who ? " · " : ""}${esc(timeAgo(ticket.createdAt))}</span>
    </div>
    <div class="card-body">${messages}${footer}</div>
  </article>`;
}

export function bindTickets(root, ctx) {
  const { user } = ctx;
  const role = roleOf(user);
  const me = {
    email: user?.email || "",
    role,
    name: user?.client || user?.name || user?.email || "You",
  };

  const list = root.querySelector("#tickets-app");
  const stats = root.querySelector("#tickets-stats");
  if (!list) return;

  const stat = (label, value, detail, tone = "") => `<div class="stat" style="min-height:96px">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" style="font-size:22px">${esc(value)}</div>
    <div class="stat-foot">${tone ? `<span class="dot ${esc(tone)}"></span>` : ""}<span>${esc(detail || "")}</span></div>
  </div>`;

  const draw = async () => {
    const all = await listTickets();
    const visible = role === "admin"
      ? all
      : all.filter((t) => t.createdBy?.email
        && String(t.createdBy.email).toLowerCase() === me.email.toLowerCase());

    const open = visible.filter((t) => String(t.status || "").toLowerCase() !== "closed");
    const closed = visible.filter((t) => String(t.status || "").toLowerCase() === "closed");
    const awaiting = open.filter((t) => {
      const last = (t.messages || [])[t.messages.length - 1];
      return role === "admin"
        ? last && String(last.role || "").toLowerCase() !== "admin"
        : last && String(last.role || "").toLowerCase() === "admin";
    });

    if (stats) {
      stats.innerHTML = role === "admin"
        ? stat("Open tickets", num(open.length), "From managers and owners", open.length ? "warn" : "pos")
          + stat("Need a reply", num(awaiting.length), "Waiting on Smart Solutions", awaiting.length ? "warn" : "pos")
          + stat("Closed", num(closed.length), "Resolved")
        : stat("Your open tickets", num(open.length), "Awaiting or in progress", open.length ? "warn" : "pos")
          + stat("New answers", num(awaiting.length), "Replies from Smart Solutions", awaiting.length ? "pos" : "")
          + stat("Closed", num(closed.length), "Resolved");
    }

    const body = visible.length
      ? `${open.map((t) => ticketThread(t, role, me.email)).join("")}
         ${closed.length ? `<details style="margin-top:6px">
            <summary class="btn btn-ghost btn-sm" style="display:inline-flex">Closed (${esc(closed.length)})</summary>
            <div style="margin-top:12px">${closed.map((t) => ticketThread(t, role, me.email)).join("")}</div>
          </details>` : ""}`
      : loadingCard(role === "admin"
        ? "No tickets yet. When a manager or owner opens one, it shows here."
        : "You have no tickets yet. Open one above and Smart Solutions will reply.");
    list.innerHTML = body;
    wire();
  };

  const wire = () => {
    list.querySelectorAll("[data-ticket-reply]").forEach((btn) => btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.ticketReply;
      const box = list.querySelector(`[data-ticket-text="${ticketId}"]`);
      const text = (box?.value || "").trim();
      if (!text) { toast("Write a message first", "warn"); return; }
      await addTicketMessage(ticketId, { text, from: me.name, role: me.role });
      toast(role === "admin" ? "Answer sent" : "Message sent", "ok");
      draw();
    }));
    list.querySelectorAll("[data-ticket-close]").forEach((btn) => btn.addEventListener("click", async () => {
      await setTicketStatus(btn.dataset.ticketClose, "closed");
      toast("Ticket closed");
      draw();
    }));
    list.querySelectorAll("[data-ticket-reopen]").forEach((btn) => btn.addEventListener("click", async () => {
      await setTicketStatus(btn.dataset.ticketReopen, "open");
      toast("Ticket reopened");
      draw();
    }));
  };

  const sendBtn = root.querySelector("#nt-send");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      const subject = (root.querySelector("#nt-subject")?.value || "").trim();
      const bodyText = (root.querySelector("#nt-body")?.value || "").trim();
      if (!subject || !bodyText) { toast("Add a subject and a message", "warn"); return; }
      const scope = ctx.scope;
      const store = scope.station || (ctx.model.stations.length === 1 ? ctx.model.stations[0] : null);
      await addTicket({
        subject,
        body: bodyText,
        storeId: store?.id || null,
        storeName: store?.name || "",
        client: scope.owner?.client || "",
        by: me,
      });
      root.querySelector("#nt-subject").value = "";
      root.querySelector("#nt-body").value = "";
      toast("Ticket opened", "ok");
      draw();
    });
  }

  draw();
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

  /*
   * A month can close with a fraction of the store's trade in it — Garden
   * Grove's August closed at 11% of its own run rate — and every reconciliation
   * still passes, because the short figures agree with each other. Those months
   * are named here rather than dropped: excluding one would invent a portfolio
   * no feed states, but leaving it unmarked is how a client report goes out on
   * half a month.
   */
  const short = shortMonths(model);
  const shortLatest = short.filter((row) => row.key === model.latestMonth);
  const shortByStore = new Map();
  short.forEach((row) => {
    if (!shortByStore.has(row.station.id)) shortByStore.set(row.station.id, []);
    shortByStore.get(row.station.id).push(row);
  });

  const rows = health.map((row) => {
    const dayAge = daysSince(row.lastDay);
    const stale = dayAge != null && dayAge > 10;
    const partial = shortByStore.get(row.station.id) || [];
    return `<tr class="is-clickable" data-href="#/store/${esc(row.station.id)}">
      <td><div class="cell-main"><span class="store-tag">${esc(row.station.id)}</span>
        <span class="strong">${esc(row.station.name)}</span></div></td>
      <td>${row.closedLatest
        ? `<span class="badge pos">${icon("check")}Closed</span>`
        : '<span class="badge neg">Not closed</span>'}
        ${partial.length
          ? `<span class="badge warn" style="margin-left:6px"
              title="Closed with a fraction of this store's usual sales in it">${esc(num(partial.length))} part-month${partial.length === 1 ? "" : "s"}</span>`
          : ""}</td>
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
      ${figure("Part-months closed", num(short.length),
        shortLatest.length ? `${num(shortLatest.length)} in ${monthLabel(model.latestMonth, true)}`
          : "None in the newest month", short.length ? "warn" : "pos")}
      ${figure("Stores with day gaps", num(withGaps.length), "Missing dates inside the range", withGaps.length ? "warn" : "pos")}
    </div>

    ${short.length ? `<section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Months that closed short</h3>
        <span class="hint">Below half the store's own median month</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Store</th><th>Month</th><th class="num">Store sales</th>
          <th class="num">Usual month</th><th class="num">Share</th><th class="num">Purchases</th></tr></thead>
        <tbody>${short.map((row) => `<tr class="is-clickable" data-href="#/store/${esc(row.station.id)}">
          <td><div class="cell-main"><span class="store-tag">${esc(row.station.id)}</span>
            <span class="strong">${esc(row.station.name)}</span></div></td>
          <td class="nowrap">${esc(monthLabel(row.key, true))}</td>
          <td class="num strong">${esc(money(row.sales))}</td>
          <td class="num muted">${esc(money(row.typical))}</td>
          <td class="num"><span class="badge warn">${esc(pct(row.share, { digits: 0 }))}</span></td>
          <td class="num">${esc(row.purchases == null ? "—" : money(row.purchases))}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      <div class="card-foot tiny muted">
        These months are counted in every total on the console, because the books close them and
        nothing here invents a figure a feed does not state. They are listed so a client report is
        not sent on half a month — the store's sales and its buying are both short by the same
        stretch, which is what a partial posting looks like rather than a bad month.
      </div>
    </section>` : ""}

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
