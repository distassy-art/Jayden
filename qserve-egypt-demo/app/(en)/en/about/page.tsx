import type { Metadata } from "next";
import { AboutView } from "@/components/views/AboutView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/about", "About QServe AI");

export default function AboutPage() {
  return <AboutView />;
}
