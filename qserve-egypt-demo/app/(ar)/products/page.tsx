import type { Metadata } from "next";
import { ProductsView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/products", "المنتجات", "كتالوج QServe AI Egypt — شاشات وكابلات وصيانة");

export default function Page() {
  return <ProductsView />;
}
