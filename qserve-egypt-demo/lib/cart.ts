"use client";

import { useSyncExternalStore } from "react";
import { kbBySku, thumbFor, type KbItem } from "./product-db";

export type CartLine = { sku: string; qty: number };
const KEY = "qserve-cart-v1";

let lines: CartLine[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* ignore */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) lines = JSON.parse(raw);
  } catch {
    lines = [];
  }
}

if (typeof window !== "undefined") load();

export function getCart() {
  return lines;
}

export function subscribeCart(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addLine(sku: string, qty = 1) {
  const n = Math.max(1, qty);
  const row = lines.find((l) => l.sku === sku);
  if (row) row.qty += n;
  else lines = [...lines, { sku, qty: n }];
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qserve:cart-add", { detail: { sku, qty: n } }));
    openCartDrawer();
  }
}

export function setQty(sku: string, qty: number) {
  if (qty < 1) {
    lines = lines.filter((l) => l.sku !== sku);
  } else {
    lines = lines.map((l) => (l.sku === sku ? { ...l, qty } : l));
  }
  emit();
}

export function removeLine(sku: string) {
  lines = lines.filter((l) => l.sku !== sku);
  emit();
}

export async function applyOps(ops: { op: string; sku: string; qty?: number }[]) {
  for (const op of ops) {
    if (op.op === "remove") removeLine(op.sku);
    if (op.op === "add") addLine(op.sku, op.qty || 1);
    await new Promise((r) => setTimeout(r, 320));
  }
}

export function clearCart() {
  lines = [];
  emit();
}

export function openCartDrawer() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qserve:cart-open"));
}

export type HydratedLine = CartLine & { item: KbItem; thumb: string; quote: boolean; lineUsd: number | null };

export function hydrate(list: CartLine[]): HydratedLine[] {
  return list
    .map((l) => {
      const item = kbBySku(l.sku);
      if (!item) return null;
      const quote = item.priceRule !== "catalog-2x" || item.sellUsd == null;
      return {
        ...l,
        item,
        thumb: thumbFor(item.sku, item.category),
        quote,
        lineUsd: quote ? null : Number(item.sellUsd) * l.qty,
      };
    })
    .filter(Boolean) as HydratedLine[];
}

export const USD_TO_EGP = 48;

export function moneyPair(usd: number, ar: boolean) {
  const egp = usd * USD_TO_EGP;
  return {
    usdLabel: `USD ${usd.toFixed(2)}`,
    egpLabel: ar ? `≈ ${egp.toLocaleString("ar-EG")} ج.م` : `≈ EGP ${egp.toLocaleString("en-US")}`,
  };
}

export function cartTotalUsd(list: CartLine[]) {
  return hydrate(list).reduce((s, l) => s + (l.lineUsd || 0), 0);
}

export function useCart() {
  const snap = useSyncExternalStore(subscribeCart, getCart, () => [] as CartLine[]);
  const hydrated = hydrate(snap);
  const count = snap.reduce((s, l) => s + l.qty, 0);
  const catalogUsd = cartTotalUsd(snap);
  const quotes = hydrated.filter((l) => l.quote);
  return { lines: snap, hydrated, count, catalogUsd, quotes, addLine, setQty, removeLine, applyOps, clearCart, openCartDrawer };
}

export function whatsappCartText(hydrated: HydratedLine[], ar: boolean) {
  const head = ar ? "طلب من سلة QServe AI Egypt (تجريبي)" : "QServe AI Egypt cart request (demo)";
  const rows = hydrated.map((l) => {
    const name = ar ? l.item.nameAr : l.item.nameEn;
    const price = l.quote ? (ar ? "طلب عرض سعر" : "quote") : `$${l.lineUsd?.toFixed(2)}`;
    return `${l.qty}× ${l.sku} ${name} — ${price}`;
  });
  const total = hydrated.reduce((s, l) => s + (l.lineUsd || 0), 0);
  const foot = ar ? `كتالوج 2× ≈ $${total.toFixed(2)} (بدون بنود العرض)` : `Catalog 2× ≈ $${total.toFixed(2)} (quote lines extra)`;
  return [head, ...rows, foot].join("\n");
}
