import type { Metadata } from "next";
import { CartRoute } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/cart", "السلة", "سلة QServe AI Egypt الحية");

export default function Page() {
  return <CartRoute />;
}
