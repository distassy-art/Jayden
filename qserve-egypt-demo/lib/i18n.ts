export type Locale = "ar" | "en";

export const DEMO_ORIGIN = "https://qserve-egypt-demo.pages.dev";

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
    demoBanner: "عرض تجريبي — QServe AI Egypt · ليس الموقع الحي www.yallastore.com",
    home: "الرئيسية",
    systems: "الأنظمة",
    products: "المنتجات",
    projects: "المشاريع",
    factory: "المصنع",
    contact: "تواصل",
    software: "كيوسيرف بصيرة",
    quote: "طلب عرض سعر",
    quoteNow: "طلب عرض سعر الآن",
    trySystems: "جرّب الأنظمة",
    whatsapp: "واتساب",
    privacy: "خصوصية",
    terms: "شروط",
    heroKicker: "مصنع حي · القاهرة الجديدة",
    heroTitle: "الدور يتحرك.",
    heroAccent: "Q AI يشغّله.",
    heroBody:
      "أنظمة انتظار واستدعاء ممرضات وكيوسك من مصنع القاهرة الجديدة. الروبوت Q AI يسأل ويملأ السلة قدامك. واتساب للعرض — ليس yallastore.com.",
    storiesKicker: "قصص الأنظمة — اضغط للتجربة",
    storiesTitle: "اختَر نظاماً وشوف القصة",
    storiesCta: "حوّل القصة لعرض سعر",
    openSystem: "افتح صفحة النظام",
    askQuote: "اطلب عرض سعر",
    ctaTitle: "فرع جديد؟ مستشفى؟ جهة حكومية؟",
    ctaBody: "مهندسو QServe AI Egypt يردّون بدراسة وعرض سعر على واتساب. الهاتف مطلوب.",
    startQuote: "ابدأ طلب العرض",
    seeInstalls: "شوف التركيبات",
    footerBlurb:
      "QServe AI Egypt — مصنع أنظمة الانتظار والكيوسك في القاهرة الجديدة. Q AI الروبوت ذو تذكرة 01. هذا عرض تجريبي وليس الموقع الحي.",
    footerLegal: "عرض تجريبي — QServe AI Egypt · لا يُنشر على www.yallastore.com بعد",
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
    ticker: [
      "نظام انتظار العملاء",
      "استدعاء الممرضات",
      "كيوسك بنكي",
      "ساعات مركزية",
      "لافتات رقمية",
      "تقييم خدمة",
      "خرائط تفاعلية",
      "إضافة برمجية للفرع",
    ],
    chips: ["مصنع في القاهرة الجديدة", "ضمان سنتين + قطع غيار محلية", "تركيب فريق كيوسيرف داخل مصر حسب العرض", "دعم هندسي متخصص"],
    quotePageTitle: "طلب عرض سعر",
    quotePageBody: "QServe AI Egypt — واتساب + هاتف مطلوب. السلة ثم عرض سعر، لا كارت.",
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
    notCart: "الأنظمة بند عرض سعر. الشاشات والكابلات تُضاف للسلة الحية بسعر 2×.",
    aboutTitle: "المصنع",
    aboutBody:
      "نصمّم ونصنّع أنظمة الانتظار واستدعاء الممرضات في القاهرة الجديدة. الاسم في الترويسة: QServe AI Egypt / Q AI.",
    contactTitle: "تواصل مع المصنع",
    contactBody: "دراسة وعرض سعر — ليست سلة.",
    projectsTitle: "المشاريع",
    projectsBody: "تركيبات كيوسيرف مصر — مرّر واستكشف.",
    notFound: "الصفحة غير موجودة",
    address: "المنطقة الصناعية - منطقة 1000 مصنع، التجمع الثالث، القاهرة الجديدة، القاهرة، مصر",
    hours: "السبت — الخميس: 9:00 صباحاً — 6:00 مساءً",
    hoursOff: "الجمعة: عطلة",
    privacyTitle: "سياسة الخصوصية",
    privacyBody: "تجمع كيوسيرف مصر بيانات طلب العرض للرد عبر الهاتف أو واتساب. هذا عرض تجريبي.",
    termsTitle: "الشروط والأحكام",
    termsBody: "عروض كيوسيرف مصر خاصة بكل منشأة. هذا التجريبي لطلب أسعار وليس للبيع الإلكتروني.",
  },
  en: {
    demoBanner: "DEMO — QServe AI Egypt · not the live site www.yallastore.com",
    home: "Home",
    systems: "Systems",
    products: "Products",
    projects: "Projects",
    factory: "Factory",
    contact: "Contact",
    software: "Qserve Basira",
    quote: "Request a quote",
    quoteNow: "Request a quote now",
    trySystems: "Try the systems",
    whatsapp: "WhatsApp",
    privacy: "Privacy",
    terms: "Terms",
    heroKicker: "Live factory · New Cairo",
    heroTitle: "The queue moves.",
    heroAccent: "Q AI runs it.",
    heroBody:
      "Queue, nurse-call and kiosk systems from the New Cairo factory. The Q AI robot asks questions and fills the live cart. WhatsApp for the quote — not yallastore.com.",
    storiesKicker: "System stories — tap to explore",
    storiesTitle: "Pick a system. See the story.",
    storiesCta: "Turn this into a quote",
    openSystem: "Open system page",
    askQuote: "Request a quote",
    ctaTitle: "New branch? Hospital? Government site?",
    ctaBody: "QServe AI Egypt engineers reply with a survey and quote on WhatsApp. Phone is required.",
    startQuote: "Start a quote",
    seeInstalls: "See installations",
    footerBlurb:
      "QServe AI Egypt — queue and kiosk factory in New Cairo. Q AI is the ticket-01 robot. Interactive demo, not the live website.",
    footerLegal: "Demo — QServe AI Egypt · not published on www.yallastore.com yet",
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
    ticker: [
      "Queue management",
      "Nurse call",
      "Bank kiosks",
      "Master clocks",
      "Digital signage",
      "Service scoring",
      "Wayfinding",
      "Branch software add-on",
    ],
    chips: [
      "Factory in New Cairo",
      "2-year warranty + local spares",
      "QServe installs in Egypt per quote",
      "Specialist engineering support",
    ],
    quotePageTitle: "Request a quote",
    quotePageBody: "QServe AI Egypt — WhatsApp + required phone. Live cart then quote — no card.",
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
    notCart: "Systems are quote lines. Screens and cables go in the live 2× cart.",
    aboutTitle: "The factory",
    aboutBody:
      "We design and manufacture queue and nurse-call systems in New Cairo. Header name: QServe AI Egypt / Q AI.",
    contactTitle: "Contact the factory",
    contactBody: "Survey and quote — not a cart.",
    projectsTitle: "Projects",
    projectsBody: "Qserve Egypt installations — scroll and explore.",
    notFound: "Page not found",
    address: "1000 Factory, Third Settlement, New Cairo, Cairo, Egypt",
    hours: "Sat–Thu 9:00–18:00",
    hoursOff: "Friday closed",
    privacyTitle: "Privacy policy",
    privacyBody: "Qserve Egypt collects quote-request data to reply by phone or WhatsApp. This is a demo.",
    termsTitle: "Terms",
    termsBody: "Qserve Egypt quotes are per site. This demo is for quotes, not ecommerce checkout.",
  },
} as const;
