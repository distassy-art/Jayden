import { dialectOf, dialectVoiceBlock, dialectFallback, DIALECT_BY_CURRENCY } from "../functions/_lib/dialect.js";
import { prepSpeak } from "../functions/_lib/tts.js";
import { systemPrompt, parseActions, inferCartOps } from "../functions/_lib/prompt.js";
import fs from "node:fs";

let failed = 0;
function ok(name, cond, extra = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL", name, extra);
  } else {
    console.log("ok", name);
  }
}

ok("map EGP", dialectOf("EGP") === "eg" && DIALECT_BY_CURRENCY.EGP === "eg");
const block = dialectVoiceBlock("eg");
ok("voice block EGP", typeof block === "string" && block.length > 40);
const prompt = systemPrompt("en", "/", [], "", { currency: "EGP" });
ok("prompt has dialect EGP", prompt.includes(block.slice(0, 24)));
ok("EGP mouth is Egyptian even on /en", /عامية قاهرية|إزيك/.test(prompt) && prompt.includes("حتى لو فتح /en"));
ok("prompt is QServe AI not Cairo factory", /QServe AI/.test(prompt) && !/القاهرة الجديدة/.test(prompt) && !/New Cairo/.test(prompt));
ok("prompt quote only", !/USD \(2×\)/.test(prompt));
ok("EGP fallback spoken", dialectFallback("eg", null).includes("الخط مش ماسك") || dialectFallback("eg", null).includes("ابعت تاني"));

const parsed = parseActions("هلا\nCART_ADD:LCD-215:2\nSHOW_CART\nNAV:/products", "en");
ok("NAV follows site locale en", parsed.navigate === "/en/products");
ok("no freight SKU in cart", parseActions("x\nCART_ADD:INST-EG:1", "ar").cartOps.length === 0);
const screenOps = inferCartOps("three indoor 21.5 screens");
ok("21.5 is not qty 21", !screenOps.some((o) => o.qty === 21));
ok("three 21.5 -> LCD-215 x3", screenOps.some((o) => o.sku === "LCD-215" && o.qty === 3));
ok("prepSpeak egyptian brand", prepSpeak("Q AI HDMI", "eg").includes("كيو"));
ok("eg copy stay-on", dialectVoiceBlock("eg").includes("إزيك"));
ok("eg cairo salesman", /عامية مصرية/.test(dialectVoiceBlock("eg")));
ok("eg forbids MSA news", dialectVoiceBlock("eg").includes("فصحى") && dialectVoiceBlock("eg").includes("معلش"));

const homeSrc = fs.readFileSync(new URL("../components/HomePage.tsx", import.meta.url), "utf8");
const headerSrc = fs.readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
const brandSrc = fs.readFileSync(new URL("../components/BrandLockup.tsx", import.meta.url), "utf8");
const currencySrc = fs.readFileSync(new URL("../lib/currency.ts", import.meta.url), "utf8");
const i18nSrc = fs.readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const contentSrc = fs.readFileSync(new URL("../lib/content.ts", import.meta.url), "utf8");
const quoteSrc = fs.readFileSync(new URL("../lib/quote-wa.ts", import.meta.url), "utf8");
const chromeSrc = fs.readFileSync(new URL("../components/PublicChrome.tsx", import.meta.url), "utf8");
const liveSrc = fs.readFileSync(new URL("../components/LiveQueue.tsx", import.meta.url), "utf8");
const footerSrc = fs.readFileSync(new URL("../components/Footer.tsx", import.meta.url), "utf8");
const aboutSrc = fs.readFileSync(new URL("../components/views/AboutView.tsx", import.meta.url), "utf8");
const contactSrc = fs.readFileSync(new URL("../components/views/ContactView.tsx", import.meta.url), "utf8");
const contactFormSrc = fs.readFileSync(new URL("../components/ContactForm.tsx", import.meta.url), "utf8");
const productViewSrc = fs.readFileSync(new URL("../components/ProductView.tsx", import.meta.url), "utf8");
const enCopySrc = fs.readFileSync(new URL("../lib/en-copy.ts", import.meta.url), "utf8");
const seoFilesSrc = fs.readFileSync(new URL("../functions/_lib/seo-files.js", import.meta.url), "utf8");
const pageMetaSrc = fs.readFileSync(new URL("../lib/page-meta.ts", import.meta.url), "utf8");
const aiSrc = fs.readFileSync(new URL("../netlify/functions/ai.ts", import.meta.url), "utf8");
const arHomeSrc = fs.readFileSync(new URL("../app/(ar)/page.tsx", import.meta.url), "utf8");
const enHomeSrc = fs.readFileSync(new URL("../app/(en)/en/page.tsx", import.meta.url), "utf8");
const arLayoutSrc = fs.readFileSync(new URL("../app/(ar)/layout.tsx", import.meta.url), "utf8");
const publicCopy = `${i18nSrc}\n${contentSrc}\n${homeSrc}\n${aboutSrc}\n${arHomeSrc}\n${enHomeSrc}`;

ok("no public AI chat", !chromeSrc.includes("SalesmanChat") && !chromeSrc.includes("qai-text-launch") && !homeSrc.includes("qai-text-launch") && !headerSrc.includes("SalesmanChat"));
ok("client does not post /api/chat", !homeSrc.includes('fetch("/api/chat"') && !chromeSrc.includes('fetch("/api/chat"'));
ok("no wanderer or talk dock", !chromeSrc.includes("QaiWanderer") && !chromeSrc.includes("TalkButton") && !homeSrc.includes("QaiWanderer"));
ok("wordmark not robot badge", brandSrc.includes("qserve-logo-wordmark.png") && !brandSrc.includes("official-logo.jpg"));
ok("EGP only", currencySrc.includes('CURRENCIES = ["EGP"]') && !headerSrc.includes("CurrencySwitch"));
ok("quote opens WhatsApp with #سعر", quoteSrc.includes("#سعر") && quoteSrc.includes("window.location.href") && headerSrc.includes("QuoteWaButton"));
ok("homepage has no factory chips", !homeSrc.includes("t.chips") && !homeSrc.includes("ProductStories"));
ok("homepage has no stories block", !homeSrc.includes("قصص الأنظمة") && !homeSrc.includes("storiesKicker"));
ok("homepage has no ticker junk", !homeSrc.includes("t.ticker") && !homeSrc.includes("marquee-track") && !homeSrc.includes("✦"));
ok("homepage systems quote tiles", homeSrc.includes("systems.map") && homeSrc.includes("softwareAddOn") && homeSrc.includes("QuoteWaButton"));
ok("queue preview not try-kiosk", liveSrc.includes("queuePreview") && !liveSrc.includes("tryKiosk") && !liveSrc.includes("takeTicket") && !liveSrc.includes("جرّب الكيوسك"));
ok("header has no shop", !headerSrc.includes("/products") && !headerSrc.includes("/cart") && !headerSrc.includes("CartButton"));
ok("chrome has no cart drawer", !chromeSrc.includes("CartDrawer"));
ok("footer no factory branding", !footerSrc.includes("1000") && !footerSrc.includes("t.address"));
ok("no 1000 factory copy on home/about", !i18nSrc.includes("1000 مصنع") && !homeSrc.includes("1000 مصنع") && !aboutSrc.includes("1000 مصنع") && !i18nSrc.includes("1000 Factory"));
ok("contact exact factory address", contentSrc.includes("المنطقة الصناعية - منطقة 1000 مصنع, التجمع الثالث, القاهرة الجديدة, القاهرة") && contentSrc.includes("info@bdcegypt.com") && contentSrc.includes("1000 Factory") && !contentSrc.includes("10000 مصنع"));
ok("contact shows Camp Sheizar", contentSrc.includes("كامب شيزار") && contentSrc.includes("Camp Sheizar") && contactSrc.includes("addressAlexAr"));
ok("contact is BDC-style form", contactSrc.includes("ContactForm") && !contactSrc.includes("QuoteForm") && !contactSrc.includes("t.hours") && contactFormSrc.includes("{t.name}") && contactFormSrc.includes("{t.email}") && contactFormSrc.includes("{t.message}") && contactFormSrc.includes("{t.send}") && !contactFormSrc.includes("t.system") && !contactFormSrc.includes("t.count"));
ok("contact has socials and site maps", contactSrc.includes("t.whatsapp") && contactSrc.includes("YouTube") && contactSrc.includes("Facebook") && contactSrc.includes("site.mapQuery") && contactSrc.includes("site.mapQueryAlex"));
ok("no story-to-quote CTA", !i18nSrc.includes("حوّل القصة لعرض سعر") && !i18nSrc.includes("Turn this into a quote"));
ok("about is a company story", aboutSrc.includes("aboutH1") && aboutSrc.includes("aboutEgyptTitle") && aboutSrc.includes("aboutMeTitle") && aboutSrc.includes("QuoteWaButton") && !aboutSrc.includes("aboutStory"));
ok("about drops gadget-catalog paragraph", !i18nSrc.includes("المشتري ليس بحاجة لكتالوج أجهزة") && !i18nSrc.includes("Buyers do not need a gadget catalog"));
ok("home/about drop then-whatsapp tails", !i18nSrc.includes("ثم عرض سعر على واتساب") && !i18nSrc.includes("ثم طلب عرض سعر على واتساب") && !i18nSrc.includes("then a WhatsApp quote") && !i18nSrc.includes("Request a quote on WhatsApp") && !i18nSrc.includes("اطلب عرض سعر على واتساب"));
ok("contact screenshot copy", i18nSrc.includes('contactTitle: "تواصل معنا"') && i18nSrc.includes('contactTitle: "Contact us"') && i18nSrc.includes("تواصل معنا الآن للحصول على عرض سعر") && i18nSrc.includes("Contact us now for a quote"));
ok("about no yallastore or shop", !aboutSrc.toLowerCase().includes("yallastore") && !aboutSrc.includes("/products") && !aboutSrc.includes("/cart") && !aboutSrc.includes("SalesmanChat"));
ok("header links about", headerSrc.includes('href("/about")') && i18nSrc.includes("عن كيوسيرف"));
ok("no yallastore.com", !i18nSrc.toLowerCase().includes("yallastore") && !contentSrc.toLowerCase().includes("yallastore") && !homeSrc.toLowerCase().includes("yallastore") && !aboutSrc.toLowerCase().includes("yallastore"));
ok("demo origin is www.qserveai.com", i18nSrc.includes('DEMO_ORIGIN = "https://www.qserveai.com"') && !i18nSrc.toLowerCase().includes("yallastore"));
ok("arabic home title", arHomeSrc.includes("كيوسيرف | نظام انتظار العملاء في مصر"));
ok("arabic home h1", i18nSrc.includes('heroTitle: "كيوسيرف — نظام انتظار العملاء في مصر"') && homeSrc.includes("{t.heroTitle}") && !homeSrc.includes("{t.heroTitle}{"));
ok("english home title", enHomeSrc.includes("QServe | Queue management system Egypt"));
ok("english home h1", i18nSrc.includes('heroTitle: "QServe — queue management system Egypt"'));
ok("kept brand terms", i18nSrc.includes("كيوسيرف") && i18nSrc.includes("كيو سيرف") && i18nSrc.includes("QServe") && i18nSrc.includes("QSERVE") && i18nSrc.includes("كيوسيرف مصر"));
ok("kept queue terms", i18nSrc.includes("نظام انتظار العملاء") && i18nSrc.includes("انظمة انتظار العملاء") && i18nSrc.includes("في مصر") && i18nSrc.includes("شاشات انتظار"));
ok("kept nurse and kiosk", i18nSrc.includes("استدعاء الممرضات") && i18nSrc.includes("كيوسك") && i18nSrc.includes("أجهزة الخدمات الذاتية"));
ok("kept english variants", i18nSrc.includes("queue management system Egypt") && i18nSrc.includes("nurse call system Egypt") && i18nSrc.includes("self service kiosk Egypt"));
ok("no Q-Lite names", !/Q-Lite|Q-Plus|Q-Premium/i.test(publicCopy));
ok("no New Cairo on public pages", !/New Cairo|القاهرة الجديدة/.test(`${i18nSrc}\n${homeSrc}\n${aboutSrc}\n${arHomeSrc}`));
ok("organization json كيوسيرف", arLayoutSrc.includes('name: "كيوسيرف"') && arLayoutSrc.includes("https://www.qserveai.com"));
ok("whatsapp quote cta", quoteSrc.includes("#سعر") && homeSrc.includes("QuoteWaButton") && headerSrc.includes("QuoteWaButton"));
ok("home copy drops no-prices line", !i18nSrc.includes("كل بند طلب عرض سعر على واتساب، بدون أسعار على الموقع") && !i18nSrc.includes("every line is a WhatsApp quote, no prices on the site."));
ok("home cta drops phone required", !/ctaBody: "[^"]*الهاتف مطلوب/.test(i18nSrc) && !/ctaBody: "[^"]*Phone is required/.test(i18nSrc));
ok("about h1 is عن كيوسيرف", i18nSrc.includes('aboutH1: "عن كيوسيرف"') && i18nSrc.includes('aboutH1: "About QServe"') && aboutSrc.includes("{t.aboutH1}"));
ok("admin hidden from public nav", !headerSrc.includes("/admin") && !footerSrc.includes("/admin"));
ok("admin noindex", pageMetaSrc.includes("index: false"));
ok("queue page has four pillars", contentSrc.includes("تذكرة · شاشة · شباك · تقرير") && enCopySrc.includes("Ticket · Display · Counter · Report") && productViewSrc.includes("queuePillars") && productViewSrc.includes("QuoteWaButton"));
const navSystems = ["queuing-system", "nurses-call-system", "self-service-kiosks", "smart-boards", "central-clocks", "digital-signage", "service-evaluation", "interactive-maps"];
ok("sitemap has all nav systems", navSystems.every((s) => seoFilesSrc.includes(`/${s}/`) && seoFilesSrc.includes(`/en/${s}/`)) && seoFilesSrc.includes("/privacy/") && seoFilesSrc.includes("/terms/") && !seoFilesSrc.includes("qserveai.com/admin"));
const robotsSrc = fs.readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
const sitemapSrc = seoFilesSrc;
ok("robots allows crawl and points sitemap at www", robotsSrc.includes("Allow: /") && robotsSrc.includes("Sitemap: https://www.qserveai.com/sitemap.xml") && !robotsSrc.toLowerCase().includes("yallastore") && !/^Disallow: \/?\s*$/m.test(robotsSrc));
ok("sitemap locs are www.qserveai.com", sitemapSrc.includes("https://www.qserveai.com${path}") && sitemapSrc.includes('"/en/"') && sitemapSrc.includes('DEMO_ORIGIN') === false && !sitemapSrc.toLowerCase().includes("yallastore") && !sitemapSrc.includes("pages.dev") && !sitemapSrc.includes("New Cairo"));
ok("pages functions serve sitemap and robots", fs.readFileSync(new URL("../public/_routes.json", import.meta.url), "utf8").includes('"/sitemap.xml"') && fs.readFileSync(new URL("../functions/_middleware.js", import.meta.url), "utf8").includes("SITEMAP_XML") && fs.readFileSync(new URL("../functions/_lib/seo-files.js", import.meta.url), "utf8").includes("https://www.qserveai.com/") && !fs.readFileSync(new URL("../functions/_lib/seo-files.js", import.meta.url), "utf8").toLowerCase().includes("yallastore"));
ok("gemini 2.5 flash-lite stream", aiSrc.includes("gemini-2.5-flash-lite") && aiSrc.includes("generateContentStream") && aiSrc.includes("text/event-stream"));
ok("no grok pin", !aiSrc.toLowerCase().includes("grok"));
ok("empty GoogleGenAI constructor", aiSrc.includes("new GoogleGenAI({})"));
ok("does not set provider keys", !/GEMINI_API_KEY\s*=/.test(aiSrc) && !/OPENAI_API_KEY\s*=/.test(aiSrc) && !aiSrc.includes("apiKey:"));

if (failed) {
  console.error(failed, "checks failed");
  process.exit(1);
}
console.log("all dialect checks passed");
