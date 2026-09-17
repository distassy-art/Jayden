import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "en",
  "/en/about",
  "About QServe AI",
  "QServe AI quotes queue, nurse-call, and kiosk systems for Egypt and the Middle East on WhatsApp.",
);

export default function AboutPage() {
  return <AboutView />;
}
