import type { Station } from "./calendar.ts";

/** Fields that may show a PDF link in day details only — never on the month grid. */
export const SCAN_LINK_FIELDS = [4, 12, 13] as const;

export type ScanField = (typeof SCAN_LINK_FIELDS)[number];

/** Public Worker asset paths for the scans used on that station/day/field. */
export type DayScanHrefs = Partial<Record<ScanField, string>>;

/**
 * Arco HB 42179 Sept 12–13 scans from OneDrive Scans (EOD + lotto tape)
 * plus Daily Summary copies used for Receipts LOTTERY (field 13).
 * Hosted as Worker assets so Farsai can open them without OneDrive.
 */
const HB_DAY_SCANS: Record<string, DayScanHrefs> = {
  "2026-09-12": {
    4: "/scans/hb-2026-09-12-safedrop.pdf",
    12: "/scans/hb-2026-09-12-13-lotto.pdf",
    13: "/scans/hb-2026-09-12-lottery.pdf",
  },
  "2026-09-13": {
    4: "/scans/hb-2026-09-13-safedrop.pdf",
    12: "/scans/hb-2026-09-12-13-lotto.pdf",
    13: "/scans/hb-2026-09-13-lottery.pdf",
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
  return scansForDay(station, day)[field] ?? null;
}
