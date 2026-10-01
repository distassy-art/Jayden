/*
 * California pay maths for the time clock.
 *
 * Pure functions over the punches appstore.js keeps — no storage, no DOM — so
 * the timesheet is the same number wherever it is shown and can be checked on
 * its own. The rules mirror the old site's core-store.js, which is what the
 * stores already run on:
 *
 *   · Worked hours are the clock, less the unpaid 30-minute meal. The two
 *     10-minute rests stay on the clock because California pays them.
 *   · Overtime is daily: the first 8 hours are regular, 8–12 pay 1.5×, and
 *     anything past 12 pays 2×.
 *   · The seventh day worked in a row (Monday-started week) is special: the
 *     first 8 hours pay 1.5× and anything past 8 pays 2×, none at straight time.
 *   · A pay period is a half-month — the 1st–15th and the 16th–end.
 */

const HOUR_MS = 3600000;

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ymdOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(ymd, delta) {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + delta);
  return ymdOf(d);
}

function monthEnd(ymd) {
  const [y, m] = String(ymd).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/** The half-month pay period a date falls in: 1st–15th, or 16th–end. */
export function payPeriodOf(ymd) {
  const [y, m, dd] = String(ymd).split("-");
  const d = Number(dd);
  if (d <= 15) return { start: `${y}-${m}-01`, end: `${y}-${m}-15` };
  return { start: `${y}-${m}-16`, end: monthEnd(ymd) };
}

/** Step to the previous (−1) or next (+1) pay period. */
export function payPeriodShift(ymd, delta) {
  const per = payPeriodOf(ymd);
  if (delta < 0) return payPeriodOf(addDays(per.start, -1));
  if (delta > 0) return payPeriodOf(addDays(per.end, 1));
  return per;
}

export function datesInRange(startYmd, endYmd) {
  const out = [];
  let cur = startYmd;
  for (let i = 0; i < 400 && cur <= endYmd; i += 1) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Monday that begins the week a date sits in. */
export function weekStartMonday(ymd) {
  const d = parseYmd(ymd);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return ymdOf(d);
}

/** Unpaid meal milliseconds inside one punch (ended meals only). */
function mealMs(punch) {
  return (punch.breaks || [])
    .filter((b) => b.type === "meal" && b.start && b.end)
    .reduce((sum, b) => sum + Math.max(0, b.end - b.start), 0);
}

/** Paid worked hours for one punch: the clock less the unpaid meal. */
export function punchWorkedHours(punch, now = Date.now()) {
  if (!punch || !punch.clockIn) return 0;
  const end = punch.clockOut || now;
  const gross = Math.max(0, end - punch.clockIn);
  return r2((gross - mealMs(punch)) / HOUR_MS);
}

/** Paid worked hours per date, summed across a day's punches. */
export function workedHoursByDate(punches, now = Date.now()) {
  const out = new Map();
  (punches || []).forEach((p) => {
    const h = punchWorkedHours(p, now);
    if (h <= 0) return;
    out.set(p.date, r2((out.get(p.date) || 0) + h));
  });
  return out;
}

/** Split one day's hours into regular / 1.5× / 2× under California's daily rule. */
export function splitDailyHours(hours, seventh) {
  const h = r2(hours);
  if (h <= 0) return { regular: 0, overtime: 0, doubleTime: 0, total: 0, seventh: false };
  if (seventh) {
    return {
      regular: 0,
      overtime: r2(Math.min(h, 8)),
      doubleTime: r2(Math.max(h - 8, 0)),
      total: h,
      seventh: true,
    };
  }
  return {
    regular: r2(Math.min(h, 8)),
    overtime: r2(Math.min(Math.max(h - 8, 0), 4)),
    doubleTime: r2(Math.max(h - 12, 0)),
    total: h,
    seventh: false,
  };
}

/** Is `dateYmd` the seventh worked day in a row within its Monday week? */
function isSeventhConsecutive(dateYmd, byDate) {
  const monday = weekStartMonday(dateYmd);
  let streak = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(monday, i);
    streak = (byDate.get(d) || 0) > 0 ? streak + 1 : 0;
    if (d === dateYmd) return streak >= 7;
  }
  return false;
}

/**
 * A timesheet for one employee over [startYmd, endYmd].
 *
 * `punches` should be all of the employee's punches, not just the window, so a
 * week straddling the period boundary still counts the seventh day correctly.
 * Returns the per-day split and the period totals, plus optional pay in dollars
 * when an hourly `rate` is given.
 */
export function computeTimesheet(punches, startYmd, endYmd, { rate = null, now = Date.now() } = {}) {
  const byDate = workedHoursByDate(punches, now);
  const days = [];
  const totals = { regular: 0, overtime: 0, doubleTime: 0, total: 0 };
  datesInRange(startYmd, endYmd).forEach((date) => {
    const hours = byDate.get(date) || 0;
    if (hours <= 0) return;
    const split = splitDailyHours(hours, isSeventhConsecutive(date, byDate));
    days.push({ date, ...split });
    totals.regular += split.regular;
    totals.overtime += split.overtime;
    totals.doubleTime += split.doubleTime;
    totals.total += split.total;
  });
  totals.regular = r2(totals.regular);
  totals.overtime = r2(totals.overtime);
  totals.doubleTime = r2(totals.doubleTime);
  totals.total = r2(totals.total);
  if (rate != null && Number.isFinite(Number(rate))) {
    const r = Number(rate);
    totals.pay = r2(totals.regular * r + totals.overtime * r * 1.5 + totals.doubleTime * r * 2);
  }
  return { start: startYmd, end: endYmd, days, ...totals };
}
