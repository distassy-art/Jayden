import type { Metadata } from "next";
import { CartRoute } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/cart", "Cart", "QServe AI Egypt live cart");

export default function Page() {
  return <CartRoute />;
}
