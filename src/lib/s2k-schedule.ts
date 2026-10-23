import { addCalendarDays, pacificClock, weekdayIndex, type PacificClock } from "./pacific.ts";

export const PULL_HOUR_WEEKDAY = 10;
export const PULL_HOUR_MONDAY = 12;
/** Same Fri/Sat/Sun as noon, blank-only save. Sunday Daily Book is often not closed at 12:00. */
export const PULL_HOUR_MONDAY_RETRY = 18;

/** UTC hours covering Pacific 10:00, 12:00, and Monday 18:00 in both PDT and PST. */
export const S2K_CRONS = ["0 17,18,19,20 * * *", "0 1,2 * * *"] as const;

export type PullPlan = {
  timezone: "America/Los_Angeles";
  today: string;
  weekday: string;
  hour: number;
  minute: number;
  action: "yesterday" | "weekend" | "skip";
  dates: string[];
  reason: string;
};

/**
 * Mina: never pull the calendar day we are in. Always day-after.
 * Tue–Fri 10:00 Pacific → yesterday only.
 * Sat/Sun 10:00 → no pull.
 * Monday 10:00 → no pull (Friday/Saturday/Sunday wait for noon).
 * Monday 12:00 → Friday, Saturday, Sunday (never Monday).
 * Monday 18:00 → same three days, blank-only (Sunday book often missing at noon).
 */
export function pullPlan(at: Date | number): PullPlan {
  const clock = pacificClock(at);
  const base: Omit<PullPlan, "action" | "dates" | "reason"> = {
    timezone: "America/Los_Angeles",
    today: clock.iso,
    weekday: clock.weekday,
    hour: clock.hour,
    minute: clock.minute,
  };
  const atTen = isOnHour(clock, PULL_HOUR_WEEKDAY);
  const atNoon = isOnHour(clock, PULL_HOUR_MONDAY);
  const atRetry = isOnHour(clock, PULL_HOUR_MONDAY_RETRY);
  if (!atTen && !atNoon && !atRetry) {
    return skip(base, "not_10_or_noon_or_evening");
  }
  const dow = weekdayIndex(clock.weekday);
  if (dow < 0) return skip(base, "unknown_weekday");

  if (atTen) {
    if (dow === 0 || dow === 6) return skip(base, "weekend_10am");
    if (dow === 1) return skip(base, "monday_10am_waits_for_noon");
    const yesterday = addCalendarDays(clock.iso, -1);
    return guarded(base, "yesterday", [yesterday], "tue_fri_yesterday");
  }

  if (dow !== 1) {
    return skip(base, atNoon ? "noon_not_monday" : "evening_not_monday");
  }
  const friday = addCalendarDays(clock.iso, -3);
  const saturday = addCalendarDays(clock.iso, -2);
  const sunday = addCalendarDays(clock.iso, -1);
  return guarded(
    base,
    "weekend",
    [friday, saturday, sunday],
    atNoon ? "monday_noon_fri_sat_sun" : "monday_evening_retry_fri_sat_sun",
  );
}

export function isBlankOnlyRetry(plan: Pick<PullPlan, "reason">): boolean {
  return plan.reason.startsWith("monday_evening_retry");
}

function isOnHour(clock: PacificClock, hour: number): boolean {
  // Tolerate delayed scheduledTime without overlapping the next civil hour.
  return clock.hour === hour && clock.minute < 15;
}

function skip(
  base: Omit<PullPlan, "action" | "dates" | "reason">,
  reason: string,
): PullPlan {
  return { ...base, action: "skip", dates: [], reason };
}

function guarded(
  base: Omit<PullPlan, "action" | "dates" | "reason">,
  action: PullPlan["action"],
  dates: string[],
  reason: string,
): PullPlan {
  const filtered = dates.filter((day) => day !== base.today);
  if (filtered.length !== dates.length) {
    return {
      ...base,
      action: filtered.length ? action : "skip",
      dates: filtered,
      reason: `${reason};dropped_today`,
    };
  }
  return { ...base, action, dates: filtered, reason };
}
