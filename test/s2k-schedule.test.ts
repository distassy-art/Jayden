import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addCalendarDays, pacificClock } from "../src/lib/pacific.ts";
import { pullPlan, S2K_CRONS, isBlankOnlyRetry } from "../src/lib/s2k-schedule.ts";

function atPacific(isoDay: string, hour: number, minute = 0): Date {
  // Walk UTC until America/Los_Angeles shows the requested civil time.
  const start = Date.parse(`${isoDay}T00:00:00Z`);
  for (let ms = start; ms <= start + 36 * 3600_000; ms += 60_000) {
    const clock = pacificClock(ms);
    if (clock.iso === isoDay && clock.hour === hour && clock.minute === minute) {
      return new Date(ms);
    }
  }
  throw new Error(`no pacific instant for ${isoDay} ${hour}:${String(minute).padStart(2, "0")}`);
}

test("Tue–Fri 10am Pacific pull yesterday only, never today", () => {
  const cases: Array<[string, string, string]> = [
    ["2026-09-15", "Tue", "2026-09-14"],
    ["2026-09-16", "Wed", "2026-09-15"],
    ["2026-09-17", "Thu", "2026-09-16"],
    ["2026-09-18", "Fri", "2026-09-17"],
  ];
  for (const [today, weekday, yesterday] of cases) {
    const plan = pullPlan(atPacific(today, 10));
    assert.equal(plan.weekday, weekday);
    assert.equal(plan.hour, 10);
    assert.equal(plan.action, "yesterday");
    assert.deepEqual(plan.dates, [yesterday]);
    assert.ok(!plan.dates.includes(today));
  }
});

test("Saturday and Sunday 10am Pacific do not pull", () => {
  for (const day of ["2026-09-19", "2026-09-20"]) {
    const plan = pullPlan(atPacific(day, 10));
    assert.equal(plan.action, "skip");
    assert.deepEqual(plan.dates, []);
  }
});

test("Monday 10am Pacific does not pull Fri/Sat/Sun", () => {
  const plan = pullPlan(atPacific("2026-09-21", 10));
  assert.equal(plan.weekday, "Mon");
  assert.equal(plan.hour, 10);
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "monday_10am_waits_for_noon");
  assert.deepEqual(plan.dates, []);
});

test("Monday noon Pacific pulls Friday, Saturday, Sunday — never Monday", () => {
  const plan = pullPlan(atPacific("2026-09-21", 12));
  assert.equal(plan.weekday, "Mon");
  assert.equal(plan.hour, 12);
  assert.equal(plan.action, "weekend");
  assert.deepEqual(plan.dates, ["2026-09-18", "2026-09-19", "2026-09-20"]);
  assert.ok(!plan.dates.includes("2026-09-21"));
});

test("Monday 18:00 Pacific retries Friday, Saturday, Sunday — never Monday", () => {
  const plan = pullPlan(atPacific("2026-09-21", 18));
  assert.equal(plan.action, "weekend");
  assert.equal(plan.reason, "monday_evening_retry_fri_sat_sun");
  assert.equal(isBlankOnlyRetry(plan), true);
  assert.equal(isBlankOnlyRetry({ reason: "monday_noon_fri_sat_sun" }), false);
  assert.deepEqual(plan.dates, ["2026-09-18", "2026-09-19", "2026-09-20"]);
  assert.ok(!plan.dates.includes("2026-09-21"));
});

test("delayed Monday noon still pulls when scheduledTime is a few minutes late", () => {
  const plan = pullPlan(atPacific("2026-09-21", 12, 10));
  assert.deepEqual(plan.dates, ["2026-09-18", "2026-09-19", "2026-09-20"]);
  assert.deepEqual(pullPlan(atPacific("2026-09-21", 12, 14)).dates, [
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ]);
  assert.deepEqual(pullPlan(atPacific("2026-09-21", 12, 15)).dates, []);
});

test("other hours including Wednesday noon and Tuesday evening do not pull", () => {
  assert.deepEqual(pullPlan(atPacific("2026-09-16", 9)).dates, []);
  assert.deepEqual(pullPlan(atPacific("2026-09-16", 11)).dates, []);
  assert.deepEqual(pullPlan(atPacific("2026-09-16", 12)).dates, []);
  assert.equal(pullPlan(atPacific("2026-09-16", 12)).reason, "noon_not_monday");
  assert.equal(pullPlan(atPacific("2026-09-22", 18)).reason, "evening_not_monday");
  assert.equal(pullPlan(atPacific("2026-09-16", 13)).reason, "not_10_or_noon_or_evening");
});

test("DST-safe: 10am PDT is 17:00 UTC and 10am PST is 18:00 UTC", () => {
  const pdt = atPacific("2026-09-16", 10);
  assert.equal(pdt.toISOString(), "2026-09-16T17:00:00.000Z");
  assert.deepEqual(pullPlan(pdt).dates, ["2026-09-15"]);
  assert.deepEqual(pullPlan(Date.parse("2026-09-16T18:00:00Z")).dates, []);

  const pstMondayNoon = atPacific("2026-11-02", 12);
  assert.equal(pstMondayNoon.toISOString(), "2026-11-02T20:00:00.000Z");
  assert.deepEqual(pullPlan(pstMondayNoon).dates, ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.ok(!pullPlan(pstMondayNoon).dates.includes("2026-11-02"));

  const pstMondayTen = atPacific("2026-11-02", 10);
  assert.equal(pstMondayTen.toISOString(), "2026-11-02T18:00:00.000Z");
  assert.deepEqual(pullPlan(pstMondayTen).dates, []);

  const pstMondayEvening = atPacific("2026-11-02", 18);
  assert.equal(pstMondayEvening.toISOString(), "2026-11-03T02:00:00.000Z");
  assert.deepEqual(pullPlan(pstMondayEvening).dates, ["2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("catch-up dates never include the current Pacific calendar day", () => {
  const today = pacificClock(Date.now()).iso;
  for (const hour of [10, 12, 18]) {
    const plan = pullPlan(atPacific(today, hour));
    assert.ok(!plan.dates.includes(today), `${today} ${hour}:00 leaked today`);
  }
  assert.equal(addCalendarDays("2026-09-16", -1), "2026-09-15");
});

test("wrangler crons cover both PDT and PST hours without baking an offset into the handler", () => {
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const cron of S2K_CRONS) {
    assert.match(wrangler, new RegExp(cron.replace(/\*/g, "\\*")));
  }
  assert.match(wrangler, /America\/Los_Angeles/);
});
