/** Calendar timezone for Mina's S2K pull. Never assume a UTC offset. */
export const PACIFIC_TZ = "America/Los_Angeles";

export type PacificClock = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  iso: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function pacificClock(at: Date | number): PacificClock {
  const date = at instanceof Date ? at : new Date(at);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    weekday: parts.weekday,
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function addCalendarDays(iso: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`invalid_iso_day:${iso}`);
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta);
  return new Date(utc).toISOString().slice(0, 10);
}

export function weekdayIndex(weekday: string): number {
  const idx = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  return idx;
}
