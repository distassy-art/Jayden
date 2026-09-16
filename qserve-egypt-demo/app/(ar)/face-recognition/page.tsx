import type { Metadata } from "next";
import { FaceView } from "@/components/CatalogPages";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/face-recognition", "تعرف الوجه", "تعرف الوجه كخط مستقل مع تنبيه قانون حماية البيانات");

export default function Page() {
  return <FaceView />;
}
