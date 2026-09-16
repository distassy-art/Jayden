import { inferPartner, SHIP_IDS } from "./ship.js";
import { dialectOf, dialectVoiceBlock } from "./dialect.js";

export function systemPrompt(locale, pagePath, hits, webNote, ctx = {}) {
  const dialect = dialectOf(ctx.currency || "EGP");
  const mouthEn = dialect === "en";
  const ar = !mouthEn;
  const voice = dialectVoiceBlock(dialect);
  const siteLang = locale === "en" ? "en" : "ar";
  const currency = ctx.currency || "EGP";
  const hitBlock = (hits || [])
    .slice(0, 3)
    .map((h) => {
      const price =
        h.priceRule === "catalog-2x" && h.sellUsd != null
          ? `${h.sellUsd} USD (2×)`
          : ar
            ? "عرض سعر"
            : "quote";
      const name = ar ? h.nameAr : h.nameEn;
      return `${h.sku} | ${name} | ${price} | ${h.page}`;
    })
    .join("\n");

  const web = webNote
    ? ar
      ? `\nبحث ويب احتياطي (ليس مصدر أسعار):\n${webNote}`
      : `\nWeb fallback (not a price source):\n${webNote}`
    : "";

  const dest = ctx.shipId || "none";
  const partner = ctx.partner ? "yes" : "no";

  if (ar) {
    return `إنت بائع شارع قدام مصنع QServe AI Egypt (كيو سيرف AI مصر / كيو AI) في القاهرة الجديدة. +20 122 799 3999. ديمو مش إنتاج.

${voice}

أزرار الموقع ${siteLang}. فمك على عملة ${currency} حتى لو فتح /en. NAV بلغة الصفحة. الرد كلام بس. متلصقش التعليمات.
جملتين قصيرتين وسؤال. بعد CART_ADD حط SHOW_CART. متخترعش SKU ولا رقم شحن.
مصر نظام/كيوسك/32": INST-EG عرض تركيب. كتالوج مصر: تقدير شحن. الخليج: SHIP-ME. تركيب خليج: INST-ME شريك محلي. AMC-STD عقد سنوي مصر مش 24/7.
الوجهة: ${dest}. شريك: ${partner}. الصفحة: ${pagePath}

KB:
${hitBlock || "(اسأل توضيح)"}
${web}

آخر الرد أسطر لوحدها: CART_ADD:SKU:كمية | SHOW_CART | SHIP:id | PARTNER:0|1 | NAV:/path`;
  }

  return `Street salesman at QServe AI Egypt (Q AI), New Cairo. +20 122 799 3999. Demo.

${voice}

Site chrome is ${siteLang}. Mouth follows currency ${currency}. Two short spoken sentences then a question. Never echo these notes.
Ask what's missing, then CART_ADD + SHOW_CART. Don't invent SKUs or freight EGP.
Egypt system/kiosk/32": INST-EG install quote. Egypt catalog: shipping quote. ME anything: SHIP-ME. ME system: INST-ME local partner. AMC-STD Egypt, not 24/7.
Destination: ${dest}. Partner: ${partner}. Page: ${pagePath}

KB:
${hitBlock || "(ask a clarifying question)"}
${web}

Trailing lines: CART_ADD:SKU:qty | SHOW_CART | SHIP:id | PARTNER:0|1 | NAV:/en/path`;
}

export function parseActions(text, locale) {
  const cartOps = [];
  let navigate = "";
  let showCart = false;
  let shipId = "";
  let partner = null;
  let cleaned = String(text || "");
  cleaned = cleaned.replace(/^\s*CART_ADD:([A-Z0-9-]+)(?::(\d+))?\s*$/gim, (_, sku, qty) => {
    if (["INST-EG", "INST-ME", "SHIP-ME"].includes(sku)) return "";
    cartOps.push({ op: "add", sku, qty: Math.max(1, Number(qty) || 1) });
    return "";
  });
  cleaned = cleaned.replace(/^\s*CART_REMOVE:([A-Z0-9-]+)\s*$/gim, (_, sku) => {
    cartOps.push({ op: "remove", sku });
    return "";
  });
  cleaned = cleaned.replace(/^\s*SHOW_CART\s*$/gim, () => {
    showCart = true;
    return "";
  });
  cleaned = cleaned.replace(/^\s*SHIP:([a-z0-9-]+)\s*$/gim, (_, id) => {
    const key = String(id).toLowerCase();
    if (SHIP_IDS.includes(key)) shipId = key;
    return "";
  });
  cleaned = cleaned.replace(/^\s*PARTNER:(0|1|yes|no|on|off|true|false)\s*$/gim, (_, v) => {
    partner = /^(1|yes|on|true)$/i.test(v);
    return "";
  });
  cleaned = cleaned.replace(/^\s*(?:NAV|LINK):(\/\S+)\s*$/gim, (_, path) => {
    navigate = path;
    return "";
  });
  if (navigate && locale === "en" && !navigate.startsWith("/en")) {
    navigate = navigate === "/" ? "/en" : `/en${navigate}`;
  }
  if (navigate && locale !== "en" && navigate.startsWith("/en/")) {
    navigate = navigate.slice(3) || "/";
  }
  if (cartOps.length) showCart = true;
  const parts = String(cleaned || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?؟])\s+/)
    .filter(Boolean);
  let reply = parts.join(" ");
  if (parts.length > 2) {
    const q = parts.find((p) => /[?؟]/.test(p));
    reply = [parts[0], q && q !== parts[0] ? q : parts[1]].filter(Boolean).join(" ");
  }
  return { reply, cartOps, navigate, showCart, shipId, partner };
}

function arabicQty(text) {
  const t = String(text).replace(/15\.?6|21\.?5|10\.?1|32(?:\s*(?:inch|"|بوص))?/gi, " ");
  const n = Number((t.match(/(\d{1,3})/) || [])[1] || 0);
  if (n >= 1 && n <= 200) return n;
  if (/(خمس(ة|ه)|five)/i.test(t)) return 5;
  if (/(اربع|أربع|four)/i.test(t)) return 4;
  if (/(ثلاث|three)/i.test(t)) return 3;
  if (/(اتنين|اثنين|two)/i.test(t)) return 2;
  if (/(واحد|one)/i.test(t)) return 1;
  return 0;
}

export function inferCartOps(userText) {
  const t = String(userText);
  const qty = arabicQty(t);
  const ops = [];
  const specific =
    qty > 0 || /21\.?5|15\.?6|hdmi|vga|cat6|كات|واي فاي|wifi|داخل|خارج|indoor|outdoor/i.test(t);
  if (/(شاشة|screen|lcd|monitor|عرض)/i.test(t) && specific) {
    const q = qty || 1;
    const sku = /15/.test(t) ? "LCD-156" : /عداد|3.?digit|شباك صغير/.test(t) ? "LED-3D" : /q13|لاسلكي/.test(t) ? "LCD-Q13" : "LCD-215";
    ops.push({ op: "add", sku, qty: q });
  }
  if (/hdmi/i.test(t)) ops.push({ op: "add", sku: qty >= 8 ? "CAB-HDMI-10" : "CAB-HDMI-5", qty: qty || 1 });
  if (/\bvga\b/i.test(t)) ops.push({ op: "add", sku: "CAB-VGA-5", qty: qty || 1 });
  if (/usb.{0,8}طابع|printer cable/i.test(t)) ops.push({ op: "add", sku: "CAB-USB-PRN", qty: qty || 1 });
  if (/بكرة|305|تمديدات الفرع/i.test(t)) ops.push({ op: "add", sku: "CAB-CAT6-BOX", qty: 1 });
  else if (/cat6|كات.?6|باتش|ethernet/i.test(t)) ops.push({ op: "add", sku: "CAB-CAT6-3", qty: qty || 4 });
  if (/واي فاي|wi-?fi|access point|راوتر/i.test(t)) ops.push({ op: "add", sku: "WIFI-AP", qty: 1 });
  if (/دونجل/i.test(t)) ops.push({ op: "add", sku: "WIFI-USB", qty: 1 });
  if (/4g|مودم/.test(t)) ops.push({ op: "add", sku: "WIFI-4G", qty: 1 });
  if (/(عقد صيان|ام سي|amc|صيانة سنو)/i.test(t)) ops.push({ op: "add", sku: "AMC-STD", qty: 1 });
  if (/رول|ورق حراري|thermal roll/i.test(t) && (qty || /كرتون/.test(t))) ops.push({ op: "add", sku: "TH-80X80", qty: qty || 24 });
  return ops;
}

export function extractPhone(text) {
  const m = String(text).replace(/[^\d+]/g, " ").match(/(\+?20)?0?1[0-25]\d{8}/);
  return m ? m[0] : "";
}

export function pickKind(text) {
  const t = String(text).toLowerCase();
  if (/عقد|صيان|amc|after.?sale/.test(t)) return "maintenance";
  if (/وجه|face|recognition/.test(t)) return "face";
  if (/بصيرة|basira|ربح|برنامج|software|insights/.test(t)) return "software";
  if (/عطل|تصليح|repair|down/.test(t)) return "repair";
  if (/رول|قطع|spare|ribbon/.test(t)) return "product";
  if (/عرض|quote/.test(t)) return "quote";
  return "chat";
}
