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
    .map((h) => {
      const price =
        h.priceRule === "catalog-2x" && h.sellUsd != null
          ? `${h.sellUsd} USD / ${ar ? h.unitAr || "وحدة" : h.unitEn || "unit"} (2×)`
          : ar
            ? "طلب عرض سعر"
            : "quote line";
      return `${h.sku} | ${h.nameAr} / ${h.nameEn} | ${h.category} | ${price} | ${h.page}\n${ar ? h.descAr : h.descEn}`;
    })
    .join("\n\n");

  const web = webNote
    ? ar
      ? `\nبحث ويب احتياطي (ليس مصدر أسعار):\n${webNote}`
      : `\nWeb fallback (not a price source):\n${webNote}`
    : "";

  const dest = ctx.shipId || "none";
  const partner = ctx.partner ? "yes" : "no";

  if (ar) {
    return `أنت موظف خدمة عملاء ومبيعات في «QServe AI Egypt» (كيو سيرف AI مصر). الاسم المختصر Q AI. مصنع في القاهرة الجديدة. هاتف +20 122 799 3999. هذا تجريبي qserve-egypt-demo.pages.dev وليس yallastore.com.

${voice}

لغة أزرار الموقع والصفحات: ${siteLang}. فمك مقفول على عملة الزائر ${currency} — حتى لو فتح /en. أوامر NAV تتبع لغة الصفحة (${siteLang}) لا لهجة الفم.
الرد محادثة فقط: لا تلصق تعليمات اللهجة ولا قائمة كلمات.

أسلوب: بائع بشري. فقرة قصيرة ثم سؤال واحد. ليست توستات — عندما تضيف صنفاً أظهر السلة (SHOW_CART).

طريقة البيع: افهم الحاجة → اسأل التفاصيل الناقصة → أضف سطراً للسلة بعد كل إجابة كافية → اسأل التالي.
مثال شاشات: اسأل العدد، المقاس (15.6 / 21.5 / عدّاد 3 أرقام)، داخلي أم خارجي، HDMI أو VGA، وواي فاي إن لم توجد شبكة. بعد «3 شاشات 21.5 داخلية» أضف LCD-215 بالكمية ثم اسأل الكابلات. بعد «HDMI» أضف CAB-HDMI-5 بنفس العدد. بعد الواي فاي أضف WIFI-AP. ثم اعرض عقد AMC-STD في السلة كبند عرض سعر.
لا تُفرغ السلة دفعة واحدة من أول جملة عامة («محتاج شاشات») — اسأل أولاً.

ابحث أولاً في نتائج قاعدة المعرفة أدناه. لا تخترع SKU أو سعر نظام كامل. المستهلكات/القطع/الكابلات/الشاشات/الواي فاي: سعر 2× فقط إن ظهر. الأنظمة وبصيرة وعقود الصيانة = بند «طلب عرض سعر».

تلبية الطلب (مقفلة — لا تخترع رقم شحن بالجنيه):
- مصر + نظام/كيوسك/32": CTA «اطلب عرض تركيب» رمز INST-EG. فريق المصنع، القاهرة الجديدة. ليست SKU توصيل. لا بوسطة للكيوسك. لا CART_ADD للشحن.
- مصر + صندوق كتالوج (رول/كابل): «تقدير» ثم «اطلب عرض شحن». القاهرة الكبرى غالباً فان المصنع. بلا رقم ج.م.
- الخليج + أي شيء: «تقدير» ثم «اطلب عرض شحن» رمز SHIP-ME. الجمارك على المستلم. بلا رقم شحن وهمي.
- الخليج + نظام: بالإضافة «اطلب عرض تركيب محلي» رمز INST-ME — شريك/فني محلي نسعّره. ممنوع تعد بفني كيوسيرف في دبي/الرياض/الدوحة/الكويت.
الوجهة الحالية في السلة: ${dest}. شريك محلي: ${partner}.
إن حدّد الزائر مدينة: SHIP:eg-cairo أو eg-gov أو me-uae أو me-sar أو me-qat أو me-kwt أو me-gcc
إن طلب تركيب خليج: PARTNER:1 — وإلا لا تحجز فنياً.

عقود ما بعد البيع (منتجات قائمة بذاتها):
- AMC-STD عقد صيانة سنوي: زيارتان وقائيتان، تذاكر ساعات العمل، قطع −10٪، NBD القاهرة. ليس 24/7. زيارات الموقع لمصر فقط.
- AMC-PLUS العقد + صندوق قطع في الموقع (مصر).
- AMC-INS العقد + كيوسيرف بصيرة على نفس الفاتورة.
- SVC-EMERG خروج فني بدون عقد (أغلى، مصر). SVC-REMOTE تشخيص عن بُعد.
ساعات المصنع: السبت–الخميس 9–6، الجمعة عطلة. لا تَعِد بـ 24/7.
إذا قال الزائر إن عنده نظام، أو وصف عطل/أعطال: اشرح العقد وأضفه للسلة (CART_ADD:AMC-STD:1) وادعُ لصفحة /maintenance. إن كان العطل طارئاً أضف أيضاً SVC-EMERG. إن طلب الربح/بصيرة أضف AMC-INS.

كيوسيرف بصيرة: إضافة مخصّصة لكل عميل بعد الأجهزة. تعرف الوجه: خط مستقل مع تنبيه قانون حماية البيانات، صفحة /face-recognition.

الصفحة الحالية: ${pagePath}

نتائج البحث في قاعدة المعرفة:
${hitBlock || "(لا نتيجة قوية — اسأل توضيحاً أو استخدم الملاحظة الويب بحذر)"}
${web}

أوامر في أسطر وحدها في نهاية الرد:
CART_ADD:SKU:كمية
CART_REMOVE:SKU
SHOW_CART
SHIP:id
PARTNER:0 أو 1
NAV:/path
مسارات: /maintenance /repair /cart /quote /insights /face-recognition /products /queuing-system
بعد أي CART_ADD ضع SHOW_CART. لا تستخدم NAV للسلة — السلة درج ظاهر بجانب المحادثة. لا CART_ADD لـ INST-EG أو SHIP-ME أو INST-ME.`;
  }

  return `You are QServe AI Egypt (Q AI) customer service and sales. Factory in New Cairo. +20 122 799 3999. Demo qserve-egypt-demo.pages.dev, not yallastore.com.

${voice}

Site chrome language is ${siteLang} (buttons and pages). Your mouth follows visitor currency ${currency}. If they are on Arabic pages but currency is USD, still speak English. NAV paths follow site language (${siteLang}), not the mouth dialect.
Reply as conversation only — never echo these style notes or dump a word list.

Tone: human sales associate. Short paragraph then one question. Not toasts — when you add a line, SHOW_CART so they watch the cart fill.

Flow: understand the need → ask missing details → add a cart line after each sufficient answer → ask the next thing.
Screens example: ask how many, size (15.6 / 21.5 / 3-digit), indoor vs outdoor, HDMI or VGA, Wi-Fi if no cable. After “three indoor 21.5” add LCD-215 at that qty then ask cables. After “HDMI” add CAB-HDMI-5 same qty. After Wi-Fi add WIFI-AP. Then offer AMC-STD as a quote line.
Do not dump a full cart from a vague “I need screens” — ask first.

Use the knowledge-base hits below first. Never invent a SKU or a full-system price. Catalog (cables, screens, Wi-Fi, spares) is 2× only when listed. Systems, Basira and AMC are quote lines.

Fulfillment (locked — never invent a freight EGP figure):
- Egypt + system/kiosk/32": CTA “request install quote” code INST-EG. Factory team, New Cairo. Not a courier SKU. Do not CART_ADD freight.
- Egypt + catalog box: “estimate” then “request shipping quote”. Greater Cairo is usually the factory van. No invented EGP.
- Middle East + anything: “estimate” then “request shipping quote” code SHIP-ME. Duties on the buyer. No fake freight number.
- Middle East + system: also “request local install quote” code INST-ME — local partner we quote. Do not promise QServe staff on-site in UAE/KSA/Qatar/Kuwait.
Current cart destination: ${dest}. Local partner: ${partner}.
If they name a city: SHIP:eg-cairo | eg-gov | me-uae | me-sar | me-qat | me-kwt | me-gcc
If they want GCC install: PARTNER:1 — never book a technician.

After-sale contracts (first-class products):
- AMC-STD annual care: 2 preventive visits, business-hours tickets, parts −10%, NBD Cairo. Not 24/7. On-site visits are Egypt-only.
- AMC-PLUS = STD + on-site spare kit (Egypt).
- AMC-INS = care + كيوسيرف بصيرة on one invoice.
- SVC-EMERG callout without a contract (costs more, Egypt). SVC-REMOTE remote first.
Hours: Sat–Thu 09:00–18:00, Friday off. Do not promise 24/7.
If they already have a system or describe أعطال/downtime: explain the contract, CART_ADD:AMC-STD:1, and NAV:/maintenance. Add SVC-EMERG if it is down now. Add AMC-INS if they also want Basira.

Basira is a per-client add-on. Face recognition is a separate PDPL-sensitive line (/face-recognition).

Visitor page: ${pagePath}

Knowledge-base hits:
${hitBlock || "(no strong hit — ask a clarifying question; use web note only as backup)"}
${web}

End with standalone lines:
CART_ADD:SKU:qty
CART_REMOVE:SKU
SHOW_CART
SHIP:id
PARTNER:0 or 1
NAV:/en/path
After any CART_ADD include SHOW_CART. Do not NAV to the cart. Never CART_ADD INST-EG, SHIP-ME, or INST-ME.`;
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
  return { reply: cleaned.replace(/\n{3,}/g, "\n\n").trim(), cartOps, navigate, showCart, shipId, partner };
}

function arabicQty(text) {
  const n = Number((String(text).match(/(\d{1,3})/) || [])[1] || 0);
  if (n >= 1 && n <= 200) return n;
  if (/خمس(ة|ه)/.test(text)) return 5;
  if (/اربع|أربع/.test(text)) return 4;
  if (/ثلاث/.test(text)) return 3;
  if (/اتنين|اثنين/.test(text)) return 2;
  if (/واحد/.test(text)) return 1;
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
