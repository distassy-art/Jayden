"use client";

import { usePathname } from "next/navigation";
import { isEnPath, stripLocale, type Locale } from "@/lib/i18n";

export function useLocale(): Locale {
  const pathname = usePathname() || "/";
  return isEnPath(pathname) ? "en" : "ar";
}

export function useBarePath() {
  const pathname = usePathname() || "/";
  return stripLocale(pathname);
}
