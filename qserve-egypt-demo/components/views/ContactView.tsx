"use client";

import { QuoteForm } from "@/components/QuoteForm";
import { site } from "@/lib/content";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function ContactView() {
  const locale = useLocale();
  const t = ui[locale];
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&z=15&output=embed`;
  return (
    <div className="mesh">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h1 className="text-4xl font-black text-navy">{t.contactTitle}</h1>
          <p className="mt-3 text-navy/70">{t.contactBody}</p>
          <div className="mt-6">
            <QuoteForm />
          </div>
        </div>
        <div className="space-y-4">
          <div className="glass rounded-3xl p-6">
            <p className="font-bold" dir="ltr">
              {site.phoneDisplay}
            </p>
            <p className="mt-2">{site.email}</p>
            <p className="mt-2 text-sm text-navy/70">{t.address}</p>
            <p className="mt-2 text-sm text-cyan">{t.hours}</p>
            <p className="text-sm text-navy/60">{t.hoursOff}</p>
          </div>
          <iframe title="Qserve Egypt factory" src={mapSrc} className="h-72 w-full rounded-3xl border-0" loading="lazy" />
        </div>
      </div>
    </div>
  );
}
