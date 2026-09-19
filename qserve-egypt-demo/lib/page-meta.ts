import type { Metadata } from "next";
import { productBySlug, products } from "./content";
import { localizedProduct } from "./en-copy";
import { hreflang, type Locale } from "./i18n";

export function pageMeta(locale: Locale, path: string, title: string, description?: string): Metadata {
  const admin = path === "/admin" || path === "/en/admin";
  return {
    title,
    description,
    robots: admin ? { index: false, follow: false } : { index: true, follow: true },
    alternates: hreflang(path),
  };
}

export function productStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export function productMetadata(slug: string, locale: Locale): Metadata {
  const product = productBySlug[slug];
  if (!product) return {};
  const p = localizedProduct(product, locale);
  return {
    title: { absolute: locale === "en" ? `${p.title} | QServe` : `${p.title}` },
    description: p.meta,
    robots: { index: true, follow: true },
    alternates: hreflang(locale === "en" ? `/en/${slug}` : `/${slug}`),
    openGraph: {
      title: p.title,
      description: p.meta,
      locale: locale === "en" ? "en_US" : "ar_EG",
    },
  };
}
