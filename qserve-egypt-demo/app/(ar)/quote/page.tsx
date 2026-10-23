import type { Metadata } from "next";
import { QuoteView } from "@/components/views/QuoteView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/quote", "طلب عرض سعر");

export default function QuotePage() {
  return <QuoteView />;
}
