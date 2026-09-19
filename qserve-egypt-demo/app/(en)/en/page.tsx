import type { Metadata } from "next";
import { HomePage } from "@/components/HomePage";
import { pageMeta } from "@/lib/page-meta";

const TITLE = "QServe | Queue management system Egypt";
const DESC =
  "QServe (QSERVE) in Egypt: queue management system Egypt, nurse call system Egypt, and self service kiosk Egypt.";

export const metadata: Metadata = {
  ...pageMeta("en", "/en", TITLE, DESC),
  title: { absolute: TITLE },
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    locale: "en_US",
    url: "https://www.qserveai.com/en",
    siteName: "QServe",
  },
};

export default function Page() {
  return <HomePage />;
}
