"use client";

import Link from "next/link";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function NotFoundView() {
  const locale = useLocale();
  const t = ui[locale];
  return (
    <div className="mesh px-4 py-20 text-center">
      <h1 className="text-4xl font-black text-navy">{t.notFound}</h1>
      <div className="mt-8 flex justify-center gap-3">
        <Link href={localizedHref(locale, "/")} className="btn-go">
          {t.home}
        </Link>
        <Link href={localizedHref(locale, "/quote")} className="btn-ghost">
          {t.quote}
        </Link>
      </div>
    </div>
  );
}
