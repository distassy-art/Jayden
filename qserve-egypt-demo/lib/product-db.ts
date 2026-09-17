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
  if (category === "face-recognition" || sku.startsWith("FACE")) return "/photos/kiosk-bank.webp";
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
  if (p.includes("face")) return pack.face;
  if (p.includes("maintenance") || p.includes("repair")) return pack.care;
  if (p.includes("insight") || p.includes("software")) return pack.soft;
  if (p.includes("queuing") || p.includes("انتظار")) return pack.queue;
  if (p.includes("kiosk") || p.includes("self-service")) return pack.kiosk;
  if (p.includes("nurses") || p.includes("nurse")) return pack.nurse;
  if (p.includes("products") || p.includes("lcd") || p.includes("cab-") || p.includes("wifi")) return pack.catalog;
  return pack.home;
}

const GREET: Record<Dialect, Record<string, string>> = {
  eg: {
    home: "إزيك. معاك Q AI من QServe AI. عايز إيه النهارده؟ نظام، شاشات، ولا صيانة؟",
    face: "إزيك. التعرف على الوجه خط لوحده وموافقة مكتوبة. بوابة، كيوسك، ولا جهاز جداري؟",
    care: "إزيك. الجهاز واقف دلوقتي، ولا عقد صيانة للفرع؟ ساعاتنا سبت لخميس 9 ل 6، مش 24/7.",
    soft: "إزيك. بصيرة بتتركب بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "إزيك، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كام شباك؟",
    kiosk: "إزيك. كيوسك جديد، ولا الشاشة وقفت؟ كام شاشة، 21.5 ولا 15.6؟",
    nurse: "إزيك. تركيب نداء ممرضات، ولا سلك باظ؟",
    catalog: "إزيك. شاشات، HDMI، ولا واي فاي؟ قولي العدد وأنا أحط السلة قدامك.",
  },
  ae: {
    home: "هلا، معاك Q AI من QServe AI. تبي نظام، شاشات، كابلات، صيانة، ولا تعرف وجه؟",
    face: "هلا. التعرف على الوجه خط لحاله وموافقة مكتوبة. بوابة، كيوسك زيارات، ولا جهاز جداري؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كم شباك؟ أحط الباقة والعقد في السلة.",
    kiosk: "هلا. كيوسك جديد، ولا الشاشة وقفت؟ إذا شاشات: كم واحدة، 21.5 أو 15.6، وفي HDMI؟",
    nurse: "هلا. تركيب نداء ممرضات، ولا سلك خربان؟ أضيف القطع وأسعّر عقد المستشفى.",
    catalog: "هلا. شاشات، HDMI وكات6، ولا واي فاي؟ قل لي العدد والقياس وأنا أعبي السلة قدامك.",
  },
  sa: {
    home: "هلا والله، معاك Q AI من QServe AI. تبي نظام، شاشات، كابلات، صيانة، ولا تعرف وجه؟",
    face: "هلا. التعرف على الوجه خط لحاله وموافقة مكتوبة. بوابة، كيوسك زيارات، ولا جهاز جداري؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا، معاك المبيعات. فرع جديد ولا نظام مركّب؟ كم شباك؟ أحط الباقة والعقد في السلة.",
    kiosk: "هلا. كيوسك جديد، ولا الشاشة وقفت؟ إذا شاشات: كم واحدة، 21.5 أو 15.6، وفي HDMI؟",
    nurse: "هلا. تركيب نداء ممرضات، ولا سلك خربان؟ أضيف القطع وأسعّر عقد المستشفى.",
    catalog: "هلا. شاشات، HDMI وكات6، ولا واي فاي؟ قل لي العدد والمقاس وأنا أحطها في السلة قدامك.",
  },
  qa: {
    home: "هلا، معاك Q AI من QServe AI. تبي نظام، شاشات، كابلات، صيانة، ولا تعرف وجه؟",
    face: "هلا. التعرف على الوجه خط لحاله وموافقة مكتوبة. بوابة، كيوسك زيارات، ولا جهاز جداري؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا. فرع جديد ولا نظام مركّب؟ كم شباك؟ أحط الباقة في السلة قدامك.",
    kiosk: "هلا. كيوسك جديد، ولا الشاشة وقفت؟ كم شاشة، 21.5 أو 15.6، وفي HDMI؟",
    nurse: "هلا. تركيب نداء ممرضات، ولا سلك خربان؟ أضيف القطع للسلة.",
    catalog: "هلا. شاشات، HDMI وكات6، ولا واي فاي؟ قل العدد والقياس وأنا أعبي السلة.",
  },
  kw: {
    home: "هلا، شلونك؟ معاك Q AI من QServe AI. تبي نظام، شاشات، كابلات، صيانة، ولا تعرف وجه؟",
    face: "هلا. التعرف على الوجه خط لحاله وموافقة مكتوبة. بوابة، كيوسك زيارات، ولا جهاز جداري؟",
    care: "هلا. الجهاز واقف الحين، ولا تبي عقد صيانة سنوي؟ الدوام سبت–خميس 9–6، مو 24/7.",
    soft: "هلا. كيوسيرف بصيرة إضافة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟",
    queue: "هلا. فرع جديد ولا نظام مركّب؟ كم شباك؟ أحط الباقة والعقد بالسلة.",
    kiosk: "هلا. كيوسك جديد، ولا الشاشة وقفت؟ كم شاشة، 21.5 أو 15.6، وفي HDMI؟",
    nurse: "هلا. تركيب نداء ممرضات، ولا سلك بايظ؟ أضيف القطع للسلة.",
    catalog: "هلا. شاشات، HDMI وكات6، ولا واي فاي؟ قل العدد والقياس وأنا أحطها بالسلة قدامك.",
  },
  en: {
    home: "Hey — Q AI at QServe AI. What do you need: a system, screens, cables, care, Basira, or face recognition?",
    face: "Hey — face recognition is its own line, with written consent. Gate, visitor kiosk, or a staff wall terminal?",
    care: "Hey. Is a device down now, or do you need an annual care contract? Hours Sat–Thu 9–6 — not 24/7.",
    soft: "Hey. كيوسيرف بصيرة is a per-client add-on after hardware. Bank, hospital, or government?",
    queue: "Hey — new branch or an installed system? How many windows? I'll put the pack and AMC in the cart as you answer.",
    kiosk: "Hey. New kiosk, or is the screen down? For screens: how many, 21.5 or 15.6, and HDMI?",
    nurse: "Hey. New nurse-call, or a dead cord? I can add spares and quote the hospital SLA.",
    catalog: "Hey. Screens, HDMI/Cat6, or branch Wi-Fi? Tell me qty and size — I'll fill the cart in front of you.",
  },
};

export const PRODUCT_PATHS = new Set([
  "/queuing-system",
  "/nurses-call-system",
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
  "/face-recognition",
  "/maintenance",
  "/repair",
  "/insights",
  "/software",
  "/products",
  "/cart",
]);

export function isProductPath(bare: string) {
  if (PRODUCT_PATHS.has(bare)) return true;
  if (bare.startsWith("/products/")) return true;
  return false;
}

export function skuStaticParams() {
  return kbPublic().map((p) => ({ sku: p.sku }));
}
