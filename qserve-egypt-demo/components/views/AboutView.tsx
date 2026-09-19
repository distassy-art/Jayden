"use client";

import { QuoteWaButton } from "@/components/QuoteWaButton";
import { site } from "@/lib/content";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function AboutView() {
  const locale = useLocale();
  const t = ui[locale];
  const href = (p: string) => localizedHref(locale, p);
  const work = [
    { key: "queue", image: "/photos/queue-bank.webp", href: "/queuing-system", title: t.aboutQueueTitle, body: t.aboutQueueBody },
    { key: "nurse", image: "/photos/nurse-call.jpeg", href: "/nurse-call-system", title: t.aboutNurseTitle, body: t.aboutNurseBody },
    { key: "kiosk", image: "/photos/kiosk-bank.webp", href: "/self-service-kiosks", title: t.aboutKioskTitle, body: t.aboutKioskBody },
  ];

  return (
    <div className="mesh">
      <section className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
        <p className="text-sm font-extrabold tracking-[0.22em] text-cyan">{t.aboutKicker}</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black leading-[1.2] text-navy sm:text-5xl">{t.aboutH1}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-navy/75">{t.aboutLead}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <QuoteWaButton>{t.quote}</QuoteWaButton>
          <a href={`tel:${site.phoneTel}`} className="btn-ghost" dir="ltr">
            {site.phoneDisplay}
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-3xl font-black text-navy">{t.aboutWorkTitle}</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {work.map((item) => (
            <article key={item.key} className="glass flex flex-col overflow-hidden rounded-3xl">
              <img src={item.image} alt="" className="h-44 w-full object-cover" />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-xl font-black text-navy">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-navy/70">{item.body}</p>
                <div className="mt-4">
                  <QuoteWaButton className="btn-go !px-4 !py-2 text-sm" product={item.title}>
                    {t.askQuote}
                  </QuoteWaButton>
                </div>
                <a href={href(item.href)} className="mt-3 text-sm font-bold text-cyan">
                  {t.openSystem}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-3xl font-black text-navy">{t.aboutReachTitle}</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="glass rounded-3xl p-6">
            <h3 className="text-2xl font-black text-navy">{t.aboutEgyptTitle}</h3>
            <p className="mt-3 leading-8 text-navy/75">{t.aboutEgyptBody}</p>
          </article>
          <article className="glass rounded-3xl p-6">
            <h3 className="text-2xl font-black text-navy">{t.aboutMeTitle}</h3>
            <p className="mt-3 leading-8 text-navy/75">{t.aboutMeBody}</p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="glass grid gap-8 rounded-3xl p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <h2 className="text-3xl font-black text-navy">{t.aboutStepsTitle}</h2>
            <ol className="mt-5 space-y-3 text-navy/80">
              {t.aboutSteps.map((step, i) => (
                <li key={step} className="flex gap-3 leading-7">
                  <span className="font-black text-cyan">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm font-bold text-navy/60">
              {t.hours} · {t.hoursOff}
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-3xl bg-navy px-6 py-8 text-paper">
            <h2 className="text-2xl font-black">{t.aboutCtaTitle}</h2>
            <p className="mt-3 text-paper/80">{t.aboutCtaBody}</p>
            <div className="mt-6">
              <QuoteWaButton>{t.quoteNow}</QuoteWaButton>
            </div>
            <p className="mt-4 text-sm font-bold text-cyan" dir="ltr">
              WhatsApp {site.phoneDisplay}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
