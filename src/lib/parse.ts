import {
  emptyS2k,
  finalizeMetrics,
  parseS2k,
  type DayMetrics,
  type DayRow,
  type Station,
} from "./calendar.ts";

const HEADER_ALIASES: Record<keyof DayMetrics | "day", string[][]> = {
  day: [["date"]],
  gas_vol: [
    ["gas volume"],
    ["gas vol"],
    ["volume (gal)"],
    ["gallons"],
  ],
  gas_profit: [["gas profit"]],
  sales: [
    ["c-store sales"],
    ["cstore sales"],
    ["inside sales"],
    ["sales"],
  ],
  purch: [["purchase"]],
  store_profit: [["store profit"]],
  margin: [["store margin"], ["margin"]],
  total_profit: [["total profit"]],
};

export function eachIsoDay(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

export function parseDateCell(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const serial = Number(raw);
  if (serial > 40000 && serial < 60000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function parseCsv(text: string): DayRow[] {
  const rows = splitCsv(text);
  return rowsToDays(rows);
}

export function parseHtmlTables(html: string): DayRow[] {
  const blocks = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const rows = blocks.map((tr) =>
    [...tr.matchAll(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi)].map((cell) =>
      cell[0]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  return rowsToDays(rows);
}

export function rowsToDays(rows: unknown[][]): DayRow[] {
  if (rows.length < 2) return [];
  let headerIndex = -1;
  let map: Record<string, number> | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const candidate = headerMap(rows[i] ?? []);
    if (candidate.day != null && (candidate.gas_vol != null || candidate.sales != null)) {
      headerIndex = i;
      map = candidate;
      break;
    }
  }
  if (headerIndex < 0 || !map) return [];
  const out: DayRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const day = parseDateCell(row[map.day ?? 0]);
    if (!day) continue;
    const pick = (key: keyof DayMetrics): number | null => {
      const idx = map[key];
      if (idx == null || idx >= row.length) return null;
      return toNum(row[idx]);
    };
    out.push({
      day,
      s2k: emptyS2k(),
      ...finalizeMetrics({
        gas_vol: pick("gas_vol"),
        gas_profit: pick("gas_profit"),
        sales: pick("sales"),
        purch: pick("purch"),
        store_profit: pick("store_profit"),
        margin: pick("margin"),
        total_profit: pick("total_profit"),
      }),
    });
  }
  return out;
}

export function normalizeImportDays(input: unknown): DayRow[] {
  if (!Array.isArray(input)) return [];
  const out: DayRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const day = parseDateCell(rec.day ?? rec.date);
    if (!day) continue;
    out.push({
      day,
      s2k: parseS2k(rec.s2k),
      ...finalizeMetrics({
        gas_vol: rec.gas_vol as number | null,
        gas_profit: rec.gas_profit as number | null,
        sales: rec.sales as number | null,
        purch: rec.purch as number | null,
        store_profit: rec.store_profit as number | null,
        margin: rec.margin as number | null,
        total_profit: rec.total_profit as number | null,
      }),
    });
  }
  return out;
}

export function defaultStationFromFilename(name: string): Station | null {
  const n = name.toLowerCase();
  if (/\bdb\b/.test(n) || n.includes("arco db") || n.includes("arco_db")) return "db";
  if (/\bhb\b/.test(n) || n.includes("arco hb") || n.includes("arco_hb")) return "hb";
  return null;
}

function headerMap(row: unknown[]): Record<string, number> {
  const labels = row.map((cell) => String(cell ?? "").trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const [key, needles] of Object.entries(HEADER_ALIASES)) {
    const idx = labels.findIndex((label) =>
      needles.some((parts) => parts.every((part) => label.includes(part))),
    );
    if (idx >= 0) map[key] = idx;
  }
  return map;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
