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
  BREAK_KINDS, DEFAULT_RADIUS_FT, activeEmployeeId, addEmployee, addPunch, addShift,
  addTask, clockIn, clockOut, endBreak, getEmployee, getPlace, listEmployees,
  listPunches, listShifts, listTasks, markReminder, openPunch, recordPhoneOff, removeEmployee,
  removePunch, removeShift, removeTask, setActiveEmployee, setPlace, startBreak,
  today, toggleTask, touchPunch, updateEmployee, updatePunch, updateShift,
} from "../appstore.js";
import {
  distanceFt, distanceLabel, geoSupported, getPosition, notify, notifyPermission,
  requestNotify, watchGeofence,
} from "../geo.js";
import {
  addDays, computeTimesheet, datesInRange, payPeriodOf, payPeriodShift, weekStartMonday,
} from "../pay.js";
import { downloadExcel } from "../exporter.js";
import { capturePhoto } from "../camera.js";

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
      <a class="app-btn tc-launch" href="#/app/timeclock">${icon("clock")}
        <span>Open time clock${store ? ` · ${esc(store.name)}` : ""}</span></a>
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
let mePeriodAnchor = today();
let tcPeriodAnchor = today();
let tcEmployeeId = "";
let tcDate = today();

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
let geoMonitor = { punchId: null, employeeId: null, stop: null, timer: null };
let lifecycleInstalled = false;

function clearTick() {
  if (tick) { clearInterval(tick); tick = null; }
}

function teardownMonitor() {
  if (geoMonitor.stop) geoMonitor.stop();
  if (geoMonitor.timer) clearInterval(geoMonitor.timer);
  geoMonitor = { punchId: null, employeeId: null, stop: null, timer: null };
}

/*
 * Stamp when the device goes dark. The browser can't run code the instant a
 * phone loses power, but it does fire these as the app is backgrounded or
 * closed, and the heartbeat's `lastSeen` covers a hard power-off. Installed once;
 * it reads whoever the monitor currently has on the clock.
 */
function installLifecycle() {
  if (lifecycleInstalled || typeof document === "undefined") return;
  lifecycleInstalled = true;
  const stamp = () => {
    if (geoMonitor.employeeId) recordPhoneOff(geoMonitor.employeeId).catch(() => {});
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) stamp(); });
  window.addEventListener("pagehide", stamp);
  window.addEventListener("beforeunload", stamp);
}

/*
 * When each California break comes due, measured from the clock, the way the
 * stores already run it: the first paid rest an hour and a half in, the unpaid
 * meal before the end of the fifth hour (three and a half hours in), and the
 * second paid rest an hour and a half after the meal ends. `rest2` stays null
 * until the meal is taken, since it hangs off the meal's end.
 */
function reminderTimes(punch) {
  const start = punch.clockIn;
  const meal = (punch.breaks || []).find((b) => b.type === "meal");
  const mealEnd = meal && meal.end ? meal.end : 0;
  return {
    rest1: start + 1.5 * 3600000,
    meal: start + 3.5 * 3600000,
    rest2: mealEnd ? mealEnd + 1.5 * 3600000 : 0,
  };
}

const REMINDER_COPY = {
  rest1: ["Time for a 10-minute rest break", "Paid 10-minute rest break. (California)"],
  meal: ["Time for your 30-minute meal break", "Unpaid meal — start it before the end of your 5th hour. (California)"],
  rest2: ["Time for your second 10-minute rest break", "Paid 10-minute rest break. (California)"],
  clockout: ["Your shift has ended", "Time to clock out."],
};

/*
 * Fire any break or clock-out reminder that has come due, once each. Reads the
 * punch fresh so it sees breaks taken since the timer started, skips a reminder
 * whose break is already taken, and records every one it fires so it never
 * nags twice — the flag lives on the punch, so it survives a reload too.
 */
async function checkBreakReminders(employeeId) {
  const punch = await openPunch(employeeId);
  if (!punch) return;
  const now = Date.now();
  const times = reminderTimes(punch);
  const done = punch.reminded || {};

  for (const key of ["rest1", "meal", "rest2"]) {
    if (done[key]) continue;
    const taken = (punch.breaks || []).some((b) => b.type === key);
    if (taken) { await markReminder(punch.id, key); continue; }
    if (times[key] && now >= times[key]) {
      notify(...REMINDER_COPY[key]);
      await markReminder(punch.id, key);
    }
  }

  if (!done.clockout) {
    const shift = (await listShifts({ employeeId, from: punch.date, to: punch.date }))
      .find((s) => s.date === punch.date);
    if (shift && shift.end) {
      const endTs = new Date(`${punch.date}T${shift.end}:00`).getTime();
      if (Number.isFinite(endTs) && now >= endTs) {
        notify(...REMINDER_COPY.clockout);
        await markReminder(punch.id, "clockout");
      }
    }
  }
}

/*
 * A single running monitor for whoever is clocked in on this device. It keeps
 * running across screens, so an employee who wanders off is clocked out even if
 * they are not looking at the clock, and the break reminders fire wherever they
 * are in the app. Called on every app render; it starts, leaves alone, or tears
 * down to match the open punch. The break-reminder timer runs regardless; the
 * geofence watch only when the store has a clock-in spot set.
 */
export async function ensureGeofence(employeeId, rerender) {
  const punch = employeeId ? await openPunch(employeeId) : null;
  if (!punch) { teardownMonitor(); return; }
  if (geoMonitor.punchId === punch.id) return;
  teardownMonitor();
  installLifecycle();
  geoMonitor.punchId = punch.id;
  geoMonitor.employeeId = employeeId;

  // A heartbeat marks the device alive and fires the break reminders. If the
  // phone dies, the last beat is the closest we have to when it went dark.
  const beat = () => {
    touchPunch(employeeId).catch(() => {});
    checkBreakReminders(employeeId).catch(() => {});
  };
  geoMonitor.timer = setInterval(beat, 15000);
  beat();

  const place = await getPlace(punch.storeId);
  if (place && geoSupported()) {
    geoMonitor.stop = watchGeofence(
      { lat: place.lat, lng: place.lng },
      place.radiusFt || DEFAULT_RADIUS_FT,
      {
        onExit: async () => {
          await clockOut(punch.id, { auto: true });
          notify("Clocked out automatically", "You left the store area, so the clock stopped.");
          teardownMonitor();
          rerender?.();
        },
      },
    );
  }
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
  let ticks = 0;
  const refresh = async () => {
    const punch = await openPunch(employeeId);
    const el = root.querySelector("#clock-elapsed");
    if (!el) { clearTick(); return; }
    if (punch) el.textContent = hms(Date.now() - punch.clockIn);
    // A backup to the persistent monitor, so reminders fire while this screen
    // is open even for a manager clocking under their own name.
    ticks += 1;
    if (punch && ticks % 20 === 0) checkBreakReminders(employeeId).catch(() => {});
  };
  tick = setInterval(refresh, 1000);
  refresh();

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
          <div class="r-sub">${e.username ? `@${esc(e.username)}` : "no username"}${e.rate ? ` · ${esc(money(e.rate))}/hr` : ""} · PIN ${e.pin ? "set" : "none"}</div>
        </div>
        <button class="app-icon-btn" data-remove="${esc(e.id)}" style="background:var(--neg-bg);color:var(--neg-fg)">${icon("close")}</button>
      </div>`).join("")
    : emptyRow("No one on the team yet");
  return `<div class="app-card"><div class="app-card-head"><h3>Team</h3>
    <span class="hint">${num(employees.length)}</span></div>
    <div class="app-card-body flush">${rows}</div>
    ${employees.length ? `<div class="app-card-body"><button class="app-btn" id="tm-logins">${icon("printer")} Download logins (Excel)</button></div>` : ""}
  </div>`;
}

function addEmployeeCard() {
  return `<div class="app-card"><div class="app-card-head"><h3>Add someone</h3></div>
    <div class="app-card-body">
      <label class="app-field"><span>Name</span><input class="app-input" id="te-name" placeholder="Full name"></label>
      <div class="app-grid-2">
        <label class="app-field"><span>Phone (optional)</span><input class="app-input" id="te-phone" inputmode="tel" placeholder="(000) 000-0000"></label>
        <label class="app-field"><span>Pay rate $/hr</span><input class="app-input" id="te-rate" inputmode="decimal" placeholder="e.g. 18.00"></label>
      </div>
      <div class="app-grid-2">
        <label class="app-field"><span>Username</span><input class="app-input" id="te-user" placeholder="auto from name"></label>
        <label class="app-field"><span>Password / PIN</span><input class="app-input" id="te-pin" inputmode="numeric" maxlength="12" placeholder="4-digit PIN"></label>
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
    const username = body.querySelector("#te-user").value.trim();
    const rate = body.querySelector("#te-rate").value.trim();
    if (!name) { toast("Enter a name", "warn"); return; }
    const row = await addEmployee({ name, storeId: store.id, phone, pin, username, rate });
    toast(`Added — username @${row.username}`, "ok");
    draw();
  });
  body.querySelector("#tm-logins")?.addEventListener("click", async () => {
    const roster = (await listEmployees(store.id)).filter((e) => !String(e.pin).startsWith("mgr:"));
    if (!roster.length) { toast("No team to export", "warn"); return; }
    const headers = ["Name", "Username", "Password / PIN", "Phone", "Pay rate $/hr"];
    const rows = roster.map((e) => [e.name, e.username || "", e.password || e.pin || "", e.phone || "", e.rate ?? ""]);
    downloadExcel(`team-logins-${store.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      { name: "Logins", headers, rows });
    toast("Logins downloaded", "ok");
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
    const ranked = rankCrew(employees, tasks);
    body.innerHTML = taskForm(employees) + taskList(tasks, employees) + bonusBoard(ranked);
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
      <label class="app-field"><span>Note (optional)</span><input class="app-input" id="tk-note" placeholder="Aisle, count, details…"></label>
      <div class="app-grid-2">
        <label class="app-field"><span>For</span><select class="app-select" id="tk-emp">${options}</select></label>
        <label class="app-field"><span>Date</span><input class="app-input" type="date" id="tk-date" value="${esc(today())}"></label>
      </div>
      <label class="app-check"><input type="checkbox" id="tk-photo">
        <span>${icon("camera")} Require a photo to complete</span></label>
      <button class="app-btn primary" id="tk-add">${icon("check")} Add task</button>
    </div></div>`;
}

function taskList(tasks, employees) {
  const byId = new Map(employees.map((e) => [e.id, e.name]));
  if (!tasks.length) return `<div class="app-card"><div class="app-card-body">${emptyRow("No tasks yet")}</div></div>`;
  const rows = tasks.map((t) => {
    const who = t.employeeId ? (byId.get(t.employeeId) || "Assigned") : "Anyone on shift";
    const when = t.date ? dayName(t.date) : "";
    const doneLine = t.done && t.doneBy ? ` · done by ${esc(byId.get(t.doneBy) || "staff")}` : "";
    const cam = t.requirePhoto ? `<span class="task-cam" title="Photo required">${icon("camera")}</span>` : "";
    const proof = t.done && t.photo
      ? `<img class="task-proof" src="${esc(t.photo)}" alt="Proof" data-photo="${esc(t.photo)}">`
      : "";
    return `<div class="app-row task-row${t.done ? " is-done" : ""}">
      <div class="task-check${t.done ? " done" : ""}" data-toggle="${esc(t.id)}">${t.done ? icon("check") : ""}</div>
      <div class="grow">
        <div class="r-title">${esc(t.title)}${cam}</div>
        <div class="r-sub">${esc(who)}${when ? ` · ${esc(when)}` : ""}${doneLine}</div>
      </div>
      ${proof}
      <button class="app-icon-btn" data-remove="${esc(t.id)}" style="background:var(--surface-3);color:var(--text-3)">${icon("close")}</button>
    </div>`;
  }).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Open &amp; done</h3></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

function wireTasks(body, store, draw) {
  body.querySelector("#tk-add")?.addEventListener("click", async () => {
    const title = body.querySelector("#tk-title").value.trim();
    const note = body.querySelector("#tk-note").value.trim();
    const employeeId = body.querySelector("#tk-emp").value || null;
    const date = body.querySelector("#tk-date").value || today();
    const requirePhoto = body.querySelector("#tk-photo").checked;
    if (!title) { toast("Enter a task", "warn"); return; }
    await addTask({ storeId: store.id, employeeId, title, note, date, requirePhoto });
    toast("Task added", "ok");
    draw();
  });
  body.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", async () => {
    const tasks = await listTasks({ storeId: store.id });
    const t = tasks.find((x) => x.id === el.dataset.toggle);
    await toggleTask(el.dataset.toggle, !(t && t.done));
    draw();
  }));
  body.querySelectorAll("[data-photo]").forEach((el) => el.addEventListener("click", () => {
    showPhoto(el.dataset.photo);
  }));
  body.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", async () => {
    await removeTask(btn.dataset.remove);
    draw();
  }));
}

/* -------------------------------------------------------------------------
   Manager: time-clock editor (manager only — the employee clock has no edit)
   ------------------------------------------------------------------------- */

function timeHHMM(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function tsFromDayTime(dateYmd, hhmm) {
  if (!hhmm) return null;
  const t = new Date(`${dateYmd}T${hhmm}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

export function renderAppTimeclock(ctx) {
  const store = primaryStore(ctx);
  if (!store) return heading("Time clock") + emptyRow("No store.");
  return heading(store.name, "Employee time clock — edit punches, see paid hours")
    + `<div id="tc-body">${loadingRow()}</div>`;
}

export async function bindAppTimeclock(root, ctx) {
  const store = primaryStore(ctx);
  if (!store) return;
  const body = root.querySelector("#tc-body");
  const draw = async () => {
    const roster = (await listEmployees(store.id)).filter((e) => !String(e.pin).startsWith("mgr:"));
    if (!roster.length) {
      body.innerHTML = `<div class="app-card"><div class="app-card-body">${emptyRow("Add someone to the team first.")}
        <a class="app-btn" href="#/app/team">${icon("owners")} Go to Team</a></div></div>`;
      return;
    }
    if (!tcEmployeeId || !roster.some((e) => e.id === tcEmployeeId)) tcEmployeeId = roster[0].id;
    const employee = roster.find((e) => e.id === tcEmployeeId);
    const punches = await listPunches({ employeeId: employee.id });
    const dayPunches = punches.filter((p) => p.date === tcDate)
      .sort((a, b) => a.clockIn - b.clockIn);
    const period = payPeriodOf(tcPeriodAnchor);
    body.innerHTML = tcPickerCard(roster, employee)
      + tcDayCard(dayPunches)
      + timesheetCard(punches, period, employee, "tc-ts", { title: "Paid hours" });
    wireTimeclock(body, { store, employee, draw });
    wireTimesheet(body, {
      idPrefix: "tc-ts",
      employee,
      punches,
      getAnchor: () => tcPeriodAnchor,
      setAnchor: (v) => { tcPeriodAnchor = v; },
      redraw: draw,
    });
  };
  await draw();
}

function tcPickerCard(roster, employee) {
  const options = roster.map((e) => `<option value="${esc(e.id)}"${e.id === employee.id ? " selected" : ""}>${esc(e.name)}</option>`).join("");
  return `<div class="app-card">
    <div class="app-card-body">
      <label class="app-field"><span>Employee</span>
        <select class="app-select" id="tc-emp">${options}</select></label>
      <label class="app-field"><span>Day</span>
        <input class="app-input" type="date" id="tc-date" value="${esc(tcDate)}"></label>
    </div>
  </div>`;
}

/* For an open punch that stopped reporting, the last time the device was known
   alive — from an explicit background/close event, else the heartbeat. This is
   the moment a phone that died went dark, and the offered clock-out time. */
function phoneOffNote(punch) {
  if (punch.clockOut) return "";
  const events = punch.offEvents || [];
  const off = events.length ? events[events.length - 1].at : punch.lastSeen;
  if (!off) return "";
  const hhmm = timeHHMM(off);
  return `<div class="geo-note warn" style="margin:8px 0">${icon("alert")}
    Phone last on at <b>${esc(clockTime(off))}</b> — still no clock-out.
    <button class="app-btn" data-lastout="${esc(hhmm)}" style="margin-top:8px">
      Set clock-out to ${esc(clockTime(off))}</button></div>`;
}

function tcDayCard(dayPunches) {
  const rows = dayPunches.map((p) => {
    const meal = (p.breaks || []).find((b) => b.type === "meal");
    let tag = p.manual ? "manual" : p.edited ? "edited" : p.auto ? "auto-out" : "";
    if (p.offEvents && p.offEvents.length) tag = tag ? `${tag} · phone-off` : "phone-off";
    return `<div class="app-card" data-punch="${esc(p.id)}">
      <div class="app-card-head"><h3>${esc(clockTime(p.clockIn))}${p.clockOut ? ` – ${esc(clockTime(p.clockOut))}` : " · open"}</h3>
        ${tag ? `<span class="hint">${tag}</span>` : ""}</div>
      <div class="app-card-body">
        <div class="app-grid-2">
          <label class="app-field"><span>Clock in</span><input class="app-input" type="time" data-f="in" value="${esc(timeHHMM(p.clockIn))}"></label>
          <label class="app-field"><span>Clock out</span><input class="app-input" type="time" data-f="out" value="${esc(p.clockOut ? timeHHMM(p.clockOut) : "")}"></label>
        </div>
        <div class="app-grid-2">
          <label class="app-field"><span>Meal start</span><input class="app-input" type="time" data-f="mealin" value="${esc(meal && meal.start ? timeHHMM(meal.start) : "")}"></label>
          <label class="app-field"><span>Meal end</span><input class="app-input" type="time" data-f="mealout" value="${esc(meal && meal.end ? timeHHMM(meal.end) : "")}"></label>
        </div>
        ${phoneOffNote(p)}
        <div class="app-grid-2">
          <button class="app-btn" data-save="${esc(p.id)}">Save</button>
          <button class="app-btn danger" data-del="${esc(p.id)}">Delete</button>
        </div>
      </div>
    </div>`;
  }).join("");
  const add = `<div class="app-card"><div class="app-card-head"><h3>Add an entry</h3></div>
    <div class="app-card-body">
      <div class="app-grid-2">
        <label class="app-field"><span>Clock in</span><input class="app-input" type="time" id="tc-add-in" value="08:00"></label>
        <label class="app-field"><span>Clock out</span><input class="app-input" type="time" id="tc-add-out" value="16:00"></label>
      </div>
      <button class="app-btn primary" id="tc-add">${icon("clock")} Add entry</button>
    </div></div>`;
  return `<div class="section-heading" style="margin-top:6px">${esc(dayName(tcDate))}</div>`
    + (rows || `<div class="app-card"><div class="app-card-body">${emptyRow("No entries on this day")}</div></div>`)
    + add;
}

function wireTimeclock(body, { store, employee, draw }) {
  body.querySelector("#tc-emp")?.addEventListener("change", (e) => {
    tcEmployeeId = e.target.value;
    draw();
  });
  body.querySelector("#tc-date")?.addEventListener("change", (e) => {
    tcDate = e.target.value || today();
    draw();
  });
  body.querySelectorAll("[data-save]").forEach((btn) => btn.addEventListener("click", async () => {
    const card = btn.closest("[data-punch]");
    const punchId = btn.dataset.save;
    const get = (f) => card.querySelector(`[data-f="${f}"]`).value;
    const clockIn = tsFromDayTime(tcDate, get("in"));
    if (!clockIn) { toast("A clock-in time is required", "warn"); return; }
    const clockOut = tsFromDayTime(tcDate, get("out"));
    if (clockOut && clockOut <= clockIn) { toast("Clock-out must be after clock-in", "warn"); return; }
    const mealIn = tsFromDayTime(tcDate, get("mealin"));
    const mealOut = tsFromDayTime(tcDate, get("mealout"));
    const breaks = [];
    if (mealIn) breaks.push({ type: "meal", start: mealIn, end: mealOut || null });
    await updatePunch(punchId, { clockIn, clockOut, breaks }, employee.name);
    toast("Time corrected", "ok");
    draw();
  }));
  body.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
    await removePunch(btn.dataset.del);
    toast("Entry removed");
    draw();
  }));
  body.querySelectorAll("[data-lastout]").forEach((btn) => btn.addEventListener("click", () => {
    const card = btn.closest("[data-punch]");
    const out = card?.querySelector('[data-f="out"]');
    if (out) { out.value = btn.dataset.lastout; out.focus(); }
    toast("Clock-out filled — review, then Save", "ok");
  }));
  body.querySelector("#tc-add")?.addEventListener("click", async () => {
    const clockIn = tsFromDayTime(tcDate, body.querySelector("#tc-add-in").value);
    const clockOut = tsFromDayTime(tcDate, body.querySelector("#tc-add-out").value);
    if (!clockIn) { toast("A clock-in time is required", "warn"); return; }
    if (clockOut && clockOut <= clockIn) { toast("Clock-out must be after clock-in", "warn"); return; }
    await addPunch({ employeeId: employee.id, storeId: store.id, date: tcDate, clockIn, clockOut }, employee.name);
    toast("Entry added", "ok");
    draw();
  });
}

/* -------------------------------------------------------------------------
   Task scores and the bonus leaderboard
   -------------------------------------------------------------------------
   A person's score is simply how much of the work assigned to them they have
   marked done — over all time for the chip by their name, or within a week or
   pay period for the scorecard. Shared "anyone on shift" tasks don't count
   toward one person's score; only what was assigned to them does.
*/

function taskScore(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : null };
}

function assignedTo(tasks, employeeId) {
  return tasks.filter((t) => t.employeeId === employeeId);
}

function inDateRange(task, from, to) {
  const d = task.date || "";
  return (!from || d >= from) && (!to || d <= to);
}

function scoreChip(pct, extra = "") {
  if (pct == null) return "";
  const tone = pct >= 85 ? "hi" : pct >= 60 ? "mid" : "lo";
  return `<span class="score-chip ${tone}"${extra ? ` title="${esc(extra)}"` : ""}>${esc(pct)}%</span>`;
}

/* The week (Mon–Sun) and the pay period, each as paid hours and the share of
   assigned tasks completed. This is the card the employee gets at week's end
   and each pay period. */
function scoreCard(employee, punches, tasks) {
  const wkStart = weekStartMonday(today());
  const wkEnd = addDays(wkStart, 6);
  const wkHours = computeTimesheet(punches, wkStart, wkEnd, {}).total;
  const wk = taskScore(assignedTo(tasks, employee.id).filter((t) => inDateRange(t, wkStart, wkEnd)));

  const period = payPeriodOf(today());
  const pHours = computeTimesheet(punches, period.start, period.end, {}).total;
  const pd = taskScore(assignedTo(tasks, employee.id).filter((t) => inDateRange(t, period.start, period.end)));

  const foot = (s) => (s.pct == null ? "No tasks set" : `${s.pct}% of ${s.total} task${s.total === 1 ? "" : "s"} done`);
  return `<div class="app-card">
    <div class="app-card-head"><h3>Your scorecard</h3><span class="hint">Hours &amp; tasks</span></div>
    <div class="app-card-body">
      <div class="app-figures">
        ${figure("This week", fmtH(wkHours), foot(wk))}
        ${figure("This pay period", fmtH(pHours), foot(pd))}
      </div>
    </div>
  </div>`;
}

/* Crew ranked by all-time task score. Shared by the manager's Tasks screen and
   the employee's own view, where their row is highlighted. */
function rankCrew(roster, tasks) {
  return roster
    .filter((e) => !String(e.pin).startsWith("mgr:"))
    .map((e) => ({ e, ...taskScore(assignedTo(tasks, e.id)) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (b.pct - a.pct) || (b.done - a.done) || a.e.name.localeCompare(b.e.name));
}

function bonusBoard(ranked, highlightId = null) {
  if (!ranked.length) {
    return `<div class="app-card"><div class="app-card-head"><h3>Bonus leaderboard</h3>
      <span class="hint">By tasks completed</span></div>
      <div class="app-card-body">${emptyRow("No tasks assigned yet — the board fills as work gets done.")}</div></div>`;
  }
  const rows = ranked.map((r, i) => `<div class="app-row bonus-row${r.e.id === highlightId ? " is-me" : ""}">
    <div class="bonus-rank r${i < 3 ? i + 1 : 0}">${i + 1}</div>
    <div class="app-avatar">${esc(initials(r.e.name))}</div>
    <div class="grow"><div class="r-title">${esc(r.e.name)}</div>
      <div class="r-sub">${esc(num(r.done))} of ${esc(num(r.total))} tasks done</div></div>
    ${scoreChip(r.pct)}
  </div>`).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Bonus leaderboard</h3>
    <span class="hint">Top tasks completed</span></div>
    <div class="app-card-body flush">${rows}</div></div>`;
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
    const [punch, shifts, storeTasks, roster, place, punches] = await Promise.all([
      openPunch(employee.id),
      listShifts({ employeeId: employee.id, from: today() }),
      listTasks({ storeId: employee.storeId }),
      listEmployees(employee.storeId),
      getPlace(employee.storeId),
      listPunches({ employeeId: employee.id }),
    ]);
    const period = payPeriodOf(mePeriodAnchor);
    const overall = taskScore(assignedTo(storeTasks, employee.id));
    const ranked = rankCrew(roster, storeTasks);
    // Their own work plus the store's shared tasks: what's still open, and
    // whatever was closed out today so a tick is visible.
    const mine = storeTasks.filter((t) => t.employeeId === employee.id || !t.employeeId);
    const todays = mine.filter((t) => !t.done || t.date === today());

    body.innerHTML = `
      <div class="app-greet"><h2>${esc(greeting())}, ${esc(employee.name.split(" ")[0])}${scoreChip(overall.pct, "Your task score")}</h2>
        <p>${esc(shiftLine(shifts))}</p></div>
      ${clockCard(punch, place)}
      ${meTasks(todays)}
      ${scoreCard(employee, punches, storeTasks)}
      ${bonusBoard(ranked, employee.id)}
      ${meSchedule(shifts)}
      ${timesheetCard(punches, period, employee, "me-ts", { title: "My paid hours" })}
      <button class="app-btn ghost" id="me-signout">${icon("logout")} Not you? Sign out</button>`;
    bindClock(body, { employeeId: employee.id, storeId: employee.storeId, rerender: draw });
    wireTimesheet(body, {
      idPrefix: "me-ts",
      employee,
      punches,
      getAnchor: () => mePeriodAnchor,
      setAnchor: (v) => { mePeriodAnchor = v; },
      redraw: draw,
    });
    wireTaskCompletion(body, { storeId: employee.storeId, by: employee.id, draw });
    body.querySelector("#me-signout")?.addEventListener("click", async () => {
      await setActiveEmployee(null);
      draw();
    });
    await ensureGeofence(employee.id, draw);
  };
  await draw();
}

/*
 * Completing a task from the employee's list. A task that requires proof only
 * closes with a photo taken now — capturePhoto uses the live camera (or a
 * camera-only file input), so an old picture can't be attached. Tapping a done
 * task reopens it, which clears the photo so the next completion is fresh.
 */
function wireTaskCompletion(root, { storeId, by, draw }) {
  root.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", async () => {
    const list = await listTasks({ storeId });
    const task = list.find((x) => x.id === el.dataset.toggle);
    if (!task) return;
    if (task.done) { await toggleTask(task.id, false); draw(); return; }
    if (task.requirePhoto) {
      let photo = null;
      try {
        photo = await capturePhoto();
      } catch (err) {
        toast(err.message || "This task needs a photo", "warn");
        return;
      }
      if (!photo) return;
      await toggleTask(task.id, true, { photo, by });
    } else {
      await toggleTask(task.id, true, { by });
    }
    draw();
  }));
  root.querySelectorAll("[data-photo]").forEach((el) => el.addEventListener("click", () => {
    showPhoto(el.dataset.photo);
  }));
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
  if (!tasks.length) return "";
  const open = tasks.filter((t) => !t.done);
  const rows = tasks.map((t) => {
    const proof = t.done && t.photo
      ? `<img class="task-proof" src="${esc(t.photo)}" alt="Proof" data-photo="${esc(t.photo)}">`
      : "";
    const cam = t.requirePhoto && !t.done
      ? `<span class="task-cam" title="Photo required">${icon("camera")}</span>`
      : "";
    return `<div class="app-row task-row${t.done ? " is-done" : ""}">
      <div class="task-check${t.done ? " done" : ""}" data-toggle="${esc(t.id)}">${t.done ? icon("check") : ""}</div>
      <div class="grow">
        <div class="r-title">${esc(t.title)}${cam}</div>
        ${t.note ? `<div class="r-sub">${esc(t.note)}</div>` : ""}
      </div>
      ${proof}
    </div>`;
  }).join("");
  return `<div class="app-card"><div class="app-card-head"><h3>Your tasks</h3>
    <span class="hint">${num(open.length)} open</span></div>
    <div class="app-card-body flush">${rows}</div></div>`;
}

/* A tapped proof photo, shown full-size over the app until dismissed. */
function showPhoto(src) {
  if (!src) return;
  const back = document.createElement("div");
  back.className = "photo-view";
  back.innerHTML = `<img src="${esc(src)}" alt="Task photo"><button class="photo-close" aria-label="Close">${icon("close")}</button>`;
  const close = () => back.remove();
  back.addEventListener("click", close);
  document.body.appendChild(back);
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
   Timesheets (paid hours by pay period) and Excel export
   ------------------------------------------------------------------------- */

function fmtH(n) {
  return `${Math.round((Number(n) || 0) * 100) / 100} h`;
}

function periodLabel(period) {
  const fmt = (ymd) => new Date(`${ymd}T00:00:00`)
    .toLocaleDateString([], { month: "short", day: "numeric" });
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

/*
 * One employee's paid hours for a half-month pay period: regular, the two
 * California overtime tiers, and the total, with a day-by-day breakdown and the
 * seventh-day marker. `idPrefix` namespaces the period and export controls so
 * the same card can appear in employee mode and in the manager's timeclock.
 */
function timesheetCard(punches, period, employee, idPrefix, { title = "Timesheet" } = {}) {
  const ts = computeTimesheet(punches, period.start, period.end, { rate: employee?.rate ?? null });
  const rows = ts.days.length
    ? ts.days.map((d) => `<div class="app-row">
        <div class="grow">
          <div class="r-title">${esc(dayName(d.date))}${d.seventh ? " · 7th day" : ""}</div>
          <div class="r-sub">${fmtH(d.regular)} reg${d.overtime ? ` · ${fmtH(d.overtime)} OT` : ""}${d.doubleTime ? ` · ${fmtH(d.doubleTime)} 2×` : ""}</div>
        </div>
        <div class="r-value">${fmtH(d.total)}</div>
      </div>`).join("")
    : emptyRow("No hours this period");
  return `<div class="app-card">
    <div class="app-card-head"><h3>${esc(title)}</h3><span class="hint">${esc(periodLabel(period))}</span></div>
    <div class="app-card-body">
      <div class="app-figures">
        ${figure("Regular", fmtH(ts.regular), "First 8 h/day")}
        ${figure("Overtime 1.5×", fmtH(ts.overtime), "8–12 h/day")}
        ${figure("Double 2×", fmtH(ts.doubleTime), "Past 12 h")}
        ${figure("Paid hours", fmtH(ts.total), "Meal unpaid, rests paid")}
      </div>
      ${ts.pay != null ? `<div class="geo-note ok" style="margin-top:10px">${icon("billing")} Estimated pay ${esc(money(ts.pay))} at ${esc(money(employee.rate))}/hr</div>` : ""}
      <div class="app-grid-2" style="margin-top:10px">
        <button class="app-btn ghost" id="${idPrefix}-prev">${icon("chevron")} Previous</button>
        <button class="app-btn ghost" id="${idPrefix}-next">Next ${icon("chevron")}</button>
      </div>
      <button class="app-btn" id="${idPrefix}-xls" style="margin-top:10px">${icon("printer")} Download timesheet (Excel)</button>
    </div>
    <div class="app-card-body flush">${rows}</div>
  </div>`;
}

function timesheetExcel(employee, ts) {
  const rows = ts.days.map((d) => [d.date, d.regular, d.overtime, d.doubleTime, d.total]);
  rows.push(["Total", ts.regular, ts.overtime, ts.doubleTime, ts.total]);
  const headers = ["Date", "Regular", "OT 1.5×", "DT 2×", "Paid hours"];
  const who = employee.username || employee.name || "employee";
  downloadExcel(`timesheet-${who}-${ts.start}`, { name: "Timesheet", headers, rows });
}

/* Wire a timesheet card's period buttons and Excel export.
   `setAnchor` persists the chosen period; `redraw` repaints. */
function wireTimesheet(root, { idPrefix, employee, punches, getAnchor, setAnchor, redraw }) {
  root.querySelector(`#${idPrefix}-prev`)?.addEventListener("click", () => {
    setAnchor(payPeriodShift(getAnchor(), -1).start);
    redraw();
  });
  root.querySelector(`#${idPrefix}-next`)?.addEventListener("click", () => {
    setAnchor(payPeriodShift(getAnchor(), 1).start);
    redraw();
  });
  root.querySelector(`#${idPrefix}-xls`)?.addEventListener("click", () => {
    const period = payPeriodOf(getAnchor());
    const ts = computeTimesheet(punches, period.start, period.end, { rate: employee?.rate ?? null });
    timesheetExcel(employee, ts);
    toast("Timesheet downloaded", "ok");
  });
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
