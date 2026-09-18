export type Locale = "ar" | "en";

export const DEMO_ORIGIN = "https://www.qserveai.com";

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
    demoBanner: "كيوسيرف مصر",
    home: "الرئيسية",
    systems: "الأنظمة",
    products: "المنتجات",
    projects: "المشاريع",
    factory: "عن كيوسيرف",
    contact: "تواصل",
    software: "كيوسيرف بصيرة",
    quote: "طلب عرض سعر",
    quoteNow: "طلب عرض سعر الآن",
    trySystems: "جرّب الأنظمة",
    whatsapp: "واتساب",
    privacy: "خصوصية",
    terms: "شروط",
    heroKicker: "كيوسيرف مصر",
    heroTitle: "كيوسيرف — نظام انتظار العملاء في مصر",
    heroAccent: "رقم، شاشة، شباك — ثم طلب عرض سعر على واتساب.",
    heroBody:
      "كيوسيرف (كيو سيرف / QServe) في مصر يركّب نظام انتظار العملاء وشاشات انتظار، استدعاء الممرضات، وكيوسك / أجهزة الخدمات الذاتية. انظمة انتظار العملاء في مصر للبنوك والمستشفيات والجهات — اطلب عرض سعر على واتساب.",
    systemsTitle: "الأنظمة",
    systemsBody: "انظمة انتظار العملاء، شاشات انتظار، استدعاء الممرضات، وكيوسك في مصر.",
    softwareAddOn: "إضافة برمجية",
    softwareTileBody: "إضافة برمجية للفرع بعد الأجهزة: تقارير وتشغيل حسب البنك أو المستشفى أو الجهة.",
    queuePreview: "شاشة الانتظار",
    storiesKicker: "الأنظمة",
    storiesTitle: "الأنظمة",
    storiesCta: "طلب عرض سعر",
    openSystem: "تفاصيل النظام",
    askQuote: "طلب عرض سعر",
    ctaTitle: "فرع جديد؟ مستشفى؟ جهة حكومية؟",
    ctaBody: "كيوسيرف مصر يرد بدراسة وعرض سعر على واتساب.",
    startQuote: "ابدأ طلب العرض",
    seeInstalls: "شوف التركيبات",
    footerBlurb: "كيوسيرف — نظام انتظار العملاء في مصر. كيوسك وشاشات انتظار واستدعاء الممرضات. طلب عرض سعر على واتساب.",
    footerLegal: "كيوسيرف · www.qserveai.com",
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
    quotePageBody: "كيوسيرف — واتساب. مفيش سعر على الموقع.",
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
    aboutTitle: "عن كيوسيرف",
    aboutKicker: "كيوسيرف",
    aboutH1: "كيوسيرف — نظام انتظار العملاء في مصر.",
    aboutLead:
      "كيوسيرف على www.qserveai.com يجهّز الفرع أو المستشفى: نظام انتظار العملاء، شاشات انتظار، استدعاء الممرضات، وكيوسك / أجهزة الخدمات الذاتية — ثم عرض سعر على واتساب.",
    aboutStory:
      "المشتري ليس بحاجة لكتالوج أجهزة. يحتاج مسار خدمة واضح: من وصول العميل إلى إنهاء المعاملة، أو من زر السرير إلى محطة التمريض. نصمّم هذا المسار، نحدد العدد بعد المعاينة، ونرسل عرض السعر — بدون سلة وبدون سعر على الموقع.",
    aboutWorkTitle: "ماذا نركّب",
    aboutQueueTitle: "نظام انتظار العملاء",
    aboutQueueBody: "تذكرة من كيوسك أو موزّع، شاشة في الصالة، نداء على الشباك، وتقرير لليوم. للبنوك والجهات الحكومية وعيادات الانتظار.",
    aboutNurseTitle: "استدعاء الممرضات",
    aboutNurseBody: "نداء من السرير إلى شاشة المحطة، مع تمييز الحالة العاجلة. تركيب وصيانة للمستشفيات والمراكز في مصر.",
    aboutKioskTitle: "كيوسك الخدمة الذاتية",
    aboutKioskBody: "مدخل الفرع: إصدار رقم، استعلام، أو طلب ودفع. يتكامل مع نظام الانتظار — ليس جهازاً معلّقاً وحده.",
    aboutReachTitle: "مصر والشرق الأوسط",
    aboutEgyptTitle: "داخل مصر",
    aboutEgyptBody: "معاينة للموقع، ثم توريد وتركيب بأنظمة الانتظار والكيوسك وشاشات 32 بوصة. ساعات العمل سبت–خميس 9–6 — ليست خدمة 24/7.",
    aboutMeTitle: "الخليج والشرق الأوسط",
    aboutMeBody: "الشحن من مصر بعد تقدير، ثم عرض شحن. التركيب عبر شريك محلي إن طُلب — فريق كيوسيرف لا يسافر افتراضياً.",
    aboutStepsTitle: "كيف يصدر العرض",
    aboutSteps: [
      "تحدد النظام: انتظار، نداء ممرضات، أو كيوسك.",
      "ترسل المدينة وعدد الشبابيك أو الأسرة على واتساب.",
      "نرجع بدراسة وعرض سعر — الهاتف مطلوب.",
    ] as string[],
    aboutCtaTitle: "فرع جديد؟ مستشفى؟ جهة في الخليج؟",
    aboutCtaBody: "اطلب عرض السعر على واتساب. نرد خلال ساعات العمل.",
    contactTitle: "تواصل مع كيوسيرف",
    contactBody: "دراسة وعرض سعر — ليست سلة.",
    projectsTitle: "المشاريع",
    projectsBody: "تركيبات كيوسيرف مصر — مرّر واستكشف.",
    notFound: "الصفحة غير موجودة",
    address: "القاهرة، مصر",
    hours: "السبت — الخميس: 9:00 صباحاً — 6:00 مساءً",
    hoursOff: "الجمعة: عطلة",
    privacyTitle: "سياسة الخصوصية",
    privacyBody: "تجمع كيوسيرف مصر بيانات طلب العرض للرد عبر الهاتف أو واتساب.",
    termsTitle: "الشروط والأحكام",
    termsBody: "عروض كيوسيرف مصر خاصة بكل منشأة. الموقع لطلب عرض سعر وليس للبيع الإلكتروني.",
  },
  en: {
    demoBanner: "QServe Egypt",
    home: "Home",
    systems: "Systems",
    products: "Products",
    projects: "Projects",
    factory: "About QServe",
    contact: "Contact",
    software: "Qserve Basira",
    quote: "Request a quote",
    quoteNow: "Request a quote now",
    trySystems: "Try the systems",
    whatsapp: "WhatsApp",
    privacy: "Privacy",
    terms: "Terms",
    heroKicker: "QSERVE",
    heroTitle: "QServe — queue management system Egypt",
    heroAccent: "Ticket, display, counter — then a WhatsApp quote.",
    heroBody:
      "QServe (QSERVE) in Egypt installs a queue management system Egypt, waiting displays, a nurse call system Egypt, and self service kiosk Egypt. Request a quote on WhatsApp.",
    systemsTitle: "Systems",
    systemsBody: "Queue management, nurse call, and self-service kiosks in Egypt.",
    softwareAddOn: "Software add-on",
    softwareTileBody: "A branch software add-on after hardware: reports and operations for banks, hospitals, or government.",
    queuePreview: "Queue display",
    storiesKicker: "Systems",
    storiesTitle: "Systems",
    storiesCta: "Request a quote",
    openSystem: "System details",
    askQuote: "Request a quote",
    ctaTitle: "New branch? Hospital? Government site?",
    ctaBody: "QServe Egypt replies with a survey and quote on WhatsApp.",
    startQuote: "Start a quote",
    seeInstalls: "See installations",
    footerBlurb:
      "QServe — queue management system Egypt. Nurse call system Egypt and self service kiosk Egypt. Quote on WhatsApp.",
    footerLegal: "QServe · www.qserveai.com",
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
    quotePageBody: "QServe — WhatsApp. No prices on the site.",
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
    aboutTitle: "About QServe",
    aboutKicker: "QServe",
    aboutH1: "QServe — queue management system Egypt.",
    aboutLead:
      "QServe on www.qserveai.com equips a branch or hospital: queue management system Egypt, waiting displays, nurse call system Egypt, and self service kiosk Egypt — then a WhatsApp quote.",
    aboutStory:
      "Buyers do not need a gadget catalog. They need a service path: from arrival to the counter, or from the bed button to the nurse station. We design that path, size it after a survey, and send a quote — no cart, no prices on the site.",
    aboutWorkTitle: "What we install",
    aboutQueueTitle: "Queue management",
    aboutQueueBody: "Kiosk or dispenser ticket, waiting-room display, counter call, and a daily report. Banks, government desks, and clinic waiting rooms.",
    aboutNurseTitle: "Nurse call",
    aboutNurseBody: "Bedside call to the nurse-station screen, with an urgent flag. Install and care for hospitals and clinics in Egypt.",
    aboutKioskTitle: "Self-service kiosks",
    aboutKioskBody: "The branch door: ticket, inquiry, or order and pay. It joins the queue system — not a screen hanging on its own.",
    aboutReachTitle: "Egypt and the Middle East",
    aboutEgyptTitle: "Inside Egypt",
    aboutEgyptBody: "A site survey, then supply and install for queue systems, kiosks, and 32-inch displays. Hours Sat–Thu 9–6 — not 24/7.",
    aboutMeTitle: "GCC and the wider Middle East",
    aboutMeBody: "Freight from Egypt after an estimate, then a shipping quote. Optional local-partner install — QServe staff do not fly by default.",
    aboutStepsTitle: "How the quote is issued",
    aboutSteps: [
      "Pick the system: queue, nurse call, or kiosk.",
      "Send the city and window or bed count on WhatsApp.",
      "We reply with a survey and quote — a phone number is required.",
    ] as string[],
    aboutCtaTitle: "New branch? Hospital? A GCC site?",
    aboutCtaBody: "Request the quote on WhatsApp. We reply during business hours.",
    contactTitle: "Contact QServe",
    contactBody: "Survey and quote — not a cart.",
    projectsTitle: "Projects",
    projectsBody: "Qserve Egypt installations — scroll and explore.",
    notFound: "Page not found",
    address: "Cairo, Egypt",
    hours: "Sat–Thu 9:00–18:00",
    hoursOff: "Friday closed",
    privacyTitle: "Privacy policy",
    privacyBody: "QServe Egypt collects quote-request data to reply by phone or WhatsApp.",
    termsTitle: "Terms",
    termsBody: "QServe Egypt quotes are per site. This site is for quotes, not ecommerce checkout.",
  },
} as const;
