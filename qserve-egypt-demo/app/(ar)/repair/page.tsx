import type { Metadata } from "next";
import { RepairView } from "@/components/views/RepairView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/repair", "صيانة", "طلب صيانة أجهزة كيوسيرف مصر");

export default function RepairPage() {
  return <RepairView />;
}
