"use client";

import Link from "next/link";
import { useState } from "react";
import { dashboards, insightsCopy, sectors, type Sector } from "@/lib/insights-demo";
import { localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function InsightsView() {
  const locale = useLocale();
  const ar = locale === "ar";
  const t = insightsCopy[locale];
  const [sector, setSector] = useState<Sector>("bank");
  const d = dashboards[sector];
  const href = (p: string) => localizedHref(locale, p);

  return (
    <div className="mesh">
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="font-extrabold text-cyan">{t.kicker}</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black text-navy sm:text-5xl">{t.title}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-9 text-navy/75">{t.body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`${href("/quote")}?pack=plus&system=queuing-system`} className="btn-go">
            {t.plus}
          </Link>
          <Link href={`${href("/quote")}?pack=hardware&system=queuing-system`} className="btn-ghost">
            {t.hardware}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <p className="mb-3 text-sm font-extrabold text-cyan">{t.dashKicker}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {sectors.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSector(s.id)}
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${sector === s.id ? "bg-navy text-paper" : "border border-navy/15 bg-white"}`}
            >
              {ar ? s.ar : s.en}
            </button>
          ))}
        </div>
        <div className="glass rounded-3xl p-6">
          <h2 className="text-2xl font-black text-navy">{ar ? d.siteAr : d.siteEn}</h2>
          <p className="mt-2 text-sm text-navy/60">
            {(ar ? d.fieldsAr : d.fieldsEn).join(" · ")} — {ar ? "حقول هذا العميل فقط" : "fields for this client only"}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.kpis.map((k) => (
              <div key={k.ar} className="rounded-2xl border border-navy/10 bg-void p-4">
                <p className="text-xs font-bold text-cyan">{ar ? k.ar : k.en}</p>
                <p className="mt-1 text-3xl font-black">{k.value}</p>
                <p className="text-xs text-navy/55">{ar ? k.hintAr : k.hintEn}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            {d.bars.map((b) => (
              <div key={b.ar}>
                <div className="mb-1 flex justify-between text-sm font-bold">
                  <span>{ar ? b.ar : b.en}</span>
                  <span>{b.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-navy/10">
                  <div className="bar-fill" style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-8 text-lg font-black">{t.recs}</h3>
          <ul className="mt-3 space-y-2">
            {(ar ? d.recsAr : d.recsEn).map((r) => (
              <li key={r} className="rounded-2xl bg-void px-4 py-3 text-sm leading-7">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
