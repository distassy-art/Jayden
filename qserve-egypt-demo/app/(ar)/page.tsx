import type { Metadata } from "next";
import { HomePage } from "@/components/HomePage";
import { site } from "@/lib/content";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = {
  ...pageMeta("ar", "/", `عرض تجريبي | ${site.brandAr} ${site.brandEn}`, `عرض تجريبي — ${site.brandAr} لأنظمة الانتظار واستدعاء الممرضات.`),
  title: { absolute: `عرض تجريبي | ${site.brandAr} ${site.brandEn}` },
};

export default function Page() {
  return <HomePage />;
}
