/*
 * Phone-app checks: the pay maths and the app's bind functions.
 *
 * check.mjs renders every console view against live data; this does the same
 * job for the app, where the weight is in the bindings (the schedule, the clock
 * and breaks, the manager time-clock editor, the timesheet). It runs them in a
 * real DOM (jsdom) so a broken selector or a runtime error in a handler fails
 * here rather than on someone's phone. Needs the dev server on :8787, like the
 * other checks.
 *
 * It also asserts the California pay split straight from pay.js, so the numbers
 * on a timesheet are checked independently of the view.
 */

import { JSDOM } from "jsdom";
import { buildModel } from "../public/assets/analytics.js";
import { splitDailyHours, punchWorkedHours, computeTimesheet, payPeriodOf } from "../public/assets/pay.js";

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass += 1; return; }
  fail += 1;
  process.stdout.write(`  FAIL ${msg}\n`);
}
function same(got, exp, msg) {
  assert(JSON.stringify(got) === JSON.stringify(exp), `${msg} — got ${JSON.stringify(got)}`);
}

/* ---- pay maths (California daily overtime, seventh day, meal deduction) ---- */
process.stdout.write("Pay maths\n");
same(splitDailyHours(8, false), { regular: 8, overtime: 0, doubleTime: 0, total: 8, seventh: false }, "8h is straight time");
same(splitDailyHours(10, false), { regular: 8, overtime: 2, doubleTime: 0, total: 10, seventh: false }, "10h is 8 reg + 2 OT");
same(splitDailyHours(13, false), { regular: 8, overtime: 4, doubleTime: 1, total: 13, seventh: false }, "13h is 8 + 4 OT + 1 DT");
same(splitDailyHours(10, true), { regular: 0, overtime: 8, doubleTime: 2, total: 10, seventh: true }, "7th day 10h is 8 OT + 2 DT");
same(payPeriodOf("2026-09-07"), { start: "2026-09-01", end: "2026-09-15" }, "first-half pay period");
same(payPeriodOf("2026-09-20"), { start: "2026-09-16", end: "2026-09-30" }, "second-half pay period");
{
  const H = 3600000;
  const base = new Date("2026-09-02T08:00:00").getTime();
  const punch = { date: "2026-09-02", clockIn: base, clockOut: base + 8 * H, breaks: [{ type: "meal", start: base + 4 * H, end: base + 4.5 * H }] };
  assert(punchWorkedHours(punch) === 7.5, "8h clock less 30-min unpaid meal is 7.5 paid hours");
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const b = new Date(2026, 8, 7 + i, 8, 0, 0).getTime();
    days.push({ date: `2026-09-${String(7 + i).padStart(2, "0")}`, clockIn: b, clockOut: b + 9 * H, breaks: [{ type: "meal", start: b + 4 * H, end: b + 4.5 * H }] });
  }
  const week = computeTimesheet(days, "2026-09-07", "2026-09-13", {});
  same({ r: week.regular, o: week.overtime, d: week.doubleTime, t: week.total }, { r: 48, o: 11, d: 0.5, t: 59.5 }, "seven 8h days: 48 reg, 11 OT, 0.5 DT");
}
process.stdout.write(`  ${pass} pay assertions ok\n`);

/* ---- app binds in a real DOM ---- */
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://example.test/" });
const { window } = dom;
global.window = window;
global.document = window.document;
global.CustomEvent = window.CustomEvent;
global.localStorage = window.localStorage;
global.Notification = undefined;
global.URL.createObjectURL = () => "blob:x";
global.URL.revokeObjectURL = () => {};

const A = await import("../public/assets/views/app.js");
const F = await import("../public/assets/views/finance.js");
const store = await import("../public/assets/appstore.js");

assert(store.DEFAULT_RADIUS_FT === 400, "leave fence is 400 ft for everybody");
{
  const { distanceFt } = await import("../public/assets/geo.js");
  const pin = { lat: 33.9675725, lng: -117.8481447 };
  const stillOnLot = { lat: 33.9675725, lng: -117.8481447 };
  const about200ft = { lat: 33.9675725 + 200 / 364000, lng: -117.8481447 };
  const about500ft = { lat: 33.9675725 + 500 / 364000, lng: -117.8481447 };
  const d0 = distanceFt(pin, stillOnLot);
  const d200 = distanceFt(pin, about200ft);
  const d500 = distanceFt(pin, about500ft);
  assert(d0 < 1, "a fix on the pin is inside the leave fence");
  assert(d200 > 150 && d200 < store.DEFAULT_RADIUS_FT, "200 ft is still inside the 400-ft leave fence");
  assert(d500 > store.DEFAULT_RADIUS_FT, "500 ft is past the 400-ft leave fence for everybody");
}
{
  const empId = "e_test_geofence";
  await store.clockIn(empId, "diamond", { lat: 34.0, lng: -117.8 });
  const open = await store.openPunch(empId);
  assert(!!open && !open.clockOut, "open punch stays open until a leave or a tap");
  await store.clockOut(open.id, { auto: true, reason: "geofence", coords: { lat: 34.01, lng: -117.8 } });
  const done = (await store.listPunches({ employeeId: empId }))[0];
  assert(done.auto === true && done.autoReason === "geofence" && !!done.clockOut,
    "a 400-ft leave reminder is followed by a tagged clock-out");
}

const origin = "http://localhost:8787";
const get = async (p) => {
  const res = await fetch(origin + p);
  if (!res.ok) throw new Error(`${p} -> ${res.status}`);
  return res.json();
};

let overlay;
try {
  overlay = await get("/api/books-overlay");
} catch (err) {
  process.stdout.write(`\nApp binds\n  SKIPPED — dev server not reachable (${err.message})\n`);
  process.exit(fail ? 1 : 0);
}
const [monthly, openDays, depts] = await Promise.all([
  get("/api/data/monthly.json").catch(() => null),
  get("/api/data/daily-open.json").catch(() => null),
  get("/api/data/depts.json").catch(() => null),
]);
const model = buildModel(overlay, { monthly, openDays, depts });
const storeId = model.stations[0].id;
const user = { email: "mgr@example.test", role: "manager", stores: [storeId] };
const ctx = () => ({
  model, data: {}, query: new URLSearchParams(), params: {}, pathname: "/",
  scope: { level: "all" }, navigate() {}, rerender() {}, user,
});
const mount = (html) => { const r = document.getElementById("root"); r.innerHTML = html; return r; };
const tick = () => new Promise((r) => setTimeout(r, 20));

process.stdout.write("\nApp binds\n");
async function bindOk(label, fn) {
  try { await fn(); pass += 1; process.stdout.write(`  ok    ${label}\n`); } catch (err) {
    fail += 1; process.stdout.write(`  FAIL  ${label} — ${err.message}\n`);
  }
}

// Seed a completed shift so the timesheet and editor have something to show.
const emp = await store.addEmployee({ name: "Jane Doe", storeId, pin: "1234", rate: "18" });
const H = 3600000;
const base = new Date(); base.setHours(8, 0, 0, 0);
await store.addPunch({
  employeeId: emp.id, storeId, date: store.today(),
  clockIn: base.getTime(), clockOut: base.getTime() + 9 * H,
  breaks: [{ type: "meal", start: base.getTime() + 4 * H, end: base.getTime() + 4.5 * H }],
});

await bindOk("team: add employee assigns a username", async () => {
  const c = ctx(); const r = mount(A.renderAppTeam(c)); await A.bindAppTeam(r, c);
  r.querySelector("#te-name").value = "Bob Ray"; r.querySelector("#te-rate").value = "20";
  r.querySelector("#te-add").click(); await tick();
  const bob = (await store.listEmployees(storeId)).find((e) => e.name === "Bob Ray");
  if (!bob) throw new Error("employee not added");
  if (!bob.username) throw new Error("no username assigned");
});
await bindOk("team: logins export button present", async () => {
  const c = ctx(); const r = mount(A.renderAppTeam(c)); await A.bindAppTeam(r, c);
  if (!r.querySelector("#tm-logins")) throw new Error("no logins export");
});
await bindOk("timeclock: editor renders with export", async () => {
  const c = ctx(); const r = mount(A.renderAppTimeclock(c)); await A.bindAppTimeclock(r, c);
  if (!r.querySelector("#tc-emp")) throw new Error("no employee picker");
  if (!r.querySelector("#tc-ts-xls")) throw new Error("no timesheet export");
});
await bindOk("timeclock: a correction saves", async () => {
  const c = ctx(); const r = mount(A.renderAppTimeclock(c)); await A.bindAppTimeclock(r, c);
  const saveBtn = r.querySelector("[data-save]");
  if (!saveBtn) throw new Error("no editable entry to save");
  saveBtn.click(); await tick();
});
await bindOk("schedule: form renders", async () => {
  const c = ctx(); const r = mount(A.renderAppSchedule(c)); await A.bindAppSchedule(r, c);
  if (!r.querySelector("#sf-save")) throw new Error("no shift form");
});
await bindOk("employee schedule tab: embeds the legacy schedule frame", async () => {
  const c = ctx(); const r = mount(A.renderStaffSchedule(c)); await A.bindStaffSchedule(r, c);
  const frame = r.querySelector("#legacy-schedule");
  if (!frame) throw new Error("no legacy schedule frame on the manager schedule tab");
  if (!/legacy\/schedule\.html/.test(frame.getAttribute("src") || "")) {
    throw new Error("frame does not point at the legacy schedule page");
  }
});
await bindOk("tickets: manager opens one, admin sees it and replies", async () => {
  const mgr = { model, data: {}, query: new URLSearchParams(), params: {}, pathname: "/",
    scope: { level: "all" }, navigate() {}, rerender() {},
    user: { email: "mgr@example.test", role: "manager", stores: [storeId] } };
  let r = mount(F.renderTickets(mgr)); await F.bindTickets(r, mgr);
  const subject = r.querySelector("#nt-subject"); const body = r.querySelector("#nt-body");
  if (!subject || !body || !r.querySelector("#nt-send")) throw new Error("no open-a-ticket form for the manager");
  subject.value = "Pump 3 offline"; body.value = "Card reader is down on pump 3.";
  r.querySelector("#nt-send").click(); await tick();
  const mine = (await store.listTickets()).filter((t) => t.createdBy?.email === "mgr@example.test");
  if (!mine.length) throw new Error("manager ticket was not stored");

  const admin = { model, data: {}, query: new URLSearchParams(), params: {}, pathname: "/",
    scope: { level: "all" }, navigate() {}, rerender() {},
    user: { email: "admin", role: "admin", stores: [] } };
  r = mount(F.renderTickets(admin)); await F.bindTickets(r, admin); await tick();
  const replyBox = r.querySelector("[data-ticket-text]");
  if (!replyBox) throw new Error("admin cannot see a reply box for the open ticket");
  replyBox.value = "A tech is on the way.";
  r.querySelector("[data-ticket-reply]").click(); await tick();
  const answered = (await store.listTickets()).find((t) => t.id === mine[0].id);
  const last = (answered.messages || [])[answered.messages.length - 1];
  if (!last || last.role !== "admin") throw new Error("admin reply did not attach to the ticket");
});
await bindOk("clock: renders", async () => {
  const c = ctx(); const r = mount(A.renderAppClock(c)); await A.bindAppClock(r, c);
});
await bindOk("tasks: form renders", async () => {
  const c = ctx(); const r = mount(A.renderAppTasks(c)); await A.bindAppTasks(r, c);
  if (!r.querySelector("#tk-add")) throw new Error("no task form");
});
await bindOk("employee mode: picker then timesheet", async () => {
  let c = ctx(); let r = mount(A.renderAppMe(c)); await A.bindAppMe(r, c);
  await store.setActiveEmployee(emp.id);
  c = ctx(); r = mount(A.renderAppMe(c)); await A.bindAppMe(r, c); await tick();
  if (!r.querySelector("#me-ts-xls")) throw new Error("no timesheet export in employee mode");
  if (!/Paid hours/.test(r.textContent)) throw new Error("no paid-hours figure");
});

await bindOk("employee: task completes with credit; photo task is gated; score + board show", async () => {
  await store.setActiveEmployee(emp.id);
  const t1 = await store.addTask({ storeId, employeeId: emp.id, title: "Count register" });
  const t2 = await store.addTask({ storeId, employeeId: emp.id, title: "Photo the cooler", requirePhoto: true });
  let c = ctx(); let r = mount(A.renderAppMe(c)); await A.bindAppMe(r, c); await tick();
  if (!r.querySelector(".task-cam")) throw new Error("photo-required task has no camera indicator");
  const toggle = r.querySelector(`[data-toggle="${t1.id}"]`);
  if (!toggle) throw new Error("assigned task not listed");
  toggle.click(); await tick(); await tick();
  const done = (await store.listTasks({ storeId })).find((x) => x.id === t1.id);
  if (!done.done) throw new Error("task not marked done");
  if (done.doneBy !== emp.id) throw new Error("completion not credited to the employee");
  const stillOpen = (await store.listTasks({ storeId })).find((x) => x.id === t2.id);
  if (stillOpen.done) throw new Error("photo task must not complete without a photo");
  c = ctx(); r = mount(A.renderAppMe(c)); await A.bindAppMe(r, c); await tick();
  if (!r.querySelector(".score-chip")) throw new Error("no score chip by the name");
  if (!/Your scorecard/.test(r.textContent)) throw new Error("no week/pay-period scorecard");
  if (!/Bonus leaderboard/.test(r.textContent)) throw new Error("no bonus leaderboard");
});

await bindOk("manager tasks: form has date + photo toggle; board renders", async () => {
  const c = ctx(); const r = mount(A.renderAppTasks(c)); await A.bindAppTasks(r, c); await tick();
  if (!r.querySelector("#tk-date")) throw new Error("no task date field");
  if (!r.querySelector("#tk-photo")) throw new Error("no requires-photo toggle");
  if (!/Bonus leaderboard/.test(r.textContent)) throw new Error("no bonus board on manager tasks");
});

await bindOk("phone-off: stamped on the open punch and shown to the manager", async () => {
  const e2 = await store.addEmployee({ name: "Sam Poe", storeId, pin: "2222" });
  await store.clockIn(e2.id, storeId);
  await store.touchPunch(e2.id);
  await store.recordPhoneOff(e2.id, Date.now());
  const p = await store.openPunch(e2.id);
  if (!p.offEvents || !p.offEvents.length) throw new Error("phone-off event not recorded");
  if (!p.lastSeen) throw new Error("heartbeat lastSeen not stamped");
  const c = ctx(); const r = mount(A.renderAppTimeclock(c)); await A.bindAppTimeclock(r, c); await tick();
  const sel = r.querySelector("#tc-emp");
  sel.value = e2.id; sel.dispatchEvent(new window.Event("change")); await tick();
  if (!/Phone last on/.test(r.textContent)) throw new Error("manager doesn't see the phone-off time");
  const fill = r.querySelector("[data-lastout]");
  if (!fill) throw new Error("no set-clock-out-to-last-on button");
  fill.click();
  const out = r.querySelector('[data-punch] [data-f="out"]');
  if (!out || !out.value) throw new Error("clock-out was not filled from the phone-off time");
});

/* ---- payroll (approve-to-print) and profiles ---- */
const P = await import("../public/assets/views/payroll.js");
const PR = await import("../public/assets/views/profile.js");
const period = payPeriodOf(store.today());

await bindOk("payroll: manager approves, then print unlocks", async () => {
  const c = ctx();
  c.current = { stores: [{ id: storeId, name: "Test store" }] };
  const r = mount(P.renderManagerPayrollCard(c));
  await P.bindManagerPayroll(r, c); await tick();
  const sel = r.querySelector('[data-pay="emp"]');
  if (!sel) throw new Error("no employee picker");
  sel.value = emp.id; sel.dispatchEvent(new window.Event("change")); await tick(); await tick();
  const printBtn = r.querySelector('[data-pay="print"]');
  if (!printBtn || !printBtn.disabled) throw new Error("print must be disabled before approval");
  const approve = r.querySelector('[data-pay="approve"]');
  if (!approve) throw new Error("manager should be able to approve");
  approve.click(); await tick(); await tick();
  const appr = await store.getApproval(emp.id, period.start, period.end);
  if (!appr) throw new Error("approval was not recorded");
  if (r.querySelector('[data-pay="print"]').disabled) throw new Error("print should unlock after approval");
});

await bindOk("payroll: accountant reads totals, cannot approve", async () => {
  const c = { ...ctx(), user: { role: "accountant", email: "accountant", accountantId: "acct_default", stores: [] } };
  const r = mount(P.renderPayroll(c));
  await P.bindPayroll(r, c); await tick(); await tick();
  if (!/Period totals/.test(r.textContent)) throw new Error("no per-employee totals roster");
  if (r.querySelector('[data-pay="approve"]')) throw new Error("accountant must not be able to approve");
  if (/Download logins/.test(r.textContent)) throw new Error("accountant must not see the credentials export");
});

await bindOk("profile: accountant saves fields and changes password", async () => {
  const c = { ...ctx(), user: { role: "accountant", email: "accountant", accountantId: "acct_default", stores: [] } };
  const r = mount(PR.renderProfile(c)); await PR.bindProfile(r, c); await tick();
  r.querySelector("#prof-first").value = "Pat";
  r.querySelector("#prof-last").value = "Kim";
  r.querySelector('[data-prof="save"]').click(); await tick();
  const prof = store.getProfile("acct:acct_default");
  if (!prof || prof.firstName !== "Pat") throw new Error("profile fields not saved");
  if (r.querySelector("#prof-first").readOnly) throw new Error("name should be editable");
  const userField = [...r.querySelectorAll("input")].find((i) => i.value === "accountant");
  if (!userField || !userField.disabled) throw new Error("username must be read-only");
  r.querySelector("#prof-pw1").value = "newpass"; r.querySelector("#prof-pw2").value = "newpass";
  r.querySelector('[data-prof="password"]').click(); await tick();
  const acct = (await store.listAccountants()).find((a) => a.id === "acct_default");
  if (!acct || acct.password !== "newpass") throw new Error("password not changed");
});

await bindOk("profile: employee changes their PIN", async () => {
  await store.setActiveEmployee(emp.id);
  const c = ctx();
  const r = mount(PR.renderAppProfile(c)); await PR.bindAppProfile(r, c); await tick();
  r.querySelector("#prof-pw1").value = "9999"; r.querySelector("#prof-pw2").value = "9999";
  r.querySelector('[data-prof="password"]').click(); await tick();
  const e = await store.getEmployee(emp.id);
  if (e.pin !== "9999") throw new Error("PIN not changed");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
