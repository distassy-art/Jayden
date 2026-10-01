/*
 * The week ahead: when orders go out, and when they land.
 *
 * Both pages read the vendor schedule block, which carries two different kinds
 * of delivery day — one stated by the vendor, one inferred from when invoices
 * actually arrived. They disagree often enough that the console shows which is
 * which rather than blending them into a single confident-looking answer.
 */

import {
  emptyState, esc, icon, isNum, money, num,
} from "../ui.js";
import { bindScopeBar, scopeBar } from "../scope.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/*
 * Schedule days are typed by hand: "Wednesday", "Tuesday / Friday", "Mon + Thu",
 * "Tue/Fri", "TBD". Anything unrecognised yields nothing rather than a guess.
 */
function weekdays(text) {
  const value = String(text || "").toLowerCase();
  const out = [];
  DAY_NAMES.forEach((name, index) => {
    const short = name.slice(0, 3).toLowerCase();
    if (new RegExp(`\\b${short}(${name.slice(3).toLowerCase()})?\\b`).test(value)) out.push(index);
  });
  return out;
}

const CONFIDENCE = {
  high: { label: "Confirmed by invoices", tone: "pos" },
  medium: { label: "Likely, from invoices", tone: "" },
  low: { label: "Weak invoice evidence", tone: "warn" },
  none: { label: "No invoice evidence", tone: "muted" },
};

/** Flatten the schedule block into one row per store-vendor, within scope. */
function scheduleRows(ctx) {
  const { model, scope, data } = ctx;
  const allowed = scope.stationIds ? new Set(scope.stationIds) : null;

  return (data?.orders?.schedules || [])
    .filter((entry) => !allowed || allowed.has(String(entry.store)))
    .filter((entry) => model.byId.has(String(entry.store)) || !model.stations.length)
    .flatMap((entry) => (entry.vendors || []).map((vendor) => ({
      store: String(entry.store),
      storeName: model.byId.get(String(entry.store))?.name || entry.name || String(entry.store),
      orderTo: entry.orderTo || "",
      vendor: vendor.vendor || "—",
      draftDay: vendor.draftDay || "",
      draftTime: vendor.draftTime || "",
      salesman: vendor.salesman || "",
      method: vendor.method || "",
      frequency: String(vendor.frequency || "").replace(/_/g, " "),
      stated: vendor.delivery || "",
      statedDays: weekdays(vendor.delivery),
      inferredDays: (vendor.inferredDeliveryDays || []).flatMap(weekdays),
      confidence: String(vendor.deliveryConfidence || "none"),
      notes: vendor.notes || "",
      websiteUrl: vendor.websiteUrl || "",
    })));
}

/** Delivery days to draw: what the vendor states, else what invoices imply. */
function deliveryDays(row) {
  return row.statedDays.length ? row.statedDays : row.inferredDays;
}

/* -------------------------------------------------------------------------
   Delivery calendar
   ------------------------------------------------------------------------- */

function monthKeyOf(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key, by) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + by, 1));
  return monthKeyOf(date);
}

export function renderCalendar(ctx) {
  const { model, scope, query, data } = ctx;
  const rows = scheduleRows(ctx);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const monthKey = query.get("month") || todayIso.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);

  const bar = scopeBar(model, scope, { period: false, csv: false });

  if (!data?.orders) {
    return `<div class="page-head"><h2>Delivery calendar</h2></div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("The vendor feed is unavailable", ctx.data?.errors?.orders || "")}
      </div></section>`;
  }

  if (!rows.length) {
    return `<div class="page-head">
        <h2>Delivery calendar</h2>
        <p>When each vendor delivers to <b>${esc(scope.label)}</b>.</p>
      </div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("No delivery schedule for this scope", "No vendor timetable has been published for these stores.")}
      </div></section>`;
  }

  // Deliveries indexed by weekday, so a month cell is a lookup rather than a scan.
  const byWeekday = new Map();
  rows.forEach((row) => {
    deliveryDays(row).forEach((day) => {
      if (!byWeekday.has(day)) byWeekday.set(day, []);
      byWeekday.get(day).push(row);
    });
  });

  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay();

  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push('<div class="cal-cell is-empty"></div>');

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${monthKey}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
    const due = byWeekday.get(weekday) || [];

    // One chip per vendor, counting the stores rather than listing all sixteen.
    const byVendor = new Map();
    due.forEach((row) => {
      if (!byVendor.has(row.vendor)) byVendor.set(row.vendor, []);
      byVendor.get(row.vendor).push(row);
    });

    cells.push(`<div class="cal-cell${iso === todayIso ? " is-today" : ""}${due.length ? "" : " is-quiet"}">
      <div class="cal-date">${esc(day)}${iso === todayIso ? '<span class="cal-today">Today</span>' : ""}</div>
      <div class="cal-items">${[...byVendor.entries()].map(([vendor, list]) => `
        <span class="cal-chip" title="${esc(list.map((r) => r.storeName).join(", "))}">
          ${esc(vendor)}<b>${esc(list.length)}</b></span>`).join("")}</div>
    </div>`);
  }

  const weekdayTotals = DAY_SHORT.map((label, index) => ({
    label,
    count: (byWeekday.get(index) || []).length,
  }));
  const busiest = weekdayTotals.slice().sort((a, b) => b.count - a.count)[0];

  // The next seven days from today, so "what is coming" needs no arithmetic.
  const upcoming = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today.getTime() + offset * 86400000);
    const iso = date.toISOString().slice(0, 10);
    return { iso, weekday: date.getUTCDay(), rows: byWeekday.get(date.getUTCDay()) || [] };
  }).filter((entry) => entry.rows.length);

  const vendors = [...new Set(rows.map((row) => row.vendor))].sort();
  const noDay = rows.filter((row) => !deliveryDays(row).length);

  return `
    <div class="page-head">
      <h2>Delivery calendar</h2>
      <p>When each vendor delivers to <b>${esc(scope.label)}</b>.
        Days come from the vendor's stated schedule where there is one, and from when invoices
        actually arrived where there is not.</p>
    </div>
    ${bar}

    <div class="analysis-bar">
      <div class="segmented" data-month-nav>
        <button data-month="${esc(shiftMonth(monthKey, -1))}">${icon("back")}</button>
        <button data-month="${esc(todayIso.slice(0, 7))}" class="${monthKey === todayIso.slice(0, 7) ? "is-active" : ""}">Today</button>
        <button data-month="${esc(shiftMonth(monthKey, 1))}">${icon("chevron")}</button>
      </div>
      <b style="font-size:15px">${esc(new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }))}</b>
      <span class="spacer"></span>
      <span class="tiny muted">${esc(rows.length)} vendor runs across ${esc(new Set(rows.map((r) => r.store)).size)} stores ·
        busiest day ${esc(busiest?.label || "—")}</span>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="cal-grid-head">${DAY_SHORT.map((d) => `<div>${esc(d)}</div>`).join("")}</div>
      <div class="cal-grid">${cells.join("")}</div>
      <div class="card-foot legend">
        ${vendors.map((v) => `<span><i style="background:var(--cyan-500)"></i>${esc(v)}</span>`).join("")}
      </div>
    </section>

    <div class="grid split">
      <section class="card">
        <div class="card-head"><h3>Next seven days</h3><span class="hint">From today</span></div>
        <div class="card-body">${upcoming.length ? `<ul class="timeline">${upcoming.map((entry) => `
          <li>
            <div class="timeline-when">${esc(DAY_SHORT[entry.weekday])}
              <b>${esc(new Date(`${entry.iso}T00:00:00Z`).getUTCDate())}</b></div>
            <div class="timeline-what">
              ${[...new Set(entry.rows.map((r) => r.vendor))].sort().map((vendor) => {
                const list = entry.rows.filter((r) => r.vendor === vendor);
                return `<div><b>${esc(vendor)}</b>
                  <span class="muted">${esc(list.length)} store${list.length === 1 ? "" : "s"} —
                  ${esc(list.slice(0, 4).map((r) => r.storeName).join(", "))}${list.length > 4 ? ", …" : ""}</span></div>`;
              }).join("")}
            </div>
          </li>`).join("")}</ul>`
          : emptyState("Nothing scheduled in the next seven days")}</div>
      </section>

      <section class="card">
        <div class="card-head"><h3>By weekday</h3><span class="hint">Vendor runs landing on each day</span></div>
        <div class="card-body">
          <div class="weekday-bars">${weekdayTotals.map((entry) => `
            <div class="weekday-bar">
              <span class="weekday-label">${esc(entry.label)}</span>
              <span class="weekday-track"><span class="weekday-fill"
                style="width:${busiest?.count ? (entry.count / busiest.count) * 100 : 0}%"></span></span>
              <span class="weekday-value">${esc(entry.count)}</span>
            </div>`).join("")}</div>
          ${noDay.length ? `<p class="tiny muted" style="margin-top:14px">
            ${esc(noDay.length)} vendor run${noDay.length === 1 ? " has" : "s have"} no delivery day on record
            (${esc([...new Set(noDay.map((r) => r.vendor))].join(", "))}), so ${noDay.length === 1 ? "it does" : "they do"} not appear above.</p>` : ""}
        </div>
      </section>
    </div>`;
}

export function bindCalendar(root, ctx) {
  bindScopeBar(root, ctx);
  root.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      const params = new URLSearchParams(ctx.query);
      params.set("month", button.dataset.month);
      ctx.navigate(`#/calendar?${params.toString()}`);
    });
  });
}

/* -------------------------------------------------------------------------
   Ordering schedule
   ------------------------------------------------------------------------- */

export function renderSchedule(ctx) {
  const { model, scope, data } = ctx;
  const rows = scheduleRows(ctx);
  const bar = scopeBar(model, scope, { period: false, csv: false });

  if (!data?.orders) {
    return `<div class="page-head"><h2>Ordering schedule</h2></div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("The vendor feed is unavailable", data?.errors?.orders || "")}
      </div></section>`;
  }

  if (!rows.length) {
    return `<div class="page-head">
        <h2>Ordering schedule</h2>
        <p>The weekly ordering timetable for <b>${esc(scope.label)}</b>.</p>
      </div>${bar}
      <section class="card"><div class="card-body">
        ${emptyState("No ordering schedule for this scope")}
      </div></section>`;
  }

  const byStore = new Map();
  rows.forEach((row) => {
    if (!byStore.has(row.store)) byStore.set(row.store, []);
    byStore.get(row.store).push(row);
  });

  const stated = rows.filter((row) => row.statedDays.length).length;
  const inferredOnly = rows.filter((row) => !row.statedDays.length && row.inferredDays.length).length;
  const unknown = rows.length - stated - inferredOnly;

  const sections = [...byStore.entries()]
    .sort((a, b) => (model.byId.get(a[0])?.name || a[0]).localeCompare(model.byId.get(b[0])?.name || b[0]))
    .map(([store, list]) => `
      <section class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h3>${esc(list[0].storeName)}</h3>
          <span class="store-tag">${esc(store)}</span>
          <span class="spacer"></span>
          ${list[0].orderTo ? `<span class="hint">Orders sent to <code>${esc(list[0].orderTo)}</code></span>` : ""}
          <a class="btn btn-sm" href="#/store/${esc(store)}">${icon("stores")}Store</a>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>Vendor</th><th>Draft goes out</th><th>Salesman</th>
            <th>Delivery</th><th>Evidence</th><th>How</th><th>Every</th>
          </tr></thead>
          <tbody>${list.map((row) => {
            const conf = CONFIDENCE[row.confidence] || CONFIDENCE.none;
            const days = deliveryDays(row);
            return `<tr>
              <td class="strong">${esc(row.vendor)}${row.websiteUrl
                ? ` <a class="link-out" href="${esc(row.websiteUrl)}" target="_blank" rel="noopener noreferrer"
                    aria-label="${esc(row.vendor)} ordering site">${icon("external")}</a>` : ""}</td>
              <td>${esc(row.draftDay || "—")}${row.draftTime
                ? `<span class="cell-sub">${esc(row.draftTime)}</span>` : ""}</td>
              <td class="muted">${esc(row.salesman || "—")}</td>
              <td>${days.length
                ? days.map((d) => `<span class="pill">${esc(DAY_SHORT[d])}</span>`).join(" ")
                : '<span class="muted">Not on record</span>'}
                ${!row.statedDays.length && row.inferredDays.length
                  ? '<span class="cell-sub">Inferred from invoice dates</span>' : ""}</td>
              <td><span class="badge ${esc(conf.tone)}">${esc(conf.label)}</span></td>
              <td class="muted">${esc(row.method || "—")}</td>
              <td class="muted">${esc(row.frequency || "—")}</td>
            </tr>${row.notes ? `<tr class="row-note"><td colspan="7">${icon("alert")}${esc(row.notes)}</td></tr>` : ""}`;
          }).join("")}</tbody>
        </table></div>
      </section>`).join("");

  return `
    <div class="page-head">
      <h2>Ordering schedule</h2>
      <p>When the AI draft goes out, when the salesman calls, and when the truck arrives, for
        <b>${esc(scope.label)}</b>. Delivery days marked <i>inferred</i> come from when invoices
        landed rather than from the vendor.</p>
    </div>
    ${bar}

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat"><div class="stat-label">Vendor runs</div>
        <div class="stat-value">${esc(num(rows.length))}</div>
        <div class="stat-foot"><span class="muted">across ${esc(byStore.size)} stores</span></div></div>
      <div class="stat"><div class="stat-label">Vendors</div>
        <div class="stat-value">${esc(num(new Set(rows.map((r) => r.vendor)).size))}</div>
        <div class="stat-foot"><span class="muted">${esc([...new Set(rows.map((r) => r.vendor))].sort().join(", "))}</span></div></div>
      <div class="stat"><div class="stat-label">Delivery day stated</div>
        <div class="stat-value">${esc(stated)} of ${esc(rows.length)}</div>
        <div class="stat-foot"><span class="muted">${esc(inferredOnly)} inferred from invoices</span></div></div>
      <div class="stat"><div class="stat-label">No delivery day</div>
        <div class="stat-value${unknown ? " neg-text" : ""}">${esc(unknown)}</div>
        <div class="stat-foot"><span class="muted">${unknown
          ? "Cannot be placed on the calendar" : "Every run is scheduled"}</span></div></div>
    </div>

    ${sections}`;
}
