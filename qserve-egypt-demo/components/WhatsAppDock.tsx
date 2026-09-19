"use client";

import { QuoteWaButton } from "@/components/QuoteWaButton";
import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function WhatsAppDock() {
  const locale = useLocale();
  return (
    <QuoteWaButton className="wa-dock">{ui[locale].whatsapp}</QuoteWaButton>
  );
}
