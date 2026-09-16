"use client";

import { site } from "@/lib/content";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function WhatsAppDock() {
  const locale = useLocale();
  return (
    <a className="wa-dock" href={site.whatsapp}>
      {ui[locale].whatsapp}
    </a>
  );
}
