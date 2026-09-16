"use client";

import { QuoteForm } from "@/components/QuoteForm";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function QuoteView() {
  const t = ui[useLocale()];
  return (
    <div className="mesh min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-5xl font-black text-navy">{t.quotePageTitle}</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-navy/70">{t.quotePageBody}</p>
        <div className="glass mt-8 rounded-3xl p-6 sm:p-8">
          <QuoteForm />
        </div>
      </div>
    </div>
  );
}
