import type { Metadata } from "next";
import { MaintenanceView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/maintenance", "عقود الصيانة", "AMC-STD وعقود ما بعد البيع — ليس 24/7");

export default function Page() {
  return <MaintenanceView />;
}
