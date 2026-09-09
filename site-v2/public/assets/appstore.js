/*
 * On-device store for the phone app: employees, shifts, time-clock punches,
 * tasks and each store's clock-in location.
 *
 * The console proper is a read-only window on the live books. Scheduling and
 * the time clock are new, write-heavy, and have no upstream endpoint yet, so
 * they live here in the browser. Every call is async and every record carries
 * its own id and store id, so the day a real backend exists this module can be
 * reimplemented against it without any view changing: swap the body of `read`
 * and `write` for fetch calls and the rest still holds.
 *
 * Nothing here is a source of truth for money. It never touches the books.
 */

const KEY = "ss-app-v1";

const BLANK = {
  employees: [],
  shifts: [],
  punches: [],
  tasks: [],
  places: {},
  device: { employeeId: null },
};

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    cache = { ...structuredClone(BLANK), ...(stored || {}) };
  } catch {
    cache = structuredClone(BLANK);
  }
  return cache;
}

function write(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage full or blocked (private mode). The cache still serves the tab. */
  }
  // Let other open tabs on the same device react to a change.
  try { window.dispatchEvent(new CustomEvent("ss-app-change")); } catch { /* SSR */ }
  return next;
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------
   Employees
   ------------------------------------------------------------------------- */

export async function listEmployees(storeId = null) {
  const rows = read().employees.filter((e) => e.active !== false);
  return storeId ? rows.filter((e) => String(e.storeId) === String(storeId)) : rows;
}

export async function getEmployee(employeeId) {
  return read().employees.find((e) => e.id === employeeId) || null;
}

export async function addEmployee({ name, storeId, pin = "", phone = "" }) {
  const state = read();
  const row = {
    id: id("emp"),
    name: String(name || "").trim(),
    storeId: String(storeId || ""),
    pin: String(pin || "").trim(),
    phone: String(phone || "").trim(),
    active: true,
    createdAt: Date.now(),
  };
  state.employees = [...state.employees, row];
  write(state);
  return row;
}

export async function updateEmployee(employeeId, patch) {
  const state = read();
  state.employees = state.employees.map((e) => (e.id === employeeId ? { ...e, ...patch } : e));
  write(state);
  return state.employees.find((e) => e.id === employeeId) || null;
}

export async function removeEmployee(employeeId) {
  const state = read();
  state.employees = state.employees.map((e) => (e.id === employeeId ? { ...e, active: false } : e));
  write(state);
}

/* -------------------------------------------------------------------------
   Shifts (the schedule)
   ------------------------------------------------------------------------- */

export async function listShifts({ storeId = null, employeeId = null, from = null, to = null } = {}) {
  return read().shifts
    .filter((s) => (storeId ? String(s.storeId) === String(storeId) : true))
    .filter((s) => (employeeId ? s.employeeId === employeeId : true))
    .filter((s) => (from ? s.date >= from : true))
    .filter((s) => (to ? s.date <= to : true))
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

export async function addShift({ employeeId, storeId, date, start, end, note = "" }) {
  const state = read();
  const row = {
    id: id("shift"), employeeId, storeId: String(storeId || ""), date, start, end, note,
  };
  state.shifts = [...state.shifts, row];
  write(state);
  return row;
}

export async function updateShift(shiftId, patch) {
  const state = read();
  state.shifts = state.shifts.map((s) => (s.id === shiftId ? { ...s, ...patch } : s));
  write(state);
}

export async function removeShift(shiftId) {
  const state = read();
  state.shifts = state.shifts.filter((s) => s.id !== shiftId);
  write(state);
}

/* -------------------------------------------------------------------------
   Time clock
   -------------------------------------------------------------------------
   A punch is a single working stretch: a clock-in, a clock-out, and any breaks
   in between. Breaks follow one house rule — one 30-minute meal (unpaid) and
   two 10-minute rests (paid) — but the store enforces that, not this file; it
   just records what happened, including whether the geofence forced the out.
*/

export const BREAK_KINDS = [
  { type: "meal", label: "Meal break", minutes: 30, paid: false },
  { type: "rest1", label: "Rest break 1", minutes: 10, paid: true },
  { type: "rest2", label: "Rest break 2", minutes: 10, paid: true },
];

export async function openPunch(employeeId) {
  return read().punches.find((p) => p.employeeId === employeeId && !p.clockOut) || null;
}

export async function listPunches({ storeId = null, employeeId = null, date = null } = {}) {
  return read().punches
    .filter((p) => (storeId ? String(p.storeId) === String(storeId) : true))
    .filter((p) => (employeeId ? p.employeeId === employeeId : true))
    .filter((p) => (date ? p.date === date : true))
    .sort((a, b) => b.clockIn - a.clockIn);
}

export async function clockIn(employeeId, storeId, coords = null) {
  const state = read();
  const existing = state.punches.find((p) => p.employeeId === employeeId && !p.clockOut);
  if (existing) return existing;
  const row = {
    id: id("punch"),
    employeeId,
    storeId: String(storeId || ""),
    date: today(),
    clockIn: Date.now(),
    clockInAt: coords || null,
    clockOut: null,
    breaks: [],
    auto: false,
  };
  state.punches = [...state.punches, row];
  write(state);
  return row;
}

export async function clockOut(punchId, { auto = false, coords = null } = {}) {
  const state = read();
  state.punches = state.punches.map((p) => {
    if (p.id !== punchId || p.clockOut) return p;
    const breaks = p.breaks.map((b) => (b.end ? b : { ...b, end: Date.now() }));
    return { ...p, clockOut: Date.now(), clockOutAt: coords || null, auto, breaks };
  });
  write(state);
}

export async function startBreak(punchId, type) {
  const state = read();
  state.punches = state.punches.map((p) => {
    if (p.id !== punchId || p.clockOut) return p;
    if (p.breaks.some((b) => !b.end)) return p; // one break at a time
    return { ...p, breaks: [...p.breaks, { type, start: Date.now(), end: null }] };
  });
  write(state);
}

export async function endBreak(punchId) {
  const state = read();
  state.punches = state.punches.map((p) => {
    if (p.id !== punchId) return p;
    return { ...p, breaks: p.breaks.map((b) => (b.end ? b : { ...b, end: Date.now() })) };
  });
  write(state);
}

/* -------------------------------------------------------------------------
   Tasks
   ------------------------------------------------------------------------- */

export async function listTasks({ storeId = null, employeeId = null } = {}) {
  return read().tasks
    .filter((t) => (storeId ? String(t.storeId) === String(storeId) : true))
    .filter((t) => (employeeId ? (t.employeeId === employeeId || !t.employeeId) : true))
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.createdAt || 0) - (a.createdAt || 0));
}

export async function addTask({ storeId, employeeId = null, title, note = "" }) {
  const state = read();
  const row = {
    id: id("task"),
    storeId: String(storeId || ""),
    employeeId,
    title: String(title || "").trim(),
    note,
    done: false,
    doneAt: null,
    createdAt: Date.now(),
  };
  state.tasks = [...state.tasks, row];
  write(state);
  return row;
}

export async function toggleTask(taskId, done) {
  const state = read();
  state.tasks = state.tasks.map((t) => (t.id === taskId
    ? { ...t, done, doneAt: done ? Date.now() : null } : t));
  write(state);
}

export async function removeTask(taskId) {
  const state = read();
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  write(state);
}

/* -------------------------------------------------------------------------
   Clock-in location (geofence centre)
   ------------------------------------------------------------------------- */

export const DEFAULT_RADIUS_FT = 400;

export async function getPlace(storeId) {
  return read().places[String(storeId)] || null;
}

export async function setPlace(storeId, { lat, lng, radiusFt = DEFAULT_RADIUS_FT, label = "" }) {
  const state = read();
  state.places = {
    ...state.places,
    [String(storeId)]: { lat, lng, radiusFt, label, setAt: Date.now() },
  };
  write(state);
  return state.places[String(storeId)];
}

/* -------------------------------------------------------------------------
   The active employee on this device (employee mode)
   ------------------------------------------------------------------------- */

export function activeEmployeeId() {
  return read().device.employeeId;
}

export async function setActiveEmployee(employeeId) {
  const state = read();
  state.device = { ...state.device, employeeId };
  write(state);
}

export function onChange(handler) {
  window.addEventListener("ss-app-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("ss-app-change", handler);
    window.removeEventListener("storage", handler);
  };
}
