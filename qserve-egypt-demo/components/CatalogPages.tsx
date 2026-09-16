"use client";

import Link from "next/link";
import { CartPageView } from "@/components/CartDrawer";
import { CatalogCard, FaqList, FxNote } from "@/components/KbBits";
import { addLine } from "@/lib/cart";
import { kbBySku, kbOnPage, kbPublic, thumbFor, type KbItem } from "@/lib/product-db";
import { localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

const GROUPS: { id: string; ar: string; en: string }[] = [
  { id: "consumable", ar: "مستهلكات", en: "Consumables" },
  { id: "spare", ar: "قطع غيار", en: "Spares" },
  { id: "screen", ar: "شاشات", en: "Screens" },
  { id: "cable", ar: "كابلات وتمديدات", en: "Cables & wiring" },
  { id: "network", ar: "واي فاي وشبكة", en: "Wi-Fi & network" },
  { id: "face-recognition", ar: "تعرف الوجه", en: "Face recognition" },
  { id: "repair", ar: "صيانة وعقود", en: "Care contracts" },
  { id: "system", ar: "أنظمة (عرض سعر)", en: "Systems (quote)" },
  { id: "software", ar: "بصيرة", en: "Basira" },
];

function groupOf(item: KbItem) {
  if (item.sku.startsWith("LCD") || item.sku.startsWith("LED")) return "screen";
  if (item.sku.startsWith("CAB")) return "cable";
  if (item.sku.startsWith("WIFI")) return "network";
  return item.category;
}

export function ProductsView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const items = kbPublic();
  const href = (p: string) => localizedHref(locale, p);
  return (
    <div className="mesh mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "كتالوج Q AI" : "Q AI catalog"}</h1>
      <p className="mt-2 max-w-2xl text-navy/70">
        {ar
          ? "شاشات، كابلات، واي فاي، قطع، وعقود صيانة. السعر الظاهر 2× للتوريد. الأنظمة بند عرض سعر. الروبوت يضيف للسلة قدامك."
          : "Screens, cables, Wi-Fi, spares and care contracts. Listed price is 2× supply. Systems are quote lines. The robot fills the cart in front of you."}
      </p>
      <FxNote ar={ar} />
      {GROUPS.map((g) => {
        const rows = items.filter((i) => groupOf(i) === g.id);
        if (!rows.length) return null;
        return (
          <section key={g.id} className="mt-10">
            <h2 className="text-2xl font-black text-navy">{ar ? g.ar : g.en}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((item) => (
                <div key={item.sku}>
                  <CatalogCard item={item} ar={ar} />
                  <Link href={href(`/products/${item.sku}`)} className="mt-2 block text-center text-xs font-bold text-gold">
                    {ar ? "صفحة المنتج والأسئلة" : "Product + FAQ"}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function SkuView({ sku }: { sku: string }) {
  const locale = useLocale();
  const ar = locale === "ar";
  const item = kbBySku(sku);
  const href = (p: string) => localizedHref(locale, p);
  if (!item) {
    return (
      <div className="mesh px-4 py-16 text-center">
        <p className="font-black">{ar ? "الصنف غير موجود" : "SKU not found"}</p>
        <Link href={href("/products")} className="btn-go mt-4 inline-flex">
          {ar ? "الكتالوج" : "Catalog"}
        </Link>
      </div>
    );
  }
  const quote = item.priceRule !== "catalog-2x" || item.sellUsd == null;
  return (
    <article className="mesh mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-2">
      <img src={thumbFor(item.sku, item.category)} alt="" className="h-80 w-full rounded-3xl object-cover glow-ring" />
      <div>
        <p className="font-mono text-xs text-gold">{item.sku}</p>
        <h1 className="mt-1 text-4xl font-black text-navy">{ar ? item.nameAr : item.nameEn}</h1>
        <p className="mt-3 leading-8 text-navy/75">{ar ? item.descAr : item.descEn}</p>
        <p className="mt-4 text-lg font-black">{quote ? (ar ? "يُسعَّر في العرض" : "Priced on quote") : `USD ${Number(item.sellUsd).toFixed(2)}`}</p>
        <FxNote ar={ar} />
        <button type="button" className="btn-go mt-5" onClick={() => addLine(item.sku, 1)}>
          {ar ? "أضف للسلة" : "Add to cart"}
        </button>
        <FaqList item={item} ar={ar} />
        <Link href={href("/products")} className="mt-6 inline-block text-sm font-bold text-gold">
          {ar ? "كل الكتالوج" : "Full catalog"}
        </Link>
      </div>
    </article>
  );
}

export function MaintenanceView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const items = kbOnPage("/maintenance");
  return (
    <div className="mesh mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "عقود الصيانة بعد البيع" : "After-sale care contracts"}</h1>
      <p className="mt-3 max-w-2xl leading-8 text-navy/75">
        {ar
          ? "AMC-STD زيارتان وقائيتان، تذاكر في ساعات العمل، قطع −10٪. ليس 24/7 — السبت–الخميس 9–6. إن تعطل الجهاز نضيف العقد للسلة كبند عرض سعر."
          : "AMC-STD: two preventive visits, business-hours tickets, parts −10%. Not 24/7 — Sat–Thu 9–6. If a device is down we add the contract to the cart as a quote line."}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CatalogCard key={item.sku} item={item} ar={ar} />
        ))}
      </div>
      {items[0] && <FaqList item={items[0]} ar={ar} />}
    </div>
  );
}

export function FaceView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const items = kbOnPage("/face-recognition");
  return (
    <div className="mesh mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "تعرف الوجه" : "Face recognition"}</h1>
      <p className="mt-3 max-w-2xl leading-8 text-navy/75">
        {ar
          ? "خط مستقل عن نظام الانتظار. يلزم غرض مكتوب وموافقة وفق قانون حماية البيانات الشخصية. البوابة والجهاز الجداري وكيوسك الزيارات بنود منفصلة."
          : "A separate line from queue systems. Written purpose and PDPL consent required. Gate, wall terminal and visitor-kiosk camera are separate SKUs."}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CatalogCard key={item.sku} item={item} ar={ar} />
        ))}
      </div>
      {items[0] && <FaqList item={items[0]} ar={ar} />}
    </div>
  );
}

export function CartRoute() {
  return <CartPageView />;
}
