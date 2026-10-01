"use client";

import { QuoteWaButton } from "@/components/QuoteWaButton";
import type { KbItem } from "@/lib/product-db";
import { thumbFor } from "@/lib/product-db";

export function FaqList({ item, ar }: { item: KbItem; ar: boolean }) {
  if (!item.faq?.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {item.faq.map((f) => (
        <details key={f.qEn} className="rounded-2xl border border-navy/10 bg-white px-4 py-3">
          <summary className="cursor-pointer font-extrabold text-navy">{ar ? f.qAr : f.qEn}</summary>
          <p className="mt-2 text-sm leading-7 text-navy/75">{ar ? f.aAr : f.aEn}</p>
        </details>
      ))}
    </div>
  );
}

export function CatalogCard({ item, ar }: { item: KbItem; ar: boolean }) {
  return (
    <article className="glass flex flex-col rounded-3xl p-4" data-sku={item.sku}>
      <img src={thumbFor(item.sku, item.category)} alt="" className="h-36 w-full rounded-2xl object-cover" />
      <h3 className="mt-3 text-lg font-black text-navy">{ar ? item.nameAr : item.nameEn}</h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-navy/70">{ar ? item.descAr : item.descEn}</p>
      <QuoteWaButton className="btn-go mt-3 w-full !py-2 text-sm" product={ar ? item.nameAr : item.nameEn}>
        {ar ? "طلب عرض سعر" : "Request a quote"}
      </QuoteWaButton>
    </article>
  );
}

export function FxNote({ ar }: { ar: boolean }) {
  return (
    <p className="mt-2 text-[12px] font-bold text-navy/70">
      {ar ? "كل البنود طلب عرض سعر — مفيش رقم على الموقع." : "Every line is a quote request — no prices on the site."}
    </p>
  );
}
