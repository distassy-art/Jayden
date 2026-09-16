"use client";

import Link from "next/link";
import { site, systems } from "@/lib/content";
import { enCopy } from "@/lib/en-copy";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { BrandLockup } from "./BrandLockup";

export function Footer() {
  const locale = useLocale();
  const t = ui[locale];
  const href = (p: string) => localizedHref(locale, p);
  const label = (slug: string, fallback: string) => (locale === "en" ? enCopy[slug]?.nav ?? fallback : fallback);
  return (
    <footer className="border-t border-navy/10 bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <BrandLockup size="footer" />
          <p className="text-sm leading-7 text-navy/70">{t.footerBlurb}</p>
        </div>
        <ul className="space-y-2 text-sm">
          {systems.slice(0, 6).map((p) => (
            <li key={p.slug}>
              <Link href={href(`/${p.slug}`)} className="hover:text-cyan">
                {label(p.slug, p.nav)}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="space-y-2 text-sm text-navy/70">
          <li>
            <a href={`tel:${site.phoneTel}`} dir="ltr">
              {site.phoneDisplay}
            </a>
          </li>
          <li>{site.email}</li>
          <li>{t.address}</li>
        </ul>
      </div>
      <p className="border-t border-navy/10 py-4 text-center text-xs text-navy/50">
        {t.footerLegal} · <Link href={href("/products")}>{t.products}</Link> ·{" "}
        <Link href={href("/cart")}>{locale === "en" ? "Cart" : "السلة"}</Link> ·{" "}
        <Link href={href("/admin")}>{locale === "en" ? "Staff / admin" : "موظفين"}</Link> ·{" "}
        <Link href={href("/privacy")}>{t.privacy}</Link> · <Link href={href("/terms")}>{t.terms}</Link>
      </p>
    </footer>
  );
}
