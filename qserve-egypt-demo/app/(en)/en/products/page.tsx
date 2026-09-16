import type { Metadata } from "next";
import { ProductsView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/products", "Products", "QServe AI Egypt catalog — screens, cables, care");

export default function Page() {
  return <ProductsView />;
}
