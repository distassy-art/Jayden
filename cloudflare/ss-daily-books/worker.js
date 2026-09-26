/**
 * Serve /data/daily_september.json from the live books overlay.
 * The static asset on ss-api was stuck at 2026-09-25T18:20 and was
 * painting the wrong c-store margins. La Mesa (42642) stays off the site.
 */
const OVERLAY_URL = "https://ss-api.smartsolutionsai.workers.dev/.netlify/functions/books-overlay";
const MONTH = "2026-09";
const SKIP_IDS = new Set(["42642"]);
const DAY_KEYS = [
  "gas_vol",
  "gas_profit",
  "sales",
  "purch",
  "store_profit",
  "margin",
  "total_profit",
];
const MONTH_LABELS = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

function asFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stationKey(sid) {
  return /^\d+$/.test(sid) ? [0, Number(sid)] : [1, sid];
}

function buildDailyOpen(overlay, month) {
  const parts = month.split("-").map(Number);
  const year = parts[0];
  const mo = parts[1];
  const label = MONTH_LABELS[mo] + " " + year + " month to date";
  const stationsObj = (overlay && overlay.stations) || {};
  const outStations = [];
  const salesDates = [];
  const ids = Object.keys(stationsObj).sort(function (a, b) {
    const ka = stationKey(a);
    const kb = stationKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] < kb[1]) return -1;
    if (ka[1] > kb[1]) return 1;
    return 0;
  });
  for (const sid of ids) {
    if (SKIP_IDS.has(sid)) continue;
    const st = stationsObj[sid] || {};
    const days = [];
    for (const raw of st.days || []) {
      if (!raw || typeof raw !== "object") continue;
      const date = String(raw.date || "");
      if (!date.startsWith(month)) continue;
      const row = { date: date };
      for (const key of DAY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
          row[key] = asFloat(raw[key]);
        }
      }
      days.push(row);
      if (row.sales) salesDates.push(date);
    }
    days.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    outStations.push({
      id: sid,
      name: st.name || sid,
      days: days,
    });
  }
  const through = salesDates.length ? salesDates.sort().slice(-1)[0] : null;
  return {
    month: month,
    label: label,
    through: through,
    closed: false,
    stations: outStations,
    source: "books-overlay",
    updated_at: (overlay && overlay.updated_at) || null,
  };
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-SS-Data-Source": "books-overlay",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/data/daily_september.json") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Cache-Control": "no-store",
        },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(),
      });
    }
    let payload;
    try {
      const res = await fetch(OVERLAY_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "ss-daily-books",
          "Cache-Control": "no-cache",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, error: "overlay_unavailable", status: res.status }), {
          status: 502,
          headers: jsonHeaders(),
        });
      }
      payload = await res.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "overlay_fetch_failed", message: String(e && e.message ? e.message : e) }), {
        status: 502,
        headers: jsonHeaders(),
      });
    }
    const overlay = (payload && payload.overlay) || payload || {};
    const doc = buildDailyOpen(overlay, MONTH);
    const body = JSON.stringify(doc);
    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: jsonHeaders(),
    });
  },
};
