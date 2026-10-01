"use client";

import Link from "next/link";
import { localizedHref, switchLocaleHref } from "@/lib/i18n";
import { useBarePath, useLocale } from "@/lib/use-locale";

export function LangSwitch() {
  const locale = useLocale();
  const path = useBarePath();
  const ar = localizedHref("ar", path);
  const en = localizedHref("en", path);
  return (
    <nav aria-label="Language" className="flex shrink-0 overflow-hidden rounded-full border border-navy/20 text-xs font-black">
      <Link href={ar} hrefLang="ar" className={`px-2.5 py-1 ${locale === "ar" ? "bg-teal text-paper" : "text-navy/55 hover:text-navy"}`}>
        AR
      </Link>
      <Link href={en} hrefLang="en" className={`px-2.5 py-1 ${locale === "en" ? "bg-teal text-paper" : "text-navy/55 hover:text-navy"}`}>
        EN
      </Link>
      <span className="sr-only">{switchLocaleHref(locale, path)}</span>
    </nav>
  );
}
