"use client";

export const CURRENCIES = ["EGP", "USD", "AED", "SAR", "QAR", "KWD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<Currency, { ar: string; en: string; decimals: number }> = {
  EGP: { ar: "جنيه مصري", en: "Egyptian pound", decimals: 0 },
  USD: { ar: "دولار", en: "US dollar", decimals: 2 },
  AED: { ar: "درهم إماراتي", en: "UAE dirham", decimals: 2 },
  SAR: { ar: "ريال سعودي", en: "Saudi riyal", decimals: 2 },
  QAR: { ar: "ريال قطري", en: "Qatari riyal", decimals: 2 },
  KWD: { ar: "دينار كويتي", en: "Kuwaiti dinar", decimals: 3 },
};

/** USD → currency, same-day 16 Sep 2026 (open.er-api). Used if live fetch fails. */
export const FALLBACK_USD_RATES: Record<Currency, number> = {
  USD: 1,
  EGP: 52.063931,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.308429,
};

export const CURRENCY_KEY = "qserve-currency";
export const FX_CACHE_KEY = "qserve-fx-v1";

const listeners = new Set<() => void>();
let currency: Currency = "EGP";
let rates: Record<Currency, number> = { ...FALLBACK_USD_RATES };
let fxAsOf = "2026-09-16 (fallback)";
let fxLive = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function valid(code: string): code is Currency {
  return (CURRENCIES as readonly string[]).includes(code);
}

export function getCurrency() {
  return currency;
}

export function setCurrency(next: Currency) {
  currency = next;
  try {
    localStorage.setItem(CURRENCY_KEY, next);
    document.cookie = `${CURRENCY_KEY}=${next};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* ignore */
  }
  emit();
}

export function subscribeCurrency(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function loadCurrency() {
  try {
    const fromLs = localStorage.getItem(CURRENCY_KEY);
    const fromCookie = document.cookie.split("; ").find((p) => p.startsWith(`${CURRENCY_KEY}=`))?.split("=")[1];
    const raw = fromLs || fromCookie || "EGP";
    if (valid(raw)) currency = raw;
  } catch {
    currency = "EGP";
  }
}

function loadCachedFx() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { rates: Record<string, number>; asOf: string; live: boolean; at: number };
    if (Date.now() - parsed.at > 36 * 60 * 60 * 1000) return;
    const next = { ...FALLBACK_USD_RATES };
    for (const code of CURRENCIES) {
      const n = Number(parsed.rates[code]);
      if (n > 0) next[code] = n;
    }
    rates = next;
    fxAsOf = parsed.asOf;
    fxLive = Boolean(parsed.live);
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  loadCurrency();
  loadCachedFx();
}

export function convertUsd(usd: number, code: Currency = currency) {
  return usd * (rates[code] || FALLBACK_USD_RATES[code]);
}

export function formatMoney(usd: number, _ar?: boolean, code: Currency = currency) {
  const amount = convertUsd(usd, code);
  const dec = CURRENCY_META[code].decimals;
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${code} ${num}`;
}

export function fxNote(ar: boolean) {
  const egp = rates.EGP.toFixed(2);
  const src = fxLive ? (ar ? "سعر السوق الآن" : "live market") : (ar ? "سعر اليوم (احتياطي)" : "same-day fallback");
  return ar ? `1 USD ≈ ${egp} ج.م · ${src} · ${fxAsOf}` : `1 USD ≈ ${egp} EGP · ${src} · ${fxAsOf}`;
}

export function getFxMeta() {
  return { rates, fxAsOf, fxLive };
}

export async function refreshFx() {
  try {
    const res = await fetch("/api/fx", { cache: "no-store" });
    const data = await res.json();
    if (!data?.rates) return;
    const next = { ...FALLBACK_USD_RATES };
    for (const code of CURRENCIES) {
      const n = Number(data.rates[code]);
      if (n > 0) next[code] = n;
    }
    rates = next;
    fxAsOf = String(data.asOf || new Date().toISOString().slice(0, 10));
    fxLive = Boolean(data.live);
    try {
      localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rates, asOf: fxAsOf, live: fxLive, at: Date.now() }));
    } catch {
      /* ignore */
    }
    emit();
  } catch {
    /* keep fallback */
  }
}

import { useEffect, useSyncExternalStore } from "react";

export function useMoney() {
  const code = useSyncExternalStore(subscribeCurrency, getCurrency, () => "EGP" as Currency);
  useEffect(() => {
    refreshFx();
  }, []);
  return {
    currency: code,
    setCurrency,
    format: (usd: number, ar?: boolean) => formatMoney(usd, ar, code),
    convert: (usd: number) => convertUsd(usd, code),
    note: (ar: boolean) => fxNote(ar),
    live: fxLive,
    asOf: fxAsOf,
  };
}
