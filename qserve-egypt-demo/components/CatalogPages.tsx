"use client";

import { CatalogCard, FaqList } from "@/components/KbBits";
import { kbOnPage } from "@/lib/product-db";
import { useLocale } from "@/lib/use-locale";

export function MaintenanceView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const items = kbOnPage("/maintenance");
  return (
    <div className="mesh mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-black text-navy">{ar ? "عقود الصيانة بعد البيع" : "After-sale care contracts"}</h1>
      <p className="mt-3 max-w-2xl leading-8 text-navy/75">
        {ar
          ? "AMC-STD زيارتان وقائيتان، تذاكر في ساعات العمل، قطع بعرض سعر. ليس 24/7 — السبت–الخميس 9–6."
          : "AMC-STD: two preventive visits, business-hours tickets, parts on quote. Not 24/7 — Sat–Thu 9–6."}
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
