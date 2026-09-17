"use client";

import { site } from "@/lib/content";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function AboutView() {
  const locale = useLocale();
  const t = ui[locale];
  return (
    <div className="mesh mx-auto max-w-3xl px-4 py-14">
      <p className="font-extrabold text-cyan">{t.aboutTitle}</p>
      <h1 className="mt-2 text-5xl font-black text-navy">
        {locale === "en" ? site.brandEn : site.brandAr}
        <span className="mt-2 block text-2xl text-cyan">{locale === "en" ? site.brandAr : site.brandEn}</span>
      </h1>
      <p className="mt-6 text-lg leading-9 text-navy/75">{t.aboutBody}</p>
      <p className="mt-8 text-sm text-navy/60">{t.address}</p>
    </div>
  );
}
