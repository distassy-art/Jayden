import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "ar",
  "/about",
  "عن كيوسيرف | QServe AI",
  "كيوسيرف لأنظمة انتظار العملاء واستدعاء الممرضات والكيوسك. عرض سعر لمصر والشرق الأوسط على واتساب.",
);

export default function AboutPage() {
  return <AboutView />;
}
