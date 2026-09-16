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

export function greeterLine(path: string, ar: boolean) {
  const p = path.toLowerCase();
  if (p.includes("face"))
    return ar
      ? "أهلاً، معك خدمة عملاء كيوسيرف. التعرف على الوجه خط مستقل — موافقة مكتوبة حسب قانون حماية البيانات. بوابة، كيوسك زيارات، ولا جهاز جداري للموظفين؟"
      : "Hi — face recognition is its own line, with written consent under PDPL. Gate, visitor kiosk, or a staff wall terminal?";
  if (p.includes("maintenance") || p.includes("repair"))
    return ar
      ? "أهلاً. الجهاز واقف دلوقتي، ولا محتاج عقد صيانة سنوي للفرع؟ ساعاتنا سبت–خميس 9–6، مش 24/7."
      : "Hi. Is a device down now, or do you need an annual care contract? Hours Sat–Thu 9–6 — not 24/7.";
  if (p.includes("insight") || p.includes("software"))
    return ar
      ? "أهلاً. كيوسيرف بصيرة إضافة مخصّصة لفرعكم بعد الأجهزة. بنك، مستشفى، ولا جهة حكومية؟"
      : "Hi. كيوسيرف بصيرة is a per-client add-on after hardware. Bank, hospital, or government?";
  if (p.includes("queuing") || p.includes("انتظار"))
    return ar
      ? "أهلاً، معك المبيعات. فرع جديد ولا نظام مركّب؟ كام شباك؟ أقدر أحط الباقة وعقد الصيانة في السلة قدامك."
      : "Hi — new branch or an installed system? How many windows? I can put the pack and AMC in the cart as you answer.";
  if (p.includes("kiosk") || p.includes("self-service"))
    return ar
      ? "أهلاً. كيوسك جديد، ولا الشاشة/الطابعة وقفت؟ لو شاشات: كام واحدة، 21.5 ولا 15.6، و analog HDMI؟"
      : "Hi. New kiosk, or is the screen/printer down? For screens: how many, 21.5 or 15.6, and HDMI?";
  if (p.includes("nurses") || p.includes("nurse"))
    return ar
      ? "أهلاً. تركيب نداء ممرضات، ولا سلك/زر باظ؟ أقدر أضيف القطع للسلة وأعرض عقد المستشفى."
      : "Hi. New nurse-call, or a dead cord/button? I can add spares to the cart and offer the hospital SLA.";
  if (p.includes("products") || p.includes("lcd") || p.includes("cab-") || p.includes("wifi"))
    return ar
      ? "أهلاً. شاشات، كابلات HDMI/كات6، ولا واي فاي للفرع؟ قولي العدد والمقاس وأنا أعلم السلة قدامك سطراً سطراً."
      : "Hi. Screens, HDMI/Cat6, or branch Wi-Fi? Tell me qty and size — I’ll fill the cart line by line in front of you.";
  return ar
    ? "أهلاً، معك خدمة عملاء Q AI. اكتب احتياجك: نظام، شاشات، كابلات، صيانة، بصيرة، أو تعرف وجه."
    : "Hi — Q AI at QServe AI Egypt. Tell me what you need: a system, screens, cables, care contract, Basira, or face recognition.";
}

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
