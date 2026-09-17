"use client";

export const CURRENCIES = ["EGP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<Currency, { ar: string; en: string; decimals: number; cc: string; flag: string }> = {
  EGP: { ar: "جنيه مصري", en: "Egyptian pound", decimals: 0, cc: "eg", flag: "🇪🇬" },
};

export const FALLBACK_USD_RATES: Record<Currency, number> = {
  EGP: 52.063931,
};

export const CURRENCY_KEY = "qserve-currency";
export const FX_CACHE_KEY = "qserve-fx-v1";

const listeners = new Set<() => void>();
const currency: Currency = "EGP";

function emit() {
  listeners.forEach((fn) => fn());
}

export function getCurrency(): Currency {
  return "EGP";
}

export function setCurrency(_next?: Currency) {
  try {
    localStorage.setItem(CURRENCY_KEY, "EGP");
    document.cookie = `${CURRENCY_KEY}=EGP;path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* ignore */
  }
  emit();
}

export function subscribeCurrency(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  setCurrency("EGP");
}

export function convertUsd(_usd: number, _code: Currency = currency) {
  return 0;
}

export function formatMoney(_usd?: number, ar = true, _code: Currency = "EGP") {
  return ar ? "طلب عرض سعر" : "Request quote";
}

export function fxNote(ar: boolean) {
  return ar ? "الأسعار تظهر في عرض السعر — مش على الموقع." : "Prices come on the quote — not on the site.";
}

export function getFxMeta() {
  return { rates: FALLBACK_USD_RATES, fxAsOf: "", fxLive: false };
}

export async function refreshFx() {
  /* public site is quote-only */
}

import { useSyncExternalStore } from "react";

export function useMoney() {
  const code = useSyncExternalStore(subscribeCurrency, getCurrency, () => "EGP" as Currency);
  return {
    currency: code,
    setCurrency,
    format: (usd: number, ar?: boolean) => formatMoney(usd, ar, code),
    convert: (usd: number) => convertUsd(usd, code),
    note: (ar: boolean) => fxNote(ar),
    live: false,
    asOf: "",
  };
}
