import type { Metadata } from "next";
import { QuoteView } from "@/components/views/QuoteView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/quote", "Request a quote");

export default function QuotePage() {
  return <QuoteView />;
}
