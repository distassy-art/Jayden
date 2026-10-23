import type { Metadata } from "next";
import { LegalView } from "@/components/views/LegalView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/privacy", "سياسة الخصوصية");

export default function PrivacyPage() {
  return <LegalView kind="privacy" />;
}
