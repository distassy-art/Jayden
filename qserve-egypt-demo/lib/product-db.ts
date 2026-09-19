import { allProducts, catalogItems, publicProducts, bySku, byPage } from "../functions/_lib/kb.js";

export type Faq = { qAr: string; aAr: string; qEn: string; aEn: string };
export type KbItem = {
  sku: string;
  category: string;
  priceRule: "catalog-2x" | "quote" | string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  page: string;
  sellUsd: number | null;
  buyUsd?: number | null;
  unitAr?: string;
  unitEn?: string;
  faq: Faq[];
  keywords?: string[];
};

export const kbAll = (): KbItem[] => allProducts() as KbItem[];
export const kbCatalog = (): KbItem[] => catalogItems() as KbItem[];
export const kbPublic = (): KbItem[] => publicProducts() as KbItem[];
export const kbBySku = (sku: string) => bySku(sku) as KbItem | undefined;
export const kbOnPage = (path: string) => byPage(path) as KbItem[];

export const catalogSkus = () => kbCatalog().map((p) => p.sku);

export function thumbFor(sku: string, category = "") {
  if (sku.startsWith("LCD") || sku.startsWith("LED")) return "/photos/signage.webp";
  if (sku.startsWith("CAB") || sku.startsWith("WIFI")) return "/photos/kiosk.jpeg";
  if (category === "repair" || sku.startsWith("AMC") || sku.startsWith("SVC")) return "/photos/nurse-call.jpeg";
  if (category === "software" || sku.startsWith("ANL")) return "/photos/csat.webp";
  if (sku.startsWith("CLK")) return "/photos/clocks.webp";
  if (sku.startsWith("TH") || sku.startsWith("RFID") || sku.startsWith("PVC")) return "/photos/queue-display.webp";
  if (category === "system") return "/photos/queue-bank.webp";
  return "/photos/queue-display.webp";
}

import type { Dialect } from "./dialect";

export function greeterLine(path: string, dialect: Dialect = "eg") {
  const p = path.toLowerCase();
  const pack = GREET[dialect] || GREET.eg;
  if (p.includes("maintenance") || p.includes("repair")) return pack.care;
  if (p.includes("insight") || p.includes("software")) return pack.soft;
  if (p.includes("queuing") || p.includes("انتظار")) return pack.queue;
  if (p.includes("kiosk") || p.includes("self-service")) return pack.kiosk;
  if (p.includes("nurses") || p.includes("nurse")) return pack.nurse;
  return pack.home;
}

const GREET: Record<Dialect, Record<string, string>> = {
  eg: {
    home: "إزيك. معاك Q AI من QServe AI. عايز نظام انتظار، نداء ممرضات، ولا كيوسك؟",
    care: "إزيك. الجهاز واقف دلوقتي، ولا عقد صيانة للفرع؟ ساعاتنا سبت لخميس 9 ل 6، مش 24/7.",
    soft: "إزيك. بصيرة بتتركب بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "إزيك، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كام شباك؟",
    kiosk: "إزيك. كيوسك تذاكر ولا دفع؟",
    nurse: "إزيك. تركيب نداء ممرضات؟",
  },
  ae: {
    home: "هلا، معاك Q AI من QServe AI. تبي نظام انتظار، نداء ممرضات، ولا كيوسك؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كم شباك؟",
    kiosk: "هلا. كيوسك تذاكر ولا دفع؟",
    nurse: "هلا. تركيب نداء ممرضات؟",
  },
  sa: {
    home: "هلا والله، معاك Q AI من QServe AI. تبي نظام انتظار، نداء ممرضات، ولا كيوسك؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كم شباك؟",
    kiosk: "هلا. كيوسك تذاكر ولا دفع؟",
    nurse: "هلا. تركيب نداء ممرضات؟",
  },
  qa: {
    home: "هلا، معاك Q AI من QServe AI. تبي نظام انتظار، نداء ممرضات، ولا كيوسك؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا. فرع جديد ولا نظام مركّب؟ كم شباك؟",
    kiosk: "هلا. كيوسك تذاكر ولا دفع؟",
    nurse: "هلا. تركيب نداء ممرضات؟",
  },
  kw: {
    home: "هلا، شلونك؟ معاك Q AI من QServe AI. تبي نظام انتظار، نداء ممرضات، ولا كيوسك؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا. فرع جديد ولا نظام مركّب؟ كم شباك؟",
    kiosk: "هلا. كيوسك تذاكر ولا دفع؟",
    nurse: "هلا. تركيب نداء ممرضات؟",
  },
  en: {
    home: "Hey — Q AI at QServe AI. Queue system, nurse call, or a kiosk?",
    care: "Hey. Is a device down now, or do you need an annual care contract? Hours Sat–Thu 9–6 — not 24/7.",
    soft: "Hey. كيوسيرف بصيرة is a per-client add-on after hardware. Bank, hospital, or government?",
    queue: "Hey — new branch or an installed system? How many windows?",
    kiosk: "Hey. Ticket kiosk or payments?",
    nurse: "Hey. New nurse-call install?",
  },
};

export const PRODUCT_PATHS = new Set([
  "/queuing-system",
  "/nurse-call-system",
  "/self-service-kiosks",
  "/smart-boards",
  "/central-clocks",
  "/digital-signage",
  "/service-evaluation",
  "/interactive-maps",
  "/proximity-card",
  "/mifare-card",
  "/id-card-printing",
  "/id-card-printers",
  "/maintenance",
  "/repair",
  "/insights",
  "/software",
]);

export function isProductPath(bare: string) {
  if (PRODUCT_PATHS.has(bare)) return true;
  return false;
}

export function skuStaticParams() {
  return kbPublic().map((p) => ({ sku: p.sku }));
}
