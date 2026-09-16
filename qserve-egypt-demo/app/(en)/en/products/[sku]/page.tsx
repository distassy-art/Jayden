import type { Metadata } from "next";
import { SkuView } from "@/components/CatalogPages";
import { kbBySku, skuStaticParams } from "@/lib/product-db";
import { pageMeta } from "@/lib/page-meta";

type Props = { params: Promise<{ sku: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return skuStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sku } = await params;
  const item = kbBySku(sku);
  return pageMeta("en", `/en/products/${sku}`, item?.nameEn || sku, item?.descEn);
}

export default async function Page({ params }: Props) {
  const { sku } = await params;
  return <SkuView sku={sku} />;
}
