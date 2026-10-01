"use client";

import Link from "next/link";
import { useState } from "react";
import { QuoteWaButton } from "@/components/QuoteWaButton";
import { systems } from "@/lib/content";
import { localizedProduct } from "@/lib/en-copy";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function ProductStories() {
  const locale = useLocale();
  const t = ui[locale];
  const href = (p: string) => localizedHref(locale, p);
  const [active, setActive] = useState(systems[0].slug);
  const raw = systems.find((s) => s.slug === active) ?? systems[0];
  const current = localizedProduct(raw, locale);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-extrabold text-cyan">{t.systems}</p>
          <h2 className="mt-1 text-3xl font-black text-navy sm:text-4xl">{t.systems}</h2>
        </div>
        <QuoteWaButton>{t.quote}</QuoteWaButton>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
        {systems.map((p) => {
          const loc = localizedProduct(p, locale);
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setActive(p.slug)}
              className={`story-card relative h-52 w-64 shrink-0 snap-start overflow-hidden rounded-3xl border ${
                active === p.slug ? "border-cyan glow-ring" : "border-navy/10"
              }`}
            >
              <img src={p.cardImage || p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 font-extrabold">{loc.nav}</span>
            </button>
          );
        })}
      </div>
      <div className="glass mt-6 grid items-center gap-8 rounded-3xl p-6 lg:grid-cols-2">
        <img src={current.cardImage || current.image} alt={current.imageAlt} className="h-64 w-full rounded-2xl object-cover" />
        <div>
          <p className="text-xs font-bold tracking-widest text-cyan">{current.kicker}</p>
          <h3 className="mt-2 text-3xl font-black text-navy">{current.h1}</h3>
          <p className="mt-3 leading-8 text-navy/75">{current.summary}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {current.bullets.slice(0, 3).map((b) => (
              <li key={b} className="rounded-xl bg-void px-3 py-2">
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={href(`/${current.slug}`)} className="btn-go">
              {t.openSystem}
            </Link>
            <QuoteWaButton className="btn-ghost" product={current.h1}>
              {t.askQuote}
            </QuoteWaButton>
          </div>
        </div>
      </div>
    </section>
  );
}
