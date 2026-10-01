/*
 * Payroll.
 *
 * One reusable "timesheet book" — pick a person, step through pay periods, read
 * the California-split hours — used in two places:
 *
 *   · the manager's desktop dashboard, where the manager signs a period off
 *     ("Approve") and only then may print it for payroll; and
 *   · the accountant's own page, which reaches every store's crew, prints the
 *     periods a manager has approved, and exports every login in one workbook.
 *
 * The hours come from the same pay.js maths the phone app uses, over the punches
 * in appstore.js. Printing opens a clean, self-contained document (logo, the
 * approval stamp, the day-by-day table) so "Save as PDF" gives payroll a real
 * sheet. Nothing here writes to the books.
 */

import { esc, icon, money, num, toast } from "../ui.js";
import {
  approveTimesheet, getApproval, listAccountants, listEmployees, listPunches, revokeApproval,
} from "../appstore.js";
import {
  computeTimesheet, datesInRange, payPeriodOf, payPeriodShift,
} from "../pay.js";
import { downloadExcel } from "../exporter.js";
import { MOUNT, getJson, isAdmin } from "../data.js";

/* One book per page is plenty; the chosen person and period live here so a
   redraw keeps its place. */
let pEmp = "";
let pAnchor = todayYmd();

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(ymd) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function periodLabel(period) {
  const f = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${f(period.start)} – ${f(period.end)}`;
}

function fmtH(n) {
  return `${Math.round((Number(n) || 0) * 100) / 100} h`;
}

function stampTime(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* Absolute asset URL — a print window is about:blank, so a relative path would
   never resolve. */
function assetUrl(path) {
  return `${location.origin}${MOUNT}/${path.replace(/^\//, "")}`;
}

/* -------------------------------------------------------------------------
   The reusable timesheet book
   ------------------------------------------------------------------------- */

export function renderPayrollBook(id = "payroll-book") {
  return `<div class="app-embed payroll-book" id="${esc(id)}" style="max-width:760px">
    <div class="card"><div class="card-body">Loading…</div></div>
  </div>`;
}

/*
 * cfg:
 *   employeesFor  async () => [{ id, name, storeId, rate, username }]
 *   storeName     (id) => string
 *   approver      display name recorded on an approval and printed on the sheet
 *   canApprove    manager (and admin) may sign a period off; the accountant may not
 *   scopeLabel    a short line under the heading (e.g. the store, or "All stores")
 */
export async function bindPayrollBook(root, cfg) {
  if (!root) return;
  const draw = async () => {
    const employees = (await cfg.employeesFor())
      .filter((e) => !String(e.pin || "").startsWith("mgr:"))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!employees.length) {
      root.innerHTML = `<div class="card"><div class="card-body">
        <div class="app-empty">No employees on file yet. A manager adds the crew in the phone app under Team.</div>
      </div></div>`;
      return;
    }
    if (!pEmp || !employees.some((e) => e.id === pEmp)) pEmp = employees[0].id;
    const employee = employees.find((e) => e.id === pEmp);
    const punches = await listPunches({ employeeId: employee.id });
    const period = payPeriodOf(pAnchor);
    const ts = computeTimesheet(punches, period.start, period.end, { rate: employee.rate ?? null });
    const approval = await getApproval(employee.id, period.start, period.end);

    root.innerHTML = bookMarkup(employees, employee, period, ts, approval, cfg);
    wire(root, { employees, employee, period, ts, punches, approval, cfg, draw });
    if (cfg.onChange) await cfg.onChange();
  };
  await draw();
}

function bookMarkup(employees, employee, period, ts, approval, cfg) {
  const options = employees.map((e) => `<option value="${esc(e.id)}"${e.id === employee.id ? " selected" : ""}>${esc(e.name)}${cfg.storeName ? ` · ${esc(cfg.storeName(e.storeId))}` : ""}</option>`).join("");

  const dayRows = ts.days.length
    ? ts.days.map((d) => `<tr>
        <td class="strong">${esc(fmtDate(d.date))}${d.seventh ? ` · <span class="muted">7th day</span>` : ""}</td>
        <td class="num">${fmtH(d.regular)}</td>
        <td class="num">${d.overtime ? fmtH(d.overtime) : "—"}</td>
        <td class="num">${d.doubleTime ? fmtH(d.doubleTime) : "—"}</td>
        <td class="num strong">${fmtH(d.total)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5"><div class="app-empty">No hours in this pay period</div></td></tr>`;

  const stale = approval && approval.totals
    && Math.abs((approval.totals.total || 0) - ts.total) > 0.001;

  const status = approval
    ? `<div class="geo-note ${stale ? "warn" : "ok"}" style="margin:0">
        ${icon(stale ? "alert" : "check")}
        Approved by ${esc(approval.by)} on ${esc(stampTime(approval.at))}${stale ? " — punches have changed since; re-approve before printing." : ""}
      </div>`
    : `<div class="geo-note warn" style="margin:0">${icon("alert")} Not approved yet.${cfg.canApprove ? " Approve to enable printing." : " A manager must approve before payroll can print."}</div>`;

  const canPrint = Boolean(approval) && !stale;

  const approveBtn = cfg.canApprove
    ? (approval && !stale
      ? `<button class="btn btn-sm btn-ghost" data-pay="revoke">${icon("close")} Withdraw approval</button>`
      : `<button class="btn btn-sm btn-primary" data-pay="approve">${icon("check")} ${approval ? "Re-approve" : "Approve"} for payroll</button>`)
    : "";

  return `<div class="card">
    <div class="card-head">
      <h3>Payroll timesheet</h3>
      <span class="hint">${esc(cfg.scopeLabel || "")}</span>
    </div>
    <div class="card-body">
      <div class="grid cols-2" style="gap:12px;margin-bottom:12px">
        <label class="app-field"><span>Employee</span>
          <select class="app-select" data-pay="emp">${options}</select></label>
        <div class="app-field"><span>Pay period</span>
          <div class="pay-period">
            <button class="btn btn-icon btn-sm" data-pay="prev" aria-label="Previous period">${icon("chevron", "ico flip")}</button>
            <b>${esc(periodLabel(period))}</b>
            <button class="btn btn-icon btn-sm" data-pay="next" aria-label="Next period">${icon("chevron")}</button>
          </div>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:12px">
        ${payStat("Regular", fmtH(ts.regular), "First 8 h/day")}
        ${payStat("Overtime 1.5×", fmtH(ts.overtime), "8–12 h/day")}
        ${payStat("Double 2×", fmtH(ts.doubleTime), "Past 12 h")}
        ${payStat("Paid hours", fmtH(ts.total), "Meal unpaid, rests paid")}
      </div>
      ${ts.pay != null ? `<div class="geo-note ok" style="margin-bottom:12px">${icon("billing")} Estimated pay ${esc(money(ts.pay))} at ${esc(money(employee.rate))}/hr</div>` : ""}

      ${status}

      <div class="pay-actions" style="margin-top:12px">
        ${approveBtn}
        <button class="btn btn-sm" data-pay="xls">${icon("printer")} Excel</button>
        <button class="btn btn-sm btn-primary" data-pay="print"${canPrint ? "" : " disabled title=\"Approve the period first\""}>${icon("printer")} Print for payroll</button>
      </div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Day</th><th class="num">Regular</th><th class="num">OT 1.5×</th><th class="num">DT 2×</th><th class="num">Paid</th></tr></thead>
      <tbody>${dayRows}</tbody>
      <tfoot><tr>
        <td>Total</td><td class="num">${fmtH(ts.regular)}</td><td class="num">${fmtH(ts.overtime)}</td>
        <td class="num">${fmtH(ts.doubleTime)}</td><td class="num strong">${fmtH(ts.total)}</td>
      </tr></tfoot>
    </table></div>
  </div>`;
}

function payStat(label, value, foot) {
  return `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" style="font-size:20px">${esc(value)}</div>
    <div class="stat-foot"><span class="muted">${esc(foot)}</span></div>
  </div>`;
}

function wire(root, { employee, period, ts, punches, approval, cfg, draw }) {
  root.querySelector('[data-pay="emp"]')?.addEventListener("change", (e) => {
    pEmp = e.target.value;
    draw();
  });
  root.querySelector('[data-pay="prev"]')?.addEventListener("click", () => {
    pAnchor = payPeriodShift(pAnchor, -1).start;
    draw();
  });
  root.querySelector('[data-pay="next"]')?.addEventListener("click", () => {
    pAnchor = payPeriodShift(pAnchor, 1).start;
    draw();
  });
  root.querySelector('[data-pay="approve"]')?.addEventListener("click", async () => {
    await approveTimesheet({
      employeeId: employee.id,
      storeId: employee.storeId,
      start: period.start,
      end: period.end,
      by: cfg.approver || "Manager",
      totals: { regular: ts.regular, overtime: ts.overtime, doubleTime: ts.doubleTime, total: ts.total, pay: ts.pay ?? null },
    });
    toast("Approved for payroll", "ok");
    draw();
  });
  root.querySelector('[data-pay="revoke"]')?.addEventListener("click", async () => {
    await revokeApproval(employee.id, period.start, period.end);
    toast("Approval withdrawn");
    draw();
  });
  root.querySelector('[data-pay="xls"]')?.addEventListener("click", () => {
    timesheetExcel(employee, ts, cfg);
    toast("Timesheet downloaded", "ok");
  });
  root.querySelector('[data-pay="print"]')?.addEventListener("click", () => {
    printTimesheet(employee, ts, approval, cfg);
  });
}

function timesheetExcel(employee, ts, cfg) {
  const rows = ts.days.map((d) => [d.date, d.regular, d.overtime, d.doubleTime, d.total]);
  rows.push(["Total", ts.regular, ts.overtime, ts.doubleTime, ts.total]);
  const headers = ["Date", "Regular", "OT 1.5×", "DT 2×", "Paid hours"];
  const who = employee.username || employee.name || "employee";
  const store = cfg.storeName ? cfg.storeName(employee.storeId) : "";
  downloadExcel(`timesheet-${who}-${ts.start}`, {
    name: "Timesheet",
    headers,
    rows: [[`${employee.name}${store ? ` — ${store}` : ""}`, "", "", "", ""], [], ...rows.map((r) => r)],
  });
}

/* A clean, self-contained payroll document in a new window. Only reachable when
   the period is approved, so the approval stamp is always present. */
function printTimesheet(employee, ts, approval, cfg) {
  const store = cfg.storeName ? cfg.storeName(employee.storeId) : "";
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) { toast("Allow pop-ups to print the timesheet", "warn"); return; }
  const dayRows = ts.days.length
    ? ts.days.map((d) => `<tr>
        <td>${fmtDate(d.date)}${d.seventh ? " · 7th day" : ""}</td>
        <td class="n">${fmtH(d.regular)}</td>
        <td class="n">${d.overtime ? fmtH(d.overtime) : "—"}</td>
        <td class="n">${d.doubleTime ? fmtH(d.doubleTime) : "—"}</td>
        <td class="n b">${fmtH(d.total)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">No hours in this pay period</td></tr>`;

  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>Payroll timesheet — ${esc(employee.name)} — ${esc(ts.start)}</title>
    <style>
      *{box-sizing:border-box} body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1b30;margin:32px}
      .head{display:flex;align-items:center;gap:16px;border-bottom:2px solid #0b2545;padding-bottom:14px;margin-bottom:18px}
      .head img{height:34px}
      .head h1{font-size:19px;margin:0}
      .head .who{margin-left:auto;text-align:right;color:#41576f;font-size:12px}
      .meta{display:flex;gap:26px;margin:12px 0 18px;font-size:13px}
      .meta b{display:block;color:#41576f;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border-bottom:1px solid #dce3ec;padding:7px 10px;text-align:left}
      th{background:#f3f6fb;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#41576f}
      td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
      td.b{font-weight:700} tr.tot td{border-top:2px solid #0b2545;font-weight:700}
      .empty{color:#7d8da6;text-align:center;padding:18px}
      .stamp{margin-top:22px;padding:12px 14px;border:1px solid #b8e0c8;background:#eefaf1;border-radius:8px;font-size:13px}
      .foot{margin-top:26px;color:#7d8da6;font-size:11px;border-top:1px solid #dce3ec;padding-top:10px}
      @media print{body{margin:14mm}}
    </style></head><body>
    <div class="head">
      <img src="${assetUrl("assets/logo-wordmark-light.png")}" alt="Smart Solutions AI">
      <h1>Payroll timesheet</h1>
      <div class="who"><div>${esc(employee.name)}</div>${store ? `<div>${esc(store)}</div>` : ""}</div>
    </div>
    <div class="meta">
      <div><b>Employee</b>${esc(employee.name)}${employee.username ? ` (@${esc(employee.username)})` : ""}</div>
      <div><b>Pay period</b>${esc(periodLabel(ts))} (${esc(ts.start)} – ${esc(ts.end)})</div>
      ${employee.rate ? `<div><b>Rate</b>${esc(money(employee.rate))}/hr</div>` : ""}
    </div>
    <table>
      <thead><tr><th>Day</th><th class="n">Regular</th><th class="n">OT 1.5×</th><th class="n">DT 2×</th><th class="n">Paid</th></tr></thead>
      <tbody>${dayRows}</tbody>
      <tfoot><tr class="tot"><td>Total</td><td class="n">${fmtH(ts.regular)}</td><td class="n">${fmtH(ts.overtime)}</td><td class="n">${fmtH(ts.doubleTime)}</td><td class="n">${fmtH(ts.total)}</td></tr>
      ${ts.pay != null ? `<tr class="tot"><td>Estimated pay</td><td colspan="4" class="n">${esc(money(ts.pay))}</td></tr>` : ""}</tfoot>
    </table>
    <div class="stamp">✓ Approved for payroll by <b>${esc(approval.by)}</b> on ${esc(stampTime(approval.at))}.
      California overtime applied: over 8 h/day at 1.5×, over 12 h at 2×, and the 7th consecutive day at 1.5×/2×.
      Meal breaks are unpaid; the two 10-minute rests are paid.</div>
    <div class="foot">smartsolutionsai.us · Generated ${esc(stampTime(Date.now()))} · Confidential payroll document</div>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 350);
}

/* -------------------------------------------------------------------------
   The accountant's page: every store's crew, plus the combined login export
   ------------------------------------------------------------------------- */

function storeNamer(model) {
  return (id) => model?.byId?.get(String(id))?.name || (id ? `Store ${id}` : "—");
}

export function renderPayroll(ctx) {
  const admin = isAdmin(ctx.user);
  return `<div class="page-head">
      <h2>Payroll</h2>
      <p>Employee timesheets — paid hours by pay period, the California overtime split, and the day-by-day
        detail per employee. Print a period once a manager has approved it.</p>
    </div>
    ${admin ? `<section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>All logins</h3>
        <span class="hint">Admins, owners, managers, employees and accountants</span>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-primary" id="creds-xls">${icon("printer")} Download logins (Excel)</button>
      </div>
      <div class="card-body"><p class="muted" style="margin:0">
        One workbook, one row per login. App logins (employees, accountants) carry their password;
        console logins (admin, owner, manager) are managed by Smart Solutions and show as such.</p>
      </div>
    </section>` : ""}
    <div id="pay-roster" style="margin-bottom:16px"></div>
    ${renderPayrollBook("payroll-book")}`;
}

export async function bindPayroll(root, ctx) {
  const model = ctx.model;
  const storeName = storeNamer(model);
  const admin = isAdmin(ctx.user);
  const bookEl = root.querySelector("#payroll-book");
  const rosterEl = root.querySelector("#pay-roster");

  if (admin) {
    root.querySelector("#creds-xls")?.addEventListener("click", async () => {
      try {
        await downloadCredentials(ctx);
        toast("Logins downloaded", "ok");
      } catch (err) {
        toast(err.message || "Could not build the workbook", "warn");
      }
    });
  }

  const cfg = {
    employeesFor: () => listEmployees(),
    storeName,
    approver: ctx.user?.client || ctx.user?.email || "Admin",
    // Approval is the manager's sign-off. An accountant only reads and prints
    // what a manager has approved; an admin may approve as an override.
    canApprove: admin,
    scopeLabel: "All stores",
    onChange: () => drawRoster(),
  };

  async function drawRoster() {
    if (!rosterEl) return;
    const period = payPeriodOf(pAnchor);
    const employees = (await listEmployees())
      .filter((e) => !String(e.pin || "").startsWith("mgr:"))
      .sort((a, b) => a.name.localeCompare(b.name));
    const rows = [];
    for (const e of employees) {
      const punches = await listPunches({ employeeId: e.id });
      const ts = computeTimesheet(punches, period.start, period.end, { rate: e.rate ?? null });
      const appr = await getApproval(e.id, period.start, period.end);
      rows.push({ e, ts, appr });
    }
    rosterEl.innerHTML = rosterMarkup(rows, period, storeName, pEmp);
    rosterEl.querySelector('[data-roster="prev"]')?.addEventListener("click", async () => {
      pAnchor = payPeriodShift(pAnchor, -1).start;
      await bindPayrollBook(bookEl, cfg);
    });
    rosterEl.querySelector('[data-roster="next"]')?.addEventListener("click", async () => {
      pAnchor = payPeriodShift(pAnchor, 1).start;
      await bindPayrollBook(bookEl, cfg);
    });
    rosterEl.querySelectorAll("[data-emp]").forEach((el) => el.addEventListener("click", async () => {
      pEmp = el.dataset.emp;
      await bindPayrollBook(bookEl, cfg);
      bookEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  await bindPayrollBook(bookEl, cfg);
}

/* Every employee's paid-hours total for the pay period, with the approval state
   and a jump into the detail below. This is the whole of the accountant's read:
   totals by employee, and the period's day-by-day detail when one is opened. */
function rosterMarkup(rows, period, storeName, selectedId) {
  const body = rows.length
    ? rows.map(({ e, ts, appr }) => {
      const ot = (ts.overtime || 0) + (ts.doubleTime || 0);
      return `<tr${e.id === selectedId ? ' class="is-active"' : ""}>
        <td class="strong">${esc(e.name)}</td>
        <td class="muted">${esc(storeName(e.storeId))}</td>
        <td class="num">${fmtH(ts.total)}</td>
        <td class="num">${ot ? fmtH(ot) : "—"}</td>
        <td>${appr ? `<span class="badge pos">${icon("check")}Approved</span>` : `<span class="badge warn">Pending</span>`}</td>
        <td><button class="btn btn-sm btn-ghost" data-emp="${esc(e.id)}">Detail</button></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6"><div class="app-empty">No employees on file yet</div></td></tr>`;
  const totalAll = rows.reduce((sum, r) => sum + (r.ts.total || 0), 0);
  const approved = rows.filter((r) => r.appr).length;

  return `<section class="card">
    <div class="card-head"><h3>Period totals — all employees</h3>
      <span class="hint">${esc(periodLabel(period))} · ${esc(num(approved))}/${esc(num(rows.length))} approved</span>
      <span class="spacer"></span>
      <button class="btn btn-icon btn-sm" data-roster="prev" aria-label="Previous period">${icon("chevron", "ico flip")}</button>
      <button class="btn btn-icon btn-sm" data-roster="next" aria-label="Next period">${icon("chevron")}</button>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Employee</th><th>Store</th><th class="num">Paid hours</th><th class="num">Overtime</th><th>Payroll</th><th></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num strong">${fmtH(totalAll)}</td><td colspan="3"></td></tr></tfoot>
    </table></div>
  </section>`;
}

/* Build one workbook that gathers every credential we can see. Site logins are
   listed by username with their password marked managed; app logins carry the
   real password. */
async function downloadCredentials(ctx) {
  const model = ctx.model;
  const storeName = storeNamer(model);

  const [owners, logins, employees, accountants] = await Promise.all([
    getJson("/api/data/owners.json").then((r) => r?.accounts || []).catch(() => []),
    getJson("/api/data/logins.json").then((r) => r?.accounts || []).catch(() => []),
    listEmployees(),
    listAccountants(),
  ]);

  const MANAGED = "Managed by Smart Solutions";
  const rows = [];

  rows.push(["Admin", "Smart Solutions AI", "smartsolutionsai", MANAGED, "All stores", ""]);
  rows.push(["Admin", "Administrator", "admin", MANAGED, "All stores", ""]);

  owners.forEach((a) => {
    const stores = (a.stores || []).map((id) => storeName(id)).join(", ");
    rows.push(["Owner", a.client || a.name || "", a.email || a.username || "", MANAGED, stores, ""]);
  });

  logins.forEach((a) => {
    rows.push(["Manager", a.name || a.client || "", a.email || a.username || "",
      MANAGED, storeName(a.station_id), a.phone || ""]);
  });

  employees
    .filter((e) => !String(e.pin || "").startsWith("mgr:"))
    .forEach((e) => {
      rows.push(["Employee", e.name || "", e.username || "",
        e.password || e.pin || "", storeName(e.storeId), e.phone || ""]);
    });

  accountants.forEach((a) => {
    rows.push(["Accountant", a.name || "", a.username || "", a.password || "", "All stores", ""]);
  });

  const headers = ["Role", "Name / Client", "Username", "Password", "Store(s)", "Phone"];
  downloadExcel("smart-solutions-logins", { name: "All logins", headers, rows });
}

/* -------------------------------------------------------------------------
   The manager's dashboard card (their store only; they approve here)
   ------------------------------------------------------------------------- */

export function renderManagerPayrollCard(ctx) {
  const store = ctx.current?.stores?.[0];
  const name = store?.name || ctx.model?.stations?.[0]?.name || "your store";
  return `<section class="card" style="margin-top:22px">
    <div class="card-head"><h3>Payroll timesheets</h3>
      <span class="hint">Approve a pay period, then print it — ${esc(name)}</span></div>
    <div class="card-body">${renderPayrollBook("mgr-payroll-book")}</div>
  </section>`;
}

export async function bindManagerPayroll(root, ctx) {
  const container = root.querySelector("#mgr-payroll-book");
  if (!container) return;
  const model = ctx.model;
  const storeName = storeNamer(model);
  const storeId = (ctx.user?.stores && ctx.user.stores[0])
    || ctx.current?.stores?.[0]?.id || model?.stations?.[0]?.id || null;

  await bindPayrollBook(container, {
    employeesFor: () => listEmployees(storeId),
    storeName,
    approver: ctx.user?.client || ctx.user?.email || "Manager",
    canApprove: true,
    scopeLabel: storeName(storeId),
  });
}
