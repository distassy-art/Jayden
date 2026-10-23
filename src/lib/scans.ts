import type { Station } from "./calendar.ts";

/** Fields that may show a PDF link in day details only — never on the month grid. */
export const SCAN_LINK_FIELDS = [4, 12, 13] as const;

/** Public Worker asset paths for the scans used on that station/day/field. */
export type DayScanHrefs = Record<string, string>;

const SAFE_DROP_12 = "/scans/hb-2026-09-12-safedrop.pdf";
const SAFE_DROP_13 = "/scans/hb-2026-09-13-safedrop.pdf";
/** OneDrive Scans/Scan2026-09-14_115354.pdf — Lotto + Scratchers tapes, both days. */
const LOTTO_SCRATCHERS = "/scans/hb-lotto-scratchers-Scan2026-09-14_115354.pdf";
/** Daily Book Summary copies used for Receipts LOTTERY (not the Lotto tape). */
const LOTTERY_12 = "/scans/hb-2026-09-12-lottery.pdf";
const LOTTERY_13 = "/scans/hb-2026-09-13-lottery.pdf";

/**
 * Arco HB 42179 Sept 12–13. String keys so field 12 is never mixed with
 * array index 12. Field 12 is the Lotto/Scratchers scan only — not Daily Book.
 */
const HB_DAY_SCANS: Record<string, DayScanHrefs> = {
  "2026-09-12": {
    "4": SAFE_DROP_12,
    "12": LOTTO_SCRATCHERS,
    "13": LOTTERY_12,
  },
  "2026-09-13": {
    "4": SAFE_DROP_13,
    "12": LOTTO_SCRATCHERS,
    "13": LOTTERY_13,
  },
};

export function scansForDay(station: Station, day: string): DayScanHrefs {
  if (station !== "hb") return {};
  return HB_DAY_SCANS[day] ?? {};
}

export function scansForMonth(
  station: Station,
  year: number,
  month: number,
): Record<string, DayScanHrefs> {
  if (station !== "hb") return {};
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const out: Record<string, DayScanHrefs> = {};
  for (const [day, hrefs] of Object.entries(HB_DAY_SCANS)) {
    if (day.startsWith(prefix)) out[day] = hrefs;
  }
  return out;
}

export function scanHref(
  station: Station,
  day: string,
  field: number,
): string | null {
  if (field !== 4 && field !== 12 && field !== 13) return null;
  return scansForDay(station, day)[String(field)] ?? null;
}
