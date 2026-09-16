import type { Metadata } from "next";
import { LegalView } from "@/components/views/LegalView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/privacy", "Privacy policy");

export default function PrivacyPage() {
  return <LegalView kind="privacy" />;
}
