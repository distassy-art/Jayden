import type { Metadata } from "next";
import { RepairView } from "@/components/views/RepairView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/repair", "Repair", "Qserve Egypt hardware repair request");

export default function RepairPage() {
  return <RepairView />;
}
