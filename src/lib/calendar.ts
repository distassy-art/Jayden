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

export type DayRow = DayMetrics & { day: string };

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
  field: "total_profit";
  current: number | null;
  prior: number | null;
  delta: number | null;
  pct: number | null;
  label: string;
};

export function profitTrend(
  current: DayMetrics,
  prior: DayMetrics,
  comparable: boolean,
): Trend {
  const cur = current.total_profit;
  const prev = prior.total_profit;
  let delta: number | null = null;
  let pct: number | null = null;
  if (cur != null && prev != null) {
    delta = round2(cur - prev);
    pct = prev === 0 ? null : round4((cur - prev) / Math.abs(prev));
  }
  return {
    field: "total_profit",
    current: cur,
    prior: prev,
    delta,
    pct,
    label: comparable ? "vs same days last month" : "vs last month",
  };
}

export type MonthSummary = {
  year: number;
  month: number;
  totals: DayMetrics;
  priorTotals: DayMetrics;
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
  const totals = sumMetrics(currentDays);
  const priorTotals = sumMetrics(comparable ? comparableDays : priorDays);
  return {
    year,
    month,
    totals,
    priorTotals,
    trend: profitTrend(totals, priorTotals, comparable),
    comparable,
  };
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
