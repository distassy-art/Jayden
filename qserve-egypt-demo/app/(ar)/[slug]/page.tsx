import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/ProductView";
import { productBySlug } from "@/lib/content";
import { productMetadata, productStaticParams } from "@/lib/page-meta";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return productStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return productMetadata(slug, "ar");
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = productBySlug[slug];
  if (!product) notFound();
  return <ProductView product={product} />;
}
