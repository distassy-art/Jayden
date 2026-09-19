import type { Metadata } from "next";
import { InsightsView } from "@/components/views/InsightsView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "en",
  "/en/insights",
  "Custom software add-on",
  "Software that tracks your branch customers, stores them, and suggests how to earn more — tailored per client.",
);

export default function InsightsPage() {
  return <InsightsView />;
}
