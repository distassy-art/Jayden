"use client";

import { LiveQueue } from "@/components/LiveQueue";
import { QuoteWaButton } from "@/components/QuoteWaButton";
import { site, systems } from "@/lib/content";
import { localizedProduct } from "@/lib/en-copy";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function HomePage() {
  const locale = useLocale();
  const t = ui[locale];
  const href = (p: string) => localizedHref(locale, p);
  const tiles = [
    ...systems.map((raw) => {
      const p = localizedProduct(raw, locale);
      return {
        slug: p.slug,
        nav: p.nav,
        kicker: p.kicker,
        summary: p.summary,
        image: p.image,
        imageAlt: p.imageAlt,
        h1: p.h1,
      };
    }),
    {
      slug: "software",
      nav: t.softwareAddOn,
      kicker: t.software,
      summary: t.softwareTileBody,
      image: "/photos/csat.webp",
      imageAlt: t.softwareAddOn,
      h1: t.softwareAddOn,
    },
  ];

  return (
    <div className="mesh">
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-sm font-extrabold tracking-[0.22em] text-cyan">{t.heroKicker}</p>
          <h1 className="mt-3 text-4xl font-black leading-[1.15] text-navy sm:text-6xl">
            {t.heroTitle}
            <span className="mt-2 block text-cyan">{t.heroAccent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-navy/75">{t.heroBody}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <QuoteWaButton>{t.quoteNow}</QuoteWaButton>
            <a href={href("/contact")} className="btn-ghost">
              {t.contact}
            </a>
          </div>
          <p className="mt-4 text-sm font-bold text-navy/55" dir="ltr">
            WhatsApp {site.phoneDisplay}
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <LiveQueue />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-extrabold text-cyan">{t.systems}</p>
          <h2 className="mt-1 text-3xl font-black text-navy sm:text-4xl">{t.systemsTitle}</h2>
          <p className="mt-2 leading-7 text-navy/70">{t.systemsBody}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((p) => (
            <article key={p.slug} className="glass flex flex-col overflow-hidden rounded-3xl">
              <img src={p.image} alt={p.imageAlt} className="h-44 w-full object-cover" />
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-bold tracking-widest text-cyan">{p.kicker}</p>
                <h3 className="mt-1 text-xl font-black text-navy">{p.nav}</h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-navy/70">{p.summary}</p>
                <div className="mt-4">
                  <QuoteWaButton className="btn-go !px-4 !py-2 text-sm" product={p.h1}>
                    {t.askQuote}
                  </QuoteWaButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="glass rounded-3xl p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black text-navy sm:text-4xl">{t.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-navy/70">{t.ctaBody}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <QuoteWaButton>{t.startQuote}</QuoteWaButton>
            <a href="https://wa.me/201227993999" className="btn-ghost" dir="ltr">
              {site.phoneDisplay}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
