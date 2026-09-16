"use client";

import { addLine } from "@/lib/cart";
import { moneyPair, USD_TO_EGP } from "@/lib/cart";
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
  const quote = item.priceRule !== "catalog-2x" || item.sellUsd == null;
  const pair = !quote && item.sellUsd != null ? moneyPair(item.sellUsd, ar) : null;
  return (
    <article className="story-card glass flex flex-col rounded-3xl p-4">
      <img src={thumbFor(item.sku, item.category)} alt="" className="h-36 w-full rounded-2xl object-cover" />
      <p className="mt-3 font-mono text-[10px] text-navy/50">{item.sku}</p>
      <h3 className="text-lg font-black text-navy">{ar ? item.nameAr : item.nameEn}</h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-navy/70">{ar ? item.descAr : item.descEn}</p>
      <p className="mt-2 text-sm font-extrabold">
        {quote ? (ar ? "طلب عرض سعر" : "Quote line") : (
          <>
            <span dir="ltr">{pair?.usdLabel}</span>
            <span className="ms-2 text-xs text-navy/55">{pair?.egpLabel}</span>
          </>
        )}
      </p>
      <button type="button" className="btn-go mt-3 w-full !py-2 text-sm" onClick={() => addLine(item.sku, 1)}>
        {ar ? "أضف للسلة" : "Add to cart"}
      </button>
    </article>
  );
}

export function FxNote({ ar }: { ar: boolean }) {
  return (
    <p className="text-[11px] text-navy/50">
      {ar ? `تقدير تجريبي ${USD_TO_EGP} ج.م/دولار — الفاتورة يوم التحصيل.` : `Demo FX ${USD_TO_EGP} EGP/USD — invoice rate on collection day.`}
    </p>
  );
}
