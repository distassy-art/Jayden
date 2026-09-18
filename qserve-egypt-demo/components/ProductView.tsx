"use client";

import { site } from "@/lib/content";
import { localizedProduct } from "@/lib/en-copy";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { QuoteWaButton } from "./QuoteWaButton";
import { QuoteForm } from "./QuoteForm";
import type { Product } from "@/lib/content";

export function ProductView({ product }: { product: Product }) {
  const locale = useLocale();
  const t = ui[locale];
  const p = localizedProduct(product, locale);

  if (product.slug === "queuing-system") {
    return (
      <article className="mesh">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
          <p className="text-sm font-extrabold tracking-[0.18em] text-cyan">{p.kicker}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-[1.2] text-navy sm:text-5xl">{p.h1}</h1>
          <p className="mt-3 text-lg text-navy/70">{p.summary}</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {t.queuePillars.map((label) => (
              <div key={label} className="glass rounded-2xl px-4 py-5 text-center">
                <p className="text-xl font-black text-navy">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <QuoteWaButton product={p.h1}>{t.quote}</QuoteWaButton>
            <a href={`tel:${site.phoneTel}`} dir="ltr" className="btn-ghost">
              {site.phoneDisplay}
            </a>
          </div>
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-2">
            <img
              src={p.image}
              alt={p.imageAlt}
              className="w-full rounded-3xl bg-white object-contain shadow-[0_8px_28px_rgba(11,27,51,0.08)]"
            />
            <ol className="space-y-3">
              {p.components.map((c, i) => (
                <li key={c.title} className="glass grid grid-cols-[40px_1fr] gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-black text-paper">
                    {i + 1}
                  </span>
                  <div>
                    <h2 className="text-base font-black leading-7 text-navy sm:text-lg">{c.title}</h2>
                    <p className="mt-1 text-sm leading-7 text-navy/70">{c.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="mesh">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
        <div className="rise">
          <p className="text-sm font-extrabold text-cyan">{p.kicker}</p>
          <h1 className="mt-2 text-4xl font-black leading-snug text-navy sm:text-5xl">{p.h1}</h1>
          <p className="mt-4 text-lg leading-8 text-navy/75">{p.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <QuoteWaButton product={p.h1}>{t.quote}</QuoteWaButton>
            <a href={`tel:${site.phoneTel}`} dir="ltr" className="btn-ghost">
              {site.phoneDisplay}
            </a>
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
