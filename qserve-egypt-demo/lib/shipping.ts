"use client";

import { useSyncExternalStore } from "react";
import type { HydratedLine } from "./cart";

export type ShipId = "eg-cairo" | "eg-gov" | "me-uae" | "me-sar" | "me-qat" | "me-kwt" | "me-gcc";

export type ShipOption = {
  id: ShipId;
  group: "egypt" | "me";
  groupAr: string;
  groupEn: string;
  ar: string;
  en: string;
};

export const SHIP_OPTIONS: ShipOption[] = [
  { id: "eg-cairo", group: "egypt", groupAr: "داخل مصر", groupEn: "Inside Egypt", ar: "القاهرة والجيزة", en: "Cairo & Giza" },
  { id: "eg-gov", group: "egypt", groupAr: "داخل مصر", groupEn: "Inside Egypt", ar: "باقي المحافظات", en: "Other governorates" },
  { id: "me-uae", group: "me", groupAr: "شحن للشرق الأوسط", groupEn: "Shipping to the Middle East", ar: "الإمارات", en: "UAE" },
  { id: "me-sar", group: "me", groupAr: "شحن للشرق الأوسط", groupEn: "Shipping to the Middle East", ar: "السعودية", en: "Saudi Arabia" },
  { id: "me-qat", group: "me", groupAr: "شحن للشرق الأوسط", groupEn: "Shipping to the Middle East", ar: "قطر", en: "Qatar" },
  { id: "me-kwt", group: "me", groupAr: "شحن للشرق الأوسط", groupEn: "Shipping to the Middle East", ar: "الكويت", en: "Kuwait" },
  { id: "me-gcc", group: "me", groupAr: "شحن للشرق الأوسط", groupEn: "Shipping to the Middle East", ar: "باقي الخليج والشام", en: "Other GCC / Levant" },
];

export const SHIP_KEY = "qserve-ship-v1";
export const PARTNER_KEY = "qserve-partner-v1";

function weightOf(sku: string, qty: number) {
  const u = sku.toUpperCase();
  if (u.startsWith("LCD") || u.startsWith("LED") || u.startsWith("FACE")) return 4.5 * qty;
  if (u.startsWith("WIFI") || u.startsWith("PRN") || u.startsWith("KSK") || u.startsWith("PSU") || u.startsWith("CLK")) return 1.2 * qty;
  if (u.startsWith("CAB-CAT6-BOX")) return 8 * qty;
  if (u.startsWith("CAB")) return 0.6 * qty;
  if (u.startsWith("TH-") || u.startsWith("RIB") || u.startsWith("RFID") || u.startsWith("PVC")) return 0.35 * qty;
  return 0.8 * qty;
}

export function byId(id: string) {
  return SHIP_OPTIONS.find((o) => o.id === id);
}

export function shipGroup(id: ShipId | ""): "egypt" | "me" | "" {
  return byId(id || "")?.group || "";
}

export function shippableLines(hydrated: HydratedLine[]) {
  return hydrated.filter((l) => !l.quote && !["INST-EG", "INST-ME", "SHIP-ME"].includes(l.sku));
}

export function lineNeedsInstall(line: HydratedLine) {
  const sku = line.sku.toUpperCase();
  const cat = line.item.category;
  if (["INST-EG", "INST-ME", "SHIP-ME"].includes(sku)) return false;
  if (cat === "system" || cat === "face-recognition" || cat === "software") return true;
  if (sku.startsWith("LCD") || sku.startsWith("LED") || sku.startsWith("FACE") || sku.startsWith("CLK") || sku.startsWith("KSK")) return true;
  return false;
}

export function installLines(hydrated: HydratedLine[]) {
  return hydrated.filter(lineNeedsInstall);
}

export function parcelLines(hydrated: HydratedLine[]) {
  return hydrated.filter((l) => !lineNeedsInstall(l) && !l.quote);
}

export function quoteOnlyHint(hydrated: HydratedLine[], ar: boolean, group: "egypt" | "me" | "") {
  const systems = installLines(hydrated).length > 0;
  if (group === "me") {
    return ar
      ? systems
        ? "الشحن من مصر (أرامكس / DHL…) تقدير فقط — اطلب عرض شحن. تركيب محلي اختياري عبر شريك نسعّره. فريق QServe AI لا يسافر."
        : "الشحن من مصر تقدير فقط — اطلب عرض شحن. الجمارك على المستلم ما لم يُكتب غير ذلك."
      : systems
        ? "Freight from Egypt is an estimate only — request a shipping quote. Optional local-partner install quote. QServe AI staff do not fly out."
        : "Freight from Egypt is an estimate only — request a shipping quote. Duties on the buyer unless the PO says otherwise.";
  }
  if (systems) {
    return ar
      ? "التوصيل هنا تركيب من QServe AI — اطلب عرض تركيب. ليست شركة شحن."
      : "This is a QServe AI installation quotation — request an install quote. Not a courier SKU.";
  }
  return ar
    ? "تقدير الشحن داخل مصر بعد الوزن والمدينة — اطلب عرض شحن."
    : "Egypt catalog freight is an estimate after weight and city — request a shipping quote.";
}

export function catalogWeightKg(hydrated: HydratedLine[]) {
  return Number(shippableLines(hydrated).reduce((s, l) => s + weightOf(l.sku, l.qty), 0).toFixed(1));
}

const shipListeners = new Set<() => void>();
let shipId: ShipId | "" = "";
let partnerInstall = false;

function persist() {
  try {
    if (shipId) localStorage.setItem(SHIP_KEY, shipId);
    else localStorage.removeItem(SHIP_KEY);
    localStorage.setItem(PARTNER_KEY, partnerInstall ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function emitShip() {
  persist();
  shipListeners.forEach((fn) => fn());
}

export function getShipId() {
  return shipId;
}

export function getPartnerInstall() {
  return partnerInstall;
}

export function setShipId(id: ShipId | "") {
  shipId = id;
  if (shipGroup(id) !== "me") partnerInstall = false;
  emitShip();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qserve:ship", { detail: { id, partner: partnerInstall } }));
}

export function setPartnerInstall(on: boolean) {
  partnerInstall = Boolean(on) && shipGroup(shipId) === "me";
  emitShip();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qserve:ship", { detail: { id: shipId, partner: partnerInstall } }));
}

export function subscribeShip(fn: () => void) {
  shipListeners.add(fn);
  return () => shipListeners.delete(fn);
}

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(SHIP_KEY);
    if (raw && SHIP_OPTIONS.some((o) => o.id === raw)) shipId = raw as ShipId;
    partnerInstall = localStorage.getItem(PARTNER_KEY) === "1" && shipGroup(shipId) === "me";
  } catch {
    shipId = "";
    partnerInstall = false;
  }
}

export function useShip() {
  const id = useSyncExternalStore(subscribeShip, getShipId, () => "" as ShipId | "");
  const partner = useSyncExternalStore(subscribeShip, getPartnerInstall, () => false);
  return { shipId: id, setShipId, option: byId(id || ""), group: shipGroup(id), partner, setPartnerInstall };
}

export function inferShipId(text: string): ShipId | "" {
  const t = String(text);
  if (/كويت|kuwait|kwd/i.test(t)) return "me-kwt";
  if (/قطر|qatar|doha|qar/i.test(t)) return "me-qat";
  if (/سعود|رياض|جدة|jeddah|riyadh|ksa|saudi/i.test(t)) return "me-sar";
  if (/إمارات|امارات|دبي|أبوظبي|ابوظبي|abu dhabi|dubai|uae/i.test(t)) return "me-uae";
  if (/خليج|gcc|شام|اردن|الأردن|لبنان|عمان|البحرين|bahrain|jordan|lebanon|oman/i.test(t)) return "me-gcc";
  if (/شرق أوسط|middle east|شحن خارج/i.test(t)) return "me-gcc";
  if (/قاهر|جيز|cairo|giza|new cairo|التجمع/i.test(t)) return "eg-cairo";
  if (/محافظ|اسكندر|إسكندر|اسوان|أسيوط|منصور|طنطا|alex|governor/i.test(t)) return "eg-gov";
  if (/مصر|egypt|توصيل داخل/i.test(t)) return "eg-cairo";
  return "";
}

export function inferPartner(text: string): boolean | null {
  const t = String(text);
  if (/بدون شريك|من غير شريك|no partner|ship only|شحن فقط|بدون تركيب/i.test(t)) return false;
  if (/شريك محلي|تركيب محلي|third.?party|local partner|INST-ME|partner install/i.test(t)) return true;
  return null;
}
