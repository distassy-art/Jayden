export const SHIP_IDS = ["eg-cairo", "eg-gov", "me-uae", "me-sar", "me-qat", "me-kwt", "me-gcc"];

export function inferShipId(text) {
  const t = String(text || "");
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

export function inferPartner(text) {
  const t = String(text || "");
  if (/بدون شريك|من غير شريك|no partner|ship only|شحن فقط|بدون تركيب/i.test(t)) return false;
  if (/شريك محلي|third.?party|local partner|تركيب بواسطة|partner install|install by (a )?local/i.test(t)) return true;
  return null;
}

export function shipGroup(id) {
  if (!id) return "";
  return String(id).startsWith("eg-") ? "egypt" : String(id).startsWith("me-") ? "me" : "";
}
