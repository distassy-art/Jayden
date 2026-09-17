import type { Metadata } from "next";
import { HomePage } from "@/components/HomePage";
import { pageMeta } from "@/lib/page-meta";

const TITLE = "كيوسيرف | نظام انتظار العملاء في مصر";
const DESC =
  "كيوسيرف على www.qserveai.com: كيوسك وتذكرة وشاشات انتظار للبنوك والمستشفيات والجهات. اطلب عرض سعر على واتساب.";

export const metadata: Metadata = {
  ...pageMeta("ar", "/", TITLE, DESC),
  title: { absolute: TITLE },
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    locale: "ar_EG",
    url: "https://www.qserveai.com/",
    siteName: "كيوسيرف",
  },
};

export default function Page() {
  return <HomePage />;
}
