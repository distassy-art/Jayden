import type { Metadata } from "next";
import { FaceView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/face-recognition", "Face recognition", "Face recognition as a separate PDPL-sensitive line");

export default function Page() {
  return <FaceView />;
}
