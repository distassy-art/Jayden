export type Sector = "bank" | "hospital" | "gov";

export const sectors: { id: Sector; ar: string; en: string }[] = [
  { id: "bank", ar: "بنك", en: "Bank" },
  { id: "hospital", ar: "مستشفى", en: "Hospital" },
  { id: "gov", ar: "جهة حكومية", en: "Government" },
];

export const insightsCopy = {
  ar: {
    kicker: "كيوسيرف بصيرة — إضافة مخصّصة",
    title: "كيوسيرف بصيرة: تتبع عملاء فرعك واربح أكثر",
    body: "بعد تركيب نظام الانتظار أو الكيوسك أو استدعاء الممرضات، نضيف برنامجاً يتتبع عملاء فرعك (مش زوّار موقع كيوسيرف): التذاكر، الانتظار، من أكمل الخدمة ومن مشى، وما الذي يتحوّل على الكيوسك. كل بنك أو مستشفى أو جهة حكومية يأخذ حقولاً ومؤشرات ونصائح ربح خاصة به — ليست نسخة واحدة للجميع.",
    hardware: "أجهزة فقط",
    plus: "أجهزة + كيوسيرف بصيرة",
    dashKicker: "لوحة عيّنة — بيانات تجريبية",
    recs: "اقتراحات الربح لهذا العميل",
  },
  en: {
    kicker: "كيوسيرف بصيرة — tailored add-on",
    title: "Qserve Basira: track your branch customers and earn more",
    body: "After the queue, kiosk or nurse-call hardware is in, we add software that tracks *your* customers (not Qserve website visitors): tickets, waits, completed vs walk-away, kiosk conversion. Each bank, hospital or government site gets its own fields, KPIs and profit tips — not one generic app.",
    hardware: "Hardware only",
    plus: "Hardware + كيوسيرف بصيرة",
    dashKicker: "Sample dashboard — demo data",
    recs: "Profit tips for this client",
  },
} as const;

export const dashboards: Record<
  Sector,
  {
    siteAr: string;
    siteEn: string;
    fieldsAr: string[];
    fieldsEn: string[];
    kpis: { ar: string; en: string; value: string; hintAr: string; hintEn: string }[];
    bars: { ar: string; en: string; pct: number }[];
    recsAr: string[];
    recsEn: string[];
  }
> = {
  bank: {
    siteAr: "فرع بنك — مدينة نصر (عيّنة)",
    siteEn: "Bank branch — Nasr City (sample)",
    fieldsAr: ["نوع المعاملة", "رقم الشباك", "أكملت / مشى", "عرض كيوسك"],
    fieldsEn: ["Transaction type", "Counter", "Served / walked away", "Kiosk offer"],
    kpis: [
      { ar: "تذاكر اليوم", en: "Tickets today", value: "412", hintAr: "عملاء الفرع", hintEn: "Branch customers" },
      { ar: "متوسط الانتظار", en: "Avg wait", value: "11 د", hintAr: "الحسابات أطول", hintEn: "Accounts longest" },
      { ar: "مشوا بدون خدمة", en: "Walk-aways", value: "18%", hintAr: "ذروة 12–2", hintEn: "Peak 12–2" },
      { ar: "تحويل كيوسك", en: "Kiosk conversion", value: "34%", hintAr: "كشف حساب + فوري", hintEn: "Statement + instant" },
    ],
    bars: [
      { ar: "خدمة العملاء", en: "Customer service", pct: 92 },
      { ar: "الحسابات", en: "Accounts", pct: 61 },
      { ar: "الودائع", en: "Deposits", pct: 78 },
      { ar: "الكيوسك", en: "Kiosk", pct: 34 },
    ],
    recsAr: [
      "افتح شباك حسابات إضافي من 12 إلى 2 — هنا أعلى مشي بلا خدمة.",
      "على الكيوسك: ادفع كشف الحساب المختصر قبل طباعة التذكرة؛ التحويل يرتفع.",
      "العملاء الذين ينتظرون >15 د يقلّون في الودائع لأجل — روّجها بعد دقيقة 4.",
    ],
    recsEn: [
      "Add an accounts window 12:00–14:00 — that is where walk-aways spike.",
      "On the kiosk, offer a mini-statement before printing a ticket to lift conversion.",
      "After minute 4 of wait, prompt a time-deposit offer — those customers churn less.",
    ],
  },
  hospital: {
    siteAr: "عيادات مستشفى — المعادي (عيّنة)",
    siteEn: "Hospital clinics — Maadi (sample)",
    fieldsAr: ["العيادة", "أول مرة / متابعة", "زمن الاستجابة", "نداء عاجل"],
    fieldsEn: ["Clinic", "New / follow-up", "Response time", "Urgent call"],
    kpis: [
      { ar: "مرضى اليوم", en: "Patients today", value: "286", hintAr: "قاعدة بيانات الزيارة", hintEn: "Visit database" },
      { ar: "انتظار العيادة", en: "Clinic wait", value: "23 د", hintAr: "الباطنة الأعلى", hintEn: "Internal med. highest" },
      { ar: "لم يحضروا", en: "No-shows", value: "12%", hintAr: "بعد 10 ص", hintEn: "After 10:00" },
      { ar: "نداء ممرضات", en: "Nurse calls", value: "94", hintAr: "متوسط 4.2 د", hintEn: "Avg 4.2 min" },
    ],
    bars: [
      { ar: "الباطنة", en: "Internal", pct: 55 },
      { ar: "الأطفال", en: "Pediatrics", pct: 71 },
      { ar: "الأسنان", en: "Dental", pct: 88 },
      { ar: "الاستقبال", en: "Reception", pct: 64 },
    ],
    recsAr: [
      "عيادة الباطنة: حوّل المتابعات المستقرة إلى كيوسك تسجيل دخول — يفرّغ الطبيب للحالات الجديدة.",
      "رسائل تذكير قبل الموعد بساعتين تخفض «لم يحضر» في العيادات المسائية.",
      "غرف 3 و7 أعلى نداء عاجل — راجع توزيع التمريض على الوردية لا الإضافة العامة.",
    ],
    recsEn: [
      "Internal medicine: check-in stable follow-ups at a kiosk so doctors keep new cases.",
      "A 2-hour SMS reminder cuts evening no-shows.",
      "Rooms 3 and 7 drive urgent nurse calls — restaff that wing, not the whole floor.",
    ],
  },
  gov: {
    siteAr: "مكتب خدمة حكومي — الجيزة (عيّنة)",
    siteEn: "Government service desk — Giza (sample)",
    fieldsAr: ["نوع المعاملة", "مستند ناقص", "أعاد الزيارة", "شباك متخصص"],
    fieldsEn: ["Service type", "Missing docs", "Return visit", "Specialist window"],
    kpis: [
      { ar: "مراجعون اليوم", en: "Visitors today", value: "640", hintAr: "سجل معاملات", hintEn: "Case database" },
      { ar: "متوسط الدور", en: "Queue time", value: "19 د", hintAr: "الجوازات الأطول", hintEn: "Passports longest" },
      { ar: "ناقص مستند", en: "Incomplete file", value: "27%", hintAr: "يعودون غداً", hintEn: "Come back next day" },
      { ar: "خدمة كيوسك", en: "Kiosk self-serve", value: "22%", hintAr: "استعلام + رقم", hintEn: "Inquiry + ticket" },
    ],
    bars: [
      { ar: "الاستعلامات", en: "Inquiries", pct: 81 },
      { ar: "إصدار", en: "Issuance", pct: 48 },
      { ar: "تظلمات", en: "Appeals", pct: 36 },
      { ar: "الكيوسك", en: "Kiosk", pct: 22 },
    ],
    recsAr: [
      "قائمة مستندات على الكيوسك قبل أخذ الرقم تقلّل الزيارات الناقصة.",
      "شباك «إصدار مكتمل فقط» صباحاً يرفع عدد المعاملات المنتهية.",
      "المراجعون الذين ينتظرون >20 د للتظلم يغادرون — حجز موعد بدل الدور المفتوح.",
    ],
    recsEn: [
      "A document checklist on the kiosk before issuing a ticket cuts incomplete visits.",
      "A morning “complete-file only” window raises finished issuances.",
      "Appeals waiting >20 min walk away — switch them to appointment slots.",
    ],
  },
};
