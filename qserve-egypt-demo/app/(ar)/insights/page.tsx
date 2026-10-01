import type { Metadata } from "next";
import { InsightsView } from "@/components/views/InsightsView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta(
  "ar",
  "/insights",
  "إضافة برمجية مخصّصة",
  "برنامج يتتبع عملاء فرعك ويبني قاعدة بيانات ويقترح كيف تربح أكثر — إضافة لكل عميل.",
);

export default function InsightsPage() {
  return <InsightsView />;
}
