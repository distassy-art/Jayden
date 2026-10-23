"use client";

import { ui } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

export function LegalView({ kind }: { kind: "privacy" | "terms" }) {
  const t = ui[useLocale()];
  return (
    <div className="mesh mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-4xl font-black text-navy">{kind === "privacy" ? t.privacyTitle : t.termsTitle}</h1>
      <p className="mt-6 leading-8 text-navy/75">{kind === "privacy" ? t.privacyBody : t.termsBody}</p>
    </div>
  );
}
