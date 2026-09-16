import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/about", "المصنع");

export default function AboutPage() {
  return <AboutView />;
}
