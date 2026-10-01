import type { Metadata } from "next";
import { LegalView } from "@/components/views/LegalView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/terms", "Terms");

export default function TermsPage() {
  return <LegalView kind="terms" />;
}
