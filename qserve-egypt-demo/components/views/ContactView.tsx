"use client";

import { ContactForm } from "@/components/ContactForm";
import { QuoteWaButton } from "@/components/QuoteWaButton";
import { site } from "@/lib/content";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function ContactView() {
  const locale = useLocale();
  const t = ui[locale];
  const address = locale === "en" ? site.addressEn : site.addressAr;
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&z=16&output=embed`;
  return (
    <div className="mesh">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="text-4xl font-black text-navy">{t.contactTitle}</h1>
          <p className="mt-3 text-navy/70">{t.contactBody}</p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
        <div className="space-y-4">
          <div className="glass rounded-3xl p-6 sm:p-8">
            <p className="text-sm font-extrabold text-cyan">{t.phoneLabel}</p>
            <a href={`tel:${site.phoneTel}`} className="mt-1 block text-xl font-black text-navy" dir="ltr">
              {site.phoneDisplay}
            </a>
            <p className="mt-5 text-sm font-extrabold text-cyan">{t.emailLabel}</p>
            <a href={`mailto:${site.email}`} className="mt-1 block font-bold text-navy" dir="ltr">
              {site.email}
            </a>
            <p className="mt-5 text-sm font-extrabold text-cyan">{t.addressLabel}</p>
            <p className="mt-1 leading-7 text-navy/80">{address}</p>
            <p className="mt-6 text-sm font-extrabold text-cyan">{t.followUs}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <QuoteWaButton className="btn-go !px-4 !py-2 text-sm">{t.whatsapp}</QuoteWaButton>
              <a href={site.youtube} className="btn-ghost !px-4 !py-2 text-sm" target="_blank" rel="noreferrer">
                YouTube
              </a>
              <a href={site.facebook} className="btn-ghost !px-4 !py-2 text-sm" target="_blank" rel="noreferrer">
                Facebook
              </a>
            </div>
          </div>
          <iframe title={address} src={mapSrc} className="h-72 w-full rounded-3xl border-0" loading="lazy" />
        </div>
      </div>
    </div>
  );
}
