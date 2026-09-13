import {
  daysInMonth,
  monthRange,
  parseRole,
  parseStation,
  shiftMonth,
  summarizeMonth,
  type DayRow,
  type Role,
  type Station,
} from "./lib/calendar.ts";
import {
  defaultStationFromFilename,
  normalizeImportDays,
  parseCsv,
  parseHtmlTables,
} from "./lib/parse.ts";
import { sampleSeed } from "./lib/seed.ts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      await ensureSeed(env.DB);
      return await handleApi(request, url, env.DB);
    } catch (err) {
      console.log(
        JSON.stringify({
          level: "error",
          path: url.pathname,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return json({ ok: false, error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(
  request: Request,
  url: URL,
  db: D1Database,
): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "farsai-calendar" });
  }
  if (path === "/api/state" && request.method === "GET") {
    const state = await loadState(db, url.searchParams);
    return json(state, state.ok === false ? 400 : 200);
  }
  if (path === "/api/prefs" && request.method === "POST") {
    const body = await readJson(request);
    const role = parseRole(body.role);
    const station = parseStation(body.station);
    if (!station) return json({ ok: false, error: "invalid_station" }, 400);
    await savePref(db, role, station);
    const params = new URLSearchParams({ role, station });
    if (body.year != null) params.set("year", String(body.year));
    if (body.month != null) params.set("month", String(body.month));
    return json(await loadState(db, params));
  }
  if (path === "/api/day" && request.method === "POST") {
    const body = await readJson(request);
    const station = parseStation(body.station);
    const days = normalizeImportDays([body]);
    if (!station || days.length !== 1) {
      return json({ ok: false, error: "invalid_day" }, 400);
    }
    await upsertDays(db, station, days);
    return json({ ok: true, day: days[0], station });
  }
  if (path === "/api/import" && request.method === "POST") {
    const body = await readJson(request);
    const filename = String(body.filename ?? "upload");
    let station =
      parseStation(body.station) ?? defaultStationFromFilename(filename);
    if (!station) return json({ ok: false, error: "invalid_station" }, 400);
    let days = normalizeImportDays(body.days);
    if (days.length === 0 && typeof body.csv === "string") days = parseCsv(body.csv);
    if (days.length === 0 && typeof body.html === "string") {
      days = parseHtmlTables(body.html);
    }
    if (days.length === 0) return json({ ok: false, error: "no_rows" }, 400);
    if (days.length > 800) return json({ ok: false, error: "too_many_rows" }, 400);
    await upsertDays(db, station, days);
    const role = parseRole(body.role);
    await db
      .prepare(
        "INSERT INTO imports (role, station, filename, row_count, imported_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(role, station, filename, days.length, new Date().toISOString())
      .run();
    const first = days[0].day;
    const params = new URLSearchParams({
      role,
      station,
      year: first.slice(0, 4),
      month: String(Number(first.slice(5, 7))),
    });
    return json({
      ok: true,
      imported: days.length,
      station,
      ...(await loadState(db, params)),
    });
  }
  return json({ ok: false, error: "not_found" }, 404);
}

async function loadState(db: D1Database, params: URLSearchParams) {
  const role = parseRole(params.get("role"));
  const prefs = await loadPrefs(db);
  const station = parseStation(params.get("station")) ?? prefs[role];
  const now = new Date();
  const year = Number(params.get("year") ?? now.getUTCFullYear());
  const month = Number(params.get("month") ?? now.getUTCMonth() + 1);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "invalid_month" };
  }
  const { start, end } = monthRange(year, month);
  const prior = shiftMonth(year, month, -1);
  const priorRange = monthRange(prior.year, prior.month);
  const currentDays = await listDays(db, station, start, end);
  const priorDays = await listDays(db, station, priorRange.start, priorRange.end);
  const summary = summarizeMonth(year, month, currentDays, priorDays);
  return {
    ok: true,
    role,
    station,
    prefs,
    year,
    month,
    daysInMonth: daysInMonth(year, month),
    days: currentDays,
    priorDays,
    summary,
  };
}

async function loadPrefs(db: D1Database): Promise<Record<Role, Station>> {
  const { results } = await db
    .prepare("SELECT role, station FROM view_prefs")
    .all<{ role: string; station: string }>();
  const prefs: Record<Role, Station> = { farsai: "hb", owner: "hb" };
  for (const row of results ?? []) {
    const role = parseRole(row.role);
    const station = parseStation(row.station);
    if (station) prefs[role] = station;
  }
  return prefs;
}

async function savePref(db: D1Database, role: Role, station: Station): Promise<void> {
  await db
    .prepare(
      "INSERT INTO view_prefs (role, station, updated_at) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET station = excluded.station, updated_at = excluded.updated_at",
    )
    .bind(role, station, new Date().toISOString())
    .run();
}

async function listDays(
  db: D1Database,
  station: Station,
  start: string,
  end: string,
): Promise<DayRow[]> {
  const { results } = await db
    .prepare(
      "SELECT day, gas_vol, gas_profit, sales, purch, store_profit, margin, total_profit FROM calendar_days WHERE station = ? AND day >= ? AND day <= ? ORDER BY day",
    )
    .bind(station, start, end)
    .all<DayRow>();
  return results ?? [];
}

async function upsertDays(
  db: D1Database,
  station: Station,
  days: DayRow[],
): Promise<void> {
  const now = new Date().toISOString();
  const stmts = days.map((d) =>
    db
      .prepare(
        `INSERT INTO calendar_days (station, day, gas_vol, gas_profit, sales, purch, store_profit, margin, total_profit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(station, day) DO UPDATE SET
           gas_vol = excluded.gas_vol,
           gas_profit = excluded.gas_profit,
           sales = excluded.sales,
           purch = excluded.purch,
           store_profit = excluded.store_profit,
           margin = excluded.margin,
           total_profit = excluded.total_profit,
           updated_at = excluded.updated_at`,
      )
      .bind(
        station,
        d.day,
        d.gas_vol,
        d.gas_profit,
        d.sales,
        d.purch,
        d.store_profit,
        d.margin,
        d.total_profit,
        now,
      ),
  );
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

async function ensureSeed(db: D1Database): Promise<void> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM calendar_days")
    .first<{ n: number }>();
  if (row && row.n > 0) return;
  const now = new Date().toISOString();
  const stmts = sampleSeed().map((d) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO calendar_days (station, day, gas_vol, gas_profit, sales, purch, store_profit, margin, total_profit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        d.station,
        d.day,
        d.gas_vol,
        d.gas_profit,
        d.sales,
        d.purch,
        d.store_profit,
        d.margin,
        d.total_profit,
        now,
      ),
  );
  stmts.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO view_prefs (role, station, updated_at) VALUES (?, ?, ?)",
      )
      .bind("farsai", "hb", now),
    db
      .prepare(
        "INSERT OR IGNORE INTO view_prefs (role, station, updated_at) VALUES (?, ?, ?)",
      )
      .bind("owner", "hb", now),
  );
  await db.batch(stmts);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 2_000_000) throw new Error("payload_too_large");
  if (!text) return {};
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
