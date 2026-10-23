import type { Metadata } from "next";
import { MaintenanceView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/maintenance", "Care contracts", "AMC-STD and after-sale care — not 24/7");

export default function Page() {
  return <MaintenanceView />;
}
