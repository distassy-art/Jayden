/*
 * The phone app.
 *
 * A smaller, thumb-first face on the same data, plus the crew tools the desktop
 * console has no place for. Who sees what follows the sign-in:
 *
 *   admin    the whole group's four headline numbers, then by store
 *   owner    the same, across the stores they own
 *   manager  their store's numbers, their own clock, and the crew: schedule,
 *            team, tasks
 *   employee (a store device, signed in with a name and PIN) their schedule,
 *            a location-based clock, and their tasks
 *
 * The numbers come straight from the books model — read-only, same as the
 * console. Everything the crew creates (shifts, punches, tasks, the store's
 * clock-in spot) lives in appstore.js, which today is on-device and tomorrow
 * is a backend without a line changing here.
 */

import {
  esc, icon, initials, money, moneyShort, num, pct, monthLabel, toast,
} from "../ui.js";
import { portfolioTotals } from "../analytics.js";
import { isAdmin } from "../data.js";
import {
  BREAK_KINDS, DEFAULT_RADIUS_FT, activeEmployeeId, addEmployee, addShift, addTask,
  clockIn, clockOut, endBreak, getEmployee, getPlace, listEmployees, listPunches,
  listShifts, listTasks, openPunch, removeEmployee, removeShift, removeTask,
  setActiveEmployee, setPlace, startBreak, today, toggleTask, updateShift,
} from "../appstore.js";
import {
  distanceFt, distanceLabel, geoSupported, getPosition, notify, notifyPermission,
  requestNotify, watchGeofence,
} from "../geo.js";

/* -------------------------------------------------------------------------
   Roles and the store in hand
   ------------------------------------------------------------------------- */

export function appRole(user) {
  if (!user) return "none";
  if (isAdmin(user)) return "admin";
  return user.role === "manager" ? "manager" : "owner";
}

/* The manager's single store. Owners and admins act across many, but the crew
   tools always belong to one store, so this resolves the one in view. */
function primaryStore(ctx) {
  const { user, model } = ctx;
  const wantId = (user?.stores && user.stores[0]) || model?.stations?.[0]?.id || null;
  const station = wantId && model?.byId ? model.byId.get(String(wantId)) : model?.stations?.[0];
  if (station) return { id: String(station.id), name: station.name };
  return wantId ? { id: String(wantId), name: "Your store" } : null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* -------------------------------------------------------------------------
   Time helpers
   ------------------------------------------------------------------------- */

function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function clockTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayName(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function nextDays(count) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function activeBreak(punch) {
  return punch?.breaks?.find((b) => !b.end) || null;
}

/* -------------------------------------------------------------------------
   The four headline numbers
   ------------------------------------------------------------------------- */

function figures(model, ids = null) {
  const t = portfolioTotals(model, model.ytdKeys, ids);
  const period = model.ytdKeys.length
    ? `Year to date · through ${monthLabel(model.latestMonth, true)}`
    : "No closed months yet";
  return `<div class="app-greet"><h2>${esc(greeting())}</h2>
      <p>${esc(period)}</p></div>
    <div class="app-figures">
      ${figure("Total sales", money(t.sales), "In-store sales")}
      ${figure("Total purchases", money(t.purchases), "What was bought in")}
      ${figure("Store margin", pct(t.store_margin), "Kept on every dollar sold")}
      ${figure("C-store profit", money(t.store_profit), "After the buy")}
    </div>`;
}

function figure(label, value, sub) {
  return `<div class="app-figure">
    <div class="lab">${esc(label)}</div>
    <div class="val">${esc(value)}</div>
    <div class="sub">${esc(sub)}</div>
  </div>`;
}

/* -------------------------------------------------------------------------
   Home
   ------------------------------------------------------------------------- */

export function renderAppHome(ctx) {
  const { model, user } = ctx;
  const role = appRole(user);

  if (role === "manager") {
    const store = primaryStore(ctx);
    return `${figures(model)}
      <div class="app-card">
        <div class="app-card-head"><h3>${esc(store ? store.name : "Your store")}</h3>
          <span class="hint">Crew</span></div>
        <div class="app-card-body">
          <div class="app-figures">
            ${tile("Schedule", "calendar", "#/app/schedule")}
            ${tile("My clock", "clock", "#/app/clock")}
            ${tile("Team", "owners", "#/app/team")}
            ${tile("Tasks", "check", "#/app/tasks")}
          </div>
        </div>
      </div>
      <a class="app-btn ghost" href="#/app/me">${icon("logout")} Hand to an employee</a>`;
  }

  // Admin and owner: the numbers, then the same four per store.
  const stores = model.stations.slice().sort((a, b) => {
    const pa = portfolioTotals(model, model.ytdKeys, [a.id]).store_profit || 0;
    const pb = portfolioTotals(model, model.ytdKeys, [b.id]).store_profit || 0;
    return pb - pa;
  });
  const list = stores.map((s) => {
    const t = portfolioTotals(model, model.ytdKeys, [s.id]);
    return `<a class="app-row" href="#/app?store=${esc(s.id)}">
      <div class="grow">
        <div class="r-title">${esc(s.name)}</div>
        <div class="r-sub">${esc(pct(t.store_margin))} margin · ${esc(moneyShort(t.sales))} sales</div>
      </div>
      <div class="r-value">${esc(moneyShort(t.store_profit))}</div>
    </a>`;
  }).join("");

  return `${figures(model)}
    <div class="app-card">
      <div class="app-card-head"><h3>By store</h3>
        <span class="hint">${esc(num(stores.length))} store${stores.length === 1 ? "" : "s"}</span></div>
      <div class="app-card-body flush">${list || emptyRow("No stores in view")}</div>
    </div>`;
}

function tile(label, ico, href) {
  return `<a class="app-figure" href="${esc(href)}" style="text-align:center">
    <div style="display:grid;place-items:center;gap:8px">
      <span style="color:var(--cyan-500)">${icon(ico)}</span>
      <span style="font-weight:650">${esc(label)}</span>
    </div>
  </a>`;
}

function emptyRow(text) {
  return `<div class="app-empty">${esc(text)}</div>`;
}

/* -------------------------------------------------------------------------
   Manager: schedule
   ------------------------------------------------------------------------- */

let editingShift = null;

export function renderAppSchedule(ctx) {
  const store = primaryStore(ctx);
  if (!store) return heading("Schedule") + emptyRow("No store to schedule.");
  return heading("Schedule", store.name)
    + `<div id="sched-body">${loadingRow()}</div>`;
}

/* The very same schedule, for embedding on the manager's console dashboard.
   It reads and writes the one shared store, so a shift added on the phone shows
   on the desktop and the other way round — one schedule, two places. Bind it
   with `bindAppSchedule`, which finds the `#sched-body` this drops in. */
export function renderTeamSchedule(ctx) {
  const store = primaryStore(ctx);
  if (!store) return "";
  return `<div class="app-embed" style="margin-top:22px;max-width:600px">
    <div class="section-heading">Team schedule · ${esc(store.name)}</div>
    <div id="sched-body">${loadingRow()}</div>
  </div>`;
}

export async function bindAppSchedule(root, ctx) {
  const store = primaryStore(ctx);
  if (!store) return;
  const body = root.querySelector("#sched-body");
  const draw = async () => {
    const [employees, shifts] = await Promise.all([
      listEmployees(store.id),
      listShifts({ storeId: store.id, from: today() }),
    ]);
    body.innerHTML = scheduleForm(employees, store) + scheduleWeek(shifts, employees);
    wireSchedule(body, store, employees, draw, ctx);
  };
  await draw();
}

function scheduleForm(employees, store) {
  if (!employees.length) {
    return `<div class="app-card"><div class="app-card-body">
      ${emptyRow("Add someone to the team first.")}
      <a class="app-btn" href="#/app/team">${icon("owners")} Go to Team</a>
    </div></div>`;
  }
  const edit = editingShift;
  const options = employees.map((e) => `<option value="${esc(e.id)}"${edit && edit.employeeId === e.id ? " selected" : ""}>${esc(e.name)}</option>`).join("");
  return `<div class="app-card">
    <div class="app-card-head"><h3>${edit ? "Edit shift" : "Add a shift"}</h3>
      ${edit ? `<button class="hint" id="sched-cancel" style="background:none;border:0;cursor:pointer;color:var(--cyan-500)">Cancel</button>` : ""}</div>
    <div class="app-card-body">
      <label class="app-field"><span>Employee</span>
        <select class="app-select" id="sf-emp">${options}</select></label>
      <label class="app-field"><span>Date</span>
        <input class="app-input" type="date" id="sf-date" value="${esc(edit?.date || today())}"></label>
      <div class="app-grid-2">
        <label class="app-field"><span>Start</span>
          <input class="app-input" type="time" id="sf-start" value="${esc(edit?.start || "08:00")}"></label>
        <label class="app-field"><span>End</span>
          <input class="app-input" type="time" id="sf-end" value="${esc(edit?.end || "16:00")}"></label>
      </div>
      <label class="app-field"><span>Note (optional)</span>
        <input class="app-input" id="sf-note" placeholder="Register, deliveries…" value="${esc(edit?.note || "")}"></label>
      <button class="app-btn primary" id="sf-save">${edit ? "Save shift" : "Add shift"}</button>
    </div>
  </div>`;
}

function scheduleWeek(shifts, employees) {
  const byId = new Map(employees.map((e) => [e.id, e.name]));
  const days = nextDays(7);
  const cards = days.map((date) => {
    const rows = shifts.filter((s) => s.date === date);
    const inner = rows.length
      ? rows.map((s) => `<div class="app-row" data-shift="${esc(s.id)}">
          <div class="grow">
            <div class="r-title">${esc(byId.get(s.employeeId) || "—")}</div>
            <div class="r-sub">${esc(s.start)}–${esc(s.end)}${s.note ? ` · ${esc(s.note)}` : ""}</div>
          </div>
          <button class="app-icon-btn" data-edit="${esc(s.id)}" style="background:var(--surface-3);color:var(--text-2)">${icon("pricing")}</button>
          <button class="app-icon-btn" data-del="${esc(s.id)}" style="background:var(--neg-bg);color:var(--neg-fg)">${icon("close")}</button>
        </div>`).join("")
      : `<div class="app-empty" style="padding:14px">Nobody scheduled</div>`;
    return `<div class="app-card">
      <div class="app-card-head"><h3>${esc(dayName(date))}</h3>
        <span class="hint">${rows.length ? `${num(rows.length)} shift${rows.length === 1 ? "" : "s"}` : ""}</span></div>
      <div class="app-card-body flush">${inner}</div>
    </div>`;
  }).join("");
  return cards;
}

function wireSchedule(body, store, employees, draw, ctx) {
  body.querySelector("#sched-cancel")?.addEventListener("click", () => {
    editingShift = null;
    draw();
  });
  body.querySelector("#sf-save")?.addEventListener("click", async () => {
    const employeeId = body.querySelector("#sf-emp").value;
    const date = body.querySelector("#sf-date").value;
    const start = body.querySelector("#sf-start").value;
    const end = body.querySelector("#sf-end").value;
    const note = body.querySelector("#sf-note").value;
    if (!employeeId || !date || !start || !end) { toast("Fill in the shift first", "warn"); return; }
    if (end <= start) { toast("End must be after start", "warn"); return; }
    if (editingShift) {
      await updateShift(editingShift.id, { employeeId, date, start, end, note });
      editingShift = null;
      toast("Shift updated", "ok");
    } else {
      await addShift({ employeeId, storeId: store.id, date, start, end, note });
      toast("Shift added", "ok");
    }
    draw();
  });
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
    await removeShift(btn.dataset.del);
    toast("Shift removed");
    draw();
  }));
  body.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", async () => {
    const shifts = await listShifts({ storeId: store.id });
    editingShift = shifts.find((s) => s.id === btn.dataset.edit) || null;
    draw();
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

/* -------------------------------------------------------------------------
   The clock (shared by manager and employee)
   ------------------------------------------------------------------------- */

let tick = null;
let geoMonitor = { punchId: null, stop: null };

function clearTick() {
  if (tick) { clearInterval(tick); tick = null; }
}

/*
 * A single running geofence for whoever is clocked in on this device. It keeps
 * running across screens, so an employee who wanders off is clocked out even if
 * they are not looking at the clock. Called on every app render; it starts,
 * leaves alone, or tears down the watch to match the open punch.
 */
export async function ensureGeofence(employeeId, rerender) {
  const punch = employeeId ? await openPunch(employeeId) : null;
  if (!punch) {
    if (geoMonitor.stop) geoMonitor.stop();
    geoMonitor = { punchId: null, stop: null };
    return;
  }
  if (geoMonitor.punchId === punch.id) return;
  if (geoMonitor.stop) geoMonitor.stop();
  const place = await getPlace(punch.storeId);
  if (!place || !geoSupported()) { geoMonitor = { punchId: null, stop: null }; return; }
  const stop = watchGeofence(
    { lat: place.lat, lng: place.lng },
    place.radiusFt || DEFAULT_RADIUS_FT,
    {
      onExit: async () => {
        await clockOut(punch.id, { auto: true });
        notify("Clocked out automatically", "You left the store area, so the clock stopped.");
        if (geoMonitor.stop) geoMonitor.stop();
        geoMonitor = { punchId: null, stop: null };
        rerender?.();
      },
    },
  );
  geoMonitor = { punchId: punch.id, stop };
}

function clockCard(punch, place) {
  const onBreak = activeBreak(punch);
  const state = !punch ? "off" : (onBreak ? "brk" : "on");
  const label = state === "on" ? "On the clock" : state === "brk" ? "On break" : "Clocked out";
  const since = punch ? clockTime(punch.clockIn) : null;

  const breaks = BREAK_KINDS.map((k) => {
    const used = punch?.breaks?.some((b) => b.type === k.type) || false;
    const running = onBreak?.type === k.type;
    return `<button class="break-chip${running ? " active" : used ? " used" : ""}" data-break="${esc(k.type)}"${!punch || (used && !running) ? " disabled" : ""}>
      ${esc(k.label)}<small>${k.minutes} min${k.paid ? " · paid" : ""}</small></button>`;
  }).join("");

  const geoLine = place
    ? `<div class="geo-note ok" id="geo-line">${icon("pin")} Within ${esc(num(place.radiusFt || DEFAULT_RADIUS_FT))} ft of the store to clock in</div>`
    : `<div class="geo-note warn">${icon("alert")} No clock-in location set for this store yet</div>`;

  return `<div class="app-card">
    <div class="clock-face">
      <div class="clock-state ${state}">${esc(label)}</div>
      <div class="clock-elapsed" id="clock-elapsed">${punch ? hms(Date.now() - punch.clockIn) : "0:00:00"}</div>
      <div class="clock-since">${since ? `Since ${esc(since)}` : "Tap to start your shift"}</div>
    </div>
    <div class="app-card-body">
      ${geoLine}
      <div style="margin-top:12px">
        ${!punch
    ? `<button class="app-btn primary" id="clock-in">${icon("clock")} Clock in</button>`
    : `${onBreak
      ? `<button class="app-btn" id="break-end">End break</button>`
      : `<div class="break-grid" style="margin-bottom:10px">${breaks}</div>`}
       <button class="app-btn danger" id="clock-out">Clock out</button>`}
      </div>
    </div>
  </div>`;
}

/* Binds one clock. `enforce` blocks clock-in when outside the fence — on for
   employees, and for anyone once a location is set. */
function bindClock(root, { employeeId, storeId, rerender }) {
  clearTick();
  const paint = () => {
    const el = root.querySelector("#clock-elapsed");
    if (!el) { clearTick(); return; }
    // Re-read the open punch time from the DOM's data isn't needed; recompute.
  };

  const refresh = async () => {
    const punch = await openPunch(employeeId);
    const el = root.querySelector("#clock-elapsed");
    if (el && punch) el.textContent = hms(Date.now() - punch.clockIn);
  };
  tick = setInterval(refresh, 1000);
  paint();

  root.querySelector("#clock-in")?.addEventListener("click", async () => {
    const btn = root.querySelector("#clock-in");
    const place = await getPlace(storeId);
    let coords = null;
    if (place) {
      btn.disabled = true;
      btn.textContent = "Checking location…";
      try {
        coords = await getPosition();
      } catch (err) {
        toast(err.message, "warn");
        btn.disabled = false;
        btn.innerHTML = `${icon("clock")} Clock in`;
        return;
      }
      const d = distanceFt({ lat: place.lat, lng: place.lng }, coords);
      const margin = Math.min((coords.accuracy || 0) * 3.28084, place.radiusFt || DEFAULT_RADIUS_FT);
      if (d > (place.radiusFt || DEFAULT_RADIUS_FT) + margin) {
        toast(`You're ${distanceLabel(d)} away — too far to clock in`, "warn");
        btn.disabled = false;
        btn.innerHTML = `${icon("clock")} Clock in`;
        return;
      }
    }
    await clockIn(employeeId, storeId, coords);
    await requestNotify();
    await ensureGeofence(employeeId, rerender);
    rerender();
  });

  root.querySelector("#clock-out")?.addEventListener("click", async () => {
    const punch = await openPunch(employeeId);
    if (punch) await clockOut(punch.id);
    rerender();
  });

  root.querySelector("#break-end")?.addEventListener("click", async () => {
    const punch = await openPunch(employeeId);
    if (punch) await endBreak(punch.id);
    rerender();
  });

  root.querySelectorAll("[data-break]").forEach((chip) => chip.addEventListener("click", async () => {
    const punch = await openPunch(employeeId);
    if (punch) await startBreak(punch.id, chip.dataset.break);
    rerender();
  }));
}

export function renderAppClock(ctx) {
  const store = primaryStore(ctx);
  return heading("My clock", store ? store.name : "")
    + `<div id="clock-body">${loadingRow()}</div>`;
}

export async function bindAppClock(root, ctx) {
  const store = primaryStore(ctx);
  if (!store) return;
  // The manager clocks under their own name, kept as a self-employee record.
  const self = await managerSelf(ctx, store);
  const body = root.querySelector("#clock-body");
  const place = await getPlace(store.id);
  body.innerHTML = clockCard(await openPunch(self.id), place)
    + recentPunches(await listPunches({ employeeId: self.id }));
  bindClock(body, { employeeId: self.id, storeId: store.id, rerender: ctx.rerender });
}

/* The manager as a clock subject. Reuses the employee store so punches and the
   geofence work the same, tagged so it never shows up in the crew roster. */
async function managerSelf(ctx, store) {
  const key = `mgr:${ctx.user?.email || "manager"}`;
  const existing = (await listEmployees(store.id)).find((e) => e.pin === key);
  if (existing) return existing;
  // Look across inactive too by scanning all — addEmployee if truly missing.
  const all = await listEmployees();
  const found = all.find((e) => e.pin === key);
  if (found) return found;
  return addEmployee({ name: ctx.user?.client || "Manager", storeId: store.id, pin: key });
}

function recentPunches(punches) {
  const rows = punches.filter((p) => p.clockOut).slice(0, 6);
  if (!rows.length) return "";
  const body = rows.map((p) => {
    const worked = hms((p.clockOut - p.clockIn));
    return `<div class="app-row">
      <div class="grow">
        <div class="r-title">${esc(dayName(p.date))}</div>
        <div class="r-sub">${esc(clockTime(p.clockIn))} – ${esc(clockTime(p.clockOut))}${p.auto ? " · auto" : ""}</div>
      </div>
      <div class="r-value">${esc(worked)}</div>
    </div>`;
  }).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Recent</h3></div>
    <div class="app-card-body flush">${body}</div></div>`;
}

/* -------------------------------------------------------------------------
   Manager: team
   ------------------------------------------------------------------------- */

export function renderAppTeam(ctx) {
  const store = primaryStore(ctx);
  if (!store) return heading("Team") + emptyRow("No store.");
  return heading("Team", store.name) + `<div id="team-body">${loadingRow()}</div>`;
}

export async function bindAppTeam(root, ctx) {
  const store = primaryStore(ctx);
  if (!store) return;
  const body = root.querySelector("#team-body");
  const draw = async () => {
    const [employees, place] = await Promise.all([listEmployees(store.id), getPlace(store.id)]);
    const roster = employees.filter((e) => !String(e.pin).startsWith("mgr:"));
    body.innerHTML = placeCard(place) + rosterCard(roster) + addEmployeeCard();
    wireTeam(body, store, draw);
  };
  await draw();
}

function placeCard(place) {
  const perm = notifyPermission();
  return `<div class="app-card">
    <div class="app-card-head"><h3>Clock-in location</h3>
      <span class="hint">${place ? `${num(place.radiusFt || DEFAULT_RADIUS_FT)} ft` : "not set"}</span></div>
    <div class="app-card-body">
      ${place
    ? `<div class="geo-note ok">${icon("pin")} Set${place.label ? ` · ${esc(place.label)}` : ""}. Staff must be within ${esc(num(place.radiusFt || DEFAULT_RADIUS_FT))} ft to clock in.</div>`
    : `<div class="geo-note warn">${icon("alert")} Stand at the store and capture the spot. Staff can only clock in within range, and are clocked out if they leave.</div>`}
      <label class="app-field" style="margin-top:12px"><span>Range (feet)</span>
        <input class="app-input" type="number" id="tm-radius" min="100" max="2000" step="50" value="${esc(place?.radiusFt || DEFAULT_RADIUS_FT)}"></label>
      <button class="app-btn" id="tm-setplace">${icon("pin")} ${place ? "Update to my location" : "Set to my location"}</button>
      ${perm !== "granted" ? `<button class="app-btn ghost" id="tm-notify" style="margin-top:10px">${icon("mail")} Turn on clock notifications</button>` : ""}
    </div>
  </div>`;
}

function rosterCard(employees) {
  const rows = employees.length
    ? employees.map((e) => `<div class="app-row">
        <div class="app-avatar">${esc(initials(e.name))}</div>
        <div class="grow">
          <div class="r-title">${esc(e.name)}</div>
          <div class="r-sub">${e.phone ? esc(e.phone) : "No phone"} · PIN ${e.pin ? "set" : "none"}</div>
        </div>
        <button class="app-icon-btn" data-remove="${esc(e.id)}" style="background:var(--neg-bg);color:var(--neg-fg)">${icon("close")}</button>
      </div>`).join("")
    : emptyRow("No one on the team yet");
  return `<div class="app-card"><div class="app-card-head"><h3>Team</h3>
    <span class="hint">${num(employees.length)}</span></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

function addEmployeeCard() {
  return `<div class="app-card"><div class="app-card-head"><h3>Add someone</h3></div>
    <div class="app-card-body">
      <label class="app-field"><span>Name</span><input class="app-input" id="te-name" placeholder="Full name"></label>
      <div class="app-grid-2">
        <label class="app-field"><span>Phone (optional)</span><input class="app-input" id="te-phone" inputmode="tel" placeholder="(000) 000-0000"></label>
        <label class="app-field"><span>Clock-in PIN</span><input class="app-input" id="te-pin" inputmode="numeric" maxlength="6" placeholder="4 digits"></label>
      </div>
      <button class="app-btn primary" id="te-add">${icon("owners")} Add to team</button>
    </div></div>`;
}

function wireTeam(body, store, draw) {
  body.querySelector("#tm-setplace")?.addEventListener("click", async () => {
    const btn = body.querySelector("#tm-setplace");
    btn.disabled = true; btn.textContent = "Reading location…";
    try {
      const pos = await getPosition();
      const radius = Number(body.querySelector("#tm-radius").value) || DEFAULT_RADIUS_FT;
      await setPlace(store.id, { lat: pos.lat, lng: pos.lng, radiusFt: radius, label: store.name });
      toast("Clock-in location set", "ok");
    } catch (err) {
      toast(err.message, "warn");
    }
    draw();
  });
  body.querySelector("#tm-notify")?.addEventListener("click", async () => {
    const res = await requestNotify();
    toast(res === "granted" ? "Notifications on" : "Notifications not allowed", res === "granted" ? "ok" : "warn");
    draw();
  });
  body.querySelector("#te-add")?.addEventListener("click", async () => {
    const name = body.querySelector("#te-name").value.trim();
    const phone = body.querySelector("#te-phone").value.trim();
    const pin = body.querySelector("#te-pin").value.trim();
    if (!name) { toast("Enter a name", "warn"); return; }
    await addEmployee({ name, storeId: store.id, phone, pin });
    toast("Added to team", "ok");
    draw();
  });
  body.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", async () => {
    await removeEmployee(btn.dataset.remove);
    toast("Removed");
    draw();
  }));
}

/* -------------------------------------------------------------------------
   Tasks (manager assigns; the store and employees work them off)
   ------------------------------------------------------------------------- */

export function renderAppTasks(ctx) {
  const store = primaryStore(ctx);
  if (!store) return heading("Tasks") + emptyRow("No store.");
  return heading("Tasks", store.name) + `<div id="tasks-body">${loadingRow()}</div>`;
}

export async function bindAppTasks(root, ctx) {
  const store = primaryStore(ctx);
  if (!store) return;
  const body = root.querySelector("#tasks-body");
  const draw = async () => {
    const [tasks, employees] = await Promise.all([
      listTasks({ storeId: store.id }), listEmployees(store.id),
    ]);
    body.innerHTML = taskForm(employees) + taskList(tasks, employees);
    wireTasks(body, store, draw);
  };
  await draw();
}

function taskForm(employees) {
  const options = [`<option value="">Anyone on shift</option>`]
    .concat(employees.filter((e) => !String(e.pin).startsWith("mgr:"))
      .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`)).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Add a task</h3></div>
    <div class="app-card-body">
      <label class="app-field"><span>Task</span><input class="app-input" id="tk-title" placeholder="Restock cooler, count register…"></label>
      <label class="app-field"><span>For</span><select class="app-select" id="tk-emp">${options}</select></label>
      <button class="app-btn primary" id="tk-add">${icon("check")} Add task</button>
    </div></div>`;
}

function taskList(tasks, employees) {
  const byId = new Map(employees.map((e) => [e.id, e.name]));
  if (!tasks.length) return `<div class="app-card"><div class="app-card-body">${emptyRow("No tasks yet")}</div></div>`;
  const rows = tasks.map((t) => `<div class="app-row${t.done ? " is-done" : ""}">
    <div class="task-check${t.done ? " done" : ""}" data-toggle="${esc(t.id)}">${t.done ? icon("check") : ""}</div>
    <div class="grow">
      <div class="r-title">${esc(t.title)}</div>
      <div class="r-sub">${t.employeeId ? esc(byId.get(t.employeeId) || "Assigned") : "Anyone on shift"}</div>
    </div>
    <button class="app-icon-btn" data-remove="${esc(t.id)}" style="background:var(--surface-3);color:var(--text-3)">${icon("close")}</button>
  </div>`).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Open &amp; done</h3></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

function wireTasks(body, store, draw) {
  body.querySelector("#tk-add")?.addEventListener("click", async () => {
    const title = body.querySelector("#tk-title").value.trim();
    const employeeId = body.querySelector("#tk-emp").value || null;
    if (!title) { toast("Enter a task", "warn"); return; }
    await addTask({ storeId: store.id, employeeId, title });
    toast("Task added", "ok");
    draw();
  });
  body.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", async () => {
    const tasks = await listTasks({ storeId: store.id });
    const t = tasks.find((x) => x.id === el.dataset.toggle);
    await toggleTask(el.dataset.toggle, !(t && t.done));
    draw();
  }));
  body.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", async () => {
    await removeTask(btn.dataset.remove);
    draw();
  }));
}

/* -------------------------------------------------------------------------
   Employee mode
   ------------------------------------------------------------------------- */

export function renderAppMe(ctx) {
  return `<div id="me-body">${loadingRow()}</div>`;
}

export async function bindAppMe(root, ctx) {
  const body = root.querySelector("#me-body");
  const draw = async () => {
    const empId = activeEmployeeId();
    const employee = empId ? await getEmployee(empId) : null;
    if (!employee || employee.active === false) {
      body.innerHTML = await employeePicker();
      wirePicker(body, draw);
      return;
    }
    const [punch, shifts, tasks, place] = await Promise.all([
      openPunch(employee.id),
      listShifts({ employeeId: employee.id, from: today() }),
      listTasks({ storeId: employee.storeId, employeeId: employee.id }),
      getPlace(employee.storeId),
    ]);
    body.innerHTML = `
      <div class="app-greet"><h2>${esc(greeting())}, ${esc(employee.name.split(" ")[0])}</h2>
        <p>${esc(shiftLine(shifts))}</p></div>
      ${clockCard(punch, place)}
      ${meTasks(tasks)}
      ${meSchedule(shifts)}
      <button class="app-btn ghost" id="me-signout">${icon("logout")} Not you? Sign out</button>`;
    bindClock(body, { employeeId: employee.id, storeId: employee.storeId, rerender: draw });
    body.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", async () => {
      const list = await listTasks({ storeId: employee.storeId, employeeId: employee.id });
      const t = list.find((x) => x.id === el.dataset.toggle);
      await toggleTask(el.dataset.toggle, !(t && t.done));
      draw();
    }));
    body.querySelector("#me-signout")?.addEventListener("click", async () => {
      await setActiveEmployee(null);
      draw();
    });
    await ensureGeofence(employee.id, draw);
  };
  await draw();
}

function shiftLine(shifts) {
  const todays = shifts.find((s) => s.date === today());
  if (todays) return `Today ${todays.start}–${todays.end}${todays.note ? ` · ${todays.note}` : ""}`;
  const next = shifts[0];
  return next ? `Next: ${dayName(next.date)} ${next.start}–${next.end}` : "No upcoming shifts";
}

async function employeePicker() {
  const all = (await listEmployees()).filter((e) => !String(e.pin).startsWith("mgr:"));
  const rows = all.length
    ? all.map((e) => `<div class="app-row" data-pick="${esc(e.id)}" data-haspin="${e.pin ? "1" : "0"}">
        <div class="app-avatar">${esc(initials(e.name))}</div>
        <div class="grow"><div class="r-title">${esc(e.name)}</div>
          <div class="r-sub">Tap to sign in</div></div>
        ${icon("chevron")}
      </div>`).join("")
    : emptyRow("No employees set up on this device yet. A manager adds the team under Team.");
  return `<div class="app-greet"><h2>Who's clocking in?</h2>
      <p>Pick your name, then your PIN.</p></div>
    <div class="app-card"><div class="app-card-body flush">${rows}</div></div>`;
}

function wirePicker(body, draw) {
  body.querySelectorAll("[data-pick]").forEach((row) => row.addEventListener("click", async () => {
    const id = row.dataset.pick;
    const employee = await getEmployee(id);
    if (row.dataset.haspin === "1") {
      const entered = window.prompt(`PIN for ${employee.name}`);
      if (entered == null) return;
      if (String(entered).trim() !== String(employee.pin)) { toast("Wrong PIN", "warn"); return; }
    }
    await setActiveEmployee(id);
    draw();
  }));
}

function meTasks(tasks) {
  const open = tasks.filter((t) => !t.done);
  if (!open.length && !tasks.length) return "";
  const rows = tasks.map((t) => `<div class="app-row${t.done ? " is-done" : ""}">
    <div class="task-check${t.done ? " done" : ""}" data-toggle="${esc(t.id)}">${t.done ? icon("check") : ""}</div>
    <div class="grow"><div class="r-title">${esc(t.title)}</div></div>
  </div>`).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Your tasks</h3>
    <span class="hint">${num(open.length)} open</span></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

function meSchedule(shifts) {
  if (!shifts.length) return "";
  const rows = shifts.slice(0, 7).map((s) => `<div class="app-row">
    <div class="grow"><div class="r-title">${esc(dayName(s.date))}</div>
      <div class="r-sub">${s.note ? esc(s.note) : "Shift"}</div></div>
    <div class="r-value">${esc(s.start)}–${esc(s.end)}</div>
  </div>`).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Your week</h3></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

/* -------------------------------------------------------------------------
   Small shared bits
   ------------------------------------------------------------------------- */

function heading(title, sub = "") {
  return `<div class="app-greet"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>`;
}

function loadingRow() {
  return `<div class="app-card"><div class="app-card-body">${emptyRow("Loading…")}</div></div>`;
}
