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
  // Payroll people who are not tied to one store: they read the whole group's
  // time clock. Seeded once with a default login so payroll can get in.
  accountants: [],
  // Profiles for everyone — site logins and on-device people alike — keyed by a
  // stable string (see profileKey). Photo, name, date of birth, address.
  profiles: {},
  // A manager's sign-off that a pay-period timesheet is ready to print.
  approvals: [],
  device: { employeeId: null },
};

let cache = null;

function defaultAccountant() {
  return {
    id: "acct_default",
    username: "accountant",
    password: "payroll",
    name: "Payroll Accountant",
    active: true,
    createdAt: Date.now(),
  };
}

function read() {
  if (cache) return cache;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    stored = null;
  }
  cache = { ...structuredClone(BLANK), ...(stored || {}) };
  // Seed the default payroll accountant the very first time only, and persist
  // it so the (synchronous) console sign-in can find it on the next load.
  if (!stored || !Array.isArray(stored.accountants)) {
    cache.accountants = [defaultAccountant()];
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
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

function slugUsername(name) {
  const base = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14);
  return base || `emp${Math.random().toString(36).slice(2, 6)}`;
}

export async function addEmployee({
  name, storeId, pin = "", phone = "", username = "", password = "", rate = null,
}) {
  const state = read();
  const taken = new Set(state.employees.map((e) => e.username).filter(Boolean));
  let user = String(username || "").trim().toLowerCase() || slugUsername(name);
  while (taken.has(user)) user = `${slugUsername(name)}${Math.floor(Math.random() * 90 + 10)}`;
  const row = {
    id: id("emp"),
    name: String(name || "").trim(),
    storeId: String(storeId || ""),
    username: user,
    password: String(password || pin || "").trim(),
    pin: String(pin || "").trim(),
    phone: String(phone || "").trim(),
    rate: rate == null || rate === "" ? null : Number(rate),
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
  { type: "rest1", label: "Rest break 1", minutes: 10, paid: true },
  { type: "meal", label: "Meal break", minutes: 30, paid: false },
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
    reminded: {},
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

/** Record that a break/clock-out reminder has fired, so it fires only once. */
export async function markReminder(punchId, key) {
  const state = read();
  state.punches = state.punches.map((p) => (p.id === punchId
    ? { ...p, reminded: { ...(p.reminded || {}), [key]: Date.now() } } : p));
  write(state);
}

/*
 * Manager corrections. Only a manager reaches these (the employee clock has no
 * edit affordance); every touched punch is flagged `edited` with who and when
 * so a correction is never silent.
 */
export async function updatePunch(punchId, patch, by = "manager") {
  const state = read();
  state.punches = state.punches.map((p) => (p.id === punchId
    ? { ...p, ...patch, edited: { at: Date.now(), by } } : p));
  write(state);
  return state.punches.find((p) => p.id === punchId) || null;
}

export async function addPunch({
  employeeId, storeId, date, clockIn, clockOut = null, breaks = [], by = "manager",
}) {
  const state = read();
  const row = {
    id: id("punch"),
    employeeId,
    storeId: String(storeId || ""),
    date: date || today(),
    clockIn,
    clockInAt: null,
    clockOut,
    clockOutAt: null,
    breaks,
    reminded: {},
    auto: false,
    manual: true,
    edited: { at: Date.now(), by },
  };
  state.punches = [...state.punches, row];
  write(state);
  return row;
}

export async function removePunch(punchId) {
  const state = read();
  state.punches = state.punches.filter((p) => p.id !== punchId);
  write(state);
}

/* -------------------------------------------------------------------------
   Tasks
   ------------------------------------------------------------------------- */

export async function listTasks({ storeId = null, employeeId = null, from = null, to = null } = {}) {
  return read().tasks
    .filter((t) => (storeId ? String(t.storeId) === String(storeId) : true))
    .filter((t) => (employeeId ? (t.employeeId === employeeId || !t.employeeId) : true))
    .filter((t) => (from ? (t.date || "") >= from : true))
    .filter((t) => (to ? (t.date || "") <= to : true))
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.createdAt || 0) - (a.createdAt || 0));
}

export async function addTask({
  storeId, employeeId = null, title, note = "", date = today(), requirePhoto = false,
}) {
  const state = read();
  const row = {
    id: id("task"),
    storeId: String(storeId || ""),
    employeeId,
    title: String(title || "").trim(),
    note,
    date: date || today(),
    requirePhoto: Boolean(requirePhoto),
    done: false,
    doneAt: null,
    doneBy: null,
    photo: null,
    createdAt: Date.now(),
  };
  state.tasks = [...state.tasks, row];
  write(state);
  return row;
}

/*
 * Mark a task done or open. A task that requires proof carries the photo taken
 * when it was completed; reopening it clears the photo and who did it, so the
 * next completion has to take a fresh one.
 */
export async function toggleTask(taskId, done, { photo = null, by = null } = {}) {
  const state = read();
  state.tasks = state.tasks.map((t) => {
    if (t.id !== taskId) return t;
    if (done) {
      return { ...t, done: true, doneAt: Date.now(), doneBy: by || t.doneBy || null, photo: photo ?? t.photo ?? null };
    }
    return { ...t, done: false, doneAt: null, doneBy: null, photo: null };
  });
  write(state);
}

export async function removeTask(taskId) {
  const state = read();
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  write(state);
}

/* -------------------------------------------------------------------------
   Accountants (payroll — not tied to any one store)
   -------------------------------------------------------------------------
   An accountant reads the whole group's time clock to run payroll. They are
   kept apart from employees (who belong to a store) and from the site logins
   (which live upstream). `getAccountantByUsername` is synchronous so the
   console sign-in can check it without awaiting.
*/

export async function listAccountants() {
  return read().accountants.filter((a) => a.active !== false);
}

export function getAccountantByUsername(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  return read().accountants.find((a) => a.active !== false
    && String(a.username || "").toLowerCase() === u) || null;
}

export async function addAccountant({ username, password, name = "" }) {
  const state = read();
  const u = String(username || "").trim().toLowerCase();
  if (!u) throw new Error("A username is required.");
  if (state.accountants.some((a) => String(a.username).toLowerCase() === u)) {
    throw new Error("That username is taken.");
  }
  const row = {
    id: id("acct"),
    username: u,
    password: String(password || "").trim(),
    name: String(name || "").trim(),
    active: true,
    createdAt: Date.now(),
  };
  state.accountants = [...state.accountants, row];
  write(state);
  return row;
}

export async function updateAccountant(acctId, patch) {
  const state = read();
  state.accountants = state.accountants.map((a) => (a.id === acctId ? { ...a, ...patch } : a));
  write(state);
  return state.accountants.find((a) => a.id === acctId) || null;
}

/* -------------------------------------------------------------------------
   Profiles (everyone: photo, first and last name, date of birth, address)
   -------------------------------------------------------------------------
   Keyed by a stable string the caller owns (see profileKey in profile.js): an
   employee id, an accountant id, or a site login's email. The username is not
   stored here — it can never change — only the parts a person may edit.
*/

export function getProfile(key) {
  return read().profiles[String(key)] || null;
}

export async function setProfile(key, patch) {
  const state = read();
  const k = String(key);
  state.profiles = {
    ...state.profiles,
    [k]: { ...(state.profiles[k] || {}), ...patch, updatedAt: Date.now() },
  };
  write(state);
  return state.profiles[k];
}

/* -------------------------------------------------------------------------
   Timesheet approvals (a manager signs a pay period off before it prints)
   -------------------------------------------------------------------------
   Payroll may only print an approved timesheet. An approval is one employee,
   one pay period, who signed it and when, and a snapshot of the totals as they
   stood — so a later edit to the punches is visible as a mismatch rather than
   silently changing an already-approved sheet.
*/

function approvalKey(employeeId, start, end) {
  return `${employeeId}|${start}|${end}`;
}

export async function getApproval(employeeId, start, end) {
  const key = approvalKey(employeeId, start, end);
  return read().approvals.find((a) => a.key === key) || null;
}

export async function listApprovals({ storeId = null } = {}) {
  return read().approvals.filter((a) => (storeId ? String(a.storeId) === String(storeId) : true));
}

export async function approveTimesheet({ employeeId, storeId, start, end, by, totals = null }) {
  const state = read();
  const key = approvalKey(employeeId, start, end);
  const row = {
    key,
    employeeId,
    storeId: String(storeId || ""),
    start,
    end,
    by: String(by || "manager"),
    at: Date.now(),
    totals,
  };
  state.approvals = [...state.approvals.filter((a) => a.key !== key), row];
  write(state);
  return row;
}

export async function revokeApproval(employeeId, start, end) {
  const state = read();
  const key = approvalKey(employeeId, start, end);
  state.approvals = state.approvals.filter((a) => a.key !== key);
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
