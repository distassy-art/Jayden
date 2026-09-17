export type Locale = "ar" | "en";

export const DEMO_ORIGIN = "https://qserve-ai-egypt-demo.netlify.app";

export function isEnPath(pathname: string) {
  return pathname === "/en" || pathname.startsWith("/en/");
}

export function stripLocale(pathname: string) {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname || "/";
}

export function localizedHref(locale: Locale, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (locale === "en") return p === "/" ? "/en" : `/en${p}`;
  return p;
}

export function switchLocaleHref(locale: Locale, path: string) {
  return localizedHref(locale === "ar" ? "en" : "ar", path);
}

export function hreflang(path: string) {
  const bare = stripLocale(path);
  const ar = `${DEMO_ORIGIN}${bare === "/" ? "" : bare}`;
  const en = `${DEMO_ORIGIN}${bare === "/" ? "/en" : `/en${bare}`}`;
  const canonical = isEnPath(path) ? en : ar;
  return {
    canonical,
    languages: { ar, en, "x-default": ar },
  };
}

export const ui = {
  ar: {
    demoBanner: "عرض تجريبي — QServe AI",
    home: "الرئيسية",
    systems: "الأنظمة",
    products: "المنتجات",
    projects: "المشاريع",
    factory: "عن QServe AI",
    contact: "تواصل",
    software: "كيوسيرف بصيرة",
    quote: "طلب عرض سعر",
    quoteNow: "طلب عرض سعر الآن",
    trySystems: "جرّب الأنظمة",
    whatsapp: "واتساب",
    privacy: "خصوصية",
    terms: "شروط",
    heroKicker: "QServe AI",
    heroTitle: "أنظمة انتظار العملاء",
    heroAccent: "استدعاء ممرضات وكيوسك",
    heroBody: "QServe AI يصمّم أنظمة الدور، نداء الممرضات، والكيوسك للبنوك والمستشفيات والجهات الحكومية. اطلب عرض السعر على واتساب.",
    systemsTitle: "الأنظمة",
    systemsBody: "كل نظام طلب عرض سعر على واتساب — بدون أسعار على الموقع.",
    softwareAddOn: "إضافة برمجية",
    softwareTileBody: "إضافة برمجية للفرع بعد الأجهزة: تقارير وتشغيل حسب البنك أو المستشفى أو الجهة.",
    queuePreview: "شاشة الانتظار",
    storiesKicker: "الأنظمة",
    storiesTitle: "الأنظمة",
    storiesCta: "طلب عرض سعر",
    openSystem: "تفاصيل النظام",
    askQuote: "طلب عرض سعر",
    ctaTitle: "فرع جديد؟ مستشفى؟ جهة حكومية؟",
    ctaBody: "مهندسو QServe AI Egypt يردّون بدراسة وعرض سعر على واتساب. الهاتف مطلوب.",
    startQuote: "ابدأ طلب العرض",
    seeInstalls: "شوف التركيبات",
    footerBlurb:
      "QServe AI — أنظمة انتظار وكيوسك. هذا عرض تجريبي وليس الموقع الحي.",
    footerLegal: "عرض تجريبي — QServe AI",
    liveNow: "الرقم الحالي",
    window: "شباك الخدمة",
    tryKiosk: "جرّب الكيوسك — اختر خدمة",
    ticket: "تذكرتك",
    ticketHint: "هذا عرض تفاعلي — اطلب النظام الحقيقي من زر عرض السعر",
    services: [
      { id: "A", label: "خدمة العملاء" },
      { id: "B", label: "الحسابات" },
      { id: "C", label: "الاستعلامات" },
    ],
    ticker: [] as string[],
    chips: [] as string[],
    quotePageTitle: "طلب عرض سعر",
    quotePageBody: "QServe AI — واتساب. مفيش سعر على الموقع.",
    name: "الاسم",
    phone: "الموبايل *",
    org: "الجهة",
    system: "النظام",
    choose: "اختر",
    count: "عدد الشبابيك / الأسرة",
    city: "المدينة",
    details: "التفاصيل",
    sendWa: "إرسال عبر واتساب",
    quoteSent: "تم تجهيز واتساب.",
    askThis: "اطلب هذا النظام",
    notCart: "كل البنود طلب عرض سعر على واتساب.",
    aboutTitle: "عن QServe AI",
    aboutBody:
      "QServe AI يصمّم أنظمة الانتظار واستدعاء الممرضات. الاسم في الترويسة: QServe AI.",
    contactTitle: "تواصل مع QServe AI",
    contactBody: "دراسة وعرض سعر — ليست سلة.",
    projectsTitle: "المشاريع",
    projectsBody: "تركيبات كيوسيرف مصر — مرّر واستكشف.",
    notFound: "الصفحة غير موجودة",
    address: "القاهرة، مصر",
    hours: "السبت — الخميس: 9:00 صباحاً — 6:00 مساءً",
    hoursOff: "الجمعة: عطلة",
    privacyTitle: "سياسة الخصوصية",
    privacyBody: "تجمع كيوسيرف مصر بيانات طلب العرض للرد عبر الهاتف أو واتساب. هذا عرض تجريبي.",
    termsTitle: "الشروط والأحكام",
    termsBody: "عروض كيوسيرف مصر خاصة بكل منشأة. هذا التجريبي لطلب أسعار وليس للبيع الإلكتروني.",
  },
  en: {
    demoBanner: "Demo — QServe AI",
    home: "Home",
    systems: "Systems",
    products: "Products",
    projects: "Projects",
    factory: "About QServe AI",
    contact: "Contact",
    software: "Qserve Basira",
    quote: "Request a quote",
    quoteNow: "Request a quote now",
    trySystems: "Try the systems",
    whatsapp: "WhatsApp",
    privacy: "Privacy",
    terms: "Terms",
    heroKicker: "QServe AI",
    heroTitle: "Queue management",
    heroAccent: "Nurse call and kiosks",
    heroBody: "QServe AI designs queue, nurse-call, and kiosk systems for banks, hospitals, and government. Request the quote on WhatsApp.",
    systemsTitle: "Systems",
    systemsBody: "Every system is a WhatsApp quote request — no prices on the site.",
    softwareAddOn: "Software add-on",
    softwareTileBody: "A branch software add-on after hardware: reports and operations for banks, hospitals, or government.",
    queuePreview: "Queue display",
    storiesKicker: "Systems",
    storiesTitle: "Systems",
    storiesCta: "Request a quote",
    openSystem: "System details",
    askQuote: "Request a quote",
    ctaTitle: "New branch? Hospital? Government site?",
    ctaBody: "QServe AI Egypt engineers reply with a survey and quote on WhatsApp. Phone is required.",
    startQuote: "Start a quote",
    seeInstalls: "See installations",
    footerBlurb:
      "QServe AI — queue and kiosk systems. Interactive demo, not the live website.",
    footerLegal: "Demo — QServe AI",
    liveNow: "Now serving",
    window: "Counter",
    tryKiosk: "Try the kiosk — pick a service",
    ticket: "Your ticket",
    ticketHint: "Interactive demo — request the real system with the quote button",
    services: [
      { id: "A", label: "Customer service" },
      { id: "B", label: "Accounts" },
      { id: "C", label: "Inquiries" },
    ],
    ticker: [] as string[],
    chips: [] as string[],
    quotePageTitle: "Request a quote",
    quotePageBody: "QServe AI — WhatsApp. No prices on the site.",
    name: "Name",
    phone: "Mobile *",
    org: "Organization",
    system: "System",
    choose: "Select",
    count: "Windows / beds / units",
    city: "City",
    details: "Details",
    sendWa: "Send via WhatsApp",
    quoteSent: "WhatsApp message is ready.",
    askThis: "Quote this system",
    notCart: "Every line is a quote request on WhatsApp.",
    aboutTitle: "About QServe AI",
    aboutBody:
      "QServe AI designs queue and nurse-call systems. Header name: QServe AI.",
    contactTitle: "Contact QServe AI",
    contactBody: "Survey and quote — not a cart.",
    projectsTitle: "Projects",
    projectsBody: "Qserve Egypt installations — scroll and explore.",
    notFound: "Page not found",
    address: "Cairo, Egypt",
    hours: "Sat–Thu 9:00–18:00",
    hoursOff: "Friday closed",
    privacyTitle: "Privacy policy",
    privacyBody: "Qserve Egypt collects quote-request data to reply by phone or WhatsApp. This is a demo.",
    termsTitle: "Terms",
    termsBody: "Qserve Egypt quotes are per site. This demo is for quotes, not ecommerce checkout.",
  },
} as const;
