import type { Metadata } from "next";
import { HomePage } from "@/components/HomePage";
import { site } from "@/lib/content";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = {
  ...pageMeta(
    "en",
    "/en",
    `Demo | ${site.brandEn}`,
    `Interactive demo — ${site.brandEn} queue and nurse-call systems.`,
  ),
  title: { absolute: `Demo | ${site.brandEn}` },
};

export default function Page() {
  return <HomePage />;
}
