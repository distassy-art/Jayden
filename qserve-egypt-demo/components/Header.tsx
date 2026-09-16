"use client";

import Link from "next/link";
import { useState } from "react";
import { site, systems } from "@/lib/content";
import { enCopy } from "@/lib/en-copy";
import { ui, localizedHref } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { BrandLockup } from "./BrandLockup";
import { CartButton } from "./CartDrawer";
import { CurrencySwitch } from "./CurrencySwitch";
import { LangSwitch } from "./LangSwitch";

export function Header() {
  const locale = useLocale();
  const t = ui[locale];
  const href = (p: string) => localizedHref(locale, p);
  const [open, setOpen] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const label = (slug: string, fallback: string) => (locale === "en" ? enCopy[slug]?.nav ?? fallback : fallback);

  return (
    <header className="border-b border-navy/10 bg-paper/95 backdrop-blur">
      <CurrencySwitch />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <Link href={href("/")} className="shrink-0" aria-label={`${site.brandEn} ${site.brandAr}`}>
          <BrandLockup />
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-bold lg:flex">
          <Link href={href("/")} className="hover:text-cyan">
            {t.home}
          </Link>
          <div className="group relative">
            <button type="button" className="hover:text-cyan">
              {t.systems}
            </button>
            <div className="invisible absolute start-0 top-full z-20 min-w-64 rounded-2xl border border-navy/10 bg-white py-2 opacity-0 shadow-xl group-hover:visible group-hover:opacity-100">
              {systems.map((p) => (
                <Link key={p.slug} href={href(`/${p.slug}`)} className="block px-4 py-2 hover:bg-void hover:text-cyan">
                  {label(p.slug, p.nav)}
                </Link>
              ))}
            </div>
          </div>
          <Link href={href("/products")} className="hover:text-cyan">
            {t.products}
          </Link>
          <Link href={href("/cart")} className="hover:text-cyan">
            {locale === "en" ? "Cart page" : "صفحة السلة"}
          </Link>
          <Link href={href("/maintenance")} className="hover:text-cyan">
            {locale === "en" ? "Care" : "صيانة"}
          </Link>
          <Link href={href("/insights")} className="hover:text-cyan">
            {t.software}
          </Link>
          <Link href={href("/projects")} className="hover:text-cyan">
            {t.projects}
          </Link>
          <Link href={href("/about")} className="hover:text-cyan">
            {t.factory}
          </Link>
          <Link href={href("/contact")} className="hover:text-cyan">
            {t.contact}
          </Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <CartButton />
          <LangSwitch />
          <span className="hidden sm:inline">
            <Link href={href("/quote")} className="btn-go py-2 text-sm">
              {t.quote}
            </Link>
          </span>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-navy/20 lg:hidden"
            aria-label="menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "×" : "☰"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-navy/10 bg-paper px-4 py-3 lg:hidden">
          <Link href={href("/")} className="block py-2" onClick={() => setOpen(false)}>
            {t.home}
          </Link>
          <button type="button" className="block w-full py-2 text-start" onClick={() => setSystemsOpen((v) => !v)}>
            {t.systems}
          </button>
          {systemsOpen &&
            systems.map((p) => (
              <Link key={p.slug} href={href(`/${p.slug}`)} className="block py-1 ps-4 text-sm text-cyan" onClick={() => setOpen(false)}>
                {label(p.slug, p.nav)}
              </Link>
            ))}
          <Link href={href("/products")} className="block py-2" onClick={() => setOpen(false)}>
            {t.products}
          </Link>
          <Link href={href("/cart")} className="block py-2" onClick={() => setOpen(false)}>
            {locale === "en" ? "Cart page" : "صفحة السلة"}
          </Link>
          <Link href={href("/maintenance")} className="block py-2" onClick={() => setOpen(false)}>
            {locale === "en" ? "Care" : "صيانة"}
          </Link>
          <Link href={href("/insights")} className="block py-2" onClick={() => setOpen(false)}>
            {t.software}
          </Link>
          <Link href={href("/projects")} className="block py-2" onClick={() => setOpen(false)}>
            {t.projects}
          </Link>
          <Link href={href("/about")} className="block py-2" onClick={() => setOpen(false)}>
            {t.factory}
          </Link>
          <Link href={href("/contact")} className="block py-2" onClick={() => setOpen(false)}>
            {t.contact}
          </Link>
          <Link href={href("/quote")} className="btn-go mt-3 block text-center" onClick={() => setOpen(false)}>
            {t.quote}
          </Link>
        </div>
      )}
    </header>
  );
}
