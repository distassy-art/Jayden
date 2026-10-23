import type { Config } from "@netlify/functions";
import { json, optionsOk } from "./_shared/http";

const FALLBACK = {
  USD: 1,
  EGP: 52.063931,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.308429,
};

const CODES = Object.keys(FALLBACK) as (keyof typeof FALLBACK)[];

function pick(src: Record<string, number>) {
  const rates = { ...FALLBACK };
  let hit = 0;
  for (const code of CODES) {
    const n = Number(src[code] ?? src[String(code).toLowerCase()]);
    if (n > 0) {
      rates[code] = n;
      hit += 1;
    }
  }
  return hit >= 3 ? rates : null;
}

async function liveRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const j = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (j.result === "success" && j.rates) {
      const rates = pick(j.rates);
      if (rates) return { rates, asOf: String(j.time_last_update_utc || "").slice(0, 16), live: true, source: "open.er-api.com" };
    }
  } catch {
    /* next */
  }
  try {
    const res = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
    const j = (await res.json()) as { usd?: Record<string, number>; date?: string };
    const rates = pick(j.usd || {});
    if (rates) return { rates, asOf: String(j.date || ""), live: true, source: "fawazahmed0" };
  } catch {
    /* seed */
  }
  return {
    rates: FALLBACK,
    asOf: new Date().toISOString().slice(0, 10) + " fallback",
    live: false,
    source: "same-day-seed",
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "GET") return json({ error: "method" }, 405);
  return json(await liveRates());
};

export const config: Config = {
  path: "/api/fx",
  method: ["GET", "OPTIONS"],
};
