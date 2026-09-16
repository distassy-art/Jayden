"use client";

import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function DemoBanner() {
  const locale = useLocale();
  return <div className="demo-banner">{ui[locale].demoBanner}</div>;
}
