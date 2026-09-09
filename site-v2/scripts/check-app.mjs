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
const store = await import("../public/assets/appstore.js");

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
