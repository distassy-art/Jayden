"use client";

import Link from "next/link";
import { site } from "@/lib/content";
import { localizedProduct } from "@/lib/en-copy";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { kbOnPage } from "@/lib/product-db";
import { CatalogCard, FaqList } from "./KbBits";
import { QuoteForm } from "./QuoteForm";
import type { Product } from "@/lib/content";

export function ProductView({ product }: { product: Product }) {
  const locale = useLocale();
  const t = ui[locale];
  const p = localizedProduct(product, locale);
  const href = (path: string) => localizedHref(locale, path);
  const related = kbOnPage(`/${product.slug}`);
  return (
    <article className="mesh">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
        <div className="rise">
          <p className="text-sm font-extrabold text-cyan">{p.kicker}</p>
          <h1 className="mt-2 text-4xl font-black leading-snug text-navy sm:text-5xl">{p.h1}</h1>
          <p className="mt-4 text-lg leading-8 text-navy/75">{p.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={href("/quote")} className="btn-go">
              {t.quote}
            </Link>
            <a href={site.whatsapp} className="btn-ghost">
              {t.whatsapp}
            </a>
            <a href={`tel:${site.phoneTel}`} dir="ltr" className="btn-ghost">
              {site.phoneDisplay}
            </a>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {t.chips.map((c) => (
              <span key={c} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan">
                {c}
              </span>
            ))}
          </div>
        </div>
        <img src={p.image} alt={p.imageAlt} className="h-80 w-full rounded-3xl object-cover glow-ring" />
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16">
        {p.paragraphs.map((para) => (
          <p key={para} className="max-w-3xl leading-8 text-navy/75">
            {para}
          </p>
        ))}
        {p.components.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {p.components.map((c) => (
              <div key={c.title} className="story-card glass rounded-3xl p-5">
                <h2 className="text-xl font-black text-navy">{c.title}</h2>
                <p className="mt-2 text-sm leading-7 text-navy/70">{c.text}</p>
              </div>
            ))}
          </div>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.bullets.map((b) => (
            <li key={b} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold">
              {b}
            </li>
          ))}
        </ul>
        {related.length > 0 && (
          <section>
            <h2 className="text-2xl font-black text-navy">{locale === "en" ? "Add from this page" : "أضف من هذه الصفحة"}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <CatalogCard key={item.sku} item={item} ar={locale === "ar"} />
              ))}
            </div>
            <FaqList item={related[0]} ar={locale === "ar"} />
          </section>
        )}
        <div className="glass grid gap-8 rounded-3xl p-6 lg:grid-cols-2 lg:p-10">
          <div>
            <h2 className="text-2xl font-black text-navy">{t.askThis}</h2>
            <p className="mt-2 text-sm text-navy/70">{t.notCart}</p>
          </div>
          <QuoteForm defaultSystem={product.slug} />
        </div>
      </div>
    </article>
  );
}
