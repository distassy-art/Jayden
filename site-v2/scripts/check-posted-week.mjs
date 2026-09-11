/*
 * Posted-week check: the employee week card and the manager editor must open
 * on the same week, and that week must be one the schedule actually covers.
 *
 * The posted schedule runs through a fixed end date. Once real time passes it,
 * pinning the employee card to today's week showed "Not scheduled" seven times
 * over while the manager — whose editor rewinds to the last posted week — saw a
 * full week and published it. This boots the real store against the bundled
 * seed with a pinned clock so the regression cannot come back unnoticed.
 */

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";

const root = new URL("../public/legacy/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const seed = JSON.parse(read("core.json"));

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass += 1; process.stdout.write(`  ok    ${msg}\n`); return; }
  fail += 1;
  process.stdout.write(`  FAIL  ${msg}\n`);
}

/* Boot core-store with the bundled seed and no shared overlay, with the clock
   pinned to a day past the end of the posted schedule. */
async function bootAt(nowISO) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.test/legacy/core.html",
    runScripts: "outside-only"
  });
  const { window } = dom;
  const fixed = new Date(nowISO).getTime();
  const RealDate = window.Date;
  class PinnedDate extends RealDate {
    constructor(...args) {
      if (!args.length) { super(fixed); return; }
      super(...args);
    }
    static now() { return fixed; }
  }
  window.Date = PinnedDate;
  Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder;
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("core-clocks.json")) return { ok: true, json: async () => ({ clocks: [] }) };
    if (u.includes("core.json")) return { ok: true, json: async () => JSON.parse(JSON.stringify(seed)) };
    return { ok: false, json: async () => null };
  };
  window.eval(read("core-store.js"));
  await window.SSCore.ready;
  return window.SSCore;
}

process.stdout.write("Posted week\n");

// LA-local Thursday 2026-09-10; the seed schedule ends Sunday 2026-09-06.
const C = await bootAt("2026-09-10T18:00:00Z");
const thisMon = C.weekStartMonday();
assert(thisMon === "2026-09-07", `today's week starts 2026-09-07 (got ${thisMon})`);

const shiftsThisWeek = C.weekDates(thisMon).reduce((n, d) => n + C.shiftsFor("diamond", d).length, 0);
assert(shiftsThisWeek === 0, "today's week has no posted shifts, so the card would read Not scheduled");

const posted = C.postedWeekStart("diamond", thisMon);
assert(posted === "2026-08-31", `posted week rewinds to 2026-08-31 (got ${posted})`);

const shiftsPosted = C.weekDates(posted).reduce((n, d) => n + C.shiftsFor("diamond", d).length, 0);
assert(shiftsPosted > 0, `the posted week actually has shifts (${shiftsPosted})`);

// An employee on that week sees their own shifts, which is the whole point.
const withShifts = C.weekDates(posted)
  .flatMap((d) => C.shiftsFor("diamond", d))
  .map((s) => s.employeeId);
assert(new Set(withShifts).size > 1, `more than one employee is scheduled that week (${new Set(withShifts).size})`);

// Once the current week has shifts of its own, nothing is rewound.
const live = C.weekDates(posted)[0];
assert(C.postedWeekStart("diamond", posted) === live, "a week that has shifts is left alone");

// A station with nothing scheduled falls back to the current week rather than
// hunting forever or returning empty.
assert(C.postedWeekStart("no-such-station", thisMon) === thisMon, "an unscheduled station stays on the current week");

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
