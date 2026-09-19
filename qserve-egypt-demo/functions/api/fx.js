const FALLBACK = {
  USD: 1,
  EGP: 52.063931,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.308429,
};

const CODES = Object.keys(FALLBACK);

function pick(src) {
  const rates = { ...FALLBACK };
  let hit = 0;
  for (const code of CODES) {
    const n = Number(src[code] ?? src[code.toLowerCase()]);
    if (n > 0) {
      rates[code] = n;
      hit += 1;
    }
  }
  return hit >= 3 ? rates : null;
}

async function liveRates() {
  const tries = [
    async () => {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { cf: { cacheTtl: 3600 } });
      const j = await res.json();
      if (j.result !== "success" || !j.rates) return null;
      const rates = pick(j.rates);
      return rates ? { rates, asOf: String(j.time_last_update_utc || "").slice(0, 16), live: true, source: "open.er-api.com" } : null;
    },
    async () => {
      const res = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
      const j = await res.json();
      const rates = pick(j.usd || {});
      return rates ? { rates, asOf: String(j.date || ""), live: true, source: "fawazahmed0" } : null;
    },
  ];
  for (const fn of tries) {
    try {
      const out = await fn();
      if (out) return out;
    } catch {
      /* next */
    }
  }
  return {
    rates: FALLBACK,
    asOf: new Date().toISOString().slice(0, 10) + " fallback",
    live: false,
    source: "same-day-seed",
  };
}

export async function onRequestGet({ env }) {
  const { json, getJson, putJson } = await import("../_lib/store.js");
  const day = new Date().toISOString().slice(0, 10);
  const cached = await getJson(env, `fx:usd:${day}`);
  if (cached?.rates) return json(cached);
  const fresh = await liveRates();
  await putJson(env, `fx:usd:${day}`, { ...fresh, ts: Date.now() });
  return json(fresh);
}
