"use client";

import { LiveQueue } from "@/components/LiveQueue";
import { QuoteWaButton } from "@/components/QuoteWaButton";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function HomePage() {
  const locale = useLocale();
  const t = ui[locale];
  return (
    <div className="mesh overflow-hidden">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:py-16">
        <div className="rise">
          <h1 className="text-4xl font-black leading-[1.2] text-navy sm:text-6xl">
            {t.heroTitle}
            <span className="mt-2 block text-cyan">{t.heroAccent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-navy/75">{t.heroBody}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <QuoteWaButton>{t.quoteNow}</QuoteWaButton>
            <a href={localizedHref(locale, "/products")} className="btn-ghost">
              {t.products}
            </a>
          </div>
        </div>
        <LiveQueue />
      </section>

      <div className="overflow-hidden border-y border-navy/10 bg-white/70 py-3">
        <div className="marquee-track gap-10 text-sm font-extrabold text-cyan/80">
          {[...t.ticker, ...t.ticker, ...t.ticker].map((item, i) => (
            <span key={`${item}-${i}`}>✦ {item}</span>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="glass rounded-3xl p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black text-navy sm:text-4xl">{t.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-navy/70">{t.ctaBody}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <QuoteWaButton>{t.startQuote}</QuoteWaButton>
            <a href={localizedHref(locale, "/insights")} className="btn-ghost">
              {t.software}
            </a>
            <a href={localizedHref(locale, "/projects")} className="btn-ghost">
              {t.seeInstalls}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
