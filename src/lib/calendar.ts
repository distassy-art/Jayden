export type Station = "hb" | "db";
export type Role = "farsai" | "owner";

export type DayMetrics = {
  gas_vol: number | null;
  gas_profit: number | null;
  sales: number | null;
  purch: number | null;
  store_profit: number | null;
  margin: number | null;
  total_profit: number | null;
};

export const S2K_COUNT = 17;

/** Mina-dictated names only. Fields 18–19 were cancelled. */
export const S2K_FIELD_NAMES: string[] = [
  "Gas Inventory from S2K",
  "Non integrated fuel",
  "Propane exchange",
  "Safe drop",
  "Diesel Gallons sold",
  "Total Gallons Sold",
  "Gas Profit",
  "Net Cstore Sales",
  "Tax1 + Tax4",
  "Lotto Sales",
  "Scratchers Sales",
  "Lotto Payout",
  "Lottery Payout",
  "Cashier Over/Short",
  "Payouts",
  "Fuel Deposit",
  "Credit + Debit + EBT + Mobile + Prepaid Gift − fees",
];

export type S2kValues = (number | null)[];

export type DayRow = DayMetrics & { day: string; s2k: S2kValues };

export function emptyS2k(): S2kValues {
  return Array.from({ length: S2K_COUNT }, () => null);
}

export function s2kSlots(): { index: number; label: string }[] {
  return S2K_FIELD_NAMES.map((label, i) => ({
    index: i + 1,
    label,
  }));
}

/** One named field: this day's value plus that category's month total. */
export type DayDetailRow = {
  index: number;
  label: string;
  day: number | null;
  month: number | null;
};

export function dayDetailRows(
  dayS2k: S2kValues | null | undefined,
  monthTotals: S2kValues | null | undefined,
): DayDetailRow[] {
  const day = dayS2k ?? emptyS2k();
  const month = monthTotals ?? emptyS2k();
  return S2K_FIELD_NAMES.map((label, i) => ({
    index: i + 1,
    label,
    day: day[i] ?? null,
    month: month[i] ?? null,
  }));
}

/**
 * Mina's 8 color-coded majors on the day square.
 * Put filled majors on the cell; empty stays blank — do not invent 0.
 * The 17 named fields stay in the bottom day list.
 */
export type GridField = {
  index: number;
  short: string;
  tone: string;
};

export const CELL_FIELDS: GridField[] = [
  { index: 1, short: "Gas Inv", tone: "gas" },
  { index: 4, short: "Safe drop", tone: "drop" },
  { index: 6, short: "Gallons", tone: "gallons" },
  { index: 8, short: "C-store", tone: "cstore" },
  { index: 9, short: "Tax1+4", tone: "tax" },
  { index: 15, short: "Payouts", tone: "payouts" },
  { index: 14, short: "O/S", tone: "os" },
  { index: 17, short: "Credit", tone: "credit" },
];

export const GRID_FIELDS = CELL_FIELDS;

export const CELL_INDEXES = new Set(CELL_FIELDS.map((field) => field.index));

/** Fields with no day value yet (still listed on the square as blank). */
export function remainingDayDetailRows(
  dayS2k: S2kValues | null | undefined,
  monthTotals: S2kValues | null | undefined,
): DayDetailRow[] {
  return dayDetailRows(dayS2k, monthTotals).filter((row) => row.day == null);
}

export type GridMetric = GridField & { value: number | null };

export function gridCellMetrics(s2k: S2kValues | null | undefined): GridMetric[] {
  const fields = s2k ?? emptyS2k();
  return CELL_FIELDS.map((field) => ({
    ...field,
    value: fields[field.index - 1] ?? null,
  }));
}

/** Majors that have a value — these are what the day square shows. */
export function filledCellMetrics(s2k: S2kValues | null | undefined): GridMetric[] {
  return gridCellMetrics(s2k).filter((row) => row.value != null);
}

export function parseS2k(raw: unknown): S2kValues {
  const out = emptyS2k();
  let arr: unknown[] = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return out;
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  for (let i = 0; i < S2K_COUNT; i++) {
    out[i] = numOrNull(arr[i]);
  }
  return out;
}

export function setS2kField(
  fields: S2kValues,
  index: number,
  value: unknown,
): S2kValues {
  const out = parseS2k(fields);
  if (index < 1 || index > S2K_COUNT) return out;
  out[index - 1] = numOrNull(value);
  return out;
}

export function filledCount(fields: S2kValues): number {
  return fields.reduce((n, v) => (v != null ? n + 1 : n), 0);
}

export function sumS2k(days: DayRow[]): S2kValues {
  const acc = emptyS2k();
  for (const day of days) {
    const fields = day.s2k ?? emptyS2k();
    for (let i = 0; i < S2K_COUNT; i++) {
      const value = fields[i];
      if (value != null) acc[i] = round2((acc[i] ?? 0) + value);
    }
  }
  return acc;
}

export function grandTotal(fields: S2kValues): number | null {
  let sum = 0;
  let any = false;
  for (const value of fields) {
    if (value != null) {
      sum += value;
      any = true;
    }
  }
  return any ? round2(sum) : null;
}

/** Close snapshot — keep on day cells/details, never in month sums or Trend. */
export const GAS_INV_INDEX = 1;
export const GALLONS_INDEX = 6;
export const CSTORE_INDEX = 8;

/** Trend compares these to this month's daily average (not Gas Inventory). */
export const TREND_FIELDS: GridField[] = [
  { index: GALLONS_INDEX, short: "Gallons", tone: "gallons" },
  { index: CSTORE_INDEX, short: "C-store", tone: "cstore" },
];

export function includeInMonthTotals(index: number): boolean {
  return index !== GAS_INV_INDEX;
}

/** Mean of filled days for a 1-based S2K field. Gas Inventory is never averaged. */
export function fieldDailyAverage(
  days: DayRow[],
  index: number,
): number | null {
  if (!includeInMonthTotals(index)) return null;
  const vals: number[] = [];
  for (const day of days) {
    const value = day.s2k?.[index - 1];
    if (value != null) vals.push(value);
  }
  if (!vals.length) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function monthAverages(days: DayRow[]): S2kValues {
  return Array.from({ length: S2K_COUNT }, (_, i) =>
    fieldDailyAverage(days, i + 1),
  );
}

export function vsAverage(
  value: number | null,
  average: number | null,
): { delta: number | null; pct: number | null } {
  if (value == null || average == null) return { delta: null, pct: null };
  const delta = round2(value - average);
  const pct = average === 0 ? null : round4(delta / Math.abs(average));
  return { delta, pct };
}

export const STATIONS: Record<
  Station,
  { id: Station; label: string; arco: string; storeId: string }
> = {
  hb: { id: "hb", label: "HB", arco: "Arco HB", storeId: "42179" },
  db: { id: "db", label: "DB", arco: "Arco DB", storeId: "42352" },
};

export const METRIC_KEYS = [
  "gas_vol",
  "gas_profit",
  "sales",
  "purch",
  "store_profit",
  "margin",
  "total_profit",
] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseStation(value: unknown): Station | null {
  if (value === "hb" || value === "arco_hb" || value === "HB") return "hb";
  if (value === "db" || value === "arco_db" || value === "DB") return "db";
  return null;
}

export function parseRole(value: unknown): Role {
  if (value === "owner") return "owner";
  return "farsai";
}

export function isOwnerSearch(search: string): boolean {
  const q = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return (
    q.get("owner") === "1" ||
    q.get("view") === "owner" ||
    q.get("role") === "owner"
  );
}

export function roleFromSearch(search: string): Role {
  return isOwnerSearch(search) ? "owner" : "farsai";
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(
  year: number,
  month: number,
): { start: string; end: string } {
  return {
    start: isoDay(year, month, 1),
    end: isoDay(year, month, daysInMonth(year, month)),
  };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function finalizeMetrics(input: Partial<DayMetrics>): DayMetrics {
  const gas_vol = numOrNull(input.gas_vol);
  const gas_profit = numOrNull(input.gas_profit);
  const sales = numOrNull(input.sales);
  const purch = numOrNull(input.purch);
  let store_profit = numOrNull(input.store_profit);
  if (store_profit == null && sales != null && purch != null) {
    store_profit = round2(sales - purch);
  }
  let total_profit = numOrNull(input.total_profit);
  if (total_profit == null && store_profit != null && gas_profit != null) {
    total_profit = round2(store_profit + gas_profit);
  }
  let margin = numOrNull(input.margin);
  if (margin == null && store_profit != null && sales) {
    margin = round4(store_profit / sales);
  }
  return {
    gas_vol,
    gas_profit,
    sales,
    purch,
    store_profit,
    margin,
    total_profit,
  };
}

export function emptyMetrics(): DayMetrics {
  return {
    gas_vol: null,
    gas_profit: null,
    sales: null,
    purch: null,
    store_profit: null,
    margin: null,
    total_profit: null,
  };
}

export function sumMetrics(days: DayRow[]): DayMetrics {
  const acc = emptyMetrics();
  for (const day of days) {
    for (const key of METRIC_KEYS) {
      if (key === "margin") continue;
      const value = day[key];
      if (value != null) {
        acc[key] = round2((acc[key] ?? 0) + value);
      }
    }
  }
  if (acc.store_profit != null && acc.sales) {
    acc.margin = round4(acc.store_profit / acc.sales);
  }
  return acc;
}

export function lastDayOfMonthPresent(days: DayRow[]): number {
  return days.reduce((max, row) => {
    const dom = Number(row.day.slice(8, 10));
    return Number.isFinite(dom) ? Math.max(max, dom) : max;
  }, 0);
}

export function comparablePriorDays(
  currentDays: DayRow[],
  priorDays: DayRow[],
  daysInCurrentMonth: number,
): DayRow[] {
  if (currentDays.length === 0) return [];
  const last = lastDayOfMonthPresent(currentDays);
  if (last >= daysInCurrentMonth) return priorDays;
  return priorDays.filter((row) => Number(row.day.slice(8, 10)) <= last);
}

export type Trend = {
  field: "s2k_total";
  current: number | null;
  prior: number | null;
  delta: number | null;
  pct: number | null;
  label: string;
};

export function rollupTrend(
  current: number | null,
  prior: number | null,
  comparable: boolean,
): Trend {
  let delta: number | null = null;
  let pct: number | null = null;
  if (current != null && prior != null) {
    delta = round2(current - prior);
    pct = prior === 0 ? null : round4((current - prior) / Math.abs(prior));
  }
  return {
    field: "s2k_total",
    current,
    prior,
    delta,
    pct,
    label: comparable ? "vs same days last month" : "vs last month",
  };
}

export type MonthSummary = {
  year: number;
  month: number;
  totals: S2kValues;
  priorTotals: S2kValues;
  averages: S2kValues;
  grand: number | null;
  priorGrand: number | null;
  trend: Trend;
  comparable: boolean;
};

export function summarizeMonth(
  year: number,
  month: number,
  currentDays: DayRow[],
  priorDays: DayRow[],
): MonthSummary {
  const dim = daysInMonth(year, month);
  const comparableDays = comparablePriorDays(currentDays, priorDays, dim);
  const comparable = comparableDays.length !== priorDays.length;
  const totals = sumS2k(currentDays);
  const priorTotals = sumS2k(comparable ? comparableDays : priorDays);
  // Do not mix unlike categories (inventory + safedrop is not a real total).
  return {
    year,
    month,
    totals,
    priorTotals,
    averages: monthAverages(currentDays),
    grand: null,
    priorGrand: null,
    trend: rollupTrend(null, null, comparable),
    comparable,
  };
}

export function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
