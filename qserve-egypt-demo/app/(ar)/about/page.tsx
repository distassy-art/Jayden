import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "ar",
  "/about",
  "عن كيوسيرف",
  "كيوسيرف على www.qserveai.com: نظام انتظار العملاء، شاشات انتظار، استدعاء الممرضات، وكيوسك.",
);

export default function AboutPage() {
  return <AboutView />;
}
