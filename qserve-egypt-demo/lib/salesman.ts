import type { Locale } from "./i18n";
import { accessorySell, matchAccessory } from "./accessories-public";
import { localizedHref } from "./i18n";

export type Intent = "system" | "spare" | "repair" | "addon" | "unknown";
export type Slots = {
  name?: string;
  phone?: string;
  org?: string;
  city?: string;
  system?: string;
  size?: string;
  sector?: "bank" | "hospital" | "gov";
  pack?: "hardware" | "plus";
  intent?: Intent;
  kind?: "product" | "repair" | "quote" | "software";
};

export type Chip = { label: string; send: string };
export type Turn = { reply: string; slots: Slots; chips: Chip[]; navigate?: string; saveLead?: boolean };

const SYSTEMS: { keys: RegExp; slug: string; ar: string; en: string }[] = [
  { keys: /انتظار|طابور|queue|bank queue/, slug: "queuing-system", ar: "نظام انتظار العملاء", en: "queue management" },
  { keys: /ممر|مستشفى|nurse|hospital/, slug: "nurse-call-system", ar: "استدعاء الممرضات", en: "nurse call" },
  { keys: /كيوسك|kiosk/, slug: "self-service-kiosks", ar: "الكيوسك", en: "self-service kiosks" },
];

function intentOf(text: string): Intent {
  const t = text.toLowerCase();
  if (/عطل|خربان|مش شغال|down|broken|stuck|jam|تصليح|صيانة|repair/.test(t)) return "repair";
  if (/رول|ورق|قطع|spare|ribbon|كارت|شريط|مزود|سلك/.test(t)) return "spare";
  if (/برنامج|ربح|قاعدة بيانات|نشاط|إضافة|software|add-?on|profit|insights|تتبع عملاء/.test(t)) return "addon";
  if (/انتظار|كيوسك|ممر|نظام|فرع|queue|nurse|kiosk|hardware/.test(t)) return "system";
  return "unknown";
}

function phoneOf(text: string) {
  const m = text.replace(/[^\d+]/g, " ").match(/(\+?20)?0?1[0-25]\d{8}/);
  return m ? m[0] : undefined;
}

function pickSystem(text: string) {
  const hit = SYSTEMS.find((s) => s.keys.test(text.toLowerCase()));
  return hit?.slug;
}

function sectorOf(text: string): Slots["sector"] | undefined {
  const t = text.toLowerCase();
  if (/بنك|bank/.test(t)) return "bank";
  if (/مستشفى|عياد|hospital/.test(t)) return "hospital";
  if (/حكوم|مرور|تموين|gov/.test(t)) return "gov";
  return undefined;
}

export function nextTurn(locale: Locale, text: string, prev: Slots, pagePath: string): Turn {
  const ar = locale === "ar";
  const slots: Slots = { ...prev };
  const trimmed = text.trim();
  const low = trimmed.toLowerCase();
  slots.intent = intentOf(trimmed) === "unknown" ? slots.intent || "unknown" : intentOf(trimmed);
  if (pickSystem(trimmed)) slots.system = pickSystem(trimmed);
  if (sectorOf(trimmed)) slots.sector = sectorOf(trimmed);
  if (phoneOf(trimmed)) slots.phone = phoneOf(trimmed);
  if (!slots.name && /اسمي|my name|أنا /.test(low)) {
    slots.name = trimmed.replace(/اسمي[:\s]*|my name is/i, "").slice(0, 40);
  }
  if (/جه[ةه]|شرك|بنك|مستشفى|org|company/.test(low) && trimmed.length < 50 && !phoneOf(trimmed)) {
    if (!slots.org && slots.intent !== "unknown") slots.org = trimmed;
  }
  if (/hardware only|أجهزة فقط|بدون برنامج/.test(low)) slots.pack = "hardware";
  if (/plus|إضافة|برنامج|software/.test(low)) slots.pack = slots.pack || "plus";

  const acc = matchAccessory(trimmed);
  const href = (p: string) => localizedHref(locale, p);

  const chips = (items: Chip[]): Chip[] => items;

  if (!trimmed) {
    return {
      reply: ar
        ? "أهلاً، معك خدمة عملاء كيوسيرف مصر. تحب نظام انتظار أو استدعاء ممرضات أو كيوسك، ولا قطعة غيار/صيانة، ولا الإضافة البرمجية اللي بتتبّع عملاء فرعك؟"
        : "Hi — Qserve Egypt customer service. Are you looking for a queue, nurse-call or kiosk system, a spare/repair, or the software add-on that tracks your branch customers?",
      slots,
      chips: chips(
        ar
          ? [
              { label: "نظام جديد", send: "عايز نظام انتظار لفرع" },
              { label: "الكيوسك واقف", send: "الكيوسك مش شغال" },
              { label: "قطعة غيار", send: "محتاج رول حراري" },
              { label: "إضافة البرنامج", send: "عايز الإضافة البرمجية المخصّصة" },
            ]
          : [
              { label: "New system", send: "I need a queue system for a branch" },
              { label: "Kiosk is down", send: "Our kiosk is not working" },
              { label: "Spare part", send: "I need thermal ticket rolls" },
              { label: "Software add-on", send: "Tell me about the customized software add-on" },
            ],
      ),
    };
  }

  if (acc) {
    const name = ar ? acc.nameAr : acc.nameEn;
    const unit = ar ? acc.unitAr : acc.unitEn;
    slots.kind = "product";
    slots.intent = "spare";
    return {
      reply: ar
        ? `${name} نبيعه عادة بحوالي ${acc.sellUsd} دولار / ${unit} (ضعف سعر التوريد). تحب أفتح طلب قطع غيار، ولا النظام كامل؟ أسعار الأنظمة الكاملة بعد دراسة الموقع — مش سلة.`
        : `${name} typically sells around USD ${acc.sellUsd} per ${unit} (2× supply cost). I can open a spare-parts request, or a full-system quote after a site survey — no fake cart.`,
      slots,
      chips: chips(
        ar
          ? [
              { label: "طلب قطعة", send: "نعم أطلب هذه القطعة" },
              { label: "عرض سعر نظام", send: "أريد عرض سعر للنظام" },
            ]
          : [
              { label: "Order this spare", send: "Please quote this spare" },
              { label: "System quote", send: "I want a system quote" },
            ],
      ),
    };
  }

  if (slots.intent === "repair") {
    slots.kind = "repair";
    return {
      reply: ar
        ? "فاهم — الجهاز واقف عندك. غالباً ورق، قاطع، مزود 24 فولت، أو رأس طباعة. وصف سريع للعطل وأفتح لك نموذج صيانة. لو عرفنا القطعة نقدر نسعّرها من قائمة الإكسسوار (ضعف التوريد)."
        : "Got it — the unit is down. Usually paper, cutter, 24V PSU, or print head. Tell me the symptom and I’ll open a repair form. Known spares use the 2× accessory list; we don’t invent system prices.",
      slots,
      navigate: href("/repair"),
      chips: chips(
        ar
          ? [
              { label: "نموذج صيانة", send: "افتح الصيانة" },
              { label: "رول / طابعة", send: "محتاج رول حراري" },
            ]
          : [
              { label: "Repair form", send: "Open repair" },
              { label: "Paper / printer", send: "I need thermal rolls" },
            ],
      ),
    };
  }

  if (slots.intent === "addon" || /إضافة|برنامج|software/.test(low)) {
    slots.kind = "software";
    slots.pack = "plus";
    return {
      reply: ar
        ? "الإضافة البرمجية مش برنامج واحد للجميع. بعد تركيب الانتظار أو الكيوسك أو الممرضات، نضبط لفرعكم: بنك أو مستشفى أو جهة حكومية — حقول مختلفة، مؤشرات مختلفة، ونصائح ربح خاصة بكم. البرنامج يتتبع عملاء فرعكم ويبني قاعدة بياناتهم ويقترح كيف تربحوا أكثر. تحب تشوف لوحات العيّنة؟"
        : "The software is a per-client add-on, not one generic app. After queue, kiosk or nurse-call hardware, we tailor fields, KPIs and profit tips for a bank, hospital or government site. It tracks your branch customers, stores them, and suggests how to earn more. Want the sample dashboards?",
      slots,
      navigate: href("/insights"),
      chips: chips(
        ar
          ? [
              { label: "شوف بنك", send: "لوحة البنك" },
              { label: "أجهزة + إضافة", send: "أريد أجهزة والإضافة المخصّصة" },
              { label: "أجهزة فقط", send: "أجهزة فقط بدون برنامج" },
            ]
          : [
              { label: "Bank sample", send: "Show the bank dashboard" },
              { label: "Hardware + add-on", send: "Hardware plus the customized add-on" },
              { label: "Hardware only", send: "Hardware only, no software" },
            ],
      ),
    };
  }

  if (/لوحة البنك|bank dashboard/.test(low)) {
    return { reply: ar ? "بفتح عيّنة فرع بنك — لاحظ إنها إعداد مختلف عن المستشفى." : "Opening the bank sample — it is a different setup from the hospital.", slots, navigate: href("/insights"), chips: [] };
  }

  if (slots.pack === "hardware" || slots.pack === "plus" || slots.intent === "system") {
    slots.kind = "quote";
    if (!slots.system) slots.system = "queuing-system";
    if (!slots.phone && /عرض سعر|quote|واتساب/.test(low)) {
      return {
        reply: ar
          ? "تمام. للعرض نحتاج موبايل عشان نفتح واتساب. ابعت رقمك، ومعاه المدينة وعدد الشبابيك أو الأسرة لو جاهز."
          : "Sure. A quote needs a mobile number so we can open WhatsApp. Please send your phone, plus city and window/bed count if you have them.",
        slots,
        chips: [],
      };
    }
    if (slots.phone) {
      const pack = slots.pack === "plus" ? (ar ? "أجهزة + إضافة مخصّصة" : "hardware + tailored add-on") : ar ? "أجهزة فقط" : "hardware only";
      const q = new URLSearchParams({
        pack: slots.pack || "hardware",
        system: slots.system || "",
        phone: slots.phone,
        sector: slots.sector || "",
        name: slots.name || "",
        org: slots.org || "",
      });
      return {
        reply: ar
          ? `سجّلت الطلب كـ ${pack}. بفتح نموذج العرض — المهندس يرد بدراسة موقع، من غير سعر وهمي للنظام الكامل.`
          : `Logged as ${pack}. Opening the quote form — an engineer does a site survey; we don’t fake a full-system price.`,
        slots,
        navigate: `${href("/quote")}?${q.toString()}`,
        saveLead: true,
        chips: [],
      };
    }
    return {
      reply: ar
        ? `${SYSTEMS.find((s) => s.slug === slots.system)?.ar || "النظام"} يتركّب حسب الفرع. تقدر تطلب أجهزة فقط، أو أجهزة + إضافة برمجية مخصّصة لعملائكم. تحب صفحة النظام، ولا نكمّل عرض سعر؟`
        : `${SYSTEMS.find((s) => s.slug === slots.system)?.en || "The system"} is quoted per site. Hardware only, or hardware plus a tailored software add-on. Want the product page, or a quote when you’re ready?`,
      slots,
      chips: chips(
        ar
          ? [
              { label: "صفحة النظام", send: "افتح صفحة النظام" },
              { label: "أجهزة + برنامج", send: "أريد أجهزة والإضافة المخصّصة" },
              { label: "أجهزة فقط", send: "أجهزة فقط بدون برنامج" },
            ]
          : [
              { label: "Product page", send: "Open the system page" },
              { label: "Hardware + software", send: "Hardware plus the customized add-on" },
              { label: "Hardware only", send: "Hardware only, no software" },
            ],
      ),
    };
  }

  if (/افتح صفحة النظام|open the system/.test(low) && slots.system) {
    return { reply: ar ? "حاضر، صفحة النظام." : "Opening the system page.", slots, navigate: href(`/${slots.system}`), chips: [] };
  }

  return {
    reply: ar
      ? "قولّي بصراحة: فرع جديد، صيانة، قطعة غيار، ولا الإضافة اللي بتتبع عملاء الفرع؟ هشرح بالراحة ومن غير ضغط."
      : "Tell me in your words: new branch, repair, spare, or the add-on that tracks your customers? I’ll explain plainly — no hard sell.",
    slots,
    chips: chips(
      ar
        ? [
            { label: "فرع جديد", send: "عايز نظام انتظار لفرع" },
            { label: "صيانة", send: "الكيوسك مش شغال" },
            { label: "إضافة البرنامج", send: "عايز الإضافة البرمجية المخصّصة" },
          ]
        : [
            { label: "New branch", send: "I need a queue system for a branch" },
            { label: "Repair", send: "Our kiosk is not working" },
            { label: "Software add-on", send: "Tell me about the customized software add-on" },
          ],
    ),
  };
}

export function accessoryHint(locale: Locale) {
  const top = accessorySell.slice(0, 4);
  return locale === "ar"
    ? top.map((a) => `${a.nameAr}: ${a.sellUsd}$ / ${a.unitAr}`).join(" · ")
    : top.map((a) => `${a.nameEn}: $${a.sellUsd}/${a.unitEn}`).join(" · ");
}
