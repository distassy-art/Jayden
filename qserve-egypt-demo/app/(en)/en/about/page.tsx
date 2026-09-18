import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "en",
  "/en/about",
  "About QServe",
  "QServe on www.qserveai.com: queue management system Egypt, nurse call system Egypt, and self service kiosk Egypt.",
);

export default function AboutPage() {
  return <AboutView />;
}
