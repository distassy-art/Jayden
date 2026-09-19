import type { Metadata } from "next";
import { LegalView } from "@/components/views/LegalView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/terms", "الشروط والأحكام");

export default function TermsPage() {
  return <LegalView kind="terms" />;
}
